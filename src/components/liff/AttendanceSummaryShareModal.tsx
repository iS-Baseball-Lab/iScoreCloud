// filepath: src/components/liff/AttendanceSummaryShareModal.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { Liff } from "@line/liff";
import {
  Check,
  ClipboardCopy,
  Copy,
  Link2,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildShareableLiffPageUrl,
  sharePlainTextViaLine,
} from "@/lib/liff/liff-client";
import type {
  PlayerConditionPeriod,
  PlayerConditionStatus,
} from "@/lib/liff/player-condition";

export type AttendanceSummaryMarkType =
  | "duty"
  | "help"
  | "setup"
  | "game"
  | "absent"
  | "pending";

export type AttendanceSummaryGroupTab =
  | "all"
  | "player"
  | "parent"
  | "mother"
  | "father"
  | "staff";

export type AttendanceSummarySortGroupKey =
  | "player"
  | "mother"
  | "father"
  | "staff";

export interface AttendanceSummaryStatusSetting {
  id: AttendanceSummaryMarkType;
  mark: string;
  label: string;
  description?: string;
  enabled: boolean;
  bgClass: string;
}

export type AttendanceSummaryGroupStatusConfigMap = Record<
  AttendanceSummarySortGroupKey,
  AttendanceSummaryStatusSetting[]
>;

export interface AttendanceSummaryEventItem {
  id: string;
  title: string;
  description?: string;
  importantNotice?: string;
  dateStr: string;
  date: string;
  dayOfWeek: string;
  dutyGroup: string;
  location: string;
  eventType: string;
}

export interface AttendanceSummaryPerson {
  id: string;
  name: string;
  uniformNumber?: string;
  subText?: string;
  groupType: "player" | "parent" | "mother" | "father" | "staff";
  conditionStatus?: PlayerConditionStatus;
  conditionPeriods?: PlayerConditionPeriod[];
  linkedChildIds?: string[];
}

export interface AttendanceSummaryMemberSortOrderMap {
  player?: string[];
  mother?: string[];
  father?: string[];
  staff?: string[];
}

interface AttendanceSummaryShareModalProps {
  event: AttendanceSummaryEventItem | null;
  onClose: () => void;
  initialGroupTab: AttendanceSummaryGroupTab | null;
  teamPrefixSource: {
    teamName?: string;
    shortName?: string;
    name?: string;
  } | null;
  teamId: string | null;
  liff: Liff | null;
  groups: {
    players: AttendanceSummaryPerson[];
    mothers: AttendanceSummaryPerson[];
    fathers: AttendanceSummaryPerson[];
    staff: AttendanceSummaryPerson[];
  };
  evMatrix: Record<string, { status: AttendanceSummaryMarkType; comment: string }>;
  groupStatusConfig: AttendanceSummaryGroupStatusConfigMap;
  memberSortOrder: AttendanceSummaryMemberSortOrderMap;
  memberSubLabels: Record<string, string>;
  sortMembersByCustomOrder: (
    members: AttendanceSummaryPerson[],
    orderIds?: string[]
  ) => AttendanceSummaryPerson[];
  resolvePersonConditionOnDate: (
    person: AttendanceSummaryPerson,
    dateKey?: string | null
  ) => { status: PlayerConditionStatus; period: PlayerConditionPeriod | null };
}

const GROUP_ORDER: readonly AttendanceSummarySortGroupKey[] = [
  "player",
  "mother",
  "father",
  "staff",
] as const;

const GROUP_META: Record<
  AttendanceSummarySortGroupKey,
  { shortLabel: string; summaryLabel: string }
> = {
  player: { shortLabel: "選手", summaryLabel: "選手" },
  mother: { shortLabel: "母", summaryLabel: "母" },
  father: { shortLabel: "父", summaryLabel: "父" },
  staff: { shortLabel: "スタッフ", summaryLabel: "指導者・スタッフ" },
};

function getLastName(fullName: string): string {
  if (!fullName) return "";
  const trimmed = fullName.trim();
  if (trimmed.includes(" ")) return trimmed.split(" ")[0];
  if (trimmed.includes("　")) return trimmed.split("　")[0];
  return trimmed;
}

