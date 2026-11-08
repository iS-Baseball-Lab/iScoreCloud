// filepath: src/app/liff/privacy/page.tsx
"use client";

import React from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { ShieldCheck, Lock, Fingerprint, Eye, Share2, UserCheck } from "lucide-react";

export default function LiffPrivacyPage() {
  const styles = {
    card: "p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3",
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
          title="プライバシーポリシー"
          subtitle="個人情報の取扱いと保護方針"
          icon={
            <span className="w-8 h-8 rounded-xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black">
              <ShieldCheck className="w-4 h-4" />
            </span>
          }
          showBack
        />

        {/* メインプライバシーポリシーカード */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-slate-500 px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-black text-white truncate">
                個人情報保護方針 本文
              </h2>
            </div>
            <span className="text-[10px] font-bold text-slate-300 shrink-0">
              改訂: 2026年10月14日
            </span>
          </div>

          <div className="p-4 space-y-4">
            {/* 前文 */}
            <div className="p-4 rounded-2xl border border-border border-l-4 border-l-slate-500 bg-muted/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-black text-foreground">
                <Lock className="w-4 h-4 text-primary" />
                <span>個人情報保護への取り組み</span>
              </div>
              <p className="text-xs leading-relaxed text-foreground/90 font-medium">
                iS Baseball Lab（以下「当運営」）は、「iScoreCloud LINEミニアプリ」およびWebサービス「iScoreCloud」（以下総称して「本サービス」）において、ユーザーの個人情報を適正に取り扱い、安全に管理いたします。
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
                安全管理・お問い合わせ窓口
              </h3>
              <p className={styles.p}>
                通信の暗号化（SSL/TLS）など適切なセキュリティ対策を講じています。保有個人データの開示・訂正・利用停止・削除等のご請求およびお問い合わせは、下記窓口までご連絡ください。
              </p>
              <div className="p-3 rounded-xl bg-muted/35 border border-border space-y-1.5 text-xs">
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
              <div className="pt-2 border-t border-border text-[10px] font-bold text-muted-foreground flex justify-between">
                <span>制定: 2026年4月1日</span>
                <span>改訂: 2026年10月14日</span>
              </div>
            </div>
          </div>
        </section>

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}
