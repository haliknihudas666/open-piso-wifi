export type RewindThemeId = 'electric-lime' | 'sunset-flame' | 'cyber-acid';

export interface RewindTheme {
  id: RewindThemeId;
  label: string;
  bgTop: string;
  bgBottom: string;
  accent: string;
  accentSecondary: string;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textMuted: string;
  pillText: string;
}

export const REWIND_THEMES: RewindTheme[] = [
  {
    id: 'electric-lime',
    label: 'Electric Lime',
    bgTop: '#0d1912',
    bgBottom: '#070b08',
    accent: '#4ade80',
    accentSecondary: '#ffe17c',
    cardBg: 'rgba(255, 255, 255, 0.06)',
    cardBorder: 'rgba(74, 222, 128, 0.35)',
    textPrimary: '#ffffff',
    textMuted: '#a7c4b5',
    pillText: '#07110a',
  },
  {
    id: 'sunset-flame',
    label: 'Sunset Flame',
    bgTop: '#1f0d24',
    bgBottom: '#0d0712',
    accent: '#ff6b35',
    accentSecondary: '#ff3e8a',
    cardBg: 'rgba(255, 255, 255, 0.06)',
    cardBorder: 'rgba(255, 107, 53, 0.4)',
    textPrimary: '#ffffff',
    textMuted: '#e2bfd0',
    pillText: '#14060d',
  },
  {
    id: 'cyber-acid',
    label: 'Cyber Acid',
    bgTop: '#0b132b',
    bgBottom: '#060814',
    accent: '#22d3ee',
    accentSecondary: '#c084fc',
    cardBg: 'rgba(255, 255, 255, 0.06)',
    cardBorder: 'rgba(34, 211, 238, 0.38)',
    textPrimary: '#ffffff',
    textMuted: '#b7c9e2',
    pillText: '#05111b',
  },
];

export interface CustomerRewindData {
  portalTitle: string;
  currentStreak: number;
  highestStreak: number;
  totalCredits: number;
  totalAmountSpent: number;
  totalBonusMinutes: number;
  sessionCode?: string;
  hideCode?: boolean;
}

export interface AdminRewindData {
  portalTitle: string;
  allTimeRevenue: number;
  todayRevenue: number;
  allTimeTransactions: number;
  todayTransactions: number;
  uniqueUsers: number;
  activeSessions: number;
  topStreak: number;
  speedMbps?: number | null;
  hideRevenue?: boolean;
}