function isDutyGroupMatch(memberGroup: string, eventDuty: string): boolean {
  if (!memberGroup || !eventDuty || eventDuty === "なし") return false;
  const mg = memberGroup.trim();
  const eg = eventDuty.trim();
  if (mg === eg) return true;
  if (eg.includes(mg) || mg.includes(eg)) return true;
  const mNum = mg.match(/\d+/)?.[0];
  const eNum = eg.match(/\d+/)?.[0];
  if (mNum && eNum && mNum === eNum) return true;
  const mAlpha = mg.match(/[a-zA-Z]/)?.[0]?.toUpperCase();
  const eAlpha = eg.match(/[a-zA-Z]/)?.[0]?.toUpperCase();
  if (mAlpha && eAlpha && mAlpha === eAlpha) return true;
  return false;
}

function formatMemberSection(
  title: string,
  list: Array<{ name: string; comment: string }>
): string[] {
  if (list.length === 0) return [];
  const res: string[] = [`・${title}（${list.length}名）`];

  const noCommentMembers = list.filter((m) => !m.comment);
  const commentMembers = list.filter((m) => Boolean(m.comment));

  if (noCommentMembers.length > 0) {
    const names = noCommentMembers.map((m) => getLastName(m.name)).join("、");
    res.push(`　${names}`);
  }

  for (const m of commentMembers) {
    res.push(`　${getLastName(m.name)}（${m.comment}）`);
  }

  return res;
}

function cleanStatusSectionTitle(raw: string, fallback: string): string {
  if (!raw) return fallback;
  if (raw === "当番") return "当番参加";
  if (raw === "ヘルプ") return "ヘルプ参加";
  if (raw === "試合のみ") return "試合なら参加";
  if (raw === "設営撤収") return "設営撤収参加";
  return raw.endsWith("参加") || raw.endsWith("出席") || raw.endsWith("欠席")
    ? raw
    : `${raw}参加`;
}

