import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Thai } from "next/font/google";
import { Providers } from "@/components/providers";
import { getLocale, getMessages } from "@/lib/i18n/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Geist has no Thai glyphs; the browser falls back per character to Noto Sans Thai.
const notoSansThai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return {
    title: {
      default: `${m.meta.titles.overview} · ${m.meta.appName}`,
      template: `%s · ${m.meta.appName}`,
    },
    description: m.meta.description,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${notoSansThai.variable} antialiased`}>
      <body>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
