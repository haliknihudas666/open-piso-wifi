/**
 * Instruction Poster & Tarpaulin Generator
 * Handles copy in English & Taglish, SVG vector layout generation,
 * and high-resolution Canvas export for A4 paper and large tarpaulins.
 */

export type PosterLanguage = 'taglish' | 'english' | 'dual';
export type PosterFormat =
  | 'a4-portrait'
  | 'a4-landscape'
  | 'tarpaulin-vertical'
  | 'tarpaulin-horizontal'
  | 'tent-card';

export type PosterLayout = 'grid-2col' | 'vertical-stack';

export type PosterVisualMode = 'dynamic-phone' | 'raw-components' | 'illustrated';

export interface PosterConfig {
  title: string;
  tagline: string;
  ssid2g: string;
  ssid5g: string;
  portalIp: string;
  language: PosterLanguage;
  format: PosterFormat;
  layout: PosterLayout;
  visualMode: PosterVisualMode;
  accentColor: string; // e.g. '#ffe17c' (yellow), '#4ade80' (green), '#38bdf8' (cyan), '#fb923c' (orange)
  showRates: boolean;
  ratesText: string;
  showSessionCodeTip: boolean;
  showPhoneGallery: boolean;
  storeNote: string;
}

export interface FormatMetadata {
  id: PosterFormat;
  label: string;
  name: string;
  dimensions: string;
  description: string;
  containerClass: string;
  defaultCols: number;
  borderStyle: string;
  printSize: string;
  badgeText: string;
}

export const POSTER_FORMATS: Record<PosterFormat, FormatMetadata> = {
  'a4-portrait': {
    id: 'a4-portrait',
    label: '📄 A4 Paper (Portrait · 210×297mm)',
    name: 'A4 Portrait',
    dimensions: '210 × 297 mm',
    description: 'Standard single-page flyer or wall bulletin guide',
    containerClass: 'max-w-[860px]',
    defaultCols: 2,
    borderStyle: 'border-4 border-black',
    printSize: 'A4 portrait',
    badgeText: '📄 A4 PORTRAIT · 210 × 297 mm',
  },
  'a4-landscape': {
    id: 'a4-landscape',
    label: '📄 A4 Paper (Landscape · 297×210mm)',
    name: 'A4 Landscape',
    dimensions: '297 × 210 mm',
    description: 'Wide single-page horizontal poster with 3-column steps',
    containerClass: 'max-w-[1140px]',
    defaultCols: 3,
    borderStyle: 'border-4 border-black',
    printSize: 'A4 landscape',
    badgeText: '📄 A4 LANDSCAPE · 297 × 210 mm (3-COLUMN)',
  },
  'tarpaulin-vertical': {
    id: 'tarpaulin-vertical',
    label: '🚩 Outdoor Tarpaulin (Vertical · 2×3 ft)',
    name: 'Tarpaulin Vertical',
    dimensions: '2 × 3 ft (24 × 36 in)',
    description: 'High-visibility outdoor wall sign & street post banner',
    containerClass: 'max-w-[760px]',
    defaultCols: 2,
    borderStyle: 'border-8 border-black shadow-neo-xl ring-4 ring-black/20',
    printSize: 'portrait',
    badgeText: '🚩 TARPAULIN VERTICAL · 2 × 3 FT (24 × 36 IN)',
  },
  'tarpaulin-horizontal': {
    id: 'tarpaulin-horizontal',
    label: '🚩 Outdoor Tarpaulin (Horizontal · 4×2 ft)',
    name: 'Tarpaulin Horizontal',
    dimensions: '4 × 2 ft / 6 × 3 ft',
    description: 'Wide horizontal roadside or store fascia tarpaulin banner',
    containerClass: 'max-w-[1240px]',
    defaultCols: 3,
    borderStyle: 'border-8 border-black shadow-neo-xl ring-4 ring-black/20',
    printSize: 'landscape',
    badgeText: '🚩 TARPAULIN HORIZONTAL · 4 × 2 FT (WIDE BANNER)',
  },
  'tent-card': {
    id: 'tent-card',
    label: '🏷️ Table Tent Card / Counter Sticker (5×7 in)',
    name: 'Table Tent / Counter Card',
    dimensions: '5 × 7 in (A5 / Table Stand)',
    description: 'Cashier desk tent card with fold guide marker',
    containerClass: 'max-w-[540px]',
    defaultCols: 1,
    borderStyle: 'border-4 border-black',
    printSize: '5in 7in',
    badgeText: '🏷️ TABLE TENT CARD · 5 × 7 IN (CASHIER STAND)',
  },
};

