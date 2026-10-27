// filepath: src/app/liff/terms/page.tsx
"use client";

import React from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { Scale, FileText, CheckCircle2, Ban, ShieldAlert } from "lucide-react";

export default function LiffTermsPage() {
  const styles = {
    card: "p-4 rounded-3xl bg-card border-2 border-primary/20 shadow-xs space-y-3",
    h3: "text-sm font-black text-foreground flex items-center gap-2",
    p: "text-xs leading-relaxed text-muted-foreground",
    li: "text-xs leading-relaxed text-muted-foreground flex items-start gap-2",
  };

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="サービス利用規約"
          subtitle="iScore for LINEミニアプリ ご利用条件と権利義務"
          icon={
            <span className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black">
              <Scale className="w-4 h-4" />
            </span>
          }
          showBack
        />

        {/* 前文 */}
        <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/20 space-y-2">
          <div className="flex items-center gap-2 text-xs font-black text-primary">
            <FileText className="w-4 h-4" />
            <span>はじめに</span>
          </div>
          <p className="text-xs leading-relaxed text-foreground/90 font-medium">
            本規約は、iS Baseball Lab（以下「当運営」）が提供する「iScore for LINEミニアプリ」およびWebサービス「iScoreCloud」（以下総称して「本サービス」）の利用条件を定めるものです。利用者の皆さまは、本規約に同意の上ご利用ください。
          </p>
        </div>

        {/* 第1条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className="w-5 h-5 rounded-lg bg-primary/10 text-primary text-[11px] font-black flex items-center justify-center">1</span>
            適用・アカウント
          </h3>
          <div className="space-y-1.5">
            <p className={styles.p}>
              ・本規約は、本サービスを利用するすべてのユーザーに適用されます。
            </p>
            <p className={styles.p}>
              ・ユーザーは自己の責任でLINEアカウントおよび認証情報を適切に管理し、不正利用のないようご注意ください。
            </p>
          </div>
        </div>

        {/* 第2条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className="w-5 h-5 rounded-lg bg-primary/10 text-primary text-[11px] font-black flex items-center justify-center">2</span>
            出欠・配車・スコア等の利用
          </h3>
          <div className="space-y-1.5">
            <p className={styles.p}>
              ・出欠や配車希望の回答内容は所属チーム内で共有されます。
            </p>
            <p className={styles.p}>
              ・配車や移動に伴う事故・トラブル等はチームおよび当事者間で対応するものとし、安全運転を徹底してください。
            </p>
          </div>
        </div>

        {/* 第3条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className="w-5 h-5 rounded-lg bg-rose-500/10 text-rose-600 text-[11px] font-black flex items-center justify-center">3</span>
            禁止事項
          </h3>
          <div className="space-y-1.5">
            {[
              "法令または公序良俗に違反する行為",
              "当運営または第三者の権利・プライバシーを侵害する行為",
              "虚偽の情報登録やなりすまし行為",
              "サービスの運営を妨害する行為、不正アクセス"
            ].map((text, i) => (
              <div key={i} className={styles.li}>
                <Ban className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 第4条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className="w-5 h-5 rounded-lg bg-primary/10 text-primary text-[11px] font-black flex items-center justify-center">4</span>
            免責事項・規約変更・お問い合わせ
          </h3>
          <p className={styles.p}>
            当運営は、本サービスに起因して生じた損害について故意または重過失がある場合を除き責任を負いません。本規約は必要に応じて随時改訂されます。規約に関するお問い合わせは下記までご連絡ください。
          </p>
          <div className="p-3 rounded-2xl bg-muted/50 border border-border/50 space-y-1.5 text-xs">
            <div className="font-bold text-foreground">
              運営者: iS Baseball Lab（iScoreCloud 運営事務局）
            </div>
            <div className="text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <span>お問い合わせ窓口:</span>
              <a href="mailto:info@iscorecloud.com" className="text-primary font-black hover:underline">
                info@iscorecloud.com
              </a>
            </div>
          </div>
          <div className="pt-2 border-t border-border/40 text-[10px] font-bold text-muted-foreground flex justify-between">
            <span>制定: 2026年4月1日</span>
            <span>改訂: 2026年10月14日</span>
          </div>
        </div>

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}
