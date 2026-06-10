import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import OfflineIndicator from '@/components/TripOfflineIndicator';
import { SpeedInsights } from '@vercel/speed-insights/next';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://truck-system-ten.vercel.app"),
  title: "KbNL - Operations Management System",
  description: "Advanced company operations management system for cement distribution in Nigeria",
  keywords: ["logistics", "transportation", "trucking", "cargo", "Nigeria", "Cement", "Operations Management", "Distribution"],
  authors: [{ name: "KbNL Team" }],
  creator: "Kross Border Nigeria Limited",
  publisher: "KbNL",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/logo-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KbNL",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "KbNL - Operations Management System",
    description: "Streamline your distribution company operations with KbNL",
    url: "https://truck-system-ten.vercel.app",
    type: "website",
    images: [
      {
        url: "/logo-512.png",
        width: 512,
        height: 512,
        alt: "KbNL Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "KbNL - Operations Management System",
    description: "Advanced company operations management system for cement distribution in Nigeria",
    images: ["/logo-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  viewportFit: "cover",
  themeColor: "#0070f3",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* PWA Meta Tags */}
        <meta name="theme-color" content="#0070f3" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="KbNL" />
        <meta name="mobile-web-app-capable" content="yes" />
        
        {/* Status Bar Color for Android */}
        <meta name="theme-color" content="#0070f3" media="(prefers-color-scheme: light)" />
        
        {/* Manifest & Icons */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/logo-192.png" />
        <link rel="icon" href="/favicon.ico" />
        
        {/* Splash Screens (iOS) */}
        <link 
          rel="apple-touch-startup-image"
          href="/splash-512.png"
          media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)"
        />
        
        {/* Preconnect for Performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* Web App Configuration */}
        <meta name="application-name" content="KbNL" />
        <meta name="msapplication-TileColor" content="#0070f3" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        
        {/* DNS Prefetch for Supabase */}
        <link rel="dns-prefetch" href="https://your-supabase-url.supabase.co" />
      </head>
      <body className="min-h-full flex flex-col">
        <OfflineIndicator />
        {children}
        <SpeedInsights />
        {/* Service Worker Registration using Next.js Script */}
        <Script
          id="sw-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(() => {
                  // Service worker registration failed, app will still work
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}