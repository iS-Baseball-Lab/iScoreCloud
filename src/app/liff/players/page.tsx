// filepath: src/app/liff/players/page.tsx
"use client";

import React, { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  IdCard,
  Search,
  LayoutGrid,
  List,
  X,
  Crown,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Sparkles,
  Users,
  Flame,
  Activity,
  TrendingUp,
  Loader2,
  Camera,
  Lock,
  Check,
  ShieldAlert,
  SlidersHorizontal,
  Edit3,
  UserCheck,
  Music,
  Heart,
  Wrench,
  Gauge,
  GraduationCap,
  Volume2,
  ImagePlus,
} from "lucide-react";
import { toast } from "sonner";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { peekLiffApiCache, invalidateLiffApiCache } from "@/lib/liff/api-cache";
import { EmptyState } from "@/components/layout/EmptyState";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { SavedPlayerProfilePayload } from "@/components/liff/PlayerProfileEditModal";
import type { PlayerPhotoKind } from "@/components/liff/PlayerPhotoCaptureModal";
import {
  PLAYER_CONDITION_META,
  PLAYER_CONDITION_STATUS_ORDER,
  comparePlayersByConditionAndUniform,
  loadDemoPlayerConditionOverrides,
  normalizePlayerConditionStatus,
  saveDemoPlayerConditionOverride,
  type PlayerConditionStatus,
} from "@/lib/liff/player-condition";
import {
  EMPTY_PLAYER_PROFILE_DETAILS,
  PLAY_STYLE_TAG_MAP,
  loadDemoPlayerProfileOverrides,
  parsePlayerProfileDetails,
  saveDemoPlayerProfileOverride,
  type PlayerProfileDetails,
} from "@/lib/liff/player-profile-schema";

const PlayerPhotoCaptureModal = dynamic(
  () =>
    import("@/components/liff/PlayerPhotoCaptureModal").then(
      (m) => m.PlayerPhotoCaptureModal
    ),
  { ssr: false }
);

const PlayerProfileEditModal = dynamic(
  () =>
    import("@/components/liff/PlayerProfileEditModal").then(
      (m) => m.PlayerProfileEditModal
    ),
  { ssr: false }
);

const TeamCoverPhotoModal = dynamic(
  () =>
    import("@/components/liff/TeamCoverPhotoModal").then(
      (m) => m.TeamCoverPhotoModal
    ),
  { ssr: false }
);

type RosterCategory = "投手" | "捕手" | "内野手" | "外野手" | "DH" | "未設定";
type FilterCategory = "すべて" | RosterCategory | "ケア・休部";

interface PlayerBattingStat {
  pa: number;
  ab: number;
  hits: number;
  hr: number;
  walks: number;
  avg: string;
}

interface PlayerPitchingStat {
  battersFaced: number;
  outs: number;
  inningsText: string;
  strikeouts: number;
  hitsAllowed: number;
  walks: number;
}

interface DirectoryPositionCount {
  position: string;
  games: number;
  sharePercent: number;
}

interface DirectoryPlayer {
  id: string;
  name: string;
  nameKana: string | null;
  uniformNumber: string;
  nickname?: string | null;
  primaryPosition: string | null;
  subPositions: string[];
  registeredPrimaryPosition?: string | null;
  registeredSubPositions?: string[];
  positionCounts?: DirectoryPositionCount[];
  totalPositionGames?: number;
  positionSource?: "match_data" | "profile";
  throws: string | null;
  bats: string | null;
  height: number | null;
  weight: number | null;
  editableWeight?: number | null;
  profileImageUrl: string | null;
  notes: string | null;
  profileDetails?: PlayerProfileDetails;
  isSelf?: boolean;
  isLinkedChild?: boolean;
  canEditProfile?: boolean;
  hasLinkedUser?: boolean;
  conditionStatus?: PlayerConditionStatus;
  conditionNote?: string | null;
  isCaptain: boolean;
  joinedAt: number | null;
  batting: PlayerBattingStat | null;
  pitching: PlayerPitchingStat | null;
}

interface DirectoryTeamInfo {
  id: string;
  name: string;
  orgName: string;
  teamName: string;
  managerName: string | null;
  logoImageUrl: string | null;
  coverImageUrl?: string | null;
  year: number;
  captainId: string | null;
}

interface PlayersDirectoryResponse {
  success: boolean;
  isDemo?: boolean;
  canManagePlayers?: boolean;
  mySelfPlayerId?: string | null;
  myLinkedChildIds?: string[];
  canClaimSelfPlayer?: boolean;
  error?: string;
  team?: DirectoryTeamInfo;
  players?: DirectoryPlayer[];
}

const CONDITION_NOTE_PRESETS: Record<Exclude<PlayerConditionStatus, "active">, string[]> = {
  restricted: [
    "投球NG（打撃・守備は可）",
    "打撃・走塁のみ可",
    "球数・イニング制限あり",
    "送球制限（一塁・DH可）",
  ],
  rehab: [
    "別メニュー調整中（ベンチ帯同可）",
    "長期療養・リハビリ専念中",
    "復帰時期調整中",
  ],
  on_leave: [
    "家庭の事情により一時休部",
    "受験・学業優先のため一時休部",
    "復帰時期未定",
  ],
};

interface PositionMeta {
  category: RosterCategory;
  shortLabel: string;
  fullLabel: string;
  code: string;
}

const POSITION_MAP: Record<string, PositionMeta> = {
  P: { category: "投手", shortLabel: "投手", fullLabel: "投手 (PITCHER)", code: "P" },
  "1": { category: "投手", shortLabel: "投手", fullLabel: "投手 (PITCHER)", code: "P" },
  投手: { category: "投手", shortLabel: "投手", fullLabel: "投手 (PITCHER)", code: "P" },
  ピッチャー: { category: "投手", shortLabel: "投手", fullLabel: "投手 (PITCHER)", code: "P" },

  C: { category: "捕手", shortLabel: "捕手", fullLabel: "捕手 (CATCHER)", code: "C" },
  "2": { category: "捕手", shortLabel: "捕手", fullLabel: "捕手 (CATCHER)", code: "C" },
  捕手: { category: "捕手", shortLabel: "捕手", fullLabel: "捕手 (CATCHER)", code: "C" },
  キャッチャー: { category: "捕手", shortLabel: "捕手", fullLabel: "捕手 (CATCHER)", code: "C" },

  "1B": { category: "内野手", shortLabel: "一塁手", fullLabel: "一塁手 (1B)", code: "1B" },
  "3": { category: "内野手", shortLabel: "一塁手", fullLabel: "一塁手 (1B)", code: "1B" },
  一塁: { category: "内野手", shortLabel: "一塁手", fullLabel: "一塁手 (1B)", code: "1B" },
  一塁手: { category: "内野手", shortLabel: "一塁手", fullLabel: "一塁手 (1B)", code: "1B" },

  "2B": { category: "内野手", shortLabel: "二塁手", fullLabel: "二塁手 (2B)", code: "2B" },
  "4": { category: "内野手", shortLabel: "二塁手", fullLabel: "二塁手 (2B)", code: "2B" },
  二塁: { category: "内野手", shortLabel: "二塁手", fullLabel: "二塁手 (2B)", code: "2B" },
  二塁手: { category: "内野手", shortLabel: "二塁手", fullLabel: "二塁手 (2B)", code: "2B" },

  "3B": { category: "内野手", shortLabel: "三塁手", fullLabel: "三塁手 (3B)", code: "3B" },
  "5": { category: "内野手", shortLabel: "三塁手", fullLabel: "三塁手 (3B)", code: "3B" },
  三塁: { category: "内野手", shortLabel: "三塁手", fullLabel: "三塁手 (3B)", code: "3B" },
  三塁手: { category: "内野手", shortLabel: "三塁手", fullLabel: "三塁手 (3B)", code: "3B" },

  SS: { category: "内野手", shortLabel: "遊撃手", fullLabel: "遊撃手 (SS)", code: "SS" },
  "6": { category: "内野手", shortLabel: "遊撃手", fullLabel: "遊撃手 (SS)", code: "SS" },
  遊撃: { category: "内野手", shortLabel: "遊撃手", fullLabel: "遊撃手 (SS)", code: "SS" },
  遊撃手: { category: "内野手", shortLabel: "遊撃手", fullLabel: "遊撃手 (SS)", code: "SS" },
  内野: { category: "内野手", shortLabel: "内野手", fullLabel: "内野手 (INFIELDER)", code: "IF" },
  内野手: { category: "内野手", shortLabel: "内野手", fullLabel: "内野手 (INFIELDER)", code: "IF" },

  LF: { category: "外野手", shortLabel: "左翼手", fullLabel: "左翼手 (LF)", code: "LF" },
  "7": { category: "外野手", shortLabel: "左翼手", fullLabel: "左翼手 (LF)", code: "LF" },
  左翼: { category: "外野手", shortLabel: "左翼手", fullLabel: "左翼手 (LF)", code: "LF" },
  左翼手: { category: "外野手", shortLabel: "左翼手", fullLabel: "左翼手 (LF)", code: "LF" },

  CF: { category: "外野手", shortLabel: "中堅手", fullLabel: "中堅手 (CF)", code: "CF" },
  "8": { category: "外野手", shortLabel: "中堅手", fullLabel: "中堅手 (CF)", code: "CF" },
  中堅: { category: "外野手", shortLabel: "中堅手", fullLabel: "中堅手 (CF)", code: "CF" },
  中堅手: { category: "外野手", shortLabel: "中堅手", fullLabel: "中堅手 (CF)", code: "CF" },

  RF: { category: "外野手", shortLabel: "右翼手", fullLabel: "右翼手 (RF)", code: "RF" },
  "9": { category: "外野手", shortLabel: "右翼手", fullLabel: "右翼手 (RF)", code: "RF" },
  右翼: { category: "外野手", shortLabel: "右翼手", fullLabel: "右翼手 (RF)", code: "RF" },
  右翼手: { category: "外野手", shortLabel: "右翼手", fullLabel: "右翼手 (RF)", code: "RF" },
  外野: { category: "外野手", shortLabel: "外野手", fullLabel: "外野手 (OUTFIELDER)", code: "OF" },
  外野手: { category: "外野手", shortLabel: "外野手", fullLabel: "外野手 (OUTFIELDER)", code: "OF" },

  DH: { category: "DH", shortLabel: "指名打者", fullLabel: "指名打者 (DH)", code: "DH" },
  指名打者: { category: "DH", shortLabel: "指名打者", fullLabel: "指名打者 (DH)", code: "DH" },
};

function resolvePositionMeta(rawPos: string | null | undefined): PositionMeta {
  if (!rawPos) {
    return { category: "未設定", shortLabel: "選手", fullLabel: "ポジション未設定", code: "未設定" };
  }
  const clean = rawPos.trim();
  const exact = POSITION_MAP[clean] || POSITION_MAP[clean.toUpperCase()];
  if (exact) return exact;

  if (clean.includes("投")) return POSITION_MAP.P;
  if (clean.includes("捕")) return POSITION_MAP.C;
  if (clean.includes("一") || clean.includes("二") || clean.includes("三") || clean.includes("遊") || clean.includes("内")) {
    return { category: "内野手", shortLabel: clean, fullLabel: clean, code: "IF" };
  }
  if (clean.includes("左") || clean.includes("中") || clean.includes("右") || clean.includes("外")) {
    return { category: "外野手", shortLabel: clean, fullLabel: clean, code: "OF" };
  }

  return { category: "未設定", shortLabel: clean, fullLabel: clean, code: clean };
}

interface CategoryStyleDef {
  stageBg: string;
  pillSolid: string;
  pillSoft: string;
  barSolid: string;
  dot: string;
  codeText: string;
  ring: string;
}

