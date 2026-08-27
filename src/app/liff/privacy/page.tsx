// filepath: src/app/liff/privacy/page.tsx
"use client";

import React from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { ShieldCheck, Lock, Fingerprint, Eye, Share2, UserCheck } from "lucide-react";

export default function LiffPrivacyPage() {
  const styles = {
    card: "p-4 rounded-3xl bg-card border-2 border-primary/20 shadow-xs space-y-3",
    h3: "text-sm font-black text-foreground flex items-center gap-2",
    p: "text-xs leading-relaxed text-muted-foreground",
    li: "text-xs leading-relaxed text-muted-foreground flex items-start gap-2",
  };

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader />

      <div className="p-4 space-y-5">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="プライバシーポリシー"
          subtitle="個人情報の取扱いと保護方針"
          icon={
            <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
              <ShieldCheck className="w-4 h-4" />
            </span>
          }
          showBack
        />

        {/* 前文 */}
        <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/20 space-y-2">
          <div className="flex items-center gap-2 text-xs font-black text-primary">
            <Lock className="w-4 h-4" />
            <span>個人情報保護への取り組み</span>
          </div>
          <p className="text-xs leading-relaxed text-foreground/90 font-medium">
            iS Baseball Lab（以下「当運営」）は、LINEミニアプリ「iScoreMini」およびWebサービス「iScoreCloud」において、ユーザーの個人情報を適正に取り扱い、安全に管理いたします。
          </p>
        </div>

        {/* 第1条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className="w-5 h-5 rounded-lg bg-primary/10 text-primary text-[11px] font-black flex items-center justify-center">1</span>
            収集する情報
          </h3>
          <p className={styles.p}>
            本サービスでは、チーム運営・出欠確認・配車調整・スコア共有のために以下の情報を取得します。
          </p>
          <div className="space-y-1.5 pt-1">
            <div className={styles.li}>
              <Fingerprint className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span><strong>LINE情報:</strong> LINEユーザーID、表示名、プロフィール画像</span>
            </div>
            <div className={styles.li}>
              <Fingerprint className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span><strong>出欠・配車情報:</strong> 参加/欠席ステータス、車出し可否、お当番割り当て</span>
            </div>
            <div className={styles.li}>
              <Fingerprint className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span><strong>チーム・試合記録:</strong> 所属チーム名、スコア、打撃成績、試合動画URL</span>
            </div>
          </div>
        </div>

        {/* 第2条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className="w-5 h-5 rounded-lg bg-primary/10 text-primary text-[11px] font-black flex items-center justify-center">2</span>
            利用目的
          </h3>
          <div className="space-y-2">
            {[
              "LINEミニアプリでのチーム認証およびメンバー管理",
              "ワンタップ出欠確認、配車表・お当番表の作成・共有",
              "スコアブック記録およびYouTube試合動画の閲覧",
              "LINE通知やお知らせによる円滑なチーム連絡",
              "お問い合わせ対応および不正利用防止"
            ].map((text, i) => (
              <div key={i} className={styles.li}>
                <Eye className="w-3.5 h-3.5 text-primary/70 shrink-0 mt-0.5" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 第3条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className="w-5 h-5 rounded-lg bg-primary/10 text-primary text-[11px] font-black flex items-center justify-center">3</span>
            第三者への提供
          </h3>
          <p className={styles.p}>
            法令に基づく場合を除き、ユーザー本人の同意を得ずに第三者へ個人情報を提供することはありません。
          </p>
        </div>

        {/* 第4条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className="w-5 h-5 rounded-lg bg-primary/10 text-primary text-[11px] font-black flex items-center justify-center">4</span>
            安全管理・お問い合わせ
          </h3>
          <p className={styles.p}>
            通信の暗号化（SSL/TLS）など適切なセキュリティ対策を講じています。開示・訂正・削除のご請求はチーム管理者またはお問い合わせ窓口へご連絡ください。
          </p>
          <div className="pt-2 border-t border-border/40 text-[10px] font-bold text-muted-foreground flex justify-between">
            <span>制定: 2026年4月1日</span>
            <span>改訂: 2026年8月27日</span>
          </div>
        </div>
      </div>
    </div>
  );
}
