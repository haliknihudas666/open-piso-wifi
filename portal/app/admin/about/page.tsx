'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart, Sparkles } from 'lucide-react';
import { AboutProjectCard } from '@/components/admin/AboutProjectCard';

export default function AdminAboutPage() {
  return (
    <div className="min-h-screen bg-[#f6f4ea] dark:bg-[#171e19] text-black dark:text-white p-4 sm:p-8 font-sans antialiased transition-colors">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation Header */}
        <header className="bg-[#ffe17c] text-black border-2 border-black p-4 sm:p-5 rounded-2xl shadow-[6px_6px_0px_0px_#000000] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2.5 bg-black text-white border-2 border-black rounded-xl hover:bg-neutral-800 transition-colors shadow-[2px_2px_0px_0px_#000000] flex items-center justify-center group"
              title="Return to Admin Dashboard"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-black bg-black text-[#ffe17c] rounded uppercase tracking-wider">
                  Open Source
                </span>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                  <span>About OpenPisoWiFi</span>
                  <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                </h1>
              </div>
              <p className="text-xs sm:text-sm font-bold text-neutral-800 mt-0.5">
                Official project links, community guides, and open source repositories
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <Link
              href="/admin"
              className="py-2 px-3.5 bg-white text-black font-black text-xs sm:text-sm border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_#000000] hover:translate-x-0.5 hover:translate-y-0.5 transition-transform flex items-center gap-1.5"
            >
              <span>← Back to Dashboard</span>
            </Link>
          </div>
        </header>

        {/* Core About Cards */}
        <main>
          <AboutProjectCard />
        </main>
      </div>
    </div>
  );
}
