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
  title: "iScore",
  description: "Next-gen baseball scoring and analytics platform.",
  icons: {
    icon: "/logo.png",
    apple: "/apple-logo.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
                  className: "rounded-2xl border-border bg-background/80 backdrop-blur-md font-bold shadow-none",
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
