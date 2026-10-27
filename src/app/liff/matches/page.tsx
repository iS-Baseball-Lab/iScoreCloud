// filepath: src/app/liff/matches/page.tsx
"use client";

import React, { useState, useEffect, Suspense, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { YouTubePlayer } from "@/components/liff/YouTubePlayer";
import { MatchScoreCard, MatchScoreCardSkeleton, type MatchCardData } from "@/components/liff/MatchScoreCard";
import { Match } from "@/types/match";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  Users,
  Shield,
  ShieldAlert,
  Loader2,
  Video,
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
  getDemoMatchById,
  getHydratedDemoMatchCards,
  getPositionBadgeInfo,
  isDemoMatchId,
  isDemoTeamId,
  loadDemoMatchLineups,
  formatLineupShareText,
  parseSafeMatchDate,
  type LineupPlayer,
  type MyLineupSlot,
  type PlayerMatchAttendanceMap,
} from "@/lib/liff/demo-lineup";

// ━━━ APIレスポンス型定義 (any排除) ━━━
interface MatchDetailApiResponse {
  success?: boolean;
  match?: Match & { teamId?: string };
  error?: string;
}

interface MatchLineupsApiResponse {
  success?: boolean;
  lineups?: {
    myLineup?: MyLineupSlot[];
    myAttendance?: PlayerMatchAttendanceMap;
  };
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
  const searchParams = useSearchParams();
  const matchId = searchParams.get("id");
  const { currentTeam, isLoadingTeam, isDemo } = useLiff();

