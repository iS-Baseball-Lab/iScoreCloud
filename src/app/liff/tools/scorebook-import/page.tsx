// filepath: src/app/liff/tools/scorebook-import/page.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  LiffToolSubNav,
  LiffToolOtherLinks,
} from "@/components/liff/LiffToolSubNav";
import {
  ScanLine,
  Camera,
  ImagePlus,
  Sparkles,
  CheckCircle2,
  FileSpreadsheet,
  SlidersHorizontal,
  ArrowRight,
  Layers,
} from "lucide-react";

type SheetSide = "top" | "bottom";

export default function LiffScorebookImportPage() {
  const [selectedSide, setSelectedSide] = useState<SheetSide>("top");

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="スコアブック取り込み"
          subtitle="SCOREBOOK AI IMPORT"
          icon={
            <span className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black">
              <ScanLine className="w-4 h-4" />
            </span>
          }
          rightElement={
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25">
              枠プレビュー・準備中
            </span>
          }
          showBack
        />

        {/* ツール切替ナビ */}
        <LiffToolSubNav />

        {/* コンセプト概要バナー */}
        <section className="rounded-3xl bg-card border border-indigo-500/30 shadow-xs p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[10px] font-black">
              CONCEPT
            </span>
            <h2 className="text-xs font-black text-foreground">
              WEB版スコア取込の「精度向上版」をミニアプリに構築予定
            </h2>
          </div>
          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
            試合後にスマホで紙のスコアブックを撮影するだけで、打順・選手名・各打席の記録を高精度に読み取り、試合データ・個人成績へスムーズに反映できる画面枠です。
          </p>
        </section>

        {/* ステップ構成枠 */}
        <section className="grid grid-cols-3 gap-2">
          {[
            { step: "STEP 1", title: "撮影・選択", desc: "先攻/後攻シート" },
            { step: "STEP 2", title: "AI枠線・照合", desc: "名鑑と自動突合" },
            { step: "STEP 3", title: "確認・反映", desc: "要確認マスのみ修正" },
          ].map((item, idx) => (
            <div
              key={item.step}
              className={`rounded-2xl p-3 border text-center space-y-1 ${
                idx === 0
                  ? "bg-card border-indigo-500/40 shadow-2xs"
                  : "bg-card/70 border-border"
              }`}
            >
              <span className="text-[9px] font-black tracking-wider text-indigo-600 dark:text-indigo-400 block">
                {item.step}
              </span>
              <p className="text-xs font-black text-foreground">{item.title}</p>
              <p className="text-[10px] font-bold text-muted-foreground">
                {item.desc}
              </p>
            </div>
          ))}
        </section>

        {/* スコアブック画像取り込み UI枠（モック） */}
        <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-foreground">
                スコアシート画像の取り込み枠
              </h3>
              <p className="text-[11px] font-bold text-muted-foreground">
                見開き片面ずつ撮影することで認識精度を高めます
              </p>
            </div>
            <FileSpreadsheet className="w-5 h-5 text-indigo-500 shrink-0" />
          </div>

          {/* 先攻・後攻シート切替タブ枠 */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-muted/70 border border-border/60">
            <button
              type="button"
              onClick={() => setSelectedSide("top")}
              className={`py-2 px-3 rounded-xl text-xs transition-all cursor-pointer ${
                selectedSide === "top"
                  ? "bg-card text-foreground font-black shadow-2xs"
                  : "text-muted-foreground font-bold"
              }`}
            >
              先攻（表）シート
            </button>
            <button
              type="button"
              onClick={() => setSelectedSide("bottom")}
              className={`py-2 px-3 rounded-xl text-xs transition-all cursor-pointer ${
                selectedSide === "bottom"
                  ? "bg-card text-foreground font-black shadow-2xs"
                  : "text-muted-foreground font-bold"
              }`}
            >
              後攻（裏）シート
            </button>
          </div>

          {/* 撮影ガイド枠プレースホルダー */}
          <div className="rounded-2xl border-2 border-dashed border-indigo-500/35 bg-indigo-500/5 p-6 flex flex-col items-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-card border border-border shadow-2xs flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Camera className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-black text-foreground">
                {selectedSide === "top" ? "先攻（表）" : "後攻（裏）"}のスコアブック画像を選択
              </p>
              <p className="text-[11px] font-bold text-muted-foreground">
                四隅の枠線が入るように真上から撮影してください
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full pt-1">
              <button
                type="button"
                disabled
                className="py-2.5 px-3 rounded-xl bg-indigo-600/50 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
              >
                <Camera className="w-4 h-4" />
                <span>カメラ起動（準備中）</span>
              </button>
              <button
                type="button"
                disabled
                className="py-2.5 px-3 rounded-xl bg-card border border-border text-muted-foreground font-black text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
              >
                <ImagePlus className="w-4 h-4" />
                <span>アルバム選択</span>
              </button>
            </div>
          </div>

          {/* 紐付け先試合の選択枠イメージ */}
          <div className="rounded-2xl bg-muted/40 border border-border/70 p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-muted-foreground">
                  取り込み先の試合データ
                </p>
                <p className="text-xs font-black text-foreground truncate">
                  既存の試合予定に紐付け / 新規試合として登録
                </p>
              </div>
            </div>
            <span className="text-[10px] font-black text-muted-foreground px-2 py-1 rounded-lg bg-card border border-border shrink-0">
              選択枠
            </span>
          </div>
        </section>

        {/* WEB版からの精度向上予定ポイント */}
        <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-black text-foreground">
              実装予定の精度向上アプローチ
            </h3>
          </div>

          <div className="space-y-2">
            {[
              {
                title: "登録メンバー名鑑・背番号との自動マッチング",
                desc: "手書きの苗字や背番号のクセをチーム選手名鑑と突合し、誤認識を大幅に削減します。",
              },
              {
                title: "イニング合計得点・アウトカウントの整合性検証",
                desc: "1イニング3アウトや合計得点と各打席結果の矛盾を自動検知し、怪しいマスだけをハイライトします。",
              },
              {
                title: "迷ったマスだけ拡大表示するピンポイント補正UI",
                desc: "スマホの小さな画面でもタップ選択だけで素早く手直しできる確認画面を用意します。",
              },
            ].map((point) => (
              <div
                key={point.title}
                className="flex items-start gap-2.5 p-3 rounded-2xl bg-muted/35 border border-border/60"
              >
                <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-xs font-black text-foreground">
                    {point.title}
                  </p>
                  <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                    {point.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/liff/matches"
            className="w-full py-2.5 px-4 rounded-2xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground flex items-center justify-between transition-all active:scale-98"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
              現在の試合情報一覧を確認する
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        </section>

        {/* 他のツールへの回遊リンク */}
        <LiffToolOtherLinks />
      </div>
    </div>
  );
}

