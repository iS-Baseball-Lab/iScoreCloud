// filepath: src/app/liff/matches/lineup/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { LiffSelect } from "@/components/liff/LiffSelect";
import { UnifiedLineupBenchEditor } from "@/components/liff/UnifiedLineupBenchEditor";
import {
  EXPLICIT_DEMO_STORAGE_KEY,
  useLiff,
  useLiffPermissions,
  usePracticeMatchLabel,
} from "@/components/liff/LiffProvider";
import { buildLiffHubUrl, invalidateLiffApiCache } from "@/lib/liff/api-cache";
import { loadLiffScoreSettings } from "@/lib/liff/score-settings";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  Loader2,
  Shield,
  Calendar,
  MapPin,
  Plus,
  ArrowLeftRight,
  Lock,
  X,
  Trophy,
  Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/match";
import type { MatchCardData } from "@/components/liff/MatchScoreCard";
import {
  loadDemoPlayerConditionOverrides,
  normalizePlayerConditionStatus,
} from "@/lib/liff/player-condition";
import {
  DEMO_LINEUP_PLAYERS,
  DEMO_MATCH_MAP,
  getDemoMatchById,
  getHydratedDemoMatchCards,
  saveCustomDemoMatch,
  isDemoMatchId,
  isDemoTeamId,
  parseSafeMatchDate,
  toMatchCalendarKey,
  loadDemoMatchLineups,
  saveDemoMatchLineups,
  formatLineupShareText,
  isPlayerJoinedAfterMatch,
  resolveLineupPlayerConditionForMatch,
  resolvePlayerMatchAttendanceStatus,
  type LineupPlayer,
  type MyLineupSlot,
  type OpponentLineupSlot,
  type OpponentBenchPlayer,
  type PlayerMatchAttendanceMap,
  type MatchRosterFilterContext,
  type MatchLineupsPayload,
  type LineupTemplateItem,
} from "@/lib/liff/demo-lineup";
import { resolvePitchLimitSpec } from "@/lib/liff/pitch-workload";
import {
  mergeSavedMatchLineupIntoDoc,
  sanitizeLiveReportDocument,
  splitLoadedMyLineupSlots,
} from "@/lib/liff/live-report-v2";

// ━━━ APIレスポンス型定義 (any排除) ━━━
interface LiffMatchesApiResponse {
  success?: boolean;
  isDemo?: boolean;
  matches?: MatchCardData[];
}

interface MatchDetailApiResponse {
  success?: boolean;
  match?: Match & { teamId?: string };
  error?: string;
}

interface MatchLineupsApiResponse {
  success?: boolean;
  lineups?: {
    myLineup?: MyLineupSlot[];
    opponentLineup?: OpponentLineupSlot[];
    opponentBench?: OpponentBenchPlayer[];
    myAttendance?: PlayerMatchAttendanceMap;
    matchCreatedAt?: number | null;
  };
  error?: string;
}

interface AttendanceEventRecord {
  id: string;
  startAt: string | number | Date;
}

interface AttendanceItemRecord {
  eventId: string;
  playerId: string | null;
  status: string;
}

interface TeamAttendanceApiResponse {
  success?: boolean;
  data?: {
    events?: AttendanceEventRecord[];
    attendances?: AttendanceItemRecord[];
  };
}

interface CreateMatchApiResponse {
  success: boolean;
  matchId?: string;
  error?: string;
}

interface LineupTournamentOption {
  id: string;
  name: string;
  season?: string;
  category?: string;
  timeLimit?: string | null;
  coldGameRule?: string | null;
  tiebreakerRule?: string | null;
  pitchLimitRule?: string | null;
  bracketUrl?: string | null;
}

interface LineupTournamentsApiResponse {
  success?: boolean;
  tournaments?: LineupTournamentOption[];
}

function createEmptyMyLineup(count = 9): MyLineupSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    order: i + 1,
    position: "",
    playerId: "",
    name: "",
    uniformNumber: "",
  }));
}

function createEmptyOpponentLineup(count = 9): OpponentLineupSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    order: i + 1,
    position: "",
    name: "",
    uniformNumber: "",
  }));
}

