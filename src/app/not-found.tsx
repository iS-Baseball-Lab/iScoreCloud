// filepath: src/app/not-found.tsx
"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/liff-logo.webp"
              alt="iScoreCloud"
              width={32}
              height={32}
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.src.endsWith("/liff-logo.png")) {
                  img.src = "/liff-logo.png";
                }
              }}
              className="w-8 h-8 rounded-[22%] bg-slate-900 border border-slate-700 object-contain shrink-0"
            />
            <span className="text-sm font-black tracking-tight">
              iScoreCloud
            </span>
          </div>
          <span className="text-xs font-mono font-black text-slate-400">
            404 NOT FOUND
          </span>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <h1 className="text-xl font-black tracking-tight text-foreground">
              お探しのページは見つかりません
            </h1>
            <p className="text-xs sm:text-sm font-medium leading-relaxed text-muted-foreground">
              URLが変更されたか、Web版の機能はすべて{" "}
              <strong className="font-black text-foreground">
                iScoreCloud LINEミニアプリ
              </strong>{" "}
              へ統合されました。トップページよりLINEミニアプリを起動してください。
            </p>
          </div>

          <Link
            href="/"
            id="not-found-back-home"
            className="h-11 px-4 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-opacity w-full shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>トップページへ戻る</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
