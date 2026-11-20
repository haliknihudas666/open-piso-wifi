#!/bin/sh
# ==============================================================================
# OpenPisoWiFi - OpenWrt Wireless Intrusion Detection System (piso-wids)
# ==============================================================================
# Monitors OpenWrt AP interfaces for:
#   1. Deauth Storms: >= 3 stations disappearing within 5s OR >= 5 deauth/disassoc
#      events in hostapd/kernel logs within 5s.
#   2. Evil Twin APs: Periodic wireless scan for foreign BSSIDs broadcasting our
#      configured PisoWiFi SSIDs.
# Posts JSON alerts to http://${RPI_IP}:${DAEMON_PORT}/api/shield/wids-event
# with header 'X-Shield-Secret: ${SHIELD_SECRET}'.
# ==============================================================================

CONF_FILE="/etc/piso-wids.conf"
SEEN_FILE="/tmp/piso-wids.seen"
ET_CACHE_FILE="/tmp/piso-wids.eviltwin"

RPI_IP="192.168.1.240"
DAEMON_PORT="4000"
SHIELD_SECRET=""
SCAN_INTERVAL="45"
DEAUTH_COOLDOWN="30"
EVIL_TWIN_COOLDOWN="60"

if [ -f "$CONF_FILE" ]; then
    # shellcheck disable=SC1090
    . "$CONF_FILE"
fi

[ -z "$SCAN_INTERVAL" ] && SCAN_INTERVAL=45
[ -z "$DEAUTH_COOLDOWN" ] && DEAUTH_COOLDOWN=30
[ -z "$EVIL_TWIN_COOLDOWN" ] && EVIL_TWIN_COOLDOWN=60
[ -z "$DAEMON_PORT" ] && DAEMON_PORT=4000

