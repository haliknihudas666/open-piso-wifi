import { NextRequest, NextResponse } from "next/server";
import { prisma, ensureSqlitePragmas } from "@/lib/prisma";
import { setRouterQoS, syncRouterDns, setDaemonGpioConfig } from "@/lib/daemon";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSqlitePragmas();

  try {
    const settings = await prisma.setting.findMany();
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json({
      minutes_per_peso: settingsMap.minutes_per_peso || "10",
      portal_title: settingsMap.portal_title || "OpenPisoWiFi",
      banner_message:
        settingsMap.banner_message || "Fast & Affordable High-Speed Wi-Fi",
      rates_config: settingsMap.rates_config || "[]",
      admin_pin: settingsMap.admin_pin || "1234",
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
      // OpenWrt Router & Paywall Network Settings
      portal_domain: settingsMap.portal_domain || "wifi.local",
      router_ip: settingsMap.router_ip || "192.168.1.1",
      portal_ip: settingsMap.portal_ip || "192.168.1.240",
      router_ssh_port: settingsMap.router_ssh_port || "22",
      router_ssh_user: settingsMap.router_ssh_user || "root",
      router_ssh_key_path:
        settingsMap.router_ssh_key_path || "/root/.ssh/id_rsa",
      router_mode: settingsMap.router_mode || "fw4_nftables",
      // GPIO Hardware Pin Settings (Physical 40-pin header numbering)
      // Default: Coin = Physical Pin 7, Inhibit = Physical Pin 11
      coin_gpio_pin: settingsMap.coin_gpio_pin || "7",
      inhibit_gpio_pin: settingsMap.inhibit_gpio_pin || "11",
      inhibit_mode: settingsMap.inhibit_mode || "high",
      coin_slot_timeout_seconds: settingsMap.coin_slot_timeout_seconds || "60",
      // Loyalty & Daily Streak System
      loyalty_enabled: settingsMap.loyalty_enabled || "true",
      loyalty_min_amount: settingsMap.loyalty_min_amount || "1",
      loyalty_milestones: settingsMap.loyalty_milestones || "",
      // Telegram Bot & Cloud Telemetry Settings
      telegram_bot_token: settingsMap.telegram_bot_token || "",
      telegram_admin_chat_id: settingsMap.telegram_admin_chat_id || "",
      supabase_url: settingsMap.supabase_url || "",
      supabase_key: settingsMap.supabase_key || "",
      machine_id: settingsMap.machine_id || "openpiso-kiosk-1",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const body = await request.json();

    const allowedKeys = [
      "minutes_per_peso",
      "portal_title",
      "banner_message",
      "rates_config",
      "admin_pin",
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
      "portal_domain",
      "router_ip",
      "portal_ip",
      "router_ssh_port",
      "router_ssh_user",
      "router_ssh_key_path",
      "router_mode",
      // GPIO Hardware Pin Settings
      "coin_gpio_pin",
      "inhibit_gpio_pin",
      "inhibit_mode",
      "coin_slot_timeout_seconds",
      // Loyalty & Daily Streak System
      "loyalty_enabled",
      "loyalty_min_amount",
      "loyalty_milestones",
      // Telegram & Cloud Settings
      "telegram_bot_token",
      "telegram_admin_chat_id",
      "supabase_url",
      "supabase_key",
      "machine_id",
    ];

    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        await prisma.setting.upsert({
          where: { key },
          update: { value: String(body[key]) },
          create: { key, value: String(body[key]) },
        });
      }
    }

    // Apply Speed Limit directly to OpenWrt Router
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

    // Attempt to notify hardware daemon of updated router settings
    try {
      const daemonUrl = process.env.DAEMON_URL || "http://127.0.0.1:4000";
      await fetch(`${daemonUrl}/api/router/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    // Hot-notify daemon of GPIO pin changes (Physical Pin numbers)
    if (
      body.coin_gpio_pin !== undefined ||
      body.inhibit_gpio_pin !== undefined ||
      body.inhibit_mode !== undefined
    ) {
      try {
        const coinPin = parseInt(body.coin_gpio_pin || "7", 10);
        const inhibitPin = parseInt(body.inhibit_gpio_pin || "11", 10);
        const inhibitMode =
          body.inhibit_mode ||
          (await prisma.setting.findUnique({ where: { key: "inhibit_mode" } }))
            ?.value ||
          "high";
        const inhibitActiveHigh = inhibitMode === "low";
        await setDaemonGpioConfig(coinPin, inhibitPin, inhibitActiveHigh);
        console.log(
          `[SETTINGS] GPIO hot-reload: Coin Physical Pin ${coinPin}, Inhibit Physical Pin ${inhibitPin}, Mode ${inhibitMode} (activeHigh=${inhibitActiveHigh})`,
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

    // Hot-notify daemon of Telegram bot credentials
    if (
      body.telegram_bot_token !== undefined ||
      body.telegram_admin_chat_id !== undefined
    ) {
      try {
        const daemonUrl = process.env.DAEMON_URL || "http://127.0.0.1:4000";
        const token =
          body.telegram_bot_token !== undefined
            ? body.telegram_bot_token
            : (await prisma.setting.findUnique({ where: { key: "telegram_bot_token" } }))?.value;
        const adminChatId =
          body.telegram_admin_chat_id !== undefined
            ? body.telegram_admin_chat_id
            : (await prisma.setting.findUnique({ where: { key: "telegram_admin_chat_id" } }))?.value;

        await fetch(`${daemonUrl}/api/telegram/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