const CATEGORY_STYLES: Record<RosterCategory, CategoryStyleDef> = {
  投手: {
    stageBg: "bg-rose-500/[0.06] dark:bg-rose-500/[0.10] border-b border-border",
    pillSolid: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30",
    pillSoft: "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25",
    barSolid: "bg-rose-500",
    dot: "bg-rose-500",
    codeText: "text-rose-600/85 dark:text-rose-300/85",
    ring: "ring-rose-500/25",
  },
  捕手: {
    stageBg: "bg-sky-500/[0.06] dark:bg-sky-500/[0.10] border-b border-border",
    pillSolid: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30",
    pillSoft: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25",
    barSolid: "bg-sky-500",
    dot: "bg-sky-500",
    codeText: "text-sky-600/85 dark:text-sky-300/85",
    ring: "ring-sky-500/25",
  },
  内野手: {
    stageBg: "bg-amber-500/[0.06] dark:bg-amber-500/[0.10] border-b border-border",
    pillSolid: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
    pillSoft: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25",
    barSolid: "bg-amber-500",
    dot: "bg-amber-500",
    codeText: "text-amber-700/85 dark:text-amber-300/85",
    ring: "ring-amber-500/25",
  },
  外野手: {
    stageBg: "bg-emerald-500/[0.06] dark:bg-emerald-500/[0.10] border-b border-border",
    pillSolid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
    pillSoft: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
    barSolid: "bg-emerald-500",
    dot: "bg-emerald-500",
    codeText: "text-emerald-700/85 dark:text-emerald-300/85",
    ring: "ring-emerald-500/25",
  },
  DH: {
    stageBg: "bg-purple-500/[0.06] dark:bg-purple-500/[0.10] border-b border-border",
    pillSolid: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30",
    pillSoft: "bg-purple-500/12 text-purple-700 dark:text-purple-300 border-purple-500/25",
    barSolid: "bg-purple-500",
    dot: "bg-purple-500",
    codeText: "text-purple-700/85 dark:text-purple-300/85",
    ring: "ring-purple-500/25",
  },
  未設定: {
    stageBg: "bg-muted/50 border-b border-border",
    pillSolid: "bg-muted text-muted-foreground border border-border",
    pillSoft: "bg-muted/50 text-muted-foreground border-border",
    barSolid: "bg-muted-foreground/40",
    dot: "bg-muted-foreground",
    codeText: "text-muted-foreground",
    ring: "ring-border",
  },
};

function formatThrowsBats(throws: string | null, bats: string | null): string | null {
  const t = throws === "R" ? "右投" : throws === "L" ? "左投" : throws || "";
  const b =
    bats === "R"
      ? "右打"
      : bats === "L"
      ? "左打"
      : bats === "B"
      ? "両打"
      : bats || "";
  const joined = `${t}${b}`.trim();
  return joined || null;
}

