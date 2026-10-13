import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenPisoWiFi - Wi-Fi Vending Portal',
  description: 'Fast, reliable, and affordable local Wi-Fi vending machine captive portal.',
  appleWebApp: {
    title: 'OpenPisoWiFi',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#171e19',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function() {
              try {
                var t = null;
                try {
                  t = localStorage.getItem('piso_theme');
                } catch (e) {}
                if (!t && document.cookie) {
                  var match = document.cookie.match(/(?:^|;\\s*)piso_theme=([^;]*)/);
                  if (match) t = decodeURIComponent(match[1]);
                }
                var isDark = t === 'dark' || (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) || !t;
                if (t === 'light') {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.classList.add('light');
                } else {
                  document.documentElement.classList.add('dark');
                  document.documentElement.classList.remove('light');
                }
              } catch (e) {}
            })()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased bg-[#f6f4ea] text-[#000000] dark:bg-[#111613] dark:text-[#ffffff] selection:bg-[#ffe17c] selection:text-black">
        {children}
      </body>
    </html>
  );
}
