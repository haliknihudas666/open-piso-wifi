'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PortalContent, PortalContentProps } from '@/components/portal/PortalContent';

export { PortalContent };
export type { PortalContentProps };

function LandingPageWrapper() {
  const searchParams = useSearchParams();
  const isEmbed = searchParams?.get('embed') === '1' || searchParams?.get('embed') === 'true';

  if (isEmbed) {
    return (
      <div className="w-full max-w-md mx-auto p-2 bg-[#f6f4ea] dark:bg-[#111613] text-black dark:text-white">
        <PortalContent isEmbed={true} />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-dot-grid flex flex-col items-center justify-start p-4 sm:p-6 select-none bg-[#f6f4ea] dark:bg-[#111613] text-black dark:text-white transition-colors duration-150">
      <PortalContent />
    </main>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-md mx-auto text-center py-20 font-bold text-neutral-500">Loading Paywall Portal...</div>}>
      <LandingPageWrapper />
    </Suspense>
  );
}
