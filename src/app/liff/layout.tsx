// filepath: src/app/liff/layout.tsx
import React from "react";
import type { Metadata } from "next";
import { LiffProvider } from "@/components/liff/LiffProvider";
import { LiffMainShell } from "@/components/liff/LiffMainShell";

export const metadata: Metadata = {
  title: "iScoreCloud LINEミニアプリ",
  description: "LINEで出欠回答・配車表・予定確認・試合動画がサクサク確認できる草野球・学童野球チーム向けミニアプリ「iScoreCloud LINEミニアプリ」",
  icons: {
    icon: [
      { url: "/favicon.ico?v=3", sizes: "any" },
      { url: "/liff-logo.png?v=3", type: "image/png", sizes: "640x640" },
      { url: "/liff-logo.webp?v=3", type: "image/webp", sizes: "640x640" },
    ],
    shortcut: "/liff-logo.png?v=3",
    apple: [
      { url: "/apple-logo.png?v=2", sizes: "180x180", type: "image/png" },
      { url: "/channel-icon-640x640.png?v=3", sizes: "640x640", type: "image/png" },
    ],
  },
  openGraph: {
    title: "iScoreCloud LINEミニアプリ",
    description: "LINEで出欠回答・配車表・予定確認・試合動画がサクサク確認できる草野球・学童野球チーム向けミニアプリ",
    siteName: "iScoreCloud LINEミニアプリ",
    type: "website",
    images: [
      {
        url: "/channel-icon-640x640.png?v=3",
        width: 640,
        height: 640,
        alt: "iScoreCloud LINEミニアプリ",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "iScoreCloud LINEミニアプリ",
    images: ["/channel-icon-640x640.png?v=3"],
  },
};

export default function LiffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LiffProvider>
      <LiffMainShell>{children}</LiffMainShell>
    </LiffProvider>
  );
}
