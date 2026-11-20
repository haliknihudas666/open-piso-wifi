import { NextRequest, NextResponse } from "next/server";
import { prisma, ensureSqlitePragmas } from "@/lib/prisma";
import {
  setRouterQoS,
  syncRouterDns,
  setDaemonGpioConfig,
  daemonHeaders,
} from "@/lib/daemon";
import {
  requireAdmin,
  hashPin,
  maskSecret,
  isBlankOrMaskedSecret,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const DAEMON_URL = process.env.DAEMON_URL || "http://127.0.0.1:4000";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  await ensureSqlitePragmas();

  try {
    const settings = await prisma.setting.findMany();
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    const rawTelegramToken = settingsMap.telegram_bot_token || "";
    const rawSupabaseKey = settingsMap.supabase_key || "";
    const rawIotPassphrase = settingsMap.shield_iot_passphrase || "";

    return NextResponse.json({
      minutes_per_peso: settingsMap.minutes_per_peso || "10",
      portal_title: settingsMap.portal_title || "OpenPisoWiFi",
      banner_message:
        settingsMap.banner_message || "Fast & Affordable High-Speed Wi-Fi",
      rates_config: settingsMap.rates_config || "[]",
      // Redacted secrets + presence/mask flags
      admin_pin: "",
      has_admin_pin: Boolean(settingsMap.admin_pin || process.env.ADMIN_PIN || "1234"),
      // Commercial Hotspot Settings
      speed_limit: settingsMap.speed_limit || "25mbps",
      custom_down_mbps: settingsMap.custom_down_mbps || "25",
      custom_up_mbps: settingsMap.custom_up_mbps || "10",
      allow_pause_time: settingsMap.allow_pause_time || "true",
      auto_pause_on_disconnect: settingsMap.auto_pause_on_disconnect || "true",
      auto_pause_grace_seconds: settingsMap.auto_pause_grace_seconds || "60",
      auto_resume_on_reconnect: settingsMap.auto_resume_on_reconnect || "true",
      wifi_unified_ssid: settingsMap.wifi_unified_ssid || "false",
      free_trial_enabled: settingsMap.free_trial_enabled || "true",
      free_trial_minutes: settingsMap.free_trial_minutes || "5",
      show_coin_simulator: settingsMap.show_coin_simulator ?? "false",
      portal_theme: settingsMap.portal_theme || "emerald",
      announcement:
        settingsMap.announcement ||
        "⚡ High-Speed Fiber Internet • Low Ping for Online Gaming & Browsing!",
      promo_rates_enabled: settingsMap.promo_rates_enabled || "false",
      promo_start_hour: settingsMap.promo_start_hour || "22",
      promo_end_hour: settingsMap.promo_end_hour || "6",
      promo_rates_config: settingsMap.promo_rates_config || "",
      // OpenWrt Router & Paywall Network Settings
      portal_domain: settingsMap.portal_domain || "wifi.local",
      router_ip: settingsMap.router_ip || "192.168.1.1",
      portal_ip: settingsMap.portal_ip || "192.168.1.240",
      router_ssh_port: settingsMap.router_ssh_port || "22",
      router_ssh_user: settingsMap.router_ssh_user || "root",
      router_ssh_key_path:
        settingsMap.router_ssh_key_path || "/root/.ssh/id_rsa",
      router_mode: settingsMap.router_mode || "fw4_nftables",
      // Canonical BCM GPIO Hardware Pin Settings
      coin_gpio_pin: settingsMap.coin_gpio_pin || "4",
      inhibit_gpio_pin: settingsMap.inhibit_gpio_pin || "17",
      button_gpio_pin: settingsMap.button_gpio_pin || "27",
      inhibit_mode: settingsMap.inhibit_mode || "high",
      gpio_backend: settingsMap.gpio_backend || "auto",
      board_profile: settingsMap.board_profile || "rpi",
      pulse_multiplier: settingsMap.pulse_multiplier || "1",
      serial_port: settingsMap.serial_port || "",
      coin_slot_timeout_seconds: settingsMap.coin_slot_timeout_seconds || "60",
      // Loyalty & Daily Streak System
      loyalty_enabled: settingsMap.loyalty_enabled || "true",
      loyalty_min_amount: settingsMap.loyalty_min_amount || "1",
      loyalty_milestones: settingsMap.loyalty_milestones || "",
      // Telegram Bot & Cloud Telemetry Settings (secrets redacted)
      telegram_bot_token: "",
      has_telegram_token: Boolean(rawTelegramToken),
      telegram_token_masked: maskSecret(rawTelegramToken),
      telegram_admin_chat_id: settingsMap.telegram_admin_chat_id || "",
      supabase_url: settingsMap.supabase_url || "",
      supabase_key: "",
      has_supabase_key: Boolean(rawSupabaseKey),
      supabase_key_masked: maskSecret(rawSupabaseKey),
      machine_id: settingsMap.machine_id || "openpiso-kiosk-1",
      // OpenPiso Shield Settings
      shield_owe_mode: settingsMap.shield_owe_mode || "owe_5g",
      shield_client_isolation: settingsMap.shield_client_isolation || "true",
      shield_anti_tethering: settingsMap.shield_anti_tethering || "false",
      shield_block_random_mac_trial: settingsMap.shield_block_random_mac_trial || "true",
      shield_storm_shield_enabled: settingsMap.shield_storm_shield_enabled || "true",
      shield_wids_enabled: settingsMap.shield_wids_enabled || "true",
      shield_iot_ssid: settingsMap.shield_iot_ssid || "",
      shield_iot_passphrase: "",
      has_iot_passphrase: Boolean(rawIotPassphrase),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  await ensureSqlitePragmas();

  try {
    const body = await request.json();

    const nonSecretKeys = [
      "minutes_per_peso",
      "portal_title",
      "banner_message",
      "rates_config",
      "speed_limit",
      "custom_down_mbps",
      "custom_up_mbps",
      "allow_pause_time",
      "auto_pause_on_disconnect",
      "auto_pause_grace_seconds",
      "auto_resume_on_reconnect",
      "wifi_unified_ssid",
      "free_trial_enabled",
      "free_trial_minutes",
      "show_coin_simulator",
      "portal_theme",
      "announcement",
      "promo_rates_enabled",
      "promo_start_hour",
      "promo_end_hour",
      "promo_rates_config",
      "portal_domain",
      "router_ip",
      "portal_ip",
      "router_ssh_port",
      "router_ssh_user",
      "router_ssh_key_path",
      "router_mode",
      // Canonical BCM GPIO Hardware Pin Settings
      "coin_gpio_pin",
      "inhibit_gpio_pin",
      "button_gpio_pin",
      "inhibit_mode",
      "gpio_backend",
      "board_profile",
      "pulse_multiplier",
      "serial_port",
      "coin_slot_timeout_seconds",
      // Loyalty & Daily Streak System
      "loyalty_enabled",
      "loyalty_min_amount",
      "loyalty_milestones",
      // Non-secret Telegram & Cloud fields
      "telegram_admin_chat_id",
      "supabase_url",
      "machine_id",
      // OpenPiso Shield non-secret settings
      "shield_owe_mode",
      "shield_client_isolation",
      "shield_anti_tethering",
      "shield_block_random_mac_trial",
      "shield_storm_shield_enabled",
      "shield_wids_enabled",
      "shield_iot_ssid",
    ];

    for (const key of nonSecretKeys) {
      if (body[key] !== undefined) {
        await prisma.setting.upsert({
          where: { key },
          update: { value: String(body[key]) },
          create: { key, value: String(body[key]) },
        });
      }
    }

    // Hash admin_pin with scrypt if non-empty; preserve existing PIN if blank
    if (typeof body.admin_pin === "string" && body.admin_pin.trim().length > 0) {
      const hashed = hashPin(body.admin_pin);
      await prisma.setting.upsert({
        where: { key: "admin_pin" },
        update: { value: hashed },
        create: { key: "admin_pin", value: hashed },
      });
    }

    // Secret fields: only overwrite when explicitly cleared or given a real new non-masked value
    let telegramTokenUpdated = false;
    if (body.clear_telegram_token === true) {
      await prisma.setting.upsert({
        where: { key: "telegram_bot_token" },
        update: { value: "" },
        create: { key: "telegram_bot_token", value: "" },
      });
      telegramTokenUpdated = true;
    } else if (!isBlankOrMaskedSecret(body.telegram_bot_token)) {
      await prisma.setting.upsert({
        where: { key: "telegram_bot_token" },
        update: { value: String(body.telegram_bot_token).trim() },
        create: { key: "telegram_bot_token", value: String(body.telegram_bot_token).trim() },
      });
      telegramTokenUpdated = true;
    }

    if (body.clear_supabase_key === true) {
      await prisma.setting.upsert({
        where: { key: "supabase_key" },
        update: { value: "" },
        create: { key: "supabase_key", value: "" },
      });
    } else if (!isBlankOrMaskedSecret(body.supabase_key)) {
      await prisma.setting.upsert({
        where: { key: "supabase_key" },
        update: { value: String(body.supabase_key).trim() },
        create: { key: "supabase_key", value: String(body.supabase_key).trim() },
      });
    }

    if (body.clear_iot_passphrase === true) {
      await prisma.setting.upsert({
        where: { key: "shield_iot_passphrase" },
        update: { value: "" },
        create: { key: "shield_iot_passphrase", value: "" },
      });
    } else if (!isBlankOrMaskedSecret(body.shield_iot_passphrase)) {
      await prisma.setting.upsert({
        where: { key: "shield_iot_passphrase" },
        update: { value: String(body.shield_iot_passphrase).trim() },
        create: { key: "shield_iot_passphrase", value: String(body.shield_iot_passphrase).trim() },
      });
    }

    // Apply Speed Limit directly to OpenWrt Router ONLY when QoS settings were submitted
    if (
      body.speed_limit !== undefined ||
      body.custom_down_mbps !== undefined ||
      body.custom_up_mbps !== undefined
    ) {
      try {
        let downMbps = 0;
        let upMbps = 0;

        const speed = body.speed_limit || "25mbps";
        if (speed === "25mbps") {
          downMbps = 25;
          upMbps = 10;
        } else if (speed === "50mbps") {
          downMbps = 50;
          upMbps = 20;
        } else if (speed === "100mbps") {
          downMbps = 100;
          upMbps = 50;
        } else if (speed === "custom") {
          downMbps = Math.max(1, parseInt(body.custom_down_mbps || "25", 10));
          upMbps = Math.max(1, parseInt(body.custom_up_mbps || "10", 10));
        } else if (speed === "unlimited") {
          downMbps = 0;
          upMbps = 0;
        }

        await setRouterQoS(downMbps, upMbps);
      } catch (qosErr) {
        console.error("Failed to apply QoS to OpenWrt:", qosErr);
      }
    }

    // Notify hardware daemon of updated router settings when router keys are submitted
    if (
      body.router_ip !== undefined ||
      body.router_ssh_port !== undefined ||
      body.router_ssh_user !== undefined ||
      body.router_ssh_key_path !== undefined ||
      body.router_mode !== undefined
    ) {
      try {
        await fetch(`${DAEMON_URL}/api/router/config`, {
          method: "POST",
          headers: daemonHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            host: body.router_ip,
            port: body.router_ssh_port
              ? parseInt(body.router_ssh_port, 10)
              : undefined,
            username: body.router_ssh_user,
            privateKeyPath: body.router_ssh_key_path,
            mode: body.router_mode,
          }),
          signal: AbortSignal.timeout(1500),
        });
      } catch {}
    }

    // Hot-notify daemon of canonical BCM GPIO pin/backend changes
    if (
      body.coin_gpio_pin !== undefined ||
      body.inhibit_gpio_pin !== undefined ||
      body.button_gpio_pin !== undefined ||
      body.inhibit_mode !== undefined ||
      body.gpio_backend !== undefined ||
      body.board_profile !== undefined ||
      body.pulse_multiplier !== undefined ||
      body.serial_port !== undefined
    ) {
      try {
        const gpioRows = await prisma.setting.findMany({
          where: {
            key: {
              in: [
                "coin_gpio_pin",
                "inhibit_gpio_pin",
                "button_gpio_pin",
                "inhibit_mode",
                "gpio_backend",
                "board_profile",
                "pulse_multiplier",
                "serial_port",
              ],
            },
          },
        });
        const gMap = new Map(gpioRows.map((r) => [r.key, r.value]));

        const coinBcm = parseInt(String(body.coin_gpio_pin ?? gMap.get("coin_gpio_pin") ?? "4"), 10) || 4;
        const inhibitBcm = parseInt(String(body.inhibit_gpio_pin ?? gMap.get("inhibit_gpio_pin") ?? "17"), 10) || 17;
        const buttonBcm = parseInt(String(body.button_gpio_pin ?? gMap.get("button_gpio_pin") ?? "27"), 10) || 27;
        const inhibitMode = String(body.inhibit_mode ?? gMap.get("inhibit_mode") ?? "high");
        // Fixed inverted inhibit bug: 'high' (IDLE HIGH / ACTIVE LOW) => inhibitActiveHigh = true; 'low' => false
        const inhibitActiveHigh = inhibitMode !== "low";
        const gpioBackend = String(body.gpio_backend ?? gMap.get("gpio_backend") ?? "auto");
        const boardProfile = String(body.board_profile ?? gMap.get("board_profile") ?? "rpi");
        const pulseMultiplier = Math.max(
          1,
          parseInt(String(body.pulse_multiplier ?? gMap.get("pulse_multiplier") ?? "1"), 10) || 1
        );
        const serialPort = String(body.serial_port ?? gMap.get("serial_port") ?? "").trim();

        await setDaemonGpioConfig({
          coinBcm,
          inhibitBcm,
          buttonBcm,
          inhibitActiveHigh,
          gpioBackend,
          boardProfile,
          pulseMultiplier,
          ...(serialPort ? { serialPort } : {}),
        });
        console.log(
          `[SETTINGS] GPIO hot-reload: Coin BCM ${coinBcm}, Inhibit BCM ${inhibitBcm}, Button BCM ${buttonBcm}, Mode ${inhibitMode} (activeHigh=${inhibitActiveHigh}), Backend=${gpioBackend}, Profile=${boardProfile}, Multiplier=${pulseMultiplier}`,
        );
      } catch (gpioErr) {
        console.warn("[SETTINGS] GPIO hot-reload notice:", gpioErr);
      }
    }

    // Sync portal domain and IP to OpenWrt router dnsmasq
    if (
      body.portal_domain !== undefined ||
      body.portal_ip !== undefined ||
      body.router_ip !== undefined
    ) {
      try {
        const targetDomain =
          body.portal_domain ||
          (await prisma.setting.findUnique({ where: { key: "portal_domain" } }))
            ?.value ||
          "wifi.local";
        const targetPortalIp =
          body.portal_ip ||
          (await prisma.setting.findUnique({ where: { key: "portal_ip" } }))
            ?.value ||
          "192.168.1.240";
        const targetRouterIp =
          body.router_ip ||
          (await prisma.setting.findUnique({ where: { key: "router_ip" } }))
            ?.value ||
          "192.168.1.1";
        await syncRouterDns(targetDomain, targetPortalIp, targetRouterIp);
      } catch (dnsErr) {
        console.warn("[SETTINGS] Router DNS sync notice:", dnsErr);
      }
    }

    // Hot-notify daemon of Telegram bot credentials (preserving stored token when blank/masked)
    if (telegramTokenUpdated || body.telegram_admin_chat_id !== undefined) {
      try {
        const token =
          (await prisma.setting.findUnique({ where: { key: "telegram_bot_token" } }))?.value || "";
        const adminChatId =
          body.telegram_admin_chat_id !== undefined
            ? String(body.telegram_admin_chat_id)
            : (await prisma.setting.findUnique({ where: { key: "telegram_admin_chat_id" } }))?.value || "";

        await fetch(`${DAEMON_URL}/api/telegram/config`, {
          method: "POST",
          headers: daemonHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ token, adminChatId }),
          signal: AbortSignal.timeout(2000),
        });
      } catch (tgErr) {
        console.warn("[SETTINGS] Telegram daemon sync notice:", tgErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Settings, QoS, and Router DNS saved successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to save settings" },
      { status: 500 },
    );
  }
}