export const DEFAULT_POSTER_CONFIG: PosterConfig = {
  title: 'Niconiellet Piso Wifi',
  tagline: 'Mabilis, Maaasahan at Murang High-Speed Fiber Internet • Low Ping Gaming',
  ssid2g: 'NiconielletPisoWifi',
  ssid5g: 'NiconielletPisoWifi_5G',
  portalIp: '10.0.0.1',
  language: 'taglish',
  format: 'a4-portrait',
  layout: 'grid-2col',
  visualMode: 'dynamic-phone',
  accentColor: '#ffe17c',
  showRates: true,
  ratesText: '₱1 = 10 Mins • ₱5 = 1 Hour • ₱10 = 2.5 Hours • ₱20 = 6 Hours',
  showSessionCodeTip: true,
  showPhoneGallery: false,
  storeNote: 'Para sa katanungan o voucher tickets, lumapit lamang sa tindahan / counter.',
};

export interface StepContent {
  stepNum: number;
  title: string;
  subtitle?: string;
  instructions: string[];
  badge: string;
  highlight?: string;
}

export function getPosterSteps(lang: 'taglish' | 'english', config: PosterConfig): StepContent[] {
  const ssidDisplay =
    config.ssid2g && config.ssid5g && config.ssid2g !== config.ssid5g
      ? `${config.ssid2g} / ${config.ssid5g}`
      : config.ssid2g || config.ssid5g || 'NiconielletPisoWifi';

  if (lang === 'taglish') {
    return [
      {
        stepNum: 1,
        title: 'Kumonekta sa Wi-Fi',
        subtitle: 'Connect to Wi-Fi SSID',
        instructions: [
          `Buksan ang Wi-Fi settings sa cellphone o laptop at piliin ang:`,
          `Walang password na kailangan! Kusa itong magbubukas ng login portal.`,
          `Kung hindi kusa mag-pop up: Buksan ang Chrome o Safari browser at pumunta sa address: ${config.portalIp} (o wifi.local).`,
        ],
        badge: 'HAKBANG 1',
        highlight: ssidDisplay,
      },
      {
        stepNum: 2,
        title: 'Pindutin ang "Start Insert Coin"',
        subtitle: 'Press Start Insert Coin Button',
        instructions: [
          `Sa portal screen, pindutin ang kulay dilaw na "Start Insert Coin" button.`,
          `Mag-a-activate at iilaw ang coinslot ng vendo. May 30 seconds timer ka para maghulog.`,
          `Tumatanggap ng ₱1, ₱5, ₱10, ₱20 coins (luma at bagong barya).`,
        ],
        badge: 'HAKBANG 2',
        highlight: 'Start Insert Coin',
      },
      {
        stepNum: 3,
        title: 'Ihulog ang Barya & Tingnan ang Oras',
        subtitle: 'Drop Coins & Verify Total Time',
        instructions: [
          `Ihulog ang iyong barya isa-isa sa machine slot.`,
          `Maririnig ang beep at agad lilitaw sa screen ang kabuuang halaga (₱) at oras ng internet.`,
          `Maaaring maghulog pa ng dagdag na barya habang tumatakbo ang countdown.`,
        ],
        badge: 'HAKBANG 3',
        highlight: '₱ Credited & Internet Time',
      },
      {
        stepNum: 4,
        title: 'Pindutin ang "Connect Now"',
        subtitle: 'Press Connect Now',
        instructions: [
          `Kapag kumpleto na ang naihulog mong barya at tama na ang iyong oras:`,
          `Pindutin ang itim na "Connect Now" button para simulan ang iyong koneksyon.`,
        ],
        badge: 'HAKBANG 4',
        highlight: 'Connect Now ➔',
      },
      {
        stepNum: 5,
        title: 'Konektado Ka Na! Start Browsing',
        subtitle: 'You are Connected! Enjoy Internet',
        instructions: [
          `Lalabas ang berde na popup na "You're Connected!".`,
          `Pindutin ang "Start Browsing" o i-tap ang "Done" sa itaas ng screen ng iyong cellphone.`,
          `Konektado ka na sa high-speed internet! Enjoy mag-stream, browse, at mag-online gaming!`,
        ],
        badge: 'HAKBANG 5',
        highlight: "You're Connected! 🎉",
      },
    ];
  }

  // English
  return [
    {
      stepNum: 1,
      title: 'Connect to Wi-Fi',
      subtitle: 'Select Wi-Fi Network',
      instructions: [
        `Turn on your device Wi-Fi and connect to:`,
        `No password needed! The captive portal will open automatically.`,
        `If the portal does not pop up: Open your browser (Chrome or Safari) and go to address: ${config.portalIp} (or wifi.local).`,
      ],
      badge: 'STEP 1',
      highlight: ssidDisplay,
    },
    {
      stepNum: 2,
      title: 'Press "Start Insert Coin"',
      subtitle: 'Activate Coin Slot Acceptor',
      instructions: [
        `On the portal screen, tap the yellow "Start Insert Coin" button.`,
        `The physical coin acceptor slot will activate and light up with a 30-second timer.`,
        `Accepts ₱1, ₱5, ₱10, ₱20 coins (both old and new Philippine coins).`,
      ],
      badge: 'STEP 2',
      highlight: 'Start Insert Coin',
    },
    {
      stepNum: 3,
      title: 'Insert Coins & Check Time',
      subtitle: 'Drop Coins & Verify Credited Time',
      instructions: [
        `Drop your coins one by one into the machine slot.`,
        `The machine will detect each coin and display your credited amount (₱) and equivalent time.`,
        `You can continue inserting more coins while the slot countdown is active.`,
      ],
      badge: 'STEP 3',
      highlight: '₱ Credited & Internet Time',
    },
    {
      stepNum: 4,
      title: 'Press "Connect Now"',
      subtitle: 'Activate Internet Access',
      instructions: [
        `Once you have finished inserting all your coins and are satisfied with your time:`,
        `Press the black "Connect Now" button to activate your high-speed internet access.`,
      ],
      badge: 'STEP 4',
      highlight: 'Connect Now ➔',
    },
    {
      stepNum: 5,
      title: "You're Connected! Start Browsing",
      subtitle: 'Browse Websites & Apps',
      instructions: [
        `The green "You're Connected!" popup modal will appear on your screen.`,
        `Tap "Start Browsing" or tap "Done" in your phone's header bar to start using the internet.`,
        `Congrats, you are now connected to high-speed internet! Enjoy streaming and low ping gaming!`,
      ],
      badge: 'STEP 5',
      highlight: "You're Connected! 🎉",
    },
  ];
}

