// filepath: src/components/liff/MatchDayOpsSection.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ClipboardList,
  ShieldCheck,
  Clock,
  MapPin,
  Shirt,
  Utensils,
  Car,
  Package,
  Copy,
  Check,
  Edit3,
  Plus,
  X,
  Zap,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Users,
  AlertCircle,
  Loader2,
  Share2,
  ParkingCircle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/EmptyState";
import { cn } from "@/lib/utils";
import type {
  MatchCarpoolMode,
  MatchDayOps,
  MatchMealOption,
  MatchStaffRoleAssignment,
} from "@/types/match";
import {
  DEFAULT_MATCH_STAFF_ROLES,
  GATHER_PLACE_QUICK_PRESETS,
  MEAL_OPTION_ITEMS,
  UNIFORM_QUICK_PRESETS,
  findMyAssignedStaffRoles,
  findMyFamilyCarpoolMatches,
  getFilledStaffRoles,
  hasAnyGuidebookContent,
  isAssigneeMatchingIdentity,
  normalizeUnifiedStaffRoles,
  resolveEffectiveMealLabel,
  type LiffAdultMemberOption,
  type LiffMatchScheduleSyncInfo,
  type LiffMyMatchIdentity,
} from "@/lib/liff/match-day-ops";

export type MatchDayOpsEditorTab = "guide" | "roles" | "carpool";

interface MatchDayGuideAndRolesSectionProps {
  ops: MatchDayOps | null | undefined;
  scheduleSync: LiffMatchScheduleSyncInfo | null;
  myIdentity: LiffMyMatchIdentity | null;
  isPreMatchMode: boolean;
  hasSeparateCarpoolCard: boolean;
  preMatchShareText: string;
  onOpenEditor: (initialTab?: MatchDayOpsEditorTab) => void;
}

