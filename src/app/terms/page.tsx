// filepath: src/app/terms/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import { PublicWebLayoutShell } from "@/components/common/PublicWebShell";
import { TermsDocumentContent } from "@/components/legal/LegalDocumentContents";

export default function WebTermsPage() {
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
          <span className="w-10 h-10 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 border border-amber-500/25 flex items-center justify-center shrink-0">
            <Scale className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              サービス利用規約
            </h1>
            <p className="text-xs font-bold text-muted-foreground mt-0.5">
              iScoreCloud LINEミニアプリ・Webサービス ご利用条件と免責事項
            </p>
          </div>
        </div>

        <TermsDocumentContent privacyHref="/privacy" />
      </div>
    </PublicWebLayoutShell>
  );
}
