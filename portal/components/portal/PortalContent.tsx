'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { CoinPoller } from '@/components/portal/CoinPoller';
import { VoucherInput } from '@/components/portal/VoucherInput';
import { PricingTiers } from '@/components/portal/PricingTiers';
import { ActiveSessionCard } from '@/components/portal/ActiveSessionCard';
import { BannedDeviceCard } from '@/components/portal/BannedDeviceCard';
import { AnnouncementTicker } from '@/components/portal/AnnouncementTicker';
import { FreeTrialBanner } from '@/components/portal/FreeTrialBanner';
import { SuccessConnectModal } from '@/components/portal/SuccessConnectModal';
import { LoyaltyStreakCard } from '@/components/portal/LoyaltyStreakCard';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, Sparkles, X, RefreshCw, ArrowRight, WifiOff, Moon, Flame } from 'lucide-react';
import {
  getStoredSessionToken,
  setStoredSessionToken,
  getStoredSessionCode,
  setStoredSessionCode,
} from '@/lib/safe-storage';

const sessionFetcher = (url: string) => {
  const token = getStoredSessionToken();
  const code = getStoredSessionCode();
  const headers: HeadersInit = {
    ...(token ? { 'x-session-token': token } : {}),
    ...(code ? { 'x-session-code': code } : {}),
  };
  return fetch(url, { headers }).then((res) => res.json());
};

const defaultFetcher = (url: string) => fetch(url).then((res) => res.json());

export interface PortalContentProps {
  previewMode?: boolean;
  previewState?: 'standby' | 'active' | 'credited' | 'connected' | 'session';
  previewTitle?: string;
  previewSsid?: string;
  previewIp?: string;
  previewRates?: string;
  isEmbed?: boolean;
}

