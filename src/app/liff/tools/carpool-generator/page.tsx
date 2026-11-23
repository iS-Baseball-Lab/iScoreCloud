// filepath: src/app/liff/tools/carpool-generator/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiffPermissions } from "@/components/liff/LiffProvider";
import {
  ArrowRight,
  CalendarCheck,
  Car,
  CheckCircle2,
  ClipboardList,
  MapPin,
  Package,
  Plus,
  Send,
  Settings2,
} from "lucide-react";

export default function LiffCarpoolGeneratorPage() {
  const {
    canEditCarpool: permCanEditCarpool,
    canManageTeam,
    isDemoMode,
  } = useLiffPermissions();
  const canEditCarpool = permCanEditCarpool || canManageTeam || isDemoMode;
  const canManageMasters = canManageTeam || isDemoMode;

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="配車作成・運用ガイド"
          subtitle="遠征配車・道具積載チェック・LINE共有ランチャー"
          icon={
            <span className="w-8 h-8 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black">
              <Car className="w-4 h-4" />
            </span>
          }
          showBack
        />

        {/* メイン クイック起動ランチャー（A-3 上帯ダークキャップ × 純白ボディ） */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2 py-0.5 rounded bg-teal-500 text-slate-950 text-[11px] font-black shrink-0">
                🚗 クイック起動
              </span>
              <h2 className="text-xs font-black text-white truncate">
                かんたん配車作成 ＆ 当日配車表
              </h2>
            </div>
            <span className="text-[11px] font-bold text-teal-300 shrink-0">
              行き帰り・道具対応
            </span>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground leading-relaxed">
              出欠表の車出し回答・登録車両・道具マスタと自動連携し、<strong className="text-foreground">1号車〜N号車の乗車割当・道具積載分担・帰り便の個別変更・LINEグループ一括案内</strong>までスマホ1つで完結できます。
            </p>

            <div className="space-y-2">
              {canEditCarpool && (
                <Link
                  href="/liff/carpool?openEditor=1"
                  className="w-full h-11 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>かんたん配車作成を開く</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </Link>
              )}

              <Link
                href="/liff/carpool"
                className={`w-full h-10 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all ${
                  canEditCarpool
                    ? "border border-border bg-muted hover:bg-muted/80 text-foreground"
                    : "bg-teal-600 hover:bg-teal-700 text-white"
                }`}
              >
                <ClipboardList className="w-4 h-4 shrink-0" />
                <span>現在の配車表・積載チェックを見る</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </Link>
            </div>
          </div>
        </section>

        {/* 3ステップ チーム配車運用フロー */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
            <h3 className="text-sm font-black text-white">
              遠征・試合の配車運用 3ステップ
            </h3>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700 text-[10px] font-black">
              標準フロー
            </span>
          </div>

          <div className="p-4 space-y-3">
            {/* STEP 1 */}
            <div className="rounded-xl border border-border bg-muted/50 p-3.5 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#0f172a] text-teal-400 border border-teal-500/40 text-xs font-black flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                  1
                </span>
                <div className="min-w-0 space-y-1">
                  <h4 className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <CalendarCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span>出欠＆車出し可否の収集</span>
                  </h4>
                  <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                    活動予定で参加選手と保護者・指導者の「車出しOK」回答を集めます。回答された車両は配車作成画面の初期号車として自動セットされます。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <Link
                  href="/liff/schedule"
                  className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[11px] font-black flex items-center justify-between transition-colors"
                >
                  <span className="truncate">活動予定・出欠へ</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </Link>
                <Link
                  href="/liff/profile"
                  className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[11px] font-black flex items-center justify-between transition-colors"
                >
                  <span className="truncate">マイカー登録へ</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </Link>
              </div>
            </div>

            {/* STEP 2 */}
            <div className="rounded-xl border border-border bg-muted/50 p-3.5 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#0f172a] text-amber-400 border border-amber-500/40 text-xs font-black flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                  2
                </span>
                <div className="min-w-0 space-y-1">
                  <h4 className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <Settings2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>車両・道具マスタ事前登録</span>
                  </h4>
                  <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                    チームの共有車両（マイクロバス・道具車）や、遠征に持参する道具・備品（テント・防具・ジャグ等の重量物）を登録しておくと1タップで割り当てられます。
                  </p>
                </div>
              </div>

              {canManageMasters ? (
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <Link
                    href="/liff/admin/cars"
                    className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[11px] font-black flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-1 truncate">
                      <Car className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span className="truncate">車両マスタ管理</span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </Link>
                  <Link
                    href="/liff/admin/equipments"
                    className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[11px] font-black flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-1 truncate">
                      <Package className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="truncate">道具マスタ管理</span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </Link>
                </div>
              ) : (
                <p className="text-[10.5px] font-bold text-muted-foreground px-1">
                  ※ 車両・道具マスタの編集はチーム管理者・指導者メニューから行えます
                </p>
              )}
            </div>

            {/* STEP 3 */}
            <div className="rounded-xl border border-border bg-muted/50 p-3.5 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#0f172a] text-emerald-400 border border-emerald-500/40 text-xs font-black flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                  3
                </span>
                <div className="min-w-0 space-y-1">
                  <h4 className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>行き帰り配車割当・道具積載チェック・LINE共有</span>
                  </h4>
                  <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                    空席への1タップ自動セットや帰り便の個別変更に対応。当日は号車ごとに「積載完了／回収完了」をチェックでき、隊列ライブマップとLINE案内文で安全に運行できます。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                <Link
                  href="/liff/carpool"
                  className="h-9 px-3 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-[11px] font-black flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span className="truncate">配車表・積載チェック・隊列マップ</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                </Link>
                <Link
                  href="/liff/grounds"
                  className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[11px] font-black flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Send className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span className="truncate">球場マスタ（駐車台数規定）</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="h-8 w-full shrink-0 pointer-events-none select-none" aria-hidden="true" />
      </div>
    </div>
  );
}
