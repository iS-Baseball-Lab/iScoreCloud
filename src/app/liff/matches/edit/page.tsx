// filepath: src/app/liff/matches/edit/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff, useScoreTeamDisplayName } from "@/components/liff/LiffProvider";
import { EmptyState } from "@/components/layout/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Clock,
  MapPin,
  Trophy,
  Users,
  Video,
  Save,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  X,
  Plus,
  Minus,
  Shield,
  Hash,
  Tent,
  Building2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import {
  getDemoMatchById,
  isDemoMatchId,
  saveCustomDemoMatch,
} from "@/lib/liff/demo-lineup";
import type { Match, MatchStatus } from "@/types/match";

// ━━━ APIレスポンス型定義 (any排除) ━━━
type EditableMatchType = "official" | "exchange" | "practice";
type EditableBattingOrder = "first" | "second";
type EditableBenchSide = "1B" | "3B" | "unknown";

interface MatchDetailApiResponse {
  success?: boolean;
  match?: Match & { teamId?: string };
  error?: string;
}

interface UpdateMatchApiResponse {
  success?: boolean;
  error?: string;
}

interface LiffGroundVenueItem {
  id: string;
  name: string;
  shortName: string;
  address: string;
  category?: string;
  categoryLabel?: string;
}

interface LiffGroundsApiResponse {
  success?: boolean;
  venues?: LiffGroundVenueItem[];
}

interface LiffTournamentItem {
  id: string;
  name: string;
  season: string;
  category: string;
}

interface LiffTournamentsApiResponse {
  success?: boolean;
  tournaments?: LiffTournamentItem[];
}

/**
 * DB上の様々な日付文字列（"2026-11-08 09:30", "2026/8/9", "2026-11-08T09:30～" 等）から
 * `<input type="date">` 用の YYYY-MM-DD と `<input type="time">` 用の HH:mm を安全に分離する
 */
function splitMatchDateAndTime(rawDate: string | undefined | null): {
  date: string;
  time: string;
} {
  const cleaned = (rawDate || "")
    .trim()
    .replace(/[（(][日月火水木金土][)）]/g, "")
    .trim();
  if (!cleaned) {
    return { date: "", time: "" };
  }

  const matched = cleaned.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/
  );
  if (matched) {
    const [, yyyy, mm, dd, hh, min] = matched;
    return {
      date: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
      time: hh !== undefined && min !== undefined ? `${hh.padStart(2, "0")}:${min}` : "",
    };
  }

  return { date: cleaned.slice(0, 10), time: "" };
}

function parseStoredInningArray(raw: unknown): Array<number | null> {
  if (Array.isArray(raw)) {
    return raw.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((v) =>
          typeof v === "number" && Number.isFinite(v) ? v : null
        );
      }
    } catch {
      return [];
    }
  }
  return [];
}

function toInningInputCells(scores: Array<number | null>, targetLen: number): string[] {
  return Array.from({ length: targetLen }, (_, idx) => {
    const v = scores[idx];
    return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
  });
}

function serializeInningInputs(cells: string[]): Array<number | null> {
  const mapped: Array<number | null> = cells.map((c) => {
    const trimmed = c.trim();
    if (trimmed === "") return null;
    const num = Number(trimmed);
    return Number.isFinite(num) && num >= 0 ? Math.floor(num) : null;
  });
  while (mapped.length > 0 && mapped[mapped.length - 1] === null) {
    mapped.pop();
  }
  return mapped;
}

function sumInningInputs(cells: string[]): number {
  return cells.reduce((acc, c) => {
    const trimmed = c.trim();
    if (!trimmed) return acc;
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? acc + Math.floor(n) : acc;
  }, 0);
}

function LiffMatchEditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("id") || searchParams.get("matchId") || "";
  const { currentTeam } = useLiff();
  const { scoreTeamName } = useScoreTeamDisplayName("自チーム");

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  // 元データメタ情報
  const [loadedMatch, setLoadedMatch] = useState<(Match & { teamId?: string }) | null>(
    null
  );
  const [hasScorebook, setHasScorebook] = useState<boolean>(false);

  // 基本情報フォームステート
  const [opponent, setOpponent] = useState<string>("");
  const [matchDate, setMatchDate] = useState<string>("");
  const [matchTime, setMatchTime] = useState<string>("");
  const [matchType, setMatchType] = useState<EditableMatchType>("practice");
  const [tournamentName, setTournamentName] = useState<string>("");
  const [battingOrder, setBattingOrder] = useState<EditableBattingOrder>("first");
  const [benchSide, setBenchSide] = useState<EditableBenchSide>("unknown");
  const [innings, setInnings] = useState<number>(7);
  const [status, setStatus] = useState<MatchStatus>("scheduled");
  const [youtubeUrl, setYoutubeUrl] = useState<string>("");

  // 球場・グラウンド選択ステート
  const [venues, setVenues] = useState<LiffGroundVenueItem[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [customVenueText, setCustomVenueText] = useState<string>("");
  const [surfaceNote, setSurfaceNote] = useState<string>("");
  const [showVenueSuggestions, setShowVenueSuggestions] = useState<boolean>(false);

  // 大会候補ステート
  const [tournaments, setTournaments] = useState<LiffTournamentItem[]>([]);
  const [showTournamentSuggestions, setShowTournamentSuggestions] =
    useState<boolean>(false);

  // イニングスコア編集ステート（未変更時はDB既存スコアをそのまま温存）
  const [myInnings, setMyInnings] = useState<string[]>(() => Array(7).fill(""));
  const [opponentInnings, setOpponentInnings] = useState<string[]>(() =>
    Array(7).fill("")
  );
  const [isScoreDirty, setIsScoreDirty] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setShowDeleteModal(false);
  }, [matchId, currentTeam?.id]);

  const navigateBackToMatchDetail = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else if (matchId) {
      router.replace(`/liff/matches?id=${encodeURIComponent(matchId)}`);
    } else {
      router.replace("/liff/matches");
    }
  }, [matchId, router]);

  // 初期データ取得
  useEffect(() => {
    if (!matchId) {
      setLoadError("編集対象の試合IDが指定されていません");
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadInitialData() {
      try {
        setIsLoading(true);
        setLoadError(null);

        const fallbackTeamId =
          currentTeam?.id ||
          (typeof window !== "undefined"
            ? localStorage.getItem("iscore_selectedTeamId")
            : null) ||
          "";

        // デモ試合の場合
        if (isDemoMatchId(matchId)) {
          const demoMatch = getDemoMatchById(matchId);
          if (!demoMatch) {
            throw new Error("指定された試合が見つかりませんでした");
          }
          if (cancelled) return;

          const { date, time } = splitMatchDateAndTime(demoMatch.date);
          const normalizedType: EditableMatchType =
            demoMatch.matchType === "official"
              ? "official"
              : demoMatch.matchType === "exchange"
                ? "exchange"
                : "practice";
          const myArr = parseStoredInningArray(demoMatch.myInningScores);
          const oppArr = parseStoredInningArray(demoMatch.opponentInningScores);
          const effectiveInnings = Math.max(
            demoMatch.innings || 7,
            myArr.length,
            oppArr.length
          );

          setLoadedMatch(demoMatch);
          setHasScorebook(Boolean(demoMatch.hasScorebook));
          setOpponent(demoMatch.opponent || "");
          setMatchDate(date);
          setMatchTime(time);
          setMatchType(normalizedType);
          setTournamentName(demoMatch.tournamentName || "");
          setBattingOrder(demoMatch.battingOrder === "second" ? "second" : "first");
          setBenchSide(
            demoMatch.benchSide === "1B" || demoMatch.benchSide === "3B"
              ? demoMatch.benchSide
              : "unknown"
          );
          setInnings(effectiveInnings);
          setStatus(demoMatch.status || "scheduled");
          setYoutubeUrl(demoMatch.youtubeUrl || "");
          setSelectedVenueId(demoMatch.venueId || null);
          setCustomVenueText(demoMatch.venueName || demoMatch.surfaceDetails || "");
          setSurfaceNote(demoMatch.surfaceDetails || "");
          setMyInnings(toInningInputCells(myArr, effectiveInnings));
          setOpponentInnings(toInningInputCells(oppArr, effectiveInnings));
          setIsScoreDirty(false);
          return;
        }

        // 実データ並列取得（試合詳細 + LIFF球場一覧 + LIFF大会一覧）
        const [matchRes, groundsRes, tournamentsRes] = await Promise.all([
          fetch(`/api/matches/${encodeURIComponent(matchId)}`, {
            headers: { "x-iscore-bypass-cache": "1" },
          }),
          fetch(
            `/api/liff/grounds?teamId=${encodeURIComponent(fallbackTeamId || "")}`
          ).catch(() => null),
          fetch(
            `/api/liff/tournaments?teamId=${encodeURIComponent(fallbackTeamId || "")}`
          ).catch(() => null),
        ]);

        if (!matchRes.ok) {
          throw new Error("試合データの取得に失敗しました");
        }

        const matchJson = (await matchRes.json()) as MatchDetailApiResponse;
        if (!matchJson.match) {
          throw new Error(matchJson.error || "試合が見つかりませんでした");
        }

        if (cancelled) return;

        const m = matchJson.match;
        let loadedVenues: LiffGroundVenueItem[] = [];
        if (groundsRes && groundsRes.ok) {
          const gJson = (await groundsRes.json()) as LiffGroundsApiResponse;
          if (Array.isArray(gJson.venues)) {
            loadedVenues = gJson.venues.filter((v) => !v.id.startsWith("venue-"));
            setVenues(loadedVenues);
          }
        }

        if (tournamentsRes && tournamentsRes.ok) {
          const tJson = (await tournamentsRes.json()) as LiffTournamentsApiResponse;
          if (Array.isArray(tJson.tournaments)) {
            setTournaments(tJson.tournaments);
          }
        }

        const { date, time } = splitMatchDateAndTime(m.date);
        const normalizedType: EditableMatchType =
          m.matchType === "official"
            ? "official"
            : m.matchType === "exchange"
              ? "exchange"
              : "practice";

        const rawTournament = (m.tournamentName || m.tournament || "").trim();
        const cleanedTournament = ["練習試合", "OP戦"].includes(rawTournament)
          ? ""
          : rawTournament;

        const myArr = parseStoredInningArray(m.myInningScores);
        const oppArr = parseStoredInningArray(m.opponentInningScores);
        const baseInnings = m.innings || 7;
        const boardLen = Math.max(baseInnings, myArr.length, oppArr.length);

        const resolvedVid =
          m.venueId && loadedVenues.some((v) => v.id === m.venueId)
            ? m.venueId
            : m.venueId || null;
        const rawSurface = (m.surfaceDetails || "").trim();
        const rawVName = (m.venueName || "").trim();
        const rawVShort = (m.venueShortName || "").trim();

        setLoadedMatch(m);
        setHasScorebook(Boolean(m.hasScorebook));
        setOpponent(m.opponent || "");
        setMatchDate(date);
        setMatchTime(time);
        setMatchType(normalizedType);
        setTournamentName(cleanedTournament);
        setBattingOrder(m.battingOrder === "second" ? "second" : "first");
        setBenchSide(
          m.benchSide === "1B" || m.benchSide === "3B" ? m.benchSide : "unknown"
        );
        setInnings(baseInnings);
        setStatus(m.status || "scheduled");
        setYoutubeUrl(m.youtubeUrl || "");

        if (resolvedVid) {
          setSelectedVenueId(resolvedVid);
          setCustomVenueText(rawVName);
          const isDuplicateName =
            rawSurface === rawVName || (rawVShort !== "" && rawSurface === rawVShort);
          setSurfaceNote(isDuplicateName ? "" : rawSurface);
        } else {
          setSelectedVenueId(null);
          setCustomVenueText(rawSurface || rawVName || (m.venue || "").trim());
          setSurfaceNote("");
        }

        setMyInnings(toInningInputCells(myArr, boardLen));
        setOpponentInnings(toInningInputCells(oppArr, boardLen));
        setIsScoreDirty(false);
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "試合データの読み込みに失敗しました"
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, [matchId, currentTeam?.id]);

  // 規定イニング変更時にスコア入力配列の長さを調整（既存の延長回入力がある場合は切り捨てない）
  const scoreboardInningCount = useMemo(
    () => Math.max(innings, myInnings.length, opponentInnings.length),
    [innings, myInnings.length, opponentInnings.length]
  );

  const handleSelectPresetInnings = (nextInnings: number) => {
    setInnings(nextInnings);
    setMyInnings((prev) => {
      if (prev.length < nextInnings) {
        return [...prev, ...Array(nextInnings - prev.length).fill("")];
      }
      // 後ろが空欄のみの枠であれば規定イニングに合わせて縮小
      const trimmed = [...prev];
      while (trimmed.length > nextInnings && trimmed[trimmed.length - 1].trim() === "") {
        trimmed.pop();
      }
      return trimmed;
    });
    setOpponentInnings((prev) => {
      if (prev.length < nextInnings) {
        return [...prev, ...Array(nextInnings - prev.length).fill("")];
      }
      const trimmed = [...prev];
      while (trimmed.length > nextInnings && trimmed[trimmed.length - 1].trim() === "") {
        trimmed.pop();
      }
      return trimmed;
    });
  };

  const handleAddScoreInningColumn = () => {
    const nextLen = scoreboardInningCount + 1;
    setMyInnings((prev) => [...prev, ...Array(nextLen - prev.length).fill("")]);
    setOpponentInnings((prev) => [...prev, ...Array(nextLen - prev.length).fill("")]);
  };

  const handleRemoveScoreInningColumn = () => {
    if (scoreboardInningCount <= 1) return;
    const nextLen = scoreboardInningCount - 1;
    setMyInnings((prev) => prev.slice(0, nextLen));
    setOpponentInnings((prev) => prev.slice(0, nextLen));
    if (innings > nextLen) {
      setInnings(nextLen);
    }
    setIsScoreDirty(true);
  };

  const selectedVenueObj = useMemo(
    () => (selectedVenueId ? venues.find((v) => v.id === selectedVenueId) || null : null),
    [venues, selectedVenueId]
  );

  const filteredVenues = useMemo(() => {
    const q = customVenueText.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.shortName && v.shortName.toLowerCase().includes(q)) ||
        (v.address && v.address.toLowerCase().includes(q))
    );
  }, [venues, customVenueText]);

  const filteredTournaments = useMemo(() => {
    const q = tournamentName.trim().toLowerCase();
    if (!q) return tournaments;
    return tournaments.filter((t) => t.name.toLowerCase().includes(q));
  }, [tournaments, tournamentName]);

  const youtubeVideoId = useMemo(
    () => extractYouTubeVideoId(youtubeUrl.trim() || null),
    [youtubeUrl]
  );

  const myTeamName = scoreTeamName;
  const topTeamName =
    battingOrder === "second" ? opponent.trim() || "相手チーム" : myTeamName;
  const bottomTeamName =
    battingOrder === "second" ? myTeamName : opponent.trim() || "相手チーム";

  const computedMyTotal = useMemo(() => sumInningInputs(myInnings), [myInnings]);
  const computedOppTotal = useMemo(
    () => sumInningInputs(opponentInnings),
    [opponentInnings]
  );

  const displayMyTotal = isScoreDirty
    ? computedMyTotal
    : (loadedMatch?.myScore ?? computedMyTotal);
  const displayOppTotal = isScoreDirty
    ? computedOppTotal
    : (loadedMatch?.opponentScore ?? computedOppTotal);

  const handleSave = async () => {
    const opponentTrimmed = opponent.trim();
    if (!opponentTrimmed) {
      toast.error("対戦相手を入力してください");
      return;
    }
    if (!matchDate) {
      toast.error("試合日を入力してください");
      return;
    }
    if (youtubeUrl.trim() && !youtubeVideoId) {
      toast.error("有効なYouTube動画URLを入力してください");
      return;
    }

    setIsSaving(true);
    try {
      const combinedDate = matchTime ? `${matchDate} ${matchTime}` : matchDate;
      const effectiveTournamentName =
        matchType === "official" || matchType === "exchange"
          ? tournamentName.trim()
          : "";

      const effectiveSurfaceDetails = selectedVenueId
        ? surfaceNote.trim() || null
        : customVenueText.trim() || null;

      // デモ試合の保存
      if (isDemoMatchId(matchId) && loadedMatch) {
        const serializedMy = serializeInningInputs(myInnings);
        const serializedOpp = serializeInningInputs(opponentInnings);
        const updatedDemo: Match = {
          ...loadedMatch,
          opponent: opponentTrimmed,
          date: combinedDate,
          matchType,
          tournamentName: effectiveTournamentName || undefined,
          battingOrder,
          benchSide,
          innings,
          status,
          venueId: selectedVenueId,
          venueName: selectedVenueObj?.name || customVenueText.trim() || undefined,
          venueShortName: selectedVenueObj?.shortName || null,
          surfaceDetails: effectiveSurfaceDetails || undefined,
          youtubeUrl: youtubeUrl.trim() || null,
          myScore: isScoreDirty ? computedMyTotal : loadedMatch.myScore,
          opponentScore: isScoreDirty ? computedOppTotal : loadedMatch.opponentScore,
          myInningScores: isScoreDirty ? serializedMy : loadedMatch.myInningScores,
          opponentInningScores: isScoreDirty
            ? serializedOpp
            : loadedMatch.opponentInningScores,
        };
        saveCustomDemoMatch(updatedDemo);
        invalidateLiffApiCache();
        toast.success("試合の基本情報を更新しました（デモ）");
        navigateBackToMatchDetail();
        return;
      }

      const payload: Record<string, unknown> = {
        opponent: opponentTrimmed,
        date: combinedDate,
        matchType,
        tournamentName: effectiveTournamentName,
        battingOrder,
        benchSide,
        innings,
        status,
        venueId: selectedVenueId,
        surfaceDetails: effectiveSurfaceDetails,
        youtubeUrl: youtubeUrl.trim() || null,
      };

      // スコア入力欄を明示編集した場合、またはスコアブック未取込で予定/雨天中止へ戻した場合のみスコアを更新
      if (isScoreDirty && (status === "finished" || status === "live")) {
        payload.myScore = computedMyTotal;
        payload.opponentScore = computedOppTotal;
        payload.myInningScores = serializeInningInputs(myInnings);
        payload.opponentInningScores = serializeInningInputs(opponentInnings);
      } else if (
        !hasScorebook &&
        (status === "scheduled" || status === "rainout") &&
        loadedMatch &&
        loadedMatch.status !== status
      ) {
        payload.myScore = 0;
        payload.opponentScore = 0;
        payload.myInningScores = [];
        payload.opponentInningScores = [];
      }

      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as UpdateMatchApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "試合情報の更新に失敗しました");
      }

      invalidateLiffApiCache();
      toast.success("試合の基本情報を更新しました！");
      navigateBackToMatchDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "試合情報の更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMatch = async () => {
    if (!matchId || isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as UpdateMatchApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "試合の削除に失敗しました");
      }

      invalidateLiffApiCache();
      toast.success("試合データを削除しました");
      setShowDeleteModal(false);
      router.replace("/liff/matches");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "試合の削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1">
        <LiffHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-bold">試合情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (loadError || !loadedMatch) {
    return (
      <div className="flex flex-col flex-1">
        <LiffHeader />
        <div className="p-4 space-y-4">
          <LiffPageHeader
            title="試合の基本情報を編集"
            subtitle="EDIT MATCH INFO"
            showBack
          />
          <EmptyState
            icon={Shield}
            title="試合が見つかりませんでした"
            description={
              loadError || "指定された試合が存在しないか、削除された可能性があります"
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-5">
        <LiffPageHeader
          title="試合の基本情報を編集"
          subtitle="EDIT MATCH INFO"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <Calendar className="w-4 h-4" />
            </span>
          }
          showBack
        />

        {/* 📋 1. 対戦カード・日時・レギュレーション（A-3 上帯ダークキャップ） */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-black text-white truncate">
                対戦相手・日時・試合区分
              </span>
            </div>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black shrink-0">
              必須
            </span>
          </div>

          <div className="p-4 space-y-4">
            {/* 対戦相手 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>対戦相手チーム名</span>
                <span className="text-[10px] font-black text-rose-600">*</span>
              </label>
              <Input
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="例: レッドソックス"
                className="h-11 rounded-xl text-sm font-black bg-card border-border"
              />
            </div>

            {/* 試合日・開始時刻 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>試合日</span>
                  <span className="text-[10px] font-black text-rose-600">*</span>
                </label>
                <Input
                  type="date"
                  value={matchDate}
                  onChange={(e) => setMatchDate(e.target.value)}
                  className="h-11 rounded-xl text-sm font-bold bg-card border-border tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>開始時刻</span>
                  </label>
                  {matchTime && (
                    <button
                      type="button"
                      onClick={() => setMatchTime("")}
                      className="text-[10px] font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      クリア
                    </button>
                  )}
                </div>
                <Input
                  type="time"
                  value={matchTime}
                  onChange={(e) => setMatchTime(e.target.value)}
                  className="h-11 rounded-xl text-sm font-bold bg-card border-border tabular-nums"
                />
              </div>
            </div>

            {/* 試合種別 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>試合種別</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setMatchType("official")}
                  className={cn(
                    "h-9 rounded-lg text-xs font-black transition-all cursor-pointer",
                    matchType === "official"
                      ? "bg-amber-400 text-slate-950 shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  🏆 公式戦
                </button>
                <button
                  type="button"
                  onClick={() => setMatchType("exchange")}
                  className={cn(
                    "h-9 rounded-lg text-xs font-black transition-all cursor-pointer",
                    matchType === "exchange"
                      ? "bg-sky-500 text-white shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  🤝 交流戦
                </button>
                <button
                  type="button"
                  onClick={() => setMatchType("practice")}
                  className={cn(
                    "h-9 rounded-lg text-xs font-black transition-all cursor-pointer",
                    matchType === "practice"
                      ? "bg-card text-foreground border border-border shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  ⚾ OP戦
                </button>
              </div>
            </div>

            {/* 大会名（公式戦・交流戦のとき表示） */}
            {(matchType === "official" || matchType === "exchange") && (
              <div className="space-y-1.5 relative">
                <label className="text-[11px] font-black text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{matchType === "official" ? "大会名" : "交流戦・リーグ名"}</span>
                  </span>
                  {tournamentName && (
                    <button
                      type="button"
                      onClick={() => setTournamentName("")}
                      className="text-[10px] font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      クリア
                    </button>
                  )}
                </label>
                <Input
                  value={tournamentName}
                  onChange={(e) => {
                    setTournamentName(e.target.value);
                    setShowTournamentSuggestions(true);
                  }}
                  onFocus={() => setShowTournamentSuggestions(true)}
                  onBlur={() => {
                    setTimeout(() => setShowTournamentSuggestions(false), 180);
                  }}
                  placeholder="例: 川崎市秋季大会 2回戦（直接入力または候補から選択）"
                  className="h-11 rounded-xl text-sm font-bold bg-card border-border"
                />
                {showTournamentSuggestions && filteredTournaments.length > 0 && (
                  <div className="rounded-xl border border-border bg-card shadow-md divide-y divide-border max-h-48 overflow-y-auto">
                    <div className="px-3 py-1.5 bg-muted text-[10px] font-black text-muted-foreground">
                      登録済みの大会から選択 ({filteredTournaments.length}件)
                    </div>
                    {filteredTournaments.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTournamentName(t.name);
                          setShowTournamentSuggestions(false);
                        }}
                        className="w-full px-3 py-2.5 text-left text-xs font-bold text-foreground hover:bg-muted flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="truncate">{t.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {t.season}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 規定イニング・先攻後攻・ベンチ位置 */}
            <div className="pt-2 border-t border-border space-y-3.5">
              {/* 規定イニング */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>規定イニング</span>
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[5, 6, 7, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleSelectPresetInnings(num)}
                      className={cn(
                        "h-9 rounded-xl text-xs font-black border transition-all cursor-pointer tabular-nums",
                        innings === num
                          ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                          : "bg-card text-foreground border-border hover:bg-muted"
                      )}
                    >
                      {num}回制
                    </button>
                  ))}
                </div>
              </div>

              {/* 先攻後攻 ＆ ベンチ位置 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>自チームの攻守</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-xl border border-border">
                    <button
                      type="button"
                      onClick={() => setBattingOrder("first")}
                      className={cn(
                        "h-9 rounded-lg text-xs font-black transition-all cursor-pointer",
                        battingOrder === "first"
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      先攻（表）
                    </button>
                    <button
                      type="button"
                      onClick={() => setBattingOrder("second")}
                      className={cn(
                        "h-9 rounded-lg text-xs font-black transition-all cursor-pointer",
                        battingOrder === "second"
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      後攻（裏）
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                    <Tent className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>ベンチ位置</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-muted rounded-xl border border-border">
                    <button
                      type="button"
                      onClick={() => setBenchSide("1B")}
                      className={cn(
                        "h-9 rounded-lg text-xs font-black transition-all cursor-pointer",
                        benchSide === "1B"
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      一塁側
                    </button>
                    <button
                      type="button"
                      onClick={() => setBenchSide("unknown")}
                      className={cn(
                        "h-9 rounded-lg text-xs font-black transition-all cursor-pointer",
                        benchSide === "unknown"
                          ? "bg-card text-foreground border border-border shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      未定
                    </button>
                    <button
                      type="button"
                      onClick={() => setBenchSide("3B")}
                      className={cn(
                        "h-9 rounded-lg text-xs font-black transition-all cursor-pointer",
                        benchSide === "3B"
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      三塁側
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 🏟️ 2. 球場・グラウンド設定（A-3 上帯ダークキャップ border-teal-500） */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="w-4 h-4 text-teal-400 shrink-0" />
              <span className="text-xs font-black text-white truncate">
                球場・グラウンド
              </span>
            </div>
            <Link
              href="/liff/grounds"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-black transition-colors shrink-0"
            >
              <Building2 className="w-3 h-3 text-teal-400" />
              <span>球場マスタ</span>
            </Link>
          </div>

          <div className="p-4 space-y-3">
            {selectedVenueObj ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-muted/60 border border-border flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-teal-600 text-white text-[10px] font-black">
                        登録球場
                      </span>
                      <span className="text-xs sm:text-sm font-black text-foreground break-words">
                        {selectedVenueObj.name}
                      </span>
                    </div>
                    {selectedVenueObj.address && (
                      <p className="text-[11px] font-bold text-muted-foreground truncate">
                        {selectedVenueObj.address}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVenueId(null);
                      setCustomVenueText("");
                    }}
                    className="px-2 py-1 rounded-lg bg-card border border-border text-[11px] font-black text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                  >
                    変更
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-foreground">
                    面・グラウンド補足（任意）
                  </label>
                  <Input
                    value={surfaceNote}
                    onChange={(e) => setSurfaceNote(e.target.value)}
                    placeholder="例: 1面、A広場、北側グラウンド など"
                    className="h-10 rounded-xl text-xs font-bold bg-card border-border"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 relative">
                <label className="text-[11px] font-black text-foreground">
                  球場名（登録済み一覧から選択 または 直接入力）
                </label>
                <div className="relative">
                  <Input
                    value={customVenueText}
                    onChange={(e) => {
                      setCustomVenueText(e.target.value);
                      setSelectedVenueId(null);
                      setShowVenueSuggestions(true);
                    }}
                    onFocus={() => setShowVenueSuggestions(true)}
                    onBlur={() => {
                      setTimeout(() => setShowVenueSuggestions(false), 180);
                    }}
                    placeholder="例: 多摩川緑地野球場"
                    className="h-11 rounded-xl text-sm font-bold bg-card border-border pr-8"
                  />
                  {customVenueText && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomVenueText("");
                        setSelectedVenueId(null);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                      aria-label="球場入力をクリア"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {showVenueSuggestions && filteredVenues.length > 0 && (
                  <div className="rounded-xl border border-border bg-card shadow-md divide-y divide-border max-h-56 overflow-y-auto">
                    <div className="px-3 py-1.5 bg-muted text-[10px] font-black text-muted-foreground">
                      登録済み球場から選択するとGoogle Mapも自動連携されます (
                      {filteredVenues.length}件)
                    </div>
                    {filteredVenues.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedVenueId(v.id);
                          setCustomVenueText(v.name);
                          setShowVenueSuggestions(false);
                        }}
                        className="w-full px-3 py-2.5 text-left hover:bg-muted flex flex-col gap-0.5 cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-foreground">
                            {v.name}
                          </span>
                          {v.shortName && v.shortName !== v.name && (
                            <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-bold text-muted-foreground">
                              {v.shortName}
                            </span>
                          )}
                        </div>
                        {v.address && (
                          <span className="text-[10px] font-bold text-muted-foreground truncate">
                            {v.address}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ⚾️ 3. 試合ステータス ＆ 簡易イニングスコア（A-3 上帯ダークキャップ） */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="text-xs font-black text-white truncate">
                試合ステータス・イニング得点
              </span>
            </div>
            {(status === "finished" || status === "live") && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black tabular-nums shrink-0">
                {displayMyTotal} - {displayOppTotal}
              </span>
            )}
          </div>

          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-foreground">
                進行ステータス
              </label>
              <div className="grid grid-cols-4 gap-1 p-1 bg-muted rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setStatus("scheduled")}
                  className={cn(
                    "h-9 rounded-lg text-[11px] font-black transition-all cursor-pointer",
                    status === "scheduled"
                      ? "bg-card text-foreground border border-border shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  予定
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("live")}
                  className={cn(
                    "h-9 rounded-lg text-[11px] font-black transition-all cursor-pointer",
                    status === "live"
                      ? "bg-rose-600 text-white shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  試合中
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("finished")}
                  className={cn(
                    "h-9 rounded-lg text-[11px] font-black transition-all cursor-pointer",
                    status === "finished"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  試合終了
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("rainout")}
                  className={cn(
                    "h-9 rounded-lg text-[11px] font-black transition-all cursor-pointer",
                    status === "rainout"
                      ? "bg-sky-600 text-white shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  雨天中止
                </button>
              </div>
            </div>

            {(status === "finished" || status === "live") && (
              <div className="space-y-2.5 pt-2 border-t border-border">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-foreground">
                    イニング得点（簡易スコア編集）
                  </span>
                  <div className="inline-flex items-center gap-1.5 bg-muted px-2 py-1 rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={handleRemoveScoreInningColumn}
                      disabled={scoreboardInningCount <= 1}
                      className="w-6 h-6 rounded bg-card border border-border flex items-center justify-center text-foreground disabled:opacity-40 cursor-pointer"
                      aria-label="イニングを減らす"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-[11px] font-black tabular-nums px-1">
                      {scoreboardInningCount}回
                    </span>
                    <button
                      type="button"
                      onClick={handleAddScoreInningColumn}
                      className="w-6 h-6 rounded bg-card border border-border flex items-center justify-center text-foreground cursor-pointer"
                      aria-label="延長イニングを追加"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {hasScorebook && (
                  <div className="p-2.5 rounded-xl bg-muted/60 border border-border flex items-start gap-2 text-[11px] font-bold text-muted-foreground">
                    <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <p className="leading-snug">
                      スコアブック取込済みの試合です。下の得点欄を書き換えない限り、取込済みのスコア・安打・失策データはそのまま保持されます。
                    </p>
                  </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full text-center whitespace-nowrap text-xs">
                    <thead>
                      <tr className="bg-[#0f172a] text-slate-200 border-b-2 border-primary text-[10px] font-black">
                        <th className="p-2 text-left pl-3 min-w-[88px]">TEAM</th>
                        {Array.from({ length: scoreboardInningCount }).map((_, idx) => (
                          <th key={idx} className="w-9 p-1.5 font-mono tabular-nums">
                            {idx + 1}
                          </th>
                        ))}
                        <th className="w-10 p-1.5 bg-primary text-primary-foreground font-mono tabular-nums border-l border-slate-700">
                          R
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-black">
                      {/* 先攻 */}
                      <tr>
                        <td className="p-2 text-left pl-3 text-xs font-black text-foreground truncate max-w-[100px]">
                          {topTeamName}
                        </td>
                        {Array.from({ length: scoreboardInningCount }).map((_, idx) => {
                          const cellVal =
                            battingOrder === "second"
                              ? opponentInnings[idx] || ""
                              : myInnings[idx] || "";
                          return (
                            <td key={`top-${idx}`} className="p-1">
                              <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="-"
                                value={cellVal}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v !== "" && !/^\d{1,2}$/.test(v)) return;
                                  setIsScoreDirty(true);
                                  if (battingOrder === "second") {
                                    setOpponentInnings((prev) => {
                                      const next = [...prev];
                                      next[idx] = v;
                                      return next;
                                    });
                                  } else {
                                    setMyInnings((prev) => {
                                      const next = [...prev];
                                      next[idx] = v;
                                      return next;
                                    });
                                  }
                                }}
                                className="w-8 h-8 rounded-lg border border-border bg-muted/40 focus:bg-card focus:border-primary focus:outline-none text-center font-mono tabular-nums text-xs font-black text-foreground"
                              />
                            </td>
                          );
                        })}
                        <td className="p-2 font-mono tabular-nums text-sm font-black text-primary bg-muted/50 border-l border-border">
                          {battingOrder === "second" ? displayOppTotal : displayMyTotal}
                        </td>
                      </tr>

                      {/* 後攻 */}
                      <tr>
                        <td className="p-2 text-left pl-3 text-xs font-black text-foreground truncate max-w-[100px]">
                          {bottomTeamName}
                        </td>
                        {Array.from({ length: scoreboardInningCount }).map((_, idx) => {
                          const cellVal =
                            battingOrder === "second"
                              ? myInnings[idx] || ""
                              : opponentInnings[idx] || "";
                          return (
                            <td key={`bot-${idx}`} className="p-1">
                              <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="-"
                                value={cellVal}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v !== "" && !/^\d{1,2}$/.test(v)) return;
                                  setIsScoreDirty(true);
                                  if (battingOrder === "second") {
                                    setMyInnings((prev) => {
                                      const next = [...prev];
                                      next[idx] = v;
                                      return next;
                                    });
                                  } else {
                                    setOpponentInnings((prev) => {
                                      const next = [...prev];
                                      next[idx] = v;
                                      return next;
                                    });
                                  }
                                }}
                                className="w-8 h-8 rounded-lg border border-border bg-muted/40 focus:bg-card focus:border-primary focus:outline-none text-center font-mono tabular-nums text-xs font-black text-foreground"
                              />
                            </td>
                          );
                        })}
                        <td className="p-2 font-mono tabular-nums text-sm font-black text-primary bg-muted/50 border-l border-border">
                          {battingOrder === "second" ? displayMyTotal : displayOppTotal}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground">
                  ※ 後攻リードで最終回裏を行わなかった場合（サヨナラ・裏攻撃なし）は空欄のままにすると「x」で表示されます。
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 📹 4. YouTube 試合映像リンク（A-3 上帯ダークキャップ × YouTubeブランドレッド） */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-[#FF0000] px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Video className="w-4 h-4 text-[#FF0000] shrink-0" />
              <span className="text-xs font-black text-white truncate">
                試合映像（YouTube URL）
              </span>
            </div>
            {youtubeVideoId && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500 text-slate-950 text-[10px] font-black shrink-0">
                <CheckCircle2 className="w-3 h-3" />
                <span>認識OK</span>
              </span>
            )}
          </div>

          <div className="p-4 space-y-2">
            <div className="relative">
              <Input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... または https://youtu.be/..."
                className="h-11 rounded-xl text-xs sm:text-sm font-bold bg-card border-border pr-8"
              />
              {youtubeUrl && (
                <button
                  type="button"
                  onClick={() => setYoutubeUrl("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                  aria-label="YouTube URLをクリア"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
              YouTubeの限定公開リンクを設定すると、試合カードおよび試合詳細ページで動画を再生できます。
            </p>
          </div>
        </section>

        {/* 💾 保存ボタン */}
        <div className="space-y-3 pt-1">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-black shadow-xs flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>保存中...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>変更を保存する</span>
              </>
            )}
          </Button>

          {!isDemoMatchId(matchId) && (
            <div className="pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="w-full h-11 rounded-2xl border border-rose-300 dark:border-rose-800 bg-card hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.99] transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>この試合自体を削除する</span>
              </button>
            </div>
          )}
        </div>

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>

      {/* 🗑️ 試合全体の削除確認モーダル（A-3 ソリッド規格・Portal z-[9999]） */}
      {mounted &&
        showDeleteModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 animate-in fade-in duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isDeleting) {
                setShowDeleteModal(false);
              }
            }}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 px-4 py-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <h3 className="text-sm font-black text-white">
                  この試合データを削除しますか？
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">vs {opponent || loadedMatch.opponent}</strong>{" "}
                  の試合日程・スタメン・スコア・打席記録がすべて削除されます。この操作は取り消せません。
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isDeleting}
                    onClick={() => setShowDeleteModal(false)}
                    className="h-10 rounded-xl font-black text-xs"
                  >
                    キャンセル
                  </Button>
                  <Button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => void handleDeleteMatch()}
                    className="h-10 rounded-xl font-black text-xs bg-rose-600 hover:bg-rose-700 text-white border-0"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "削除する"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default function LiffMatchEditPage() {
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
      <LiffMatchEditContent />
    </Suspense>
  );
}