export function getSessionCodeNotice(lang: 'taglish' | 'english') {
  if (lang === 'taglish') {
    return {
      title: '⭐ MAHALAGANG PAALALA: I-SAVE O I-SCREENSHOT ANG SESSION CODE!',
      badge: 'PRO-TIP / PAALALA',
      text: 'Pagkakonekta mo, tignan ang iyong SESSION TRANSFER CODE (halimbawa: PW-GDQLWK) at pindutin ang "Copy" o i-screenshot! Kung mawalan ng signal, mag-restart ang phone, lumipat sa 5GHz / 2.4GHz, o ilipat ang natitirang oras sa ibang cellphone o PC — i-paste lang ang code sa "Voucher or Transfer Code" box para maibalik ang iyong natitirang oras nang hindi nasasayang!',
    };
  }
  return {
    title: '⭐ IMPORTANT: ALWAYS COPY OR SCREENSHOT YOUR SESSION TRANSFER CODE!',
    badge: 'PRO-TIP / REMINDER',
    text: 'Once connected, check your SESSION TRANSFER CODE (e.g. PW-GDQLWK) and tap "Copy" or take a screenshot! If your phone disconnects, restarts, switches Wi-Fi bands (2.4G ⇄ 5G), or if you want to transfer your remaining minutes to another phone or laptop — simply paste this code under "Voucher or Transfer Code" to resume your session without losing minutes!',
  };
}

/**
 * Generates an SVG string representation of the poster.
 * Perfectly sized for high-DPI export or vector printing.
 */
