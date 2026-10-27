// filepath: src/app/liff/matches/lineup/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  Loader2,
  Wand2,
  Shield,
  Swords,
  Save,
  UserStar,
  UserMinus,
  UserCheck,
  CheckCircle2,
  FolderOpen,
  ChevronDown,
  Calendar,
  MapPin,
  Plus,
  Copy,
  Check,
  ArrowLeftRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/match";
import type { MatchCardData } from "@/components/liff/MatchScoreCard";
import {
  LINEUP_POSITIONS,
  DEMO_LINEUP_PLAYERS,
  DEMO_MATCH_MAP,
  getDemoMatchById,
  getHydratedDemoMatchCards,
  saveCustomDemoMatch,
  isDemoMatchId,
  isDemoTeamId,
  parseSafeMatchDate,
  loadDemoMatchLineups,
  saveDemoMatchLineups,
  formatLineupShareText,
  type LineupPlayer,
  type MyLineupSlot,
  type OpponentLineupSlot,
  type PlayerMatchAttendanceMap,
  type MatchLineupsPayload,
  type LineupTemplateItem,
} from "@/lib/liff/demo-lineup";

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
    myAttendance?: PlayerMatchAttendanceMap;
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

interface SaveTemplateApiResponse {
  success?: boolean;
  id?: string;
  error?: string;
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

function LiffLineupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlMatchId = searchParams.get("id");
  const urlTeamId = searchParams.get("teamId");
  const { currentTeam, isLoadingTeam, isDemo } = useLiff();

