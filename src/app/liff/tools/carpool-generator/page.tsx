// filepath: src/app/liff/tools/carpool-generator/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
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
            <span className="w-8 h-8 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black">
              <Wand2 className="w-4 h-4" />
            </span>
          }
          rightElement={
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              要MTG・新規検討中
            </span>
          }
          showBack
        />

        {/* 🚗 簡易配車（今すぐ使える配車作成・編集）起動カード */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
            <span className="px-2 py-0.5 rounded bg-teal-500 text-slate-950 text-[11px] font-black">
              🚗 利用可能
            </span>
            <span className="text-xs font-black text-slate-200">
              1号車〜N号車 簡易配車エディタ
            </span>
          </div>
          <div className="p-4 space-y-3">
            <div className="space-y-1">
              <h2 className="text-xs font-black text-foreground">
                簡易配車（手動割当・空席への自動セット）で今すぐ配車表を作成
              </h2>
              <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                フル自動ジェネレータの仕様検討中も、遠征・試合ごとの「1号車〜N号車（運転手・車両・定員・道具車・乗車メンバー）」をすぐに登録・編集でき、隊列ライブマップ（Googleマップ位置共有）や試合カードへ自動連携します。
              </p>
            </div>
            <Link
              href="/liff/carpool?openEditor=1"
              className="w-full h-10 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
            >
              <Car className="w-4 h-4 shrink-0" />
              <span>簡易配車を作成・編集する</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </Link>
          </div>
        </section>

        {/* ステータス・コンセプト概要バナー */}
        <section className="rounded-2xl border border-border bg-card shadow-xs p-4 space-y-2.5 overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-lg bg-teal-500/12 text-teal-600 dark:text-teal-400 text-[10px] font-black">
              NEW PROJECT
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-black">
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
        <section className="rounded-2xl border border-border bg-card shadow-xs p-4 space-y-3.5 overflow-hidden">
          <div className="-mx-4 -mt-4 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-white">
              想定ワークフロー（たたき台枠）
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40 text-[10px] font-bold">
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
                  className="flex items-start gap-3 p-3 rounded-xl bg-muted border border-border"
                >
                  <span className="w-8 h-8 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
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
        <section className="rounded-2xl border border-border bg-card shadow-xs p-4 space-y-3 overflow-hidden">
          <div className="-mx-4 -mt-4 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/40 flex items-center justify-center">
              <MessageCircleQuestion className="w-3.5 h-3.5" />
            </span>
            <h3 className="text-xs font-black text-white">
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
                className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted border border-border"
              >
                <span className="w-5 h-5 rounded-full bg-teal-500/12 text-teal-600 dark:text-teal-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
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
              className="py-2.5 px-3 rounded-2xl bg-card hover:bg-muted hover:border-teal-500/40 border border-border text-xs font-black text-foreground flex items-center justify-between transition-all active:scale-98"
            >
              <span className="flex items-center gap-1.5 truncate">
                <span className="w-6 h-6 rounded-lg bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-3.5 h-3.5" />
                </span>
                <span className="truncate">現在の配車表</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </Link>

            <Link
              href="/liff/profile"
              className="py-2.5 px-3 rounded-2xl bg-card hover:bg-muted hover:border-teal-500/40 border border-border text-xs font-black text-foreground flex items-center justify-between transition-all active:scale-98"
            >
              <span className="flex items-center gap-1.5 truncate">
                <span className="w-6 h-6 rounded-lg bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <Car className="w-3.5 h-3.5" />
                </span>
                <span className="truncate">マイカー設定</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </Link>
          </div>
        </section>

        <div className="h-8 w-full shrink-0 pointer-events-none select-none" aria-hidden="true" />
      </div>
    </div>
  );
}