function isSameCalendarDay(dateStr1: string, dateVal2: string | number | Date): boolean {
  try {
    const d1 = parseSafeMatchDate(dateStr1);
    let d2: Date | null = null;
    if (typeof dateVal2 === "number") {
      d2 = dateVal2 < 10000000000 ? new Date(dateVal2 * 1000) : new Date(dateVal2);
    } else if (typeof dateVal2 === "string") {
      d2 = parseSafeMatchDate(dateVal2) || new Date(dateVal2);
    } else {
      d2 = new Date(dateVal2);
    }
    if (!d1 || !d2 || isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  } catch {
    return false;
  }
}

function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function filterLineupCandidatePlayers(
  rawPlayers: LineupPlayer[],
  applyDemoOverrides: boolean,
  matchDate?: string | null
): LineupPlayer[] {
  const overrides = applyDemoOverrides ? loadDemoPlayerConditionOverrides() : {};
  return (Array.isArray(rawPlayers) ? rawPlayers : [])
    .map((p) => {
      const ov = overrides[p.id];
      const mergedPeriods = ov ? ov.conditionPeriods : p.conditionPeriods;
      const fallbackCond = ov ? ov.conditionStatus : p.conditionStatus;
      const fallbackNote = ov ? ov.conditionNote : p.conditionNote ?? null;
      const eff = resolveLineupPlayerConditionForMatch(
        {
          conditionStatus: fallbackCond,
          conditionNote: fallbackNote,
          conditionPeriods: mergedPeriods,
        },
        matchDate
      );
      return {
        ...p,
        conditionPeriods: mergedPeriods,
        activeConditionPeriod: eff.period,
        conditionStatus: eff.status,
        conditionNote:
          eff.status !== "active" ? eff.note ?? fallbackNote : null,
      };
    })
    .filter(
      (p) =>
        p.isActive !== false &&
        p.isActive !== 0 &&
        normalizePlayerConditionStatus(p.conditionStatus) !== "on_leave"
    );
}

function LiffLineupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlMatchId = searchParams.get("id");
  const urlTeamId = searchParams.get("teamId");
  const { currentTeam, profile, isLoadingTeam, isDemo } = useLiff();
  const { canMutate, canUsePaidAi } = useLiffPermissions();
  const practiceMatchLabel = usePracticeMatchLabel();

  const preferredTeamId = useMemo(() => {
    if (urlTeamId && urlTeamId !== "undefined" && urlTeamId !== "null") {
      return urlTeamId;
    }
    if (currentTeam?.id) {
      return currentTeam.id;
    }
    if (typeof window !== "undefined") {
      const storedId = localStorage.getItem("iscore_selectedTeamId");
      const explicitDemo = localStorage.getItem(EXPLICIT_DEMO_STORAGE_KEY) === "1";
      if (storedId && (storedId !== "demo-team" || explicitDemo)) {
        return storedId;
      }
    }
    return "";
  }, [urlTeamId, currentTeam?.id]);

  const [resolvedTeamId, setResolvedTeamId] = useState<string>(preferredTeamId);
  const prevCurrentTeamIdRef = useRef<string | undefined>(currentTeam?.id);

  // 試合選択・一覧ステート
  const [matchesList, setMatchesList] = useState<MatchCardData[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(urlMatchId || "");
  const [currentMatch, setCurrentMatch] = useState<(Match & { teamId?: string }) | null>(null);
  const [isMatchPickerOpen, setIsMatchPickerOpen] = useState(false);

  // 新規試合作成モーダルステート
  const [isCreateMatchModalOpen, setIsCreateMatchModalOpen] = useState(false);
  const [newOpponent, setNewOpponent] = useState("");
  const [newDate, setNewDate] = useState(getTodayIsoDate);
  const [newTime, setNewTime] = useState("09:00");
  const [newMatchType, setNewMatchType] = useState<"practice" | "official" | "exchange">("practice");
  const [newTournamentId, setNewTournamentId] = useState<string>("");
  const [newTournamentName, setNewTournamentName] = useState("");
  const [availableTournaments, setAvailableTournaments] = useState<LineupTournamentOption[]>([]);
  const [newBattingOrder, setNewBattingOrder] = useState<"first" | "second">("first");
  const [newInnings, setNewInnings] = useState<5 | 6 | 7 | 9>(() => {
    const d = loadLiffScoreSettings().defaultInnings;
    return d === 5 || d === 6 || d === 9 ? d : 7;
  });
  const [newVenue, setNewVenue] = useState("");
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);

  // スタメン・控え・欠席ステート（UnifiedLineupBenchEditor と双方向共有）
  const [teamPlayers, setTeamPlayers] = useState<LineupPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [templates, setTemplates] = useState<LineupTemplateItem[]>([]);

  const [attendance, setAttendance] = useState<PlayerMatchAttendanceMap>({});
  const [originalAbsents, setOriginalAbsents] = useState<string[]>([]);

  const [myLineup, setMyLineup] = useState<MyLineupSlot[]>(() => createEmptyMyLineup(9));
  const [dhStarterPitcher, setDhStarterPitcher] = useState<MyLineupSlot | null>(null);
  const [opponentLineup, setOpponentLineup] = useState<OpponentLineupSlot[]>(() => createEmptyOpponentLineup(9));
  const [opponentBench, setOpponentBench] = useState<OpponentBenchPlayer[]>([]);

  // 初回アクセス等でまだ teamId が未確定の場合は /api/liff/hub から承認済みチームID（または demo-team）を解決
  useEffect(() => {
    if (preferredTeamId) {
      setResolvedTeamId(preferredTeamId);
      return;
    }

    let cancelled = false;
    async function resolveInitialTeam() {
      try {
        const res = await fetch(
          buildLiffHubUrl({
            userId: profile?.userId,
            userName: profile?.displayName,
          }),
          { cache: "no-store" }
        );
        if (res.ok) {
          const data = (await res.json()) as { team?: { id?: string | null } };
          if (!cancelled) {
            setResolvedTeamId(data.team?.id || "demo-team");
          }
          return;
        }
      } catch { }
      if (!cancelled) {
        setResolvedTeamId("demo-team");
      }
    }

    resolveInitialTeam();
    return () => {
      cancelled = true;
    };
  }, [preferredTeamId, profile?.userId, profile?.displayName]);

  // ヘッダーのチームスイッチャーで別チームに切り替えられた場合は対象試合をリセット
  useEffect(() => {
    const prevId = prevCurrentTeamIdRef.current;
    const nextId = currentTeam?.id;
    prevCurrentTeamIdRef.current = nextId;

    if (prevId && nextId && prevId !== nextId) {
      setResolvedTeamId(nextId);
      setSelectedMatchId("");
      setCurrentMatch(null);
      if (urlMatchId) {
        router.replace("/liff/matches/lineup");
      }
    }
  }, [currentTeam?.id, urlMatchId, router]);

  // URLの ?id= が変化したら同期
  useEffect(() => {
    if (urlMatchId) {
      setSelectedMatchId(urlMatchId);
    }
  }, [urlMatchId]);

  // 🛡️ オーバーレイの自動リセット（試合切り替え・チーム切り替え時）
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIsCreateMatchModalOpen(false);
    setIsMatchPickerOpen(false);
  }, [selectedMatchId, resolvedTeamId]);

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsCreateMatchModalOpen(false);
        setIsMatchPickerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 1. チームの試合一覧をロードし、URL未指定（または別チームの試合が残っている場合）なら最適な試合を自動選択
  const loadMatchesList = useCallback(async () => {
    if (!resolvedTeamId) return;
    if (isLoadingTeam && !currentTeam?.id && !urlTeamId) return;

    const applyMatchList = (list: MatchCardData[]) => {
      setMatchesList(list);
      if (!urlMatchId) {
        const currentStillValid = Boolean(
          selectedMatchId && list.some((m) => m.id === selectedMatchId)
        );
        if (!currentStillValid) {
          if (list.length > 0) {
            const upcoming = list
              .filter((m) => m.status === "scheduled" || m.status === "live")
              .sort((a, b) => a.date.localeCompare(b.date));
            const initialTarget = upcoming[0] || list[0];
            if (initialTarget) {
              setSelectedMatchId(initialTarget.id);
            }
          } else {
            setSelectedMatchId("");
            setCurrentMatch(null);
            setIsLoading(false);
          }
        }
      }
    };

    try {
      if (isDemoTeamId(resolvedTeamId)) {
        try {
          const res = await fetch("/api/liff/matches?teamId=demo-team", { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json()) as LiffMatchesApiResponse;
            applyMatchList(
              getHydratedDemoMatchCards(Array.isArray(data.matches) ? data.matches : undefined)
            );
            return;
          }
        } catch { }
        applyMatchList(getHydratedDemoMatchCards());
        return;
      }

      const res = await fetch(
        `/api/liff/matches?teamId=${encodeURIComponent(resolvedTeamId)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = (await res.json()) as LiffMatchesApiResponse;
        const list = Array.isArray(data.matches) ? data.matches : [];
        applyMatchList(list);
      } else if (!urlMatchId) {
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Failed to load matches list:", error);
      if (isDemo || isDemoTeamId(resolvedTeamId)) {
        applyMatchList(getHydratedDemoMatchCards());
      } else if (!urlMatchId) {
        setIsLoading(false);
      }
    }
  }, [resolvedTeamId, isLoadingTeam, currentTeam?.id, urlTeamId, urlMatchId, selectedMatchId, isDemo]);

  useEffect(() => {
    loadMatchesList();
  }, [loadMatchesList]);

  // 2. 選択された試合の選手・スタメン・テンプレート・当日出欠のロード
  const loadSquadAndLineup = useCallback(async () => {
    const uid =
      profile?.userId ||
      (typeof window !== "undefined"
        ? localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || ""
        : "");
    const uName =
      profile?.displayName ||
      (typeof window !== "undefined" ? localStorage.getItem("iscore_user_name") || "" : "");
    const authQuery = new URLSearchParams();
    if (uid) authQuery.set("userId", uid);
    if (uName) authQuery.set("userName", uName);
    const authSuffix = authQuery.toString() ? `?${authQuery.toString()}` : "";

    if (!selectedMatchId) {
      if (!resolvedTeamId) return;
      // 試合未選択でも選手一覧だけはロードしておく（休部中は自動除外）
      if (isDemoTeamId(resolvedTeamId)) {
        setTeamPlayers(filterLineupCandidatePlayers(DEMO_LINEUP_PLAYERS, true));
      } else {
        try {
          const playersRes = await fetch(
            `/api/teams/${encodeURIComponent(resolvedTeamId)}/players${authSuffix}`,
            { cache: "no-store" }
          );
          if (playersRes.ok) {
            const rawPlayers = (await playersRes.json()) as LineupPlayer[];
            setTeamPlayers(filterLineupCandidatePlayers(rawPlayers, false));
          }
        } catch { }
      }
      return;
    }

    setIsLoading(true);
    try {
      // 🅰️ デモ試合IDの場合のみデモデータを参照（実試合UUIDがデモ扱いされる不具合を完全防止）
      if (isDemoMatchId(selectedMatchId)) {
        const demoMatch = getDemoMatchById(selectedMatchId) || DEMO_MATCH_MAP["demo-match-3"];
        setCurrentMatch(demoMatch);
        const demoCandidates = filterLineupCandidatePlayers(
          DEMO_LINEUP_PLAYERS,
          true,
          demoMatch?.date ?? null
        );
        setTeamPlayers(demoCandidates);

        const demoLineups = loadDemoMatchLineups(selectedMatchId);
        const splitDemo = splitLoadedMyLineupSlots(demoLineups.myLineup);
        setMyLineup(splitDemo.battingSlots);
        setDhStarterPitcher(splitDemo.dhPitcher);
        setOpponentLineup(
          demoLineups.opponentLineup.length > 0 ? demoLineups.opponentLineup : createEmptyOpponentLineup(9)
        );
        setOpponentBench(
          Array.isArray(demoLineups.opponentBench) ? demoLineups.opponentBench : []
        );

        const demoFilterCtx: MatchRosterFilterContext = {
          matchDate: demoMatch?.date ?? null,
          matchStatus: demoMatch?.status ?? null,
          matchCreatedAt: demoMatch?.createdAt ?? null,
        };
        const initialAtt: PlayerMatchAttendanceMap = {};
        demoCandidates.forEach((p) => {
          initialAtt[p.id] = resolvePlayerMatchAttendanceStatus(
            p,
            demoLineups.myAttendance,
            demoFilterCtx
          );
        });
        setAttendance(initialAtt);
        setOriginalAbsents([]);

        if (typeof window !== "undefined") {
          try {
            const localTpl = localStorage.getItem("iscore_demo_lineup_templates");
            if (localTpl) {
              setTemplates(JSON.parse(localTpl) as LineupTemplateItem[]);
            }
          } catch { }
        }
        return;
      }

      // 🅱️ 実チームDB処理（まず試合詳細・既存スタメンを取得し、試合自身の teamId を特定してから選手・テンプレ・出欠を取得）
      const [matchDetailRes, lineupsRes] = await Promise.all([
        fetch(`/api/matches/${encodeURIComponent(selectedMatchId)}`, { cache: "no-store" }),
        fetch(`/api/matches/${encodeURIComponent(selectedMatchId)}/lineups`, { cache: "no-store" }),
      ]);

      let matchDate: string | null = null;
      let matchStatus: string | null = null;
      let matchCreatedAt: number | string | null = null;
      let matchTeamId = resolvedTeamId;

      if (matchDetailRes.ok) {
        const matchDetailJson = (await matchDetailRes.json()) as MatchDetailApiResponse;
        if (matchDetailJson.success && matchDetailJson.match) {
          setCurrentMatch(matchDetailJson.match);
          matchDate = matchDetailJson.match.date;
          matchStatus = matchDetailJson.match.status;
          matchCreatedAt = matchDetailJson.match.createdAt ?? null;
          if (matchDetailJson.match.teamId) {
            matchTeamId = matchDetailJson.match.teamId;
            if (matchTeamId !== resolvedTeamId) {
              setResolvedTeamId(matchTeamId);
            }
          }
        }
      }

      let activePlayers: LineupPlayer[] = [];
      let attendanceRes: Response | null = null;
      let templatesRes: Response | null = null;

      if (matchTeamId && !isDemoTeamId(matchTeamId)) {
        const playersQuery = new URLSearchParams(authQuery);
        const matchDateKey = toMatchCalendarKey(matchDate);
        if (matchDateKey) {
          playersQuery.set("referenceDate", matchDateKey);
        }
        if (selectedMatchId) {
          playersQuery.set("excludeMatchId", selectedMatchId);
        }
        const playersQuerySuffix = playersQuery.toString()
          ? `?${playersQuery.toString()}`
          : "";

        const [playersRes, tplRes, attRes] = await Promise.all([
          fetch(`/api/teams/${encodeURIComponent(matchTeamId)}/players${playersQuerySuffix}`, {
            cache: "no-store",
          }),
          fetch(`/api/teams/${encodeURIComponent(matchTeamId)}/lineup-templates`, {
            cache: "no-store",
          }),
          fetch(`/api/attendance?teamId=${encodeURIComponent(matchTeamId)}`, {
            cache: "no-store",
          }),
        ]);
        templatesRes = tplRes;
        attendanceRes = attRes;

        if (playersRes.ok) {
          const playersData = (await playersRes.json()) as LineupPlayer[];
          activePlayers = filterLineupCandidatePlayers(playersData, false, matchDate);
          setTeamPlayers(activePlayers);
        }
      }

      const scheduleAbsents: string[] = [];
      if (matchDate && attendanceRes && attendanceRes.ok) {
        const attendanceJson = (await attendanceRes.json()) as TeamAttendanceApiResponse;
        if (attendanceJson.success && attendanceJson.data) {
          const eventsList = attendanceJson.data.events || [];
          const attendancesList = attendanceJson.data.attendances || [];

          const matchedEvent = eventsList.find((e) => isSameCalendarDay(matchDate!, e.startAt));
          if (matchedEvent) {
            const eventAttendances = attendancesList.filter((a) => a.eventId === matchedEvent.id);
            eventAttendances.forEach((att) => {
              if (att.playerId && att.status === "absent") {
                scheduleAbsents.push(att.playerId);
              }
            });
          }
        }
      }
      setOriginalAbsents(scheduleAbsents);

      // 既存スタメン・相手控え・試合別出欠の復元
      let savedAttendance: PlayerMatchAttendanceMap = {};
      if (lineupsRes.ok) {
        const lineupsData = (await lineupsRes.json()) as MatchLineupsApiResponse;
        if (lineupsData.success && lineupsData.lineups) {
          const splitLoaded = splitLoadedMyLineupSlots(lineupsData.lineups.myLineup);
          setMyLineup(splitLoaded.battingSlots);
          setDhStarterPitcher(splitLoaded.dhPitcher);

          if (lineupsData.lineups.opponentLineup && lineupsData.lineups.opponentLineup.length > 0) {
            setOpponentLineup(lineupsData.lineups.opponentLineup);
          } else {
            setOpponentLineup(createEmptyOpponentLineup(9));
          }

          setOpponentBench(
            Array.isArray(lineupsData.lineups.opponentBench)
              ? lineupsData.lineups.opponentBench
              : []
          );

          if (matchCreatedAt === null && lineupsData.lineups.matchCreatedAt !== undefined) {
            matchCreatedAt = lineupsData.lineups.matchCreatedAt;
          }

          savedAttendance = lineupsData.lineups.myAttendance || {};
        } else {
          setMyLineup(createEmptyMyLineup(9));
          setDhStarterPitcher(null);
          setOpponentLineup(createEmptyOpponentLineup(9));
          setOpponentBench([]);
        }
      }

      const rosterFilterCtx: MatchRosterFilterContext = {
        matchDate,
        matchStatus,
        matchCreatedAt,
      };
      const initialAttendance: PlayerMatchAttendanceMap = {};
      activePlayers.forEach((p) => {
        const resolved = resolvePlayerMatchAttendanceStatus(p, savedAttendance, rosterFilterCtx);
        if (scheduleAbsents.includes(p.id) && resolved !== "excluded") {
          initialAttendance[p.id] = "absent";
        } else {
          initialAttendance[p.id] = resolved;
        }
      });

      setAttendance(initialAttendance);

      if (templatesRes && templatesRes.ok) {
        const templatesData = (await templatesRes.json()) as LineupTemplateItem[];
        setTemplates(Array.isArray(templatesData) ? templatesData : []);
      }
    } catch (error) {
      console.error("Failed to load lineup data:", error);
      toast.error("データの読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [profile?.displayName, profile?.userId, resolvedTeamId, selectedMatchId]);

  useEffect(() => {
    loadSquadAndLineup();
  }, [loadSquadAndLineup]);

  // 新規試合作成モーダル展開時に登録済み大会候補をロード
  useEffect(() => {
    if (!isCreateMatchModalOpen) return;
    const targetTid = resolvedTeamId || currentTeam?.id || "demo-team";
    if (isDemoTeamId(targetTid)) {
      const demoMap = new Map<string, LineupTournamentOption>();
      for (const card of getHydratedDemoMatchCards()) {
        const cName = (card.tournamentName || "").trim();
        if (!cName || (card.matchType !== "official" && card.matchType !== "exchange")) {
          continue;
        }
        const cId = card.tournamentId || `demo-t-${cName}`;
        if (!demoMap.has(cId)) {
          const ym = (card.date || "").match(/^(\d{4})/);
          demoMap.set(cId, {
            id: cId,
            name: cName,
            season: ym ? ym[1] : undefined,
            timeLimit: card.tournamentTimeLimit || null,
            coldGameRule: card.tournamentColdGameRule || null,
            tiebreakerRule: card.tournamentTiebreakerRule || null,
            pitchLimitRule: card.tournamentPitchLimitRule || null,
            bracketUrl: card.tournamentBracketUrl || null,
          });
        }
      }
      setAvailableTournaments(Array.from(demoMap.values()));
      return;
    }

    let cancelled = false;
    fetch(`/api/liff/tournaments?teamId=${encodeURIComponent(targetTid)}`)
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as LineupTournamentsApiResponse;
        if (!cancelled && Array.isArray(json.tournaments)) {
          setAvailableTournaments(json.tournaments);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isCreateMatchModalOpen, resolvedTeamId, currentTeam?.id]);

  // DH使用時の打席なし先発投手 (order === 0 & position === "1") の有効状態
  const activeDhStarterPitcher = useMemo<MyLineupSlot | null>(() => {
    if (!dhStarterPitcher) return null;
    const hasIdentity = Boolean(
      dhStarterPitcher.playerId || dhStarterPitcher.name.trim()
    );
    if (!hasIdentity) return null;
    const hasDhInOrder = myLineup.some((s) => s.position === "DH");
    const hasPitcherInOrder = myLineup.some((s) => s.position === "1");
    const isSamePlayerInOrder = Boolean(
      dhStarterPitcher.playerId &&
        myLineup.some((s) => s.playerId === dhStarterPitcher.playerId)
    );
    if (!hasDhInOrder || hasPitcherInOrder || isSamePlayerInOrder) {
      return null;
    }
    return {
      ...dhStarterPitcher,
      order: 0,
      position: "1",
    };
  }, [dhStarterPitcher, myLineup]);

  // 新規試合予定の作成（LINEミニアプリから直接作成）
  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const opponentTrimmed = newOpponent.trim();
    if (!opponentTrimmed) {
      toast.error("対戦相手を入力してください");
      return;
    }

    setIsCreatingMatch(true);
    try {
      const datePayload = newTime ? `${newDate} ${newTime}` : newDate;
      const targetTeamId = resolvedTeamId || currentTeam?.id || "demo-team";
      const selectedNewTourney =
        newMatchType !== "practice" &&
        newTournamentId &&
        newTournamentId !== "__custom__"
          ? availableTournaments.find((t) => t.id === newTournamentId) || null
          : null;
      const effectiveNewTournamentId = selectedNewTourney ? selectedNewTourney.id : null;
      const effectiveNewTournamentName =
        newMatchType !== "practice"
          ? newTournamentName.trim() || selectedNewTourney?.name || ""
          : "";

      if (isDemoTeamId(targetTeamId)) {
        const demoId = `demo-custom-${Date.now()}`;
        const createdDemoMatch: Match = {
          id: demoId,
          opponent: opponentTrimmed,
          date: datePayload,
          status: "scheduled",
          matchType: newMatchType,
          tournamentId: effectiveNewTournamentId,
          tournamentName: effectiveNewTournamentName || undefined,
          tournamentTimeLimit: selectedNewTourney?.timeLimit || null,
          tournamentColdGameRule: selectedNewTourney?.coldGameRule || null,
          tournamentTiebreakerRule: selectedNewTourney?.tiebreakerRule || null,
          tournamentPitchLimitRule: selectedNewTourney?.pitchLimitRule || null,
          tournamentBracketUrl: selectedNewTourney?.bracketUrl || null,
          battingOrder: newBattingOrder,
          surfaceDetails: newVenue.trim() || "グラウンド",
          venueName: newVenue.trim() || "グラウンド",
          innings: newInnings,
          myScore: 0,
          opponentScore: 0,
          myInningScores: [],
          opponentInningScores: [],
        };
        saveCustomDemoMatch(createdDemoMatch);
        setMatchesList((prev) => [
          {
            id: demoId,
            opponent: opponentTrimmed,
            date: datePayload,
            status: "scheduled",
            myScore: 0,
            opponentScore: 0,
            matchType: newMatchType,
            tournamentId: effectiveNewTournamentId,
            tournamentName: effectiveNewTournamentName || null,
            tournamentTimeLimit: selectedNewTourney?.timeLimit || null,
            tournamentColdGameRule: selectedNewTourney?.coldGameRule || null,
            tournamentTiebreakerRule: selectedNewTourney?.tiebreakerRule || null,
            tournamentPitchLimitRule: selectedNewTourney?.pitchLimitRule || null,
            tournamentBracketUrl: selectedNewTourney?.bracketUrl || null,
            venueName: newVenue.trim() || "グラウンド",
            battingOrder: newBattingOrder,
          },
          ...prev,
        ]);
        setSelectedMatchId(demoId);
        router.replace(`/liff/matches/lineup?id=${demoId}`);
        setIsCreateMatchModalOpen(false);
        setNewOpponent("");
        setNewTournamentId("");
        setNewTournamentName("");
        toast.success("新しい試合を作成しました（デモ）");
        return;
      }

      const res = await fetch("/api/matches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: targetTeamId,
          opponent: opponentTrimmed,
          date: datePayload,
          matchType: newMatchType,
          tournamentId: effectiveNewTournamentId,
          tournamentName: effectiveNewTournamentName || undefined,
          battingOrder: newBattingOrder,
          surfaceDetails: newVenue.trim() || undefined,
          innings: newInnings,
          status: "scheduled",
        }),
      });

      const result = (await res.json()) as CreateMatchApiResponse;
      if (!res.ok || !result.success || !result.matchId) {
        throw new Error(result.error || "試合の作成に失敗しました");
      }

      toast.success(`「vs ${opponentTrimmed}」を作成しました！続けてスタメンを登録できます`);
      setIsCreateMatchModalOpen(false);
      setNewOpponent("");
      setNewTournamentId("");
      setNewTournamentName("");
      setNewVenue("");
      setSelectedMatchId(result.matchId);
      router.replace(`/liff/matches/lineup?id=${result.matchId}`);
      await loadMatchesList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "試合の作成に失敗しました");
    } finally {
      setIsCreatingMatch(false);
    }
  };

  const effectiveCanEditLineup =
    canMutate || isDemo || Boolean(selectedMatchId && isDemoMatchId(selectedMatchId));

  // スタメン・控え・欠席の保存処理（試合DBおよびLINE試合速報ドラフトと双方向同期）
  const handleSaveLineups = async () => {
    if (!effectiveCanEditLineup) {
      toast.error("閲覧専用メンバーのためスタメンを保存できません");
      return;
    }
    if (!selectedMatchId) {
      toast.error("登録対象の試合を選択してください");
      return;
    }

    setIsSaving(true);
    try {
      const hasAnyOpponentStarterInput = opponentLineup.some(
        (p) =>
          Boolean(
            (p.name && p.name.trim() !== "") ||
            (p.position && p.position !== "") ||
            (p.uniformNumber && p.uniformNumber.trim() !== "")
          )
      );

      const filledOpponentLineup: OpponentLineupSlot[] = opponentLineup.map((p) => {
        const cleanName = (p.name || "").trim();
        const cleanNum = (p.uniformNumber || "").trim().replace(/^#/, "");
        const hasName = Boolean(cleanName);
        const hasPos = Boolean(p.position && p.position !== "");
        if (!hasAnyOpponentStarterInput) {
          return {
            ...p,
            name: "",
            uniformNumber: "",
            position: "",
          };
        }
        return {
          ...p,
          uniformNumber: cleanNum,
          name: hasName ? cleanName : cleanNum ? `相手選手 #${cleanNum}` : `相手打者 ${p.order}`,
          position: hasPos ? p.position : p.order <= 9 ? String(p.order) : "DH",
        };
      });

      const cleanedOpponentBench: OpponentBenchPlayer[] = opponentBench
        .map((b, idx) => ({
          id: b.id || `opp-b-${idx + 1}`,
          uniformNumber: (b.uniformNumber || "").trim().replace(/^#/, ""),
          name: (b.name || "").trim(),
          position: b.position || "",
        }))
        .filter((b) => Boolean(b.name || b.uniformNumber))
        .map((b) => ({
          ...b,
          name: b.name || `相手控え #${b.uniformNumber}`,
        }));

      const serializedMyLineup: MyLineupSlot[] = activeDhStarterPitcher
        ? [...myLineup, activeDhStarterPitcher]
        : myLineup;

      const payload: MatchLineupsPayload = {
        myLineup: serializedMyLineup,
        opponentLineup: filledOpponentLineup,
        opponentBench: cleanedOpponentBench,
        myAttendance: attendance,
      };

      if (isDemoMatchId(selectedMatchId)) {
        saveDemoMatchLineups(selectedMatchId, payload);
        if (typeof window !== "undefined") {
          const demoDraftKey = `iscore_liff_news_v2_doc_demo-team_match:${selectedMatchId}`;
          try {
            const rawDraft = localStorage.getItem(demoDraftKey);
            if (rawDraft) {
              const parsedDoc = sanitizeLiveReportDocument(
                JSON.parse(rawDraft) as unknown
              );
              if (parsedDoc) {
                const syncedDoc = mergeSavedMatchLineupIntoDoc(
                  parsedDoc,
                  payload,
                  { overwriteFilled: true }
                );
                localStorage.setItem(demoDraftKey, JSON.stringify(syncedDoc));
              }
            }
          } catch {
            // ignore
          }
        }
        setOpponentLineup(filledOpponentLineup);
        setOpponentBench(cleanedOpponentBench);
        toast.success("スタメン・控え・欠席を保存しました！（デモ・LINE速報連動）");
        router.push(`/liff/matches?id=${encodeURIComponent(selectedMatchId)}`);
        return;
      }

      const res = await fetch(`/api/matches/${encodeURIComponent(selectedMatchId)}/lineups`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save lineups");

      invalidateLiffApiCache("/api/matches");
      invalidateLiffApiCache("/api/liff/");

      setOpponentLineup(filledOpponentLineup);
      setOpponentBench(cleanedOpponentBench);
      toast.success("スタメン・控え・欠席を保存しました！（LINE速報にも自動反映）");
      router.push(`/liff/matches?id=${encodeURIComponent(selectedMatchId)}`);
    } catch (error) {
      console.error(error);
      toast.error("スタメンの保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const matchRosterCtx = useMemo<MatchRosterFilterContext>(
    () => ({
      matchDate: currentMatch?.date ?? null,
      matchStatus: currentMatch?.status ?? null,
      matchCreatedAt: currentMatch?.createdAt ?? null,
    }),
    [currentMatch?.date, currentMatch?.status, currentMatch?.createdAt]
  );

  const pitchLimitSpec = useMemo(
    () =>
      resolvePitchLimitSpec({
        tournamentPitchLimitRule: currentMatch?.tournamentPitchLimitRule ?? null,
      }),
    [currentMatch?.tournamentPitchLimitRule]
  );

  const startingPlayerIds = useMemo(() => {
    const ids = myLineup.map((p) => p.playerId).filter(Boolean);
    if (
      activeDhStarterPitcher?.playerId &&
      !ids.includes(activeDhStarterPitcher.playerId)
    ) {
      ids.push(activeDhStarterPitcher.playerId);
    }
    return ids;
  }, [myLineup, activeDhStarterPitcher]);
  const remainingPlayers = useMemo(() => {
    const filtered = teamPlayers.filter((p) => !startingPlayerIds.includes(p.id));
    return [...filtered].sort((a, b) => {
      const aPreJoined = isPlayerJoinedAfterMatch(a, matchRosterCtx) ? 1 : 0;
      const bPreJoined = isPlayerJoinedAfterMatch(b, matchRosterCtx) ? 1 : 0;
      return aPreJoined - bPreJoined;
    });
  }, [teamPlayers, startingPlayerIds, matchRosterCtx]);

  // LINE共有・コピー用テキスト生成
  const shareSummaryText = useMemo(() => {
    const opp = currentMatch?.opponent || "対戦相手";
    const dt = currentMatch?.date || "";
    return formatLineupShareText(
      opp,
      dt,
      myLineup,
      remainingPlayers,
      attendance,
      teamPlayers
    );
  }, [
    currentMatch?.opponent,
    currentMatch?.date,
    myLineup,
    remainingPlayers,
    attendance,
    teamPlayers,
  ]);

  const handleSelectMatch = (id: string) => {
    setSelectedMatchId(id);
    setIsMatchPickerOpen(false);
    router.replace(`/liff/matches/lineup?id=${id}`);
  };

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="スタメン・ベンチ編成"
          subtitle="打順・守備位置・ベンチ入り・欠席の設定"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <Users className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={
            currentMatch
              ? {
                title: `vs ${currentMatch.opponent} 出場メンバー`,
                text: shareSummaryText,
              }
              : undefined
          }
          rightElement={
            canMutate || isDemo ? (
              <button
                type="button"
                onClick={() => setIsCreateMatchModalOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新規試合</span>
              </button>
            ) : undefined
          }
        />

        {!effectiveCanEditLineup && (
          <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-slate-500 px-4 py-2.5 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-black text-white">閲覧専用モード</span>
            </div>
            <div className="p-3.5 text-xs font-bold text-muted-foreground leading-relaxed">
              現在のアカウント権限では出場メンバー・出欠の変更保存はできません（LINE連絡用テキストのコピー・共有は利用できます）。
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⚾ 対象試合カード & 試合切替セレクター
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {!selectedMatchId && !isLoading ? (
          <div className="space-y-3">
            <EmptyState
              icon={Shield}
              title="登録されている試合がありません"
              description={
                canMutate || isDemo
                  ? "まずは試合予定を作成すると、スタメン・控え・欠席を登録できます"
                  : "チームの指導者・担当者が試合予定を作成すると、ここに出場メンバーが表示されます"
              }
            />
            {(canMutate || isDemo) && (
              <Button
                type="button"
                onClick={() => setIsCreateMatchModalOpen(true)}
                className="w-full h-12 rounded-2xl font-black text-sm gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                新しい試合予定を作成する
              </Button>
            )}
          </div>
        ) : (
          <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            {/* A-3 上帯ダークソリッドキャップ */}
            <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span
                  className={cn(
                    "text-[10px] font-black px-1.5 py-0.5 rounded border",
                    currentMatch?.matchType === "official"
                      ? "bg-amber-400 text-slate-950 border-amber-400"
                      : currentMatch?.matchType === "exchange"
                        ? "bg-sky-500 text-white border-sky-500"
                        : "bg-slate-800 text-slate-200 border-slate-700"
                  )}
                >
                  {currentMatch?.matchType === "official"
                    ? "公式戦"
                    : currentMatch?.matchType === "exchange"
                      ? "交流戦"
                      : practiceMatchLabel}
                </span>
                {currentMatch?.tournamentName && (
                  <span className="text-[11px] font-bold text-slate-300 truncate">
                    {currentMatch.tournamentName}
                  </span>
                )}
                <span
                  className={cn(
                    "text-[10px] font-black px-1.5 py-0.5 rounded",
                    currentMatch?.status === "live"
                      ? "bg-rose-600 text-white"
                      : currentMatch?.status === "finished"
                        ? "bg-slate-800 text-slate-200 border border-slate-700"
                        : "bg-primary text-primary-foreground"
                  )}
                >
                  {currentMatch?.status === "live"
                    ? "試合中"
                    : currentMatch?.status === "finished"
                      ? "試合終了"
                      : "試合予定"}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {selectedMatchId && (
                  <Link
                    href={`/liff/tools/news-generator?matchId=${encodeURIComponent(
                      selectedMatchId
                    )}`}
                    className="px-2.5 py-1 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-[11px] font-black text-white flex items-center gap-1 shrink-0 active:scale-95 transition-all"
                  >
                    <Megaphone className="w-3.5 h-3.5 shrink-0" />
                    <span>LINE速報へ</span>
                  </Link>
                )}

                {matchesList.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setIsMatchPickerOpen((prev) => !prev)}
                    className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-black text-white flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400" />
                    <span>試合切替</span>
                  </button>
                )}
              </div>
            </div>

            <div className="p-3.5 space-y-2.5 bg-card">
              <div className="min-w-0">
                <h2 className="text-base font-black text-foreground truncate">
                  {currentMatch ? `vs ${currentMatch.opponent}` : "試合情報を読み込み中..."}
                </h2>

                {currentMatch && (
                  <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span>{currentMatch.date}</span>
                    {(currentMatch.venueShortName || currentMatch.venueName || currentMatch.surfaceDetails) && (
                      <>
                        <span className="text-border">|</span>
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {currentMatch.venueShortName ||
                            currentMatch.venueName ||
                            currentMatch.surfaceDetails}
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>

              {/* 試合切替ドロワー */}
              {isMatchPickerOpen && matchesList.length > 1 && (
                <div className="pt-2.5 border-t border-border space-y-1.5 max-h-52 overflow-y-auto">
                  <p className="text-[10px] font-black text-muted-foreground px-1">
                    登録する試合を選択してください
                  </p>
                  {matchesList.map((m) => {
                    const isCurrent = m.id === selectedMatchId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelectMatch(m.id)}
                        className={cn(
                          "w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all",
                          isCurrent
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-muted/35 hover:bg-muted/60 border-border text-foreground"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black truncate text-foreground">vs {m.opponent}</p>
                          <p className="text-[10px] font-bold text-muted-foreground truncate">
                            {m.date} {m.venueShortName || m.venueName ? `• ${m.venueShortName || m.venueName}` : ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 ml-2",
                            m.status === "scheduled"
                              ? "bg-primary/15 text-primary"
                              : m.status === "live"
                                ? "bg-rose-600 text-white"
                                : "bg-muted text-muted-foreground"
                          )}
                        >
                          {m.status === "scheduled" ? "予定" : m.status === "live" ? "試合中" : "終了"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ローディング中 */}
        {isLoading && selectedMatchId ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs font-black text-muted-foreground">メンバー情報を読み込み中...</p>
          </div>
        ) : selectedMatchId ? (
          <>
            {currentMatch &&
              currentMatch.status === "finished" &&
              canUsePaidAi &&
              !isDemoMatchId(currentMatch.id) && (
                <div className="p-3.5 rounded-2xl border border-border border-l-4 border-l-primary bg-card shadow-xs flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-foreground">
                      試合途中の「選手交代・代打・代走・継投」を追加・修正したい場合
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground">
                      スコア確認画面から回途中の代打・代走・守備交代・継投を後からいつでも編集できます
                    </p>
                  </div>
                  <Link
                    href={`/liff/tools/scorebook-import?matchId=${encodeURIComponent(
                      currentMatch.id
                    )}&mode=edit`}
                    className="px-3 py-2 rounded-xl bg-primary/12 hover:bg-primary/20 text-primary border border-primary/35 text-[11px] font-black inline-flex items-center gap-1.5 shrink-0 shadow-2xs transition-colors"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>選手交代・打席を編集</span>
                  </Link>
                </div>
              )}

            <UnifiedLineupBenchEditor
              teamId={currentMatch?.teamId || resolvedTeamId || "demo-team"}
              isDemoTeam={
                isDemoMatchId(selectedMatchId) ||
                isDemoTeamId(currentMatch?.teamId || resolvedTeamId || "")
              }
              canEdit={effectiveCanEditLineup}
              canSaveTeamTemplate={effectiveCanEditLineup}
              linkageMode="match"
              showLinkageBanner={false}
              opponentDisplayName={currentMatch?.opponent || "対戦相手"}
              dateLabel={currentMatch?.date || ""}
              matchRosterCtx={matchRosterCtx}
              pitchLimitSpec={pitchLimitSpec}
              teamPlayers={teamPlayers}
              myLineup={myLineup}
              dhStarterPitcher={dhStarterPitcher}
              opponentLineup={opponentLineup}
              opponentBench={opponentBench}
              attendance={attendance}
              scheduleAbsents={originalAbsents}
              templates={templates}
              onChangeTemplates={setTemplates}
              onChangeState={(patch) => {
                if (patch.myLineup !== undefined) {
                  setMyLineup(patch.myLineup);
                }
                if (patch.dhStarterPitcher !== undefined) {
                  setDhStarterPitcher(patch.dhStarterPitcher);
                }
                if (patch.opponentLineup !== undefined) {
                  setOpponentLineup(patch.opponentLineup);
                }
                if (patch.opponentBench !== undefined) {
                  setOpponentBench(patch.opponentBench);
                }
                if (patch.myAttendance !== undefined) {
                  setAttendance(patch.myAttendance);
                }
              }}
              activeContextKey={`${resolvedTeamId}:${selectedMatchId}`}
              showCopyShareButton={true}
              primarySaveButton={{
                label: "スタメン・出欠を保存する",
                savingLabel: "保存中...",
                isSaving,
                onSave: () => void handleSaveLineups(),
              }}
            />
          </>
        ) : null}

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ➕ 新規試合予定作成モーダル (Portal z-[9999])
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted &&
        isCreateMatchModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 animate-in fade-in duration-150"
            onClick={() => setIsCreateMatchModalOpen(false)}
          >
            <form
              onSubmit={handleCreateMatch}
              onClick={(e) => e.stopPropagation()}
              className="bg-card w-full max-w-md rounded-2xl border border-border shadow-xs overflow-hidden flex flex-col max-h-[88dvh]"
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-white">新しい試合予定を作成</h3>
                  <p className="text-[11px] font-bold text-slate-300 mt-0.5">
                    作成後すぐにスタメン・控え・欠席を登録できます
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateMatchModalOpen(false)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3.5 overflow-y-auto bg-card">
                <div className="space-y-1">
                  <label className="text-xs font-black text-foreground">対戦相手 *</label>
                  <Input
                    required
                    placeholder="例：ブルーサンダース"
                    value={newOpponent}
                    onChange={(e) => setNewOpponent(e.target.value)}
                    className="h-11 rounded-xl bg-muted/50 border-border font-bold text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-xs font-black text-foreground">試合日 *</label>
                    <Input
                      type="date"
                      required
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="h-11 rounded-xl bg-muted/50 border-border font-bold text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black text-foreground">開始予定時刻</label>
                    <Input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="h-11 rounded-xl bg-muted/50 border-border font-bold text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-foreground">試合種別</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: "practice", label: practiceMatchLabel },
                        { id: "official", label: "公式戦" },
                        { id: "exchange", label: "交流戦" },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setNewMatchType(item.id)}
                        className={cn(
                          "py-2 rounded-xl text-xs border transition-all cursor-pointer",
                          newMatchType === item.id
                            ? "bg-primary/12 text-primary border-primary/35 font-black shadow-2xs"
                            : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted/50 font-bold"
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {newMatchType !== "practice" && (
                  <div className="space-y-2">
                    <label className="text-xs font-black text-foreground flex items-center gap-1">
                      <Trophy className="w-3.5 h-3.5 text-amber-500" />
                      <span>大会名</span>
                    </label>
                    {availableTournaments.length > 0 && (
                      <LiffSelect
                        value={newTournamentId}
                        onChange={(val: string) => {
                          setNewTournamentId(val);
                          if (val && val !== "__custom__") {
                            const matched = availableTournaments.find((t) => t.id === val);
                            if (matched) {
                              setNewTournamentName(matched.name);
                            }
                          } else if (!val) {
                            setNewTournamentName("");
                          }
                        }}
                        title="登録済み大会から選択"
                        placeholder="登録済み大会から選択..."
                        options={[
                          { value: "", label: "未選択" },
                          ...availableTournaments.map((t) => ({
                            value: t.id,
                            label: t.season ? `${t.name} (${t.season}年)` : t.name,
                            sublabel: t.pitchLimitRule
                              ? `⚾ ${t.pitchLimitRule}`
                              : undefined,
                          })),
                          {
                            value: "__custom__",
                            label: "＋ 自由入力・新規大会名を入力",
                          },
                        ]}
                      />
                    )}
                    {(availableTournaments.length === 0 ||
                      newTournamentId === "__custom__" ||
                      Boolean(newTournamentId)) && (
                      <Input
                        placeholder={
                          newTournamentId && newTournamentId !== "__custom__"
                            ? "必要なら回戦などを追記（例：秋季大会 2回戦）"
                            : "例：秋季大会 2回戦"
                        }
                        value={newTournamentName}
                        onChange={(e) => setNewTournamentName(e.target.value)}
                        className="h-11 rounded-xl bg-muted/50 border-border font-bold text-sm"
                      />
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-black text-foreground">先攻・後攻（仮設定可）</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setNewBattingOrder("first")}
                        className={cn(
                          "py-2.5 rounded-xl text-xs border transition-all cursor-pointer",
                          newBattingOrder === "first"
                            ? "bg-primary/12 text-primary border-primary/35 font-black shadow-2xs"
                            : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted/50 font-bold"
                        )}
                      >
                        先攻（表）
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewBattingOrder("second")}
                        className={cn(
                          "py-2.5 rounded-xl text-xs border transition-all cursor-pointer",
                          newBattingOrder === "second"
                            ? "bg-primary/12 text-primary border-primary/35 font-black shadow-2xs"
                            : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted/50 font-bold"
                        )}
                      >
                        後攻（裏）
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black text-foreground">規定イニング</label>
                    <LiffSelect
                      value={String(newInnings)}
                      onChange={(v: string) => {
                        const n = Number(v);
                        setNewInnings(n === 5 || n === 6 || n === 9 ? n : 7);
                      }}
                      title="規定イニングを選択"
                      options={[
                        { value: "5", label: "5回制（低学年・短縮等）" },
                        { value: "6", label: "6回制（学童公式・標準）" },
                        { value: "7", label: "7回制（中学・軟式一般）" },
                        { value: "9", label: "9回制（高校・硬式一般）" },
                      ]}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-foreground">球場・グラウンド</label>
                  <Input
                    placeholder="例：多摩川緑地野球場"
                    value={newVenue}
                    onChange={(e) => setNewVenue(e.target.value)}
                    className="h-11 rounded-xl bg-muted/50 border-border font-bold text-sm"
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateMatchModalOpen(false)}
                    className="flex-1 h-12 rounded-2xl border-border font-black"
                  >
                    キャンセル
                  </Button>
                  <Button
                    type="submit"
                    disabled={isCreatingMatch}
                    className="flex-1 h-12 rounded-2xl font-black gap-1.5"
                  >
                    {isCreatingMatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    <span>作成して登録へ</span>
                  </Button>
                </div>
              </div>
            </form>
          </div>,
          document.body
        )}
    </div>
  );
}

export default function LiffMatchLineupPage() {
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
      <LiffLineupContent />
    </Suspense>
  );
}

