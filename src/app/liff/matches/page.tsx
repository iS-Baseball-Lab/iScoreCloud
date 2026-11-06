// filepath: src/app/liff/matches/page.tsx
"use client";

import React, { useState, useEffect, Suspense, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { YouTubePlayer } from "@/components/liff/YouTubePlayer";
import { MatchScoreCard, MatchScoreCardSkeleton, type MatchCardData } from "@/components/liff/MatchScoreCard";
import { Match, type MatchDayOps } from "@/types/match";
import {
  useLiff,
  usePracticeMatchLabel,
  useScoreTeamDisplayName,
} from "@/components/liff/LiffProvider";
import { isGenericMatchTournamentName } from "@/lib/liff/scorebook-symbol-rules";
import { buildLiffHubUrl, invalidateLiffApiCache, peekLiffApiCache } from "@/lib/liff/api-cache";
import {
  Users,
  Shield,
  ShieldAlert,
  Loader2,
  Video,
  Play,
  UserStar,
  UserCheck,
  UserMinus,
  Plus,
  Edit3,
  MapPin,
  Navigation,
  Compass,
  Copy,
  Check,
  Building2,
  Trophy,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ScanLine,
  Trash2,
  Settings,
  CheckCircle2,
  BookOpen,
  FileSpreadsheet,
  Calendar,
  ClipboardList,
  AlertTriangle,
  Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/EmptyState";
import { extractYouTubeVideoId } from "@/lib/youtube";
import {
  buildGoogleMapsEmbedFromUrl,
  extractDirectionsTargetFromUrl,
  normalizeRawMapUrlInput,
} from "@/lib/google-maps";
import { cn } from "@/lib/utils";
import {
  DEMO_LINEUP_PLAYERS,
  deleteDemoMatch,
  getDemoAdjacentMatches,
  getDemoMatchById,
  getHydratedDemoMatchCards,
  getPositionBadgeInfo,
  isDemoMatchId,
  isDemoTeamId,
  loadDemoMatchLineups,
  saveCustomDemoMatch,
  formatLineupShareText,
  parseSafeMatchDate,
  type AdjacentMatchSummary,
  type LineupPlayer,
  type MyLineupSlot,
  type OpponentLineupSlot,
  type PlayerMatchAttendanceMap,
} from "@/lib/liff/demo-lineup";
import {
  buildPreMatchAnnouncementShareText,
  type LiffAdultMemberOption,
  type LiffMatchOpsContextResponse,
  type LiffMatchScheduleSyncInfo,
  type LiffMyMatchIdentity,
} from "@/lib/liff/match-day-ops";
import {
  MatchCarpoolSummarySection,
  MatchDayGuideAndRolesSection,
  MatchDayOpsEditorModal,
  shouldShowMatchCarpoolCard,
  type MatchDayOpsEditorTab,
} from "@/components/liff/MatchDayOpsSection";
import {
  MatchStatsSection,
  type LiffBatterStatItem,
  type LiffBoxscoreAtBatItem,
  type LiffMatchGameDetails,
  type LiffPitcherStatItem,
  type LiffRawPlayLogItem,
} from "@/components/liff/MatchStatsSection";
import { MatchScorebookSection } from "@/components/liff/MatchScorebookSection";
import { ScorebookCellGuideModal } from "@/components/liff/ScorebookCellGuideModal";
import type { InspectedScorebookCellItem } from "@/lib/liff/scorebook-cell-guide";
import type { ScorebookMatchHeaderMeta } from "@/lib/liff/scorebook-renderer-model";
import { useMatchScorebookBundle } from "@/lib/liff/use-match-scorebook-bundle";
import { getDemoMatchStatsBundle } from "@/lib/liff/demo-match-stats";
import {
  DeletePersonalStatsModal,
  type DeletePersonalStatsOptions,
} from "@/components/matches/DeletePersonalStatsModal";
import { DeleteMatchModal } from "@/components/liff/DeleteMatchModal";
import {
  clearScorebookDraft,
  peekScorebookDraftMeta,
} from "@/lib/liff/scorebook-draft";

// ━━━ APIレスポンス型定義 (any排除) ━━━
interface DeletePersonalStatsApiResponse {
  success?: boolean;
  matchId?: string;
  deletedAtBatsCount?: number;
  clearLineups?: boolean;
  resetMatchScore?: boolean;
  error?: string;
}

interface DeleteMatchApiResponse {
  success?: boolean;
  deletedMatchId?: string;
  error?: string;
}

interface MatchDetailApiResponse {
  success?: boolean;
  match?: Match & { teamId?: string };
  prevMatchId?: string | null;
  nextMatchId?: string | null;
  prevMatch?: AdjacentMatchSummary | null;
  nextMatch?: AdjacentMatchSummary | null;
  matchOrderNumber?: number | null;
  totalMatches?: number | null;
  error?: string;
}

interface MatchSubstitutionRow {
  id: string;
  playerId: string;
  name: string;
  uniformNumber: string;
  battingOrder: number;
  position: string;
  inningEntered: number;
}

interface MatchLineupsApiResponse {
  success?: boolean;
  lineups?: {
    myLineup?: MyLineupSlot[];
    opponentLineup?: OpponentLineupSlot[];
    myAttendance?: PlayerMatchAttendanceMap;
    mySubstitutions?: MatchSubstitutionRow[];
  };
  error?: string;
}

interface MatchStatsApiResponse {
  success?: boolean;
  stats?: LiffBatterStatItem[];
  pitcherStats?: LiffPitcherStatItem[];
  gameDetails?: LiffMatchGameDetails;
  error?: string;
}

interface MatchLogsApiResponse {
  success?: boolean;
  logs?: LiffRawPlayLogItem[];
  error?: string;
}

interface LiffMatchesApiResponse {
  success?: boolean;
  isDemo?: boolean;
  matches?: MatchCardData[];
}

interface ResolvedVenueDisplay {
  officialName: string;
  surfaceNote: string;
  shortName: string;
  address: string;
  embedUrl: string;
  externalUrl: string;
  directionsUrl: string;
}

/**
 * 基本情報カード用に日付・開始時刻を「YYYY-MM-DD HH:mm～」または「YYYY-MM-DD」へ整形する
 */
function formatBasicMatchDateTime(rawDate: string | undefined | null): string {
  const trimmed = (rawDate || "").trim();
  if (!trimmed) return "";

  const matched = trimmed.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}:\d{2})(?::\d{2})?\s*([～~].*)?)?$/
  );
  if (!matched) {
    return trimmed;
  }

  const [, yyyy, mm, dd, hhmm, suffix] = matched;
  const datePart = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  if (!hhmm) {
    return datePart;
  }

  const normalizedSuffix = suffix ? suffix.trim() : "～";
  return `${datePart} ${hhmm}${normalizedSuffix}`;
}

/**
 * 前後試合ナビゲーション用に日付部分（YYYY-MM-DD）をコンパクトに抽出する
 */
function formatAdjacentMatchDate(rawDate: string | undefined | null): string {
  const trimmed = (rawDate || "").trim();
  if (!trimmed) return "";

  const matched = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!matched) {
    return trimmed;
  }

  const [, yyyy, mm, dd] = matched;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * 試合データから球場・グラウンドの正式名・略称・住所・Google Map URL群を安全に構築する
 * （Google Map は登録済み mapUrl を最優先で使用し、未登録時のみ施設名・住所へフォールバック）
 */
function buildVenueDisplayInfo(match: Match): ResolvedVenueDisplay {
  const venueNameTrimmed = (match.venueName || "").trim();
  const surfaceTrimmed = (match.surfaceDetails || "").trim();
  const fallbackVenueTrimmed = (match.venue || "").trim();

  const officialName = venueNameTrimmed || surfaceTrimmed || fallbackVenueTrimmed;
  const surfaceNote =
    venueNameTrimmed && surfaceTrimmed && surfaceTrimmed !== venueNameTrimmed
      ? surfaceTrimmed
      : "";
  const shortName = (match.venueShortName || "").trim();
  const rawAddress = (match.venueAddress || "").trim();
  const address = rawAddress && rawAddress !== "住所未登録" ? rawAddress : "";
  const normalizedRegisteredUrl = normalizeRawMapUrlInput(match.venueMapUrl);
  const serverResolvedEmbedUrl = (match.venueEmbedMapUrl || "").trim();

  // 1. 登録されている Google Map URL（短縮URL展開済み含む）を最優先で埋め込みURL化
  const embedFromRegisteredUrl =
    serverResolvedEmbedUrl || buildGoogleMapsEmbedFromUrl(normalizedRegisteredUrl);

  // 2. 登録URLが未設定の場合のみ、施設名・住所からフォールバック検索
  const cleanedOfficialName = officialName.replace(/[（(].*?[)）]/g, "").trim() || officialName;
  const isGenericVenuePlaceholder = /^(未定|未設定|球場未設定|グラウンド|グランド|球場)$/.test(
    cleanedOfficialName
  );
  const fallbackQuery =
    (isGenericVenuePlaceholder ? "" : cleanedOfficialName) || address;

  const embedUrl = embedFromRegisteredUrl
    ? embedFromRegisteredUrl
    : fallbackQuery
    ? `https://maps.google.com/maps?q=${encodeURIComponent(fallbackQuery)}&hl=ja&z=16&output=embed`
    : "";

  const externalUrl =
    normalizedRegisteredUrl && !normalizedRegisteredUrl.includes("/maps/embed")
      ? normalizedRegisteredUrl
      : fallbackQuery
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackQuery)}`
      : "https://maps.google.com";

  const registeredDirectionsTarget = extractDirectionsTargetFromUrl(
    serverResolvedEmbedUrl || normalizedRegisteredUrl
  );
  const directionsTarget =
    registeredDirectionsTarget || address || (isGenericVenuePlaceholder ? "" : cleanedOfficialName);
  const directionsUrl = directionsTarget
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(directionsTarget)}`
    : externalUrl;

  return {
    officialName,
    surfaceNote,
    shortName,
    address,
    embedUrl,
    externalUrl,
    directionsUrl,
  };
}

function MatchesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("id") || searchParams.get("matchId");
  const { currentTeam, isLoadingTeam, isDemo, profile } = useLiff();
  const { scoreTeamName } = useScoreTeamDisplayName("自チーム");
  const practiceMatchLabel = usePracticeMatchLabel();

  // 単一試合詳細用ステート
  const [match, setMatch] = useState<Match | null>(null);
  const [prevMatch, setPrevMatch] = useState<AdjacentMatchSummary | null>(null);
  const [nextMatch, setNextMatch] = useState<AdjacentMatchSummary | null>(null);
  const [matchPosition, setMatchPosition] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [myLineup, setMyLineup] = useState<MyLineupSlot[]>([]);
  const [opponentLineup, setOpponentLineup] = useState<OpponentLineupSlot[]>([]);
  const [lineupTeamTab, setLineupTeamTab] = useState<"my" | "opponent">("my");
  const [mySubstitutions, setMySubstitutions] = useState<MatchSubstitutionRow[]>([]);
  const [myAttendance, setMyAttendance] = useState<PlayerMatchAttendanceMap>({});
  const [teamPlayers, setTeamPlayers] = useState<LineupPlayer[]>([]);
  const [matchStats, setMatchStats] = useState<LiffBatterStatItem[]>([]);
  const [pitcherStats, setPitcherStats] = useState<LiffPitcherStatItem[]>([]);
  const [gameDetails, setGameDetails] = useState<LiffMatchGameDetails | null>(null);
  const [playLogs, setPlayLogs] = useState<LiffRawPlayLogItem[]>([]);
  const [boxscoreAtBats, setBoxscoreAtBats] = useState<LiffBoxscoreAtBatItem[]>([]);
  const [isStatsLoading, setIsStatsLoading] = useState<boolean>(false);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(() => Boolean(matchId));
  const [loadedMatchId, setLoadedMatchId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isAddressCopied, setIsAddressCopied] = useState(false);
  const [showDeleteStatsModal, setShowDeleteStatsModal] = useState(false);
  const [isDeletingPersonalStats, setIsDeletingPersonalStats] = useState(false);
  const [showDeleteMatchModal, setShowDeleteMatchModal] = useState(false);
  const [isDeletingMatch, setIsDeletingMatch] = useState(false);
  const [isManageMenuOpen, setIsManageMenuOpen] = useState(false);
  const [opsAdultMembers, setOpsAdultMembers] = useState<LiffAdultMemberOption[]>([]);
  const [opsMyIdentity, setOpsMyIdentity] = useState<LiffMyMatchIdentity | null>(null);
  const [opsScheduleSync, setOpsScheduleSync] =
    useState<LiffMatchScheduleSyncInfo | null>(null);
  const [opsEditorState, setOpsEditorState] = useState<{
    isOpen: boolean;
    initialTab: MatchDayOpsEditorTab;
  }>({ isOpen: false, initialTab: "guide" });
  const [isSavingMatchOps, setIsSavingMatchOps] = useState(false);
  const [inspectedCellModalState, setInspectedCellModalState] = useState<{
    activeItem: InspectedScorebookCellItem;
    navigationItems: InspectedScorebookCellItem[];
  } | null>(null);

  const handleInspectScorebookCell = useCallback(
    (
      item: InspectedScorebookCellItem,
      navigationItems: InspectedScorebookCellItem[]
    ) => {
      setInspectedCellModalState({ activeItem: item, navigationItems });
    },
    []
  );

  const handleSelectInspectedCell = useCallback(
    (nextItem: InspectedScorebookCellItem) => {
      setInspectedCellModalState((prev) =>
        prev ? { ...prev, activeItem: nextItem } : null
      );
    },
    []
  );

  const handleCloseInspectedCell = useCallback(() => {
    setInspectedCellModalState(null);
  }, []);

  // 試合一覧用ステート（キャッシュがあれば1フレーム目から0ms同期ハイドレーション）
  const initialCachedMatchesList = useMemo<MatchCardData[] | null>(() => {
    if (typeof window === "undefined") return null;
    const tid =
      currentTeam?.id ||
      localStorage.getItem("iscore_selectedTeamId") ||
      "demo-team";
    const direct = peekLiffApiCache<LiffMatchesApiResponse>(
      `/api/liff/matches?teamId=${encodeURIComponent(tid)}`
    );
    if (Array.isArray(direct?.matches)) {
      return isDemoTeamId(tid)
        ? getHydratedDemoMatchCards(direct.matches)
        : direct.matches;
    }
    const uid =
      profile?.userId ||
      localStorage.getItem("iscore_user_id") ||
      localStorage.getItem("iscore_userId") ||
      "";
    const uName = profile?.displayName || localStorage.getItem("iscore_user_name") || "";
    const hubCached = peekLiffApiCache<{ matches?: MatchCardData[] }>(
      buildLiffHubUrl({ teamId: tid, userId: uid, userName: uName })
    );
    if (Array.isArray(hubCached?.matches) && hubCached.matches.length > 0) {
      return hubCached.matches;
    }
    return null;
  }, [currentTeam?.id, profile?.userId, profile?.displayName]);

  const [matchesList, setMatchesList] = useState<MatchCardData[]>(
    () => initialCachedMatchesList ?? []
  );
  const [isListLoading, setIsListLoading] = useState<boolean>(
    () => initialCachedMatchesList === null
  );
  const [filter, setFilter] = useState<"all" | "scheduled" | "video" | "official">("all");
  const [scorebookFilter, setScorebookFilter] = useState<
    "all" | "imported" | "unimported"
  >("all");

  const handleCopyVenueAddress = useCallback((addressText: string) => {
    if (!addressText) return;
    navigator.clipboard.writeText(addressText);
    setIsAddressCopied(true);
    toast.success("住所をコピーしました");
    setTimeout(() => {
      setIsAddressCopied(false);
    }, 2000);
  }, []);

  const handleDeletePersonalStats = useCallback(
    async (options: DeletePersonalStatsOptions) => {
      if (!match || isDeletingPersonalStats) return;
      setIsDeletingPersonalStats(true);
      try {
        const res = await fetch("/api/liff/scorebook/saved", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId: match.id,
            clearLineups: options.clearLineups,
            resetMatchScore: options.resetMatchScore,
          }),
        });
        const data = (await res.json()) as DeletePersonalStatsApiResponse;
        if (!res.ok || !data.success) {
          throw new Error(data.error || "個人データの削除に失敗しました");
        }

        // 端末内のスコアブック途中下書きがこの試合のものだった場合はあわせて破棄
        const teamKey = currentTeam?.id || "default";
        const draftMeta = peekScorebookDraftMeta(teamKey);
        if (draftMeta?.selectedMatchId === match.id) {
          await clearScorebookDraft(teamKey);
        }

        setMatchStats([]);
        setPitcherStats([]);
        setGameDetails(null);
        setPlayLogs([]);
        setBoxscoreAtBats([]);
        setMySubstitutions([]);

        if (options.clearLineups) {
          setMyLineup([]);
          setOpponentLineup([]);
        }

        if (options.resetMatchScore) {
          setMatch((prev) =>
            prev
              ? {
                  ...prev,
                  myScore: 0,
                  opponentScore: 0,
                  myInningScores: [],
                  opponentInningScores: [],
                  myHits: 0,
                  opponentHits: 0,
                  myErrors: 0,
                  opponentErrors: 0,
                }
              : prev
          );
        }

        setShowDeleteStatsModal(false);
        setInspectedCellModalState(null);
        toast.success("この試合の個人データを削除しました");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg || "個人データの削除に失敗しました");
      } finally {
        setIsDeletingPersonalStats(false);
      }
    },
    [match, isDeletingPersonalStats, currentTeam?.id]
  );

  const handleDeleteMatch = useCallback(async () => {
    if (!match || isDeletingMatch) return;
    setIsDeletingMatch(true);
    const deletingId = match.id;
    try {
      const teamKey = currentTeam?.id || "default";
      const draftMeta = peekScorebookDraftMeta(teamKey);
      if (draftMeta?.selectedMatchId === deletingId) {
        await clearScorebookDraft(teamKey);
      }

      if (isDemoMatchId(deletingId)) {
        deleteDemoMatch(deletingId);
        invalidateLiffApiCache();
        setMatchesList((prev) => prev.filter((item) => item.id !== deletingId));
        setShowDeleteMatchModal(false);
        toast.success("試合データとすべての関連データを削除しました（デモ）");
        router.replace("/liff/matches");
        return;
      }

      const res = await fetch(`/api/matches/${encodeURIComponent(deletingId)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as DeleteMatchApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "試合データの削除に失敗しました");
      }

      invalidateLiffApiCache();
      setMatchesList((prev) => prev.filter((item) => item.id !== deletingId));
      setShowDeleteMatchModal(false);
      toast.success("試合データとすべての関連データを削除しました");
      router.replace("/liff/matches");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "試合データの削除に失敗しました");
    } finally {
      setIsDeletingMatch(false);
    }
  }, [match, isDeletingMatch, currentTeam?.id, router]);

  // 1. 試合詳細 ＆ 出場メンバー・成績データのロード (matchId がある場合)
  useEffect(() => {
    setIsAddressCopied(false);
    setLineupTeamTab("my");
    setShowDeleteStatsModal(false);
    setShowDeleteMatchModal(false);
    setIsManageMenuOpen(false);
    setInspectedCellModalState(null);
    setOpsEditorState({ isOpen: false, initialTab: "guide" });
    if (!matchId) {
      setDetailError(null);
      setPrevMatch(null);
      setNextMatch(null);
      setMatchPosition(null);
      setMatchStats([]);
      setPitcherStats([]);
      setGameDetails(null);
      setPlayLogs([]);
      setBoxscoreAtBats([]);
      setOpponentLineup([]);
      setIsStatsLoading(false);
      return;
    }

    const targetMatchId = matchId;
    let isCancelled = false;

    async function loadMatch() {
      try {
        setDetailError(null);

        // ⚡ 同期キャッシュがあればスピナーを出さずに0ms即時反映しつつ裏で再検証
        if (!isDemoMatchId(targetMatchId)) {
          const cachedDetail = peekLiffApiCache<MatchDetailApiResponse>(
            `/api/matches/${encodeURIComponent(targetMatchId)}`
          );
          if (cachedDetail?.match) {
            setMatch(cachedDetail.match);
            setPrevMatch(
              cachedDetail.prevMatch ??
                (cachedDetail.prevMatchId
                  ? { id: cachedDetail.prevMatchId, opponent: "前の試合", date: "" }
                  : null)
            );
            setNextMatch(
              cachedDetail.nextMatch ??
                (cachedDetail.nextMatchId
                  ? { id: cachedDetail.nextMatchId, opponent: "次の試合", date: "" }
                  : null)
            );
            setMatchPosition(
              typeof cachedDetail.matchOrderNumber === "number" &&
                typeof cachedDetail.totalMatches === "number" &&
                cachedDetail.totalMatches > 0
                ? { current: cachedDetail.matchOrderNumber, total: cachedDetail.totalMatches }
                : null
            );
            setIsDetailLoading(false);
          } else {
            setIsDetailLoading(true);
          }

          const cachedStats = peekLiffApiCache<MatchStatsApiResponse>(
            `/api/matches/${encodeURIComponent(targetMatchId)}/stats`
          );
          if (cachedStats?.success) {
            setMatchStats(Array.isArray(cachedStats.stats) ? cachedStats.stats : []);
            setPitcherStats(
              Array.isArray(cachedStats.pitcherStats) ? cachedStats.pitcherStats : []
            );
            setGameDetails(cachedStats.gameDetails ?? null);
            setIsStatsLoading(false);
          } else {
            setIsStatsLoading(true);
          }
        } else {
          setIsDetailLoading(true);
          setIsStatsLoading(true);
        }

        // 🅰️ デモ試合IDの場合のみデモデータを参照（実試合UUIDがデモ扱いされる誤判定を完全防止）
        if (isDemoMatchId(targetMatchId)) {
          const demoMatch = getDemoMatchById(targetMatchId);
          if (!demoMatch) {
            throw new Error("指定されたデモ試合が見つかりませんでした");
          }
          if (isCancelled) return;
          const demoAdjacent = getDemoAdjacentMatches(targetMatchId);
          setMatch(demoMatch);
          setPrevMatch(demoAdjacent.prevMatch);
          setNextMatch(demoAdjacent.nextMatch);
          setMatchPosition(
            demoAdjacent.matchOrderNumber && demoAdjacent.totalMatches > 0
              ? {
                  current: demoAdjacent.matchOrderNumber,
                  total: demoAdjacent.totalMatches,
                }
              : null
          );
          setTeamPlayers(DEMO_LINEUP_PLAYERS);
          const demoLineups = loadDemoMatchLineups(targetMatchId);
          setMyLineup(demoLineups.myLineup || []);
          setOpponentLineup(demoLineups.opponentLineup || []);
          setMySubstitutions([]);
          setMyAttendance(demoLineups.myAttendance || {});
          const demoBundle = getDemoMatchStatsBundle(targetMatchId, demoMatch.status);
          setMatchStats(demoBundle.stats);
          setPitcherStats(demoBundle.pitcherStats);
          setGameDetails(demoBundle.gameDetails);
          setPlayLogs(demoBundle.playLogs);
          setBoxscoreAtBats([]);
          return;
        }

        // 試合切替時に前の試合の成績が残らないよう初期化
        setMatchStats([]);
        setPitcherStats([]);
        setGameDetails(null);
        setPlayLogs([]);
        setBoxscoreAtBats([]);
        setOpponentLineup([]);

        // 🅱️ 実チームDB処理（試合詳細 + スタメン・出欠 + 個人成績・打席経過 + 既知チーム選手名簿を並列取得）
        const rawKnownTeamId =
          currentTeam?.id && currentTeam.id !== "demo-team"
            ? currentTeam.id
            : typeof window !== "undefined"
              ? localStorage.getItem("iscore_selectedTeamId")
              : null;
        const knownTeamId =
          rawKnownTeamId && !isDemoTeamId(rawKnownTeamId) ? rawKnownTeamId : null;

        const [matchRes, lineupsRes, statsRes, logsRes, boxscoreRes, prefetchedPlayersRes] =
          await Promise.all([
            fetch(`/api/matches/${encodeURIComponent(targetMatchId)}`, { cache: "no-store" }),
            fetch(`/api/matches/${encodeURIComponent(targetMatchId)}/lineups`, { cache: "no-store" }),
            fetch(`/api/matches/${encodeURIComponent(targetMatchId)}/stats`, {
              cache: "no-store",
            }).catch(() => null),
            fetch(`/api/matches/${encodeURIComponent(targetMatchId)}/logs`, {
              cache: "no-store",
            }).catch(() => null),
            fetch(`/api/matches/${encodeURIComponent(targetMatchId)}/boxscore`, {
              cache: "no-store",
            }).catch(() => null),
            knownTeamId
              ? fetch(`/api/teams/${encodeURIComponent(knownTeamId)}/players`, {
                  cache: "no-store",
                }).catch(() => null)
              : Promise.resolve(null),
          ]);

        if (!matchRes.ok) {
          throw new Error("試合データの取得に失敗しました");
        }

        const data = (await matchRes.json()) as MatchDetailApiResponse;
        if (!data.match) {
          throw new Error(data.error || "試合が見つかりませんでした");
        }

        if (isCancelled) return;
        setMatch(data.match);
        setPrevMatch(
          data.prevMatch ??
            (data.prevMatchId ? { id: data.prevMatchId, opponent: "前の試合", date: "" } : null)
        );
        setNextMatch(
          data.nextMatch ??
            (data.nextMatchId ? { id: data.nextMatchId, opponent: "次の試合", date: "" } : null)
        );
        setMatchPosition(
          typeof data.matchOrderNumber === "number" &&
            typeof data.totalMatches === "number" &&
            data.totalMatches > 0
            ? { current: data.matchOrderNumber, total: data.totalMatches }
            : null
        );

        if (lineupsRes.ok) {
          const lineupsJson = (await lineupsRes.json()) as MatchLineupsApiResponse;
          if (!isCancelled) {
            if (lineupsJson.success && lineupsJson.lineups) {
              setMyLineup(lineupsJson.lineups.myLineup || []);
              setOpponentLineup(lineupsJson.lineups.opponentLineup || []);
              setMySubstitutions(lineupsJson.lineups.mySubstitutions || []);
              setMyAttendance(lineupsJson.lineups.myAttendance || {});
            } else {
              setMyLineup([]);
              setOpponentLineup([]);
              setMySubstitutions([]);
              setMyAttendance({});
            }
          }
        }

        if (statsRes && statsRes.ok) {
          const statsJson = (await statsRes.json()) as MatchStatsApiResponse;
          if (!isCancelled && statsJson.success) {
            setMatchStats(Array.isArray(statsJson.stats) ? statsJson.stats : []);
            setPitcherStats(
              Array.isArray(statsJson.pitcherStats) ? statsJson.pitcherStats : []
            );
            setGameDetails(statsJson.gameDetails ?? null);
          }
        }

        if (logsRes && logsRes.ok) {
          const logsJson = (await logsRes.json()) as MatchLogsApiResponse;
          if (!isCancelled && logsJson.success) {
            setPlayLogs(Array.isArray(logsJson.logs) ? logsJson.logs : []);
          }
        }

        if (boxscoreRes && boxscoreRes.ok) {
          const boxJson = (await boxscoreRes.json()) as unknown;
          if (!isCancelled && Array.isArray(boxJson)) {
            setBoxscoreAtBats(boxJson as LiffBoxscoreAtBatItem[]);
          }
        }

        // 控え・欠席一覧を表示するため、試合レコード自身の teamId を最優先して選手名簿を取得（Stage 1 並列取得済みの場合は即利用）
        const effectiveTeamId =
          data.match.teamId ||
          knownTeamId ||
          currentTeam?.id ||
          (typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : null);

        if (effectiveTeamId && !isDemoTeamId(effectiveTeamId)) {
          const playersRes =
            effectiveTeamId === knownTeamId && prefetchedPlayersRes
              ? prefetchedPlayersRes
              : await fetch(`/api/teams/${encodeURIComponent(effectiveTeamId)}/players`, {
                  cache: "no-store",
                }).catch(() => null);
          if (playersRes && playersRes.ok && !isCancelled) {
            const playersData = (await playersRes.json()) as LineupPlayer[];
            const activePlayers = (Array.isArray(playersData) ? playersData : []).filter(
              (p) => p.isActive !== false && p.isActive !== 0
            );
            setTeamPlayers(activePlayers);
          }
        } else if (!isCancelled) {
          setTeamPlayers([]);
        }
      } catch (err) {
        if (isCancelled) return;
        console.error("Error loading match detail:", err);
        setDetailError(err instanceof Error ? err.message : "エラーが発生しました");
      } finally {
        if (!isCancelled) {
          setLoadedMatchId(targetMatchId);
          setIsDetailLoading(false);
          setIsStatsLoading(false);
        }
      }
    }

    loadMatch();
    return () => {
      isCancelled = true;
    };
  }, [matchId, currentTeam?.id]);

  // 2. 試合一覧のロード (matchId がない場合、選択中チームに応じてフェッチ)
  const loadMatchesList = useCallback(async () => {
    if (matchId) return;
    if (isLoadingTeam && !currentTeam?.id) return;

    const storedTeamId =
      typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : null;
    const storedIsDemo =
      typeof window !== "undefined" ? localStorage.getItem("iscore_isDemo") === "true" : false;

    let resolvedTeamId =
      currentTeam?.id ||
      (storedTeamId && (storedTeamId !== "demo-team" || storedIsDemo) ? storedTeamId : null);

    try {
      // 初回アクセス等でまだ teamId が未確定の場合は /api/liff/hub から実チームIDを解決
      if (!resolvedTeamId) {
        setIsListLoading(true);
        try {
          const hubRes = await fetch("/api/liff/hub", { cache: "no-store" });
          if (hubRes.ok) {
            const hubData = (await hubRes.json()) as {
              isDemo?: boolean;
              team?: { id?: string | null };
            };
            resolvedTeamId = hubData.team?.id || "demo-team";
          } else {
            resolvedTeamId = "demo-team";
          }
        } catch {
          resolvedTeamId = "demo-team";
        }
      }

      const effectiveListTeamId = resolvedTeamId || "demo-team";
      const listUrl = `/api/liff/matches?teamId=${encodeURIComponent(effectiveListTeamId)}`;
      const syncCachedList = peekLiffApiCache<LiffMatchesApiResponse>(listUrl);
      if (Array.isArray(syncCachedList?.matches)) {
        setMatchesList(
          isDemoTeamId(effectiveListTeamId)
            ? getHydratedDemoMatchCards(syncCachedList.matches)
            : syncCachedList.matches
        );
        setIsListLoading(false);
      } else {
        setIsListLoading(true);
      }

      if (isDemoTeamId(effectiveListTeamId)) {
        try {
          const res = await fetch(`/api/liff/matches?teamId=demo-team`, { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json()) as LiffMatchesApiResponse;
            setMatchesList(
              getHydratedDemoMatchCards(Array.isArray(data.matches) ? data.matches : undefined)
            );
            return;
          }
        } catch {}
        setMatchesList(getHydratedDemoMatchCards());
        return;
      }

      const res = await fetch(
        `/api/liff/matches?teamId=${encodeURIComponent(effectiveListTeamId)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = (await res.json()) as LiffMatchesApiResponse;
        if (Array.isArray(data.matches)) {
          const hydrated = data.matches.map((m) => {
            if (isDemoMatchId(m.id)) {
              const demoPayload = loadDemoMatchLineups(m.id);
              const hasSavedStarters = demoPayload.myLineup.some((s) => Boolean(s.playerId || s.name));
              return { ...m, hasLineup: hasSavedStarters };
            }
            return m;
          });
          setMatchesList(hydrated);
        } else {
          setMatchesList([]);
        }
      }
    } catch (err) {
      console.error("Error loading matches list:", err);
      if (isDemo || isDemoTeamId(resolvedTeamId)) {
        setMatchesList(getHydratedDemoMatchCards());
      }
    } finally {
      setIsListLoading(false);
    }
  }, [matchId, currentTeam?.id, isLoadingTeam, isDemo]);

  useEffect(() => {
    loadMatchesList();
  }, [loadMatchesList]);

  // スタメン・控え・欠席の派生リスト計算
  const filledStarters = useMemo(
    () => myLineup.filter((slot) => Boolean(slot.playerId || (slot.name && slot.name.trim() !== ""))),
    [myLineup]
  );

  const filledOpponentStarters = useMemo(
    () =>
      opponentLineup.filter((slot) =>
        Boolean(
          (slot.name && slot.name.trim() !== "") ||
            (slot.uniformNumber && slot.uniformNumber.trim() !== "")
        )
      ),
    [opponentLineup]
  );

  const starterPlayerIds = useMemo(
    () => filledStarters.map((slot) => slot.playerId).filter(Boolean),
    [filledStarters]
  );

  const substitutedPlayerIds = useMemo(
    () => mySubstitutions.map((sub) => sub.playerId).filter(Boolean),
    [mySubstitutions]
  );

  const remainingPlayers = useMemo(
    () =>
      teamPlayers.filter(
        (p) =>
          !starterPlayerIds.includes(p.id) &&
          !substitutedPlayerIds.includes(p.id)
      ),
    [teamPlayers, starterPlayerIds, substitutedPlayerIds]
  );

  const benchPlayers = useMemo(
    () => remainingPlayers.filter((p) => myAttendance[p.id] !== "absent"),
    [remainingPlayers, myAttendance]
  );

  const absentPlayers = useMemo(
    () => remainingPlayers.filter((p) => myAttendance[p.id] === "absent"),
    [remainingPlayers, myAttendance]
  );

  // 試合詳細ページ用の共有スコアブックバンドル（タイムライン1マス表示・清書シート・記号解説モーダルで共有）
  const activeDetailMatch =
    matchId && match && match.id === matchId && !detailError ? match : null;
  const activeMatchTeamId = (activeDetailMatch as (Match & { teamId?: string }) | null)
    ?.teamId;

  // 当日運営スタッフ候補・保護者本人照合・同日スケジュール/配車のバックグラウンド取得
  useEffect(() => {
    if (!activeDetailMatch) {
      setOpsAdultMembers([]);
      setOpsMyIdentity(null);
      setOpsScheduleSync(null);
      return;
    }

    let cancelled = false;

    async function loadOpsContext() {
      try {
        const isDemoTarget = isDemo || isDemoMatchId(activeDetailMatch!.id);
        const storedTeamId =
          typeof window !== "undefined"
            ? localStorage.getItem("iscore_selectedTeamId")
            : null;
        const effectiveTeamId = isDemoTarget
          ? "demo-team"
          : activeMatchTeamId || currentTeam?.id || storedTeamId || "";

        if (!effectiveTeamId) return;

        const qs = new URLSearchParams({
          teamId: effectiveTeamId,
          matchDate: activeDetailMatch!.date || "",
        });
        if (activeDetailMatch!.matchDayOps?.linkedEventId) {
          qs.set("linkedEventId", activeDetailMatch!.matchDayOps.linkedEventId);
        }
        if (profile?.userId) {
          qs.set("userId", profile.userId);
        }
        if (profile?.displayName) {
          qs.set("userName", profile.displayName);
        }

        const res = await fetch(`/api/liff/match-ops-context?${qs.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as LiffMatchOpsContextResponse;
        if (cancelled || !payload.success) return;

        setOpsAdultMembers(Array.isArray(payload.adultMembers) ? payload.adultMembers : []);
        setOpsMyIdentity(payload.myIdentity || null);
        setOpsScheduleSync(payload.scheduleSync || null);
      } catch (err) {
        console.warn("Failed to load match ops context:", err);
      }
    }

    void loadOpsContext();
    return () => {
      cancelled = true;
    };
  }, [
    activeDetailMatch?.id,
    activeDetailMatch?.date,
    activeDetailMatch?.matchDayOps?.linkedEventId,
    activeMatchTeamId,
    currentTeam?.id,
    isDemo,
    profile?.userId,
    profile?.displayName,
  ]);

  const handleOpenOpsEditor = useCallback(
    (initialTab: MatchDayOpsEditorTab = "guide") => {
      setOpsEditorState({ isOpen: true, initialTab });
    },
    []
  );

  const handleCloseOpsEditor = useCallback(() => {
    setOpsEditorState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleSaveMatchDayOps = useCallback(
    async (nextOps: MatchDayOps) => {
      if (!match || isSavingMatchOps) return;
      setIsSavingMatchOps(true);
      try {
        if (isDemoMatchId(match.id)) {
          const updatedDemo: Match = {
            ...match,
            matchDayOps: nextOps,
          };
          saveCustomDemoMatch(updatedDemo);
          invalidateLiffApiCache();
          setMatch(updatedDemo);
          setMatchesList((prev) =>
            prev.map((item) =>
              item.id === match.id ? { ...item, matchDayOps: nextOps } : item
            )
          );
          setOpsEditorState((prev) => ({ ...prev, isOpen: false }));
          toast.success("当日のしおり・役割担当を保存しました（デモ）");
          return;
        }

        const res = await fetch(`/api/matches/${encodeURIComponent(match.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchDayOps: nextOps }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          throw new Error(data.error || "保存に失敗しました");
        }

        invalidateLiffApiCache();
        setMatch((prev) => (prev ? { ...prev, matchDayOps: nextOps } : prev));
        setMatchesList((prev) =>
          prev.map((item) =>
            item.id === match.id ? { ...item, matchDayOps: nextOps } : item
          )
        );
        setOpsEditorState((prev) => ({ ...prev, isOpen: false }));
        toast.success("当日のしおり・役割担当を保存しました");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "保存に失敗しました";
        toast.error(msg);
      } finally {
        setIsSavingMatchOps(false);
      }
    },
    [match, isSavingMatchOps]
  );

  const sharedScorebookMatchMeta = useMemo<ScorebookMatchHeaderMeta | null>(() => {
    if (!activeDetailMatch) return null;
    const parseInningArr = (raw: unknown): number[] => {
      let arr: unknown[] = [];
      if (Array.isArray(raw)) {
        arr = raw;
      } else if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) arr = parsed;
        } catch {
          arr = [];
        }
      }
      return arr.filter((v): v is number => typeof v === "number");
    };

    const myInnings = parseInningArr(activeDetailMatch.myInningScores);
    const oppInnings = parseInningArr(activeDetailMatch.opponentInningScores);
    const isSecond = activeDetailMatch.battingOrder === "second";
    const myLabel = scoreTeamName;
    const vInfo = buildVenueDisplayInfo(activeDetailMatch);
    const rawBasicV = (vInfo.shortName || vInfo.officialName).trim();
    const cleanVenue =
      rawBasicV && !/^(未定|未設定|球場未設定)$/.test(rawBasicV)
        ? rawBasicV
        : vInfo.officialName || null;
    const rawTour = (
      activeDetailMatch.tournamentName ||
      activeDetailMatch.tournament ||
      ""
    ).trim();
    const customTour =
      rawTour && !isGenericMatchTournamentName(rawTour, practiceMatchLabel)
        ? rawTour
        : null;
    const mTypeLabel =
      activeDetailMatch.matchType === "official"
        ? "公式戦"
        : activeDetailMatch.matchType === "exchange"
        ? "交流戦"
        : practiceMatchLabel;

    return {
      matchId: activeDetailMatch.id,
      date:
        formatBasicMatchDateTime(activeDetailMatch.date) ||
        activeDetailMatch.date,
      matchTypeLabel: mTypeLabel,
      tournamentName: customTour,
      venueName: cleanVenue,
      topTeamName: isSecond ? activeDetailMatch.opponent : myLabel,
      bottomTeamName: isSecond ? myLabel : activeDetailMatch.opponent,
      scheduledInnings: activeDetailMatch.innings || 7,
      topInningScores: isSecond ? oppInnings : myInnings,
      bottomInningScores: isSecond ? myInnings : oppInnings,
      topTotalRuns: isSecond
        ? activeDetailMatch.opponentScore ?? 0
        : activeDetailMatch.myScore ?? 0,
      bottomTotalRuns: isSecond
        ? activeDetailMatch.myScore ?? 0
        : activeDetailMatch.opponentScore ?? 0,
      topTotalHits: isSecond
        ? activeDetailMatch.opponentHits ?? 0
        : activeDetailMatch.myHits ?? 0,
      bottomTotalHits: isSecond
        ? activeDetailMatch.myHits ?? 0
        : activeDetailMatch.opponentHits ?? 0,
      topTotalErrors: isSecond
        ? activeDetailMatch.opponentErrors ?? 0
        : activeDetailMatch.myErrors ?? 0,
      bottomTotalErrors: isSecond
        ? activeDetailMatch.myErrors ?? 0
        : activeDetailMatch.opponentErrors ?? 0,
    };
  }, [activeDetailMatch, scoreTeamName]);

  const sharedIsFutureOrScheduled = useMemo(() => {
    if (!activeDetailMatch) return false;
    if (activeDetailMatch.status === "scheduled") return true;
    const d = parseSafeMatchDate(activeDetailMatch.date);
    return Boolean(
      d && d.getTime() > Date.now() && activeDetailMatch.status !== "finished"
    );
  }, [activeDetailMatch]);

  const sharedHasPersonalStats =
    matchStats.length > 0 ||
    pitcherStats.length > 0 ||
    playLogs.length > 0 ||
    boxscoreAtBats.length > 0;

  const scorebookBundle = useMatchScorebookBundle({
    matchMeta: sharedScorebookMatchMeta,
    isMyTeamTop: activeDetailMatch
      ? activeDetailMatch.battingOrder !== "second"
      : true,
    hasPersonalStatsData: sharedHasPersonalStats,
    isFutureOrScheduled: sharedIsFutureOrScheduled,
    isRainout: activeDetailMatch?.status === "rainout",
    isDemoMatch: Boolean(
      activeDetailMatch && (isDemo || isDemoMatchId(activeDetailMatch.id))
    ),
    teamId: currentTeam?.id,
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🅰️ 試合詳細画面 (matchId が指定されている場合)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (matchId) {
    const isDetailPending = isDetailLoading || (loadedMatchId !== matchId && !detailError);

    if (isDetailPending) {
      return (
        <div className="flex flex-col flex-1">
          <LiffHeader />
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-bold">試合データを読み込み中...</p>
          </div>
        </div>
      );
    }

    if (detailError || !match) {
      return (
        <div className="flex flex-col flex-1">
          <LiffHeader />
          <div className="p-4 space-y-4">
            <LiffPageHeader title="試合情報" showBack />
            <EmptyState
              icon={Shield}
              title="試合が見つかりませんでした"
              description={detailError || "指定された試合が存在しないか、削除された可能性があります"}
            />
          </div>
        </div>
      );
    }

    const parseScores = (raw: unknown): (number | null)[] => {
      if (Array.isArray(raw)) return raw as (number | null)[];
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw) as (number | null)[];
        } catch {
          return [];
        }
      }
      return [];
    };

    const myInningScores = parseScores(match.myInningScores);
    const opponentInningScores = parseScores(match.opponentInningScores);

    const isFinished = match.status === "finished";
    const isScheduled = match.status === "scheduled";
    const isLive = match.status === "live";
    const isRainout = match.status === "rainout";
    const parsedMatchDate = parseSafeMatchDate(match.date);
    const isFuture = Boolean(
      parsedMatchDate && parsedMatchDate.getTime() > Date.now() && match.status !== "finished"
    );
    const isFutureOrScheduled = isFuture || isScheduled;

    const isWin = isFinished && match.myScore > match.opponentScore;
    const isLose = isFinished && match.myScore < match.opponentScore;
    const isDraw = isFinished && match.myScore === match.opponentScore;

    // 試合カード（MatchScoreCard）と同一の先攻・後攻スコアボード計算（チーム名[標準] / 構成名 の設定に従う）
    const myTeamLabel = scoreTeamName;
    const topScores = match.battingOrder === "second" ? opponentInningScores : myInningScores;
    const bottomScores = match.battingOrder === "second" ? myInningScores : opponentInningScores;
    const topTeamName = match.battingOrder === "second" ? match.opponent : myTeamLabel;
    const bottomTeamName = match.battingOrder === "second" ? myTeamLabel : match.opponent;

    const firstScore = match.battingOrder === "second" ? match.opponentScore : match.myScore;
    const secondScore = match.battingOrder === "second" ? match.myScore : match.opponentScore;
    const isHomeWinning = !isFutureOrScheduled && secondScore > firstScore;

    const topHits =
      match.battingOrder === "second" ? (match.opponentHits ?? "-") : (match.myHits ?? "-");
    const bottomHits =
      match.battingOrder === "second" ? (match.myHits ?? "-") : (match.opponentHits ?? "-");
    const topErrors =
      match.battingOrder === "second" ? (match.opponentErrors ?? "-") : (match.myErrors ?? "-");
    const bottomErrors =
      match.battingOrder === "second" ? (match.myErrors ?? "-") : (match.opponentErrors ?? "-");

    const inningsCount = Math.max(match.innings || 7, topScores.length, bottomScores.length, 7);
    const inningsArray = Array.from({ length: inningsCount }, (_, i) => i + 1);

    const formatScoreCell = (
      score: number | null | undefined,
      isBottomRow: boolean,
      isInningFinal: boolean,
      homeWinning: boolean
    ) => {
      if (isBottomRow && isInningFinal && homeWinning && (score === null || score === undefined)) {
        return "x";
      }
      if (score === null || score === undefined) {
        return "-";
      }
      return score;
    };

    const matchTypeLabel =
      match.matchType === "official"
        ? "公式戦"
        : match.matchType === "exchange"
          ? "交流戦"
          : practiceMatchLabel;
    const matchTypeBadgeClass =
      match.matchType === "official"
        ? "bg-amber-400 text-slate-950 border border-amber-400"
        : match.matchType === "exchange"
          ? "bg-sky-500 text-white border border-sky-500"
          : "bg-slate-800 text-slate-200 border border-slate-700";

    const inningsBadgeLabel = `${match.innings || 7}回制`;
    const neutralBadgeClass =
      "bg-slate-800 text-slate-200 border-slate-700";

    const rawTournament = (match.tournamentName || match.tournament || "").trim();
    const customTournamentName =
      rawTournament &&
      !isGenericMatchTournamentName(rawTournament, practiceMatchLabel)
        ? rawTournament
        : "";

    const battingOrderLabel =
      match.battingOrder === "first"
        ? "先攻"
        : match.battingOrder === "second"
          ? "後攻"
          : "攻守未定";
    const battingOrderBadgeClass =
      match.battingOrder === "first" || match.battingOrder === "second"
        ? neutralBadgeClass
        : "bg-slate-800 text-slate-300 border-slate-700";

    const benchSideLabel =
      match.benchSide === "1B"
        ? "一塁側"
        : match.benchSide === "3B"
          ? "三塁側"
          : "ベンチ未定";
    const benchSideBadgeClass =
      match.benchSide === "1B" || match.benchSide === "3B"
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-slate-800 text-slate-300 border-slate-700";

    const venueInfo = buildVenueDisplayInfo(match);
    const formattedDateTime = formatBasicMatchDateTime(match.date);
    const rawBasicVenue = (venueInfo.shortName || venueInfo.officialName).trim();
    const basicVenueLabel =
      rawBasicVenue && !/^(未定|未設定|球場未設定)$/.test(rawBasicVenue) ? rawBasicVenue : "";

    const shareBenchText =
      match.benchSide === "1B" || match.benchSide === "3B" ? ` • ${benchSideLabel}` : "";
    const shareBasicLine = `\n🏷️ ${matchTypeLabel} • ${inningsBadgeLabel} • ${battingOrderLabel}${shareBenchText}${
      customTournamentName ? `\n🏆 ${customTournamentName}` : ""
    }`;
    const shareVenueLine = venueInfo.officialName
      ? `\n📍 ${venueInfo.officialName}${venueInfo.address ? ` (${venueInfo.address})` : ""}`
      : "";
    const shareDateText = formattedDateTime || match.date;

    const hasPersonalStatsData =
      matchStats.length > 0 ||
      pitcherStats.length > 0 ||
      playLogs.length > 0 ||
      boxscoreAtBats.length > 0;

    const hasScorebookOrStatsData =
      hasPersonalStatsData ||
      Boolean(scorebookBundle.topModel || scorebookBundle.bottomModel);

    // 案A: 試合前・雨天中止（予定モード） vs 試合中・試合後（結果・ライブモード）のスマート表示順切替
    const isPreMatchMode =
      !isLive && (isFutureOrScheduled || isRainout) && !hasScorebookOrStatsData;

    const lineupShareBlock =
      filledStarters.length > 0
        ? formatLineupShareText(
            match.opponent,
            match.date,
            myLineup,
            remainingPlayers,
            myAttendance
          )
        : "";

    const preMatchShareText = buildPreMatchAnnouncementShareText({
      opponent: match.opponent,
      dateText: shareDateText,
      matchTypeLabel,
      inningsLabel: inningsBadgeLabel,
      battingOrderLabel,
      benchSideLabel:
        match.benchSide === "1B" || match.benchSide === "3B"
          ? benchSideLabel
          : undefined,
      tournamentName: customTournamentName || undefined,
      venueOfficialName: venueInfo.officialName || undefined,
      venueAddress: venueInfo.address || undefined,
      venueExternalMapUrl: venueInfo.externalUrl || undefined,
      venueParkingInfo: match.venueParkingInfo,
      venueSpikeRule: match.venueSpikeRule,
      venueNotes: match.venueNotes,
      ops: match.matchDayOps,
      scheduleSync: opsScheduleSync,
      lineupShareBlock: lineupShareBlock || undefined,
    });

    const postMatchBaseShareText = `【試合結果】\nvs ${match.opponent}\n${match.myScore} - ${match.opponentScore} (${isWin ? "勝利 🏆" : isLose ? "敗戦" : "引分"})\n📅 ${shareDateText}${shareBasicLine}${shareVenueLine}`;

    const shareText = isPreMatchMode
      ? preMatchShareText
      : lineupShareBlock
        ? `${postMatchBaseShareText}\n\n${lineupShareBlock}`
        : postMatchBaseShareText;

    const hasSeparateCarpoolCard = shouldShowMatchCarpoolCard(
      match.matchDayOps,
      opsScheduleSync
    );

    const isDemoCurrentMatch = isDemo || isDemoMatchId(match.id);

    const sharedStatsProps = {
      matchId: match.id,
      isMyTeamTop: match.battingOrder !== "second",
      myTeamName: myTeamLabel,
      opponentName: match.opponent,
      isFutureOrScheduled,
      isRainout,
      isDemoMatch: isDemoCurrentMatch,
      stats: matchStats,
      pitcherStats,
      gameDetails,
      playLogs,
      boxscoreAtBats,
      isLoadingStats: isStatsLoading,
      topScorebookModel: scorebookBundle.topModel,
      bottomScorebookModel: scorebookBundle.bottomModel,
      scorebookRules: scorebookBundle.effectiveRules,
      onInspectScorebookCell: handleInspectScorebookCell,
    };

    // 🔒 試合映像（動画URL登録時のみ表示・未登録時は空枠を出さずスッキリ非表示）
    const videoSection = match.youtubeUrl ? (
      <section key="section-video" className="space-y-2" aria-label="試合映像">
        <div className="flex items-center justify-between px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
            <Video className="w-4 h-4 text-[#FF0000] shrink-0" />
            <span>試合映像 (YouTube限定公開)</span>
          </h2>
        </div>

        <div className="space-y-2">
          <YouTubePlayer
            url={match.youtubeUrl}
            title={`vs ${match.opponent} (${match.date}) 試合動画`}
          />

          {/* ⚠️ 動画取り扱いに関する注意書き */}
          <div className="p-3 rounded-2xl border border-border border-l-4 border-l-[#FF0000] bg-card shadow-xs flex items-start gap-2 text-[11px] text-muted-foreground font-bold">
            <ShieldAlert className="w-4 h-4 text-[#FF0000] shrink-0 mt-0.5" />
            <p className="leading-snug">
              本動画は選手・チームのプライバシー保護のため
              <strong className="text-foreground">YouTube限定公開</strong>
              です。SNS等への無断転載・拡散はご遠慮ください。
            </p>
          </div>
        </div>
      </section>
    ) : null;

    // ⚾️ スコアボード（基本情報の合計スコア直下に直結）
    const scoreboardSection = (
      <section key="section-scoreboard" className="space-y-2" aria-label="スコアボード">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
            <Trophy className="w-4 h-4 text-primary shrink-0" />
            <span>スコアボード</span>
          </h2>

          {isLive ? (
            <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black shadow-2xs animate-pulse">
              LIVE
            </span>
          ) : isRainout ? (
            <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border text-[10px] font-black">
              雨天中止
            </span>
          ) : isWin ? (
            <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-black shadow-2xs">
              WIN
            </span>
          ) : isLose ? (
            <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black shadow-2xs">
              LOSE
            </span>
          ) : isDraw ? (
            <span className="px-2 py-0.5 rounded bg-zinc-500 text-white text-[10px] font-black shadow-2xs">
              DRAW
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-black">
              試合予定
            </span>
          )}
        </div>

        <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-xs flex flex-col">
          <div className="overflow-x-auto scrollbar-none">
            <table className="w-full text-center whitespace-nowrap text-xs">
              <thead className="bg-[#0f172a] text-slate-100 border-b-[3px] border-primary">
                <tr className="text-[10px] font-black">
                  <th className="p-2 text-left pl-3 min-w-[92px] text-white">TEAM</th>
                  {inningsArray.map((inningNum) => (
                    <th key={inningNum} className="w-6 p-2 font-mono text-slate-200">
                      {inningNum}
                    </th>
                  ))}
                  <th className="w-8 p-2 bg-primary text-primary-foreground font-black border-l border-slate-700 font-mono">
                    R
                  </th>
                  <th className="w-6 p-2 font-mono text-slate-200">H</th>
                  <th className="w-6 p-2 pr-3 font-mono text-slate-200">E</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs font-black">
                {/* 先攻チーム */}
                <tr className="hover:bg-muted/20">
                  <td className="p-2 text-left pl-3 font-bold truncate max-w-[105px] text-foreground">
                    {topTeamName}
                  </td>
                  {inningsArray.map((_, i) => (
                    <td key={i} className="p-2 font-mono font-bold text-muted-foreground">
                      {formatScoreCell(topScores[i], false, false, false)}
                    </td>
                  ))}
                  <td className="p-2 font-mono bg-primary/10 text-primary font-black border-l border-border text-sm">
                    {isFutureOrScheduled && !isLive ? "-" : firstScore}
                  </td>
                  <td className="p-2 font-mono text-muted-foreground text-[11px]">
                    {isFutureOrScheduled && !isLive ? "-" : topHits}
                  </td>
                  <td className="p-2 pr-3 font-mono text-muted-foreground text-[11px]">
                    {isFutureOrScheduled && !isLive ? "-" : topErrors}
                  </td>
                </tr>

                {/* 後攻チーム */}
                <tr className="hover:bg-muted/20">
                  <td className="p-2 text-left pl-3 font-bold truncate max-w-[105px] text-foreground">
                    {bottomTeamName}
                  </td>
                  {inningsArray.map((_, i) => (
                    <td key={i} className="p-2 font-mono font-bold text-muted-foreground">
                      {formatScoreCell(
                        bottomScores[i],
                        true,
                        i === inningsCount - 1,
                        isHomeWinning
                      )}
                    </td>
                  ))}
                  <td className="p-2 font-mono bg-primary/10 text-primary font-black border-l border-border text-sm">
                    {isFutureOrScheduled && !isLive ? "-" : secondScore}
                  </td>
                  <td className="p-2 font-mono text-muted-foreground text-[11px]">
                    {isFutureOrScheduled && !isLive ? "-" : bottomHits}
                  </td>
                  <td className="p-2 pr-3 font-mono text-muted-foreground text-[11px]">
                    {isFutureOrScheduled && !isLive ? "-" : bottomErrors}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );

    // 📒 デジタルスコアブック清書シート（パターン2: 清書シート → タイムライン → 個人成績）
    const scorebookSection = (
      <MatchScorebookSection
        key="section-scorebook"
        matchMeta={{
          matchId: match.id,
          date: formattedDateTime || match.date,
          matchTypeLabel,
          tournamentName: customTournamentName || null,
          venueName: basicVenueLabel || venueInfo.officialName || null,
          topTeamName,
          bottomTeamName,
          scheduledInnings: match.innings || 7,
          topInningScores: topScores.filter(
            (v): v is number => typeof v === "number"
          ),
          bottomInningScores: bottomScores.filter(
            (v): v is number => typeof v === "number"
          ),
          topTotalRuns: firstScore ?? 0,
          bottomTotalRuns: secondScore ?? 0,
          topTotalHits: typeof topHits === "number" ? topHits : 0,
          bottomTotalHits: typeof bottomHits === "number" ? bottomHits : 0,
          topTotalErrors: typeof topErrors === "number" ? topErrors : 0,
          bottomTotalErrors:
            typeof bottomErrors === "number" ? bottomErrors : 0,
        }}
        isMyTeamTop={match.battingOrder !== "second"}
        hasPersonalStatsData={hasPersonalStatsData}
        isLoadingStats={isStatsLoading}
        isFutureOrScheduled={isFutureOrScheduled}
        isRainout={isRainout}
        isDemoMatch={isDemoCurrentMatch}
        sharedBundle={scorebookBundle}
        onInspectCell={handleInspectScorebookCell}
      />
    );

    // 👥 出場メンバー（予定モードでは最上部・結果モードでは個人成績の下に配置）
    const lineupSection = (
      <section key="section-lineup" className="space-y-2" aria-label="出場メンバー">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground min-w-0">
                <Users className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate">出場メンバー</span>
              </h2>
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              {/* A-3 上帯ダークソリッドキャップ */}
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Users className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="text-xs font-black text-white truncate">
                    出場メンバー・ベンチ・欠席
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black font-mono tabular-nums shrink-0">
                    スタメン {filledStarters.length}名
                  </span>
                </div>
                <Link
                  href={`/liff/matches/lineup?id=${encodeURIComponent(match.id)}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-[11px] font-black transition-all active:scale-95 shrink-0"
                >
                  <Edit3 className="w-3 h-3 text-sky-400" />
                  <span>{filledStarters.length > 0 ? "編集" : "登録"}</span>
                </Link>
              </div>

              <div className="p-3.5 space-y-3.5">
              {/* 自チーム / 相手チーム 切り替え（相手スタメンが存在する場合のみ表示） */}
              {filledOpponentStarters.length > 0 && (
                <div className="grid grid-cols-2 gap-1 bg-muted p-1 rounded-2xl border border-border">
                  <button
                    type="button"
                    onClick={() => setLineupTeamTab("my")}
                    className={cn(
                      "py-1.5 px-2 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1.5 truncate cursor-pointer",
                      lineupTeamTab === "my"
                        ? "bg-card text-foreground shadow-sm border border-border font-black"
                        : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                    )}
                  >
                    <Shield
                      className={cn(
                        "w-3.5 h-3.5 shrink-0",
                        lineupTeamTab === "my" ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    <span className="truncate">{myTeamLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLineupTeamTab("opponent")}
                    className={cn(
                      "py-1.5 px-2 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1.5 truncate cursor-pointer",
                      lineupTeamTab === "opponent"
                        ? "bg-card text-foreground shadow-sm border border-border font-black"
                        : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                    )}
                  >
                    <Users
                      className={cn(
                        "w-3.5 h-3.5 shrink-0",
                        lineupTeamTab === "opponent" ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    <span className="truncate">{match.opponent}</span>
                  </button>
                </div>
              )}

              {lineupTeamTab === "opponent" && filledOpponentStarters.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-0.5">
                    <span className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">{match.opponent} スタメン</span>
                    </span>
                    <span className="text-[10px] font-black font-mono tabular-nums px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/25">
                      {filledOpponentStarters.length}名
                    </span>
                  </div>

                  <div className="rounded-xl border border-border overflow-hidden bg-card">
                    <div className="grid grid-cols-[2.25rem_3.25rem_1fr_2.75rem] items-center bg-muted/50 border-b border-border px-2 py-1 text-[9px] font-black text-muted-foreground font-mono tracking-wider">
                      <span className="text-center">ORD</span>
                      <span className="text-center">POS</span>
                      <span className="pl-2">PLAYER</span>
                      <span className="pr-1 text-right">NO.</span>
                    </div>

                    <div className="divide-y divide-border">
                      {filledOpponentStarters.map((slot) => {
                        const posInfo = getPositionBadgeInfo(slot.position);
                        return (
                          <div
                            key={`opp-${slot.order}-${slot.name}-${slot.uniformNumber}`}
                            className="grid grid-cols-[2.25rem_3.25rem_1fr_2.75rem] items-center px-2 py-1.5 odd:bg-card even:bg-muted/35"
                          >
                            <div className="flex items-center justify-center">
                              <span className="w-6 h-6 rounded-md bg-muted text-foreground font-mono tabular-nums text-[11px] font-black inline-flex items-center justify-center">
                                {slot.order}
                              </span>
                            </div>

                            <div className="flex items-center justify-center">
                              {posInfo ? (
                                <span
                                  className={cn(
                                    "inline-flex items-center justify-center w-11 py-0.5 rounded-md text-white font-black text-[10px] leading-tight shadow-2xs",
                                    posInfo.color
                                  )}
                                >
                                  {posInfo.label}
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-11 py-0.5 rounded-md bg-muted text-muted-foreground font-black text-[10px] leading-tight border border-border">
                                  {slot.position || "-"}
                                </span>
                              )}
                            </div>

                            <span className="pl-2 font-black text-xs sm:text-[13px] text-foreground truncate tracking-tight">
                              {slot.name || `相手打者 ${slot.order}`}
                            </span>

                            <span className="pr-1 text-right font-mono tabular-nums text-xs font-black">
                              {slot.uniformNumber ? (
                                <>
                                  <span className="text-[10px] text-muted-foreground/60 mr-0.5">
                                    #
                                  </span>
                                  <span className="text-foreground/85">{slot.uniformNumber}</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground/40">-</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <>
              {/* ① スターティングメンバー（見出しは内枠の外） */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                    <UserStar className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>スターティングメンバー</span>
                  </span>
                  <span className="text-[10px] font-black font-mono tabular-nums px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/25">
                    {filledStarters.length}名
                  </span>
                </div>

                {filledStarters.length === 0 ? (
                  <div className="rounded-xl bg-muted/35 border border-dashed border-border p-4 text-center space-y-2.5">
                    <div className="space-y-0.5">
                      <p className="text-xs font-black text-foreground">
                        スタメンがまだ登録されていません
                      </p>
                      <p className="text-[11px] font-bold text-muted-foreground">
                        スマホからスターティングメンバー・控え・欠席を設定できます
                      </p>
                    </div>
                    <Link
                      href={`/liff/matches/lineup?id=${match.id}`}
                      className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-2xs hover:bg-primary/90 active:scale-95 transition-all"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>出場メンバーを登録する</span>
                    </Link>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden bg-card">
                    {/* スコアボード風カラムヘッダー */}
                    <div className="grid grid-cols-[2.25rem_3.25rem_1fr_2.75rem] items-center bg-muted/50 border-b border-border px-2 py-1 text-[9px] font-black text-muted-foreground font-mono tracking-wider">
                      <span className="text-center">ORD</span>
                      <span className="text-center">POS</span>
                      <span className="pl-2">PLAYER</span>
                      <span className="pr-1 text-right">NO.</span>
                    </div>

                    <div className="divide-y divide-border">
                      {filledStarters.map((slot) => {
                        const posInfo = getPositionBadgeInfo(slot.position);
                        return (
                          <div
                            key={`${slot.order}-${slot.playerId || slot.name}`}
                            className="grid grid-cols-[2.25rem_3.25rem_1fr_2.75rem] items-center px-2 py-1.5 odd:bg-card even:bg-muted/35"
                          >
                            {/* 打順バッジ */}
                            <div className="flex items-center justify-center">
                              <span className="w-6 h-6 rounded-md bg-primary/10 text-primary font-mono tabular-nums text-[11px] font-black inline-flex items-center justify-center">
                                {slot.order}
                              </span>
                            </div>

                            {/* 守備位置バッジ（固定幅で縦ライン整列） */}
                            <div className="flex items-center justify-center">
                              {posInfo ? (
                                <span
                                  className={cn(
                                    "inline-flex items-center justify-center w-11 py-0.5 rounded-md text-white font-black text-[10px] leading-tight shadow-2xs",
                                    posInfo.color
                                  )}
                                >
                                  {posInfo.label}
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-11 py-0.5 rounded-md bg-muted text-muted-foreground font-black text-[10px] leading-tight border border-border">
                                  未設定
                                </span>
                              )}
                            </div>

                            {/* 選手名 */}
                            <span className="pl-2 font-black text-xs sm:text-[13px] text-foreground truncate tracking-tight">
                              {slot.name}
                            </span>

                            {/* 背番号 */}
                            <span className="pr-1 text-right font-mono tabular-nums text-xs font-black">
                              {slot.uniformNumber ? (
                                <>
                                  <span className="text-[10px] text-muted-foreground/60 mr-0.5">
                                    #
                                  </span>
                                  <span className="text-foreground/85">{slot.uniformNumber}</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground/40">-</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ①-B 途中出場・交代選手 */}
              {mySubstitutions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-0.5">
                    <span className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>途中出場・選手交代</span>
                    </span>
                    <span className="text-[10px] font-black font-mono tabular-nums px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/25">
                      {mySubstitutions.length}名
                    </span>
                  </div>

                  <div className="rounded-xl border border-border overflow-hidden bg-card divide-y divide-border">
                    {mySubstitutions.map((sub) => {
                      const posInfo = getPositionBadgeInfo(sub.position);
                      const roleBadge =
                        sub.position === "P"
                          ? { label: "代打", badgeClass: "bg-primary text-primary-foreground" }
                          : sub.position === "R"
                          ? { label: "代走", badgeClass: "bg-primary/85 text-primary-foreground" }
                          : sub.position === "TR"
                          ? { label: "臨時代走", badgeClass: "bg-primary/75 text-primary-foreground" }
                          : posInfo
                          ? { label: posInfo.label, badgeClass: `${posInfo.color} text-white` }
                          : {
                              label: "途中",
                              badgeClass: "bg-muted text-foreground border border-border",
                            };
                      return (
                        <div
                          key={sub.id}
                          className="grid grid-cols-[4rem_3.5rem_1fr_2.75rem] items-center px-2 py-1.5 odd:bg-card even:bg-muted/35"
                        >
                          <span className="text-[10px] font-black text-muted-foreground font-mono tabular-nums text-center">
                            {sub.inningEntered}回・{sub.battingOrder}番
                          </span>
                          <div className="flex items-center justify-center">
                            <span
                              className={cn(
                                "inline-flex items-center justify-center w-12 py-0.5 rounded-md font-black text-[10px] leading-tight shadow-2xs",
                                roleBadge.badgeClass
                              )}
                            >
                              {roleBadge.label}
                            </span>
                          </div>
                          <span className="pl-2 font-black text-xs sm:text-[13px] text-foreground truncate tracking-tight">
                            {sub.name}
                          </span>
                          <span className="pr-1 text-right font-mono tabular-nums text-xs font-black">
                            {sub.uniformNumber ? (
                              <>
                                <span className="text-[10px] text-muted-foreground/60 mr-0.5">
                                  #
                                </span>
                                <span className="text-foreground/85">
                                  {sub.uniformNumber}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground/40">-</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ② 控え ＆ ③ 欠席（どちらも見出しを内枠の外に統一） */}
              {teamPlayers.length > 0 && (
                <>
                  {/* ② 控え（ベンチ入り） */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>控え（ベンチ入り）</span>
                      </span>
                      <span className="text-[10px] font-black font-mono tabular-nums px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/25">
                        {benchPlayers.length}名
                      </span>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/35 p-2.5">
                      {benchPlayers.length === 0 ? (
                        <p className="text-[11px] font-bold text-muted-foreground px-0.5">
                          該当なし
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {benchPlayers.map((p) => (
                            <span
                              key={p.id}
                              className={cn(
                                "inline-flex items-center gap-1.5 py-1 rounded-lg bg-card border border-border shadow-2xs text-[11px] font-black text-foreground",
                                p.uniformNumber ? "pl-1.5 pr-2.5" : "px-2.5"
                              )}
                            >
                              {p.uniformNumber && (
                                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono tabular-nums text-[10px] font-black leading-none">
                                  #{p.uniformNumber}
                                </span>
                              )}
                              <span>{p.name}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ③ 欠席 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                        <UserMinus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>欠席</span>
                      </span>
                      <span className="text-[10px] font-black font-mono tabular-nums px-2 py-0.5 rounded-md bg-muted/50 text-muted-foreground border border-border">
                        {absentPlayers.length}名
                      </span>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/35 p-2.5">
                      {absentPlayers.length === 0 ? (
                        <p className="text-[11px] font-bold text-muted-foreground px-0.5">
                          欠席者なし
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {absentPlayers.map((p) => (
                            <span
                              key={p.id}
                              className={cn(
                                "inline-flex items-center gap-1.5 py-1 rounded-lg bg-card border border-border text-[11px] font-bold text-muted-foreground",
                                p.uniformNumber ? "pl-1.5 pr-2.5" : "px-2.5"
                              )}
                            >
                              {p.uniformNumber && (
                                <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono tabular-nums text-[10px] font-black leading-none">
                                  #{p.uniformNumber}
                                </span>
                              )}
                              <span>{p.name}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
                </>
              )}
              </div>
            </div>
      </section>
    );

    // 🏟️ 球場・グラウンド（予定モードでは出場メンバー直下・結果モードでは下部参考エリアへ配置）
    const venueSection = (
      <section key="section-venue" className="space-y-2" aria-label="球場・グラウンド">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground min-w-0">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate">球場・グラウンド</span>
              </h2>

              <Link
                href="/liff/grounds"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[11px] font-bold transition-all active:scale-95 shrink-0 shadow-2xs"
              >
                <Building2 className="w-3 h-3 text-muted-foreground" />
                <span>球場一覧</span>
              </Link>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
              {/* A-3 上帯ダークソリッドキャップ (Venue / Map = border-teal-500) */}
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-4 h-4 text-teal-400 shrink-0" />
                  <span className="text-xs font-black text-white truncate">
                    {venueInfo.officialName || "球場・グラウンド"}
                  </span>
                </div>
                {venueInfo.surfaceNote ? (
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black shrink-0">
                    {venueInfo.surfaceNote}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black shrink-0">
                    MAP
                  </span>
                )}
              </div>

              {/* 上部：枠いっぱい（パディングなし）の Google Map */}
              {venueInfo.embedUrl ? (
                <div className="relative w-full h-[300px] sm:h-[380px] bg-muted/35 border-b border-border">
                  <iframe
                    src={venueInfo.embedUrl}
                    title={`${venueInfo.officialName || "球場・グラウンド"} Google Map`}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    className="block w-full h-full border-0"
                  />
                </div>
              ) : (
                <div className="w-full py-7 px-4 bg-muted/35 border-b border-border flex flex-col items-center justify-center text-center gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-card border border-border flex items-center justify-center text-muted-foreground shadow-2xs">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-black text-foreground">
                      地図を表示するURL・球場情報がありません
                    </p>
                    <p className="text-[11px] font-bold text-muted-foreground">
                      「球場一覧」からGoogle Map URLや住所を登録できます
                    </p>
                  </div>
                </div>
              )}

              {/* 下部：2行情報（1行目: 正式名（略称） / 2行目: 住所）＋ 最下部リンクボタン */}
              <div className="p-3.5 space-y-2.5">
                <div className="space-y-1">
                  {/* 1行目: 正式名（略称） */}
                  <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5 leading-tight">
                    <h3 className="text-sm font-black text-foreground leading-tight tracking-tight break-words">
                      {venueInfo.officialName || "球場未設定"}
                      {venueInfo.shortName && venueInfo.shortName !== venueInfo.officialName && (
                        <span className="text-xs font-bold text-muted-foreground">
                          （{venueInfo.shortName}）
                        </span>
                      )}
                    </h3>
                    {venueInfo.surfaceNote && venueInfo.surfaceNote !== venueInfo.shortName && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-black leading-none">
                        {venueInfo.surfaceNote}
                      </span>
                    )}
                  </div>

                  {/* 2行目: 住所 */}
                  <div className="flex items-center gap-1 text-xs font-bold text-muted-foreground leading-snug">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-primary/80" />
                    <span className="break-words">{venueInfo.address || "住所未登録"}</span>
                    {venueInfo.address && (
                      <button
                        type="button"
                        onClick={() => handleCopyVenueAddress(venueInfo.address)}
                        className="p-1 -my-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
                        title="住所をコピー"
                        aria-label="住所をコピー"
                      >
                        {isAddressCopied ? (
                          <Check className="w-3 h-3 text-primary" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* 球場マスタ連動：駐車場制限・スパイク規定・会場注意事項の自動表示 */}
                {(() => {
                  const cleanParking =
                    match.venueParkingInfo &&
                    match.venueParkingInfo.trim() !==
                      "駐車場ルールは管理者にお問い合わせください"
                      ? match.venueParkingInfo.trim()
                      : "";
                  const cleanSpike = (match.venueSpikeRule || "").trim();
                  const cleanVenueNotes = (match.venueNotes || "").trim();
                  if (!cleanParking && !cleanSpike && !cleanVenueNotes) {
                    return null;
                  }

                  if (isPreMatchMode) {
                    return (
                      <div className="pt-2 border-t border-border space-y-1.5 text-xs">
                        {cleanSpike && (
                          <div className="p-2.5 rounded-xl bg-rose-500/[0.08] border border-rose-500/30 border-l-4 border-l-rose-600 flex items-start gap-2">
                            <span className="text-sm leading-none shrink-0 mt-0.5">
                              👟
                            </span>
                            <div className="min-w-0">
                              <span className="text-[10px] font-black text-rose-700 dark:text-rose-300 block">
                                スパイク・用具規定
                              </span>
                              <p className="font-black text-foreground leading-snug break-words">
                                {cleanSpike}
                              </p>
                            </div>
                          </div>
                        )}

                        {cleanParking && (
                          <div className="p-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/30 border-l-4 border-l-amber-500 flex items-start gap-2">
                            <span className="text-sm leading-none shrink-0 mt-0.5">
                              🅿️
                            </span>
                            <div className="min-w-0">
                              <span className="text-[10px] font-black text-amber-800 dark:text-amber-300 block">
                                駐車場・台数制限ルール
                              </span>
                              <p className="font-black text-foreground leading-snug break-words">
                                {cleanParking}
                              </p>
                            </div>
                          </div>
                        )}

                        {cleanVenueNotes && (
                          <div className="p-2.5 rounded-xl bg-muted/60 border border-border flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold text-muted-foreground block">
                                グラウンド利用注意事項
                              </span>
                              <p className="text-[11px] font-bold text-foreground whitespace-pre-line leading-snug break-words">
                                {cleanVenueNotes}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="pt-2 border-t border-border flex flex-wrap gap-1.5 text-[11px]">
                      {cleanSpike && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/25 text-foreground font-bold">
                          <span>👟</span>
                          <span>{cleanSpike}</span>
                        </span>
                      )}
                      {cleanParking && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-foreground font-bold">
                          <span>🅿️</span>
                          <span>{cleanParking}</span>
                        </span>
                      )}
                      {cleanVenueNotes && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted border border-border text-muted-foreground font-bold">
                          <span>⚠️</span>
                          <span>{cleanVenueNotes}</span>
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* 最下部：リンクボタン */}
                {venueInfo.embedUrl ? (
                  <div className="pt-2.5 border-t border-border grid grid-cols-2 gap-2">
                    <a
                      href={venueInfo.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-3 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                    >
                      <Navigation className="w-3.5 h-3.5 shrink-0" />
                      <span>Google Mapで開く</span>
                    </a>
                    <a
                      href={venueInfo.directionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                    >
                      <Compass className="w-3.5 h-3.5 shrink-0 text-primary" />
                      <span>ルート案内</span>
                    </a>
                  </div>
                ) : (
                  <div className="pt-2.5 border-t border-border">
                    <Link
                      href="/liff/grounds"
                      className="w-full h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-2xs hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>球場一覧から登録する</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>
      </section>
    );

    return (
      <div className="flex flex-col flex-1">
        <LiffHeader />

        <div className="p-4 space-y-5">
          {/* ページ内ヘッダー（「試合情報」固定タイトル＋前後切替ピル） */}
          <LiffPageHeader
            title="試合情報"
            icon={
              <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
                <Video className="w-4 h-4" />
              </span>
            }
            showBack
            rightElement={
              prevMatch || nextMatch || matchPosition ? (
                <div
                  role="navigation"
                  aria-label="前後の試合切替"
                  className="inline-flex items-center h-[34px] rounded-2xl bg-card border border-border shadow-xs divide-x divide-border overflow-hidden"
                >
                  {prevMatch ? (
                    <Link
                      href={`/liff/matches?id=${encodeURIComponent(prevMatch.id)}`}
                      replace
                      aria-label={`前の試合: vs ${prevMatch.opponent}`}
                      title={`前の試合: vs ${prevMatch.opponent}`}
                      className="w-7 sm:w-8 h-full flex items-center justify-center text-foreground hover:bg-muted active:bg-muted/80 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="w-7 sm:w-8 h-full flex items-center justify-center text-muted-foreground/30 select-none"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </span>
                  )}

                  {matchPosition && (
                    <span className="px-2 h-full flex items-center justify-center text-[11px] font-black tabular-nums text-muted-foreground select-none whitespace-nowrap bg-muted/35">
                      <span className="text-foreground">{matchPosition.current}</span>
                      <span className="mx-0.5 text-muted-foreground/60">/</span>
                      <span>{matchPosition.total}</span>
                    </span>
                  )}

                  {nextMatch ? (
                    <Link
                      href={`/liff/matches?id=${encodeURIComponent(nextMatch.id)}`}
                      replace
                      aria-label={`次の試合: vs ${nextMatch.opponent}`}
                      title={`次の試合: vs ${nextMatch.opponent}`}
                      className="w-7 sm:w-8 h-full flex items-center justify-center text-foreground hover:bg-muted active:bg-muted/80 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="w-7 sm:w-8 h-full flex items-center justify-center text-muted-foreground/30 select-none"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  )}
                </div>
              ) : undefined
            }
            shareData={{
              title: `vs ${match.opponent} 試合情報 & 出場メンバー`,
              text: shareText,
            }}
          />

          {/* 📋 1. 基本情報・スコアヒーローカード（A-3 上帯ダークキャップ × 純白高コントラストボディ） */}
          <section aria-label="基本情報">
            <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              {/* 上帯ダークソリッドキャップ：バッジ群・日時・大会名 */}
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 space-y-1.5">
                <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1">
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-black leading-tight",
                      matchTypeBadgeClass
                    )}
                  >
                    {matchTypeLabel}
                  </span>

                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-black leading-tight tabular-nums",
                      neutralBadgeClass
                    )}
                  >
                    {inningsBadgeLabel}
                  </span>

                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-black leading-tight",
                      battingOrderBadgeClass
                    )}
                  >
                    {battingOrderLabel}
                  </span>

                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-black leading-tight",
                      benchSideBadgeClass
                    )}
                  >
                    {benchSideLabel}
                  </span>

                  {!isFutureOrScheduled && !isRainout && !isStatsLoading && (
                    hasPersonalStatsData ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-black leading-tight bg-emerald-500 text-slate-950 border-emerald-500">
                        <CheckCircle2 className="w-3 h-3 shrink-0 text-slate-950" />
                        <span>スコア取込済</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-black leading-tight bg-slate-800 text-slate-300 border-slate-700">
                        スコア未取込
                      </span>
                    )
                  )}

                  {formattedDateTime && (
                    <span className="text-[11px] sm:text-xs font-bold tabular-nums text-slate-300 leading-tight shrink-0">
                      {formattedDateTime}
                    </span>
                  )}
                </div>

                {/* 2行目（大会名がある場合のみ表示） */}
                {customTournamentName && (
                  <p className="text-xs sm:text-[13px] font-bold text-slate-200 leading-snug break-words">
                    {customTournamentName}
                  </p>
                )}
              </div>

              {/* 下段ソリッドボディ：vs 相手チーム名 ＋ ＠球場名 ＋ 試合結果スコア / 状態バッジ */}
              <div className="px-4 py-3.5 bg-card flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[15px] sm:text-base font-black text-foreground leading-snug tracking-tight min-w-0">
                  <span className="break-words">vs {match.opponent}</span>
                  {basicVenueLabel && (
                    <span className="text-xs sm:text-sm font-extrabold text-muted-foreground break-words">
                      ＠{basicVenueLabel}
                    </span>
                  )}
                </div>

                {isRainout ? (
                  <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border text-[10px] font-black shrink-0">
                    雨天中止
                  </span>
                ) : !isLive && isFutureOrScheduled ? (
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/25 text-[10px] font-black shrink-0">
                    試合予定
                  </span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0 tabular-nums">
                    <span className="text-lg sm:text-xl font-black text-foreground leading-none">
                      <span className={isWin ? "text-primary" : ""}>{match.myScore}</span>
                      <span className="mx-1 text-muted-foreground text-sm">-</span>
                      <span>{match.opponentScore}</span>
                    </span>
                    {isLive ? (
                      <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black">
                        LIVE
                      </span>
                    ) : isWin ? (
                      <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-black">
                        WIN
                      </span>
                    ) : isLose ? (
                      <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black">
                        LOSE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-zinc-500 text-white text-[10px] font-black">
                        DRAW
                      </span>
                    )}
                  </div>
                )}
              </div>

              {!isRainout && (
                <div className="px-4 py-2 bg-muted/50 border-t border-border flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-muted-foreground truncate">
                    1打席ごとのLINE試合速報テキスト作成・共有
                  </span>
                  <Link
                    href={`/liff/tools/news-generator?matchId=${encodeURIComponent(match.id)}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card border border-border hover:border-primary/40 text-xs font-black text-primary shrink-0 transition-all active:scale-95 shadow-2xs"
                  >
                    <Megaphone className="w-3.5 h-3.5" />
                    <span>速報ジェネレータv2</span>
                  </Link>
                </div>
              )}
            </div>
          </section>

          {isPreMatchMode ? (
            <>
              {/* 🗓️ 試合前・雨天中止モード：
                  当日のしおり＆役割担当（前日LINE連絡文生成） → 遠征・配車サマリー → 出場メンバー → 球場・施設ルール → 事前動画(設定時のみ) */}
              <MatchDayGuideAndRolesSection
                key="ops-guide-pre"
                ops={match.matchDayOps}
                scheduleSync={opsScheduleSync}
                myIdentity={opsMyIdentity}
                isPreMatchMode={true}
                hasSeparateCarpoolCard={hasSeparateCarpoolCard}
                preMatchShareText={preMatchShareText}
                onOpenEditor={handleOpenOpsEditor}
              />
              <MatchCarpoolSummarySection
                key="ops-carpool-pre"
                ops={match.matchDayOps}
                scheduleSync={opsScheduleSync}
                myIdentity={opsMyIdentity}
                venueParkingInfo={match.venueParkingInfo}
                onOpenEditor={handleOpenOpsEditor}
              />
              {lineupSection}
              {venueSection}
              {videoSection}
            </>
          ) : (
            <>
              {/* 🏆 試合中・試合後モード（案A ＋ パターン2）：
                  スコアボード → 注目選手 → 試合映像(設定時のみ) → スコアブック清書シート → タイムライン(1マス解説) → 個人成績 → 出場メンバー → 協力スタッフ記録(登録時のみ) → 球場 */}
              {scoreboardSection}
              <MatchStatsSection
                key="stats-heroes"
                {...sharedStatsProps}
                displayPart="heroes"
              />
              {videoSection}
              {scorebookSection}
              <MatchStatsSection
                key="stats-timeline"
                {...sharedStatsProps}
                displayPart="timeline"
              />
              <MatchStatsSection
                key="stats-tables"
                {...sharedStatsProps}
                displayPart="tables"
              />
              {lineupSection}
              <MatchDayGuideAndRolesSection
                key="ops-guide-archive"
                ops={match.matchDayOps}
                scheduleSync={opsScheduleSync}
                myIdentity={opsMyIdentity}
                isPreMatchMode={false}
                hasSeparateCarpoolCard={false}
                preMatchShareText={preMatchShareText}
                onOpenEditor={handleOpenOpsEditor}
              />
              {venueSection}
            </>
          )}

          {/* ↔️ 5. 前後の試合ナビゲーション */}
          {(prevMatch || nextMatch) && (
            <nav
              aria-label="前後の試合への移動"
              className="grid grid-cols-2 gap-2.5 pt-2 border-t border-border"
            >
              {prevMatch ? (
                <Link
                  href={`/liff/matches?id=${encodeURIComponent(prevMatch.id)}`}
                  replace
                  className="group flex items-center gap-2 rounded-2xl border border-border bg-card hover:border-primary/40 hover:bg-muted/35 px-3 py-2.5 shadow-xs active:scale-[0.98] transition-all min-w-0"
                >
                  <span className="w-7 h-7 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:-translate-x-0.5 transition-all shrink-0">
                    <ChevronLeft className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-[10px] font-black text-muted-foreground leading-none mb-1">
                      前の試合
                    </p>
                    <p className="text-xs font-black text-foreground truncate leading-tight">
                      vs {prevMatch.opponent}
                    </p>
                    {prevMatch.date && (
                      <p className="text-[10px] font-bold tabular-nums text-muted-foreground truncate leading-tight mt-0.5">
                        {formatAdjacentMatchDate(prevMatch.date)}
                      </p>
                    )}
                  </div>
                </Link>
              ) : (
                <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 px-3 py-2.5 opacity-55 select-none">
                  <span className="w-7 h-7 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground/40 shrink-0">
                    <ChevronLeft className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-[10px] font-bold text-muted-foreground leading-tight">
                      前の試合なし
                    </p>
                  </div>
                </div>
              )}

              {nextMatch ? (
                <Link
                  href={`/liff/matches?id=${encodeURIComponent(nextMatch.id)}`}
                  replace
                  className="group flex items-center justify-end gap-2 rounded-2xl border border-border bg-card hover:border-primary/40 hover:bg-muted/35 px-3 py-2.5 shadow-xs active:scale-[0.98] transition-all min-w-0"
                >
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-[10px] font-black text-muted-foreground leading-none mb-1">
                      次の試合
                    </p>
                    <p className="text-xs font-black text-foreground truncate leading-tight">
                      vs {nextMatch.opponent}
                    </p>
                    {nextMatch.date && (
                      <p className="text-[10px] font-bold tabular-nums text-muted-foreground truncate leading-tight mt-0.5">
                        {formatAdjacentMatchDate(nextMatch.date)}
                      </p>
                    )}
                  </div>
                  <span className="w-7 h-7 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </Link>
              ) : (
                <div className="flex items-center justify-end gap-2 rounded-2xl border border-dashed border-border bg-muted/40 px-3 py-2.5 opacity-55 select-none">
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-[10px] font-bold text-muted-foreground leading-tight">
                      次の試合なし
                    </p>
                  </div>
                  <span className="w-7 h-7 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground/40 shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              )}
            </nav>
          )}

          {/* ⚙️ 6. ページ最下部：折りたたみ式の「試合データの修正・削除」まとめエリア */}
          <section
            aria-label="試合データの修正・削除"
            className="pt-1"
          >
            <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <button
                type="button"
                aria-expanded={isManageMenuOpen}
                onClick={() => setIsManageMenuOpen((prev) => !prev)}
                className="w-full bg-[#0f172a] hover:bg-slate-900 text-slate-50 border-b-[3px] border-slate-500 px-4 py-3 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 shrink-0">
                    <Settings className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-white leading-snug">
                      試合データの修正・設定・削除
                    </p>
                    <p className="text-[10px] font-bold text-slate-300 truncate mt-0.5">
                      基本情報・打席結果・スタメンの修正、記号設定、試合削除
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isFutureOrScheduled && !isRainout && !isStatsLoading && (
                    hasPersonalStatsData ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black bg-emerald-500 text-slate-950 border-emerald-500">
                        <CheckCircle2 className="w-3 h-3 shrink-0 text-slate-950" />
                        <span>取込済</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black bg-slate-800 text-slate-200 border-slate-700">
                        未取込
                      </span>
                    )
                  )}
                  <span className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200">
                    {isManageMenuOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </div>
              </button>

              {isManageMenuOpen && (
                <div className="bg-muted/35 p-3.5 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                  {/* 登録・修正アクション一覧 */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-muted-foreground px-0.5">
                      データの登録・修正
                    </p>

                    <Link
                      href={`/liff/matches/edit?id=${encodeURIComponent(match.id)}`}
                      className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-card hover:border-primary/40 hover:bg-muted/50 border border-border shadow-2xs active:scale-[0.99] transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary border border-primary/25 flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-foreground leading-snug">
                            試合の基本情報を編集
                          </p>
                          <p className="text-[10px] font-bold text-muted-foreground leading-snug mt-0.5">
                            対戦相手・日時・球場・試合種別・大会名・攻守・動画URL・得点を変更
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleOpenOpsEditor("guide")}
                      className="w-full flex items-center justify-between gap-2.5 p-3 rounded-xl bg-card hover:border-primary/40 hover:bg-muted/50 border border-border shadow-2xs active:scale-[0.99] transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                          <ClipboardList className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-foreground leading-snug">
                            当日のしおり・審判/スコア担当・配車メモを編集
                          </p>
                          <p className="text-[10px] font-bold text-muted-foreground leading-snug mt-0.5">
                            審判・スコアラー・BSO・LINE速報・ブザー・動画撮影担当、集合・弁当・道具車を設定
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>

                    {!isRainout && hasPersonalStatsData && !isDemo && !isDemoMatchId(match.id) && (
                      <Link
                        href={`/liff/tools/scorebook-import?matchId=${encodeURIComponent(
                          match.id
                        )}&mode=edit`}
                        className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-card hover:border-primary/40 hover:bg-primary/5 border border-primary/25 shadow-2xs active:scale-[0.99] transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                            <Edit3 className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-foreground leading-snug">
                              打席結果・選手交代・個人成績を修正
                            </p>
                            <p className="text-[10px] font-bold text-muted-foreground leading-snug mt-0.5">
                              保存済みの1球履歴・走者進塁・途中交代・継投を再編集
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-primary shrink-0" />
                      </Link>
                    )}

                    <Link
                      href={`/liff/matches/lineup?id=${encodeURIComponent(match.id)}`}
                      className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-card hover:border-primary/40 hover:bg-muted/50 border border-border shadow-2xs active:scale-[0.99] transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary border border-primary/25 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-foreground leading-snug">
                            {filledStarters.length > 0
                              ? "スタメン・出欠メンバーを編集"
                              : "スタメン・出欠メンバーを登録"}
                          </p>
                          <p className="text-[10px] font-bold text-muted-foreground leading-snug mt-0.5">
                            スターティングメンバー・控え・欠席者を変更
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </Link>

                    {!isRainout && !isDemo && !isDemoMatchId(match.id) && (
                      <Link
                        href={`/liff/tools/scorebook-import?matchId=${encodeURIComponent(
                          match.id
                        )}`}
                        className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-card hover:border-primary/40 hover:bg-muted/50 border border-border shadow-2xs active:scale-[0.99] transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary border border-primary/25 flex items-center justify-center shrink-0">
                            <ScanLine className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-foreground leading-snug">
                              {hasPersonalStatsData
                                ? "紙スコアブック画像から再取り込み"
                                : "紙スコアブックをAIで取り込む"}
                            </p>
                            <p className="text-[10px] font-bold text-muted-foreground leading-snug mt-0.5">
                              {hasPersonalStatsData
                                ? "新しく撮影したスコアシート画像で上書き取り込み"
                                : "スコアブック写真から打席・個人成績を一括登録"}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </Link>
                    )}

                    <Link
                      href="/liff/settings/score#symbol-rules"
                      className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-card hover:border-primary/40 hover:bg-muted/50 border border-border shadow-2xs active:scale-[0.99] transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary border border-primary/25 flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-foreground leading-snug">
                            スコアブック記号・マス目の設定
                          </p>
                          <p className="text-[10px] font-bold text-muted-foreground leading-snug mt-0.5">
                            清書シートのマス目・アウト・空振り(×)・牽制記号などを変更
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </Link>
                  </div>

                  {/* 削除アクション */}
                  <div className="pt-2.5 border-t border-border space-y-2.5">
                    <p className="text-[10px] font-black text-rose-700 dark:text-rose-400 px-0.5">
                      データの削除
                    </p>

                    {!isDemo && !isDemoMatchId(match.id) && (
                      hasPersonalStatsData ? (
                        <button
                          type="button"
                          onClick={() => setShowDeleteStatsModal(true)}
                          className="w-full flex items-center justify-between gap-2.5 p-3 rounded-xl bg-card hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-300 dark:border-rose-800 shadow-2xs active:scale-[0.99] transition-all text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                              <Trash2 className="w-4 h-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-rose-700 dark:text-rose-300 leading-snug">
                                この試合の個人データを削除
                              </p>
                              <p className="text-[10px] font-bold text-muted-foreground leading-snug mt-0.5">
                                試合日程・スコア・動画は残し、打席・個人成績のみ削除
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-rose-500 shrink-0" />
                        </button>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border bg-card px-3 py-2.5 flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                          <Trash2 className="w-3.5 h-3.5 shrink-0 opacity-60" />
                          <span>現在この試合に削除対象の個人データはありません</span>
                        </div>
                      )
                    )}

                    {/* 試合データ自体＋全関連データの完全削除 */}
                    <button
                      type="button"
                      onClick={() => setShowDeleteMatchModal(true)}
                      className="w-full flex items-center justify-between gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950/70 border-2 border-rose-500 shadow-2xs active:scale-[0.99] transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-rose-700 dark:text-rose-300 leading-snug">
                            この試合データ自体を削除
                          </p>
                          <p className="text-[10px] font-bold text-foreground/80 leading-snug mt-0.5">
                            試合予定/結果・スコア・スタメン・打席成績・役割メモなど関連データもすべて完全消去
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <DeletePersonalStatsModal
            isOpen={showDeleteStatsModal}
            matchId={match.id}
            opponentName={match.opponent}
            matchDateText={formattedDateTime || match.date}
            scoreSummaryText={
              isFutureOrScheduled ? undefined : `${match.myScore}-${match.opponentScore}`
            }
            isDeleting={isDeletingPersonalStats}
            onCancel={() => setShowDeleteStatsModal(false)}
            onConfirm={(options) => void handleDeletePersonalStats(options)}
          />

          <DeleteMatchModal
            isOpen={showDeleteMatchModal}
            matchId={match.id}
            opponentName={match.opponent}
            matchDateText={formattedDateTime || match.date}
            scoreSummaryText={
              isFutureOrScheduled ? undefined : `${match.myScore}-${match.opponentScore}`
            }
            hasPersonalStatsData={hasPersonalStatsData && !isDemo && !isDemoMatchId(match.id)}
            isDeleting={isDeletingMatch}
            onCancel={() => setShowDeleteMatchModal(false)}
            onConfirm={() => void handleDeleteMatch()}
          />

          <ScorebookCellGuideModal
            activeItem={inspectedCellModalState?.activeItem ?? null}
            navigationItems={inspectedCellModalState?.navigationItems ?? []}
            rules={scorebookBundle.effectiveRules}
            onSelectItem={handleSelectInspectedCell}
            onClose={handleCloseInspectedCell}
          />

          <MatchDayOpsEditorModal
            isOpen={opsEditorState.isOpen}
            initialTab={opsEditorState.initialTab}
            matchId={match.id}
            opponentName={match.opponent}
            ops={match.matchDayOps}
            adultMembers={opsAdultMembers}
            scheduleSync={opsScheduleSync}
            venueParkingInfo={match.venueParkingInfo}
            isSaving={isSavingMatchOps}
            onClose={handleCloseOpsEditor}
            onSave={handleSaveMatchDayOps}
          />

          <div className="h-8 w-full shrink-0" aria-hidden="true" />
        </div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🅱️ 試合一覧画面 (matchId がない場合)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const isFinishedForScorebookCheck = (m: MatchCardData): boolean => {
    if (m.status === "rainout" || m.status === "scheduled") return false;
    const parsed = parseSafeMatchDate(m.date);
    if (parsed && parsed.getTime() > Date.now() && m.status !== "finished") {
      return false;
    }
    return true;
  };

  const importedMatchesCount = matchesList.filter((m) => Boolean(m.hasScorebook)).length;
  const unimportedMatchesCount = matchesList.filter(
    (m) => isFinishedForScorebookCheck(m) && !m.hasScorebook
  ).length;

  const filteredMatches = matchesList.filter((m) => {
    if (filter === "scheduled" && !(m.status === "scheduled" || m.status === "live")) {
      return false;
    }
    if (filter === "video" && !extractYouTubeVideoId(m.youtubeUrl)) {
      return false;
    }
    if (filter === "official" && !(m.matchType === "official" || m.matchType === "tournament")) {
      return false;
    }
    if (scorebookFilter === "imported") {
      return Boolean(m.hasScorebook);
    }
    if (scorebookFilter === "unimported") {
      return isFinishedForScorebookCheck(m) && !m.hasScorebook;
    }
    return true;
  });

  const scheduledMatchesCount = matchesList.filter(
    (m) => m.status === "scheduled" || m.status === "live"
  ).length;
  const videoMatchesCount = matchesList.filter((m) => !!extractYouTubeVideoId(m.youtubeUrl)).length;

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="試合情報 & ハイライト"
          subtitle="スコア速報・スタメン登録・ハイライト動画"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <Video className="w-4 h-4" />
            </span>
          }
          showBack
          rightElement={
            <Link
              href="/liff/matches/lineup"
              className="px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all shadow-2xs"
            >
              <Users className="w-3.5 h-3.5" />
              <span>スタメン登録</span>
            </Link>
          }
          shareData={{
            title: `【試合情報】${scoreTeamName} 試合一覧`,
            text: `試合ハイライト動画・スコアボードはこちらから確認できます！`,
          }}
        />

        {/* 🔒 動画取り扱い・プライバシーに関する重要なお知らせ */}
        <div className="p-3.5 rounded-2xl border border-border border-l-4 border-l-[#FF0000] bg-card space-y-1.5 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-black text-foreground">
            <ShieldAlert className="w-4 h-4 shrink-0 text-[#FF0000]" />
            <span>【重要】試合動画・写真の取り扱いについて</span>
          </div>
          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed pl-6">
            本アプリ内で配信している試合動画は、選手・チーム関係者のプライバシー保護のため<strong className="text-foreground">YouTubeの限定公開（リンクを知っている方のみ閲覧可能）</strong>としています。
            URLや映像をむやみにSNS（X、Instagram、TikTok、YouTube等）へ転載・拡散しないよう、お取り扱いには十分ご配慮をお願いいたします。
          </p>
        </div>

        {/* フィルタータブ */}
        <div className="grid grid-cols-4 gap-1 bg-muted p-1 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "py-1.5 px-1 rounded-xl text-[11px] transition-all truncate cursor-pointer tabular-nums",
              filter === "all"
                ? "bg-card text-foreground shadow-sm border border-border font-black"
                : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
            )}
          >
            すべて <span className={filter === "all" ? "text-primary" : ""}>({matchesList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("scheduled")}
            className={cn(
              "py-1.5 px-1 rounded-xl text-[11px] transition-all truncate cursor-pointer tabular-nums",
              filter === "scheduled"
                ? "bg-card text-foreground shadow-sm border border-border font-black"
                : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
            )}
          >
            ⚾ 予定 <span className={filter === "scheduled" ? "text-primary" : ""}>({scheduledMatchesCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("video")}
            className={cn(
              "py-1.5 px-1 rounded-xl text-[11px] transition-all truncate cursor-pointer tabular-nums",
              filter === "video"
                ? "bg-card text-foreground shadow-sm border border-border font-black"
                : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
            )}
          >
            <Play className="w-3 h-3 inline mr-0.5 -mt-0.5 text-[#FF0000] fill-[#FF0000]" /> 動画{" "}
            <span className={filter === "video" ? "text-[#FF0000]" : ""}>({videoMatchesCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("official")}
            className={cn(
              "py-1.5 px-1 rounded-xl text-[11px] transition-all truncate cursor-pointer",
              filter === "official"
                ? "bg-card text-foreground shadow-sm border border-border font-black"
                : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
            )}
          >
            <span className={filter === "official" ? "text-primary" : ""}>🏆</span> 公式戦
          </button>
        </div>

        {/* スコアブック取込状況での絞り込みバー */}
        <div className="flex items-center justify-between gap-2 px-1 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] font-black text-muted-foreground">
            <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>スコアブック取込状況</span>
          </span>

          <div className="inline-flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setScorebookFilter("all")}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] transition-all cursor-pointer tabular-nums",
                scorebookFilter === "all"
                  ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                  : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
              )}
            >
              すべて
            </button>
            <button
              type="button"
              onClick={() => setScorebookFilter("imported")}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] transition-all cursor-pointer tabular-nums inline-flex items-center gap-1",
                scorebookFilter === "imported"
                  ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                  : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
              )}
            >
              <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>取込済 ({importedMatchesCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setScorebookFilter("unimported")}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] transition-all cursor-pointer tabular-nums",
                scorebookFilter === "unimported"
                  ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                  : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
              )}
            >
              未取込 ({unimportedMatchesCount})
            </button>
          </div>
        </div>

        {/* 試合カード一覧 */}
        {isListLoading ? (
          <div className="space-y-3.5">
            {[1, 2].map((i) => (
              <MatchScoreCardSkeleton key={i} hasVideo={true} />
            ))}
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="py-8 space-y-4">
            <EmptyState
              icon={Shield}
              title="試合データがありません"
              description="該当する試合がまだ登録されていないか、フィルター条件に一致しません"
            />
            <div className="flex justify-center">
              <Link
                href="/liff/matches/lineup"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-black shadow-xs hover:bg-primary/90 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>試合予定を作成してスタメンを登録する</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredMatches.map((m) => (
              <MatchScoreCard
                key={m.id}
                match={m}
                teamName={scoreTeamName}
              />
            ))}
          </div>
        )}

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}

export default function LiffMatchesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1">
          <LiffHeader />
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-bold">読み込み中...</p>
          </div>
        </div>
      }
    >
      <MatchesContent />
    </Suspense>
  );
}
