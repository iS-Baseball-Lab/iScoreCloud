// filepath: src/app/liff/terms/page.tsx
"use client";

import React from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { TermsDocumentContent } from "@/components/legal/LegalDocumentContents";
import {
  CLOUDFLARE_TRADEMARK_NOTICE,
  GOOGLE_TRADEMARK_NOTICE,
  LINE_TRADEMARK_NOTICE,
} from "@/components/common/PublicWebShell";
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

        <div className="px-1 pt-1 space-y-1 text-[10px] leading-relaxed font-medium text-muted-foreground">
          <p>{LINE_TRADEMARK_NOTICE}</p>
          <p>{CLOUDFLARE_TRADEMARK_NOTICE}</p>
          <p>{GOOGLE_TRADEMARK_NOTICE}</p>
        </div>

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
