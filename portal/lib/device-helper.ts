/**
 * Parses User-Agent header and merges with DHCP hostname to produce a clean friendly device name.
 * e.g. "iPhone 15 (iOS 17.4)", "Samsung Galaxy (Android 14)", "Redmi-Note-12", "Windows 11 PC"
 */
export function getFriendlyDeviceName(userAgent: string | null, dhcpHostname?: string): string {
  if (dhcpHostname && dhcpHostname !== '*' && !dhcpHostname.startsWith('android-')) {
    return dhcpHostname;
  }

  if (!userAgent) {
    return dhcpHostname || 'Wi-Fi Client';
  }

  const ua = userAgent.toLowerCase();

  // iOS / Apple
  if (ua.includes('iphone')) {
    const match = ua.match(/os (\d+[._]\d+)/);
    const osVer = match ? `iOS ${match[1].replace('_', '.')}` : 'iOS';
    return dhcpHostname ? `${dhcpHostname} (${osVer})` : `Apple iPhone (${osVer})`;
  }

  if (ua.includes('ipad')) {
    return dhcpHostname ? `${dhcpHostname} (iPad)` : 'Apple iPad';
  }

  if (ua.includes('macintosh') || ua.includes('mac os x')) {
    return dhcpHostname ? `${dhcpHostname} (Mac)` : 'Apple Mac';
  }

  // Android Brands
  if (ua.includes('samsung') || ua.includes('sm-')) {
    return dhcpHostname || 'Samsung Galaxy';
  }

  if (ua.includes('redmi') || ua.includes('xiaomi') || ua.includes('mi ') || ua.includes('poco')) {
    return dhcpHostname || 'Xiaomi / Redmi Device';
  }

  if (ua.includes('oppo') || ua.includes('cph')) {
    return dhcpHostname || 'OPPO Device';
  }

  if (ua.includes('vivo') || ua.includes('v2')) {
    return dhcpHostname || 'Vivo Phone';
  }

  if (ua.includes('realme') || ua.includes('rmx')) {
    return dhcpHostname || 'Realme Device';
  }

  if (ua.includes('huawei') || ua.includes('honor')) {
    return dhcpHostname || 'Huawei Device';
  }

  if (ua.includes('android')) {
    const match = ua.match(/android (\d+(\.\d+)?)/);
    const ver = match ? `Android ${match[1]}` : 'Android';
    return dhcpHostname ? `${dhcpHostname} (${ver})` : `Android Phone (${ver})`;
  }

  // Desktop OS
  if (ua.includes('windows nt 10.0')) {
    return dhcpHostname ? `${dhcpHostname} (Windows)` : 'Windows PC';
  }

  if (ua.includes('windows')) {
    return dhcpHostname ? `${dhcpHostname} (Windows)` : 'Windows PC';
  }

  if (ua.includes('linux')) {
    return dhcpHostname ? `${dhcpHostname} (Linux)` : 'Linux Device';
  }

  return dhcpHostname || 'Wi-Fi Client';
}
