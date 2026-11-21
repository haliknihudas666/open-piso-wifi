'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Globe, ShieldCheck } from 'lucide-react';
import { AdminLoginModal } from '@/components/admin/AdminLoginModal';
import { CloudSyncCard } from '@/components/admin/CloudSyncCard';

export default function RemoteTunnelAdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/admin/auth')
      .then((res) => res.json())
      .then((data) => setIsAuthenticated(Boolean(data.authenticated)))
      .catch(() => setIsAuthenticated(false));
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100 dark:bg-neutral-950">
        <div className="text-sm font-mono font-bold">Checking admin session...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLoginModal onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold bg-white dark:bg-neutral-900 border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-transform"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Admin
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black flex items-center gap-2">
                <Globe className="w-6 h-6 text-orange-500" />
                Remote Admin Tunnel &amp; Telegram
              </h1>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                Zero-config remote access via Cloudflare Tunnel (`trycloudflare.com`)
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-2 border-black rounded-lg text-xs font-bold">
            <ShieldCheck className="w-4 h-4" />
            Tunnel-Safe: Admin Only
          </div>
        </div>

        <CloudSyncCard />
      </div>
    </div>
  );
}