  const preferredTeamId = useMemo(() => {
    if (urlTeamId && urlTeamId !== "undefined" && urlTeamId !== "null") {
      return urlTeamId;
    }
    if (currentTeam?.id) {
      return currentTeam.id;
    }
    if (typeof window !== "undefined") {
      const storedId = localStorage.getItem("iscore_selectedTeamId");
      const storedIsDemo = localStorage.getItem("iscore_isDemo") === "true";
      if (storedId && (storedId !== "demo-team" || storedIsDemo)) {
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
  const [newTournamentName, setNewTournamentName] = useState("");
  const [newBattingOrder, setNewBattingOrder] = useState<"first" | "second">("first");
  const [newVenue, setNewVenue] = useState("");
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);

  // Web版流用: スタメン・控え・欠席ステート
  const [activeTab, setActiveTab] = useState<"myTeam" | "opponent">("myTeam");
  const [teamPlayers, setTeamPlayers] = useState<LineupPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const [templates, setTemplates] = useState<LineupTemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const [attendance, setAttendance] = useState<PlayerMatchAttendanceMap>({});
  const [originalAbsents, setOriginalAbsents] = useState<string[]>([]);

  const [activeSelectionIndex, setActiveSelectionIndex] = useState<number | null>(null);
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [tempSelectedPlayer, setTempSelectedPlayer] = useState<LineupPlayer | null>(null);
  const [modalStep, setModalStep] = useState<"player" | "position">("player");

  const [myLineup, setMyLineup] = useState<MyLineupSlot[]>(() => createEmptyMyLineup(9));
  const [opponentLineup, setOpponentLineup] = useState<OpponentLineupSlot[]>(() => createEmptyOpponentLineup(9));

  // 初回アクセス等でまだ teamId が未確定の場合は /api/liff/hub から実チームIDを解決（デモ試合への誤フォールバック防止）
  useEffect(() => {
    if (preferredTeamId) {
      setResolvedTeamId(preferredTeamId);
      return;
    }

    let cancelled = false;
    async function resolveInitialTeam() {
      try {
        const res = await fetch("/api/liff/hub", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { team?: { id?: string | null } };
          if (!cancelled) {
            setResolvedTeamId(data.team?.id || "demo-team");
          }
          return;
        }
      } catch {}
      if (!cancelled) {
        setResolvedTeamId("demo-team");
      }
    }

    resolveInitialTeam();
    return () => {
      cancelled = true;
    };
  }, [preferredTeamId]);

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
  useEffect(() => {
    setActiveSelectionIndex(null);
    setTempSelectedPlayer(null);
    setIsTemplateModalOpen(false);
    setIsCreateMatchModalOpen(false);
    setIsMatchPickerOpen(false);
  }, [selectedMatchId, resolvedTeamId]);

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveSelectionIndex(null);
        setTempSelectedPlayer(null);
        setIsTemplateModalOpen(false);
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
        } catch {}
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
    if (!selectedMatchId) {
      if (!resolvedTeamId) return;
      // 試合未選択でも選手一覧だけはロードしておく
      if (isDemoTeamId(resolvedTeamId)) {
        setTeamPlayers(DEMO_LINEUP_PLAYERS);
      } else {
        try {
          const playersRes = await fetch(
            `/api/teams/${encodeURIComponent(resolvedTeamId)}/players`,
            { cache: "no-store" }
          );
          if (playersRes.ok) {
            const rawPlayers = (await playersRes.json()) as LineupPlayer[];
            const activePlayers = (Array.isArray(rawPlayers) ? rawPlayers : []).filter(
              (p) => p.isActive !== false && p.isActive !== 0
            );
            setTeamPlayers(activePlayers);
          }
        } catch {}
      }
      return;
    }

    setIsLoading(true);
    try {
      // 🅰️ デモ試合IDの場合のみデモデータを参照（実試合UUIDがデモ扱いされる不具合を完全防止）
      if (isDemoMatchId(selectedMatchId)) {
        setTeamPlayers(DEMO_LINEUP_PLAYERS);
        const demoMatch = getDemoMatchById(selectedMatchId) || DEMO_MATCH_MAP["demo-match-3"];
        setCurrentMatch(demoMatch);

        const demoLineups = loadDemoMatchLineups(selectedMatchId);
        setMyLineup(
          demoLineups.myLineup.length > 0 ? demoLineups.myLineup : createEmptyMyLineup(9)
        );
        setOpponentLineup(
          demoLineups.opponentLineup.length > 0 ? demoLineups.opponentLineup : createEmptyOpponentLineup(9)
        );

        const initialAtt: PlayerMatchAttendanceMap = {};
        DEMO_LINEUP_PLAYERS.forEach((p) => {
          initialAtt[p.id] = demoLineups.myAttendance[p.id] === "absent" ? "absent" : "bench";
        });
        setAttendance(initialAtt);
        setOriginalAbsents([]);

        if (typeof window !== "undefined") {
          try {
            const localTpl = localStorage.getItem("iscore_demo_lineup_templates");
            if (localTpl) {
              setTemplates(JSON.parse(localTpl) as LineupTemplateItem[]);
            }
          } catch {}
        }
        return;
      }

      // 🅱️ 実チームDB処理（まず試合詳細・既存スタメンを取得し、試合自身の teamId を特定してから選手・テンプレ・出欠を取得）
      const [matchDetailRes, lineupsRes] = await Promise.all([
        fetch(`/api/matches/${encodeURIComponent(selectedMatchId)}`, { cache: "no-store" }),
        fetch(`/api/matches/${encodeURIComponent(selectedMatchId)}/lineups`, { cache: "no-store" }),
      ]);

      let matchDate: string | null = null;
      let matchTeamId = resolvedTeamId;

      if (matchDetailRes.ok) {
        const matchDetailJson = (await matchDetailRes.json()) as MatchDetailApiResponse;
        if (matchDetailJson.success && matchDetailJson.match) {
          setCurrentMatch(matchDetailJson.match);
          matchDate = matchDetailJson.match.date;
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
        const [playersRes, tplRes, attRes] = await Promise.all([
          fetch(`/api/teams/${encodeURIComponent(matchTeamId)}/players`, { cache: "no-store" }),
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
          activePlayers = (Array.isArray(playersData) ? playersData : []).filter(
            (p) => p.isActive !== false && p.isActive !== 0
          );
          setTeamPlayers(activePlayers);
        }
      }

      const initialAttendance: PlayerMatchAttendanceMap = {};
      activePlayers.forEach((p) => {
        initialAttendance[p.id] = "bench";
      });

      if (matchDate && attendanceRes && attendanceRes.ok) {
        const attendanceJson = (await attendanceRes.json()) as TeamAttendanceApiResponse;
        if (attendanceJson.success && attendanceJson.data) {
          const eventsList = attendanceJson.data.events || [];
          const attendancesList = attendanceJson.data.attendances || [];

          const matchedEvent = eventsList.find((e) => isSameCalendarDay(matchDate!, e.startAt));
          if (matchedEvent) {
            const eventAttendances = attendancesList.filter((a) => a.eventId === matchedEvent.id);
            const absents: string[] = [];
            eventAttendances.forEach((att) => {
              if (att.playerId && att.status === "absent") {
                initialAttendance[att.playerId] = "absent";
                absents.push(att.playerId);
              }
            });
            setOriginalAbsents(absents);
          } else {
            setOriginalAbsents([]);
          }
        }
      } else {
        setOriginalAbsents([]);
      }

      // 既存スタメン・試合別出欠の復元
      if (lineupsRes.ok) {
        const lineupsData = (await lineupsRes.json()) as MatchLineupsApiResponse;
        if (lineupsData.success && lineupsData.lineups) {
          if (lineupsData.lineups.myLineup && lineupsData.lineups.myLineup.length > 0) {
            setMyLineup(lineupsData.lineups.myLineup);
          } else {
            setMyLineup(createEmptyMyLineup(9));
          }

          if (lineupsData.lineups.opponentLineup && lineupsData.lineups.opponentLineup.length > 0) {
            setOpponentLineup(lineupsData.lineups.opponentLineup);
          } else {
            setOpponentLineup(createEmptyOpponentLineup(9));
          }

          const savedAttendance = lineupsData.lineups.myAttendance || {};
          Object.keys(savedAttendance).forEach((pid) => {
            if (savedAttendance[pid] === "absent") {
              initialAttendance[pid] = "absent";
            } else if (savedAttendance[pid] === "bench" && !initialAttendance[pid]) {
              initialAttendance[pid] = "bench";
            }
          });
        } else {
          setMyLineup(createEmptyMyLineup(9));
          setOpponentLineup(createEmptyOpponentLineup(9));
        }
      }

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
  }, [resolvedTeamId, selectedMatchId]);

  useEffect(() => {
    loadSquadAndLineup();
  }, [loadSquadAndLineup]);

  // 🌟 EDH（全員打撃）に対応するためのスタメン動的追加・削除ハンドラー
  const handleAddBatter = (type: "myTeam" | "opponent") => {
    if (type === "myTeam") {
      setMyLineup((prev) => [
        ...prev,
        { order: prev.length + 1, position: "", playerId: "", name: "", uniformNumber: "" },
      ]);
      toast.success("打撃スタメン枠を追加しました");
    } else {
      setOpponentLineup((prev) => [
        ...prev,
        { order: prev.length + 1, position: "", name: "", uniformNumber: "" },
      ]);
      toast.success("相手チームの打撃枠を追加しました");
    }
  };

  const handleRemoveBatter = (type: "myTeam" | "opponent", targetIndex: number) => {
    if (type === "myTeam") {
      if (myLineup.length <= 9) return;
      setMyLineup((prev) => {
        const filtered = prev.filter((_, i) => i !== targetIndex);
        return filtered.map((p, idx) => ({ ...p, order: idx + 1 }));
      });
      toast.success("打撃スタメン枠を削除しました");
    } else {
      if (opponentLineup.length <= 9) return;
      setOpponentLineup((prev) => {
        const filtered = prev.filter((_, i) => i !== targetIndex);
        return filtered.map((p, idx) => ({ ...p, order: idx + 1 }));
      });
      toast.success("相手チームの打撃枠を削除しました");
    }
  };

  const getDisabledPositions = (
    lineup: Array<{ position: string }>,
    currentIndex: number
  ): string[] =>
    lineup
      .filter((_, i) => i !== currentIndex)
      .map((p) => p.position)
      .filter((pos) => Boolean(pos) && pos !== "DH"); // DHはEDH（全員打撃）のため重複許可

  const getDisabledPlayers = (lineup: MyLineupSlot[], currentIndex: number): string[] =>
    lineup
      .filter((_, i) => i !== currentIndex)
      .map((p) => p.playerId)
      .filter(Boolean);

  // テンプレート保存
  const handleSaveTemplate = async () => {
    const trimmed = templateName.trim();
    if (!trimmed) {
      toast.error("テンプレート名を入力してください");
      return;
    }

    const targetTeamId = currentMatch?.teamId || resolvedTeamId || "demo-team";

    try {
      if (isDemoMatchId(selectedMatchId) || isDemoTeamId(targetTeamId)) {
        const newTpl: LineupTemplateItem = {
          id: `demo-tpl-${Date.now()}`,
          name: trimmed,
          lineupData: myLineup,
        };
        const nextTemplates = [newTpl, ...templates];
        setTemplates(nextTemplates);
        if (typeof window !== "undefined") {
          localStorage.setItem("iscore_demo_lineup_templates", JSON.stringify(nextTemplates));
        }
        toast.success(`テンプレート「${trimmed}」を保存しました`);
        setIsTemplateModalOpen(false);
        setTemplateName("");
        return;
      }

      const res = await fetch(`/api/teams/${encodeURIComponent(targetTeamId)}/lineup-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          lineupData: myLineup,
        }),
      });

      const result = (await res.json()) as SaveTemplateApiResponse;
      if (!res.ok || result.error) throw new Error(result.error || "保存に失敗しました");

      toast.success(`テンプレート「${trimmed}」を保存しました`);
      setIsTemplateModalOpen(false);
      setTemplateName("");

      const templatesRes = await fetch(
        `/api/teams/${encodeURIComponent(targetTeamId)}/lineup-templates`,
        {
          cache: "no-store",
        }
      );
      if (templatesRes.ok) {
        const templatesData = (await templatesRes.json()) as LineupTemplateItem[];
        setTemplates(Array.isArray(templatesData) ? templatesData : []);
      }
    } catch (error) {
      console.error(error);
      toast.error("テンプレートの保存に失敗しました");
    }
  };

  // テンプレート読込
  const handleLoadTemplate = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const templateId = e.target.value;
    setSelectedTemplateId(templateId);
    if (!templateId) return;

    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    try {
      const rawLineupData =
        typeof template.lineupData === "string"
          ? (JSON.parse(template.lineupData) as MyLineupSlot[])
          : template.lineupData;

      if (Array.isArray(rawLineupData)) {
        const restored = rawLineupData.map((item) => {
          const player = teamPlayers.find((p) => p.id === item.playerId);
          return {
            order: item.order,
            position: item.position || "",
            playerId: item.playerId || "",
            name: player ? player.name : item.name || "",
            uniformNumber: player ? player.uniformNumber || "" : item.uniformNumber || "",
          };
        });

        const maxOrder = Math.max(9, ...restored.map((r) => r.order));
        const fullLineup: MyLineupSlot[] = Array.from({ length: maxOrder }, (_, i) => {
          const found = restored.find((r) => r.order === i + 1);
          return (
            found || {
              order: i + 1,
              position: "",
              playerId: "",
              name: "",
              uniformNumber: "",
            }
          );
        });

        // 旧データ互換: order: 0 (打席なし投手) があれば末尾に追加
        const dhPitcher = restored.find((r) => r.order === 0);
        if (dhPitcher) {
          fullLineup.push({
            order: fullLineup.length + 1,
            position: dhPitcher.position || "1",
            playerId: dhPitcher.playerId || "",
            name: dhPitcher.name || "",
            uniformNumber: dhPitcher.uniformNumber || "",
          });
        }

        setMyLineup(fullLineup);
        toast.success(`テンプレート「${template.name}」を適用しました`);
      }
    } catch (error) {
      console.error(error);
      toast.error("テンプレートの読み込みに失敗しました");
    }
  };

  // 相手スタメン一括ダミー生成
  const handleFillDummyOpponent = () => {
    setOpponentLineup((prev) =>
      prev.map((p, i) => ({
        ...p,
        position: i < 9 ? String(i + 1) : "DH",
        name: `相手打者 ${i + 1}`,
      }))
    );
    toast.success("相手スタメンを一括生成しました");
  };

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

      if (isDemoTeamId(targetTeamId)) {
        const demoId = `demo-custom-${Date.now()}`;
        const createdDemoMatch: Match = {
          id: demoId,
          opponent: opponentTrimmed,
          date: datePayload,
          status: "scheduled",
          matchType: newMatchType,
          tournamentName: newMatchType !== "practice" ? newTournamentName.trim() : undefined,
          battingOrder: newBattingOrder,
          surfaceDetails: newVenue.trim() || "グラウンド",
          venueName: newVenue.trim() || "グラウンド",
          innings: 7,
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
            tournamentName: newMatchType !== "practice" ? newTournamentName.trim() : null,
            venueName: newVenue.trim() || "グラウンド",
            battingOrder: newBattingOrder,
          },
          ...prev,
        ]);
        setSelectedMatchId(demoId);
        router.replace(`/liff/matches/lineup?id=${demoId}`);
        setIsCreateMatchModalOpen(false);
        setNewOpponent("");
        toast.success("新しい試合を作成しました（デモ）");
        return;
      }

      const defaultInnings =
        typeof window !== "undefined"
          ? Number(localStorage.getItem("iscore_setting_default_innings") || "7")
          : 7;

      const res = await fetch("/api/matches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: targetTeamId,
          opponent: opponentTrimmed,
          date: datePayload,
          matchType: newMatchType,
          tournamentName: newMatchType !== "practice" ? newTournamentName.trim() : undefined,
          battingOrder: newBattingOrder,
          surfaceDetails: newVenue.trim() || undefined,
          innings: (defaultInnings === 6 || defaultInnings === 9 ? defaultInnings : 7) as 6 | 7 | 9,
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

  // スタメン・控え・欠席の保存処理（Web版と完全互換のAPIに保存）
  const handleSaveLineups = async () => {
    if (!selectedMatchId) {
      toast.error("登録対象の試合を選択してください");
      return;
    }

    setIsSaving(true);
    try {
      const filledOpponentLineup: OpponentLineupSlot[] = opponentLineup.map((p) => {
        const hasName = Boolean(p.name && p.name.trim() !== "");
        const hasPos = Boolean(p.position && p.position !== "");
        return {
          ...p,
          name: hasName ? p.name : `相手打者 ${p.order}`,
          position: hasPos ? p.position : p.order <= 9 ? String(p.order) : "DH",
        };
      });

      const payload: MatchLineupsPayload = {
        myLineup,
        opponentLineup: filledOpponentLineup,
        myAttendance: attendance,
      };

      if (isDemoMatchId(selectedMatchId)) {
        saveDemoMatchLineups(selectedMatchId, payload);
        setOpponentLineup(filledOpponentLineup);
        toast.success("スタメン・控え・欠席を保存しました！（デモ）");
        router.push(`/liff/matches?id=${encodeURIComponent(selectedMatchId)}`);
        return;
      }

      const res = await fetch(`/api/matches/${encodeURIComponent(selectedMatchId)}/lineups`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save lineups");

      setOpponentLineup(filledOpponentLineup);
      toast.success("スタメン・控え・欠席を保存しました！");
      router.push(`/liff/matches?id=${encodeURIComponent(selectedMatchId)}`);
    } catch (error) {
      console.error(error);
      toast.error("スタメンの保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const startingPlayerIds = useMemo(
    () => myLineup.map((p) => p.playerId).filter(Boolean),
    [myLineup]
  );
  const remainingPlayers = useMemo(
    () => teamPlayers.filter((p) => !startingPlayerIds.includes(p.id)),
    [teamPlayers, startingPlayerIds]
  );
  const benchCount = useMemo(
    () => remainingPlayers.filter((p) => attendance[p.id] !== "absent").length,
    [remainingPlayers, attendance]
  );
  const absentCount = useMemo(
    () => remainingPlayers.filter((p) => attendance[p.id] === "absent").length,
    [remainingPlayers, attendance]
  );

  // LINE共有・コピー用テキスト生成
  const shareSummaryText = useMemo(() => {
    const opp = currentMatch?.opponent || "対戦相手";
    const dt = currentMatch?.date || "";
    return formatLineupShareText(opp, dt, myLineup, remainingPlayers, attendance);
  }, [currentMatch?.opponent, currentMatch?.date, myLineup, remainingPlayers, attendance]);

  const handleCopyLineupText = async () => {
    try {
      await navigator.clipboard.writeText(shareSummaryText);
      setIsCopied(true);
      toast.success("出場メンバー表をコピーしました！LINEに貼り付けて共有できます");
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

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
          title="スタメン・出欠登録"
          subtitle="打順・守備位置・控え・欠席の設定"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
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
            <button
              type="button"
              onClick={() => setIsCreateMatchModalOpen(true)}
              className="px-2.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新規試合</span>
            </button>
          }
        />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⚾ 対象試合カード & 試合切替セレクター
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {!selectedMatchId && !isLoading ? (
          <div className="space-y-3">
            <EmptyState
              icon={Shield}
              title="登録されている試合がありません"
              description="まずは試合予定を作成すると、スタメン・控え・欠席を登録できます"
            />
            <Button
              type="button"
              onClick={() => setIsCreateMatchModalOpen(true)}
              className="w-full h-12 rounded-2xl font-black text-sm gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              新しい試合予定を作成する
            </Button>
          </div>
        ) : (
          <section className="rounded-2xl bg-card border-2 border-primary/25 p-3.5 shadow-xs space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span
                    className={cn(
                      "text-[10px] font-black px-1.5 py-0.5 rounded border",
                      currentMatch?.matchType === "official"
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                        : currentMatch?.matchType === "exchange"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                    )}
                  >
                    {currentMatch?.matchType === "official"
                      ? "公式戦"
                      : currentMatch?.matchType === "exchange"
                      ? "交流戦"
                      : "OP戦"}
                  </span>
                  {currentMatch?.tournamentName && (
                    <span className="text-[11px] font-bold text-muted-foreground truncate">
                      {currentMatch.tournamentName}
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-[10px] font-black px-1.5 py-0.5 rounded",
                      currentMatch?.status === "live"
                        ? "bg-rose-600 text-white"
                        : currentMatch?.status === "finished"
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary"
                    )}
                  >
                    {currentMatch?.status === "live"
                      ? "試合中"
                      : currentMatch?.status === "finished"
                      ? "試合終了"
                      : "試合予定"}
                  </span>
                </div>

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

              {matchesList.length > 1 && (
                <button
                  type="button"
                  onClick={() => setIsMatchPickerOpen((prev) => !prev)}
                  className="px-2.5 py-1.5 rounded-xl bg-muted hover:bg-muted/80 border border-border text-[11px] font-black text-foreground flex items-center gap-1 shrink-0 active:scale-95 transition-all"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
                  <span>試合切替</span>
                </button>
              )}
            </div>

            {/* 試合切替ドロワー */}
            {isMatchPickerOpen && matchesList.length > 1 && (
              <div className="pt-2.5 border-t border-border/60 space-y-1.5 max-h-52 overflow-y-auto">
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
                          ? "bg-primary/10 border-primary text-foreground"
                          : "bg-background hover:bg-muted/50 border-border/60 text-foreground"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black truncate">vs {m.opponent}</p>
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
                            ? "bg-rose-500/15 text-rose-600"
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
            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                🔀 自チーム / 相手チーム タブ切り替え（Web版流用）
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <div className="flex bg-muted/60 p-1 rounded-2xl border border-border">
              <button
                type="button"
                onClick={() => setActiveTab("myTeam")}
                className={cn(
                  "flex-1 py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  activeTab === "myTeam"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Shield className="w-4 h-4" />
                <span>自チーム</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("opponent")}
                className={cn(
                  "flex-1 py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  activeTab === "opponent"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Swords className="w-4 h-4" />
                <span>相手チーム</span>
              </button>
            </div>

            {/* テンプレート読込・保存 / 相手一括生成 */}
            <div className="flex justify-between items-center">
              {activeTab === "myTeam" ? (
                <div className="flex gap-2 w-full">
                  <div className="relative flex-1">
                    <FolderOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary pointer-events-none" />
                    <select
                      value={selectedTemplateId}
                      onChange={handleLoadTemplate}
                      className="w-full h-11 bg-card border-2 border-border rounded-2xl pl-9 pr-8 text-xs font-black text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer"
                    >
                      <option value="">テンプレート読込</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsTemplateModalOpen(true)}
                    className="h-11 rounded-2xl border-2 border-primary/25 bg-card text-primary font-black px-4 text-xs"
                  >
                    <Save className="w-4 h-4 mr-1.5" />
                    テンプレ保存
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={handleFillDummyOpponent}
                  variant="outline"
                  className="w-full h-11 rounded-2xl border-2 border-rose-500/30 bg-card text-rose-600 dark:text-rose-400 font-black text-xs"
                >
                  <Wand2 className="w-4 h-4 mr-1.5" />
                  相手スタメンを一括生成
                </Button>
              )}
            </div>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                ⚾ 【セクション1】スターティングメンバー
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <UserStar className="w-4 h-4 text-primary" />
                  <span>スターティングメンバー</span>
                </h3>
                {activeTab === "myTeam" && (
                  <span className="text-[11px] font-black bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
                    スタメン: {startingPlayerIds.length} / {myLineup.length}人
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {(activeTab === "myTeam" ? myLineup : opponentLineup).map((player, index) => {
                  const disabledPos = getDisabledPositions(
                    activeTab === "myTeam" ? myLineup : opponentLineup,
                    index
                  );
                  const isCompleted =
                    activeTab === "myTeam"
                      ? Boolean(player.position && (player as MyLineupSlot).playerId)
                      : Boolean(player.position && player.name.trim());

                  const posDef = LINEUP_POSITIONS.find((p) => p.id === player.position);

                  return (
                    <div
                      key={index}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-2xl transition-all",
                        isCompleted
                          ? "bg-card border-2 border-primary/35 shadow-xs"
                          : "bg-card border-2 border-border border-dashed"
                      )}
                    >
                      <div
                        className={cn(
                          "w-7 text-center font-black italic flex items-center justify-center text-xs shrink-0",
                          isCompleted ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        {index + 1}
                      </div>

                      {activeTab === "myTeam" ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (teamPlayers.length === 0) {
                              toast.error("チームに選手が登録されていません。Web版またはメンバー管理から選手を登録してください。");
                              return;
                            }
                            setActiveSelectionIndex(index);
                            setPlayerSearchQuery("");
                            const currentSlot = myLineup[index];
                            setTempSelectedPlayer(
                              currentSlot.playerId
                                ? {
                                    id: currentSlot.playerId,
                                    name: currentSlot.name,
                                    uniformNumber: currentSlot.uniformNumber || null,
                                  }
                                : null
                            );
                            setModalStep(currentSlot.playerId ? "position" : "player");
                          }}
                          className="flex-1 h-11 px-2.5 bg-transparent border-none font-bold text-sm rounded-xl focus:outline-none hover:bg-muted/40 active:bg-muted/60 transition-colors flex items-center justify-between min-w-0 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 overflow-hidden mr-2">
                            {posDef ? (
                              <span
                                className={cn(
                                  "px-2 py-1 rounded-lg text-white font-black text-[10px] shrink-0",
                                  posDef.color
                                )}
                              >
                                {posDef.label}
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-lg bg-muted text-muted-foreground font-black text-[10px] shrink-0 border border-border">
                                守備未設定
                              </span>
                            )}

                            <span
                              className={cn(
                                "truncate text-left text-xs sm:text-sm",
                                myLineup[index].playerId
                                  ? "font-black text-foreground"
                                  : "font-bold text-muted-foreground"
                              )}
                            >
                              {myLineup[index].playerId
                                ? `${
                                    myLineup[index].uniformNumber
                                      ? `#${myLineup[index].uniformNumber} `
                                      : ""
                                  }${myLineup[index].name}`
                                : "タップして選手・守備を選択..."}
                            </span>
                          </div>
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        </button>
                      ) : (
                        <>
                          <select
                            value={player.position}
                            onChange={(e) => {
                              const list = [...opponentLineup];
                              list[index] = { ...list[index], position: e.target.value };
                              setOpponentLineup(list);
                            }}
                            className={cn(
                              "w-16 h-11 rounded-xl font-black text-xs appearance-none text-center shadow-2xs cursor-pointer shrink-0",
                              posDef
                                ? `${posDef.color} text-white`
                                : "bg-muted text-foreground border border-border"
                            )}
                          >
                            <option value="">守備</option>
                            {LINEUP_POSITIONS.map(
                              (p) =>
                                !disabledPos.includes(p.id) && (
                                  <option key={p.id} value={p.id}>
                                    {p.label}
                                  </option>
                                )
                            )}
                          </select>

                          <Input
                            placeholder="相手選手名"
                            className={cn(
                              "flex-1 h-11 border-none bg-transparent font-bold text-sm focus-visible:ring-0",
                              isCompleted ? "text-foreground" : "text-muted-foreground"
                            )}
                            value={player.name}
                            onChange={(e) => {
                              const list = [...opponentLineup];
                              list[index] = { ...list[index], name: e.target.value };
                              setOpponentLineup(list);
                            }}
                          />
                        </>
                      )}

                      {index >= 9 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveBatter(activeTab, index)}
                          className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 active:scale-95 transition-all shrink-0 cursor-pointer"
                          title="この打順枠を削除"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}

                      {isCompleted && (
                        <div className="w-6 flex justify-center shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* EDH（全員打撃）対応: 打順追加ボタン */}
              <Button
                type="button"
                variant="outline"
                onClick={() => handleAddBatter(activeTab)}
                className="w-full h-11 rounded-2xl border-2 border-dashed border-primary/35 bg-card text-primary font-black text-xs flex items-center justify-center gap-1.5 hover:bg-primary/5 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>打順（バッター）を追加（全員打撃対応）</span>
              </Button>
            </section>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                👥 【セクション2】ベンチ（控え）・欠席メンバー
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === "myTeam" && (
              <section className="space-y-3 pt-4 border-t-2 border-border/60 border-dashed">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span>ベンチ（控え）・欠席メンバー</span>
                  </h3>
                  <div className="flex gap-1.5">
                    <span className="text-[10px] font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                      控え: {benchCount}人
                    </span>
                    <span className="text-[10px] font-black bg-rose-500/15 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full">
                      欠席: {absentCount}人
                    </span>
                  </div>
                </div>

                {teamPlayers.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="選手がまだ登録されていません"
                    description="チームに選手名簿が登録されると、スタメン・控え・欠席の振り分けが行えます"
                  />
                ) : remainingPlayers.length === 0 ? (
                  <div className="text-center py-6 bg-card rounded-2xl border border-border">
                    <p className="text-xs font-black text-muted-foreground">
                      全選手がスタメンに登録されています
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {remainingPlayers.map((player) => {
                      const status = attendance[player.id] || "bench";
                      const isAbsent = status === "absent";
                      const isLockedBySchedule = originalAbsents.includes(player.id);

                      return (
                        <div
                          key={player.id}
                          className={cn(
                            "flex items-center justify-between p-2.5 pl-3.5 rounded-2xl transition-all",
                            isAbsent
                              ? "bg-card border-2 border-rose-500/30 shadow-2xs"
                              : "bg-card border-2 border-border"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 mr-2">
                            <span
                              className={cn(
                                "text-xs font-black min-w-[24px] text-center px-1 py-0.5 rounded-md shrink-0",
                                isAbsent
                                  ? "bg-rose-500/10 text-rose-600/70 dark:text-rose-400/70"
                                  : "bg-primary/10 text-primary"
                              )}
                            >
                              {player.uniformNumber ? `#${player.uniformNumber}` : "-"}
                            </span>
                            <div className="min-w-0">
                              <span
                                className={cn(
                                  "text-sm font-black block truncate",
                                  isAbsent
                                    ? "text-rose-600/70 dark:text-rose-400/70 line-through"
                                    : "text-foreground"
                                )}
                              >
                                {player.name}
                              </span>
                              {isLockedBySchedule && (
                                <span className="text-[9.5px] font-bold text-rose-600 dark:text-rose-400 block">
                                  ※出欠表で欠席登録済
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 控え / 欠席 セグメントトグル */}
                          <div className="flex bg-muted p-1 rounded-xl w-[136px] shrink-0 border border-border/60">
                            <button
                              type="button"
                              onClick={() => {
                                if (isLockedBySchedule) {
                                  toast.error("出欠管理で欠席登録されているため、控えに変更できません。");
                                  return;
                                }
                                setAttendance((prev) => ({ ...prev, [player.id]: "bench" }));
                              }}
                              disabled={isLockedBySchedule}
                              className={cn(
                                "flex-1 flex items-center justify-center py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer",
                                status === "bench"
                                  ? "bg-card text-emerald-600 dark:text-emerald-400 shadow-xs"
                                  : "text-muted-foreground hover:text-foreground",
                                isLockedBySchedule && "opacity-45 cursor-not-allowed"
                              )}
                            >
                              <UserCheck className="w-3 h-3 mr-1" />
                              控え
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setAttendance((prev) => ({ ...prev, [player.id]: "absent" }))
                              }
                              className={cn(
                                "flex-1 flex items-center justify-center py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer",
                                status === "absent"
                                  ? "bg-card text-rose-600 dark:text-rose-400 shadow-xs"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <UserMinus className="w-3 h-3 mr-1" />
                              欠席
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                💾 保存 & LINEテキストコピー アクション
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <div className="pt-4 space-y-2.5">
              <Button
                type="button"
                onClick={handleSaveLineups}
                disabled={isSaving}
                className="w-full h-14 rounded-2xl text-base font-black tracking-wide shadow-md shadow-primary/25 active:scale-[0.98] transition-all gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>保存中...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>スタメン・出欠を保存する</span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleCopyLineupText}
                className="w-full h-11 rounded-2xl border-border bg-card font-black text-xs text-foreground hover:bg-muted gap-1.5"
              >
                {isCopied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>メンバー表をコピーしました！</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-primary" />
                    <span>LINE連絡用テキストをコピー</span>
                  </>
                )}
              </Button>
            </div>
          </>
        ) : null}

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          📁 テンプレート保存モーダル (z-[60] でボトムナビより前面)
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isTemplateModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-150"
          onClick={() => setIsTemplateModalOpen(false)}
        >
          <div
            className="bg-card w-full max-w-sm rounded-3xl border-2 border-border p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-foreground">テンプレート保存</h3>
                <p className="text-[11px] font-bold text-muted-foreground">
                  現在のスタメンを基本オーダーとして保存します
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1.5 rounded-full bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <Input
              placeholder="例：Aチーム 基本オーダー"
              className="h-12 rounded-2xl bg-muted/50 border-border font-bold text-sm"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />

            <div className="flex gap-2.5 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTemplateModalOpen(false)}
                className="flex-1 h-12 rounded-2xl font-black"
              >
                キャンセル
              </Button>
              <Button
                type="button"
                onClick={handleSaveTemplate}
                className="flex-1 h-12 rounded-2xl font-black shadow-sm"
              >
                保存する
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ⚾ 選手・守備位置 2ステップ選択モーダル（Web版完全流用, z-[60]）
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {activeSelectionIndex !== null && myLineup[activeSelectionIndex] && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/65 animate-in fade-in duration-150"
          onClick={() => {
            setActiveSelectionIndex(null);
            setTempSelectedPlayer(null);
          }}
        >
          <div
            className="bg-card w-full max-w-md rounded-3xl border-2 border-border p-5 shadow-2xl flex flex-col max-h-[82vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-black text-foreground">
                  {modalStep === "player" ? "選手を選択" : "守備位置を選択"}
                </h3>
                <p className="text-[11px] text-muted-foreground font-bold">
                  {activeSelectionIndex + 1}番打者
                  {modalStep === "position" && tempSelectedPlayer
                    ? ` : ${tempSelectedPlayer.uniformNumber ? `#${tempSelectedPlayer.uniformNumber} ` : ""}${tempSelectedPlayer.name}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveSelectionIndex(null);
                  setTempSelectedPlayer(null);
                }}
                className="p-2 rounded-full bg-muted text-muted-foreground hover:text-foreground"
                aria-label="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalStep === "player" ? (
              /* ステップ1: 選手選択 */
              <>
                <div className="my-3 relative">
                  <Input
                    placeholder="選手名または背番号で検索..."
                    value={playerSearchQuery}
                    onChange={(e) => setPlayerSearchQuery(e.target.value)}
                    className="h-11 rounded-xl bg-muted/50 border-border font-bold pl-3.5 pr-12 text-sm"
                  />
                  {playerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setPlayerSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground hover:text-foreground"
                    >
                      クリア
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 min-h-[260px]">
                  {/* 選択解除ボタン */}
                  <button
                    type="button"
                    onClick={() => {
                      const list = [...myLineup];
                      list[activeSelectionIndex] = {
                        ...list[activeSelectionIndex],
                        playerId: "",
                        name: "",
                        uniformNumber: "",
                        position: "",
                      };
                      setMyLineup(list);
                      setActiveSelectionIndex(null);
                      setTempSelectedPlayer(null);
                      toast.success(`${activeSelectionIndex + 1}番の選択を解除しました`);
                    }}
                    className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all cursor-pointer"
                  >
                    選択をクリアする（空欄にする）
                  </button>

                  {(() => {
                    const query = playerSearchQuery.trim().toLowerCase();
                    const filtered = teamPlayers.filter((p) => {
                      const nameMatch = p.name.toLowerCase().includes(query);
                      const numMatch = p.uniformNumber ? p.uniformNumber.includes(query) : false;
                      return nameMatch || numMatch;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-10">
                          <p className="text-xs font-bold text-muted-foreground">選手が見つかりません</p>
                        </div>
                      );
                    }

                    const disabledPlayers = getDisabledPlayers(myLineup, activeSelectionIndex);

                    return filtered.map((p) => {
                      const isAlreadySelected = disabledPlayers.includes(p.id);
                      const isAbsent = attendance[p.id] === "absent";
                      const isDisabled = isAlreadySelected || isAbsent;
                      const assignedOrder = myLineup.find(
                        (item, idx) => idx !== activeSelectionIndex && item.playerId === p.id
                      )?.order;

                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => {
                            setTempSelectedPlayer(p);
                            setModalStep("position");
                          }}
                          className={cn(
                            "w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left cursor-pointer",
                            myLineup[activeSelectionIndex].playerId === p.id
                              ? "bg-primary/10 border-primary text-primary"
                              : "bg-card hover:bg-muted/40 border-border",
                            isDisabled && "opacity-45 cursor-not-allowed bg-muted/30 hover:bg-muted/30"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-xs font-black min-w-[26px] text-primary">
                              {p.uniformNumber ? `#${p.uniformNumber}` : "-"}
                            </span>
                            <span className="text-sm font-black text-foreground truncate">
                              {p.name}
                            </span>
                          </div>

                          <div className="flex gap-1.5 items-center shrink-0 ml-2">
                            {isAlreadySelected && (
                              <span className="text-[10px] font-black bg-muted text-muted-foreground px-2 py-0.5 rounded-md">
                                選択中 ({assignedOrder}番)
                              </span>
                            )}
                            {isAbsent && (
                              <span className="text-[10px] font-black bg-rose-500/15 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-md">
                                欠席
                              </span>
                            )}
                            {!isAlreadySelected && !isAbsent && (
                              <span className="text-[10px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md">
                                起用可能
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </>
            ) : (
              /* ステップ2: 守備位置選択 */
              <div className="pt-3 flex flex-col flex-1 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setModalStep("player")}
                  className="text-xs text-primary font-black flex items-center gap-1 hover:underline mb-3 self-start cursor-pointer"
                >
                  ← 選手選択に戻る
                </button>

                <p className="text-xs text-muted-foreground font-bold mb-3">
                  {tempSelectedPlayer?.name} 選手の守備位置を選択してください
                </p>

                <div className="grid grid-cols-2 gap-2.5 flex-1 overflow-y-auto pr-0.5">
                  {(() => {
                    const disabledPos = getDisabledPositions(myLineup, activeSelectionIndex);

                    return LINEUP_POSITIONS.map((pos) => {
                      const isPosDisabled = disabledPos.includes(pos.id);
                      const isCurrentPos = myLineup[activeSelectionIndex].position === pos.id;

                      return (
                        <button
                          key={pos.id}
                          type="button"
                          disabled={isPosDisabled}
                          onClick={() => {
                            if (!tempSelectedPlayer) return;
                            const list = [...myLineup];
                            list[activeSelectionIndex] = {
                              ...list[activeSelectionIndex],
                              playerId: tempSelectedPlayer.id,
                              name: tempSelectedPlayer.name,
                              uniformNumber: tempSelectedPlayer.uniformNumber || "",
                              position: pos.id,
                            };
                            setMyLineup(list);
                            setActiveSelectionIndex(null);
                            setTempSelectedPlayer(null);
                            toast.success(
                              `${activeSelectionIndex + 1}番に ${tempSelectedPlayer.name} (${pos.label}) を設定しました`
                            );
                          }}
                          className={cn(
                            "h-12 rounded-2xl font-black text-xs text-white transition-all flex items-center justify-center shadow-sm relative cursor-pointer active:scale-95",
                            pos.color,
                            isCurrentPos && "ring-4 ring-primary/40",
                            isPosDisabled &&
                              "opacity-30 cursor-not-allowed bg-zinc-400 dark:bg-zinc-800 text-zinc-500 shadow-none"
                          )}
                        >
                          <span>{pos.label}</span>
                          {isPosDisabled && (
                            <span className="absolute bottom-1 right-2 text-[9px] opacity-80">
                              選択済
                            </span>
                          )}
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ➕ 新規試合予定作成モーダル (z-[60])
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isCreateMatchModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/65 animate-in fade-in duration-150"
          onClick={() => setIsCreateMatchModalOpen(false)}
        >
          <form
            onSubmit={handleCreateMatch}
            onClick={(e) => e.stopPropagation()}
            className="bg-card w-full max-w-md rounded-3xl border-2 border-border p-5 shadow-2xl space-y-3.5 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h3 className="text-base font-black text-foreground">新しい試合予定を作成</h3>
                <p className="text-[11px] font-bold text-muted-foreground">
                  作成後すぐにスタメン・控え・欠席を登録できます
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateMatchModalOpen(false)}
                className="p-1.5 rounded-full bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-foreground">対戦相手 *</label>
              <Input
                required
                placeholder="例：ブルーサンダース"
                value={newOpponent}
                onChange={(e) => setNewOpponent(e.target.value)}
                className="h-11 rounded-xl bg-muted/40 border-border font-bold text-sm"
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
                  className="h-11 rounded-xl bg-muted/40 border-border font-bold text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-black text-foreground">開始予定時刻</label>
                <Input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="h-11 rounded-xl bg-muted/40 border-border font-bold text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-foreground">試合種別</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "practice", label: "練習試合" },
                    { id: "official", label: "公式戦" },
                    { id: "exchange", label: "交流戦" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setNewMatchType(item.id)}
                    className={cn(
                      "py-2 rounded-xl text-xs font-black border transition-all cursor-pointer",
                      newMatchType === item.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/40 text-muted-foreground border-border"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {newMatchType !== "practice" && (
              <div className="space-y-1">
                <label className="text-xs font-black text-foreground">大会名</label>
                <Input
                  placeholder="例：秋季大会 2回戦"
                  value={newTournamentName}
                  onChange={(e) => setNewTournamentName(e.target.value)}
                  className="h-11 rounded-xl bg-muted/40 border-border font-bold text-sm"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-black text-foreground">先攻・後攻（仮設定可）</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewBattingOrder("first")}
                  className={cn(
                    "py-2 rounded-xl text-xs font-black border transition-all cursor-pointer",
                    newBattingOrder === "first"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border"
                  )}
                >
                  先攻（表）
                </button>
                <button
                  type="button"
                  onClick={() => setNewBattingOrder("second")}
                  className={cn(
                    "py-2 rounded-xl text-xs font-black border transition-all cursor-pointer",
                    newBattingOrder === "second"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border"
                  )}
                >
                  後攻（裏）
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-foreground">球場・グラウンド</label>
              <Input
                placeholder="例：多摩川緑地野球場"
                value={newVenue}
                onChange={(e) => setNewVenue(e.target.value)}
                className="h-11 rounded-xl bg-muted/40 border-border font-bold text-sm"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateMatchModalOpen(false)}
                className="flex-1 h-12 rounded-2xl font-black"
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
          </form>
        </div>
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

