'use client';

import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  RefreshCw,
  LogOut,
  Menu,
  Activity,
  Ticket,
  Settings,
  DollarSign,
  Radio,
  GitBranch,
  Shield,
  Cpu,
  Palette,
  Tag,
  Wrench,
  Printer,
  Flame,
  Cloud,
  Heart,
} from 'lucide-react';
import { CloudSyncCard } from '@/components/admin/CloudSyncCard';
import { AboutProjectCard } from '@/components/admin/AboutProjectCard';
import { AdminLoginModal } from '@/components/admin/AdminLoginModal';
import { AdminSidebar, AdminTab } from '@/components/admin/AdminSidebar';
import { StatsOverview } from '@/components/admin/StatsOverview';
import { RatesPricingCard } from '@/components/admin/RatesPricingCard';
import { LoyaltyConfigCard } from '@/components/admin/LoyaltyConfigCard';
import { MachineConfigCard } from '@/components/admin/MachineConfigCard';
import { PortalUiCard } from '@/components/admin/PortalUiCard';
import { VoucherManager } from '@/components/admin/VoucherManager';
import { PrintableInstructionsCard } from '@/components/admin/PrintableInstructionsCard';
import { ActiveSessionsTable } from '@/components/admin/ActiveSessionsTable';
import { RouterWifiCard } from '@/components/admin/RouterWifiCard';
import { SystemUpdateCard } from '@/components/admin/SystemUpdateCard';
import { SystemHealthCard } from '@/components/admin/SystemHealthCard';
import { SystemMaintenanceCard } from '@/components/admin/SystemMaintenanceCard';
import { CashBoxManager } from '@/components/admin/CashBoxManager';
import { DeviceManager } from '@/components/admin/DeviceManager';
import { CoinDebugger } from '@/components/admin/CoinDebugger';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { safeStorage } from '@/lib/safe-storage';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const TAB_TITLES: Record<AdminTab, { title: string; subtitle: string; icon: any }> = {
  sessions: {
    title: 'Active Hotspot Sessions',
    subtitle: 'Real-time connected client monitor and lease timer controls',
    icon: Activity,
  },
  rates: {
    title: 'Rates & Pricing Tiers',
    subtitle: 'Coin-to-time conversion rates, price tier packages, free trial grants, and pause rules',
    icon: Tag,
  },
  loyalty: {
    title: 'Customer Loyalty & Daily Streaks',
    subtitle: 'Daily streak rewards: reward regulars with automatic bonus time for consecutive days (e.g. 3-day -> +1 hr, 7-day -> +6 hrs)',
    icon: Flame,
  },
  vouchers: {
    title: 'Voucher Ticket Management',
    subtitle: 'Generate prepaid Wi-Fi codes, print sheets, and monitor redemption',
    icon: Ticket,
  },
  posters: {
    title: 'Customer Instruction Poster & Tarpaulin',
    subtitle: 'Printable step-by-step guides for A4 paper, wall signs, and large tarpaulin banners in English and Taglish',
    icon: Printer,
  },
  machine: {
    title: 'Machine & Hardware Settings',
    subtitle: 'Raspberry Pi GPIO pin allocation, coin slot timeout window, and admin PIN',
    icon: Wrench,
  },
  branding: {
    title: 'Customer Portal UI & Branding',
    subtitle: 'Brand name, welcome headlines, announcement ticker marquee, and customer widgets',
    icon: Palette,
  },
  router: {
    title: 'Router & Wi-Fi Configuration',
    subtitle: 'Ruijie OpenWrt gateway controller, bandwidth QoS speed limits, wireless radios & SSIDs',
    icon: Radio,
  },
  devices: {
    title: 'VIP Whitelist & Blacklist',
    subtitle: 'Permanent client device access policies and firewall enforcement',
    icon: Shield,
  },
  system: {
    title: 'System Health & Git Updates',
    subtitle: 'Firmware status, CPU telemetry, auto-updates, and services',
    icon: GitBranch,
  },
  sales: {
    title: 'Sales Analytics & Cash Box',
    subtitle: 'Audit physical coin drawer, collection logs, and revenue metrics',
    icon: DollarSign,
  },
  hardware: {
    title: 'Hardware Coin Slot Debugger',
    subtitle: 'Live CL-168 coin acceptor pulse monitor, GPIO pins, and diagnostics',
    icon: Cpu,
  },
  cloud: {
    title: 'Cloud Sync & Multi-Coinslots',
    subtitle: 'Manage remote wireless ESP32 coinslots, free Telegram bot alerts, and Supabase cloud sync',
    icon: Cloud,
  },
  about: {
    title: 'About OpenPisoWiFi & Project Links',
    subtitle: 'Free and open-source hotspot vending platform created by Nicolei Games',
    icon: Heart,
  },
};

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('sessions');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Check stored auth PIN and sidebar preference
  useEffect(() => {
    let pin: string | null = null;
    try {
      pin = sessionStorage.getItem('hudas_admin_pin');
    } catch { }
    setIsAuthenticated(!!pin);

    const savedSidebar = safeStorage.getItem('hudas_admin_sidebar_collapsed');
    if (savedSidebar !== null) {
      setIsSidebarCollapsed(savedSidebar === 'true');
    }
  }, []);

  const handleToggleSidebar = () => {
    const nextState = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextState);
    safeStorage.setItem('hudas_admin_sidebar_collapsed', String(nextState));
  };

  // Poll Stats
  const { data: stats, mutate: mutateStats } = useSWR(
    isAuthenticated ? '/api/admin/stats' : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  // Poll Sessions
  const { data: sessionsData, mutate: mutateSessions } = useSWR(
    isAuthenticated ? '/api/admin/sessions' : null,
    fetcher,
    { refreshInterval: 3000 }
  );

  // Poll Vouchers
  const { data: vouchersData, mutate: mutateVouchers } = useSWR(
    isAuthenticated ? '/api/admin/vouchers' : null,
    fetcher
  );

  // Poll Settings
  const { data: settingsData, mutate: mutateSettings } = useSWR(
    isAuthenticated ? '/api/admin/settings' : null,
    fetcher
  );

  // Poll Router Wi-Fi Config
  const { data: wifiData, mutate: mutateWifi } = useSWR(
    isAuthenticated ? '/api/admin/router/wifi' : null,
    fetcher
  );

  // Poll System Version Info (Portal, Daemon, and Root System Release)
  const { data: versionData, mutate: mutateVersion } = useSWR(
    isAuthenticated ? '/api/admin/system/version' : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const handleLogout = () => {
    sessionStorage.removeItem('hudas_admin_pin');
    setIsAuthenticated(false);
  };

  const handleRefreshAll = () => {
    mutateStats();
    mutateSessions();
    mutateVouchers();
    mutateSettings();
    mutateWifi();
    mutateVersion();
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-[#f6f4ea] dark:bg-[#111613] flex items-center justify-center font-bold text-neutral-500">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLoginModal onSuccess={() => setIsAuthenticated(true)} />;
  }

  const currentTabMeta = TAB_TITLES[activeTab];
  const CurrentTabIcon = currentTabMeta.icon;

  return (
    <div className="min-h-screen bg-dot-grid flex flex-col md:flex-row bg-[#f6f4ea] dark:bg-[#111613] text-black dark:text-white transition-colors duration-150">
      {/* Collapsible Sidebar */}
      <AdminSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        isMobileOpen={isMobileDrawerOpen}
        onCloseMobile={() => setIsMobileDrawerOpen(false)}
        activeSessionsCount={sessionsData?.sessions?.length || 0}
        totalVouchersCount={vouchersData?.vouchers?.length || 0}
        onLogout={handleLogout}
      />

      {/* Main Content Pane */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top Command Bar */}
        <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#18211b]/95 backdrop-blur-md border-b-2 border-black dark:border-[#4a6052] p-3.5 sm:px-6 flex items-center justify-between gap-3 shadow-neo-sm">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Menu Toggle */}
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="md:hidden p-2 rounded-lg border-2 border-black dark:border-[#4a6052] bg-[#f8f6ee] dark:bg-[#111713] text-black dark:text-white shadow-neo-sm cursor-pointer"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Current Section Title */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="hidden sm:flex p-2 rounded-lg bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm shrink-0">
                <CurrentTabIcon className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-extrabold font-display tracking-tight text-black dark:text-white truncate">
                  {currentTabMeta.title}
                </h1>
                <p className="text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2] hidden sm:block truncate">
                  {currentTabMeta.subtitle}
                </p>
              </div>
            </div>
          </div>

          {/* Right Status Badges & Quick Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live Daemon Status Pill */}
            {versionData && (
              <div className="hidden lg:flex items-center gap-1.5">
                <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border-2 border-black shadow-neo-sm flex items-center gap-1.5 ${versionData.daemonOnline
                  ? 'bg-[#4ade80] text-black'
                  : 'bg-[#ff5f57] text-black'
                  }`}>
                  <span className={`w-2 h-2 rounded-full bg-black ${versionData.daemonOnline ? 'animate-pulse' : ''}`} />
                  Daemon {versionData.daemonOnline ? 'Online' : 'Offline'}
                </span>

                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#111713] text-black dark:text-[#ffe17c] shadow-neo-sm">
                  {versionData.portalVersion || versionData.currentVersion}
                </span>
              </div>
            )}

            {/* Global Refresh Button */}
            <Button
              onClick={handleRefreshAll}
              variant="outline"
              size="sm"
              className="gap-1.5 px-3 py-1.5"
              title="Refresh All Data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            {/* Quick Logout Button */}
            <Button
              onClick={handleLogout}
              variant="danger"
              size="sm"
              className="gap-1.5 px-3 py-1.5"
              title="Lock / Exit Admin"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lock</span>
            </Button>
          </div>
        </header>

        {/* Dashboard Workspace */}
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl w-full">
          {/* Key Metrics Stats Overview */}
          <StatsOverview stats={stats} />

          {/* Active Tab View Rendering */}
          <section className="space-y-6">
            {/* Tab 1: Active Sessions */}
            {activeTab === 'sessions' && (
              <ActiveSessionsTable
                sessions={sessionsData?.sessions || []}
                onSessionsUpdated={() => {
                  mutateSessions();
                  mutateStats();
                }}
              />
            )}

            {/* Tab: Portal UI & Branding */}
            {activeTab === 'branding' && settingsData && (
              <PortalUiCard
                initialSettings={settingsData}
                onSaveSuccess={() => {
                  mutateSettings();
                }}
              />
            )}

            {/* Tab 2: Router & Wi-Fi Management */}
            {activeTab === 'router' && (
              <div className="space-y-6">
                <RouterWifiCard
                  initialSettings={settingsData}
                  onSaveSuccess={() => mutateSettings()}
                />
              </div>
            )}

            {/* Tab 3: VIP Whitelist & Blacklist */}
            {activeTab === 'devices' && (
              <div className="space-y-6">
                <DeviceManager />
              </div>
            )}

            {/* Tab 4: System, Git Updates & Telemetry */}
            {activeTab === 'system' && (
              <div className="space-y-6">
                <SystemUpdateCard />
                <SystemHealthCard />
                <SystemMaintenanceCard />
              </div>
            )}

            {/* Tab 5: Vouchers */}
            {activeTab === 'vouchers' && (
              <VoucherManager
                vouchers={vouchersData?.vouchers || []}
                onVouchersUpdated={() => {
                  mutateVouchers();
                  mutateStats();
                }}
              />
            )}

            {/* Tab: Customer Printable Instructions & Tarpaulin Poster */}
            {activeTab === 'posters' && (
              <PrintableInstructionsCard
                initialSettings={settingsData}
                wifiConfig={wifiData}
              />
            )}

            {/* Tab: Rates & Pricing */}
            {activeTab === 'rates' && settingsData && (
              <RatesPricingCard
                initialSettings={settingsData}
                onSaveSuccess={() => {
                  mutateSettings();
                }}
              />
            )}

            {/* Tab: Customer Loyalty & Streaks */}
            {activeTab === 'loyalty' && (
              <LoyaltyConfigCard
                onSaveSuccess={() => {
                  mutateSettings();
                }}
              />
            )}

            {/* Tab: Machine & Gateway Settings */}
            {activeTab === 'machine' && settingsData && (
              <MachineConfigCard
                initialSettings={settingsData}
                onSaveSuccess={() => {
                  mutateSettings();
                }}
              />
            )}

            {/* Tab 7: Sales Analytics & Cash Box Collection */}
            {activeTab === 'sales' && (
              <div className="space-y-6">
                <CashBoxManager />

                {/* Recent Transaction Log Table */}
                <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo">
                  <CardHeader>
                    <CardTitle>
                      <DollarSign className="w-5 h-5 text-black dark:text-[#ffe17c]" />
                      <span>Recent Sales Log</span>
                    </CardTitle>
                  </CardHeader>

                  <div className="overflow-x-auto rounded-xl border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#ffe17c] text-black font-extrabold border-b-2 border-black uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="p-3">Transaction ID</th>
                          <th className="p-3">Amount</th>
                          <th className="p-3">Method</th>
                          <th className="p-3">Device MAC</th>
                          <th className="p-3">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y-2 divide-black/10 dark:divide-white/10 bg-white dark:bg-[#171e19]">
                        {(!stats?.recentSales || stats.recentSales.length === 0) ? (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-neutral-500 font-bold">
                              No sales recorded yet.
                            </td>
                          </tr>
                        ) : (
                          stats.recentSales.map((sale: any) => (
                            <tr key={sale.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium">
                              <td className="p-3 font-mono text-neutral-600 dark:text-neutral-400">{sale.id.slice(-8)}</td>
                              <td className="p-3 font-extrabold text-black dark:text-[#4ade80]">₱{sale.amount}</td>
                              <td className="p-3">
                                <Badge variant={sale.source === 'VOUCHER' ? 'purple' : 'success'}>
                                  {sale.source}
                                </Badge>
                              </td>
                              <td className="p-3 font-mono text-black dark:text-[#ffe17c]">{sale.macAddress || '—'}</td>
                              <td className="p-3 text-neutral-600 dark:text-[#b7c6c2]">
                                {new Date(sale.createdAt).toLocaleString()}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* Tab 8: Hardware Debug */}
            {activeTab === 'hardware' && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-extrabold text-black dark:text-white font-display">
                  <Cpu className="w-5 h-5 text-black dark:text-[#ffe17c]" />
                  <span>Hardware Coin Slot Diagnostics</span>
                  <span className="text-xs font-normal text-neutral-500 dark:text-[#b7c6c2]">
                    — CL-168 · Active LOW Pulses
                  </span>
                </div>
                <CoinDebugger />
              </div>
            )}

            {/* Tab 9: Cloud & Multi-Coinslots */}
            {activeTab === 'cloud' && (
              <div className="space-y-5">
                <CloudSyncCard />
              </div>
            )}

            {/* Tab 10: About & Open Source Project */}
            {activeTab === 'about' && (
              <div className="space-y-5">
                <AboutProjectCard />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