function areGroupArraysEqual(
  a: readonly AttendanceSummarySortGroupKey[],
  b: readonly AttendanceSummarySortGroupKey[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function collapseExcessBlankLines(value: string): string {
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

interface ResetUndoSnapshot {
  text: string;
  includedGroups: AttendanceSummarySortGroupKey[];
  includePending: boolean;
  includeBoardUrl: boolean;
  isManuallyEdited: boolean;
}

export function AttendanceSummaryShareModal({
  event,
  onClose,
  initialGroupTab,
  teamPrefixSource,
  teamId,
  liff,
  groups,
  evMatrix,
  groupStatusConfig,
  memberSortOrder,
  memberSubLabels,
  sortMembersByCustomOrder,
  resolvePersonConditionOnDate,
}: AttendanceSummaryShareModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sortedGroupMembers = useMemo<
    Record<AttendanceSummarySortGroupKey, AttendanceSummaryPerson[]>
  >(
    () => ({
      player: sortMembersByCustomOrder(groups.players, memberSortOrder.player),
      mother: sortMembersByCustomOrder(groups.mothers, memberSortOrder.mother),
      father: sortMembersByCustomOrder(groups.fathers, memberSortOrder.father),
      staff: sortMembersByCustomOrder(groups.staff, memberSortOrder.staff),
    }),
    [groups, memberSortOrder, sortMembersByCustomOrder]
  );

  const resolveInitialGroups = useCallback((): AttendanceSummarySortGroupKey[] => {
    if (
      initialGroupTab === "player" ||
      initialGroupTab === "mother" ||
      initialGroupTab === "father" ||
      initialGroupTab === "staff"
    ) {
      return [initialGroupTab];
    }
    if (initialGroupTab === "parent") {
      const parentGroups = (["mother", "father"] as AttendanceSummarySortGroupKey[]).filter(
        (gk) => sortedGroupMembers[gk].length > 0
      );
      return parentGroups.length > 0 ? parentGroups : ["mother", "father"];
    }
    const nonEmpty = GROUP_ORDER.filter((gk) => sortedGroupMembers[gk].length > 0);
    return nonEmpty.length > 0 ? [...nonEmpty] : ["player"];
  }, [initialGroupTab, sortedGroupMembers]);

  const buildEventHeader = useCallback((ev: AttendanceSummaryEventItem): string => {
    let dateStr = "";
    if (ev.dateStr) {
      const parts = ev.dateStr.split("-");
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      dateStr = `${m}月${d}日（${ev.dayOfWeek}）`;
    } else if (ev.date) {
      const slashParts = ev.date.split("/");
      if (slashParts.length >= 2) {
        const m = parseInt(slashParts[slashParts.length - 2], 10);
        const d = parseInt(slashParts[slashParts.length - 1], 10);
        dateStr = `${m}月${d}日（${ev.dayOfWeek}）`;
      } else {
        dateStr = `${ev.date}（${ev.dayOfWeek}）`;
      }
    } else {
      dateStr = `（${ev.dayOfWeek}）`;
    }

    let dutySuffix = "";
    if (ev.dutyGroup && ev.dutyGroup !== "なし") {
      const rawDuty = ev.dutyGroup.trim();
      if (rawDuty.endsWith("日") || rawDuty.includes("当番日")) {
        dutySuffix = rawDuty;
      } else if (rawDuty.includes("当番")) {
        dutySuffix = `${rawDuty}日`;
      } else {
        dutySuffix = `${rawDuty}当番日`;
      }
    }

    const line1 = dutySuffix
      ? `${dateStr}${dutySuffix}`
      : ev.title
      ? `${dateStr} ${ev.title}`
      : dateStr;

    const headerLines: string[] = [line1];
    const cleanImportant = ev.importantNotice?.trim() || "";
    if (cleanImportant) {
      headerLines.push(`⚠️ 注意事項・特記事項:\n${cleanImportant}`);
    }
    const cleanNote = ev.description?.trim() || "";
    if (cleanNote) {
      headerLines.push(`📝 ${cleanNote}`);
    }
    return headerLines.join("\n");
  }, []);

  const buildGroupBlock = useCallback(
    (
      ev: AttendanceSummaryEventItem,
      groupKey: AttendanceSummarySortGroupKey,
      withPending: boolean
    ): string => {
      const groupLabel = GROUP_META[groupKey].summaryLabel;
      const rawTeam =
        teamPrefixSource?.teamName ||
        teamPrefixSource?.shortName ||
        teamPrefixSource?.name ||
        "";
      const kiMatch = rawTeam.match(/\d+期/);
      const teamPrefix = kiMatch ? kiMatch[0] : rawTeam;
      const heading = `${teamPrefix}${groupLabel}の参加状況（敬称略）`;

      const targetMembers = sortedGroupMembers[groupKey] || [];
      const dutyList: Array<{ name: string; comment: string }> = [];
      const helpList: Array<{ name: string; comment: string }> = [];
      const setupList: Array<{ name: string; comment: string }> = [];
      const gameList: Array<{ name: string; comment: string }> = [];
      const dutyAbsentList: Array<{ name: string; comment: string }> = [];
      const playerAbsentList: Array<{ name: string; comment: string }> = [];
      const pendingList: Array<{ name: string; comment: string }> = [];

      for (const person of targetMembers) {
        const cellData = evMatrix[person.id];
        const status: AttendanceSummaryMarkType = cellData?.status || "pending";
        const comment = cellData?.comment?.trim() || "";
        const memberGroup = memberSubLabels[person.id] || person.subText || "";
        const isDutyMember = isDutyGroupMatch(memberGroup, ev.dutyGroup);
        const isOnLeaveOnEvent =
          resolvePersonConditionOnDate(person, ev.dateStr).status === "on_leave";

        // 休部期間中の選手・父母は未回答や通常欠席時に「当番欠席」「欠席」「未回答」としてLINE集計へ混入させない
        if (
          isOnLeaveOnEvent &&
          (status === "pending" || (status === "absent" && !comment.includes("当番欠席")))
        ) {
          continue;
        }

        if (status === "absent" && (isDutyMember || comment.includes("当番欠席"))) {
          dutyAbsentList.push({ name: person.name, comment });
        } else if (status === "duty") {
          dutyList.push({ name: person.name, comment });
        } else if (status === "help") {
          helpList.push({ name: person.name, comment });
        } else if (status === "setup") {
          setupList.push({ name: person.name, comment });
        } else if (status === "game") {
          gameList.push({ name: person.name, comment });
        } else if (status === "absent") {
          if (groupKey === "player") {
            playerAbsentList.push({ name: person.name, comment });
          }
        } else if (status === "pending") {
          pendingList.push({ name: person.name, comment });
        }
      }

      const configList = groupStatusConfig[groupKey] || [];
      const getCustomLabel = (id: AttendanceSummaryMarkType) =>
        configList.find((item) => item.id === id)?.label;

      const isPlayer = groupKey === "player";
      const sectionLines: string[] = [];

      sectionLines.push(
        ...formatMemberSection(
          cleanStatusSectionTitle(
            getCustomLabel("duty") || "",
            isPlayer ? "出席" : "当番参加"
          ),
          dutyList
        )
      );
      sectionLines.push(...formatMemberSection("当番欠席", dutyAbsentList));
      sectionLines.push(
        ...formatMemberSection(
          cleanStatusSectionTitle(
            getCustomLabel("help") || "",
            groupKey === "staff" ? "指導参加" : "ヘルプ参加"
          ),
          helpList
        )
      );
      sectionLines.push(
        ...formatMemberSection(
          cleanStatusSectionTitle(getCustomLabel("setup") || "", "設営撤収参加"),
          setupList
        )
      );
      sectionLines.push(
        ...formatMemberSection(
          cleanStatusSectionTitle(getCustomLabel("game") || "", "試合なら参加"),
          gameList
        )
      );

      if (isPlayer && playerAbsentList.length > 0) {
        sectionLines.push(...formatMemberSection("欠席", playerAbsentList));
      }

      if (withPending && pendingList.length > 0) {
        sectionLines.push(...formatMemberSection("未回答", pendingList));
      }

      if (sectionLines.length === 0) {
        sectionLines.push("・回答なし");
      }

      return [heading, ...sectionLines].join("\n");
    },
    [
      evMatrix,
      groupStatusConfig,
      memberSubLabels,
      resolvePersonConditionOnDate,
      sortedGroupMembers,
      teamPrefixSource,
    ]
  );

  const buildBoardLinkFooter = useCallback(
    (
      ev: AttendanceSummaryEventItem,
      targetGroups: readonly AttendanceSummarySortGroupKey[]
    ): string => {
      const monthParam = ev.dateStr && ev.dateStr.length >= 7 ? ev.dateStr.slice(0, 7) : null;
      const singleGroup = targetGroups.length === 1 ? targetGroups[0] : "all";
      const shareUrl = buildShareableLiffPageUrl({
        pathname: "/liff/schedule/board",
        teamId,
        inheritCurrentSearch: false,
        queryParams: {
          group: singleGroup,
          month: monthParam,
        },
      });
      return `📲 出欠登録・確認はこちら:\n${shareUrl}`;
    },
    [teamId]
  );

  const buildFullSummaryText = useCallback(
    (
      ev: AttendanceSummaryEventItem,
      targetGroups: readonly AttendanceSummarySortGroupKey[],
      withPending: boolean,
      withBoardUrl: boolean
    ): string => {
      const header = buildEventHeader(ev);
      const blocks = targetGroups.map((gk) => buildGroupBlock(ev, gk, withPending));

      let result = header;
      if (blocks.length === 1) {
        result = `${header}\n${blocks[0]}`;
      } else if (blocks.length > 1) {
        result = `${header}\n\n${blocks.join("\n\n")}`;
      }

      if (withBoardUrl) {
        const footer = buildBoardLinkFooter(ev, targetGroups);
        result = `${result}\n\n${footer}`;
      }

      return result;
    },
    [buildBoardLinkFooter, buildEventHeader, buildGroupBlock]
  );

  // 各グループのリアルタイム参加・未回答カウント（ボタン上のプレビュー表示用）
  const groupStats = useMemo(() => {
    const map: Record<
      AttendanceSummarySortGroupKey,
      { present: number; pending: number; activeTotal: number }
    > = {
      player: { present: 0, pending: 0, activeTotal: 0 },
      mother: { present: 0, pending: 0, activeTotal: 0 },
      father: { present: 0, pending: 0, activeTotal: 0 },
      staff: { present: 0, pending: 0, activeTotal: 0 },
    };
    if (!event) return map;

    for (const gk of GROUP_ORDER) {
      const members = sortedGroupMembers[gk] || [];
      let present = 0;
      let pending = 0;
      let activeTotal = 0;

      for (const person of members) {
        const status = evMatrix[person.id]?.status || "pending";
        const isLeave =
          resolvePersonConditionOnDate(person, event.dateStr).status === "on_leave";

        if (isLeave && (status === "pending" || status === "absent")) {
          continue;
        }
        activeTotal += 1;
        if (
          status === "duty" ||
          status === "help" ||
          status === "setup" ||
          status === "game"
        ) {
          present += 1;
        } else if (status === "pending") {
          pending += 1;
        }
      }

      map[gk] = { present, pending, activeTotal };
    }
    return map;
  }, [event, evMatrix, resolvePersonConditionOnDate, sortedGroupMembers]);

  const [initialGroupsState, setInitialGroupsState] = useState<
    AttendanceSummarySortGroupKey[]
  >([]);
  const [includedGroups, setIncludedGroups] = useState<
    AttendanceSummarySortGroupKey[]
  >([]);
  const [includePending, setIncludePending] = useState(false);
  const [includeBoardUrl, setIncludeBoardUrl] = useState(false);
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);
  const [text, setText] = useState("");
  const [initialSnapshotText, setInitialSnapshotText] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isSharingLine, setIsSharingLine] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedEventIdRef = useRef<string | null>(null);

  // モーダルオープン時に対象イベント・初期グループでテキストを初期化（開いている最中のバックグラウンドSWR再検証で編集内容が消えないよう保護）
  useEffect(() => {
    if (!event) {
      initializedEventIdRef.current = null;
      return;
    }
    if (initializedEventIdRef.current === event.id) {
      return;
    }
    initializedEventIdRef.current = event.id;
    const initGroups = resolveInitialGroups();
    const initText = buildFullSummaryText(event, initGroups, false, false);
    setInitialGroupsState(initGroups);
    setIncludedGroups(initGroups);
    setIncludePending(false);
    setIncludeBoardUrl(false);
    setIsManuallyEdited(false);
    setText(initText);
    setInitialSnapshotText(initText);
    setIsCopied(false);
    setIsSharingLine(false);
  }, [event, resolveInitialGroups, buildFullSummaryText]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  // ESCキーで閉じる
  useEffect(() => {
    if (!event) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSharingLine) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [event, isSharingLine, onClose]);

  if (!mounted || !event) return null;

  const availableNonEmptyGroups = GROUP_ORDER.filter(
    (gk) => (sortedGroupMembers[gk] || []).length > 0
  );
  const allTargetGroups: readonly AttendanceSummarySortGroupKey[] =
    availableNonEmptyGroups.length > 0 ? availableNonEmptyGroups : GROUP_ORDER;
  const isAllGroupsIncluded = allTargetGroups.every((gk) =>
    includedGroups.includes(gk)
  );

  const totalPendingInIncluded = includedGroups.reduce(
    (acc, gk) => acc + (groupStats[gk]?.pending || 0),
    0
  );

  const canReset =
    isManuallyEdited ||
    text !== initialSnapshotText ||
    !areGroupArraysEqual(includedGroups, initialGroupsState) ||
    includePending ||
    includeBoardUrl;

  const insertBlockBeforeFooterIfPresent = (
    currentText: string,
    newBlock: string
  ): string => {
    const trimmed = currentText.replace(/\s+$/, "");
    if (!trimmed) {
      return `${buildEventHeader(event)}\n${newBlock}`;
    }
    const footerMarker = "\n\n📲 出欠登録・確認はこちら:\n";
    const markerIdx = trimmed.lastIndexOf(footerMarker);
    if (markerIdx >= 0) {
      const before = trimmed.slice(0, markerIdx).replace(/\s+$/, "");
      const footerPart = trimmed.slice(markerIdx + 2);
      return `${before}\n\n${newBlock}\n\n${footerPart}`;
    }
    return `${trimmed}\n\n${newBlock}`;
  };

  // グループチップのタップ（他グループの挿入・解除）
  const handleToggleOrInsertGroup = (gk: AttendanceSummarySortGroupKey) => {
    const isAlreadyIncluded = includedGroups.includes(gk);
    setIsCopied(false);

    if (!isManuallyEdited) {
      const nextGroups = isAlreadyIncluded
        ? includedGroups.filter((item) => item !== gk)
        : [...includedGroups, gk];
      setIncludedGroups(nextGroups);
      setText(
        buildFullSummaryText(event, nextGroups, includePending, includeBoardUrl)
      );
      return;
    }

    // 自由編集済みの場合は手入力テキストを壊さずに追記・安全解除する
    if (!isAlreadyIncluded) {
      const block = buildGroupBlock(event, gk, includePending);
      const nextGroups = [...includedGroups, gk];
      setIncludedGroups(nextGroups);
      setText((prev) => insertBlockBeforeFooterIfPresent(prev, block));
      toast.success(`「${GROUP_META[gk].shortLabel}」の出欠を追加挿入しました`);
      return;
    }

    // 既に挿入済みのグループをタップした場合、該当ブロックが無編集のまま残っていればその部分だけ安全に除去
    const currentBlock = buildGroupBlock(event, gk, includePending);
    const altBlock = buildGroupBlock(event, gk, !includePending);
    const matchedBlock = text.includes(currentBlock)
      ? currentBlock
      : text.includes(altBlock)
      ? altBlock
      : null;

    if (matchedBlock) {
      const nextGroups = includedGroups.filter((item) => item !== gk);
      const updated = collapseExcessBlankLines(text.replace(matchedBlock, ""));
      setIncludedGroups(nextGroups);
      setText(updated);
      toast.info(`「${GROUP_META[gk].shortLabel}」の出欠を取り除きました`);
    } else {
      toast.info(
        `「${GROUP_META[gk].shortLabel}」の箇所は自由編集されているため、直接編集するか「リセット」をご利用ください`
      );
    }
  };

  // 全グループ一括挿入
  const handleInsertAllGroups = () => {
    const missingGroups = allTargetGroups.filter(
      (gk) => !includedGroups.includes(gk)
    );
    if (missingGroups.length === 0) return;

    setIsCopied(false);
    const nextGroups = [...includedGroups, ...missingGroups];
    setIncludedGroups(nextGroups);

    if (!isManuallyEdited) {
      setText(
        buildFullSummaryText(event, nextGroups, includePending, includeBoardUrl)
      );
      return;
    }

    const combinedMissingBlocks = missingGroups
      .map((gk) => buildGroupBlock(event, gk, includePending))
      .join("\n\n");
    setText((prev) => insertBlockBeforeFooterIfPresent(prev, combinedMissingBlocks));
    toast.success("他グループの出欠をまとめて挿入しました");
  };

  // 「未回答も記載」トグル
  const handleToggleIncludePending = () => {
    const nextPending = !includePending;
    setIsCopied(false);

    if (!isManuallyEdited) {
      setIncludePending(nextPending);
      setText(
        buildFullSummaryText(event, includedGroups, nextPending, includeBoardUrl)
      );
      return;
    }

    let nextText = text;
    let replacedAny = false;
    for (const gk of includedGroups) {
      const prevBlock = buildGroupBlock(event, gk, includePending);
      const updatedBlock = buildGroupBlock(event, gk, nextPending);
      if (nextText.includes(prevBlock)) {
        nextText = nextText.replace(prevBlock, updatedBlock);
        replacedAny = true;
      }
    }
    setIncludePending(nextPending);
    if (replacedAny) {
      setText(nextText);
    } else {
      toast.info(
        nextPending
          ? "以降に追加するグループから未回答者も記載します（既存文面へ反映するにはリセットしてください）"
          : "未回答者の自動記載をOFFにしました"
      );
    }
  };

  // 「出欠表リンク」トグル
  const handleToggleBoardUrl = () => {
    const nextWithUrl = !includeBoardUrl;
    setIsCopied(false);

    if (!isManuallyEdited) {
      setIncludeBoardUrl(nextWithUrl);
      setText(
        buildFullSummaryText(event, includedGroups, includePending, nextWithUrl)
      );
      return;
    }

    const footerBlock = buildBoardLinkFooter(event, includedGroups);
    setIncludeBoardUrl(nextWithUrl);

    if (nextWithUrl) {
      const trimmed = text.replace(/\s+$/, "");
      if (!trimmed.includes("📲 出欠登録・確認はこちら:")) {
        setText(trimmed ? `${trimmed}\n\n${footerBlock}` : footerBlock);
      }
    } else {
      const cleaned = collapseExcessBlankLines(
        text.replace(
          /\n*📲 出欠登録・確認はこちら:\nhttps?:\/\/\S+/g,
          ""
        )
      );
      setText(cleaned);
    }
  };

  // 初期状態へリセット（誤タップ対策の「元に戻す」トースト付き）
  const handleReset = () => {
    if (!canReset) return;
    const undoSnapshot: ResetUndoSnapshot = {
      text,
      includedGroups: [...includedGroups],
      includePending,
      includeBoardUrl,
      isManuallyEdited,
    };

    setIncludedGroups(initialGroupsState);
    setIncludePending(false);
    setIncludeBoardUrl(false);
    setIsManuallyEdited(false);
    setText(initialSnapshotText);
    setIsCopied(false);

    toast("初期状態のテキストにリセットしました", {
      action: {
        label: "元に戻す",
        onClick: () => {
          setText(undoSnapshot.text);
          setIncludedGroups(undoSnapshot.includedGroups);
          setIncludePending(undoSnapshot.includePending);
          setIncludeBoardUrl(undoSnapshot.includeBoardUrl);
          setIsManuallyEdited(undoSnapshot.isManuallyEdited);
        },
      },
    });
  };

  // クリップボードにコピー
  const handleCopyClipboard = async () => {
    const clean = text.trim();
    if (!clean) {
      toast.error("コピーするテキストが空です");
      return;
    }

    let copied = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(clean);
        copied = true;
      }
    } catch {
      // fallback below
    }

    if (!copied) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = clean;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        copied = document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        // ignore fallback error
      }
    }

    if (copied) {
      setIsCopied(true);
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = setTimeout(() => {
        setIsCopied(false);
      }, 2200);
      toast.success("集計テキストをクリップボードにコピーしました！");
    } else {
      toast.error("クリップボードへのコピーに失敗しました");
    }
  };

  // LINEへ転送
  const handleShareViaLine = async () => {
    const clean = text.trim();
    if (!clean || isSharingLine) {
      if (!clean) toast.error("転送するテキストが空です");
      return;
    }

    setIsSharingLine(true);
    try {
      const outcome = await sharePlainTextViaLine({
        text: clean,
        liff,
      });
      if (outcome === "shared") {
        toast.success("LINEへ集計テキストを送信しました！");
      }
    } finally {
      setIsSharingLine(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 animate-in fade-in duration-150">
      <div
        className="absolute inset-0"
        onClick={() => !isSharingLine && onClose()}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-summary-share-title"
        className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col max-h-[89dvh] sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* A-3 上帯ダークキャップ */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-start justify-between gap-2 shrink-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center shrink-0 mt-0.5">
              <ClipboardCopy className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3
                  id="attendance-summary-share-title"
                  className="text-sm font-black text-white"
                >
                  出欠集計テキスト作成・共有
                </h3>
                {event.dutyGroup && event.dutyGroup !== "なし" && (
                  <span className="text-[10px] text-amber-300 font-black px-1.5 py-0.5 rounded bg-slate-800 border border-amber-400/35 shrink-0">
                    当番班: {event.dutyGroup}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 font-bold mt-0.5 truncate">
                📅 {event.date}({event.dayOfWeek}) : {event.title}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSharingLine}
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 active:scale-90 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* メイン操作エリア */}
        <div className="flex-1 min-h-0 flex flex-col p-3.5 sm:p-4 gap-3 overflow-y-auto no-scrollbar">
          {/* ① 他のグループの出欠挿入・切替パネル */}
          <div className="rounded-xl border border-border bg-muted/35 p-2.5 space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black text-foreground flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                <span>出欠グループの挿入・切替</span>
              </span>

              {!isAllGroupsIncluded && (
                <button
                  type="button"
                  onClick={handleInsertAllGroups}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-card hover:bg-muted text-teal-700 dark:text-teal-300 border border-teal-500/35 text-[10px] font-black active:scale-95 transition-all cursor-pointer shrink-0"
                >
                  <Plus className="w-3 h-3 shrink-0" />
                  <span>全グループ挿入</span>
                </button>
              )}
            </div>

            {/* 4グループ選択・挿入グリッド */}
            <div className="grid grid-cols-4 gap-1.5">
              {GROUP_ORDER.map((gk) => {
                const orderIdx = includedGroups.indexOf(gk);
                const isIncluded = orderIdx >= 0;
                const stat = groupStats[gk];
                const meta = GROUP_META[gk];

                return (
                  <button
                    key={gk}
                    type="button"
                    onClick={() => handleToggleOrInsertGroup(gk)}
                    className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border text-center transition-all active:scale-95 cursor-pointer ${
                      isIncluded
                        ? "border-2 border-teal-600 dark:border-teal-400 bg-teal-500/12 text-foreground shadow-2xs"
                        : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-1 leading-none">
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-[9.5px] font-black shrink-0 ${
                          isIncluded
                            ? "bg-teal-600 text-white"
                            : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        {isIncluded ? (
                          includedGroups.length >= 2 ? (
                            orderIdx + 1
                          ) : (
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          )
                        ) : (
                          <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                        )}
                      </span>
                      <span
                        className={`text-[11px] font-black truncate ${
                          isIncluded ? "text-teal-800 dark:text-teal-200" : ""
                        }`}
                      >
                        {meta.shortLabel}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-muted-foreground mt-1 tabular-nums leading-none">
                      参加{stat.present}/{stat.activeTotal}名
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 補助挿入オプション（未回答者の記載・出欠表URL追加） */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/70">
              <button
                type="button"
                onClick={handleToggleIncludePending}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all active:scale-95 cursor-pointer ${
                  includePending
                    ? "bg-teal-600 text-white border-teal-600 shadow-2xs"
                    : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted"
                }`}
              >
                <UserCheck className="w-3 h-3 shrink-0" />
                <span>
                  {includePending
                    ? "✓ 未回答も記載中"
                    : `＋ 未回答も記載${
                        totalPendingInIncluded > 0 ? `(${totalPendingInIncluded}名)` : ""
                      }`}
                </span>
              </button>

              <button
                type="button"
                onClick={handleToggleBoardUrl}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all active:scale-95 cursor-pointer ${
                  includeBoardUrl
                    ? "bg-teal-600 text-white border-teal-600 shadow-2xs"
                    : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted"
                }`}
              >
                <Link2 className="w-3 h-3 shrink-0" />
                <span>
                  {includeBoardUrl ? "✓ 出欠表URLあり" : "＋ 出欠表URLを追加"}
                </span>
              </button>
            </div>
          </div>

          {/* ② テキストプレビュー・自由編集エリア ＆ リセットボタン */}
          <div className="flex-1 min-h-[180px] flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 px-0.5 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <label
                  htmlFor="attendance-summary-textarea"
                  className="text-xs font-black text-foreground truncate"
                >
                  テキスト内容（自由に編集可能）
                </label>
                {isManuallyEdited && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[9.5px] font-black shrink-0">
                    編集済
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                  {text.length.toLocaleString()}文字
                </span>
                <button
                  type="button"
                  disabled={!canReset}
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card hover:bg-muted text-foreground border border-border text-[10.5px] font-black active:scale-95 transition-all cursor-pointer disabled:opacity-35 disabled:pointer-events-none"
                  title="編集や挿入を初期状態に戻す"
                >
                  <RotateCcw className="w-3 h-3 shrink-0" />
                  <span>リセット</span>
                </button>
              </div>
            </div>

            <textarea
              id="attendance-summary-textarea"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setIsManuallyEdited(true);
                if (isCopied) setIsCopied(false);
              }}
              placeholder="上のグループボタンをタップするか、連絡テキストを入力してください..."
              style={{ WebkitOverflowScrolling: "touch" }}
              className="flex-1 min-h-[175px] sm:min-h-[215px] w-full p-3 text-xs leading-relaxed font-medium rounded-xl bg-muted/35 border border-border focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground resize-none select-text"
            />
          </div>
        </div>

        {/* 下部アクションバー（Safe Area対応・コピー ＆ LINE転送） */}
        <div className="px-4 py-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => void handleCopyClipboard()}
            className="flex-1 h-11 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {isCopied ? (
              <>
                <Check className="w-4 h-4 shrink-0" />
                <span>コピー完了！</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 shrink-0" />
                <span>クリップボードにコピー</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={!text.trim() || isSharingLine}
            onClick={() => void handleShareViaLine()}
            className="flex-1 h-11 px-3 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSharingLine ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>起動中...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 shrink-0" />
                <span>LINEで転送</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