export function PortalContent({
  previewMode = false,
  previewState,
  previewTitle,
  previewSsid,
  previewIp,
  previewRates,
  isEmbed = false,
}: PortalContentProps = {}) {
  const searchParams = useSearchParams();
  const queryEmbed = searchParams?.get('embed') === '1' || searchParams?.get('embed') === 'true' || isEmbed;
  const effectiveState = (searchParams?.get('state') as any) || previewState || 'standby';
  const effectiveTitle = searchParams?.get('title') || previewTitle;
  const effectiveSsid = searchParams?.get('ssid') || previewSsid;
  const effectiveIp = searchParams?.get('ip') || previewIp;

  const isSimConnected = effectiveState === 'connected';
  const isSimSession = effectiveState === 'session';
  const isSimActive = effectiveState === 'active';
  const isSimCredited = effectiveState === 'credited';

  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(isSimConnected);
  const [isTransferring, setIsTransferring] = useState(false);
  const [modalDetails, setModalDetails] = useState<{ remainingMinutes: number; message?: string }>({
    remainingMinutes: 10,
  });

  // Extract potential MAC or IP hints passed from OpenWrt redirect parameters
  const queryMac = searchParams?.get('mac') || searchParams?.get('client_mac') || searchParams?.get('tok') || '';
  const queryIp = searchParams?.get('ip') || '';

  // Poll current session state with sessionToken persistence
  const { data: sessionData, mutate: mutateSession } = useSWR('/api/session', sessionFetcher, {
    refreshInterval: 4000,
    revalidateOnFocus: true,
  });

  // Keep session token and permanent session code in sync across localStorage, cookies, and memory
  React.useEffect(() => {
    if (sessionData?.sessionToken) {
      setStoredSessionToken(sessionData.sessionToken);
    }
    if (sessionData?.sessionCode || sessionData?.transferCode) {
      setStoredSessionCode(sessionData.sessionCode || sessionData.transferCode);
    }
  }, [sessionData?.sessionToken, sessionData?.sessionCode, sessionData?.transferCode]);

  // Streak Milestone Celebration Banner State
  const [streakBonusNotice, setStreakBonusNotice] = useState<{
    bonusMinutes: number;
    rewardName: string;
    streakDays: number;
  } | null>(null);

  // Direct Layer 2 Safety Redirect: If user opened portal via 10.0.0.1 (which OpenWrt SNATs)
  // or an external probe host (like conn-service-us-04.allawnos.com), redirect to direct portal IP
  // so the server accurately detects the client's Layer 2 MAC address!
  React.useEffect(() => {
    if (queryEmbed) return; // Skip redirect if embedded in phone mockup / iframe / instructions!
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname.toLowerCase();
      if (
        hostname === '10.0.0.1' ||
        (!hostname.includes('192.168.') &&
          !hostname.includes('10.') &&
          !hostname.includes('wifi.local') &&
          !hostname.includes('localhost') &&
          hostname !== '127.0.0.1')
      ) {
        const targetIp = sessionData?.portalIp || '192.168.1.240';
        const targetPort = sessionData?.portalPort || '3000';
        const targetUrl = targetPort === '80' ? `http://${targetIp}/` : `http://${targetIp}:${targetPort}/`;
        if (window.location.href !== targetUrl) {
          window.location.replace(targetUrl);
        }
      }
    }
  }, [sessionData?.portalIp, sessionData?.portalPort, queryEmbed]);

  // Poll current coins state for active pulses & rate tiers
  const { data: coinsData, mutate: mutateCoins } = useSWR('/api/coins', defaultFetcher, {
    refreshInterval: 1000,
  });

  const ip = effectiveIp || queryIp || sessionData?.ip || '192.168.1.240';
  const mac = sessionData?.macAddress || queryMac || '';
  const isAuthenticated = isSimSession || (sessionData?.isAuthenticated || false);
  const isPaused = isSimSession ? false : (sessionData?.isPaused || false);
  const isVip = isSimSession ? false : (sessionData?.isVip || false);
  const isBlacklisted = sessionData?.isBlacklisted || false;
  const blacklistNotes = sessionData?.blacklistNotes;
  const deviceName = sessionData?.deviceName;
  const remainingSeconds = isSimSession ? 585 : (sessionData?.remainingSeconds || 0);
  const ratesConfig = coinsData?.ratesConfig || sessionData?.ratesConfig;
  const isRatesLoading = !coinsData && !sessionData;
  const portalTitle = effectiveTitle || sessionData?.portalTitle || 'OpenPisoWiFi';
  const displaySsid = effectiveSsid || sessionData?.ssid;
  const bannerMessage =
    sessionData?.bannerMessage || 'Fast & Affordable High-Speed Wi-Fi for everyone.';
  const announcement = sessionData?.announcement;
  const allowPauseTime = sessionData?.allowPauseTime ?? true;
  const eligibleForFreeTrial = isSimSession ? false : (sessionData?.eligibleForFreeTrial ?? false);
  const freeTrialMinutes = sessionData?.freeTrialMinutes || 5;
  const showCoinSimulator = Boolean(
    sessionData?.showCoinSimulator ?? coinsData?.showCoinSimulator ?? false
  );

  const handleConnectSuccess = (data: any) => {
    if (data?.sessionToken) {
      setStoredSessionToken(data.sessionToken);
    }
    if (data?.sessionCode || data?.transferCode) {
      setStoredSessionCode(data.sessionCode || data.transferCode);
    }
    if (data?.bonusMinutesAdded > 0) {
      setStreakBonusNotice({
        bonusMinutes: data.bonusMinutesAdded,
        rewardName: data.loyaltyReward?.rewardName || 'Streak Milestone Bonus',
        streakDays: data.streak?.currentStreak || 3,
      });
    }
    setSuccessBanner(data.message || 'Connected successfully! Enjoy your internet access.');
    const minutes =
      data.remainingMinutes ||
      data.durationAddedMinutes ||
      Math.max(1, Math.round((data.session?.remainingSeconds || 600) / 60));
    setModalDetails({
      remainingMinutes: minutes,
      message: data.message,
    });
    setShowSuccessModal(true);
    mutateSession();
    mutateCoins();
  };

  const handleSelectTier = async (amount: number) => {
    try {
      await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'simulate', amount }),
      });
      await mutateCoins();
    } catch (err) {
      console.error('Error simulating rate tier coin:', err);
    }
  };

  const handleQuickTransfer = async (code: string) => {
    setIsTransferring(true);
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucherCode: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to transfer session');
      handleConnectSuccess(data);
    } catch (err: any) {
      alert(err.message || 'Transfer failed. Please try entering your transfer code manually.');
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4 relative z-10">
      {/* Announcement Marquee */}
      {announcement && <AnnouncementTicker text={announcement} />}

      {/* Header with Theme Toggle & Integrated Device Info */}
      <PortalHeader
        title={portalTitle}
        bannerMessage={bannerMessage}
        ip={ip}
        mac={mac}
        isConnected={isAuthenticated || isVip}
        ssid={displaySsid}
      />

      {/* Real-time ISP Outage Guard Banner */}
      {coinsData?.isWanOnline === false && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#ff5f57] text-black border-2 border-black shadow-neo font-bold text-xs animate-in fade-in slide-in-from-top-2">
          <WifiOff className="w-5 h-5 shrink-0 text-black mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-extrabold text-sm uppercase tracking-wide">Internet Outage Detected</div>
            <p className="text-xs font-semibold leading-relaxed">
              The vendo internet connection is temporarily offline. Coinslot is inhibited to protect your coins. Please check back shortly.
            </p>
          </div>
        </div>
      )}

      {/* Night Owl / Happy Hour Promo Banner */}
      {coinsData?.isPromoActive && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#c084fc] text-black border-2 border-black shadow-neo font-extrabold text-xs animate-in fade-in slide-in-from-top-2">
          <Moon className="w-5 h-5 shrink-0 text-black fill-black/20" />
          <div className="flex-1 leading-snug">
            <span className="uppercase tracking-wider font-black">🌙 Night Owl Promo Active!</span>
            <p className="text-[11px] font-bold opacity-90">Enjoy bonus time and special rates until {coinsData?.promoEndHour ? `${coinsData.promoEndHour}:00 AM` : '6:00 AM'}!</p>
          </div>
        </div>
      )}

      {/* Banned Device Card when Blacklisted */}
      {isBlacklisted && (
        <BannedDeviceCard
          macAddress={mac}
          deviceName={deviceName}
          notes={blacklistNotes}
          onRefresh={() => mutateSession()}
        />
      )}

      {/* Success Alert Notification */}
      {successBanner && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-[#4ade80] text-black border-2 border-black shadow-neo font-bold text-xs animate-in fade-in slide-in-from-top-2">
          <Sparkles className="w-5 h-5 shrink-0 text-black" />
          <div className="flex-1 leading-snug">{successBanner}</div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="p-1 rounded bg-black text-white hover:opacity-80 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Streak Milestone Bonus Celebration Alert */}
      {streakBonusNotice && (
        <div className="p-4 rounded-2xl bg-[#ffe17c] text-black border-2 border-black shadow-neo space-y-2 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-black">
              <Flame className="w-5 h-5 text-orange-600 fill-orange-600 animate-bounce" />
              🔥 STREAK MILESTONE UNLOCKED!
            </span>
            <button
              onClick={() => setStreakBonusNotice(null)}
              className="p-1 rounded bg-black text-white hover:opacity-85 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs font-bold text-black leading-snug">
            You hit a <strong>{streakBonusNotice.streakDays}-Day Streak</strong> and unlocked{' '}
            <strong>+{streakBonusNotice.bonusMinutes} Free Bonus Minutes</strong> ({streakBonusNotice.rewardName})! Your bonus time was credited automatically.
          </p>
        </div>
      )}

      {/* 1-Tap Band Transfer Banner (When switching between 2.4G & 5G SSIDs) */}
      {!isAuthenticated && !isPaused && !isVip && !isBlacklisted && sessionData?.candidateTransfer && (
        <div className="p-3.5 rounded-xl bg-[#fffde6] dark:bg-[#1a231d] border-2 border-black dark:border-[#ffe17c] shadow-neo space-y-2.5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-black dark:text-[#ffe17c]">
              <RefreshCw className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
              Switching Wi-Fi Bands (2.4G ⇄ 5G)?
            </span>
            <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded bg-black text-[#ffe17c] border border-black">
              {sessionData.candidateTransfer.transferCode}
            </span>
          </div>
          <p className="text-xs font-semibold text-neutral-700 dark:text-[#b7c6c2] leading-snug">
            Active session found for <strong>{sessionData.candidateTransfer.deviceName}</strong> with{' '}
            <strong className="text-black dark:text-[#ffe17c]">{sessionData.candidateTransfer.remainingMinutes}m remaining</strong>.
          </p>
          <Button
            onClick={() => handleQuickTransfer(sessionData.candidateTransfer.transferCode)}
            isLoading={isTransferring}
            size="sm"
            className="w-full text-xs font-black bg-[#4ade80] hover:bg-[#3ec470] text-black shadow-neo-sm flex items-center justify-center gap-1.5"
          >
            <span>Transfer & Connect Now ({sessionData.candidateTransfer.remainingMinutes} mins)</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Free Trial Banner (when eligible) */}
      {!isAuthenticated && !isPaused && !isVip && !isBlacklisted && eligibleForFreeTrial && (
        <FreeTrialBanner
          minutes={freeTrialMinutes}
          onClaimSuccess={(data) => {
            handleConnectSuccess(data);
          }}
        />
      )}

      {/* Active Session Countdown or Paused Card (if connected/paused/vip) */}
      {(isAuthenticated || isPaused || isVip) && (
        <ActiveSessionCard
          initialRemainingSeconds={remainingSeconds}
          endTime={sessionData?.session?.endTime}
          transferCode={isSimSession ? 'PW-GDQLWK' : (sessionData?.transferCode || sessionData?.session?.transferCode)}
          isPaused={isPaused}
          isVip={isVip}
          allowPauseTime={allowPauseTime}
          onSessionExpired={() => {
            mutateSession();
          }}
          onStateChange={() => {
            mutateSession();
          }}
        />
      )}

      {/* Customer Daily Streak & Loyalty Card (Hidden for Blacklisted & VIP) */}
      {!isBlacklisted && !isVip && (
        <LoyaltyStreakCard
          loyalty={sessionData?.loyalty}
          sessionCode={sessionData?.sessionCode || sessionData?.transferCode}
        />
      )}

      {/* Insert Coin Poller Section (Hidden for VIP Whitelist Devices) */}
      {!isBlacklisted && !isVip && (
        <CoinPoller
          onConnectSuccess={handleConnectSuccess}
          isConnected={isAuthenticated}
          macHint={queryMac}
          showSimulator={showCoinSimulator}
          simulatedState={isSimActive ? 'active' : isSimCredited ? 'credited' : undefined}
          simulatedPulses={isSimCredited ? 1 : undefined}
        />
      )}

      {/* Voucher Code Redemption Section (Hidden for VIP Whitelist Devices) */}
      {!isBlacklisted && !isVip && (
        <VoucherInput
          onRedeemSuccess={handleConnectSuccess}
          isConnected={isAuthenticated}
          macHint={queryMac}
        />
      )}

      {/* Pricing Tiers Section (Hidden for VIP Whitelist Devices) */}
      {!isBlacklisted && !isVip && (
        <PricingTiers
          rates={ratesConfig}
          isLoading={isRatesLoading}
          activePulses={coinsData?.pulses || 0}
          onSelectTier={showCoinSimulator ? handleSelectTier : undefined}
        />
      )}

      {/* Success Automatic Connectivity & Latency Probe Modal */}
      <SuccessConnectModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        remainingMinutes={modalDetails.remainingMinutes}
        message={modalDetails.message}
        disableRedirect={queryEmbed}
        isEmbed={queryEmbed}
      />

      {/* Footer Info */}
      <footer className="pt-6 pb-8 text-center text-xs text-neutral-500 dark:text-[#b7c6c2] space-y-1.5 font-medium">
        <div className="flex items-center justify-center gap-1.5 text-black dark:text-white font-extrabold">
          <ShieldCheck className="w-4 h-4 text-black dark:text-[#ffe17c]" />
          <span>Powered by {portalTitle}</span>
        </div>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Fast & Secure Wi-Fi
        </p>
      </footer>
    </div>
  );
}
