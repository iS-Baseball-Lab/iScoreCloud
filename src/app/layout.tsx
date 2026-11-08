// filepath: src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DensityProvider } from "@/components/providers/density-provider";
import { TeamProvider } from "@/contexts/TeamContext"; // 💡 追加

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL("https://iscorecloud.com"),
  title: "iScoreCloud",
  description: "Next-gen baseball scoring and analytics platform.",
  icons: {
    icon: [
      { url: "/liff-logo.png", type: "image/png" },
      { url: "/liff-logo.webp", type: "image/webp" },
    ],
    shortcut: "/liff-logo.png",
    apple: "/channel-icon-640x640.png",
  },
  openGraph: {
    title: "iScoreCloud",
    description: "LINEで出欠回答・配車表・予定確認・試合動画・スコアブックが完結する野球チーム運営アプリ",
    siteName: "iScoreCloud",
    type: "website",
    images: [
      {
        url: "/channel-icon-640x640.png",
        width: 640,
        height: 640,
        alt: "iScoreCloud LINEミニアプリ",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "iScoreCloud",
    images: ["/channel-icon-640x640.png"],
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen font-sans antialiased",
          inter.variable
        )}
      >
        <DensityProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem={true}
            disableTransitionOnChange={false}
          >
            {/* 💡 TeamProvider を追加：アプリ全体で「どのチームを操作しているか」を共有 */}
            <TeamProvider>
              <Toaster
                position="top-center"
                toastOptions={{
                  className: "rounded-2xl border-border bg-card text-foreground font-bold shadow-xs",
                }}
              />

              {/* 💡 ここに children を配置。
                AppShell を children の中で使っている場合はこのままでOKです。
                もし AppShell をここで使いたい場合は、TeamProvider の内側に配置します。
              */}
              {children}
            </TeamProvider>
          </ThemeProvider>
        </DensityProvider>
      </body>
    </html>
  );
}