export function MatchDayGuideAndRolesSection({
  ops,
  scheduleSync,
  myIdentity,
  isPreMatchMode,
  hasSeparateCarpoolCard,
  preMatchShareText,
  onOpenEditor,
}: MatchDayGuideAndRolesSectionProps) {
  const [isShareCopied, setIsShareCopied] = useState(false);

  const filledRoles = useMemo(() => getFilledStaffRoles(ops), [ops]);
  const myAssignedRoles = useMemo(
    () => findMyAssignedStaffRoles(ops, myIdentity),
    [ops, myIdentity]
  );

  // 試合中・試合後モード：役割記録がない過去試合では一切ノイズを出さず非表示
  if (!isPreMatchMode) {
    if (filledRoles.length === 0) return null;

    return (
      <section aria-label="試合運営・協力スタッフ記録" className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground min-w-0">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">試合運営・協力スタッフ記録</span>
          </h2>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-slate-500 px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-black text-white truncate">
                審判・スコア・運営スタッフ記録
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black font-mono tabular-nums shrink-0">
                {filledRoles.length}枠
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenEditor("roles")}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-[11px] font-black transition-all active:scale-95 shrink-0 cursor-pointer"
            >
              <Edit3 className="w-3 h-3 text-amber-400" />
              <span>編集</span>
            </button>
          </div>

          <div className="p-3.5 divide-y divide-border">
            {filledRoles.map((role) => (
              <div
                key={role.roleKey}
                className="py-2 first:pt-0 last:pb-0 flex items-start justify-between gap-2.5 text-xs"
              >
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted border border-border text-[11px] font-black text-foreground shrink-0">
                  {role.roleLabel}
                </span>
                <div className="flex-1 min-w-0 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {role.assignees.length > 0 ? (
                      role.assignees.map((person) => {
                        const isMe = isAssigneeMatchingIdentity(person, myIdentity);
                        return (
                          <span
                            key={`${role.roleKey}-${person}`}
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black",
                              isMe
                                ? "bg-amber-400 text-slate-950 border border-amber-500"
                                : "bg-primary/10 text-primary border border-primary/25"
                            )}
                          >
                            {isMe && <Zap className="w-3 h-3 shrink-0" />}
                            <span>{person}</span>
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-[11px] font-bold text-muted-foreground">
                        担当メモ参照
                      </span>
                    )}
                  </div>
                  {role.note && (
                    <p className="text-[10px] font-bold text-muted-foreground mt-0.5">
                      {role.note}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ━━━ 以下：試合前・雨天中止モード（しおり ＋ お父さん/保護者役割担当 ＋ 前日LINE連絡文） ━━━
  const gatherTime = ops?.gatherTime || scheduleSync?.gatherTime || "";
  const gatherPlace = ops?.gatherPlace || scheduleSync?.gatherLocation || "";
  const effectiveMeal = resolveEffectiveMealLabel(ops, scheduleSync);
  const isMealFromSchedule =
    (!ops?.meal || ops.meal === "none") && Boolean(effectiveMeal);
  const hasGuideOrRoles = hasAnyGuidebookContent(ops, scheduleSync);

  const handleCopyAnnouncement = () => {
    if (!preMatchShareText) return;
    navigator.clipboard.writeText(preMatchShareText);
    setIsShareCopied(true);
    toast.success("LINE連絡用の案内文をコピーしました");
    setTimeout(() => setIsShareCopied(false), 2200);
  };

  const lineShareHref = `https://line.me/R/share?text=${encodeURIComponent(
    preMatchShareText
  )}`;

  return (
    <section aria-label="当日のしおり・役割担当" className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground min-w-0">
          <ClipboardList className="w-4 h-4 text-primary shrink-0" />
          <span className="truncate">当日のしおり・審判/スコア担当</span>
        </h2>

        {!hasSeparateCarpoolCard && ops?.carpoolMode !== "none" && (
          <button
            type="button"
            onClick={() => onOpenEditor("carpool")}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[11px] font-bold transition-all active:scale-95 shrink-0 shadow-2xs cursor-pointer"
          >
            <Car className="w-3 h-3 text-teal-600 dark:text-teal-400" />
            <span>配車・道具車設定</span>
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        {/* A-3 上帯ダークソリッドキャップ（しおり・役割 = border-amber-500） */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardList className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-black text-white truncate">
              集合・持ち物・保護者役割分担
            </span>
            {filledRoles.length > 0 && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black font-mono tabular-nums shrink-0">
                担当 {filledRoles.length}枠
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onOpenEditor("guide")}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-[11px] font-black transition-all active:scale-95 shrink-0 cursor-pointer"
          >
            <Edit3 className="w-3 h-3 text-amber-400" />
            <span>{hasGuideOrRoles ? "編集" : "設定"}</span>
          </button>
        </div>

        <div className="p-3.5 space-y-3.5">
          {/* ⚡ ログイン保護者の担当ロール自動ハイライト */}
          {myAssignedRoles.length > 0 && (
            <div className="rounded-xl bg-amber-500/12 border-2 border-amber-500 p-3 flex items-start gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[11px] font-black text-amber-800 dark:text-amber-300 leading-none">
                  本日あなたの担当ロール
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {myAssignedRoles.map((r) => (
                    <span
                      key={`my-${r.roleKey}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-xs font-black"
                    >
                      <span>{r.roleLabel}</span>
                      {r.note && (
                        <span className="text-[10px] font-bold opacity-85">
                          ({r.note})
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!hasGuideOrRoles ? (
            <div className="space-y-3">
              <EmptyState
                icon={ClipboardList}
                title="当日の集合・審判/スコア担当が未設定です"
                description="集合時刻・ユニフォーム・弁当や、審判・スコアラー・BSO・LINE速報・ブザー・動画撮影の担当を1タップで共有できます"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onOpenEditor("guide")}
                  className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs hover:bg-primary/90 active:scale-95 transition-all cursor-pointer"
                >
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                  <span>集合・しおり設定</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenEditor("roles")}
                  className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>審判・担当を割当</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ① 集合・服装・昼食・連絡事項グリッド */}
              {(gatherTime ||
                gatherPlace ||
                ops?.uniform ||
                effectiveMeal ||
                ops?.mealNote ||
                scheduleSync?.dutyGroup ||
                ops?.belongingsNote) && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(gatherTime || gatherPlace) && (
                      <div className="p-2.5 rounded-xl bg-muted/50 border border-border flex items-start gap-2">
                        <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-muted-foreground block">
                            集合・出発
                          </span>
                          {gatherTime && (
                            <p className="text-xs font-black text-foreground tabular-nums leading-snug">
                              {gatherTime}
                            </p>
                          )}
                          {gatherPlace && (
                            <p className="text-[11px] font-bold text-foreground/85 leading-snug break-words">
                              ＠{gatherPlace}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {ops?.uniform && (
                      <div className="p-2.5 rounded-xl bg-muted/50 border border-border flex items-start gap-2">
                        <Shirt className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-muted-foreground block">
                            着用ユニフォーム・服装
                          </span>
                          <p className="text-xs font-black text-foreground leading-snug break-words">
                            {ops.uniform}
                          </p>
                        </div>
                      </div>
                    )}

                    {(effectiveMeal || ops?.mealNote) && (
                      <div className="p-2.5 rounded-xl bg-muted/50 border border-border flex items-start gap-2">
                        <Utensils className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-muted-foreground">
                              昼食・捕食
                            </span>
                            {isMealFromSchedule && (
                              <span className="px-1.5 py-0.2 rounded bg-teal-500/15 text-teal-700 dark:text-teal-300 text-[9px] font-black">
                                日程連動
                              </span>
                            )}
                          </div>
                          {effectiveMeal && (
                            <p className="text-xs font-black text-foreground leading-snug">
                              {effectiveMeal}
                            </p>
                          )}
                          {ops?.mealNote && (
                            <p className="text-[11px] font-bold text-muted-foreground leading-snug break-words">
                              {ops.mealNote}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {scheduleSync?.dutyGroup && (
                      <div className="p-2.5 rounded-xl bg-muted/50 border border-border flex items-start gap-2">
                        <Users className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-muted-foreground block">
                            当番グループ（日程連動）
                          </span>
                          <p className="text-xs font-black text-foreground leading-snug break-words">
                            {scheduleSync.dutyGroup}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {ops?.belongingsNote && (
                    <div className="p-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/30 border-l-4 border-l-amber-500 text-xs">
                      <span className="text-[10px] font-black text-amber-800 dark:text-amber-300 block mb-0.5">
                        📌 持ち物・当日連絡メモ
                      </span>
                      <p className="font-bold text-foreground whitespace-pre-line leading-relaxed text-[11px]">
                        {ops.belongingsNote}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ② お父さん・保護者の当日運営役割テーブル */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>審判・スコアラー・運営担当</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenEditor("roles")}
                    className="text-[11px] font-black text-primary hover:underline cursor-pointer"
                  >
                    {filledRoles.length > 0 ? "役割を変更" : "＋ 担当を割り当てる"}
                  </button>
                </div>

                {filledRoles.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => onOpenEditor("roles")}
                    className="w-full rounded-xl bg-muted/40 hover:bg-muted/70 border border-dashed border-border p-3 text-center transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-black text-foreground">
                      審判・スコアラー・BSO・LINE速報・ブザー・動画撮影の担当を登録
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground mt-0.5">
                      タップして保護者メンバーから1タップ選択できます
                    </p>
                  </button>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden bg-card divide-y divide-border">
                    {filledRoles.map((role) => (
                      <div
                        key={role.roleKey}
                        className="px-3 py-2 flex items-start justify-between gap-2 odd:bg-card even:bg-muted/30"
                      >
                        <div className="min-w-0 shrink-0 pt-0.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-900 text-white dark:bg-slate-800 text-[11px] font-black leading-tight">
                            {role.roleLabel}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {role.assignees.length > 0 ? (
                              role.assignees.map((person) => {
                                const isMe = isAssigneeMatchingIdentity(
                                  person,
                                  myIdentity
                                );
                                return (
                                  <span
                                    key={`${role.roleKey}-${person}`}
                                    className={cn(
                                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-black",
                                      isMe
                                        ? "bg-amber-400 text-slate-950 border border-amber-500 shadow-2xs"
                                        : "bg-primary/10 text-primary border border-primary/25"
                                    )}
                                  >
                                    {isMe && <Zap className="w-3 h-3 shrink-0" />}
                                    <span>{person}</span>
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-[11px] font-bold text-muted-foreground">
                                調整中
                              </span>
                            )}
                          </div>
                          {role.note && (
                            <p className="text-[10px] font-bold text-muted-foreground mt-0.5 break-words">
                              {role.note}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ③ 前日・当日連絡用のLINEグループ共有バー（公式LINEソリッド #06C755） */}
          <div className="pt-2.5 border-t border-border space-y-1.5">
            <p className="text-[10px] font-bold text-muted-foreground px-0.5">
              集合・役割担当・駐車場/スパイク注意・地図URLをまとめてLINE連絡文に整形します
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyAnnouncement}
                className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
              >
                {isShareCopied ? (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span>{isShareCopied ? "コピー完了" : "連絡文をコピー"}</span>
              </button>

              <a
                href={lineShareHref}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
              >
                <Share2 className="w-3.5 h-3.5 shrink-0" />
                <span>LINEで共有</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface MatchCarpoolSummarySectionProps {
  ops: MatchDayOps | null | undefined;
  scheduleSync: LiffMatchScheduleSyncInfo | null;
  myIdentity: LiffMyMatchIdentity | null;
  venueParkingInfo?: string | null;
  onOpenEditor: (initialTab?: MatchDayOpsEditorTab) => void;
}

export function shouldShowMatchCarpoolCard(
  ops: MatchDayOps | null | undefined,
  scheduleSync: LiffMatchScheduleSyncInfo | null
): boolean {
  const mode = ops?.carpoolMode || "auto";
  if (mode === "none") return false;
  if (
    mode === "away_carpool" ||
    mode === "local_gather" ||
    mode === "no_carpool"
  ) {
    return true;
  }
  if (scheduleSync && scheduleSync.cars.length > 0) return true;
  if (ops?.carLimitNote || ops?.cargoCarMember || ops?.carpoolSummaryNote) {
    return true;
  }
  return false;
}

export function MatchCarpoolSummarySection({
  ops,
  scheduleSync,
  myIdentity,
  venueParkingInfo,
  onOpenEditor,
}: MatchCarpoolSummarySectionProps) {
  const cars = useMemo(() => scheduleSync?.cars || [], [scheduleSync]);
  const myFamilyCars = useMemo(
    () => findMyFamilyCarpoolMatches(cars, myIdentity),
    [cars, myIdentity]
  );

  if (!shouldShowMatchCarpoolCard(ops, scheduleSync)) {
    return null;
  }

  const totalPassengers = cars.reduce((sum, c) => sum + c.passengers.length, 0);
  const autoCargoDrivers = cars
    .filter((c) => c.isCargo)
    .map((c) => c.driverName)
    .join("・");
  const effectiveCargo = ops?.cargoCarMember || autoCargoDrivers || "";
  const effectiveCarLimit =
    ops?.carLimitNote ||
    (venueParkingInfo &&
    venueParkingInfo !== "駐車場ルールは管理者にお問い合わせください"
      ? venueParkingInfo
      : "");

  const isLocalGather = ops?.carpoolMode === "local_gather";
  const isNoCarpool = ops?.carpoolMode === "no_carpool";
  const hideVehicleBreakdown = isLocalGather || isNoCarpool;
  const carpoolPageHref = scheduleSync?.eventId
    ? `/liff/carpool?eventId=${encodeURIComponent(scheduleSync.eventId)}`
    : "/liff/carpool";

  return (
    <section aria-label="遠征・配車サマリー" className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground min-w-0">
          <Car className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <span className="truncate">遠征・配車サマリー</span>
        </h2>

        {!isNoCarpool && (
          <Link
            href="/liff/tools/carpool-generator"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[11px] font-bold transition-all active:scale-95 shrink-0 shadow-2xs"
          >
            <Sparkles className="w-3 h-3 text-teal-600 dark:text-teal-400" />
            <span>自動配車ツール</span>
          </Link>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        {/* A-3 上帯ダークキャップ（配車・施設系 = border-teal-500） */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Car className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="text-xs font-black text-white truncate">
              {isNoCarpool
                ? "配車案内（本日は配車なし）"
                : isLocalGather
                ? "現地集合・駐車案内"
                : "遠征配車・乗り合い案内"}
            </span>
            {isNoCarpool ? (
              <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black shrink-0">
                配車なし
              </span>
            ) : (
              cars.length > 0 && (
                <span className="px-2 py-0.5 rounded bg-teal-500 text-slate-950 text-[10px] font-black font-mono tabular-nums shrink-0">
                  {cars.length}台 / {totalPassengers}名乗車
                </span>
              )
            )}
          </div>

          <button
            type="button"
            onClick={() => onOpenEditor("carpool")}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-[11px] font-black transition-all active:scale-95 shrink-0 cursor-pointer"
          >
            <Edit3 className="w-3 h-3 text-teal-400" />
            <span>編集</span>
          </button>
        </div>

        <div className="p-3.5 space-y-3">
          {/* 🚗 ログイン家族の乗車号車ハイライト */}
          {!hideVehicleBreakdown && myFamilyCars.length > 0 && (
            <div className="rounded-xl bg-teal-500/12 border-2 border-teal-600 p-3 flex items-start gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Car className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[11px] font-black text-teal-800 dark:text-teal-300 leading-none">
                  ご家族の配車・乗車車両
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {myFamilyCars.map((mc) => (
                    <span
                      key={`mycar-${mc.carNumber}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-600 text-white text-xs font-black"
                    >
                      <span>
                        {mc.carNumber}号車（{mc.driverName}）
                      </span>
                      <span className="text-[10px] font-bold opacity-90">
                        {mc.isDriver ? "・運転担当" : `・${mc.matchedName}`}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isNoCarpool && (
            <div className="p-3 rounded-xl bg-muted border-2 border-slate-400 dark:border-slate-600 flex items-start gap-2.5">
              <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-black shrink-0 mt-0.5">
                配車なし
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground leading-snug">
                  この試合はチーム配車を行いません
                </p>
                <p className="text-[10.5px] font-bold text-muted-foreground mt-0.5 leading-snug">
                  各自での移動・集合をお願いします
                </p>
              </div>
            </div>
          )}

          {isLocalGather && (
            <div className="p-2.5 rounded-xl bg-muted/60 border border-border flex items-center gap-2 text-xs font-black text-foreground">
              <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>この試合は「現地集合（各自移動）」です</span>
            </div>
          )}

          {/* 台数制限・道具車・配車メモ */}
          {(effectiveCarLimit || effectiveCargo || ops?.carpoolSummaryNote) && (
            <div className="grid grid-cols-1 gap-2 text-xs">
              {effectiveCarLimit && (
                <div className="p-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/30 flex items-start gap-2">
                  <ParkingCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-black text-amber-800 dark:text-amber-300 block">
                      駐車台数制限・ルール
                    </span>
                    <p className="text-xs font-black text-foreground leading-snug break-words">
                      {effectiveCarLimit}
                    </p>
                  </div>
                </div>
              )}

              {effectiveCargo && (
                <div className="p-2.5 rounded-xl bg-muted/50 border border-border flex items-start gap-2">
                  <Package className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-muted-foreground block">
                      道具車（テント・バットケース・ジャグ積載）
                    </span>
                    <p className="text-xs font-black text-foreground leading-snug break-words">
                      {effectiveCargo}
                    </p>
                  </div>
                </div>
              )}

              {ops?.carpoolSummaryNote && (
                <div className="p-2.5 rounded-xl bg-muted/50 border border-border text-[11px] font-bold text-foreground whitespace-pre-line">
                  💬 {ops.carpoolSummaryNote}
                </div>
              )}
            </div>
          )}

          {/* 車両一覧コンパクトサマリー */}
          {!hideVehicleBreakdown && cars.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-black text-muted-foreground px-0.5 block">
                号車別サマリー
              </span>
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border bg-card">
                {cars.map((car) => {
                  const isMyCar = myFamilyCars.some(
                    (mc) => mc.carNumber === car.carNumber
                  );
                  return (
                    <div
                      key={car.carNumber}
                      className={cn(
                        "px-3 py-2 flex items-center justify-between gap-2 text-xs",
                        isMyCar ? "bg-teal-500/[0.08]" : "odd:bg-card even:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-md bg-teal-600 text-white font-mono tabular-nums text-[11px] font-black inline-flex items-center justify-center shrink-0">
                          {car.carNumber}
                        </span>
                        <span className="font-black text-foreground truncate">
                          {car.driverName}
                        </span>
                        {car.isCargo && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black shrink-0">
                            📦道具車
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-black font-mono tabular-nums text-muted-foreground shrink-0">
                        {car.passengers.length}/{car.capacity}名
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 配車表詳細への遷移アクション */}
          {!hideVehicleBreakdown && (
            <div className="pt-2 border-t border-border flex items-center gap-2">
              <Link
                href={carpoolPageHref}
                className="flex-1 h-9 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
              >
                <Car className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {cars.length > 0 ? "配車表・同乗者を確認" : "配車表ページを開く"}
                </span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface EditableStaffRoleRow {
  roleKey: string;
  roleLabel: string;
  shortHint: string;
  notePlaceholder: string;
  assignees: string[];
  note: string;
  isCustom?: boolean;
}

interface MatchDayOpsEditorModalProps {
  isOpen: boolean;
  initialTab: MatchDayOpsEditorTab;
  matchId: string;
  opponentName: string;
  ops: MatchDayOps | null | undefined;
  adultMembers: LiffAdultMemberOption[];
  scheduleSync: LiffMatchScheduleSyncInfo | null;
  venueParkingInfo?: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (nextOps: MatchDayOps) => Promise<void>;
}

export function MatchDayOpsEditorModal({
  isOpen,
  initialTab,
  matchId,
  opponentName,
  ops,
  adultMembers,
  scheduleSync,
  venueParkingInfo,
  isSaving,
  onClose,
  onSave,
}: MatchDayOpsEditorModalProps) {
  const [activeTab, setActiveTab] = useState<MatchDayOpsEditorTab>(initialTab);
  const [gatherTime, setGatherTime] = useState("");
  const [gatherPlace, setGatherPlace] = useState("");
  const [uniform, setUniform] = useState("");
  const [meal, setMeal] = useState<MatchMealOption>("none");
  const [mealNote, setMealNote] = useState("");
  const [belongingsNote, setBelongingsNote] = useState("");

  const [carpoolMode, setCarpoolMode] = useState<MatchCarpoolMode>("auto");
  const [carLimitNote, setCarLimitNote] = useState("");
  const [cargoCarMember, setCargoCarMember] = useState("");
  const [carpoolSummaryNote, setCarpoolSummaryNote] = useState("");

  const [roleRows, setRoleRows] = useState<EditableStaffRoleRow[]>([]);
  const [expandedRoleKey, setExpandedRoleKey] = useState<string>("umpire");
  const [showFathersFirstOnly, setShowFathersFirstOnly] = useState<boolean>(false);
  const [customAssigneeInput, setCustomAssigneeInput] = useState<string>("");
  const [newCustomRoleLabel, setNewCustomRoleLabel] = useState<string>("");

  // モーダルオープン時または対象試合変更時にフォーム値を同期
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setGatherTime(ops?.gatherTime || "");
    setGatherPlace(ops?.gatherPlace || "");
    setUniform(ops?.uniform || "");
    setMeal(ops?.meal || "none");
    setMealNote(ops?.mealNote || "");
    setBelongingsNote(ops?.belongingsNote || "");

    setCarpoolMode(ops?.carpoolMode || "auto");
    setCarLimitNote(ops?.carLimitNote || "");
    setCargoCarMember(ops?.cargoCarMember || "");
    setCarpoolSummaryNote(ops?.carpoolSummaryNote || "");

    const existingList = normalizeUnifiedStaffRoles(ops?.staffRoles);
    const existingByKey = new Map<string, MatchStaffRoleAssignment>();
    for (const r of existingList) {
      existingByKey.set(r.roleKey, r);
    }

    const mergedRows: EditableStaffRoleRow[] = DEFAULT_MATCH_STAFF_ROLES.map(
      (preset) => {
        const saved =
          existingByKey.get(preset.roleKey) ||
          existingList.find((x) => x.roleLabel === preset.roleLabel);
        if (saved) {
          existingByKey.delete(saved.roleKey);
        }
        return {
          roleKey: preset.roleKey,
          roleLabel: preset.roleLabel,
          shortHint: preset.shortHint,
          notePlaceholder: preset.notePlaceholder,
          assignees: saved ? [...saved.assignees] : [],
          note: saved?.note || "",
        };
      }
    );

    for (const leftover of existingByKey.values()) {
      mergedRows.push({
        roleKey: leftover.roleKey,
        roleLabel: leftover.roleLabel,
        shortHint: "カスタム役割",
        notePlaceholder: "補足メモ（任意）",
        assignees: [...leftover.assignees],
        note: leftover.note || "",
        isCustom: true,
      });
    }

    setRoleRows(mergedRows);
    setExpandedRoleKey(mergedRows[0]?.roleKey || "umpire");
    setCustomAssigneeInput("");
    setNewCustomRoleLabel("");
  }, [isOpen, initialTab, matchId, ops]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  const visibleAdultMembers = useMemo(() => {
    if (!showFathersFirstOnly) return adultMembers;
    const filtered = adultMembers.filter((m) => m.isFatherOrStaff);
    return filtered.length > 0 ? filtered : adultMembers;
  }, [adultMembers, showFathersFirstOnly]);

  if (!mounted || !isOpen) return null;

  const toggleRoleAssignee = (roleKey: string, memberName: string) => {
    setRoleRows((prev) =>
      prev.map((row) => {
        if (row.roleKey !== roleKey) return row;
        const exists = row.assignees.includes(memberName);
        return {
          ...row,
          assignees: exists
            ? row.assignees.filter((n) => n !== memberName)
            : [...row.assignees, memberName],
        };
      })
    );
  };

  const handleAddCustomAssignee = (roleKey: string) => {
    const clean = customAssigneeInput.trim();
    if (!clean) return;
    setRoleRows((prev) =>
      prev.map((row) => {
        if (row.roleKey !== roleKey) return row;
        if (row.assignees.includes(clean)) return row;
        return { ...row, assignees: [...row.assignees, clean] };
      })
    );
    setCustomAssigneeInput("");
  };

  const handleUpdateRoleNote = (roleKey: string, noteVal: string) => {
    setRoleRows((prev) =>
      prev.map((row) => (row.roleKey === roleKey ? { ...row, note: noteVal } : row))
    );
  };

  const handleUpdateCustomRoleLabel = (roleKey: string, labelVal: string) => {
    setRoleRows((prev) =>
      prev.map((row) =>
        row.roleKey === roleKey ? { ...row, roleLabel: labelVal } : row
      )
    );
  };

  const handleRemoveCustomRole = (roleKey: string) => {
    setRoleRows((prev) => prev.filter((row) => row.roleKey !== roleKey));
    setExpandedRoleKey((prev) => (prev === roleKey ? "" : prev));
  };

  const handleAddCustomRole = () => {
    const label = newCustomRoleLabel.trim();
    if (!label) return;
    const newKey = `custom_${Date.now()}`;
    setRoleRows((prev) => [
      ...prev,
      {
        roleKey: newKey,
        roleLabel: label,
        shortHint: "追加担当",
        notePlaceholder: "補足メモ（任意）",
        assignees: [],
        note: "",
        isCustom: true,
      },
    ]);
    setExpandedRoleKey(newKey);
    setNewCustomRoleLabel("");
  };

  const handleSubmit = async () => {
    const hasBlankCustomLabel = roleRows.some(
      (r) => r.isCustom && r.roleLabel.trim().length === 0
    );
    if (hasBlankCustomLabel) {
      toast.error("追加した役割の名前を入力するか、不要な枠を削除してください");
      setActiveTab("roles");
      return;
    }

    const cleanedRoles: MatchStaffRoleAssignment[] = roleRows
      .filter((r) => {
        const cleanLabel = r.roleLabel.trim();
        if (!cleanLabel) return false;
        if (r.isCustom) return true;
        return r.assignees.length > 0 || Boolean(r.note.trim());
      })
      .map((r) => ({
        roleKey: r.roleKey,
        roleLabel: r.roleLabel.trim(),
        assignees: r.assignees.map((a) => a.trim()).filter(Boolean),
        note: r.note.trim() || undefined,
      }));

    const payload: MatchDayOps = {
      gatherTime: gatherTime.trim() || undefined,
      gatherPlace: gatherPlace.trim() || undefined,
      uniform: uniform.trim() || undefined,
      meal,
      mealNote: mealNote.trim() || undefined,
      belongingsNote: belongingsNote.trim() || undefined,
      carpoolMode,
      linkedEventId: ops?.linkedEventId || null,
      carLimitNote: carLimitNote.trim() || undefined,
      cargoCarMember: cargoCarMember.trim() || undefined,
      carpoolSummaryNote: carpoolSummaryNote.trim() || undefined,
      staffRoles: cleanedRoles.length > 0 ? cleanedRoles : undefined,
    };

    await onSave(payload);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="当日のしおり・役割担当・配車設定"
      className="fixed inset-0 z-[9999] bg-slate-950/70 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <div
        className="w-full sm:max-w-lg max-h-[88dvh] sm:max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* A-3 上帯ダークキャップ */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-black text-white truncate">
              当日のしおり・役割担当・配車設定
            </p>
            <p className="text-[10px] font-bold text-slate-300 truncate">
              vs {opponentName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="閉じる"
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3タブ切替バー（当日しおり → 役割担当 → 遠征・配車） */}
        <div className="p-2.5 pb-0 bg-card shrink-0">
          <div className="grid grid-cols-3 gap-1 bg-muted p-1 rounded-2xl border border-border">
            <button
              type="button"
              onClick={() => setActiveTab("guide")}
              className={cn(
                "py-2 px-2 rounded-xl text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer",
                activeTab === "guide"
                  ? "bg-card text-foreground shadow-sm border border-border font-black"
                  : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
              )}
            >
              <ClipboardList className="w-3.5 h-3.5 shrink-0 text-primary" />
              <span>当日しおり</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("roles")}
              className={cn(
                "py-2 px-2 rounded-xl text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer",
                activeTab === "roles"
                  ? "bg-card text-foreground shadow-sm border border-border font-black"
                  : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
              )}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-amber-500" />
              <span>役割担当</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("carpool")}
              className={cn(
                "py-2 px-2 rounded-xl text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer",
                activeTab === "carpool"
                  ? "bg-card text-foreground shadow-sm border border-border font-black"
                  : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
              )}
            >
              <Car className="w-3.5 h-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
              <span>遠征・配車</span>
            </button>
          </div>
        </div>

        {/* スクロール可能なコンテンツボディ */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === "roles" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-muted-foreground">
                  役割をタップして、お父さん・保護者メンバーを1タップ選択
                </p>
                {adultMembers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowFathersFirstOnly((v) => !v)}
                    className={cn(
                      "px-2 py-1 rounded-lg border text-[10px] font-black shrink-0 cursor-pointer",
                      showFathersFirstOnly
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-foreground border-border"
                    )}
                  >
                    {showFathersFirstOnly ? "父・スタッフのみ" : "保護者全員表示"}
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {roleRows.map((row) => {
                  const isExpanded = expandedRoleKey === row.roleKey;
                  const count = row.assignees.length;
                  return (
                    <div
                      key={row.roleKey}
                      className={cn(
                        "rounded-xl border bg-card overflow-hidden",
                        row.isCustom ? "border-amber-500/45" : "border-border"
                      )}
                    >
                      <div className="w-full px-3 py-2.5 flex items-center justify-between gap-2 bg-muted/40 hover:bg-muted/70 transition-colors">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRoleKey(isExpanded ? "" : row.roleKey)
                          }
                          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-black shrink-0 max-w-[140px] truncate">
                            {row.roleLabel.trim() || "名称未入力"}
                          </span>
                          {row.isCustom && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[9.5px] font-black shrink-0">
                              追加枠
                            </span>
                          )}
                          <span className="text-[11px] font-bold text-muted-foreground truncate">
                            {count > 0
                              ? row.assignees.join("・")
                              : row.note
                                ? row.note
                                : row.shortHint}
                          </span>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {count > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black font-mono">
                              {count}名
                            </span>
                          )}
                          {row.isCustom && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomRole(row.roleKey)}
                              aria-label={`${row.roleLabel || "追加枠"}を削除`}
                              title="この役割枠を削除"
                              className="w-7 h-7 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-card hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRoleKey(isExpanded ? "" : row.roleKey)
                            }
                            aria-label={isExpanded ? "閉じる" : "展開する"}
                            className="p-0.5 text-muted-foreground cursor-pointer"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-3 space-y-2.5 border-t border-border bg-card">
                          {/* 手動追加枠：役割名の編集 ＆ 枠の削除 */}
                          {row.isCustom && (
                            <div className="p-2.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/30 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[10.5px] font-black text-foreground">
                                  役割名の編集
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveCustomRole(row.roleKey)
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-card hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[10.5px] font-black cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3 shrink-0" />
                                  <span>この役割を削除</span>
                                </button>
                              </div>
                              <input
                                type="text"
                                value={row.roleLabel}
                                onChange={(e) =>
                                  handleUpdateCustomRoleLabel(
                                    row.roleKey,
                                    e.target.value
                                  )
                                }
                                placeholder="役割名を入力（例: 駐車場誘導・救護係）"
                                className="w-full h-9 px-3 rounded-xl border border-border bg-background text-xs font-black text-foreground"
                              />
                            </div>
                          )}
                          {/* 選択済みメンバー */}
                          {row.assignees.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {row.assignees.map((person) => (
                                <button
                                  key={`${row.roleKey}-sel-${person}`}
                                  type="button"
                                  onClick={() =>
                                    toggleRoleAssignee(row.roleKey, person)
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-black cursor-pointer"
                                >
                                  <span>{person}</span>
                                  <X className="w-3 h-3 opacity-85" />
                                </button>
                              ))}
                            </div>
                          )}

                          {/* チームメンバー1タップ候補チップ */}
                          {visibleAdultMembers.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-muted-foreground block">
                                メンバーからタップで追加・解除:
                              </span>
                              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 rounded-lg bg-muted/35 border border-border">
                                {visibleAdultMembers.map((m) => {
                                  const selected = row.assignees.includes(m.name);
                                  return (
                                    <button
                                      key={`${row.roleKey}-opt-${m.id}`}
                                      type="button"
                                      onClick={() =>
                                        toggleRoleAssignee(row.roleKey, m.name)
                                      }
                                      className={cn(
                                        "px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all cursor-pointer",
                                        selected
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-card text-foreground border-border hover:bg-muted"
                                      )}
                                    >
                                      {m.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 自由入力追加（連盟審判・未登録保護者など） */}
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={customAssigneeInput}
                              onChange={(e) =>
                                setCustomAssigneeInput(e.target.value)
                              }
                              placeholder="自由入力で追加（例: 連盟派遣 / 小西父）"
                              className="flex-1 h-9 px-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddCustomAssignee(row.roleKey)}
                              className="h-9 px-3 rounded-xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground shrink-0 cursor-pointer"
                            >
                              追加
                            </button>
                          </div>

                          {/* 補足メモ */}
                          <div>
                            <input
                              type="text"
                              value={row.note}
                              onChange={(e) =>
                                handleUpdateRoleNote(row.roleKey, e.target.value)
                              }
                              placeholder={row.notePlaceholder}
                              className="w-full h-9 px-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* カスタム役割枠の追加 */}
              <div className="pt-2 border-t border-border space-y-1.5">
                <span className="text-[10px] font-black text-muted-foreground block">
                  その他の担当枠を追加（例: 駐車場誘導・お茶当番・救護係）
                </span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newCustomRoleLabel}
                    onChange={(e) => setNewCustomRoleLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustomRole();
                      }
                    }}
                    placeholder="役割名を入力"
                    className="flex-1 h-9 px-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomRole}
                    className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-foreground inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>枠追加</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "guide" && (
            <div className="space-y-3.5">
              {/* 集合・出発時刻 */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground block">
                  ⏰ 集合・出発時刻
                </label>
                <input
                  type="text"
                  value={gatherTime}
                  onChange={(e) => setGatherTime(e.target.value)}
                  placeholder={
                    scheduleSync?.gatherTime
                      ? `日程連動: ${scheduleSync.gatherTime}`
                      : "例: 07:45 集合 / 08:00 出発"
                  }
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground"
                />
              </div>

              {/* 集合場所 */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground block">
                  📍 集合場所
                </label>
                <input
                  type="text"
                  value={gatherPlace}
                  onChange={(e) => setGatherPlace(e.target.value)}
                  placeholder={
                    scheduleSync?.gatherLocation
                      ? `日程連動: ${scheduleSync.gatherLocation}`
                      : "例: 現地球場 第1駐車場 / 桜本小 正門前"
                  }
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground"
                />
                <div className="flex flex-wrap gap-1.5">
                  {GATHER_PLACE_QUICK_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setGatherPlace(preset)}
                      className="px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 border border-border text-[11px] font-bold text-foreground cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* 着用ユニフォーム */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground block">
                  👕 着用ユニフォーム・服装
                </label>
                <input
                  type="text"
                  value={uniform}
                  onChange={(e) => setUniform(e.target.value)}
                  placeholder="例: 公式戦ユニフォーム（白ストッキング）"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground"
                />
                <div className="flex flex-wrap gap-1.5">
                  {UNIFORM_QUICK_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setUniform(preset)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer",
                        uniform === preset
                          ? "bg-primary text-primary-foreground border-primary font-black"
                          : "bg-muted hover:bg-muted/80 border-border text-foreground"
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* 昼食・捕食 */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground block">
                  🍙 昼食・捕食（軽食）
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {MEAL_OPTION_ITEMS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMeal(opt.value)}
                      className={cn(
                        "h-9 px-3 rounded-xl border text-xs flex items-center justify-between cursor-pointer",
                        meal === opt.value
                          ? "bg-primary text-primary-foreground border-primary font-black"
                          : "bg-card hover:bg-muted border-border text-foreground font-bold"
                      )}
                    >
                      <span>{opt.label}</span>
                      {meal === opt.value && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={mealNote}
                  onChange={(e) => setMealNote(e.target.value)}
                  placeholder="昼食補足メモ（例: 保冷剤必須・試合後におにぎり軽食）"
                  className="w-full h-9 px-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground"
                />
              </div>

              {/* 持ち物・連絡メモ */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground block">
                  📌 持ち物・保護者連絡メモ
                </label>
                <textarea
                  rows={3}
                  value={belongingsNote}
                  onChange={(e) => setBelongingsNote(e.target.value)}
                  placeholder="例: 水筒2L以上・氷嚢・替えアンダーシャツ持参。雨天時は6:30にLINE判断します。"
                  className="w-full p-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground resize-none"
                />
              </div>
            </div>
          )}

          {activeTab === "carpool" && (
            <div className="space-y-3.5">
              {/* 配車モード選択 */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground block">
                  🚗 移動・配車表示モード
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { value: "auto", label: "自動（配車表と連動）", spanFull: false },
                      { value: "away_carpool", label: "遠征・乗り合い配車", spanFull: false },
                      { value: "local_gather", label: "現地集合（各自移動）", spanFull: false },
                      { value: "no_carpool", label: "あえて「配車なし」を表示", spanFull: false },
                      { value: "none", label: "配車枠自体を表示しない", spanFull: true },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setCarpoolMode(item.value)}
                      className={cn(
                        "h-9 px-2.5 rounded-xl border text-[11px] flex items-center justify-center text-center cursor-pointer",
                        item.spanFull && "col-span-2",
                        carpoolMode === item.value
                          ? "bg-teal-600 text-white border-teal-600 font-black"
                          : "bg-card hover:bg-muted border-border text-foreground font-bold"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 駐車台数制限メモ */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground block">
                  🅿️ この試合の駐車台数制限・駐車証メモ
                </label>
                {venueParkingInfo && (
                  <p className="text-[10px] font-bold text-muted-foreground">
                    球場マスタ登録値: {venueParkingInfo}
                  </p>
                )}
                <input
                  type="text"
                  value={carLimitNote}
                  onChange={(e) => setCarLimitNote(e.target.value)}
                  placeholder="例: 大会規定により1チーム最大4台まで（駐車証配布）"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground"
                />
              </div>

              {/* 道具車担当 */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground block">
                  📦 道具車担当（テント・道具積載）
                </label>
                <input
                  type="text"
                  value={cargoCarMember}
                  onChange={(e) => setCargoCarMember(e.target.value)}
                  placeholder="例: 山下 監督 / 小西 父"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground"
                />
                {adultMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 rounded-lg bg-muted/35 border border-border">
                    {adultMembers.slice(0, 12).map((m) => (
                      <button
                        key={`cargo-${m.id}`}
                        type="button"
                        onClick={() =>
                          setCargoCarMember((prev) =>
                            prev ? `${prev}・${m.name}` : m.name
                          )
                        }
                        className="px-2 py-0.5 rounded-md bg-card hover:bg-muted border border-border text-[11px] font-bold text-foreground cursor-pointer"
                      >
                        ＋{m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 配車・精算メモ */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground block">
                  💬 配車・高速代等の連絡メモ
                </label>
                <textarea
                  rows={2}
                  value={carpoolSummaryNote}
                  onChange={(e) => setCarpoolSummaryNote(e.target.value)}
                  placeholder="例: 高速代は1家族500円で集金します。第2駐車場へ停めてください。"
                  className="w-full p-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground resize-none"
                />
              </div>

              {scheduleSync && (
                <div className="p-2.5 rounded-xl bg-teal-500/[0.08] border border-teal-500/30 flex items-start gap-2 text-[11px]">
                  <AlertCircle className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                  <p className="font-bold text-foreground leading-snug">
                    同日の予定「{scheduleSync.title}」
                    {scheduleSync.cars.length > 0
                      ? `（配車 ${scheduleSync.cars.length}台登録済み）`
                      : "（配車未割当）"}
                    と自動連携しています。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター保存バー（モバイル下部Safe Area対応） */}
        <div className="px-4 py-3.5 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-3.5 border-t border-border bg-card grid grid-cols-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-10 px-4 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black transition-all cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSaving}
            className="h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>保存中...</span>
              </>
            ) : (
              <span>保存する</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