  // 単一試合詳細用ステート
  const [match, setMatch] = useState<Match | null>(null);
  const [myLineup, setMyLineup] = useState<MyLineupSlot[]>([]);
  const [myAttendance, setMyAttendance] = useState<PlayerMatchAttendanceMap>({});
  const [teamPlayers, setTeamPlayers] = useState<LineupPlayer[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(() => Boolean(matchId));
  const [loadedMatchId, setLoadedMatchId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isAddressCopied, setIsAddressCopied] = useState(false);

  // 試合一覧用ステート
  const [matchesList, setMatchesList] = useState<MatchCardData[]>([]);
  const [isListLoading, setIsListLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "scheduled" | "video" | "official">("all");

  const handleCopyVenueAddress = useCallback((addressText: string) => {
    if (!addressText) return;
    navigator.clipboard.writeText(addressText);
    setIsAddressCopied(true);
    toast.success("住所をコピーしました");
    setTimeout(() => {
      setIsAddressCopied(false);
    }, 2000);
  }, []);

  // 1. 試合詳細 ＆ 出場メンバー（スタメン・控え・欠席）のロード (matchId がある場合)
  useEffect(() => {
    setIsAddressCopied(false);
    if (!matchId) {
      setDetailError(null);
      return;
    }

    const targetMatchId = matchId;
    let isCancelled = false;

    async function loadMatch() {
      try {
        setIsDetailLoading(true);
        setDetailError(null);

        // 🅰️ デモ試合IDの場合のみデモデータを参照（実試合UUIDがデモ扱いされる誤判定を完全防止）
        if (isDemoMatchId(targetMatchId)) {
          const demoMatch = getDemoMatchById(targetMatchId);
          if (!demoMatch) {
            throw new Error("指定されたデモ試合が見つかりませんでした");
          }
          if (isCancelled) return;
          setMatch(demoMatch);
          setTeamPlayers(DEMO_LINEUP_PLAYERS);
          const demoLineups = loadDemoMatchLineups(targetMatchId);
          setMyLineup(demoLineups.myLineup || []);
          setMyAttendance(demoLineups.myAttendance || {});
          return;
        }

        // 🅱️ 実チームDB処理（試合詳細 + スタメン・出欠を並列取得）
        const [matchRes, lineupsRes] = await Promise.all([
          fetch(`/api/matches/${encodeURIComponent(targetMatchId)}`, { cache: "no-store" }),
          fetch(`/api/matches/${encodeURIComponent(targetMatchId)}/lineups`, { cache: "no-store" }),
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

        if (lineupsRes.ok) {
          const lineupsJson = (await lineupsRes.json()) as MatchLineupsApiResponse;
          if (!isCancelled) {
            if (lineupsJson.success && lineupsJson.lineups) {
              setMyLineup(lineupsJson.lineups.myLineup || []);
              setMyAttendance(lineupsJson.lineups.myAttendance || {});
            } else {
              setMyLineup([]);
              setMyAttendance({});
            }
          }
        }

        // 控え・欠席一覧を表示するため、試合レコード自身の teamId を最優先して選手名簿を取得
        const targetTeamId =
          data.match.teamId ||
          currentTeam?.id ||
          (typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : null);

        if (targetTeamId && !isDemoTeamId(targetTeamId)) {
          const playersRes = await fetch(`/api/teams/${encodeURIComponent(targetTeamId)}/players`, {
            cache: "no-store",
          });
          if (playersRes.ok && !isCancelled) {
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
      setIsListLoading(true);

      // 初回アクセス等でまだ teamId が未確定の場合は /api/liff/hub から実チームIDを解決
      if (!resolvedTeamId) {
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

  const starterPlayerIds = useMemo(
    () => filledStarters.map((slot) => slot.playerId).filter(Boolean),
    [filledStarters]
  );

  const remainingPlayers = useMemo(
    () => teamPlayers.filter((p) => !starterPlayerIds.includes(p.id)),
    [teamPlayers, starterPlayerIds]
  );

  const benchPlayers = useMemo(
    () => remainingPlayers.filter((p) => myAttendance[p.id] !== "absent"),
    [remainingPlayers, myAttendance]
  );

  const absentPlayers = useMemo(
    () => remainingPlayers.filter((p) => myAttendance[p.id] === "absent"),
    [remainingPlayers, myAttendance]
  );

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

    // 試合カード（MatchScoreCard）と同一の先攻・後攻スコアボード計算
    const myTeamLabel = currentTeam?.shortName || currentTeam?.name || "自チーム";
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

    const venueInfo = buildVenueDisplayInfo(match);
    const shareVenueLine = venueInfo.officialName
      ? `\n📍 ${venueInfo.officialName}${venueInfo.address ? ` (${venueInfo.address})` : ""}`
      : "";

    const baseShareText = isScheduled
      ? `【試合予定】\nvs ${match.opponent}\n📅 ${match.date}${shareVenueLine}`
      : `【試合結果】\nvs ${match.opponent}\n${match.myScore} - ${match.opponentScore} (${isWin ? "勝利 🏆" : isLose ? "敗戦" : "引分"})\n📅 ${match.date}${shareVenueLine}`;

    const shareText =
      filledStarters.length > 0
        ? `${baseShareText}\n\n${formatLineupShareText(
            match.opponent,
            match.date,
            myLineup,
            remainingPlayers,
            myAttendance
          )}`
        : baseShareText;

    const headerVenueLabel = venueInfo.shortName || venueInfo.officialName;

    return (
      <div className="flex flex-col flex-1">
        <LiffHeader />

        <div className="p-4 space-y-5">
          {/* ページ内ヘッダー */}
          <LiffPageHeader
            title={`vs ${match.opponent}`}
            subtitle={`${match.date}${headerVenueLabel ? ` • ${headerVenueLabel}` : ""}`}
            icon={
              <span className="w-8 h-8 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center font-black">
                <Video className="w-4 h-4" />
              </span>
            }
            showBack
            shareData={{
              title: `vs ${match.opponent} 試合情報 & 出場メンバー`,
              text: shareText,
            }}
          />

          {/* 🔒 1. 試合映像（見出しはカード外） */}
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
                <Video className="w-4 h-4 text-red-500 shrink-0" />
                <span>試合映像 (YouTube限定公開)</span>
              </h2>
            </div>

            {match.youtubeUrl ? (
              <div className="space-y-2">
                <YouTubePlayer
                  url={match.youtubeUrl}
                  title={`vs ${match.opponent} (${match.date}) 試合動画`}
                />

                {/* ⚠️ 動画取り扱いに関する注意書き */}
                <div className="p-2.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 flex items-start gap-2 text-[11px] text-amber-900 dark:text-amber-200 font-bold">
                  <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="leading-snug">
                    本動画は選手・チームのプライバシー保護のため<strong>YouTube限定公開</strong>です。SNS等への無断転載・拡散はご遠慮ください。
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-card border border-border text-center text-xs font-bold text-muted-foreground shadow-xs">
                この試合には動画リンクが設定されていません
              </div>
            )}
          </section>

          {/* ⚾️ 2. スコアボード（見出しはカード外・試合カードと同一レイアウト） */}
          <section className="space-y-2">
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
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-[10px] font-black">
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
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[10px] text-muted-foreground font-black">
                      <th className="p-2 text-left pl-3 min-w-[92px]">TEAM</th>
                      {inningsArray.map((inningNum) => (
                        <th key={inningNum} className="w-6 p-2 font-mono">
                          {inningNum}
                        </th>
                      ))}
                      <th className="w-8 p-2 bg-primary/10 text-primary font-black border-l border-border font-mono">
                        R
                      </th>
                      <th className="w-6 p-2 font-mono">H</th>
                      <th className="w-6 p-2 pr-3 font-mono">E</th>
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
                        {isFutureOrScheduled ? "-" : firstScore}
                      </td>
                      <td className="p-2 font-mono text-muted-foreground text-[11px]">
                        {isFutureOrScheduled ? "-" : topHits}
                      </td>
                      <td className="p-2 pr-3 font-mono text-muted-foreground text-[11px]">
                        {isFutureOrScheduled ? "-" : topErrors}
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
                        {isFutureOrScheduled ? "-" : secondScore}
                      </td>
                      <td className="p-2 font-mono text-muted-foreground text-[11px]">
                        {isFutureOrScheduled ? "-" : bottomHits}
                      </td>
                      <td className="p-2 pr-3 font-mono text-muted-foreground text-[11px]">
                        {isFutureOrScheduled ? "-" : bottomErrors}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 👥 3. 出場メンバー（見出しはカード外） */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground min-w-0">
                <Users className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate">出場メンバー（スタメン・控え・欠席）</span>
              </h2>

              <Link
                href={`/liff/matches/lineup?id=${match.id}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] font-black transition-all active:scale-95 shrink-0 shadow-2xs"
              >
                <Edit3 className="w-3 h-3" />
                <span>{filledStarters.length > 0 ? "編集する" : "登録する"}</span>
              </Link>
            </div>

            <div className="bg-card border border-border rounded-2xl p-3.5 shadow-xs space-y-3">
              {/* スターティングメンバー表示 */}
              {filledStarters.length === 0 ? (
                <div className="rounded-xl bg-muted/40 border border-dashed border-border p-5 text-center space-y-3">
                  <p className="text-xs font-black text-foreground">
                    スタメンがまだ登録されていません
                  </p>
                  <p className="text-[11px] font-bold text-muted-foreground">
                    この試合のスターティングメンバー・控え・欠席をスマホから簡単に設定できます
                  </p>
                  <Link
                    href={`/liff/matches/lineup?id=${match.id}`}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-xs hover:bg-primary/90 active:scale-95 transition-all"
                  >
                    <Users className="w-4 h-4" />
                    <span>スタメン・控え・欠席を登録する</span>
                  </Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-black text-primary flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5" />
                      スターティングメンバー
                    </span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {filledStarters.length}名
                    </span>
                  </div>
                  <div className="divide-y divide-border/50 rounded-xl border border-border overflow-hidden bg-background">
                    {filledStarters.map((slot) => {
                      const posInfo = getPositionBadgeInfo(slot.position);
                      return (
                        <div
                          key={`${slot.order}-${slot.playerId || slot.name}`}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs"
                        >
                          <span className="w-5 text-center font-black italic text-primary shrink-0">
                            {slot.order}
                          </span>
                          {posInfo ? (
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-md text-white font-black text-[10px] shrink-0 min-w-[40px] text-center",
                                posInfo.color
                              )}
                            >
                              {posInfo.label}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-black text-[10px] shrink-0 min-w-[40px] text-center">
                              未設定
                            </span>
                          )}
                          <span className="text-[11px] font-black text-primary/80 min-w-[26px] shrink-0">
                            {slot.uniformNumber ? `#${slot.uniformNumber}` : "-"}
                          </span>
                          <span className="font-black text-foreground truncate flex-1">
                            {slot.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 控え・欠席メンバー一覧 */}
              {teamPlayers.length > 0 && (
                <div className="grid grid-cols-1 gap-2.5 pt-0.5">
                  {/* 控えメンバー */}
                  <div className="rounded-xl border border-emerald-500/25 bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" />
                        控え（ベンチ入り）
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        {benchPlayers.length}名
                      </span>
                    </div>

                    {benchPlayers.length === 0 ? (
                      <p className="text-[11px] font-bold text-muted-foreground">該当なし</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {benchPlayers.map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-foreground text-[11px] font-black"
                          >
                            {p.uniformNumber && (
                              <span className="text-emerald-700 dark:text-emerald-400 text-[10px]">
                                #{p.uniformNumber}
                              </span>
                            )}
                            <span>{p.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 欠席メンバー */}
                  <div className="rounded-xl border border-rose-500/25 bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-rose-700 dark:text-rose-400 flex items-center gap-1">
                        <UserMinus className="w-3.5 h-3.5" />
                        欠席
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300">
                        {absentPlayers.length}名
                      </span>
                    </div>

                    {absentPlayers.length === 0 ? (
                      <p className="text-[11px] font-bold text-muted-foreground">欠席者なし</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {absentPlayers.map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px] font-bold"
                          >
                            {p.uniformNumber && (
                              <span className="text-[10px] opacity-80">#{p.uniformNumber}</span>
                            )}
                            <span>{p.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 🏟️ 4. 球場・グラウンド（見出しはカード外） */}
          <section className="space-y-2">
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

            <div className="bg-card border border-border rounded-2xl p-3.5 shadow-xs space-y-3">
              {/* 正式名・略称・住所（フォントサイズ・行間・ラベル幅を完全統一） */}
              <div className="divide-y divide-border/50 rounded-xl border border-border bg-background overflow-hidden">
                {/* 正式名 */}
                <div className="grid grid-cols-[3.25rem_1fr] items-baseline gap-2.5 px-3.5 py-2.5">
                  <span className="text-[11px] font-bold text-muted-foreground leading-5">
                    正式名
                  </span>
                  <div className="min-w-0">
                    {venueInfo.officialName ? (
                      <p className="text-xs font-black text-foreground leading-5 break-words">
                        {venueInfo.officialName}
                        {venueInfo.surfaceNote && (
                          <span className="ml-1.5 font-bold text-muted-foreground">
                            ({venueInfo.surfaceNote})
                          </span>
                        )}
                      </p>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground leading-5">
                        未設定
                      </span>
                    )}
                  </div>
                </div>

                {/* 略称 */}
                <div className="grid grid-cols-[3.25rem_1fr] items-baseline gap-2.5 px-3.5 py-2.5">
                  <span className="text-[11px] font-bold text-muted-foreground leading-5">
                    略称
                  </span>
                  <div className="min-w-0">
                    {venueInfo.shortName ? (
                      <p className="text-xs font-bold text-foreground leading-5 break-words">
                        {venueInfo.shortName}
                      </p>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground leading-5">
                        未設定
                      </span>
                    )}
                  </div>
                </div>

                {/* 住所 */}
                <div className="grid grid-cols-[3.25rem_1fr] items-baseline gap-2.5 px-3.5 py-2.5">
                  <span className="text-[11px] font-bold text-muted-foreground leading-5">
                    住所
                  </span>
                  <div className="min-w-0 flex items-start justify-between gap-2">
                    {venueInfo.address ? (
                      <>
                        <p className="text-xs font-bold text-foreground leading-5 break-words flex-1">
                          {venueInfo.address}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopyVenueAddress(venueInfo.address)}
                          className="w-6 h-6 -my-0.5 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 transition-colors cursor-pointer"
                          title="住所をコピー"
                          aria-label="住所をコピー"
                        >
                          {isAddressCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground leading-5">
                        未登録
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 🗺️ Google Map（登録URLベース・大きめ表示） */}
              {venueInfo.embedUrl ? (
                <div className="space-y-2.5">
                  <div className="w-full h-[340px] sm:h-[420px] rounded-xl overflow-hidden border border-border bg-muted/30">
                    <iframe
                      src={venueInfo.embedUrl}
                      title={`${venueInfo.officialName || "球場・グラウンド"} Google Map`}
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                      className="w-full h-full border-0"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={venueInfo.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                    >
                      <Navigation className="w-3.5 h-3.5 shrink-0" />
                      <span>Google Mapで開く</span>
                    </a>
                    <a
                      href={venueInfo.directionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-3 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                    >
                      <Compass className="w-3.5 h-3.5 shrink-0 text-primary" />
                      <span>ルート案内</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-muted/40 border border-dashed border-border p-5 text-center space-y-2.5">
                  <p className="text-xs font-black text-foreground leading-5">
                    地図を表示するURL・球場情報がありません
                  </p>
                  <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                    「球場一覧」からグラウンドの正式名・略称・Google Map URLを登録できます
                  </p>
                  <Link
                    href="/liff/grounds"
                    className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-xs hover:bg-primary/90 active:scale-95 transition-all"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>球場一覧を開く</span>
                  </Link>
                </div>
              )}
            </div>
          </section>

          <div className="h-8 w-full shrink-0" aria-hidden="true" />
        </div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🅱️ 試合一覧画面 (matchId がない場合)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const filteredMatches = matchesList.filter((m) => {
    if (filter === "scheduled") return m.status === "scheduled" || m.status === "live";
    if (filter === "video") return !!extractYouTubeVideoId(m.youtubeUrl);
    if (filter === "official") return m.matchType === "official" || m.matchType === "tournament";
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
            <span className="w-8 h-8 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center font-black">
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
            title: `【試合情報】${currentTeam?.name || "チーム"} 試合一覧`,
            text: `試合ハイライト動画・スコアボードはこちらから確認できます！`,
          }}
        />

        {/* 🔒 動画取り扱い・プライバシーに関する重要なお知らせ */}
        <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 space-y-1.5 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-black text-amber-800 dark:text-amber-300">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>【重要】試合動画・写真の取り扱いについて</span>
          </div>
          <p className="text-[11px] font-bold text-amber-950/85 dark:text-amber-100/90 leading-relaxed pl-6">
            本アプリ内で配信している試合動画は、選手・チーム関係者のプライバシー保護のため<strong>YouTubeの限定公開（リンクを知っている方のみ閲覧可能）</strong>としています。
            URLや映像をむやみにSNS（X、Instagram、TikTok、YouTube等）へ転載・拡散しないよう、お取り扱いには十分ご配慮をお願いいたします。
          </p>
        </div>

        {/* フィルタータブ */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-muted/60 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`py-1.5 px-1 rounded-xl text-[11px] font-black transition-all truncate ${
              filter === "all"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            すべて ({matchesList.length})
          </button>

          <button
            type="button"
            onClick={() => setFilter("scheduled")}
            className={`py-1.5 px-1 rounded-xl text-[11px] font-black transition-all truncate ${
              filter === "scheduled"
                ? "bg-card text-primary shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ⚾ 予定 ({scheduledMatchesCount})
          </button>

          <button
            type="button"
            onClick={() => setFilter("video")}
            className={`py-1.5 px-1 rounded-xl text-[11px] font-black transition-all truncate ${
              filter === "video"
                ? "bg-card text-red-600 dark:text-red-400 shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📹 動画 ({videoMatchesCount})
          </button>

          <button
            type="button"
            onClick={() => setFilter("official")}
            className={`py-1.5 px-1 rounded-xl text-[11px] font-black transition-all truncate ${
              filter === "official"
                ? "bg-card text-amber-600 dark:text-amber-400 shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🏆 公式戦
          </button>
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
                teamName={currentTeam?.shortName || currentTeam?.name || "自チーム"}
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
