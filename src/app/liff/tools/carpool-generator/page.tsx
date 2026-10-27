// filepath: src/app/liff/tools/carpool-generator/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  LiffToolSubNav,
  LiffToolOtherLinks,
} from "@/components/liff/LiffToolSubNav";
import {
  Wand2,
  Car,
  Users,
  ClipboardList,
  MessageCircleQuestion,
  ArrowRight,
  Package,
  CalendarCheck,
} from "lucide-react";

export default function LiffCarpoolGeneratorPage() {
  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="配車ジェネレータ"
          subtitle="CARPOOL PLANNER"
          icon={
            <span className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
              <Wand2 className="w-4 h-4" />
            </span>
          }
          rightElement={
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              要MTG・新規検討中
            </span>
          }
          showBack
        />

        {/* ツール切替ナビ */}
        <LiffToolSubNav />

        {/* ステータス・コンセプト概要バナー */}
        <section className="rounded-3xl bg-card border border-emerald-500/35 shadow-xs p-4 space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-black">
              NEW PROJECT
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] font-black">
              配車係と要ミーティング
            </span>
          </div>
          <h2 className="text-xs font-black text-foreground">
            配車係の負担を軽減するためゼロベースで新規設計予定
          </h2>
          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
            WEB版の既存機能にとらわれず、実際の配車担当者のやり方や困りごとをヒアリングした上で、出欠・車出し回答から乗車割り作成までを一番ラクに回せる仕組みを検討します。
          </p>
        </section>

        {/* 想定ワークフロー枠（たたき台） */}
        <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-foreground">
              想定ワークフロー（たたき台枠）
            </h3>
            <span className="text-[10px] font-bold text-muted-foreground">
              ヒアリング用ラフ
            </span>
          </div>

          <div className="space-y-2.5">
            {[
              {
                icon: CalendarCheck,
                step: "1. 遠征・試合予定と出欠データの読み込み",
                desc: "対象日の参加選手・帯同保護者・車出し可能台数（プロフィール登録車両・定員）を自動で一覧化",
              },
              {
                icon: Package,
                step: "2. チーム固有の優先ルール・条件チェック",
                desc: "道具車・審判/当番の同乗・親子セット乗車・行きのみ/帰りのみ別行動などの条件を整理",
              },
              {
                icon: Users,
                step: "3. 乗車割り案の自動作成 ＆ かんたん入れ替え",
                desc: "定員に余裕を持たせた初期案をワンタップ生成し、スマホ上でメンバーをタップ入れ替え微調整",
              },
              {
                icon: Car,
                step: "4. 配車表への確定反映 ＆ LINE連絡文出力",
                desc: "確定した号車割りをそのままミニアプリの「配車表」へ公開し、集合案内も一括共有",
              },
            ].map((item) => {
              const StepIcon = item.icon;
              return (
                <div
                  key={item.step}
                  className="flex items-start gap-3 p-3 rounded-2xl bg-muted/40 border border-border/70"
                >
                  <span className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <StepIcon className="w-4 h-4" />
                  </span>
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs font-black text-foreground">
                      {item.step}
                    </p>
                    <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 配車係ミーティング用 確認アジェンダ枠 */}
        <section className="rounded-3xl bg-card border border-amber-500/30 shadow-xs p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircleQuestion className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-black text-foreground">
              配車係ミーティングでの確認ポイントメモ
            </h3>
          </div>

          <div className="space-y-2">
            {[
              "普段の配車組みで一番時間・神経を使っている作業はどこか？",
              "道具・バットケース・ジャグ等の積載による「実質乗車可能人数」の扱い",
              "車出し回数の偏り（前回出した家庭の考慮など）を見える化したいか？",
              "現地集合・片道のみ乗車・兄弟帯同などのイレギュラー対応パターン",
              "最終的な配車表の見せ方やLINEグループへの共有フォーマットの希望",
            ].map((agenda, idx) => (
              <div
                key={agenda}
                className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-amber-500/5 border border-amber-500/20"
              >
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <p className="text-[11px] font-bold text-foreground leading-relaxed">
                  {agenda}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Link
              href="/liff/carpool"
              className="py-2.5 px-3 rounded-2xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground flex items-center justify-between transition-all active:scale-98"
            >
              <span className="flex items-center gap-1.5 truncate">
                <ClipboardList className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate">現在の配車表</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </Link>

            <Link
              href="/liff/profile"
              className="py-2.5 px-3 rounded-2xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground flex items-center justify-between transition-all active:scale-98"
            >
              <span className="flex items-center gap-1.5 truncate">
                <Car className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate">マイカー設定</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </Link>
          </div>
        </section>

        {/* 他のツールへの回遊リンク */}
        <LiffToolOtherLinks />
      </div>
    </div>
  );
}

