import type { Metadata } from 'next';
import { Space_Grotesk, Space_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-space-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OpenPisoWiFi — Free & Open-Source Piso Wi-Fi Operating System',
  description: 'The modern, open-source Piso-WiFi operating system with zero license fees. Powered by Next.js, Linux nftables kernel routing, ESP32 satellite coinslots, and free Supabase cloud fleet telemetry.',
  keywords: ['piso wifi', 'open source piso wifi', 'captive portal', 'openwrt', 'raspberry pi', 'esp32 coinslot', 'juanfi alternative', 'lpb alternative'],
  openGraph: {
    title: 'OpenPisoWiFi — Free & Open-Source Piso Wi-Fi Operating System',
    description: 'Stop paying vendor license fees. Run your vending hotspot on Raspberry Pi, OpenWrt, and ESP32 with enterprise-grade nftables and cloud fleet control.',
    type: 'website',
  },
};

const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`scroll-smooth ${spaceGrotesk.variable} ${spaceMono.variable}`}>
      <body className="font-sans antialiased selection:bg-[#ffe17c] selection:text-black">
        {gaMeasurementId && (
          <>
            <Script
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            />
            <Script
              id="google-analytics"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${gaMeasurementId}', {
                    page_path: window.location.pathname,
                  });
                `,
              }}
            />
          </>
        )}
        {children}
      </body>
    </html>
  );
}
