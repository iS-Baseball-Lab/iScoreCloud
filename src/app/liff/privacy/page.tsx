// filepath: src/app/liff/privacy/page.tsx
"use client";

import React from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { PrivacyDocumentContent } from "@/components/legal/LegalDocumentContents";
import { ShieldCheck } from "lucide-react";

export default function LiffPrivacyPage() {
  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="プライバシーポリシー"
          subtitle="個人情報の取扱いと保護方針（個人情報保護法・LINEミニアプリ準拠）"
          icon={
            <span className="w-8 h-8 rounded-xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black">
              <ShieldCheck className="w-4 h-4" />
            </span>
          }
          showBack
        />

        <PrivacyDocumentContent termsHref="/liff/terms" />

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
