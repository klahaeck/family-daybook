import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";

import { AppProviders } from "@/components/providers/app-providers";
import { AuthProvider } from "@/components/providers/auth-provider";
import { getAppEnvironment } from "@/lib/deployment/environment";
import { getSiteUrl } from "@/lib/metadata/site-url";
import "./globals.css";

const title = "Family Daybook";
const description =
  "Family Daybook is a private family recordkeeping app for caregiving, appointments, factual notes, and an organized family timeline.";
const appEnvironment = getAppEnvironment();
const isProduction = appEnvironment === "production";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  applicationName: title,
  title: {
    default: "Family Daybook — Calm, private family recordkeeping",
    template: `%s · ${title}`,
  },
  description,
  keywords: [
    "parenting log",
    "caregiving records",
    "family documentation",
    "family timeline",
    "private family daybook",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: title,
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: { index: isProduction, follow: isProduction },
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
      suppressHydrationWarning
    >
      <body className="flex min-h-full w-full min-w-0 flex-col">
        {!isProduction ? (
          <div
            role="status"
            className="bg-amber-300 px-3 py-1 text-center text-xs font-semibold uppercase tracking-wide text-amber-950"
          >
            Family Daybook {appEnvironment} environment
          </div>
        ) : null}
        <AuthProvider>
          <AppProviders>{children}</AppProviders>
        </AuthProvider>
      </body>
      {isProduction ? <GoogleAnalytics gaId="G-BV2C0Z5WTW" /> : null}
    </html>
  );
}
