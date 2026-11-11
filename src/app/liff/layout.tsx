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
      { url: "/liff-logo.png", type: "image/png" },
      { url: "/liff-logo.webp", type: "image/webp" },
    ],
    shortcut: "/liff-logo.png",
    apple: "/channel-icon-640x640.png",
  },
  openGraph: {
    title: "iScoreCloud LINEミニアプリ",
    description: "LINEで出欠回答・配車表・予定確認・試合動画がサクサク確認できる草野球・学童野球チーム向けミニアプリ",
    siteName: "iScoreCloud LINEミニアプリ",
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
    title: "iScoreCloud LINEミニアプリ",
    images: ["/channel-icon-640x640.png"],
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
