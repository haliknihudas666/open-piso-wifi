'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type PortalLang = 'en' | 'taglish';

const STORAGE_KEY = 'piso_portal_lang';

const TRANSLATIONS = {
  en: {
    defaultBanner: 'Fast & Affordable High-Speed Wi-Fi',
    speedTitle: 'Click to view live network speed report',
    freeTrialTitle: 'Daily Free Wi-Fi Trial',
    freeTrialDescPrefix: 'Get',
    freeTrialDescSuffix: 'of high-speed internet free today!',
    claimFreePrefix: 'Claim',
    claimFreeSuffix: 'Free',
    startInsertCoin: 'Start Insert Coin',
    insertCoinsAddTime: 'Insert Coins to Add Time',
    connectNow: 'Connect Now',
    addTimeNow: 'Add Time Now',
    waitingForCoins: 'Connect Now (Waiting for Coins...)',
    dropMoreOrConnect: 'Drop more coins or tap Connect Now',
    insertNowHint: 'Insert ₱1, ₱5, ₱10, or ₱20 coins into the slot now',
    cancel: 'Cancel',
    pauseTime: 'Pause Time (Freeze Timer)',
    resumeTime: 'Resume Time',
    dailyStreak: 'Daily Streak',
    streakSubtitle: 'Credit every day to earn free hours',
    yourCode: 'Your Code',
    dayStreak: 'Day Streak',
    daysStreak: 'Days Streak',
    streakSafe: 'Streak safe for tomorrow',
    streakKeep: 'Insert coin to keep streak',
    rewardRoadmap: 'Reward Roadmap',
    shareMyRewind: 'Share My Streak Rewind',
    voucherTitle: 'Voucher or Transfer Code',
    voucherSubtitle: 'Enter prepaid ticket or session transfer code',
    voucherHint: 'Switching Wi-Fi (2.4G ⇄ 5G) or devices? Paste your Session Transfer Code here.',
    voucherPlaceholder: 'e.g. VOUCH or PW-XXXXXX',
    voucherConnect: 'Connect',
    voucherExtend: 'Extend',
    ratesTitle: 'Wi-Fi Rates & Plans',
    ratesSubtitle: 'Coins stack time automatically',
    tapToTest: 'Tap to test rate',
    speedModalTitle: 'Live Speed Test',
    speedModalSubtitle: 'Automated Hourly Speed Benchmark',
    speedDownload: 'DOWNLOAD',
    speedUpload: 'UPLOAD',
    speedLatency: 'Latency (Ping):',
    speedCta: 'Insert Coins to Enjoy Speed',
    langLabel: 'Language',
  },
  taglish: {
    defaultBanner: 'Mabilis at Sulit na High-Speed Piso-WiFi',
    speedTitle: 'I-click para makita ang live speed test',
    freeTrialTitle: 'Libreng Wi-Fi Trial Ngayong Araw',
    freeTrialDescPrefix: 'Makakuha ng',
    freeTrialDescSuffix: 'na libreng mabilis na internet ngayon!',
    claimFreePrefix: 'Kunin ang',
    claimFreeSuffix: 'Libre',
    startInsertCoin: 'Mag-hulog ng Barya',
    insertCoinsAddTime: 'Mag-hulog Para Magdagdag ng Oras',
    connectNow: 'Mag-connect Na',
    addTimeNow: 'Idagdag ang Oras',
    waitingForCoins: 'Mag-connect Na (Naghihintay ng Barya...)',
    dropMoreOrConnect: 'Mag-hulog pa ng barya o pindutin ang Mag-connect Na',
    insertNowHint: 'Mag-hulog na ng ₱1, ₱5, ₱10, o ₱20 sa coin slot',
    cancel: 'Kanselahin',
    pauseTime: 'I-pause ang Oras (I-freeze)',
    resumeTime: 'I-resume ang Oras',
    dailyStreak: 'Araw-araw na Streak',
    streakSubtitle: 'Mag-hulog araw-araw para sa libreng oras',
    yourCode: 'Code Mo',
    dayStreak: 'Araw na Streak',
    daysStreak: 'Araw na Streak',
    streakSafe: 'Safe ang streak mo hanggang bukas',
    streakKeep: 'Mag-hulog para tuloy ang streak',
    rewardRoadmap: 'Mga Libreng Reward',
    shareMyRewind: 'I-share ang Streak Rewind Ko',
    voucherTitle: 'Voucher o Transfer Code',
    voucherSubtitle: 'Ilagay ang voucher ticket o session transfer code',
    voucherHint: 'Lumipat ng Wi-Fi (2.4G ⇄ 5G) o cellphone? I-paste dito ang Session Transfer Code mo.',
    voucherPlaceholder: 'hal. VOUCH o PW-XXXXXX',
    voucherConnect: 'Kumonekta',
    voucherExtend: 'Dagdagan',
    ratesTitle: 'Presyo at Oras ng Wi-Fi',
    ratesSubtitle: 'Awtomatikong naiipon ang oras sa bawat barya',
    tapToTest: 'Pindutin para i-test',
    speedModalTitle: 'Live na Speed Test',
    speedModalSubtitle: 'Awtomatikong Speed Check Bawat Oras',
    speedDownload: 'DOWNLOAD',
    speedUpload: 'UPLOAD',
    speedLatency: 'Latency (Ping):',
    speedCta: 'Mag-hulog ng Barya Para Mag-internet',
    langLabel: 'Wika',
  },
} as const;

export type PortalTranslationKey = keyof typeof TRANSLATIONS.en;

interface PortalLanguageContextValue {
  lang: PortalLang;
  setLang: (next: PortalLang) => void;
  t: (key: PortalTranslationKey) => string;
}

const PortalLanguageContext = createContext<PortalLanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => TRANSLATIONS.en[key],
});

export function PortalLanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<PortalLang>('en');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'taglish') {
        setLangState(saved);
      }
    } catch {}
  }, []);

  const setLang = (next: PortalLang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };

  const t = (key: PortalTranslationKey): string => TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key];

  return (
    <PortalLanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </PortalLanguageContext.Provider>
  );
}

export function usePortalLanguage() {
  return useContext(PortalLanguageContext);
}
