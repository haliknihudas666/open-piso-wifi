'use client';

import React from 'react';
import Link from 'next/link';
import {
  Activity,
  Ticket,
  Settings,
  DollarSign,
  Radio,
  GitBranch,
  Shield,
  Cpu,
  ArrowLeft,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Wifi,
  X,
  Palette,
  Tag,
  Wrench,
  Printer,
  Flame,
  Cloud,
  Heart,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Badge } from '@/components/ui/Badge';

export type AdminTab =
  | 'sessions'
  | 'sales'
  | 'hardware'
  | 'cloud'
  | 'rates'
  | 'loyalty'
  | 'vouchers'
  | 'posters'
  | 'branding'
  | 'router'
  | 'devices'
  | 'machine'
  | 'system'
  | 'about';

interface NavItem {
  id: AdminTab;
  label: string;
  icon: any;
  badge?: string;
  badgeVariant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

interface AdminSidebarProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  activeSessionsCount?: number;
  totalVouchersCount?: number;
  onLogout: () => void;
}

export function AdminSidebar({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  activeSessionsCount = 0,
  totalVouchersCount = 0,
  onLogout,
}: AdminSidebarProps) {
  const navGroups: NavGroup[] = [
    {
      group: 'Operations',
      items: [
        {
          id: 'sessions' as AdminTab,
          label: 'Active Sessions',
          icon: Activity,
          badge: activeSessionsCount > 0 ? activeSessionsCount.toString() : undefined,
          badgeVariant: 'success' as const,
        },
        {
          id: 'sales' as AdminTab,
          label: 'Sales & Cash Box',
          icon: DollarSign,
        },
      ],
    },
    {
      group: 'Commercial & Rates',
      items: [
        {
          id: 'rates' as AdminTab,
          label: 'Rates & Pricing',
          icon: Tag,
        },
        {
          id: 'loyalty' as AdminTab,
          label: 'Loyalty & Streaks',
          icon: Flame,
          badge: 'HOT',
          badgeVariant: 'warning' as const,
        },
        {
          id: 'vouchers' as AdminTab,
          label: 'Vouchers',
          icon: Ticket,
          badge: totalVouchersCount > 0 ? totalVouchersCount.toString() : undefined,
          badgeVariant: 'warning' as const,
        },
        {
          id: 'posters' as AdminTab,
          label: 'Printable Guides',
          icon: Printer,
        },
      ],
    },
    {
      group: 'Network & Machine',
      items: [
        {
          id: 'machine' as AdminTab,
          label: 'Machine Settings',
          icon: Wrench,
        },
        {
          id: 'router' as AdminTab,
          label: 'Router & Wi-Fi',
          icon: Radio,
        },
        {
          id: 'devices' as AdminTab,
          label: 'VIP & Blacklist',
          icon: Shield,
        },
        {
          id: 'branding' as AdminTab,
          label: 'Portal UI & Branding',
          icon: Palette,
        },
        {
          id: 'cloud' as AdminTab,
          label: 'Cloud & Multi-Coinslots',
          icon: Cloud,
          badgeVariant: 'warning' as const,
        },
      ],
    },
    {
      group: 'Maintenance',
      items: [
        {
          id: 'system' as AdminTab,
          label: 'System & Updates',
          icon: GitBranch,
        },
        {
          id: 'hardware' as AdminTab,
          label: 'Hardware Debug',
          icon: Cpu,
        },
      ],
    },
    {
      group: 'Community & Project',
      items: [
        {
          id: 'about' as AdminTab,
          label: 'About & Open Source',
          icon: Heart,
          badge: 'FREE',
          badgeVariant: 'success' as const,
        },
      ],
    },
  ];

  const handleSelect = (tab: AdminTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="h-full flex flex-col bg-white dark:bg-[#18211b] border-r-2 border-black dark:border-[#4a6052] transition-all duration-200">
      {/* 1. Sidebar Header (Fixed at top) */}
      <div className={`p-3.5 border-b-2 border-black dark:border-[#4a6052] shrink-0 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm flex items-center justify-center shrink-0">
              <Wifi className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="overflow-hidden">
              <div className="font-extrabold font-display text-sm tracking-tight text-black dark:text-white truncate">
                OPEN PISO WIFI
              </div>
              <div className="text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2] truncate">
                OpenWrt Controller
              </div>
            </div>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm flex items-center justify-center shrink-0" title="OpenPisoWiFi Admin">
            <Wifi className="w-5 h-5 stroke-[2.5]" />
          </div>
        )}

        {/* Desktop Collapse Toggle Button */}
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex p-1.5 rounded-lg border-2 border-black dark:border-[#4a6052] bg-[#f8f6ee] dark:bg-[#111713] text-black dark:text-white shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer shrink-0"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Mobile Close Button */}
        <button
          onClick={onCloseMobile}
          className="md:hidden p-1.5 rounded-lg border-2 border-black dark:border-[#4a6052] bg-[#f8f6ee] dark:bg-[#111713] text-black dark:text-white shadow-neo-sm cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Navigation Items (Fills 100% of remaining vertical height, only scrolls when window is truly short) */}
      <nav className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-2.5 space-y-2 [scrollbar-width:thin]">
        {navGroups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-0.5">
            {!isCollapsed && (
              <div className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-neutral-500 dark:text-[#b7c6c2]">
                {group.group}
              </div>
            )}

            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl border-2 transition-all cursor-pointer font-bold text-xs select-none ${isActive
                    ? 'bg-[#ffe17c] text-black border-black shadow-neo-sm'
                    : 'border-transparent text-neutral-700 dark:text-neutral-200 hover:border-black/30 dark:hover:border-white/20 hover:bg-black/5 dark:hover:bg-white/10'
                    } ${isCollapsed ? 'justify-center' : 'justify-between'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-black' : 'text-neutral-600 dark:text-[#b7c6c2]'}`} />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </div>

                  {!isCollapsed && item.badge && (
                    <Badge variant={item.badgeVariant} className="px-1.5 py-0 text-[10px] shrink-0">
                      {item.badge}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 3. Sidebar Footer Controls (Pinned neatly at bottom) */}
      <div className="shrink-0 p-2.5 border-t-2 border-black dark:border-[#4a6052] bg-[#f8f6ee] dark:bg-[#111713]">
        {!isCollapsed ? (
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/"
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#1c241f] text-black dark:text-white shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] text-xs font-extrabold transition-all"
              title="Return to Customer Portal"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Portal</span>
            </Link>

            <ThemeToggle />

            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg border-2 border-black bg-[#ff5f57] text-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
              title="Lock / Exit Admin"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Link
              href="/"
              className="p-2 rounded-lg border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#1c241f] text-black dark:text-white shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              title="Return to Portal"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <ThemeToggle />
            <button
              onClick={onLogout}
              className="p-2 rounded-lg border-2 border-black bg-[#ff5f57] text-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
              title="Lock / Exit Admin"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden md:block shrink-0 transition-all duration-200 ${isCollapsed ? 'w-[72px]' : 'w-[268px]'
          }`}
      >
        <div className={`fixed top-0 bottom-0 z-30 transition-all duration-200 ${isCollapsed ? 'w-[72px]' : 'w-[268px]'
          }`}>
          {sidebarContent}
        </div>
      </aside>

      {/* Mobile Drawer Overlay & Sheet */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in"
            onClick={onCloseMobile}
          />
          <div className="relative w-[280px] max-w-[80vw] h-full shadow-neo-xl z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
