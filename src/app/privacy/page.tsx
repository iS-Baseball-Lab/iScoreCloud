// filepath: src/app/privacy/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PublicWebLayoutShell } from "@/components/common/PublicWebShell";
import { PrivacyDocumentContent } from "@/components/legal/LegalDocumentContents";

export default function WebPrivacyPage() {
  return (
    <PublicWebLayoutShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link
            href="/"
            className="h-10 px-4 rounded-xl border border-border bg-card text-foreground hover:bg-muted font-black text-xs inline-flex items-center gap-2 shadow-2xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-primary" />
            <span>トップページへ戻る</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-slate-500/12 text-slate-700 dark:text-slate-300 border border-slate-500/25 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              プライバシーポリシー
            </h1>
            <p className="text-xs font-bold text-muted-foreground mt-0.5">
              個人情報の取扱いと保護方針（個人情報保護法・LINEミニアプリ準拠）
            </p>
          </div>
        </div>

        <PrivacyDocumentContent termsHref="/terms" />
      </div>
    </PublicWebLayoutShell>
  );
}