export function generatePosterSvg(config: PosterConfig): string {
  let width = 1240;
  let height = 1754;
  const isLandscape = config.format === 'a4-landscape' || config.format === 'tarpaulin-horizontal';

  if (config.format === 'a4-landscape') {
    width = 1754;
    height = 1240;
  } else if (config.format === 'tarpaulin-horizontal') {
    width = 2400;
    height = 1200;
  } else if (config.format === 'tarpaulin-vertical') {
    width = 1200;
    height = 1800;
  } else if (config.format === 'tent-card') {
    width = 1050;
    height = 1485;
  }

  const primarySteps = getPosterSteps(config.language === 'english' ? 'english' : 'taglish', config);
  const sessionNotice = getSessionCodeNotice(config.language === 'english' ? 'english' : 'taglish');
  const accent = config.accentColor || '#ffe17c';

  const ssidDisplay =
    config.ssid2g && config.ssid5g && config.ssid2g !== config.ssid5g
      ? `${config.ssid2g}  •  ${config.ssid5g}`
      : config.ssid2g || config.ssid5g || 'NiconielletPisoWifi';

  const cols = config.layout === 'vertical-stack' ? 1 : isLandscape ? 3 : 2;
  const colWidth = (width - 96 - (cols - 1) * 24) / cols;
  const cardHeight = isLandscape ? 360 : 400;
  const rowHeight = isLandscape ? 385 : 420;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background-color: #f7f5ed; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <defs>
    <pattern id="dot-pattern" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.5" fill="#000000" opacity="0.09" />
    </pattern>
    <filter id="shadow-neo" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="5" dy="5" stdDeviation="0" flood-color="#000000" flood-opacity="1" />
    </filter>
    <filter id="shadow-neo-lg" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="8" dy="8" stdDeviation="0" flood-color="#000000" flood-opacity="1" />
    </filter>
  </defs>

  <!-- Background with Dot Grid -->
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f7f5ed" />
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#dot-pattern)" />

  <!-- Outer Border Frame -->
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="24" fill="none" stroke="#000000" stroke-width="5" />

  <!-- Header Banner -->
  <g transform="translate(48, 48)">
    <rect x="0" y="0" width="${width - 96}" height="170" rx="16" fill="${accent}" stroke="#000000" stroke-width="4" filter="url(#shadow-neo)" />
    
    <!-- Header Icon Pill -->
    <rect x="24" y="24" width="64" height="64" rx="12" fill="#ffffff" stroke="#000000" stroke-width="3" />
    <!-- Wifi SVG icon -->
    <path d="M 40 68 A 1 1 0 0 1 40 68 M 46 62 A 12 12 0 0 0 34 62 M 51 55 A 20 20 0 0 0 29 55 M 56 48 A 28 28 0 0 0 24 48" fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" />
    <circle cx="40" cy="70" r="3.5" fill="#000000" />

    <!-- Title & Brand -->
    <text x="106" y="58" font-size="36" font-weight="900" fill="#000000" letter-spacing="-0.5">
      ${escapeXml(config.title.toUpperCase())}
    </text>
    <text x="106" y="86" font-size="16" font-weight="700" fill="#222222">
      ${escapeXml(config.tagline)}
    </text>

    <!-- Subtitle Pill -->
    <rect x="24" y="106" width="340" height="38" rx="8" fill="#000000" />
    <text x="36" y="131" font-size="15" font-weight="800" fill="#ffffff" letter-spacing="1">
      ${config.language === 'english' ? 'HOW TO CONNECT TO WI-FI' : 'PAANO KUMONEKTA SA PISOWIFI'}
    </text>

    <!-- Quick Features -->
    <g transform="translate(${width - 480}, 30)">
      <rect x="0" y="0" width="360" height="110" rx="12" fill="#ffffff" stroke="#000000" stroke-width="3" />
      <text x="16" y="32" font-size="14" font-weight="800" fill="#000000">⚡ HIGH-SPEED FIBER INTERNET</text>
      <text x="16" y="60" font-size="14" font-weight="800" fill="#000000">🎮 LOW PING GAMING</text>
      <text x="16" y="88" font-size="14" font-weight="800" fill="#000000">🪙 ACCEPTS: ₱1, ₱5, ₱10, ₱20 COINS</text>
    </g>
  </g>

  <!-- Rates Marquee Strip (if enabled) -->
  ${config.showRates
      ? `
  <g transform="translate(48, 236)">
    <rect x="0" y="0" width="${width - 96}" height="48" rx="10" fill="#ffffff" stroke="#000000" stroke-width="3" filter="url(#shadow-neo)" />
    <rect x="0" y="0" width="130" height="48" rx="10" fill="#000000" />
    <text x="16" y="30" font-size="14" font-weight="900" fill="#ffffff" letter-spacing="1">RATES / PRESYO</text>
    <text x="146" y="30" font-size="16" font-weight="800" fill="#000000">${escapeXml(config.ratesText)}</text>
  </g>
  `
      : ''
    }

  <!-- Steps Cards: 2-Column Grid (1-2, 3-4, 5-6) or Vertical Stack -->
  ${
    config.layout !== 'vertical-stack'
      ? (() => {
          const startY = config.showRates ? 304 : 246;

          // Render steps 1 to 5
          const stepCardsSvg = primarySteps
            .map((step, idx) => {
              const col = idx % cols;
              const row = Math.floor(idx / cols);
              const x = 48 + col * (colWidth + 24);
              const y = startY + row * rowHeight;

              const isYellow = idx === 1; // Step 2 (Start Insert Coin)
              const isGreen = idx === 4; // Step 5 (Connected)
              const cardBg = isYellow ? '#fffbe8' : isGreen ? '#f0fdf4' : '#ffffff';
              const badgeBg = isYellow ? accent : isGreen ? '#4ade80' : '#000000';
              const badgeColor = isYellow || isGreen ? '#000000' : '#ffffff';

              return `
    <g transform="translate(${x}, ${y})">
      <rect x="0" y="0" width="${colWidth}" height="${cardHeight}" rx="16" fill="${cardBg}" stroke="#000000" stroke-width="3.5" filter="url(#shadow-neo)" />
      
      <!-- Step Badge -->
      <circle cx="48" cy="48" r="28" fill="${badgeBg}" stroke="#000000" stroke-width="3" />
      <text x="48" y="58" font-size="28" font-weight="900" fill="${badgeColor}" text-anchor="middle">${step.stepNum}</text>

      <!-- Step Header -->
      <text x="92" y="44" font-size="20" font-weight="900" fill="#000000">${escapeXml(step.title)}</text>
      ${step.subtitle ? `<text x="92" y="64" font-size="12" font-weight="700" fill="#666666">${escapeXml(step.subtitle)}</text>` : ''}

      <!-- Step Instructions on Left -->
      <g transform="translate(24, 100)">
        <text x="0" y="14" font-size="13" font-weight="600" fill="#222222">${escapeXml(step.instructions[0] || '')}</text>
        <text x="0" y="38" font-size="13" font-weight="600" fill="#222222">${escapeXml(step.instructions[1] || '')}</text>
        <text x="0" y="62" font-size="13" font-weight="700" fill="#000000">${escapeXml(step.instructions[2] || '')}</text>
      </g>

      <!-- Smartphone Embed on Right: Fixed 9:16 Ratio (140x248) -->
      <g transform="translate(${colWidth - 140 - 22}, 82)">
        <!-- Outer Phone Body -->
        <rect x="0" y="0" width="140" height="248" rx="20" fill="#000000" stroke="#000000" stroke-width="2.5" filter="url(#shadow-neo-sm)" />
        
        <!-- Speaker / Top Notch -->
        <rect x="48" y="5" width="44" height="4.5" rx="2.2" fill="#262626" />
        
        <!-- Screen (9:16) -->
        <rect x="5" y="14" width="130" height="226" rx="14" fill="#f6f4ea" />
        
        <!-- Status Bar -->
        <text x="12" y="27" font-size="7.5" font-weight="900" fill="#000000">8:14</text>
        <text x="102" y="27" font-size="7" font-weight="900" fill="#000000">5G ■</text>

        <!-- Browser Address Bar -->
        <rect x="5" y="32" width="130" height="22" fill="#242b26" />
        <text x="70" y="42" font-size="6" font-weight="700" fill="#a3a3a3" text-anchor="middle">Not Secure — ${config.portalIp}</text>
        <text x="70" y="50" font-size="7" font-weight="800" fill="#ffffff" text-anchor="middle">${escapeXml(config.title.slice(0, 16))}</text>

        <!-- Screen Content View -->
        <g transform="translate(11, 60)">
          <!-- Mini Portal Header -->
          <rect x="0" y="0" width="118" height="24" rx="5" fill="#ffffff" stroke="#000000" stroke-width="1.2" />
          <text x="6" y="12" font-size="6.5" font-weight="800" fill="#000000">${escapeXml(config.title.slice(0, 14))}</text>
          <rect x="88" y="4" width="24" height="9" rx="2" fill="#000000" />
          <text x="100" y="11" font-size="5.5" font-weight="800" fill="#4ade80" text-anchor="middle">ONLINE</text>
          <text x="6" y="20" font-size="5.5" font-weight="700" fill="#666666">${config.portalIp}</text>

          <!-- Step Specific Display in Phone Screen -->
          <rect x="0" y="30" width="118" height="126" rx="8" fill="#ffffff" stroke="#000000" stroke-width="1.5" />
          
          ${idx === 0 ? `
            <text x="59" y="52" font-size="8" font-weight="900" fill="#000000" text-anchor="middle">Coin Slot: STANDBY</text>
            <rect x="12" y="62" width="94" height="26" rx="6" fill="${accent}" stroke="#000000" stroke-width="1.5" />
            <text x="59" y="78" font-size="8.5" font-weight="900" fill="#000000" text-anchor="middle">Start Insert Coin</text>
            <text x="59" y="104" font-size="6.5" font-weight="700" fill="#666666" text-anchor="middle">Pindutin para maghulog</text>
            <text x="59" y="124" font-size="7" font-weight="800" fill="#000000" text-anchor="middle">₱1 = 10 Mins</text>
          ` : idx === 1 ? `
            <rect x="22" y="38" width="74" height="12" rx="3" fill="#4ade80" />
            <text x="59" y="47" font-size="6.5" font-weight="900" fill="#000000" text-anchor="middle">ACTIVE (29s)</text>
            <text x="59" y="64" font-size="7" font-weight="800" fill="#666666" text-anchor="middle">Hulog na ng barya!</text>
            <text x="59" y="86" font-size="16" font-weight="900" fill="#000000" text-anchor="middle">₱0.00</text>
            <text x="59" y="102" font-size="6.5" font-weight="800" fill="#166534" text-anchor="middle">₱1 • ₱5 • ₱10 • ₱20</text>
            <rect x="12" y="112" width="94" height="5" rx="2.5" fill="#4ade80" stroke="#000000" stroke-width="0.8" />
          ` : idx === 2 ? `
            <rect x="22" y="38" width="74" height="12" rx="3" fill="#4ade80" />
            <text x="59" y="47" font-size="6.5" font-weight="900" fill="#000000" text-anchor="middle">✓ DETECTED</text>
            <text x="59" y="64" font-size="6.5" font-weight="700" fill="#666666" text-anchor="middle">TOTAL COINS INSERTED</text>
            <text x="59" y="86" font-size="16" font-weight="900" fill="#000000" text-anchor="middle">₱5.00</text>
            <rect x="12" y="98" width="94" height="16" rx="4" fill="${accent}" stroke="#000000" stroke-width="1" />
            <text x="59" y="110" font-size="7" font-weight="900" fill="#000000" text-anchor="middle">⚡ Time: 1 Hour</text>
          ` : idx === 3 ? `
            <text x="59" y="48" font-size="7.5" font-weight="800" fill="#666666" text-anchor="middle">Ready to Connect: ₱5</text>
            <rect x="14" y="56" width="90" height="20" rx="4" fill="#f4f4f4" stroke="#000000" stroke-width="1" />
            <text x="59" y="70" font-size="8" font-weight="900" fill="#000000" text-anchor="middle">01 Hour : 00 Mins</text>
            <rect x="12" y="86" width="94" height="26" rx="6" fill="#000000" />
            <text x="59" y="102" font-size="8.5" font-weight="900" fill="#ffffff" text-anchor="middle">Connect Now ➔</text>
            <text x="59" y="126" font-size="6" font-weight="700" fill="#666666" text-anchor="middle">Pindutin para mag-surf</text>
          ` : `
            <rect x="14" y="38" width="90" height="13" rx="3" fill="#4ade80" />
            <text x="59" y="47" font-size="6.5" font-weight="900" fill="#000000" text-anchor="middle">CONNECTED • 00:59:45</text>
            <text x="59" y="64" font-size="6" font-weight="800" fill="#666666" text-anchor="middle">SESSION CODE</text>
            <rect x="14" y="70" width="90" height="18" rx="4" fill="#000000" />
            <text x="59" y="83" font-size="9" font-weight="900" fill="${accent}" font-family="monospace" text-anchor="middle">PW-GDQLWK</text>
            <rect x="12" y="98" width="94" height="22" rx="5" fill="#4ade80" stroke="#000000" stroke-width="1.2" />
            <text x="59" y="112" font-size="7.5" font-weight="900" fill="#000000" text-anchor="middle">Start Browsing ➔</text>
          `}
        </g>
      </g>
    </g>
              `;
            })
            .join('\n');

          // Card 6: Session Code Reminder in slot 6 (col = 5 % cols, row = Math.floor(5 / cols))
          const card6Col = 5 % cols;
          const card6Row = Math.floor(5 / cols);
          const card6X = 48 + card6Col * (colWidth + 24);
          const card6Y = startY + card6Row * rowHeight;
          const card6Svg = config.showSessionCodeTip
            ? `
    <g transform="translate(${card6X}, ${card6Y})">
      <rect x="0" y="0" width="${colWidth}" height="${cardHeight}" rx="16" fill="#faf5ff" stroke="#000000" stroke-width="3.5" filter="url(#shadow-neo-lg)" />
      
      <!-- Badge -->
      <circle cx="48" cy="48" r="28" fill="#c084fc" stroke="#000000" stroke-width="3" />
      <text x="48" y="58" font-size="28" font-weight="900" fill="#000000" text-anchor="middle">6</text>

      <!-- Header -->
      <text x="92" y="44" font-size="20" font-weight="900" fill="#000000">${config.language === 'english' ? 'Save Session Code!' : 'I-save ang Session Code'}</text>
      <text x="92" y="64" font-size="12" font-weight="800" fill="#7c3aed">⭐ MAHALAGANG PAALALA / PRO-TIP</text>

      <!-- Instructions on Left -->
      <g transform="translate(24, 100)">
        <text x="0" y="14" font-size="12.5" font-weight="600" fill="#222222">${config.language === 'english' ? 'Always copy or screenshot your SESSION CODE!' : 'Kopyahin o i-screenshot ang inyong SESSION CODE!'}</text>
        <text x="0" y="38" font-size="12.5" font-weight="600" fill="#222222">${config.language === 'english' ? 'If you switch bands (2.4G ⇄ 5G), reboot phone:' : 'Kung magpalit ng band (2.4G ⇄ 5G), restart:'}</text>
        <text x="0" y="62" font-size="12.5" font-weight="700" fill="#000000">${config.language === 'english' ? '✔ Paste code on portal to restore remaining time!' : '✔ I-paste ang code sa portal para magamit ulit!'}</text>
      </g>

      <!-- Smartphone Embed on Right: Fixed 9:16 Ratio (140x248) -->
      <g transform="translate(${colWidth - 140 - 22}, 82)">
        <rect x="0" y="0" width="140" height="248" rx="20" fill="#000000" stroke="#000000" stroke-width="2.5" filter="url(#shadow-neo-sm)" />
        <rect x="48" y="5" width="44" height="4.5" rx="2.2" fill="#262626" />
        <rect x="5" y="14" width="130" height="226" rx="14" fill="#faf5ff" />
        
        <text x="12" y="27" font-size="7.5" font-weight="900" fill="#000000">8:14</text>
        <text x="102" y="27" font-size="7" font-weight="900" fill="#000000">5G ■</text>

        <rect x="5" y="32" width="130" height="22" fill="#242b26" />
        <text x="70" y="42" font-size="6" font-weight="700" fill="#a3a3a3" text-anchor="middle">Not Secure — ${config.portalIp}</text>
        <text x="70" y="50" font-size="7" font-weight="800" fill="#ffffff" text-anchor="middle">${escapeXml(config.title.slice(0, 16))}</text>

        <g transform="translate(11, 60)">
          <rect x="0" y="0" width="118" height="24" rx="5" fill="#ffffff" stroke="#000000" stroke-width="1.2" />
          <text x="6" y="12" font-size="6.5" font-weight="800" fill="#000000">Session Security</text>
          <rect x="80" y="4" width="32" height="9" rx="2" fill="#c084fc" />
          <text x="96" y="11" font-size="5.5" font-weight="800" fill="#000000" text-anchor="middle">PRO-TIP</text>
          <text x="6" y="20" font-size="5.5" font-weight="700" fill="#666666">Transfer Code</text>

          <rect x="0" y="30" width="118" height="126" rx="8" fill="#ffffff" stroke="#000000" stroke-width="1.5" />
          <text x="59" y="46" font-size="6" font-weight="800" fill="#6b21a8" text-anchor="middle">SESSION TRANSFER CODE</text>
          
          <rect x="10" y="54" width="98" height="24" rx="5" fill="#000000" />
          <text x="59" y="70" font-size="12" font-weight="900" fill="${accent}" font-family="monospace" text-anchor="middle">PW-GDQLWK</text>
          
          <rect x="10" y="86" width="98" height="16" rx="4" fill="#c084fc" stroke="#000000" stroke-width="1" />
          <text x="59" y="97" font-size="6.5" font-weight="900" fill="#000000" text-anchor="middle">📋 I-SAVE O I-SCREENSHOT</text>

          <rect x="10" y="108" width="98" height="18" rx="4" fill="#4ade80" stroke="#000000" stroke-width="1" />
          <text x="59" y="120" font-size="6.5" font-weight="900" fill="#000000" text-anchor="middle">Start Browsing ➔</text>
        </g>
      </g>
    </g>
            `
            : '';

          return stepCardsSvg + '\n' + card6Svg;
        })()
      : `
  <!-- Vertical Stack 5 Cards -->
  <g transform="translate(48, ${config.showRates ? 304 : 246})">
    ${primarySteps
      .map((step, idx) => {
        const y = idx * 190;
        const isYellow = idx === 1;
        const isGreen = idx === 4;
        const cardBg = isYellow ? '#fffbe8' : isGreen ? '#f0fdf4' : '#ffffff';
        const badgeBg = isYellow ? accent : isGreen ? '#4ade80' : '#000000';
        const badgeColor = isYellow || isGreen ? '#000000' : '#ffffff';

        return `
    <g transform="translate(0, ${y})">
      <rect x="0" y="0" width="${width - 96}" height="172" rx="14" fill="${cardBg}" stroke="#000000" stroke-width="3.5" filter="url(#shadow-neo)" />
      
      <circle cx="56" cy="86" r="36" fill="${badgeBg}" stroke="#000000" stroke-width="3.5" />
      <text x="56" y="98" font-size="34" font-weight="900" fill="${badgeColor}" text-anchor="middle">${step.stepNum}</text>

      <text x="110" y="44" font-size="22" font-weight="900" fill="#000000">${escapeXml(step.title)}</text>
      ${step.subtitle ? `<text x="110" y="66" font-size="13" font-weight="700" fill="#555555">${escapeXml(step.subtitle)}</text>` : ''}

      <g transform="translate(110, 88)">
        <text x="0" y="12" font-size="14" font-weight="600" fill="#111111">${escapeXml(step.instructions[0] || '')}</text>
        <text x="0" y="34" font-size="14" font-weight="600" fill="#111111">${escapeXml(step.instructions[1] || '')}</text>
        <text x="0" y="56" font-size="14" font-weight="700" fill="#000000">${escapeXml(step.instructions[2] || '')}</text>
      </g>

      <g transform="translate(${width - 360}, 20)">
        <rect x="0" y="0" width="240" height="96" rx="10" fill="#ffffff" stroke="#000000" stroke-width="2.5" />
        <rect x="8" y="8" width="224" height="24" rx="6" fill="#f4f4f4" stroke="#000000" stroke-width="1.5" />
        <text x="16" y="24" font-size="10" font-weight="800" fill="#444444" font-family="monospace">
          ${idx === 0 ? `http://${config.portalIp}` : idx === 1 ? 'COIN SLOT: 30s' : idx === 2 ? 'COINS: ₱1 / ₱5 / ₱10' : idx === 3 ? 'READY TO SURF' : 'STATUS: ONLINE'}
        </text>

        <rect x="8" y="40" width="224" height="46" rx="8" fill="${idx === 1 ? accent : idx === 3 ? '#000000' : idx === 4 ? '#4ade80' : '#ffffff'}" stroke="#000000" stroke-width="2" />
        <text x="120" y="68" font-size="13" font-weight="900" fill="${idx === 3 ? '#ffffff' : '#000000'}" text-anchor="middle">
          ${escapeXml(step.highlight || '')}
        </text>
      </g>
    </g>
    `;
      })
      .join('\n')}
  </g>

  <!-- Pro-Tip / Session Transfer Code Reminder Banner (Vertical Mode) -->
  ${config.showSessionCodeTip
      ? `
  <g transform="translate(48, ${config.showRates ? 1270 : 1210})">
    <rect x="0" y="0" width="${width - 96}" height="190" rx="16" fill="#ffffff" stroke="#000000" stroke-width="4" filter="url(#shadow-neo-lg)" />
    
    <rect x="0" y="0" width="${width - 96}" height="44" rx="12" fill="#c084fc" stroke="#000000" stroke-width="3" />
    <text x="24" y="28" font-size="16" font-weight="900" fill="#000000" letter-spacing="0.5">
      ${escapeXml(sessionNotice.title)}
    </text>

    <g transform="translate(24, 60)">
      <rect x="0" y="0" width="220" height="106" rx="10" fill="#f8f6ee" stroke="#000000" stroke-width="2.5" />
      <text x="14" y="24" font-size="10" font-weight="900" fill="#666666" letter-spacing="1">SESSION TRANSFER CODE</text>
      <text x="14" y="58" font-size="22" font-weight="900" fill="#000000" font-family="monospace">PW-GDQLWK</text>
      <rect x="14" y="70" width="80" height="24" rx="4" fill="${accent}" stroke="#000000" stroke-width="1.5" />
      <text x="54" y="86" font-size="10" font-weight="900" fill="#000000" text-anchor="middle">📋 COPY</text>
    </g>

    <g transform="translate(266, 68)">
      <text x="0" y="16" font-size="14" font-weight="700" fill="#000000">
        ${config.language === 'english' ? 'Switching Wi-Fi band (2.4G ⇄ 5G), restarted phone, or moving to another PC?' : 'Nawalan ng signal, lumipat sa 5GHz/2.4G, o gustong ilipat ang oras sa ibang phone/PC?'}
      </text>
      <text x="0" y="42" font-size="13" font-weight="600" fill="#333333">
        ${config.language === 'english' ? 'Paste your code into the "Voucher or Transfer Code" box on the portal.' : 'I-paste lamang ang code sa "Voucher or Transfer Code" box sa portal page.'}
      </text>
      <text x="0" y="68" font-size="13" font-weight="800" fill="#000000">
        ${config.language === 'english' ? '✔ Automatically restores your remaining time without dropping another coin!' : '✔ Agad maibabalik ang natitirang oras nang hindi na kailangang maghulog muli!'}
      </text>
    </g>
  </g>
  `
      : ''
    }
  `
  }

  <!-- Footer Help / Store Note -->
  <g transform="translate(48, ${height - 90})">
    <rect x="0" y="0" width="${width - 96}" height="48" rx="10" fill="#ffffff" stroke="#000000" stroke-width="2.5" />
    <text x="24" y="30" font-size="13" font-weight="700" fill="#333333">
      💬 ${escapeXml(config.storeNote)}
    </text>
    <text x="${width - 120}" y="30" font-size="13" font-weight="900" fill="#000000" text-anchor="end">
      SSID: ${escapeXml(ssidDisplay)}
    </text>
  </g>
</svg>
`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Exports the given SVG string to a high-resolution JPEG or PNG file
 * and triggers a browser download.
 */
export async function downloadPosterImage(
  svgString: string,
  filename: string,
  format: 'jpeg' | 'png' = 'jpeg',
  scale = 2
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to create Canvas 2D context'));
            return;
          }

          // Fill white background for JPEG
          if (format === 'jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
          const quality = format === 'jpeg' ? 0.95 : undefined;
          const dataUrl = canvas.toDataURL(mimeType, quality);

          // Trigger download
          const link = document.createElement('a');
          link.download = filename;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          URL.revokeObjectURL(url);
          resolve();
        } catch (canvasErr) {
          URL.revokeObjectURL(url);
          reject(canvasErr);
        }
      };

      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG into Image for canvas conversion'));
      };

      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Downloads the raw scalable SVG vector file.
 */
export function downloadPosterSvg(svgString: string, filename: string): void {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


