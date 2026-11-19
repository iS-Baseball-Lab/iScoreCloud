// filepath: src/app/liff/terms/page.tsx
"use client";

import React from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { TermsDocumentContent } from "@/components/legal/LegalDocumentContents";
import { Scale } from "lucide-react";

export default function LiffTermsPage() {
  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="サービス利用規約"
          subtitle="iScoreCloud LINEミニアプリ ご利用条件と免責事項"
          icon={
            <span className="w-8 h-8 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
              <Scale className="w-4 h-4" />
            </span>
          }
          showBack
        />

        <TermsDocumentContent privacyHref="/liff/privacy" />

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