json_escape() {
    printf '%s' "$1" | tr -d '\r\n' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

post_wids_event() {
    payload="$1"
    url="http://${RPI_IP}:${DAEMON_PORT}/api/shield/wids-event"

    if command -v curl >/dev/null 2>&1; then
        curl -sS -m 3 -X POST \
            -H "Content-Type: application/json" \
            -H "X-Shield-Secret: ${SHIELD_SECRET}" \
            -d "$payload" \
            "$url" >/dev/null 2>&1 && return 0
    fi

    if command -v nc >/dev/null 2>&1; then
        len=$(printf '%s' "$payload" | wc -c | tr -dc '0-9')
        printf 'POST /api/shield/wids-event HTTP/1.0\r\nHost: %s:%s\r\nContent-Type: application/json\r\nX-Shield-Secret: %s\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s' \
            "$RPI_IP" "$DAEMON_PORT" "$SHIELD_SECRET" "$len" "$payload" | nc -w 3 "$RPI_IP" "$DAEMON_PORT" >/dev/null 2>&1 || true
    fi
}

get_ap_ifaces() {
    if command -v iw >/dev/null 2>&1; then
        iw dev 2>/dev/null | awk '
            $1 == "Interface" { iface = $2 }
            $1 == "type" && $2 == "AP" && iface != "" { print iface; iface = "" }
        '
    fi
}

get_iface_band() {
    iface="$1"
    chan=$(iw dev "$iface" info 2>/dev/null | awk '/channel / {print $2; exit}')
    if [ -n "$chan" ] && [ "$chan" -ge 36 ] 2>/dev/null; then
        echo "5GHz"
    elif [ -n "$chan" ]; then
        echo "2.4GHz"
    elif echo "$iface" | grep -Eq 'phy1|radio1|wlan1|5g'; then
        echo "5GHz"
    else
        echo "2.4GHz"
    fi
}

count_stations_total() {
    total=0
    for iface in $(get_ap_ifaces); do
        c=0
        if command -v iw >/dev/null 2>&1; then
            c=$(iw dev "$iface" station dump 2>/dev/null | grep -c '^Station ' || true)
        elif command -v iwinfo >/dev/null 2>&1; then
            c=$(iwinfo "$iface" assoclist 2>/dev/null | grep -c 'dBm' || true)
        fi
        c=$(printf '%s' "$c" | tr -dc '0-9')
        [ -z "$c" ] && c=0
        total=$((total + c))
    done
    echo "$total"
}

read_deauth_logs() {
    if command -v logread >/dev/null 2>&1; then
        logread -l 60 2>/dev/null | grep -v 'piso-wids' | grep -iE 'deauth|disassoc' | tail -n 50 || true
    fi
}

scan_evil_twins() {
    now="$1"
    our_bssids=""
    our_ssids=""
    scan_2g=""
    scan_5g=""

    for iface in $(get_ap_ifaces); do
        info=$(iw dev "$iface" info 2>/dev/null || true)
        bssid=$(printf '%s\n' "$info" | awk '/addr / {print tolower($2); exit}')
        ssid=$(printf '%s\n' "$info" | sed -n 's/^[[:space:]]*ssid //p' | head -n 1)
        [ -n "$bssid" ] && our_bssids="${our_bssids} ${bssid} "
        if [ -n "$ssid" ]; then
            case "
$our_ssids
" in
                *"
$ssid
"*) ;;
                *) our_ssids="${our_ssids}${ssid}
" ;;
            esac
        fi

        band=$(get_iface_band "$iface")
        if [ "$band" = "5GHz" ] && [ -z "$scan_5g" ]; then
            scan_5g="$iface"
        elif [ "$band" = "2.4GHz" ] && [ -z "$scan_2g" ]; then
            scan_2g="$iface"
        fi
    done

    [ -z "$our_ssids" ] && return 0

    for scan_iface in $scan_2g $scan_5g; do
        [ -z "$scan_iface" ] && continue
        band=$(get_iface_band "$scan_iface")
        scan_out=$(iw dev "$scan_iface" scan ap-force 2>/dev/null || true)
        if [ -z "$scan_out" ] && command -v iwinfo >/dev/null 2>&1; then
            scan_out=$(iwinfo "$scan_iface" scan 2>/dev/null || true)
        fi
        [ -z "$scan_out" ] && continue

        # Parse iw scan / iwinfo scan blocks into "bssid|ssid" lines
        parsed=$(printf '%s\n' "$scan_out" | awk '
            /^BSS / {
                if (bssid != "" && ssid != "") print tolower(bssid) "|" ssid
                bssid = $2
                sub(/\(.*$/, "", bssid)
                ssid = ""
                next
            }
            /Cell [0-9]+ - Address:/ {
                if (bssid != "" && ssid != "") print tolower(bssid) "|" ssid
                bssid = $NF
                ssid = ""
                next
            }
            /^[[:space:]]*SSID:/ {
                sub(/^[[:space:]]*SSID:[[:space:]]*/, "", $0)
                ssid = $0
                next
            }
            /^[[:space:]]*ESSID:/ {
                sub(/^[[:space:]]*ESSID:[[:space:]]*"/, "", $0)
                sub(/"[[:space:]]*$/, "", $0)
                ssid = $0
                next
            }
            END {
                if (bssid != "" && ssid != "") print tolower(bssid) "|" ssid
            }
        ')

        printf '%s\n' "$parsed" | while IFS='|' read -r found_bssid found_ssid; do
            [ -z "$found_bssid" ] || [ -z "$found_ssid" ] && continue
            printf '%s' "$our_ssids" | grep -Fxq -- "$found_ssid" || continue

            # Check if found_bssid is foreign (not one of our local radio BSSIDs)
            case "$our_bssids" in
                *" ${found_bssid} "*)
                    continue
                    ;;
            esac

            # Deduplicate per BSSID within EVIL_TWIN_COOLDOWN
            last_et=0
            if [ -f "$ET_CACHE_FILE" ]; then
                last_et=$(awk -F'|' -v b="$found_bssid" '$1 == b {print $2; exit}' "$ET_CACHE_FILE" 2>/dev/null || echo 0)
            fi
            [ -z "$last_et" ] && last_et=0
            if [ $((now - last_et)) -lt "$EVIL_TWIN_COOLDOWN" ]; then
                continue
            fi

            # Update cache for this BSSID
            if [ -f "$ET_CACHE_FILE" ]; then
                awk -F'|' -v b="$found_bssid" '$1 != b {print $0}' "$ET_CACHE_FILE" > "${ET_CACHE_FILE}.tmp" 2>/dev/null || true
                mv -f "${ET_CACHE_FILE}.tmp" "$ET_CACHE_FILE" 2>/dev/null || true
            fi
            printf '%s|%s\n' "$found_bssid" "$now" >> "$ET_CACHE_FILE"

            esc_ssid=$(json_escape "$found_ssid")
            esc_bssid=$(json_escape "$found_bssid")
            esc_band=$(json_escape "$band")
            msg="Evil Twin AP detected on ${esc_band}: foreign BSSID ${esc_bssid} broadcasting SSID '${esc_ssid}'"
            logger -t piso-wids -p daemon.warn "$msg" 2>/dev/null || true

            payload=$(printf '{"type":"evil_twin","severity":"high","band":"%s","ssid":"%s","bssid":"%s","message":"%s"}' \
                "$esc_band" "$esc_ssid" "$esc_bssid" "$(json_escape "$msg")")
            post_wids_event "$payload"
        done
    done
}

# Seed initial log baseline so historical boots/logs do not trigger false alarms
read_deauth_logs > "$SEEN_FILE"
rm -f "$ET_CACHE_FILE"

S1_T=0; S1_C=0
S2_T=0; S2_C=0
S3_T=0; S3_C=0
D0=0; D1=0; D2=0
LAST_DEAUTH_ALERT=0
LAST_SCAN_TIME=0

logger -t piso-wids "OpenPisoWiFi WIDS started (target=${RPI_IP}:${DAEMON_PORT}, scan_interval=${SCAN_INTERVAL}s)" 2>/dev/null || true

while true; do
    NOW=$(date +%s)

    # 1. Monitor associated station drops within a 5s window
    CURR_COUNT=$(count_stations_total)
    MAX_RECENT="$CURR_COUNT"
    if [ $((NOW - S1_T)) -le 6 ] && [ "$S1_C" -gt "$MAX_RECENT" ]; then MAX_RECENT="$S1_C"; fi
    if [ $((NOW - S2_T)) -le 6 ] && [ "$S2_C" -gt "$MAX_RECENT" ]; then MAX_RECENT="$S2_C"; fi
    if [ $((NOW - S3_T)) -le 6 ] && [ "$S3_C" -gt "$MAX_RECENT" ]; then MAX_RECENT="$S3_C"; fi
    STATION_DROP=$((MAX_RECENT - CURR_COUNT))

    S3_T="$S2_T"; S3_C="$S2_C"
    S2_T="$S1_T"; S2_C="$S1_C"
    S1_T="$NOW";  S1_C="$CURR_COUNT"

    # 2. Monitor hostapd / kernel logs for deauth events (>= 5 events in ~5s)
    CURR_LOGS=$(read_deauth_logs)
    NEW_DEAUTH=$(printf '%s\n' "$CURR_LOGS" | awk '
        NR==FNR { if ($0 != "") seen[$0]++; next }
        { if ($0 != "") { if (seen[$0] > 0) seen[$0]--; else cnt++ } }
        END { print cnt + 0 }
    ' "$SEEN_FILE" -)
    printf '%s\n' "$CURR_LOGS" > "$SEEN_FILE"
    [ -z "$NEW_DEAUTH" ] && NEW_DEAUTH=0

    D2="$D1"
    D1="$D0"
    D0="$NEW_DEAUTH"
    DEAUTH_5S=$((D0 + D1 + D2))

    if [ "$STATION_DROP" -ge 3 ] || [ "$DEAUTH_5S" -ge 5 ]; then
        if [ $((NOW - LAST_DEAUTH_ALERT)) -ge "$DEAUTH_COOLDOWN" ]; then
            LAST_DEAUTH_ALERT="$NOW"
            EVENT_COUNT="$DEAUTH_5S"
            [ "$STATION_DROP" -gt "$EVENT_COUNT" ] && EVENT_COUNT="$STATION_DROP"
            MSG="Deauth storm detected (${STATION_DROP} station drop(s), ${DEAUTH_5S} deauth/disassoc events in 5s)"
            logger -t piso-wids -p daemon.warn "$MSG" 2>/dev/null || true
            PAYLOAD=$(printf '{"type":"deauth_storm","severity":"high","band":"2.4GHz/5GHz","count":%s,"message":"%s"}' \
                "$EVENT_COUNT" "$(json_escape "$MSG")")
            post_wids_event "$PAYLOAD"
        fi
    fi

    # 3. Periodic Evil Twin AP Scan
    if [ $((NOW - LAST_SCAN_TIME)) -ge "$SCAN_INTERVAL" ]; then
        LAST_SCAN_TIME="$NOW"
        scan_evil_twins "$NOW"
    fi

    sleep 2
done