function cleanUniformNumber(raw: string | null | undefined): string {
  if (!raw) return "--";
  const c = raw.trim().replace(/^#/, "");
  return c || "--";
}

function hydrateDirectoryPlayer(p: DirectoryPlayer): DirectoryPlayer {
  const details = p.profileDetails
    ? parsePlayerProfileDetails(p.profileDetails)
    : { ...EMPTY_PLAYER_PROFILE_DETAILS, playStyleTags: [] };
  return {
    ...p,
    profileDetails: details,
    conditionStatus: normalizePlayerConditionStatus(p.conditionStatus),
    conditionNote: p.conditionNote ?? null,
  };
}

function LiffPlayersDirectoryContent() {
  const {
    currentTeam,
    profile,
    isDemo: providerDemo,
    isLoggedIn,
    login,
    refreshTeams,
    updateCurrentTeamCover,
  } = useLiff();
  const searchParams = useSearchParams();

  const initialCachedPlayers = useMemo(() => {
    if (typeof window === "undefined") return null;
    const tid =
      currentTeam?.id ||
      localStorage.getItem("iscore_selectedTeamId") ||
      "demo-team";
    const uid =
      profile?.userId ||
      localStorage.getItem("iscore_user_id") ||
      localStorage.getItem("iscore_userId") ||
      "";
    const uName = profile?.displayName || localStorage.getItem("iscore_user_name") || "";
    const query = new URLSearchParams({ teamId: tid });
    if (uid && uid !== "cached-user") query.set("userId", uid);
    if (uName) query.set("userName", uName);
    return (
      peekLiffApiCache<PlayersDirectoryResponse>(`/api/liff/players?${query.toString()}`) ||
      peekLiffApiCache<PlayersDirectoryResponse>(`/api/liff/players?teamId=${encodeURIComponent(tid)}`)
    );
  }, [currentTeam?.id, profile?.userId, profile?.displayName]);

  const [isLoading, setIsLoading] = useState<boolean>(() => !initialCachedPlayers?.success);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => Boolean(initialCachedPlayers?.isDemo));
  const [canManagePlayers, setCanManagePlayers] = useState<boolean>(() =>
    Boolean(initialCachedPlayers?.canManagePlayers || initialCachedPlayers?.isDemo)
  );
  const [canClaimSelfPlayer, setCanClaimSelfPlayer] = useState<boolean>(() =>
    Boolean(initialCachedPlayers?.canClaimSelfPlayer)
  );
  const [teamInfo, setTeamInfo] = useState<DirectoryTeamInfo | null>(
    () => initialCachedPlayers?.team ?? null
  );
  const [players, setPlayers] = useState<DirectoryPlayer[]>(() =>
    (initialCachedPlayers?.players || []).map(hydrateDirectoryPlayer)
  );

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>("すべて");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [photoModalTarget, setPhotoModalTarget] = useState<{
    playerId: string;
    kind: PlayerPhotoKind;
  } | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [isTeamCoverModalOpen, setIsTeamCoverModalOpen] = useState<boolean>(false);

  // 本人紐付けボトムシート & 確認ステート
  const [isSelfClaimModalOpen, setIsSelfClaimModalOpen] = useState<boolean>(false);
  const [selfClaimSearch, setSelfClaimSearch] = useState<string>("");
  const [confirmingClaimPlayerId, setConfirmingClaimPlayerId] = useState<string | null>(null);
  const [isClaimingSelf, setIsClaimingSelf] = useState<boolean>(false);

  // 指導者・管理者向け：在籍・コンディション編集ステート
  const [isConditionEditorOpen, setIsConditionEditorOpen] = useState<boolean>(false);
  const [draftConditionStatus, setDraftConditionStatus] =
    useState<PlayerConditionStatus>("active");
  const [draftConditionNote, setDraftConditionNote] = useState<string>("");
  const [isSavingCondition, setIsSavingCondition] = useState<boolean>(false);

  const handledDeepLinkRef = useRef<string>("");

  const activeTeamId =
    teamInfo?.id ||
    currentTeam?.id ||
    (typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : "") ||
    "demo-team";

  const effectiveUserId =
    profile?.userId ||
    (typeof window !== "undefined"
      ? localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || ""
      : "");
  const effectiveUserName =
    profile?.displayName ||
    (typeof window !== "undefined" ? localStorage.getItem("iscore_user_name") || "" : "");

  const openPhotoModal = useCallback(
    (playerId: string, kind: PlayerPhotoKind = "portrait") => {
      setPhotoModalTarget({ playerId, kind });
    },
    []
  );

  // 背景コンテキスト（選択チーム）変更時にオーバーレイを自動リセット（規約遵守）
  useEffect(() => {
    setSelectedPlayerId(null);
    setPhotoModalTarget(null);
    setEditingPlayerId(null);
    setIsTeamCoverModalOpen(false);
    setIsConditionEditorOpen(false);
    setIsSelfClaimModalOpen(false);
    setConfirmingClaimPlayerId(null);
  }, [currentTeam?.id]);

  // 詳細モーダルで別選手に切り替えた際、コンディション編集フォームを対象選手の値に同期
  useEffect(() => {
    if (!selectedPlayerId) {
      setIsConditionEditorOpen(false);
      setConfirmingClaimPlayerId(null);
      return;
    }
    const target = players.find((p) => p.id === selectedPlayerId);
    if (target) {
      setDraftConditionStatus(normalizePlayerConditionStatus(target.conditionStatus));
      setDraftConditionNote(target.conditionNote || "");
      setIsConditionEditorOpen(false);
      setConfirmingClaimPlayerId(null);
    }
  }, [selectedPlayerId, players]);

  // URL クエリ（?playerId=xxx&edit=1 等）からの直接編集・詳細展開
  useEffect(() => {
    if (players.length === 0) return;
    const qpPlayerId = searchParams.get("playerId");
    const qpEdit = searchParams.get("edit");
    const sig = `${activeTeamId}:${qpPlayerId || ""}:${qpEdit || ""}`;
    if (!qpPlayerId && !qpEdit) return;
    if (handledDeepLinkRef.current === sig) return;

    if (qpEdit === "self") {
      const selfTarget = players.find((p) => p.isSelf);
      if (selfTarget) {
        handledDeepLinkRef.current = sig;
        setEditingPlayerId(selfTarget.id);
      }
      return;
    }

    if (qpPlayerId) {
      const found = players.find((p) => p.id === qpPlayerId);
      if (found) {
        handledDeepLinkRef.current = sig;
        setSelectedPlayerId(found.id);
        if (qpEdit === "1" && (found.canEditProfile || canManagePlayers)) {
          setEditingPlayerId(found.id);
        }
      }
    }
  }, [activeTeamId, canManagePlayers, players, searchParams]);

  const handlePhotoUpdated = useCallback(
    (
      playerId: string,
      newImageUrl: string | null,
      kind: PlayerPhotoKind = "portrait"
    ) => {
      const isDemoFlag = Boolean(
        isDemoMode || providerDemo || activeTeamId === "demo-team"
      );

      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id !== playerId) return p;

          if (kind === "action") {
            const nextDetails: PlayerProfileDetails = {
              ...(p.profileDetails || EMPTY_PLAYER_PROFILE_DETAILS),
              actionImageUrl: newImageUrl,
            };
            if (isDemoFlag) {
              saveDemoPlayerProfileOverride(playerId, {
                profileImageUrl: p.profileImageUrl,
                profileDetails: nextDetails,
              });
            }
            return {
              ...p,
              profileDetails: nextDetails,
            };
          }

          if (isDemoFlag) {
            saveDemoPlayerProfileOverride(playerId, {
              profileImageUrl: newImageUrl,
              profileDetails: p.profileDetails,
            });
          }
          return {
            ...p,
            profileImageUrl: newImageUrl,
          };
        })
      );
    },
    [activeTeamId, isDemoMode, providerDemo]
  );

  const handleProfileSaved = useCallback(
    (payload: SavedPlayerProfilePayload) => {
      setPlayers((prev) => {
        const nextList = prev.map((p) => {
          const updatedIsCaptain =
            payload.captainId !== undefined
              ? payload.captainId === p.id
              : p.id === payload.playerId && payload.updated.isCaptain !== undefined
              ? payload.updated.isCaptain
              : p.isCaptain;

          if (p.id !== payload.playerId) {
            return {
              ...p,
              isCaptain: updatedIsCaptain,
            };
          }

          const isProfilePosMode = p.positionSource !== "match_data";
          return {
            ...p,
            name: payload.updated.name || p.name,
            nameKana: payload.updated.nameKana,
            uniformNumber: payload.updated.uniformNumber || p.uniformNumber,
            nickname: payload.updated.nickname,
            registeredPrimaryPosition: payload.updated.registeredPrimaryPosition,
            registeredSubPositions: payload.updated.registeredSubPositions,
            primaryPosition: isProfilePosMode
              ? payload.updated.registeredPrimaryPosition
              : p.primaryPosition,
            subPositions: isProfilePosMode
              ? payload.updated.registeredSubPositions
              : p.subPositions,
            throws: payload.updated.throws,
            bats: payload.updated.bats,
            height: payload.updated.height,
            weight: payload.updated.weight,
            editableWeight: payload.updated.editableWeight,
            notes: payload.updated.notes,
            profileDetails: payload.updated.profileDetails,
            isCaptain: updatedIsCaptain,
            joinedAt:
              payload.updated.joinedAt !== undefined
                ? payload.updated.joinedAt
                : p.joinedAt,
          };
        });
        return nextList.sort(comparePlayersByConditionAndUniform);
      });

      if (payload.captainId !== undefined) {
        setTeamInfo((prev) =>
          prev ? { ...prev, captainId: payload.captainId ?? null } : prev
        );
      }
    },
    []
  );

  const loadPlayers = useCallback(async () => {
    try {
      const tid =
        currentTeam?.id ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : "") ||
        "demo-team";
      const uid =
        profile?.userId ||
        (typeof window !== "undefined"
          ? localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || ""
          : "");
      const uName =
        profile?.displayName ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_user_name") || "" : "");

      const query = new URLSearchParams({ teamId: tid });
      if (uid && uid !== "cached-user") query.set("userId", uid);
      if (uName) query.set("userName", uName);
      const url = `/api/liff/players?${query.toString()}`;

      const syncCached = peekLiffApiCache<PlayersDirectoryResponse>(url);
      if (syncCached?.success) {
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as PlayersDirectoryResponse;
        if (data.success) {
          const demoFlag = Boolean(data.isDemo);
          setIsDemoMode(demoFlag);
          setCanManagePlayers(Boolean(data.canManagePlayers || demoFlag));
          setCanClaimSelfPlayer(Boolean(data.canClaimSelfPlayer));
          setTeamInfo(data.team || null);

          let nextPlayers = (data.players || []).map(hydrateDirectoryPlayer);

          if (demoFlag) {
            const condOverrides = loadDemoPlayerConditionOverrides();
            const profOverrides = loadDemoPlayerProfileOverrides();
            nextPlayers = nextPlayers
              .map((p) => {
                const cOv = condOverrides[p.id];
                const pOv = profOverrides[p.id];
                const mergedDetails = pOv?.profileDetails
                  ? parsePlayerProfileDetails(pOv.profileDetails)
                  : p.profileDetails;
                const isProfilePosMode = p.positionSource !== "match_data";

                return {
                  ...p,
                  ...(pOv?.name ? { name: pOv.name } : {}),
                  ...(pOv?.nameKana !== undefined ? { nameKana: pOv.nameKana } : {}),
                  ...(pOv?.uniformNumber ? { uniformNumber: pOv.uniformNumber } : {}),
                  ...(pOv?.nickname !== undefined ? { nickname: pOv.nickname } : {}),
                  ...(pOv?.registeredPrimaryPosition !== undefined
                    ? {
                        registeredPrimaryPosition: pOv.registeredPrimaryPosition,
                        ...(isProfilePosMode
                          ? { primaryPosition: pOv.registeredPrimaryPosition }
                          : {}),
                      }
                    : {}),
                  ...(pOv?.registeredSubPositions !== undefined
                    ? {
                        registeredSubPositions: pOv.registeredSubPositions,
                        ...(isProfilePosMode
                          ? { subPositions: pOv.registeredSubPositions }
                          : {}),
                      }
                    : {}),
                  ...(pOv?.throws !== undefined ? { throws: pOv.throws } : {}),
                  ...(pOv?.bats !== undefined ? { bats: pOv.bats } : {}),
                  ...(pOv?.height !== undefined ? { height: pOv.height } : {}),
                  ...(pOv?.weight !== undefined ? { weight: pOv.weight } : {}),
                  ...(pOv?.editableWeight !== undefined
                    ? { editableWeight: pOv.editableWeight }
                    : {}),
                  ...(pOv?.notes !== undefined ? { notes: pOv.notes } : {}),
                  ...(pOv?.isCaptain !== undefined ? { isCaptain: pOv.isCaptain } : {}),
                  ...(pOv?.joinedAt !== undefined ? { joinedAt: pOv.joinedAt } : {}),
                  ...(pOv?.profileImageUrl !== undefined
                    ? { profileImageUrl: pOv.profileImageUrl }
                    : {}),
                  profileDetails: mergedDetails,
                  conditionStatus: cOv ? cOv.conditionStatus : p.conditionStatus,
                  conditionNote: cOv ? cOv.conditionNote : p.conditionNote,
                };
              })
              .sort(comparePlayersByConditionAndUniform);
          }

          setPlayers(nextPlayers);
        }
      }
    } catch (err) {
      console.error("Failed to fetch players directory:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id, profile?.displayName, profile?.userId]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  // 選手本人紐付け実行
  const handleClaimSelfPlayer = useCallback(
    async (targetPlayer: DirectoryPlayer) => {
      if (!effectiveUserId && !isDemoMode && !providerDemo) {
        toast.info("選手データを紐付けるにはLINEログインが必要です");
        login();
        return;
      }

      setIsClaimingSelf(true);
      try {
        const res = await fetch("/api/liff/profile/self-player", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: activeTeamId,
            playerId: targetPlayer.id,
            userId: effectiveUserId || undefined,
            userName: effectiveUserName || undefined,
          }),
        });

        const json = (await res.json()) as {
          success?: boolean;
          error?: string;
        };

        if (!res.ok || !json.success) {
          toast.error(json.error || "選手データの紐付けに失敗しました");
          return;
        }

        invalidateLiffApiCache("/api/liff/");

        setPlayers((prev) =>
          prev.map((p) => {
            if (p.id === targetPlayer.id) {
              return {
                ...p,
                isSelf: true,
                canEditProfile: true,
                hasLinkedUser: true,
                editableWeight: p.editableWeight ?? p.weight,
              };
            }
            return p.isSelf ? { ...p, isSelf: false } : p;
          })
        );
        setCanClaimSelfPlayer(false);
        setIsSelfClaimModalOpen(false);
        setConfirmingClaimPlayerId(null);

        toast.success(
          `「#${cleanUniformNumber(targetPlayer.uniformNumber)} ${targetPlayer.name}」をご自身の選手カードとして紐付けました！`
        );
        // 紐付け直後にそのままプロフィール入力モーダルを開く（デッドエンド防止）
        setEditingPlayerId(targetPlayer.id);
      } catch (err) {
        console.error("Failed to claim self player:", err);
        toast.error("通信エラーにより紐付けできませんでした");
      } finally {
        setIsClaimingSelf(false);
      }
    },
    [
      activeTeamId,
      effectiveUserId,
      effectiveUserName,
      isDemoMode,
      login,
      providerDemo,
    ]
  );

  const handleSaveCondition = useCallback(async () => {
    if (!selectedPlayerId) return;
    setIsSavingCondition(true);
    try {
      const trimmedNote =
        draftConditionStatus === "active" && !draftConditionNote.trim()
          ? null
          : draftConditionNote.trim()
          ? draftConditionNote.trim().slice(0, 160)
          : null;

      const res = await fetch(
        `/api/liff/players/${encodeURIComponent(selectedPlayerId)}/condition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: activeTeamId,
            userId: effectiveUserId || null,
            userName: effectiveUserName || null,
            conditionStatus: draftConditionStatus,
            conditionNote: trimmedNote,
          }),
        }
      );

      const json = (await res.json()) as {
        success?: boolean;
        isDemo?: boolean;
        conditionStatus?: PlayerConditionStatus;
        conditionNote?: string | null;
        error?: string;
      };

      if (!res.ok || !json.success) {
        toast.error(json.error || "在籍・コンディション設定の保存に失敗しました");
        return;
      }

      const savedStatus = normalizePlayerConditionStatus(
        json.conditionStatus ?? draftConditionStatus
      );
      const savedNote = json.conditionNote !== undefined ? json.conditionNote : trimmedNote;

      if (isDemoMode || providerDemo || activeTeamId === "demo-team") {
        saveDemoPlayerConditionOverride(selectedPlayerId, savedStatus, savedNote);
      }

      setPlayers((prev) =>
        prev
          .map((p) =>
            p.id === selectedPlayerId
              ? { ...p, conditionStatus: savedStatus, conditionNote: savedNote }
              : p
          )
          .sort(comparePlayersByConditionAndUniform)
      );

      invalidateLiffApiCache("/api/liff/");
      setIsConditionEditorOpen(false);
      toast.success(
        `在籍・コンディションを「${PLAYER_CONDITION_META[savedStatus].label}」に更新しました`
      );
    } catch (err) {
      console.error("Failed to save condition:", err);
      toast.error("通信エラーにより保存できませんでした");
    } finally {
      setIsSavingCondition(false);
    }
  }, [
    activeTeamId,
    draftConditionNote,
    draftConditionStatus,
    effectiveUserId,
    effectiveUserName,
    isDemoMode,
    providerDemo,
    selectedPlayerId,
  ]);

  // 自分または紐付けお子様の選手リスト
  const myPersonalPlayers = useMemo(
    () => players.filter((p) => p.isSelf || p.isLinkedChild),
    [players]
  );

  // 写真設定が可能な選手一覧（指導者・管理者はチーム全員 / 一般選手・保護者は自分・お子様のみ）
  const editablePhotoPlayers = useMemo(
    () =>
      canManagePlayers
        ? players
        : players.filter((p) => p.canEditProfile || p.isSelf || p.isLinkedChild),
    [canManagePlayers, players]
  );

  // 稼働メンバー数 / 休部数 / ケア・制限数
  const rosterStatusCounts = useMemo(() => {
    let activeCount = 0;
    let restrictedCount = 0;
    let rehabCount = 0;
    let onLeaveCount = 0;
    for (const p of players) {
      const st = normalizePlayerConditionStatus(p.conditionStatus);
      if (st === "on_leave") {
        onLeaveCount += 1;
      } else {
        activeCount += 1;
        if (st === "restricted") restrictedCount += 1;
        else if (st === "rehab") rehabCount += 1;
      }
    }
    return {
      activeCount,
      restrictedCount,
      rehabCount,
      onLeaveCount,
      careOrLeaveCount: restrictedCount + rehabCount + onLeaveCount,
    };
  }, [players]);

  // カテゴリ別カウント（現在活動中の選手をベースに集計）
  const categoryCounts = useMemo(() => {
    const counts: Record<RosterCategory, number> = {
      投手: 0,
      捕手: 0,
      内野手: 0,
      外野手: 0,
      DH: 0,
      未設定: 0,
    };
    for (const p of players) {
      if (normalizePlayerConditionStatus(p.conditionStatus) === "on_leave") continue;
      const meta = resolvePositionMeta(p.primaryPosition);
      counts[meta.category] += 1;
    }
    return counts;
  }, [players]);

  // 表示するフィルタチップ一覧
  const filterTabs = useMemo(() => {
    const base: FilterCategory[] = ["すべて", "投手", "捕手", "内野手", "外野手"];
    if (categoryCounts.DH > 0) base.push("DH");
    if (categoryCounts.未設定 > 0) base.push("未設定");
    if (rosterStatusCounts.careOrLeaveCount > 0) base.push("ケア・休部");
    return base;
  }, [categoryCounts, rosterStatusCounts.careOrLeaveCount]);

  // 絞り込み済み選手リスト
  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return players.filter((p) => {
      const meta = resolvePositionMeta(p.primaryPosition);
      const condStatus = normalizePlayerConditionStatus(p.conditionStatus);
      const condMeta = PLAYER_CONDITION_META[condStatus];

      if (selectedCategory === "ケア・休部") {
        if (condStatus === "active") return false;
      } else if (selectedCategory !== "すべて") {
        if (condStatus === "on_leave") return false;
        if (meta.category !== selectedCategory) return false;
      }

      if (!q) return true;
      const num = cleanUniformNumber(p.uniformNumber).toLowerCase();
      const subText = p.subPositions
        .map((sp) => resolvePositionMeta(sp).shortLabel.toLowerCase())
        .join(" ");
      const details = p.profileDetails;
      const tagsText = (details?.playStyleTags || [])
        .map((tid) => PLAY_STYLE_TAG_MAP[tid]?.label || "")
        .join(" ")
        .toLowerCase();

      return (
        p.name.toLowerCase().includes(q) ||
        (p.nameKana || "").toLowerCase().includes(q) ||
        (p.nickname || "").toLowerCase().includes(q) ||
        num.includes(q) ||
        meta.shortLabel.toLowerCase().includes(q) ||
        subText.includes(q) ||
        condMeta.label.toLowerCase().includes(q) ||
        tagsText.includes(q) ||
        (details?.gradeOrAge || "").toLowerCase().includes(q) ||
        (details?.favoriteTeam || "").toLowerCase().includes(q) ||
        (details?.admiredPlayer || "").toLowerCase().includes(q)
      );
    });
  }, [players, selectedCategory, searchQuery]);

  const selfClaimCandidates = useMemo(() => {
    const q = selfClaimSearch.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.nameKana || "").toLowerCase().includes(q) ||
        cleanUniformNumber(p.uniformNumber).toLowerCase().includes(q)
    );
  }, [players, selfClaimSearch]);

  const hasMatchAggregatedPositions = useMemo(
    () => players.some((p) => p.positionSource === "match_data"),
    [players]
  );

  // 詳細モーダル対象の選手 & 前後インデックス
  const selectedIndex = useMemo(() => {
    if (!selectedPlayerId) return -1;
    return filteredPlayers.findIndex((p) => p.id === selectedPlayerId);
  }, [filteredPlayers, selectedPlayerId]);

  const selectedPlayer = selectedIndex >= 0 ? filteredPlayers[selectedIndex] : null;
  const prevPlayer = selectedIndex > 0 ? filteredPlayers[selectedIndex - 1] : null;
  const nextPlayer =
    selectedIndex >= 0 && selectedIndex < filteredPlayers.length - 1
      ? filteredPlayers[selectedIndex + 1]
      : null;

  const editingPlayer = useMemo(
    () => (editingPlayerId ? players.find((p) => p.id === editingPlayerId) || null : null),
    [editingPlayerId, players]
  );

  const teamHeadline = teamInfo?.orgName || currentTeam?.orgName || currentTeam?.name || "チーム";
  const teamSubname = teamInfo?.teamName || currentTeam?.teamName || "";
  const effectiveTeamLogoUrl = currentTeam?.logoImageUrl || teamInfo?.logoImageUrl || null;
  const effectiveTeamCoverUrl =
    currentTeam?.coverImageUrl || teamInfo?.coverImageUrl || null;
  const teamInitials = teamHeadline.replace(/\s+/g, "").slice(0, 2).toUpperCase() || "TM";
  const seasonYear = teamInfo?.year || 2026;

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader
        shareData={{
          title: `【選手名鑑】${teamHeadline} (${players.length}名)`,
          text: `${seasonYear}年度 オフィシャル選手名鑑・背番号一覧をチェック！`,
        }}
      />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <LiffPageHeader
          title="選手名鑑"
          subtitle="背番号・守備位置・選手プロフィール"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <IdCard className="w-4.5 h-4.5" />
            </span>
          }
          showBack
          rightElement={
            players.length > 0 ? (
              <div className="flex items-center gap-1.5">
                {editablePhotoPlayers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const editableIds = new Set(
                        editablePhotoPlayers.map((p) => p.id)
                      );
                      const filteredEditable = filteredPlayers.filter((p) =>
                        editableIds.has(p.id)
                      );
                      const firstUnshot =
                        filteredEditable.find((p) => !p.profileImageUrl) ||
                        editablePhotoPlayers.find((p) => !p.profileImageUrl) ||
                        filteredEditable[0] ||
                        editablePhotoPlayers[0];
                      if (firstUnshot) {
                        openPhotoModal(firstUnshot.id, "portrait");
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-[#0f172a] text-white hover:bg-slate-800 border border-slate-700 text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all shadow-2xs cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-teal-400" />
                    <span>写真撮影</span>
                  </button>
                )}
                <Link
                  href={`/liff/players/growth?id=${encodeURIComponent(
                    (teamInfo?.captainId && players.some((p) => p.id === teamInfo.captainId)
                      ? teamInfo.captainId
                      : players[0].id)
                  )}`}
                  className="px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all shadow-2xs"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>個人成長</span>
                </Link>
              </div>
            ) : undefined
          }
          shareData={{
            title: `【選手名鑑】${teamHeadline} (${players.length}名)`,
            text: `${seasonYear}年度 オフィシャル選手名鑑・背番号一覧をチェック！`,
          }}
        />

        {/* ━━━ 🏟️ 選手名鑑 チーム情報ヘッダー（案B：境界オーバーラップ型 × 背景カバー写真対応） ━━━ */}
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-xs">
          {/* 上部ワイドステージ（背景カバー写真を遮らないよう最小限の角バッジのみ配置） */}
          <div className="relative h-36 sm:h-40 w-full p-3.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary overflow-hidden">
            {effectiveTeamCoverUrl ? (
              <>
                <img
                  src={effectiveTeamCoverUrl}
                  alt=""
                  decoding="async"
                  className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover object-center"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-slate-950/20"
                />
              </>
            ) : (
              <svg
                aria-hidden="true"
                viewBox="0 0 160 160"
                className="pointer-events-none absolute -right-6 -top-6 w-40 h-40 text-slate-800"
                fill="none"
              >
                <rect
                  x="80"
                  y="14"
                  width="92"
                  height="92"
                  rx="10"
                  transform="rotate(45 80 14)"
                  stroke="currentColor"
                  strokeWidth="8"
                />
                <circle cx="80" cy="80" r="16" stroke="currentColor" strokeWidth="6" />
              </svg>
            )}

            <div className="relative z-10 flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black tracking-wider shadow-2xs">
                  {seasonYear}年度
                </span>
                {(isDemoMode || providerDemo) && (
                  <span className="px-2 py-0.5 rounded bg-[#0f172a] text-slate-200 border border-slate-700 text-[10px] font-black shadow-2xs">
                    DEMO
                  </span>
                )}
              </div>

              {canManagePlayers && (
                <button
                  type="button"
                  onClick={() => setIsTeamCoverModalOpen(true)}
                  className="px-2.5 py-1 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-slate-100 border border-slate-700 text-[10.5px] font-black flex items-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer shrink-0"
                >
                  <ImagePlus className="w-3 h-3 text-teal-400 shrink-0" />
                  <span>{effectiveTeamCoverUrl ? "背景変更" : "背景写真"}</span>
                </button>
              )}
            </div>
          </div>

          {/* 下部純白ボディ（丸枠チームロゴ境界オーバーラップ ＋ 整理されたチーム情報 ＋ 守備位置サマリー） */}
          <div className="px-3.5 pb-3.5 pt-2 bg-card space-y-3">
            {/* 境界オーバーラップ行：左に円形チームロゴ、右に在籍人数サマリー */}
            <div className="relative z-20 flex items-end justify-between gap-2.5 -mt-9">
              <div className="w-16 h-16 rounded-full border-[3px] border-card bg-card shadow-sm ring-2 ring-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                {effectiveTeamLogoUrl ? (
                  <img
                    src={effectiveTeamLogoUrl}
                    alt={teamHeadline}
                    width={64}
                    height={64}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="w-full h-full bg-primary/10 text-primary flex items-center justify-center font-black text-base select-none">
                    {teamInitials}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap justify-end pb-0.5">
                {hasMatchAggregatedPositions && (
                  <span className="px-2 py-1 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                    実戦守備集計
                  </span>
                )}
                <div className="px-2.5 py-1 rounded-xl bg-muted border border-border flex items-baseline gap-1 shadow-2xs">
                  <span className="text-[10px] font-black text-muted-foreground tracking-wider">
                    在籍選手
                  </span>
                  <span className="text-base font-black italic tracking-tight tabular-nums text-foreground leading-none">
                    {rosterStatusCounts.activeCount}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground">名</span>
                  {rosterStatusCounts.onLeaveCount > 0 && (
                    <span className="text-[9.5px] font-black text-muted-foreground tabular-nums ml-0.5">
                      (+休部{rosterStatusCounts.onLeaveCount})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* チーム名称・構成・監督・コンディション集計 */}
            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-foreground leading-snug">
                {teamHeadline}
              </h2>

              {(Boolean(teamSubname && teamSubname !== teamHeadline) ||
                Boolean(teamInfo?.managerName) ||
                rosterStatusCounts.restrictedCount > 0 ||
                rosterStatusCounts.rehabCount > 0) && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground flex-wrap">
                  {teamSubname && teamSubname !== teamHeadline && (
                    <span className="text-muted-foreground font-black">{teamSubname}</span>
                  )}
                  {teamInfo?.managerName && (
                    <span className="px-2 py-0.5 rounded-md bg-muted border border-border text-foreground text-[10.5px] font-black">
                      監督: {teamInfo.managerName}
                    </span>
                  )}
                  {(rosterStatusCounts.restrictedCount > 0 ||
                    rosterStatusCounts.rehabCount > 0) && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10.5px] font-black">
                      🩹 ケア・制限{" "}
                      {rosterStatusCounts.restrictedCount + rosterStatusCounts.rehabCount}名
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ポジション別サマリーバー（タップで即絞り込み連動） */}
            <div className="grid grid-cols-4 gap-1.5 pt-2.5 border-t border-border">
              {(["投手", "捕手", "内野手", "外野手"] as const).map((cat) => {
                const active = selectedCategory === cat;
                const st = CATEGORY_STYLES[cat];
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(active ? "すべて" : cat)}
                    className={`py-2 px-2 rounded-2xl border text-left transition-all active:scale-95 cursor-pointer ${
                      active
                        ? "bg-primary/12 text-primary border-primary/40 shadow-2xs"
                        : "bg-muted hover:bg-muted/80 border-border text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                      <span
                        className={`text-[10px] font-black truncate ${
                          active ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {cat}
                      </span>
                    </div>
                    <p className="text-sm font-black tabular-nums mt-0.5 pl-3.5">
                      {categoryCounts[cat]}
                      <span
                        className={`text-[10px] font-bold ml-0.5 ${
                          active ? "text-primary/80" : "text-muted-foreground"
                        }`}
                      >
                        名
                      </span>
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ━━━ ✏️ 本人・お子様の選手名鑑ダイレクト入力バー（デッドエンドゼロ導線） ━━━ */}
        {players.length > 0 && myPersonalPlayers.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="h-[3px] w-full bg-primary" />
            <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center shrink-0">
                  <Edit3 className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">
                    マイ選手カード（目標・特徴・愛用ギア）
                  </p>
                  <p className="text-[10.5px] font-bold text-muted-foreground truncate">
                    自分の選手プロフィールをいつでも直接アップデートできます
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                {myPersonalPlayers.map((mp) => (
                  <div
                    key={`quick-edit-group-${mp.id}`}
                    className="flex items-center gap-1.5"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        openPhotoModal(
                          mp.id,
                          !mp.profileImageUrl ? "portrait" : "action"
                        )
                      }
                      className="px-2.5 py-2 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white border border-slate-700 text-xs font-black flex items-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer"
                      title="正面写真・背景プレー写真を設定"
                    >
                      <Camera className="w-3.5 h-3.5 text-teal-400" />
                      <span>写真</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPlayerId(mp.id)}
                      className="px-3 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>
                        #{cleanUniformNumber(mp.uniformNumber)} {mp.name} を編集
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : players.length > 0 && (canClaimSelfPlayer || (!isLoggedIn && !isDemoMode)) ? (
          <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="h-[3px] w-full bg-teal-500" />
            <div className="p-3 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-teal-500/12 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground">
                    自分の選手カードを紐付けて名鑑を入力しよう！
                  </p>
                  <p className="text-[10.5px] font-bold text-muted-foreground">
                    目標・得意プレー・愛用ギアなどを自分で編集できます
                  </p>
                </div>
              </div>

              {isLoggedIn ? (
                <button
                  type="button"
                  onClick={() => setIsSelfClaimModalOpen(true)}
                  className="px-3 py-2 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-black shrink-0 active:scale-95 transition-all cursor-pointer"
                >
                  選手を選ぶ
                </button>
              ) : (
                <button
                  type="button"
                  onClick={login}
                  className="px-3 py-2 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black shrink-0 active:scale-95 transition-all cursor-pointer"
                >
                  LINE連携
                </button>
              )}
            </div>
          </section>
        ) : null}

        {/* ━━━ 🔍 検索・表示切替・ポジションフィルタ ━━━ */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            {/* 検索ボックス */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="背番号・名前・コール名・得意タグで検索..."
                className="w-full pl-9 pr-8 py-2.5 rounded-2xl bg-card border border-border text-xs font-bold text-foreground shadow-xs focus:outline-hidden focus:ring-2 focus:ring-primary/40"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground"
                  aria-label="検索クリア"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 表示モード切替（カード / リスト） */}
            <div className="flex items-center gap-0.5 bg-muted p-1 rounded-2xl border border-border shrink-0">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-xl transition-all active:scale-95 flex items-center gap-1 text-xs cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-card text-foreground shadow-sm border border-border font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                }`}
                title="カード表示"
              >
                <LayoutGrid className={`w-4 h-4 ${viewMode === "grid" ? "text-primary" : ""}`} />
                <span className="hidden min-[390px]:inline text-[11px]">カード</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-xl transition-all active:scale-95 flex items-center gap-1 text-xs cursor-pointer ${
                  viewMode === "list"
                    ? "bg-card text-foreground shadow-sm border border-border font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                }`}
                title="リスト表示"
              >
                <List className={`w-4 h-4 ${viewMode === "list" ? "text-primary" : ""}`} />
                <span className="hidden min-[390px]:inline text-[11px]">リスト</span>
              </button>
            </div>
          </div>

          {/* ポジションカテゴリピル */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {filterTabs.map((tab) => {
              const isSelected = selectedCategory === tab;
              const count =
                tab === "すべて"
                  ? players.length
                  : tab === "ケア・休部"
                  ? rosterStatusCounts.careOrLeaveCount
                  : categoryCounts[tab];

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSelectedCategory(tab)}
                  className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all active:scale-95 flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    isSelected
                      ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                      : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
                  }`}
                >
                  {tab === "ケア・休部" ? (
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-500" />
                  ) : tab !== "すべて" ? (
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CATEGORY_STYLES[tab].dot}`} />
                  ) : null}
                  <span>{tab}</span>
                  <span
                    className={`text-[10px] tabular-nums px-1.5 py-0.2 rounded-full ${
                      isSelected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ━━━ ⚾ 選手一覧エリア ━━━ */}
        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-12 flex flex-col items-center justify-center gap-2.5 shadow-xs">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-xs font-bold text-muted-foreground">選手名鑑を読み込み中...</p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={players.length === 0 ? "登録選手がいません" : "該当する選手がいません"}
            description={
              players.length === 0
                ? "選手が登録されるとここに一覧表示されます"
                : "別の絞り込み条件やキーワードをお試しください"
            }
          />
        ) : viewMode === "grid" ? (
          /* 🎴 モダン・トレーディングカード 2列グリッド */
          <div className="grid grid-cols-2 gap-3">
            {filteredPlayers.map((player) => {
              const posMeta = resolvePositionMeta(player.primaryPosition);
              const style = CATEGORY_STYLES[posMeta.category];
              const condStatus = normalizePlayerConditionStatus(player.conditionStatus);
              const condMeta = PLAYER_CONDITION_META[condStatus];
              const isOnLeave = condStatus === "on_leave";
              const numStr = cleanUniformNumber(player.uniformNumber);
              const tbLabel = formatThrowsBats(player.throws, player.bats);
              const initial = player.name.replace(/\s+/g, "").slice(0, 1) || "選";
              const mainGames = player.positionCounts?.[0]?.games ?? 0;
              const subLabelsShort = player.subPositions
                .map((sp) => resolvePositionMeta(sp).shortLabel)
                .filter(Boolean);
              const pDetails = player.profileDetails;
              const styleTagList = (pDetails?.playStyleTags || [])
                .map((tid) => PLAY_STYLE_TAG_MAP[tid])
                .filter(Boolean);

              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setSelectedPlayerId(player.id)}
                  className={`group relative rounded-2xl border shadow-xs overflow-hidden text-left flex flex-col transition-all active:scale-[0.98] focus:outline-hidden ${
                    isOnLeave
                      ? "border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 opacity-85 hover:opacity-100"
                      : player.isSelf || player.isLinkedChild
                      ? "border-primary/50 bg-card hover:border-primary"
                      : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  {/* カテゴリ単色ソリッドバー */}
                  <div
                    className={`h-[3px] w-full ${
                      condStatus !== "active" ? condMeta.topAccentBarClass : style.barSolid
                    }`}
                  />

                  {/* 上部ビジュアルステージ（案B：背景プレー写真 ＆ 薄めソリッドスクリム） */}
                  <div
                    className={`relative h-32 w-full p-2.5 flex flex-col justify-between overflow-hidden border-b border-border ${
                      pDetails?.actionImageUrl
                        ? "bg-slate-900"
                        : isOnLeave
                        ? "bg-slate-200/60 dark:bg-slate-800/50"
                        : "bg-muted/70"
                    }`}
                  >
                    {pDetails?.actionImageUrl ? (
                      <>
                        <img
                          src={pDetails.actionImageUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className={`pointer-events-none select-none absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
                            isOnLeave ? "grayscale-[45%] opacity-80" : ""
                          }`}
                        />
                        {/* 薄めソリッドスクリム（グラデーション・ブラー完全不使用） */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 bg-slate-950/20"
                        />
                      </>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none select-none absolute right-1 -bottom-2 text-[64px] font-black tracking-tighter leading-none text-slate-200 dark:text-slate-800 tabular-nums group-hover:scale-105 transition-transform duration-300"
                      >
                        {numStr}
                      </span>
                    )}

                    <div className="relative z-10 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <span
                          className={`px-2 py-0.5 rounded text-white text-xs font-black tracking-tight tabular-nums shadow-2xs ${
                            isOnLeave ? "bg-slate-600" : "bg-[#0f172a]"
                          }`}
                        >
                          #{numStr}
                        </span>
                        {player.isCaptain && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black flex items-center gap-0.5 shadow-2xs">
                            <Crown className="w-2.5 h-2.5 fill-current" />
                            <span>C</span>
                          </span>
                        )}
                        {player.isSelf ? (
                          <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[9.5px] font-black shadow-2xs">
                            本人
                          </span>
                        ) : player.isLinkedChild ? (
                          <span className="px-1.5 py-0.5 rounded bg-teal-600 text-white text-[9.5px] font-black shadow-2xs">
                            お子様
                          </span>
                        ) : null}
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[10px] font-black shadow-2xs tabular-nums ${style.pillSolid}`}>
                        {posMeta.shortLabel}
                        {mainGames > 0 ? ` (${mainGames})` : ""}
                      </span>
                    </div>

                    <div className="relative z-10 flex items-end justify-end gap-1">
                      {condStatus !== "active" ? (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black shadow-2xs whitespace-nowrap ${condMeta.solidBadgeClass}`}
                        >
                          {condMeta.compactBadgeText}
                        </span>
                      ) : pDetails?.gradeOrAge ? (
                        <span className="px-1.5 py-0.5 rounded bg-card border border-border text-[9.5px] font-black text-foreground shadow-2xs">
                          {pDetails.gradeOrAge}
                        </span>
                      ) : !pDetails?.actionImageUrl ? (
                        <span className={`text-[10px] font-black tracking-widest uppercase ${style.codeText}`}>
                          {posMeta.code}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* 下部ソリッド情報エリア（案B：丸枠正面写真 境界オーバーラップ） */}
                  <div className="px-3 pb-3 pt-2 bg-card flex-1 flex flex-col justify-between space-y-2">
                    <div className="min-w-0 space-y-1">
                      <div className="relative z-20 flex items-end justify-between gap-1.5 -mt-9 mb-0.5">
                        <Avatar
                          className={`h-14 w-14 border-[3px] border-card bg-card shadow-sm ring-2 shrink-0 ${
                            isOnLeave ? "ring-slate-400/40 grayscale-[35%]" : style.ring
                          }`}
                        >
                          {player.profileImageUrl && (
                            <AvatarImage
                              src={player.profileImageUrl}
                              alt={player.name}
                              className="object-cover"
                            />
                          )}
                          <AvatarFallback
                            className={`font-black text-base ${
                              isOnLeave
                                ? "bg-slate-500 text-white"
                                : "bg-primary text-primary-foreground"
                            }`}
                          >
                            {initial}
                          </AvatarFallback>
                        </Avatar>

                        {(pDetails?.actionImageUrl || pDetails?.gradeOrAge) &&
                          condStatus === "active" && (
                            <span
                              className={`text-[10px] font-black tracking-widest uppercase pb-0.5 ${style.codeText}`}
                            >
                              {posMeta.code}
                            </span>
                          )}
                      </div>

                      <div>
                        <p className="text-[9.5px] font-bold text-muted-foreground tracking-wider truncate min-h-[14px]">
                          {player.nickname
                            ? `コール: ${player.nickname}`
                            : player.nameKana || "PLAYER"}
                        </p>
                        <h3 className="text-sm sm:text-[15px] font-black text-foreground tracking-tight truncate leading-snug">
                          {player.name}
                        </h3>
                      </div>

                      {/* 得意プレータグ（設定済みの場合に最大2つ表示） */}
                      {styleTagList.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap pt-0.5">
                          {styleTagList.slice(0, 2).map((tg) => (
                            <span
                              key={`${player.id}-tag-${tg.id}`}
                              className="px-1.5 py-0.2 rounded-md bg-primary/10 text-primary border border-primary/25 text-[9.5px] font-black leading-tight"
                            >
                              {tg.emoji}
                              {tg.shortLabel}
                            </span>
                          ))}
                          {styleTagList.length > 2 && (
                            <span className="text-[9px] font-black text-muted-foreground">
                              +{styleTagList.length - 2}
                            </span>
                          )}
                        </div>
                      )}

                      {/* 指導者・管理者限定メモの1行プレビュー */}
                      {canManagePlayers && player.conditionNote && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted border border-border text-[9.5px] font-bold text-foreground truncate">
                          <Lock className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{player.conditionNote}</span>
                        </div>
                      )}

                      {/* サブ守備位置チップ */}
                      {styleTagList.length === 0 && subLabelsShort.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap pt-0.5">
                          <span className="text-[9px] font-black text-muted-foreground shrink-0">
                            サブ:
                          </span>
                          {subLabelsShort.slice(0, 2).map((lbl, idx) => (
                            <span
                              key={`${player.id}-sub-${idx}`}
                              className="px-1.5 py-0.2 rounded-md bg-muted border border-border text-[9.5px] font-black text-foreground leading-tight"
                            >
                              {lbl}
                            </span>
                          ))}
                          {subLabelsShort.length > 2 && (
                            <span className="text-[9px] font-black text-muted-foreground tabular-nums">
                              +{subLabelsShort.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5 pt-1 border-t border-border">
                      <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-muted-foreground">
                        <span>{tbLabel || "投打未設定"}</span>
                        {player.height ? (
                          <span className="tabular-nums">
                            {player.height}cm{player.weight ? `/${player.weight}kg` : ""}
                          </span>
                        ) : mainGames > 0 ? (
                          <span className="tabular-nums text-[9.5px]">
                            出場{player.totalPositionGames || mainGames}試
                          </span>
                        ) : null}
                      </div>

                      {/* ミニ成績ハイライト */}
                      {posMeta.category === "投手" && player.pitching ? (
                        <div className="px-2 py-1.5 rounded-xl bg-muted border border-border space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-primary">
                              {player.pitching.inningsText}回
                            </span>
                            <span className="font-black text-foreground tabular-nums">
                              奪三振 {player.pitching.strikeouts}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-xs bg-card border border-border overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${Math.min(100, Math.max(15, player.pitching.strikeouts * 5))}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : player.batting ? (
                        <div className="px-2 py-1.5 rounded-xl bg-muted border border-border space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-muted-foreground">打率</span>
                            <span className="font-black text-primary tabular-nums">
                              {player.batting.avg}
                              <span className="text-muted-foreground font-bold ml-1">
                                ({player.batting.hits}安)
                              </span>
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-xs bg-card border border-border overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    12,
                                    Math.round(
                                      ((Number(
                                        player.batting.avg.startsWith(".")
                                          ? `0${player.batting.avg}`
                                          : player.batting.avg
                                      ) || 0) /
                                        0.5) *
                                        100
                                    )
                                  )
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : pDetails?.seasonGoal ? (
                        <div className="px-2 py-1 rounded-xl bg-muted/60 border border-border text-[10px] font-bold text-foreground truncate">
                          🔥 {pDetails.seasonGoal}
                        </div>
                      ) : (
                        <div className="px-2 py-1 rounded-xl bg-muted/50 border border-border flex items-center justify-between text-[10px] text-muted-foreground font-bold">
                          <span>詳細・成長記録</span>
                          <ChevronRight className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* 📋 リスト表示（1列コンパクト名鑑） */
          <div className="space-y-2">
            {filteredPlayers.map((player) => {
              const posMeta = resolvePositionMeta(player.primaryPosition);
              const style = CATEGORY_STYLES[posMeta.category];
              const condStatus = normalizePlayerConditionStatus(player.conditionStatus);
              const condMeta = PLAYER_CONDITION_META[condStatus];
              const isOnLeave = condStatus === "on_leave";
              const numStr = cleanUniformNumber(player.uniformNumber);
              const tbLabel = formatThrowsBats(player.throws, player.bats);
              const initial = player.name.replace(/\s+/g, "").slice(0, 1) || "選";
              const mainGames = player.positionCounts?.[0]?.games ?? 0;
              const subLabelsShort = player.subPositions
                .map((sp) => resolvePositionMeta(sp).shortLabel)
                .filter(Boolean);
              const pDetails = player.profileDetails;
              const styleTagList = (pDetails?.playStyleTags || [])
                .map((tid) => PLAY_STYLE_TAG_MAP[tid])
                .filter(Boolean);

              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setSelectedPlayerId(player.id)}
                  className={`w-full rounded-2xl border shadow-xs overflow-hidden flex items-stretch text-left transition-all active:scale-[0.99] ${
                    isOnLeave
                      ? "border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 opacity-85 hover:opacity-100"
                      : player.isSelf || player.isLinkedChild
                      ? "border-primary/50 bg-card hover:border-primary"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div
                    className={`w-1.5 shrink-0 ${
                      condStatus !== "active" ? condMeta.topAccentBarClass : style.barSolid
                    }`}
                  />

                  <div className="flex-1 p-3 flex items-center justify-between gap-3 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 text-center shrink-0">
                        <span className="text-lg font-black italic tracking-tighter tabular-nums text-foreground leading-none block">
                          #{numStr}
                        </span>
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">
                          {posMeta.code}
                        </span>
                      </div>

                      <Avatar
                        className={`h-10 w-10 border border-border shrink-0 ${
                          isOnLeave ? "grayscale-[35%]" : ""
                        }`}
                      >
                        {player.profileImageUrl && (
                          <AvatarImage
                            src={player.profileImageUrl}
                            alt={player.name}
                            className="object-cover"
                          />
                        )}
                        <AvatarFallback
                          className={`font-black text-sm ${
                            isOnLeave
                              ? "bg-slate-500/15 text-slate-600 dark:text-slate-300"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {initial}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-black text-foreground truncate">
                            {player.name}
                          </span>
                          {player.nickname && (
                            <span className="px-1.5 py-0.2 rounded-md bg-muted border border-border text-[9.5px] font-black text-muted-foreground">
                              {player.nickname}
                            </span>
                          )}
                          {player.isCaptain && (
                            <span className="px-1.5 py-0.2 rounded-md bg-primary/10 text-primary border border-primary/25 text-[9.5px] font-black flex items-center gap-0.5">
                              <Crown className="w-2.5 h-2.5 fill-current" />
                              <span>主将</span>
                            </span>
                          )}
                          {player.isSelf ? (
                            <span className="px-1.5 py-0.2 rounded-md bg-primary text-primary-foreground text-[9.5px] font-black">
                              本人
                            </span>
                          ) : player.isLinkedChild ? (
                            <span className="px-1.5 py-0.2 rounded-md bg-teal-600 text-white text-[9.5px] font-black">
                              お子様
                            </span>
                          ) : null}
                          {condStatus !== "active" && (
                            <span
                              className={`px-2 py-0.2 rounded-md text-[10px] font-black ${condMeta.solidBadgeClass}`}
                            >
                              {condMeta.badgeText}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span
                            className={`px-2 py-0.2 rounded-full border text-[10px] font-black tabular-nums ${style.pillSoft}`}
                          >
                            {posMeta.shortLabel}
                            {mainGames > 0 ? `(${mainGames})` : ""}
                          </span>
                          {styleTagList.slice(0, 2).map((tg) => (
                            <span
                              key={`list-${player.id}-${tg.id}`}
                              className="px-1.5 py-0.2 rounded-md bg-primary/10 text-primary border border-primary/25 text-[10px] font-black"
                            >
                              {tg.emoji}
                              {tg.shortLabel}
                            </span>
                          ))}
                          {styleTagList.length === 0 && subLabelsShort.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded-md bg-muted/50 border border-border text-[10px] font-bold text-foreground truncate max-w-[140px]">
                              サブ:{subLabelsShort.join("・")}
                            </span>
                          )}
                          {tbLabel && (
                            <span className="text-[11px] font-bold text-muted-foreground">
                              {tbLabel}
                            </span>
                          )}
                          {pDetails?.gradeOrAge && (
                            <span className="text-[10.5px] font-black text-muted-foreground">
                              {pDetails.gradeOrAge}
                            </span>
                          )}
                        </div>
                        {canManagePlayers && player.conditionNote && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-muted-foreground truncate">
                            <Lock className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{player.conditionNote}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {posMeta.category === "投手" && player.pitching ? (
                        <div className="text-right">
                          <span className="text-[9.5px] font-bold text-muted-foreground block">
                            奪三振
                          </span>
                          <span className="text-xs font-black text-primary tabular-nums">
                            {player.pitching.strikeouts}
                          </span>
                        </div>
                      ) : player.batting ? (
                        <div className="text-right">
                          <span className="text-[9.5px] font-bold text-muted-foreground block">
                            打率
                          </span>
                          <span className="text-xs font-black text-primary tabular-nums">
                            {player.batting.avg}
                          </span>
                        </div>
                      ) : null}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="h-8 w-full shrink-0 pointer-events-none select-none" aria-hidden="true" />
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          🌟 選手詳細スポットライトカード（モーダルシート）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {selectedPlayer && (() => {
        const posMeta = resolvePositionMeta(selectedPlayer.primaryPosition);
        const catStyle = CATEGORY_STYLES[posMeta.category];
        const condStatus = normalizePlayerConditionStatus(selectedPlayer.conditionStatus);
        const isOnLeave = condStatus === "on_leave";
        const condMeta = PLAYER_CONDITION_META[condStatus];
        const numStr = cleanUniformNumber(selectedPlayer.uniformNumber);
        const tbLabel = formatThrowsBats(selectedPlayer.throws, selectedPlayer.bats) || "未設定";
        const initial = selectedPlayer.name.replace(/\s+/g, "").slice(0, 1) || "選";
        const posCounts = selectedPlayer.positionCounts || [];
        const subLabels = selectedPlayer.subPositions
          .map((sp) => resolvePositionMeta(sp).shortLabel)
          .filter(Boolean);

        const details = selectedPlayer.profileDetails
          ? parsePlayerProfileDetails(selectedPlayer.profileDetails)
          : EMPTY_PLAYER_PROFILE_DETAILS;
        const styleTagItems = details.playStyleTags
          .map((tid) => PLAY_STYLE_TAG_MAP[tid])
          .filter(Boolean);

        const regPrimaryMeta = selectedPlayer.registeredPrimaryPosition
          ? resolvePositionMeta(selectedPlayer.registeredPrimaryPosition)
          : null;
        const regSubLabels = (selectedPlayer.registeredSubPositions || [])
          .map((sp) => resolvePositionMeta(sp).shortLabel)
          .filter(Boolean);
        const hasRegisteredDesiredPositions =
          Boolean(regPrimaryMeta && selectedPlayer.registeredPrimaryPosition) ||
          regSubLabels.length > 0;

        const hasPhysicalBest =
          Boolean(details.maxVelocityKmh) ||
          Boolean(details.dash50mSec) ||
          Boolean(details.longTossM);

        const personalRows: Array<{ label: string; value: string; icon: "edu" | "heart" | "team" | "glove" | "bat" | "music" }> = [];
        if (details.baseballHistory) {
          personalRows.push({ label: "球歴・野球歴", value: details.baseballHistory, icon: "edu" });
        }
        if (details.admiredPlayer) {
          personalRows.push({ label: "憧れの選手", value: details.admiredPlayer, icon: "heart" });
        }
        if (details.favoriteTeam) {
          personalRows.push({ label: "好きな球団", value: details.favoriteTeam, icon: "team" });
        }
        if (details.gloveGear) {
          personalRows.push({ label: "愛用グラブ", value: details.gloveGear, icon: "glove" });
        }
        if (details.batGear) {
          personalRows.push({ label: "愛用バット", value: details.batGear, icon: "bat" });
        }
        if (details.walkUpSong) {
          personalRows.push({ label: "登場曲・テーマ曲", value: details.walkUpSong, icon: "music" });
        }

        const canEditThisPlayer = Boolean(selectedPlayer.canEditProfile || canManagePlayers);
        const canClaimThisPlayer =
          !canEditThisPlayer &&
          canClaimSelfPlayer &&
          !selectedPlayer.hasLinkedUser;

        const bodySpecText = selectedPlayer.height
          ? `${selectedPlayer.height}cm${selectedPlayer.weight ? ` / ${selectedPlayer.weight}kg` : ""}`
          : selectedPlayer.weight
          ? `${selectedPlayer.weight}kg`
          : "--";

        if (typeof document === "undefined") return null;

        return createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 animate-in fade-in duration-150">
            <div
              className="absolute inset-0"
              onClick={() => setSelectedPlayerId(null)}
            />

            <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[88dvh] flex flex-col animate-in zoom-in-95 duration-200">
              {/* 選手詳細モーダル 固定ヘッダー（案B：境界オーバーラップ型 × 薄めソリッドスクリム） */}
              <div className="shrink-0 bg-card border-b border-border">
                {/* 上部ワイドステージ（プレー写真を邪魔しないよう前後送りピルと閉じるボタンのみ配置） */}
                <div
                  className={`relative h-36 sm:h-44 w-full p-3.5 bg-[#0f172a] text-slate-50 border-b-[3px] overflow-hidden ${
                    condStatus === "on_leave"
                      ? "border-slate-400"
                      : condStatus === "rehab"
                      ? "border-rose-500"
                      : condStatus === "restricted"
                      ? "border-amber-500"
                      : "border-primary"
                  }`}
                >
                  {details.actionImageUrl ? (
                    <>
                      <img
                        src={details.actionImageUrl}
                        alt=""
                        decoding="async"
                        className={`pointer-events-none select-none absolute inset-0 w-full h-full object-cover object-center ${
                          isOnLeave ? "grayscale-[45%] opacity-75" : ""
                        }`}
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-slate-950/20"
                      />
                    </>
                  ) : (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none select-none absolute right-2.5 -bottom-4 text-[104px] font-black tracking-tighter leading-none text-slate-800 tabular-nums"
                    >
                      {numStr}
                    </span>
                  )}

                  {/* 最上段のみ：左に前後切替ピル、右に閉じるボタン */}
                  <div className="relative z-10 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center rounded-full bg-[#0f172a] border border-slate-700 p-0.5 shadow-2xs">
                      <button
                        type="button"
                        disabled={!prevPlayer}
                        onClick={() => prevPlayer && setSelectedPlayerId(prevPlayer.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-slate-100 disabled:opacity-30 hover:bg-slate-800 active:scale-90 transition-all cursor-pointer"
                        aria-label="前の選手"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="px-2 text-[11px] font-black tabular-nums text-white">
                        {selectedIndex + 1}/{filteredPlayers.length}
                      </span>
                      <button
                        type="button"
                        disabled={!nextPlayer}
                        onClick={() => nextPlayer && setSelectedPlayerId(nextPlayer.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-slate-100 disabled:opacity-30 hover:bg-slate-800 active:scale-90 transition-all cursor-pointer"
                        aria-label="次の選手"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedPlayerId(null)}
                      className="w-8 h-8 rounded-full bg-[#0f172a] border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center active:scale-90 transition-all shadow-2xs cursor-pointer"
                      aria-label="閉じる"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 下部純白アイデンティティ帯（丸枠正面写真 境界オーバーラップ ＋ 操作ボタン ＋ 選手名・属性） */}
                <div className="px-4 pb-3 pt-1.5 bg-card space-y-2">
                  <div className="relative z-20 flex items-end justify-between gap-2 -mt-10">
                    {canEditThisPlayer ? (
                      <button
                        type="button"
                        onClick={() => openPhotoModal(selectedPlayer.id, "portrait")}
                        className="relative group/avatar shrink-0 cursor-pointer active:scale-95 transition-transform focus:outline-hidden"
                        title="正面写真を撮影・変更"
                      >
                        <Avatar
                          className={`h-20 w-20 border-4 border-card bg-card shadow-sm ring-2 ${
                            isOnLeave ? "ring-slate-400/40 grayscale-[35%]" : catStyle.ring
                          }`}
                        >
                          {selectedPlayer.profileImageUrl && (
                            <AvatarImage
                              src={selectedPlayer.profileImageUrl}
                              alt={selectedPlayer.name}
                              className="object-cover"
                            />
                          )}
                          <AvatarFallback
                            className={`font-black text-2xl ${
                              isOnLeave
                                ? "bg-slate-500 text-white"
                                : "bg-primary text-primary-foreground"
                            }`}
                          >
                            {initial}
                          </AvatarFallback>
                        </Avatar>
                        <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-primary text-primary-foreground border-2 border-card flex items-center justify-center shadow-xs group-hover/avatar:scale-110 transition-transform">
                          <Camera className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    ) : (
                      <div className="relative shrink-0">
                        <Avatar
                          className={`h-20 w-20 border-4 border-card bg-card shadow-sm ring-2 ${
                            isOnLeave ? "ring-slate-400/40 grayscale-[35%]" : catStyle.ring
                          }`}
                        >
                          {selectedPlayer.profileImageUrl && (
                            <AvatarImage
                              src={selectedPlayer.profileImageUrl}
                              alt={selectedPlayer.name}
                              className="object-cover"
                            />
                          )}
                          <AvatarFallback
                            className={`font-black text-2xl ${
                              isOnLeave
                                ? "bg-slate-500 text-white"
                                : "bg-primary text-primary-foreground"
                            }`}
                          >
                            {initial}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    )}

                    {canEditThisPlayer ? (
                      <div className="flex items-center gap-1 flex-wrap justify-end pb-0.5">
                        <button
                          type="button"
                          onClick={() => openPhotoModal(selectedPlayer.id, "portrait")}
                          className="px-2 py-1 rounded-xl bg-muted hover:bg-muted/80 border border-border text-[10.5px] font-black text-foreground flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer"
                        >
                          <Camera className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                          <span>正面</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openPhotoModal(selectedPlayer.id, "action")}
                          className="px-2 py-1 rounded-xl bg-muted hover:bg-muted/80 border border-border text-[10.5px] font-black text-foreground flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          <span>{details.actionImageUrl ? "背景変更" : "背景写真"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPlayerId(selectedPlayer.id)}
                          className="px-2.5 py-1 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-[10.5px] font-black flex items-center gap-1 shrink-0 active:scale-95 transition-all shadow-2xs cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>名鑑編集</span>
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`text-[10.5px] font-black tracking-wider uppercase pb-1 ${catStyle.codeText}`}
                      >
                        {posMeta.fullLabel}
                      </span>
                    )}
                  </div>

                  {/* 純白カード上の整理された属性バッジ＆氏名 */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-xs font-black tabular-nums shadow-2xs">
                        #{numStr}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-black ${catStyle.pillSolid}`}
                      >
                        {posMeta.shortLabel}
                      </span>
                      {details.gradeOrAge && (
                        <span className="px-2 py-0.5 rounded-md bg-muted border border-border text-foreground text-[10.5px] font-black">
                          {details.gradeOrAge}
                        </span>
                      )}
                      {selectedPlayer.isCaptain && (
                        <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black flex items-center gap-1 shadow-2xs">
                          <Crown className="w-3 h-3 fill-current" />
                          <span>CAPTAIN</span>
                        </span>
                      )}
                      {condStatus !== "active" && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10.5px] font-black shadow-2xs ${condMeta.solidBadgeClass}`}
                        >
                          {condMeta.badgeText}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-xl font-black tracking-tight text-foreground leading-snug truncate">
                        {selectedPlayer.name}
                      </h3>
                      {(selectedPlayer.nameKana || selectedPlayer.nickname) && (
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          {selectedPlayer.nameKana && (
                            <p className="text-[10.5px] font-bold text-muted-foreground tracking-wider">
                              {selectedPlayer.nameKana}
                            </p>
                          )}
                          {selectedPlayer.nickname && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/12 border border-amber-500/30 text-[10.5px] font-black text-amber-700 dark:text-amber-300 flex items-center gap-1">
                              <Volume2 className="w-3 h-3" />
                              <span>コール: {selectedPlayer.nickname}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* スクロール可能な詳細ボディ */}
              <div className="p-4 pb-[max(env(safe-area-inset-bottom),20px)] space-y-3.5 overflow-y-auto flex-1">
                {/* ✏️ 本人・保護者・管理者向けダイレクトプロフィール編集バー */}
                {canEditThisPlayer ? (
                  <button
                    type="button"
                    onClick={() => setEditingPlayerId(selectedPlayer.id)}
                    className="w-full py-2.5 px-3.5 rounded-2xl bg-[#0f172a] hover:bg-slate-800 text-white border border-slate-800 shadow-2xs active:scale-[0.99] transition-all flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                        <Edit3 className="w-3.5 h-3.5" />
                      </span>
                      <div className="text-left min-w-0">
                        <span className="text-xs font-black block leading-tight">
                          {selectedPlayer.isSelf
                            ? "自分の選手プロフィールを入力・編集"
                            : selectedPlayer.isLinkedChild
                            ? "お子様の選手プロフィールを入力・編集"
                            : "この選手の名鑑プロフィールを編集"}
                        </span>
                        <span className="text-[10px] font-bold text-slate-300 block leading-tight mt-0.5 truncate">
                          目標・得意プレータグ・希望守備・愛用ギア・登場曲など
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10.5px] font-black text-teal-300 shrink-0">
                      編集する
                    </span>
                  </button>
                ) : canClaimThisPlayer ? (
                  <div className="p-3 rounded-2xl bg-muted/45 border border-border space-y-2">
                    {confirmingClaimPlayerId === selectedPlayer.id ? (
                      <div className="space-y-2">
                        <p className="text-xs font-black text-foreground">
                          「#{numStr} {selectedPlayer.name}」をご自身の選手カードとして紐付けますか？
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isClaimingSelf}
                            onClick={() => setConfirmingClaimPlayerId(null)}
                            className="flex-1 py-2 rounded-xl bg-card border border-border text-xs font-black text-foreground cursor-pointer"
                          >
                            キャンセル
                          </button>
                          <button
                            type="button"
                            disabled={isClaimingSelf}
                            onClick={() => handleClaimSelfPlayer(selectedPlayer)}
                            className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60"
                          >
                            {isClaimingSelf ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>紐付けて入力へ</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingClaimPlayerId(selectedPlayer.id)}
                        className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <UserCheck className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-xs font-black text-foreground">
                            ご本人の場合は紐付けて名鑑プロフィールを入力できます
                          </span>
                        </div>
                        <span className="px-2.5 py-1 rounded-xl bg-card border border-border text-[10.5px] font-black text-primary shrink-0">
                          本人紐付け
                        </span>
                      </button>
                    )}
                  </div>
                ) : null}

                {/* 🔥 今季の目標・意気込みバナー */}
                {details.seasonGoal && (
                  <div className="p-3.5 rounded-2xl bg-card border-2 border-primary/35 shadow-2xs space-y-1">
                    <div className="flex items-center gap-1.5 text-[10.5px] font-black text-primary uppercase tracking-wider">
                      <Flame className="w-3.5 h-3.5 fill-current" />
                      <span>SEASON GOAL / 今季の目標</span>
                    </div>
                    <p className="text-sm font-black text-foreground leading-snug">
                      「{details.seasonGoal}」
                    </p>
                  </div>
                )}

                {/* ⚡ プレースタイル・得意プレータグ */}
                {styleTagItems.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {styleTagItems.map((tag) => (
                      <span
                        key={`modal-tag-${tag.id}`}
                        className="px-2.5 py-1 rounded-xl bg-primary/12 text-primary border border-primary/30 text-xs font-black flex items-center gap-1 shadow-2xs"
                      >
                        <span>{tag.emoji}</span>
                        <span>{tag.label}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* 🩹 公開ステータス案内バナー */}
                {condStatus !== "active" && (
                  <div className={`p-3 rounded-2xl space-y-2 ${condMeta.bannerClass}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10.5px] font-black ${condMeta.solidBadgeClass}`}
                      >
                        {condMeta.badgeText}
                      </span>
                      {condStatus === "on_leave" && (
                        <span className="text-[10px] font-black text-muted-foreground">
                          未回答集計・スタメン自動除外
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold leading-relaxed">
                      {condMeta.publicSummary}
                    </p>
                    {canManagePlayers && selectedPlayer.conditionNote && (
                      <div className="p-2.5 rounded-xl bg-card border border-border space-y-1">
                        <div className="flex items-center gap-1 text-[10px] font-black text-muted-foreground">
                          <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>指導者・管理者限定メモ（一般保護者には非表示）</span>
                        </div>
                        <p className="text-xs font-black text-foreground leading-relaxed">
                          {selectedPlayer.conditionNote}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 通常時でも指導者限定メモが残っている場合の表示 */}
                {condStatus === "active" &&
                  canManagePlayers &&
                  selectedPlayer.conditionNote && (
                    <div className="p-3 rounded-2xl bg-muted/40 border border-border space-y-1">
                      <div className="flex items-center gap-1 text-[10px] font-black text-muted-foreground">
                        <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>指導者・管理者限定メモ（一般保護者には非表示）</span>
                      </div>
                      <p className="text-xs font-black text-foreground leading-relaxed">
                        {selectedPlayer.conditionNote}
                      </p>
                    </div>
                  )}

                {/* 🔒 指導者・管理者専用：在籍・コンディション設定パネル */}
                {canManagePlayers && (
                  <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsConditionEditorOpen((prev) => !prev)}
                      className="w-full px-3.5 py-2.5 bg-muted/45 hover:bg-muted/70 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-[#0f172a] text-amber-300 flex items-center justify-center shrink-0">
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-foreground">
                              在籍・コンディション設定
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-[#0f172a] text-slate-100 text-[9px] font-black">
                              指導者限定
                            </span>
                          </div>
                          <p className="text-[10px] font-bold text-muted-foreground truncate">
                            現在: {condMeta.label}（休部・リハビリ・投球制限の切替）
                          </p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-xl bg-card border border-border text-[10.5px] font-black text-foreground shrink-0">
                        {isConditionEditorOpen ? "閉じる" : "変更"}
                      </span>
                    </button>

                    {isConditionEditorOpen && (
                      <div className="p-3.5 border-t border-border space-y-3 bg-card">
                        <div className="grid grid-cols-2 gap-2">
                          {PLAYER_CONDITION_STATUS_ORDER.map((stKey) => {
                            const meta = PLAYER_CONDITION_META[stKey];
                            const isSelected = draftConditionStatus === stKey;
                            return (
                              <button
                                key={stKey}
                                type="button"
                                onClick={() => setDraftConditionStatus(stKey)}
                                className={`p-2.5 rounded-xl border text-left transition-all active:scale-[0.98] cursor-pointer ${
                                  isSelected
                                    ? "border-primary bg-primary/10 shadow-2xs"
                                    : "border-border bg-muted/30 hover:bg-muted/60"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-black ${meta.solidBadgeClass}`}
                                  >
                                    {meta.badgeText}
                                  </span>
                                  {isSelected && (
                                    <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                                  )}
                                </div>
                                <p className="text-[10px] font-bold text-muted-foreground mt-1.5 leading-snug">
                                  {meta.staffHint}
                                </p>
                              </button>
                            );
                          })}
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] font-black text-foreground flex items-center gap-1">
                            <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>補足メモ（指導者・管理者のみ閲覧可）</span>
                          </label>
                          <input
                            type="text"
                            maxLength={160}
                            value={draftConditionNote}
                            onChange={(e) => setDraftConditionNote(e.target.value)}
                            placeholder={PLAYER_CONDITION_META[draftConditionStatus].notePlaceholder}
                            className="w-full px-3 py-2 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                          />
                          {draftConditionStatus !== "active" && (
                            <div className="flex items-center gap-1 flex-wrap pt-0.5">
                              {CONDITION_NOTE_PRESETS[draftConditionStatus].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => setDraftConditionNote(preset)}
                                  className="px-2 py-0.5 rounded-lg bg-muted hover:bg-muted/80 border border-border text-[10px] font-bold text-foreground active:scale-95 transition-all cursor-pointer"
                                >
                                  ＋{preset}
                                </button>
                              ))}
                            </div>
                          )}
                          <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span>
                              プライバシー保護のため、補足メモは一般保護者・選手には表示されません
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            disabled={isSavingCondition}
                            onClick={() => {
                              setDraftConditionStatus(condStatus);
                              setDraftConditionNote(selectedPlayer.conditionNote || "");
                              setIsConditionEditorOpen(false);
                            }}
                            className="px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground cursor-pointer"
                          >
                            キャンセル
                          </button>
                          <button
                            type="button"
                            disabled={isSavingCondition}
                            onClick={handleSaveCondition}
                            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                          >
                            {isSavingCondition ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>設定を保存</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 基本スペック 4グリッド */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 rounded-2xl bg-muted/50 border border-border">
                    <span className="text-[9.5px] font-bold text-muted-foreground block">背番号</span>
                    <span className="text-sm font-black text-foreground tabular-nums mt-0.5 block">
                      #{numStr}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-muted/50 border border-border">
                    <span className="text-[9.5px] font-bold text-muted-foreground block">メイン守備</span>
                    <span className="text-xs font-black text-foreground mt-0.5 block truncate">
                      {posMeta.shortLabel}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-muted/50 border border-border">
                    <span className="text-[9.5px] font-bold text-muted-foreground block">投打</span>
                    <span className="text-xs font-black text-foreground mt-0.5 block">
                      {tbLabel}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-muted/50 border border-border">
                    <span className="text-[9.5px] font-bold text-muted-foreground block">体格</span>
                    <span className="text-[10.5px] font-black text-foreground tabular-nums mt-0.5 block truncate">
                      {bodySpecText}
                    </span>
                  </div>
                </div>

                {/* 📏 フィジカル・自己ベスト記録（1つ以上入力がある場合のみ表示） */}
                {hasPhysicalBest && (
                  <div className="rounded-2xl bg-muted/35 border border-border p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                      <Gauge className="w-3.5 h-3.5 text-primary" />
                      <span>自己ベスト測定記録</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {details.maxVelocityKmh ? (
                        <div className="p-2 rounded-xl bg-card border border-border">
                          <span className="text-[9.5px] font-bold text-muted-foreground block">
                            MAX球速
                          </span>
                          <span className="text-sm font-black text-foreground tabular-nums">
                            {details.maxVelocityKmh}
                            <span className="text-[10px] font-bold text-muted-foreground ml-0.5">
                              km/h
                            </span>
                          </span>
                        </div>
                      ) : null}
                      {details.dash50mSec ? (
                        <div className="p-2 rounded-xl bg-card border border-border">
                          <span className="text-[9.5px] font-bold text-muted-foreground block">
                            50m走
                          </span>
                          <span className="text-sm font-black text-foreground tabular-nums">
                            {details.dash50mSec}
                            <span className="text-[10px] font-bold text-muted-foreground ml-0.5">
                              秒
                            </span>
                          </span>
                        </div>
                      ) : null}
                      {details.longTossM ? (
                        <div className="p-2 rounded-xl bg-card border border-border">
                          <span className="text-[9.5px] font-bold text-muted-foreground block">
                            遠投
                          </span>
                          <span className="text-sm font-black text-foreground tabular-nums">
                            {details.longTossM}
                            <span className="text-[10px] font-bold text-muted-foreground ml-0.5">
                              m
                            </span>
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* ⚾ パーソナル選手名鑑データ（入力済み項目のみスマート表示） */}
                {personalRows.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-2xs">
                    <div className="px-3.5 py-2 bg-[#0f172a] text-slate-50 border-b-2 border-primary flex items-center gap-1.5">
                      <IdCard className="w-3.5 h-3.5 text-teal-400" />
                      <span className="text-[11px] font-black tracking-wide">
                        PERSONAL PROFILE / 選手名鑑データ
                      </span>
                    </div>
                    <div className="divide-y divide-border">
                      {personalRows.map((row) => (
                        <div
                          key={row.label}
                          className="px-3.5 py-2.5 flex items-start justify-between gap-3 text-xs"
                        >
                          <span className="font-bold text-muted-foreground flex items-center gap-1.5 shrink-0">
                            {row.icon === "edu" && <GraduationCap className="w-3.5 h-3.5 text-primary" />}
                            {row.icon === "heart" && <Heart className="w-3.5 h-3.5 text-rose-500" />}
                            {row.icon === "team" && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
                            {(row.icon === "glove" || row.icon === "bat") && (
                              <Wrench className="w-3.5 h-3.5 text-teal-600" />
                            )}
                            {row.icon === "music" && <Music className="w-3.5 h-3.5 text-primary" />}
                            <span>{row.label}</span>
                          </span>
                          <span className="font-black text-foreground text-right break-words">
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 選手紹介メモ */}
                {selectedPlayer.notes && (
                  <div className="p-3.5 rounded-2xl bg-card border border-border border-l-4 border-l-primary shadow-2xs space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-black text-primary">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>PLAYER MESSAGE / ひとこと紹介</span>
                    </div>
                    <p className="text-xs font-bold text-foreground leading-relaxed">
                      {selectedPlayer.notes}
                    </p>
                  </div>
                )}

                {/* 🧤 実戦守備位置（メイン＆サブ集計内訳）＋ 本人希望守備位置 */}
                {posCounts.length > 0 ? (
                  <div className="rounded-2xl bg-muted/35 border border-border p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-foreground">
                        実戦守備位置（メイン / サブ）
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25 text-[10px] font-black tabular-nums">
                        試合データ集計 ({selectedPlayer.totalPositionGames || posCounts[0].games}試合)
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {posCounts.map((pc, idx) => {
                        const isMain = idx === 0;
                        const pcMeta = resolvePositionMeta(pc.position);
                        const pcStyle = CATEGORY_STYLES[pcMeta.category];
                        return (
                          <div
                            key={pc.position}
                            className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-card border border-border text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-black shrink-0 ${
                                  isMain
                                    ? pcStyle.pillSolid
                                    : "bg-muted text-muted-foreground border border-border"
                                }`}
                              >
                                {isMain ? "メイン" : "サブ"}
                              </span>
                              <span className="font-black text-foreground truncate">
                                {pcMeta.shortLabel}
                              </span>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                                ({pcMeta.code})
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden hidden min-[360px]:block">
                                <div
                                  className={`h-full rounded-full ${pcStyle.barSolid}`}
                                  style={{ width: `${Math.max(12, Math.min(100, pc.sharePercent))}%` }}
                                />
                              </div>
                              <span className="font-black text-foreground tabular-nums text-xs">
                                {pc.games}
                                <span className="text-[10px] font-bold text-muted-foreground ml-0.5">
                                  試合
                                </span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {hasRegisteredDesiredPositions && (
                      <div className="pt-2 border-t border-border flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span className="font-black text-muted-foreground shrink-0">
                          本人希望・守備可:
                        </span>
                        {regPrimaryMeta && selectedPlayer.registeredPrimaryPosition && (
                          <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/25 font-black">
                            メイン希望: {regPrimaryMeta.shortLabel}
                          </span>
                        )}
                        {regSubLabels.map((lbl, idx) => (
                          <span
                            key={`reg-sub-${lbl}-${idx}`}
                            className="px-2 py-0.5 rounded-md bg-card border border-border font-bold text-foreground"
                          >
                            {lbl}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : subLabels.length > 0 ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-muted/35 border border-border text-xs">
                    <span className="font-bold text-muted-foreground shrink-0">サブ・希望守備位置:</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {subLabels.map((lbl, idx) => (
                        <span
                          key={`${lbl}-${idx}`}
                          className="px-2 py-0.5 rounded-lg bg-card border border-border text-[11px] font-black text-foreground"
                        >
                          {lbl}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* 📈 個人の成長・成績推移ページへのメインCTAボタン */}
                <Link
                  href={`/liff/players/growth?id=${encodeURIComponent(selectedPlayer.id)}`}
                  onClick={() => setSelectedPlayerId(null)}
                  className="w-full py-3 px-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs active:scale-[0.99] transition-all flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-4 h-4" />
                    </span>
                    <div className="text-left min-w-0">
                      <span className="text-xs sm:text-sm font-black block leading-tight">
                        個人の成長・成績推移を見る
                      </span>
                      <span className="text-[10px] font-bold opacity-90 block leading-tight mt-0.5">
                        試合ごとの打撃・投手グラフ / 守備経験マップ
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                </Link>

                {/* 今シーズン打撃成績 */}
                {selectedPlayer.batting && (
                  <div className="rounded-2xl bg-muted/35 border border-border p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-primary" />
                        <span>今シーズン打撃成績</span>
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                        {selectedPlayer.batting.pa}打席
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">打率</span>
                        <span className="text-sm font-black text-primary tabular-nums">
                          {selectedPlayer.batting.avg}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">安打</span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {selectedPlayer.batting.hits}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">本塁打</span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {selectedPlayer.batting.hr}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">四死球</span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {selectedPlayer.batting.walks}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 今シーズン投手成績 */}
                {selectedPlayer.pitching && (
                  <div className="rounded-2xl bg-muted/35 border border-border p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-primary" />
                        <span>今シーズン投手成績</span>
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                        対戦 {selectedPlayer.pitching.battersFaced}打者
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">投球回</span>
                        <span className="text-sm font-black text-primary tabular-nums">
                          {selectedPlayer.pitching.inningsText}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">奪三振</span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {selectedPlayer.pitching.strikeouts}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">被安打</span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {selectedPlayer.pitching.hitsAllowed}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">四死球</span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {selectedPlayer.pitching.walks}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* チーム成績ページ導線 */}
                <Link
                  href="/liff/stats"
                  onClick={() => setSelectedPlayerId(null)}
                  className="w-full py-2.5 px-4 rounded-2xl bg-card hover:bg-muted border border-border text-xs font-black text-foreground transition-all flex items-center justify-center gap-2 shadow-2xs"
                >
                  <Trophy className="w-3.5 h-3.5 text-primary" />
                  <span>チーム成績・ランキングを見る</span>
                </Link>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ━━━ 🙋 自分の選手カード紐付けモーダル（A-3 ソリッド規格） ━━━ */}
      {isSelfClaimModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-950/65 p-0 sm:p-4 animate-in fade-in duration-150">
            <div
              className="absolute inset-0"
              onClick={() => !isClaimingSelf && setIsSelfClaimModalOpen(false)}
            />
            <div className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[88dvh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
              <div className="px-4 py-3.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 text-teal-400 flex items-center justify-center shrink-0">
                    <UserCheck className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-white truncate">
                      ご自身の選手カードを紐付け
                    </h3>
                    <p className="text-[10.5px] font-bold text-slate-300 truncate">
                      紐付けるとすぐに選手名鑑プロフィールを入力できます
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSelfClaimModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto flex-1">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={selfClaimSearch}
                    onChange={(e) => setSelfClaimSearch(e.target.value)}
                    placeholder="背番号・名前で検索..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-muted/45 border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="space-y-1.5 max-h-[46dvh] overflow-y-auto pr-0.5">
                  {selfClaimCandidates.map((cand) => {
                    const num = cleanUniformNumber(cand.uniformNumber);
                    const pMeta = resolvePositionMeta(cand.primaryPosition);
                    const alreadyOther = Boolean(cand.hasLinkedUser && !cand.isSelf);
                    const isConfirming = confirmingClaimPlayerId === cand.id;

                    return (
                      <div
                        key={`claim-${cand.id}`}
                        className={`rounded-xl border p-2.5 transition-all ${
                          alreadyOther
                            ? "bg-muted/35 border-border opacity-60"
                            : isConfirming
                            ? "bg-primary/8 border-primary"
                            : "bg-card border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="min-w-[38px] px-1.5 py-0.5 rounded-lg bg-[#0f172a] text-white text-xs font-black tabular-nums text-center shrink-0">
                              #{num}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-black text-foreground truncate">
                                {cand.name}
                              </p>
                              <p className="text-[10px] font-bold text-muted-foreground">
                                {pMeta.shortLabel}
                              </p>
                            </div>
                          </div>

                          {alreadyOther ? (
                            <span className="px-2 py-1 rounded-lg bg-muted text-muted-foreground text-[10px] font-black shrink-0">
                              連携済
                            </span>
                          ) : isConfirming ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isClaimingSelf}
                                onClick={() => setConfirmingClaimPlayerId(null)}
                                className="px-2.5 py-1 rounded-lg bg-muted border border-border text-[11px] font-bold text-foreground cursor-pointer"
                              >
                                戻る
                              </button>
                              <button
                                type="button"
                                disabled={isClaimingSelf}
                                onClick={() => handleClaimSelfPlayer(cand)}
                                className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-black flex items-center gap-1 cursor-pointer disabled:opacity-60"
                              >
                                {isClaimingSelf ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                <span>確定</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmingClaimPlayerId(cand.id)}
                              className="px-3 py-1.5 rounded-xl bg-primary/12 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-black shrink-0 cursor-pointer"
                            >
                              自分を選択
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 学童・中学保護者向けの親切な案内 */}
                <div className="p-3 rounded-xl bg-muted/45 border border-border flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-muted-foreground leading-snug">
                    保護者の方がお子様（兄弟含む）を紐付ける場合はプロフィール設定から行えます
                  </span>
                  <Link
                    href="/liff/profile"
                    onClick={() => setIsSelfClaimModalOpen(false)}
                    className="px-2.5 py-1.5 rounded-xl bg-card border border-border text-[11px] font-black text-foreground shrink-0 hover:bg-muted"
                  >
                    親子紐付けへ
                  </Link>
                </div>
              </div>

              <div className="px-4 pt-2.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3 bg-card border-t border-border shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSelfClaimModalOpen(false)}
                  className="w-full py-2.5 rounded-xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ━━━ ✏️ 選手名鑑プロフィール編集モーダル ━━━ */}
      {editingPlayer && (
        <PlayerProfileEditModal
          isOpen={Boolean(editingPlayer)}
          teamId={activeTeamId}
          isDemo={Boolean(isDemoMode || providerDemo || activeTeamId === "demo-team")}
          canManagePlayers={canManagePlayers}
          userId={effectiveUserId || null}
          userName={effectiveUserName || null}
          player={editingPlayer}
          onClose={() => setEditingPlayerId(null)}
          onOpenPhotoCapture={(pid, kind) =>
            openPhotoModal(pid, kind || "portrait")
          }
          onSaved={handleProfileSaved}
        />
      )}

      {/* ━━━ 📷 選手名鑑 写真撮影・トリミング保存モーダル（正面写真 / 背景プレー写真） ━━━ */}
      {photoModalTarget && (
        <PlayerPhotoCaptureModal
          isOpen={Boolean(photoModalTarget)}
          teamId={activeTeamId}
          initialPlayerId={photoModalTarget.playerId}
          initialPhotoKind={photoModalTarget.kind}
          userId={effectiveUserId || null}
          userName={effectiveUserName || null}
          rosterPlayers={(editablePhotoPlayers.some(
            (p) => p.id === photoModalTarget.playerId
          )
            ? editablePhotoPlayers
            : players.filter((p) => p.id === photoModalTarget.playerId)
          ).map((p) => ({
            id: p.id,
            name: p.name,
            uniformNumber: p.uniformNumber,
            primaryPosition: p.primaryPosition,
            profileImageUrl: p.profileImageUrl,
            actionImageUrl: p.profileDetails?.actionImageUrl || null,
          }))}
          onClose={() => setPhotoModalTarget(null)}
          onPhotoUpdated={handlePhotoUpdated}
        />
      )}

      {/* ━━━ 🏟️ チームヘッダー背景画像（カバー写真）設定モーダル ━━━ */}
      {isTeamCoverModalOpen && (
        <TeamCoverPhotoModal
          isOpen={isTeamCoverModalOpen}
          teamId={activeTeamId}
          teamName={teamHeadline}
          logoImageUrl={effectiveTeamLogoUrl}
          currentCoverUrl={effectiveTeamCoverUrl}
          userId={effectiveUserId || null}
          userName={effectiveUserName || null}
          onClose={() => setIsTeamCoverModalOpen(false)}
          onCoverUpdated={(nextCoverUrl) => {
            setTeamInfo((prev) =>
              prev ? { ...prev, coverImageUrl: nextCoverUrl } : prev
            );
            updateCurrentTeamCover(nextCoverUrl || undefined);
            if (!(isDemoMode || providerDemo || activeTeamId === "demo-team")) {
              void refreshTeams();
            }
          }}
        />
      )}
    </div>
  );
}

export default function LiffPlayersDirectoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1 p-4">
          <div className="rounded-2xl border border-border bg-card p-12 flex flex-col items-center justify-center gap-2.5 shadow-xs">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-xs font-bold text-muted-foreground">選手名鑑を読み込み中...</p>
          </div>
        </div>
      }
    >
      <LiffPlayersDirectoryContent />
    </Suspense>
  );
}
