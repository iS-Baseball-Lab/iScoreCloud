// filepath: src/app/liff/tools/news-generator/page.tsx
"use client";

import React, { useState } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  LiffToolSubNav,
  LiffToolOtherLinks,
} from "@/components/liff/LiffToolSubNav";
import {
  Megaphone,
  Copy,
  Share2,
  Zap,
  MessageSquarePlus,
  Check,
} from "lucide-react";

type SceneType = "start" | "inning" | "finish";

export default function LiffNewsGeneratorPage() {
  const [scene, setScene] = useState<SceneType>("inning");
  const [copiedDemo, setCopiedDemo] = useState(false);

  const samplePreviewText: Record<SceneType, string> = {
    start:
      "⚾【試合開始速報】\n春季大会 2回戦 vs 青葉スターズ\n📍 市民球場A面（先攻）\n\nまもなくプレイボールです！応援よろしくお願いします🔥",
    inning:
      "📣【3回表終了 途中経過】\n自チーム 4 - 1 青葉スターズ\n\n✨ ハイライト：\n2死満塁から4番の左中間タイムリー二塁打で2点追加！投げては先発が3回1失点の好投中です💪",
    finish:
      "🏆【試合終了】\n自チーム 6 - 2 青葉スターズ\n\n見事勝利しました！現地・LINEでの熱い応援ありがとうございました🙌",
  };

  const handleDemoCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(samplePreviewText[scene]);
      setCopiedDemo(true);
      setTimeout(() => setCopiedDemo(false), 2000);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="試合速報ジェネレータ"
          subtitle="QUICK NEWS GENERATOR"
          icon={
            <span className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center font-black">
              <Megaphone className="w-4 h-4" />
            </span>
          }
          rightElement={
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25">
              枠プレビュー・準備中
            </span>
          }
          showBack
        />

        {/* ツール切替ナビ */}
        <LiffToolSubNav />

        {/* コンセプト概要バナー */}
        <section className="rounded-3xl bg-card border border-rose-500/30 shadow-xs p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-black">
              CONCEPT
            </span>
            <h2 className="text-xs font-black text-foreground">
              スコア入力なしでも「簡易入力だけ」で速報を作れる専用設計
            </h2>
          </div>
          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
            WEB版のスコアデータ自動連動とは切り離し、ベンチや応援席の保護者がイニング・点数・一言メモを選ぶだけで、チームLINEへすぐ送れる見やすい速報文を組み立てます。
          </p>
        </section>

        {/* 簡易入力フォーム枠（ワイヤーフレーム） */}
        <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-rose-500" />
              <h3 className="text-sm font-black text-foreground">
                かんたん速報入力フォーム枠
              </h3>
            </div>
            <span className="text-[10px] font-bold text-muted-foreground">
              UIイメージ
            </span>
          </div>

          {/* ① シーン選択タブ */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-muted-foreground">
              1. 速報のタイミングを選択
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-muted/70 border border-border/60">
              {[
                { id: "start" as const, label: "試合開始" },
                { id: "inning" as const, label: "得点・経過" },
                { id: "finish" as const, label: "試合終了" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScene(tab.id)}
                  className={`py-2 px-2 rounded-xl text-xs transition-all cursor-pointer ${
                    scene === tab.id
                      ? "bg-card text-foreground font-black shadow-2xs"
                      : "text-muted-foreground font-bold"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ② 対戦相手・イニング・スコア簡易枠 */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-2xl bg-muted/40 border border-border/70 space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground block">
                2. 対戦相手・大会名
              </span>
              <p className="text-xs font-black text-foreground truncate">
                vs 青葉スターズ
              </p>
              <p className="text-[10px] font-bold text-muted-foreground">
                予定データから自動補完 or 手入力
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-muted/40 border border-border/70 space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground block">
                3. イニング・現在スコア
              </span>
              <p className="text-sm font-black text-foreground tracking-tight">
                3回表終了 / 4 - 1
              </p>
              <p className="text-[10px] font-bold text-muted-foreground">
                ＋/ー ボタンで片手カウント
              </p>
            </div>
          </div>

          {/* ③ 定型フレーズ＆選手名タップ挿入枠 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-muted-foreground">
                4. ひとことハイライト（定型タグ＋自由記述）
              </span>
              <MessageSquarePlus className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                "先制タイムリー！",
                "ナイスピッチング🔥",
                "好守備で無失点✨",
                "ホームラン⚾",
                "逆転成功！",
              ].map((chip) => (
                <span
                  key={chip}
                  className="px-2.5 py-1 rounded-full bg-muted/60 border border-border text-[10px] font-bold text-muted-foreground"
                >
                  ＋ {chip}
                </span>
              ))}
            </div>
            <div className="rounded-2xl bg-muted/35 border border-border/70 p-3 text-xs font-bold text-muted-foreground">
              選手名チップをタップして「#10 〇〇のタイムリーで2点追加！」のように素早く入力できる欄を配置予定
            </div>
          </div>
        </section>

        {/* LINE速報テキスト プレビュー枠 */}
        <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-foreground">
              生成される速報メッセージ例
            </h3>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              LINEトーク最適化フォーマット
            </span>
          </div>

          <pre className="rounded-2xl bg-muted/50 border border-border p-3.5 text-xs font-bold text-foreground whitespace-pre-wrap font-sans leading-relaxed">
            {samplePreviewText[scene]}
          </pre>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDemoCopy}
              className="py-2.5 px-3 rounded-2xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              {copiedDemo ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span>サンプルをコピー済</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-muted-foreground" />
                  <span>文面サンプルをコピー</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled
              className="py-2.5 px-3 rounded-2xl bg-emerald-600/50 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-not-allowed"
            >
              <Share2 className="w-4 h-4" />
              <span>LINEで送る（準備中）</span>
            </button>
          </div>
        </section>

        {/* 他のツールへの回遊リンク */}
        <LiffToolOtherLinks />
      </div>
    </div>
  );
}

