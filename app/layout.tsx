import type { Metadata, Viewport } from "next"; // Viewport'u ekledik
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 1. Viewport ayarlarını buraya ekliyoruz (Zoom'u ve kaymayı engeller)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // Çentikli iPhone'lar için tam ekran sağlar
};

export const metadata: Metadata = {
  title: "OMEGPT | Akıllı Video Chat", // İsim markaya uygun güncellendi :)
  description: "Omegle tarzı, yapay zeka destekli video sohbet uygulaması",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr"> {}
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ position: 'fixed', width: '100%', height: '100%', overflow: 'hidden' }}
      >
        {children}
      </body>
    </html>
  );
}