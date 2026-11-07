// filepath: src/components/liff/EventGroupAttendanceSummary.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { warmupLiffEndpointForHref } from "@/lib/liff/api-cache";
import {
  ATTENDANCE_GROUP_META,
  ATTENDANCE_GROUP_ORDER,
  DEFAULT_GROUP_STATUS_SUMMARY_CONFIG,
  type AttendanceGroupKey,
  type EventGroupAttendanceMap,
  type GroupAttendanceCounts,
  type GroupStatusConfigSummary,
} from "@/lib/liff/group-attendance";

interface EventGroupAttendanceSummaryProps {
  groupAttendCount?: EventGroupAttendanceMap | null;
  attendCount?: Partial<GroupAttendanceCounts> | null;
  statusConfig?: GroupStatusConfigSummary | null;
  dateStr?: string;
  compact?: boolean;
}

const MARK_BADGE_CLASS_BY_ID: Record<"duty" | "help" | "setup" | "game" | "absent", string> = {
  duty: "bg-red-500 text-white",
  help: "bg-blue-600 text-white",
  setup: "bg-amber-500 text-white",
  game: "bg-emerald-600 text-white",
  absent: "bg-slate-600 dark:bg-slate-500 text-white",
};

export function EventGroupAttendanceSummary({
  groupAttendCount,
  attendCount,
  statusConfig,
  dateStr,
  compact = false,
}: EventGroupAttendanceSummaryProps) {
  const router = useRouter();
  const [selectedGroup, setSelectedGroup] = useState<AttendanceGroupKey | null>(null);

  const effectiveStatusConfig = statusConfig || DEFAULT_GROUP_STATUS_SUMMARY_CONFIG;

  const prefetchBoard = () => {
    router.prefetch("/liff/schedule/board");
    warmupLiffEndpointForHref("/liff/schedule/board");
  };

  const monthParam =
    dateStr && /^\d{4}-\d{2}/.test(dateStr) ? `&month=${dateStr.slice(0, 7)}` : "";

  if (!groupAttendCount) {
    const present = attendCount?.present || 0;
    const absent = attendCount?.absent || 0;
    const pending = attendCount?.pending || 0;
    const total = present + absent + pending;
    if (total <= 0) return null;
    const pct = Math.round((present / total) * 100);

    return (
      <div className="p-3 rounded-2xl bg-card border border-border space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2 font-black text-foreground">
            <Users className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>出欠状況</span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black tabular-nums">
              参加 {present}
            </span>
            <span className="text-muted-foreground font-bold tabular-nums">
              未定 {pending} ・ 欠席 {absent}
            </span>
          </div>
          <Link
            href="/liff/schedule/board"
            onPointerDown={prefetchBoard}
            className="inline-flex items-center gap-0.5 text-[11px] font-black text-primary hover:underline shrink-0 tabular-nums"
          >
            <span>参加率 {pct}%</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="flex gap-1 h-2 w-full rounded-xs overflow-hidden bg-muted">
          {present > 0 && (
            <div
              className="h-full rounded-xs bg-emerald-600"
              style={{ width: `${(present / total) * 100}%` }}
            />
          )}
          {pending > 0 && (
            <div
              className="h-full rounded-xs bg-amber-500"
              style={{ width: `${(pending / total) * 100}%` }}
            />
          )}
          {absent > 0 && (
            <div
              className="h-full rounded-xs bg-slate-500"
              style={{ width: `${(absent / total) * 100}%` }}
            />
          )}
        </div>
      </div>
    );
  }

  const totalRosterSum =
    groupAttendCount.player.total +
    groupAttendCount.mother.total +
    groupAttendCount.father.total +
    groupAttendCount.staff.total;

  if (totalRosterSum <= 0) {
    return null;
  }

  const overallTotal =
    attendCount?.total ??
    (attendCount?.present || 0) + (attendCount?.absent || 0) + (attendCount?.pending || 0);
  const overallPresent = attendCount?.present ?? 0;

  const activeGroupData = selectedGroup ? groupAttendCount[selectedGroup] : null;
  const activeGroupMeta = selectedGroup ? ATTENDANCE_GROUP_META[selectedGroup] : null;
  const activeGroupItems = selectedGroup ? effectiveStatusConfig[selectedGroup] : [];

  return (
    <div
      className={cn(
        "rounded-2xl bg-muted/35 border border-border space-y-2",
        compact ? "p-2.5" : "p-3"
      )}
    >
      {/* ヘッダー行：タイトル ＆ 全体合計バッジ ＆ 出欠一覧表リンク */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Users className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[11px] font-black text-foreground truncate">
            出欠状況（グループ別）
          </span>
          {overallTotal > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-card border border-border text-[10px] font-black text-foreground tabular-nums shrink-0">
              計 {overallPresent}/{overallTotal}
            </span>
          )}
        </div>

        <Link
          href={`/liff/schedule/board?group=all${monthParam}`}
          onPointerDown={prefetchBoard}
          className="inline-flex items-center gap-0.5 text-[10.5px] font-black text-primary hover:underline shrink-0"
        >
          <span>出欠一覧表</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 4グループ 2×2 ソリッドグリッド（選手 / 母 / 父 / スタッフ） */}
      <div className="grid grid-cols-2 gap-1.5">
        {ATTENDANCE_GROUP_ORDER.map((groupKey) => {
          const meta = ATTENDANCE_GROUP_META[groupKey];
          const g = groupAttendCount[groupKey];
          const isSelected = selectedGroup === groupKey;
          const hasMembers = g.total > 0;

          return (
            <button
              key={groupKey}
              type="button"
              disabled={!hasMembers}
              onClick={() =>
                setSelectedGroup((prev) => (prev === groupKey ? null : groupKey))
              }
              className={cn(
                "rounded-xl border bg-card text-left transition-all select-none",
                compact ? "p-2 space-y-1.5" : "p-2.5 space-y-1.5",
                !hasMembers && "opacity-60 cursor-default border-border",
                hasMembers && "cursor-pointer active:scale-[0.98]",
                isSelected
                  ? "border-2 border-primary shadow-2xs"
                  : hasMembers && "border-border hover:border-primary/40 shadow-2xs"
              )}
            >
              {/* 1段目: グループ名（在籍数） ｜ 参加数ソリッドバッジ */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 min-w-0">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      meta.accentDotClass
                    )}
                  />
                  <span className="text-[11px] font-black text-foreground truncate">
                    {meta.label}
                  </span>
                  <span className="text-[9.5px] font-bold text-muted-foreground tabular-nums shrink-0">
                    ({g.total})
                  </span>
                </div>

                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-black tabular-nums shrink-0 leading-none",
                    g.present > 0
                      ? "bg-emerald-600 text-white"
                      : "bg-muted text-muted-foreground border border-border"
                  )}
                >
                  参加 {g.present}
                </span>
              </div>

              {/* 2段目: 欠席・未回答数 ＆ 内訳展開インジケーター */}
              <div className="flex items-center justify-between gap-1 text-[9.5px] font-bold tabular-nums">
                {hasMembers ? (
                  <span className="text-muted-foreground truncate">
                    欠席 <strong className="text-foreground">{g.absent}</strong>
                    {" ・ "}
                    未定{" "}
                    <strong
                      className={cn(
                        g.pending > 0
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-foreground"
                      )}
                    >
                      {g.pending}
                    </strong>
                  </span>
                ) : (
                  <span className="text-muted-foreground">登録なし</span>
                )}

                {hasMembers && (
                  <span className="text-muted-foreground shrink-0">
                    {isSelected ? (
                      <ChevronUp className="w-3 h-3 text-primary" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </span>
                )}
              </div>

              {/* 3段目: 3色ソリッドゲージバー */}
              <div className="flex gap-0.5 h-1.5 w-full rounded-xs overflow-hidden bg-muted">
                {hasMembers && g.present > 0 && (
                  <div
                    className="h-full bg-emerald-600"
                    style={{ width: `${(g.present / g.total) * 100}%` }}
                  />
                )}
                {hasMembers && g.pending > 0 && (
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${(g.pending / g.total) * 100}%` }}
                  />
                )}
                {hasMembers && g.absent > 0 && (
                  <div
                    className="h-full bg-slate-500"
                    style={{ width: `${(g.absent / g.total) * 100}%` }}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* タップ選択時：選択中グループの記号別（◎当番・○ヘルプ・▲設営・△試合・×欠席・－未回答）内訳パネル */}
      {selectedGroup && activeGroupData && activeGroupMeta && (
        <div className="p-2.5 rounded-xl bg-card border border-primary/35 space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2 text-[10.5px]">
            <div className="flex items-center gap-1.5 font-black text-foreground min-w-0">
              <span>{activeGroupMeta.icon}</span>
              <span className="truncate">
                {activeGroupMeta.label}の内訳（全{activeGroupData.total}名 ・ 参加率{" "}
                {activeGroupData.total > 0
                  ? Math.round((activeGroupData.present / activeGroupData.total) * 100)
                  : 0}
                %）
              </span>
            </div>

            <Link
              href={`/liff/schedule/board?group=${selectedGroup}${monthParam}`}
              onPointerDown={prefetchBoard}
              className="inline-flex items-center gap-0.5 text-[10.5px] font-black text-primary hover:underline shrink-0"
            >
              <span>{activeGroupMeta.label}タブを開く</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="flex flex-wrap gap-1">
            {activeGroupItems
              .filter((item) => item.enabled || activeGroupData[item.id] > 0)
              .map((item) => {
                const count = activeGroupData[item.id];
                return (
                  <span
                    key={item.id}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black tabular-nums border",
                      count > 0
                        ? "bg-muted/45 text-foreground border-border"
                        : "bg-muted/20 text-muted-foreground/70 border-border/60"
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 h-4 rounded-md flex items-center justify-center text-[9.5px] font-black shrink-0",
                        MARK_BADGE_CLASS_BY_ID[item.id]
                      )}
                    >
                      {item.mark}
                    </span>
                    <span>{item.label}</span>
                    <span>{count}</span>
                  </span>
                );
              })}

            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black tabular-nums border",
                activeGroupData.pending > 0
                  ? "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/30"
                  : "bg-muted/20 text-muted-foreground/70 border-border/60"
              )}
            >
              <span className="w-4 h-4 rounded-md bg-muted border border-border text-muted-foreground flex items-center justify-center text-[9.5px] font-black shrink-0">
                －
              </span>
              <span>未定</span>
              <span>{activeGroupData.pending}</span>
            </span>

            {selectedGroup === "player" && (activeGroupData.onLeave ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black tabular-nums border bg-slate-500/12 text-slate-600 dark:text-slate-300 border-slate-500/30">
                <span className="w-4 h-4 rounded-md bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-[9px] font-black shrink-0">
                  休
                </span>
                <span>休部</span>
                <span>{activeGroupData.onLeave}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