function getTheme(themeId: RewindThemeId): RewindTheme {
  return REWIND_THEMES.find((t) => t.id === themeId) || REWIND_THEMES[0];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawWrappedBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, theme: RewindTheme) {
  // Deep gradient base
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, theme.bgTop);
  grad.addColorStop(1, theme.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Kinetic Wrapped-style glowing orbs
  const orb1 = ctx.createRadialGradient(w * 0.85, h * 0.14, 20, w * 0.85, h * 0.14, 460);
  orb1.addColorStop(0, `${theme.accent}44`);
  orb1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = orb1;
  ctx.fillRect(0, 0, w, h);

  const orb2 = ctx.createRadialGradient(w * 0.12, h * 0.86, 20, w * 0.12, h * 0.86, 520);
  orb2.addColorStop(0, `${theme.accentSecondary}38`);
  orb2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = orb2;
  ctx.fillRect(0, 0, w, h);

  // Bold diagonal kinetic ribbons (Spotify Wrapped geometric signature)
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 28;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(w + 80, 140, 260 + i * 74, Math.PI * 0.55, Math.PI * 1.15);
    ctx.stroke();
  }
  ctx.strokeStyle = theme.accentSecondary;
  ctx.lineWidth = 22;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-60, h - 180, 220 + i * 66, -Math.PI * 0.35, Math.PI * 0.25);
    ctx.stroke();
  }
  ctx.restore();

  // Subtle dot-grid texture
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let gx = 48; gx < w; gx += 48) {
    for (let gy = 48; gy < h; gy += 48) {
      ctx.beginPath();
      ctx.arc(gx, gy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Outer crisp frame
  ctx.save();
  drawRoundedRect(ctx, 32, 32, w - 64, h - 64, 44);
  ctx.strokeStyle = theme.cardBorder;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

function drawStatTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  subtext: string,
  theme: RewindTheme,
  highlight = false
) {
  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, 28);
  ctx.fillStyle = highlight ? `${theme.accent}1a` : theme.cardBg;
  ctx.fill();
  ctx.strokeStyle = highlight ? theme.accent : theme.cardBorder;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = theme.textMuted;
  ctx.font = '800 24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(label.toUpperCase(), x + 32, y + 54);

  ctx.fillStyle = highlight ? theme.accentSecondary : theme.textPrimary;
  ctx.font = '900 54px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(value, x + 32, y + 124, w - 64);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '600 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(subtext, x + 32, y + 168, w - 64);
  ctx.restore();
}

function formatBonusTime(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs} hr${hrs === 1 ? '' : 's'}`;
  return `${mins} min`;
}

function getCustomerRank(streak: number): string {
  if (streak >= 30) return 'WI-FI LEGEND';
  if (streak >= 14) return 'STREAK MASTER';
  if (streak >= 7) return 'DAILY CHAMPION';
  if (streak >= 3) return 'RISING REGULAR';
  if (streak >= 1) return 'STREAK STARTER';
  return 'NEW EXPLORER';
}

export function renderCustomerRewindCard(
  canvas: HTMLCanvasElement,
  data: CustomerRewindData,
  themeId: RewindThemeId = 'electric-lime'
) {
  const w = 1080;
  const h = 1350;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const theme = getTheme(themeId);
  const year = new Date().getFullYear();
  drawWrappedBackdrop(ctx, w, h, theme);

  // Top Header Pill
  const pillText = `STREAK REWIND  •  ${year}`;
  ctx.font = '900 26px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const pillW = ctx.measureText(pillText).width + 64;
  drawRoundedRect(ctx, 76, 84, pillW, 60, 30);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  ctx.fillStyle = theme.pillText;
  ctx.fillText(pillText, 108, 123);

  // Portal Brand Title
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '900 44px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(data.portalTitle || 'OpenPisoWiFi', 76, 210, w - 152);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '700 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('My Daily Wi-Fi Streak Snapshot', 76, 254);

  // Giant Hero Streak Card
  drawRoundedRect(ctx, 76, 300, w - 152, 390, 38);
  const heroGrad = ctx.createLinearGradient(76, 300, w - 76, 690);
  heroGrad.addColorStop(0, `${theme.accent}24`);
  heroGrad.addColorStop(1, `${theme.accentSecondary}24`);
  ctx.fillStyle = heroGrad;
  ctx.fill();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Rank Pill inside Hero
  const rank = getCustomerRank(data.currentStreak);
  ctx.font = '900 24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const rankW = ctx.measureText(rank).width + 52;
  drawRoundedRect(ctx, 118, 344, rankW, 50, 25);
  ctx.fillStyle = theme.accentSecondary;
  ctx.fill();
  ctx.fillStyle = theme.pillText;
  ctx.fillText(rank, 144, 377);

  // Giant Streak Number
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '900 170px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const streakStr = String(data.currentStreak);
  ctx.fillText(streakStr, 114, 560);
  const numWidth = ctx.measureText(streakStr).width;

  ctx.fillStyle = theme.accent;
  ctx.font = '900 56px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(data.currentStreak === 1 ? 'DAY' : 'DAYS', 132 + numWidth, 512);
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '900 44px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('ACTIVE STREAK', 132 + numWidth, 562);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '700 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(
    data.currentStreak > 0
      ? 'Showing up daily & unlocking free bonus Wi-Fi!'
      : 'Drop a coin today to ignite your daily streak!',
    118,
    636,
    w - 236
  );

  // 2x2 Stat Grid
  const tileW = (w - 152 - 28) / 2;
  const tileH = 200;
  const row1Y = 724;
  const row2Y = row1Y + tileH + 28;

  drawStatTile(
    ctx,
    76,
    row1Y,
    tileW,
    tileH,
    'Personal Best',
    `${Math.max(data.highestStreak, data.currentStreak)} Days`,
    'Longest streak reached',
    theme,
    true
  );

  drawStatTile(
    ctx,
    76 + tileW + 28,
    row1Y,
    tileW,
    tileH,
    'Free Bonus Earned',
    formatBonusTime(data.totalBonusMinutes),
    'Unlocked via streak rewards',
    theme
  );

  drawStatTile(
    ctx,
    76,
    row2Y,
    tileW,
    tileH,
    'Total Top-Ups',
    `${data.totalCredits}`,
    `₱${Math.round(data.totalAmountSpent).toLocaleString()} total credited`,
    theme
  );

  const codeDisplay = data.hideCode
    ? 'PW-••••••'
    : data.sessionCode || 'MEMBER';

  drawStatTile(
    ctx,
    76 + tileW + 28,
    row2Y,
    tileW,
    tileH,
    'Loyalty Pass',
    codeDisplay,
    data.hideCode ? 'Code hidden for privacy' : 'Tracked across sessions',
    theme
  );

  // Footer Bar
  ctx.fillStyle = theme.textMuted;
  ctx.font = '800 24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('POWERED BY OPENPISOWIFI', 76, h - 86);

  const dateLabel = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const dateW = ctx.measureText(dateLabel).width;
  ctx.fillStyle = theme.accentSecondary;
  ctx.fillText(dateLabel, w - 76 - dateW, h - 86);
}

export function renderAdminRewindCard(
  canvas: HTMLCanvasElement,
  data: AdminRewindData,
  themeId: RewindThemeId = 'electric-lime'
) {
  const w = 1080;
  const h = 1350;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const theme = getTheme(themeId);
  const year = new Date().getFullYear();
  drawWrappedBackdrop(ctx, w, h, theme);

  // Top Header Pill
  const pillText = `OPERATOR REWIND  •  ${year}`;
  ctx.font = '900 26px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const pillW = ctx.measureText(pillText).width + 64;
  drawRoundedRect(ctx, 76, 84, pillW, 60, 30);
  ctx.fillStyle = theme.accentSecondary;
  ctx.fill();
  ctx.fillStyle = theme.pillText;
  ctx.fillText(pillText, 108, 123);

  // Portal Brand Title
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '900 46px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(data.portalTitle || 'OpenPisoWiFi', 76, 210, w - 152);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '700 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('Live Hotspot Performance & Revenue Snapshot', 76, 254);

  // Giant Hero Revenue Card
  drawRoundedRect(ctx, 76, 300, w - 152, 390, 38);
  const heroGrad = ctx.createLinearGradient(76, 300, w - 76, 690);
  heroGrad.addColorStop(0, `${theme.accent}24`);
  heroGrad.addColorStop(1, `${theme.accentSecondary}24`);
  ctx.fillStyle = heroGrad;
  ctx.fill();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 4;
  ctx.stroke();

  const badgeText = 'ALL-TIME REVENUE';
  ctx.font = '900 24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const badgeW = ctx.measureText(badgeText).width + 52;
  drawRoundedRect(ctx, 118, 344, badgeW, 50, 25);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  ctx.fillStyle = theme.pillText;
  ctx.fillText(badgeText, 144, 377);

  const revenueDisplay = data.hideRevenue
    ? '₱••••'
    : `₱${Math.round(data.allTimeRevenue).toLocaleString()}`;

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '900 132px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(revenueDisplay, 118, 548, w - 236);

  const todayDisplay = data.hideRevenue
    ? `${data.todayTransactions} sales today  •  ${data.activeSessions} online now`
    : `Today: ₱${Math.round(data.todayRevenue).toLocaleString()} (${data.todayTransactions} drops)  •  ${data.activeSessions} online now`;

  ctx.fillStyle = theme.accentSecondary;
  ctx.font = '800 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(todayDisplay, 118, 632, w - 236);

  // 2x2 Stat Grid
  const tileW = (w - 152 - 28) / 2;
  const tileH = 200;
  const row1Y = 724;
  const row2Y = row1Y + tileH + 28;

  drawStatTile(
    ctx,
    76,
    row1Y,
    tileW,
    tileH,
    'Total Customers',
    `${data.uniqueUsers.toLocaleString()}`,
    'Unique devices served',
    theme,
    true
  );

  drawStatTile(
    ctx,
    76 + tileW + 28,
    row1Y,
    tileW,
    tileH,
    'Total Coin Drops',
    `${data.allTimeTransactions.toLocaleString()}`,
    'Completed transactions',
    theme
  );

  drawStatTile(
    ctx,
    76,
    row2Y,
    tileW,
    tileH,
    'Top Customer Streak',
    `${data.topStreak} Days`,
    'Most loyal Wi-Fi user',
    theme
  );

  drawStatTile(
    ctx,
    76 + tileW + 28,
    row2Y,
    tileW,
    tileH,
    data.speedMbps ? 'Measured WAN Speed' : 'Live Connections',
    data.speedMbps ? `${Math.round(data.speedMbps)} Mbps` : `${data.activeSessions} Active`,
    data.speedMbps ? 'Verified on OpenWrt router' : 'Devices browsing right now',
    theme
  );

  // Footer Bar
  ctx.fillStyle = theme.textMuted;
  ctx.font = '800 24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('OPENPISOWIFI  •  OPEN-SOURCE HOTSPOT', 76, h - 86);

  const dateLabel = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const dateW = ctx.measureText(dateLabel).width;
  ctx.fillStyle = theme.accent;
  ctx.fillText(dateLabel, w - 76 - dateW, h - 86);
}

export async function shareOrDownloadRewindCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  shareTitle: string,
  shareText: string,
  forceDownload = false
): Promise<'shared' | 'downloaded'> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 1));
  if (!blob) {
    throw new Error('Could not generate image');
  }

  if (!forceDownload && typeof navigator !== 'undefined' && typeof File !== 'undefined') {
    const file = new File([blob], filename, { type: 'image/png' });
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
      try {
        await nav.share({
          title: shareTitle,
          text: shareText,
          files: [file],
        });
        return 'shared';
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return 'shared';
        }
        // Fall through to direct download if share sheet fails
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
