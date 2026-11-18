// filepath: src/app/liff/tools/cheer-songs/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Music,
  Volume2,
  Users,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  Trash2,
  Save,
  X,
  ExternalLink,
  Search,
  Loader2,
  Megaphone,
  ListOrdered,
  IdCard,
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { LiffSelect, type LiffSelectOption } from "@/components/liff/LiffSelect";
import { LiffDataLoadErrorCard } from "@/components/liff/LiffDataLoadErrorCard";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  fetchLiffJsonSWR,
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CheerBoardMode = "lineup" | "roster" | "team";
type TeamChantCategory = "attack" | "chance" | "call";

interface TeamCheerChantItem {
  id: string;
  title: string;
  category: TeamChantCategory;
  lyrics: string;
  youtubeUrl?: string | null;
}

interface CheerSongPlayerItem {
  id: string;
  name: string;
  nameKana: string | null;
  uniformNumber: string;
  nickname: string | null;
  primaryPosition: string | null;
  bats: string | null;
  walkUpSong: string | null;
  cheerCall: string | null;
  cheerLyrics: string | null;
  cheerYoutubeUrl: string | null;
  canEditCheer: boolean;
}

interface CheerLineupSlot {
  order: number;
  position: string;
  playerId: string;
}

interface CheerLineupSourceOption {
  id: string;
  sourceType: "match" | "template";
  label: string;
  subLabel: string;
  slots: CheerLineupSlot[];
}

interface CheerSongsApiResponse {
  success: boolean;
  isDemo?: boolean;
  teamName?: string;
  canManageTeamChants?: boolean;
  teamChants?: TeamCheerChantItem[];
  players?: CheerSongPlayerItem[];
  lineupSources?: CheerLineupSourceOption[];
  defaultLineupSourceId?: string | null;
  error?: string;
}

interface SavePlayerCheerResponse {
  success: boolean;
  isDemo?: boolean;
  player?: {
    id: string;
    nickname: string | null;
    walkUpSong: string | null;
    cheerCall: string | null;
    cheerLyrics: string | null;
    cheerYoutubeUrl: string | null;
  };
  error?: string;
}

interface SaveTeamChantsResponse {
  success: boolean;
  isDemo?: boolean;
  teamChants?: TeamCheerChantItem[];
  error?: string;
}

interface PlayerEditDraft {
  playerId: string;
  playerName: string;
  uniformNumber: string;
  nickname: string;
  walkUpSong: string;
  cheerCall: string;
  cheerLyrics: string;
  cheerYoutubeUrl: string;
}

interface TeamChantDraft {
  isNew: boolean;
  id: string;
  title: string;
  category: TeamChantCategory;
  lyrics: string;
  youtubeUrl: string;
}

const POSITION_DISPLAY_MAP: Record<string, string> = {
  "1": "投",
  "2": "捕",
  "3": "一",
  "4": "二",
  "5": "三",
  "6": "遊",
  "7": "左",
  "8": "中",
  "9": "右",
  "10": "DH",
  P: "投",
  C: "捕",
  "1B": "一",
  "2B": "二",
  "3B": "三",
  SS: "遊",
  LF: "左",
  CF: "中",
  RF: "右",
  DH: "DH",
};

const CHANT_CATEGORY_META: Record<
  TeamChantCategory,
  { label: string; badgeClass: string; shortLabel: string }
> = {
  chance: {
    label: "🔥 チャンステーマ（得点圏）",
    shortLabel: "チャンス",
    badgeClass:
      "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35",
  },
  attack: {
    label: "⚾ 攻撃・出塁テーマ",
    shortLabel: "攻撃テーマ",
    badgeClass:
      "bg-primary/12 text-primary border-primary/30",
  },
  call: {
    label: "📣 守備・盛り上げコール",
    shortLabel: "コール",
    badgeClass:
      "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/35",
  },
};

const CHANT_CATEGORY_SELECT_OPTIONS: LiffSelectOption[] = [
  { value: "chance", label: "🔥 チャンステーマ（得点圏・好機）" },
  { value: "attack", label: "⚾ 攻撃・通常ヒッティングテーマ" },
  { value: "call", label: "📣 守備・盛り上げコール" },
];

function isValidHttpUrl(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  return /^https?:\/\//i.test(raw.trim());
}

function formatPositionLabel(pos: string | null | undefined): string {
  if (!pos) return "";
  const clean = pos.trim().toUpperCase();
  return POSITION_DISPLAY_MAP[clean] || pos.trim();
}

function resolveCallName(player: CheerSongPlayerItem): string {
  if (player.nickname && player.nickname.trim()) {
    return player.nickname.trim();
  }
  const parts = player.name.trim().split(/[\s　]+/);
  return parts.length > 1 ? parts[parts.length - 1] : player.name.trim();
}

function applyPlayerCallToLyrics(lyrics: string, callName: string): string {
  return lyrics
    .replace(/（選手名）/g, callName)
    .replace(/\(選手名\)/g, callName)
    .replace(/\{name\}/gi, callName);
}

export default function LiffCheerSongsPage() {
  const { currentTeam } = useLiff();
  const teamId = currentTeam?.id || "demo-team";

  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<CheerBoardMode>("lineup");
  const [hasInitializedMode, setHasInitializedMode] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [canManageTeamChants, setCanManageTeamChants] = useState(false);
  const [teamChants, setTeamChants] = useState<TeamCheerChantItem[]>([]);
  const [players, setPlayers] = useState<CheerSongPlayerItem[]>([]);
  const [lineupSources, setLineupSources] = useState<CheerLineupSourceOption[]>(
    []
  );
  const [selectedLineupId, setSelectedLineupId] = useState<string>("");
  const [activeBatterIndex, setActiveBatterIndex] = useState<number>(0);
  const [rosterQuery, setRosterQuery] = useState<string>("");

  // 選手応援歌編集モーダル
  const [editingPlayerDraft, setEditingPlayerDraft] =
    useState<PlayerEditDraft | null>(null);
  const [isSavingPlayer, setIsSavingPlayer] = useState(false);

  // チーム共通応援歌編集モーダル
  const [editingChantDraft, setEditingChantDraft] =
    useState<TeamChantDraft | null>(null);
  const [confirmDeleteChantId, setConfirmDeleteChantId] = useState<
    string | null
  >(null);
  const [isSavingTeamChants, setIsSavingTeamChants] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const applyApiPayload = useCallback(
    (data: CheerSongsApiResponse, isFirstTeamLoad: boolean) => {
      const nextPlayers = Array.isArray(data.players) ? data.players : [];
      const nextChants = Array.isArray(data.teamChants) ? data.teamChants : [];
      const nextSources = Array.isArray(data.lineupSources)
        ? data.lineupSources
        : [];

      setCanManageTeamChants(Boolean(data.canManageTeamChants));
      setPlayers(nextPlayers);
      setTeamChants(nextChants);
      setLineupSources(nextSources);

      setSelectedLineupId((prev) => {
        if (prev && nextSources.some((s) => s.id === prev)) {
          return prev;
        }
        if (
          data.defaultLineupSourceId &&
          nextSources.some((s) => s.id === data.defaultLineupSourceId)
        ) {
          return data.defaultLineupSourceId;
        }
        return nextSources[0]?.id || "";
      });

      if (isFirstTeamLoad) {
        setMode(nextSources.length > 0 ? "lineup" : "roster");
        setActiveBatterIndex(0);
        setHasInitializedMode(true);
      }
      setHasLoaded(true);
      setLoadError(null);
    },
    []
  );

  const loadCheerBoard = useCallback(
    async (forceRefresh = false) => {
      const apiUrl = `/api/liff/cheer-songs?teamId=${encodeURIComponent(teamId)}`;
      setIsLoading(true);
      if (forceRefresh) {
        setLoadError(null);
      }

      try {
        if (!forceRefresh) {
          const cached = peekLiffApiCache<CheerSongsApiResponse>(apiUrl);
          if (cached?.success) {
            applyApiPayload(cached, !hasInitializedMode);
            setIsLoading(false);
          }
        }

        const res = await fetchLiffJsonSWR<CheerSongsApiResponse>(apiUrl, {
          forceRefresh,
          onRevalidate: (fresh) => {
            if (fresh?.success) {
              applyApiPayload(fresh, false);
            }
          },
        });

        if (!res?.success) {
          throw new Error(
            res?.error || "応援歌・コールデータの取得に失敗しました"
          );
        }

        applyApiPayload(res, !hasInitializedMode);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "応援歌・コールデータの取得に失敗しました";
        setLoadError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [applyApiPayload, hasInitializedMode, teamId]
  );

  useEffect(() => {
    setHasLoaded(false);
    setHasInitializedMode(false);
    setLoadError(null);
    setSelectedLineupId("");
    setActiveBatterIndex(0);
    setRosterQuery("");
    void loadCheerBoard(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const playerMap = useMemo(() => {
    const map = new Map<string, CheerSongPlayerItem>();
    for (const p of players) {
      map.set(p.id, p);
    }
    return map;
  }, [players]);

  const activeLineupSource = useMemo(() => {
    if (lineupSources.length === 0) return null;
    return (
      lineupSources.find((s) => s.id === selectedLineupId) || lineupSources[0]
    );
  }, [lineupSources, selectedLineupId]);

  const resolvedLineupEntries = useMemo(() => {
    if (!activeLineupSource) return [];
    return activeLineupSource.slots
      .map((slot) => {
        const player = playerMap.get(slot.playerId);
        if (!player) return null;
        return {
          order: slot.order,
          position: slot.position,
          player,
        };
      })
      .filter(
        (
          entry
        ): entry is {
          order: number;
          position: string;
          player: CheerSongPlayerItem;
        } => entry !== null
      );
  }, [activeLineupSource, playerMap]);

  useEffect(() => {
    if (
      resolvedLineupEntries.length > 0 &&
      activeBatterIndex >= resolvedLineupEntries.length
    ) {
      setActiveBatterIndex(0);
    }
  }, [activeBatterIndex, resolvedLineupEntries.length]);

  const lineupSelectOptions: LiffSelectOption[] = useMemo(
    () =>
      lineupSources.map((src) => ({
        value: src.id,
        label: src.label,
        badge: src.subLabel,
      })),
    [lineupSources]
  );

  const filteredRosterPlayers = useMemo(() => {
    const q = rosterQuery.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => {
      const target = [
        p.uniformNumber ? `#${p.uniformNumber}` : "",
        p.uniformNumber,
        p.name,
        p.nameKana || "",
        p.nickname || "",
        p.walkUpSong || "",
        p.cheerCall || "",
      ]
        .join(" ")
        .toLowerCase();
      return target.includes(q);
    });
  }, [players, rosterQuery]);

  const handleStepBatter = (delta: -1 | 1) => {
    const total = resolvedLineupEntries.length;
    if (total === 0) return;
    setActiveBatterIndex((prev) => (prev + delta + total) % total);
  };

  const openPlayerEditModal = (player: CheerSongPlayerItem) => {
    if (!player.canEditCheer) return;
    setEditingPlayerDraft({
      playerId: player.id,
      playerName: player.name,
      uniformNumber: player.uniformNumber,
      nickname: player.nickname || "",
      walkUpSong: player.walkUpSong || "",
      cheerCall: player.cheerCall || "",
      cheerLyrics: player.cheerLyrics || "",
      cheerYoutubeUrl: player.cheerYoutubeUrl || "",
    });
  };

  const handleSavePlayerCheer = async () => {
    if (!editingPlayerDraft || isSavingPlayer) return;
    const trimmedUrl = editingPlayerDraft.cheerYoutubeUrl.trim();
    if (trimmedUrl && !isValidHttpUrl(trimmedUrl)) {
      toast.error("YouTube・参考リンクは http:// または https:// から始まるURLを入力してください");
      return;
    }

    setIsSavingPlayer(true);
    try {
      const payload = {
        teamId,
        playerId: editingPlayerDraft.playerId,
        nickname: editingPlayerDraft.nickname.trim() || null,
        walkUpSong: editingPlayerDraft.walkUpSong.trim() || null,
        cheerCall: editingPlayerDraft.cheerCall.trim() || null,
        cheerLyrics: editingPlayerDraft.cheerLyrics.trim() || null,
        cheerYoutubeUrl: trimmedUrl || null,
      };

      const res = await fetch("/api/liff/cheer-songs/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as SavePlayerCheerResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || "選手の応援歌設定の保存に失敗しました");
      }

      setPlayers((prev) =>
        prev.map((p) =>
          p.id === editingPlayerDraft.playerId
            ? {
                ...p,
                nickname: json.player
                  ? json.player.nickname
                  : payload.nickname,
                walkUpSong: json.player
                  ? json.player.walkUpSong
                  : payload.walkUpSong,
                cheerCall: json.player
                  ? json.player.cheerCall
                  : payload.cheerCall,
                cheerLyrics: json.player
                  ? json.player.cheerLyrics
                  : payload.cheerLyrics,
                cheerYoutubeUrl: json.player
                  ? json.player.cheerYoutubeUrl
                  : payload.cheerYoutubeUrl,
              }
            : p
        )
      );

      invalidateLiffApiCache("/api/liff/cheer-songs");
      invalidateLiffApiCache("/api/liff/players");
      setEditingPlayerDraft(null);
      toast.success(`${editingPlayerDraft.playerName}の応援歌・コールを保存しました`);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "選手の応援歌設定の保存に失敗しました";
      toast.error(msg);
    } finally {
      setIsSavingPlayer(false);
    }
  };

  const openAddChantModal = () => {
    if (!canManageTeamChants) return;
    setConfirmDeleteChantId(null);
    setEditingChantDraft({
      isNew: true,
      id: `chant-${Date.now()}`,
      title: "",
      category: "chance",
      lyrics: "",
      youtubeUrl: "",
    });
  };

  const openEditChantModal = (chant: TeamCheerChantItem) => {
    if (!canManageTeamChants) return;
    setConfirmDeleteChantId(null);
    setEditingChantDraft({
      isNew: false,
      id: chant.id,
      title: chant.title,
      category: chant.category,
      lyrics: chant.lyrics,
      youtubeUrl: chant.youtubeUrl || "",
    });
  };

  const persistTeamChantsList = async (
    nextChants: TeamCheerChantItem[],
    successMsg: string
  ) => {
    if (!canManageTeamChants) return;
    setIsSavingTeamChants(true);
    try {
      const res = await fetch("/api/liff/cheer-songs/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          teamChants: nextChants,
          chants: nextChants,
        }),
      });
      const json = (await res.json()) as SaveTeamChantsResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || "チーム共通応援歌の保存に失敗しました");
      }

      setTeamChants(json.teamChants || nextChants);
      invalidateLiffApiCache("/api/liff/cheer-songs");
      setEditingChantDraft(null);
      setConfirmDeleteChantId(null);
      toast.success(successMsg);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "チーム共通応援歌の保存に失敗しました";
      toast.error(msg);
    } finally {
      setIsSavingTeamChants(false);
    }
  };

  const handleSaveTeamChantDraft = async () => {
    if (!editingChantDraft || isSavingTeamChants) return;
    const title = editingChantDraft.title.trim();
    const lyrics = editingChantDraft.lyrics.trim();
    const trimmedUrl = editingChantDraft.youtubeUrl.trim();

    if (!title) {
      toast.error("テーマ名・タイトルを入力してください");
      return;
    }
    if (!lyrics) {
      toast.error("応援歌の歌詞・コールを入力してください");
      return;
    }
    if (trimmedUrl && !isValidHttpUrl(trimmedUrl)) {
      toast.error("YouTube・参考リンクは http:// または https:// から始まるURLを入力してください");
      return;
    }

    const item: TeamCheerChantItem = {
      id: editingChantDraft.id,
      title,
      category: editingChantDraft.category,
      lyrics,
      youtubeUrl: trimmedUrl || null,
    };

    const nextList = editingChantDraft.isNew
      ? [...teamChants, item]
      : teamChants.map((c) => (c.id === item.id ? item : c));

    await persistTeamChantsList(
      nextList,
      editingChantDraft.isNew
        ? `「${title}」を追加しました`
        : `「${title}」を更新しました`
    );
  };

  const handleDeleteTeamChant = async (chantId: string, chantTitle: string) => {
    const nextList = teamChants.filter((c) => c.id !== chantId);
    await persistTeamChantsList(nextList, `「${chantTitle}」を削除しました`);
  };

  const renderPlayerCheerCard = (
    player: CheerSongPlayerItem,
    options?: {
      battingOrder?: number;
      lineupPosition?: string;
      isFeatured?: boolean;
    }
  ) => {
    const callName = resolveCallName(player);
    const posLabel = formatPositionLabel(
      options?.lineupPosition || player.primaryPosition
    );
    const batsLabel =
      player.bats === "L"
        ? "左打"
        : player.bats === "S"
        ? "両打"
        : player.bats === "R"
        ? "右打"
        : "";
    const defaultCall =
      player.cheerCall && player.cheerCall.trim()
        ? player.cheerCall.trim()
        : `かっとばせー！${callName}！`;
    const youtubeHref = isValidHttpUrl(player.cheerYoutubeUrl)
      ? player.cheerYoutubeUrl.trim()
      : null;

    return (
      <article
        key={
          options?.battingOrder
            ? `order-${options.battingOrder}-${player.id}`
            : player.id
        }
        className={cn(
          "rounded-2xl border bg-card shadow-xs overflow-hidden",
          options?.isFeatured ? "border-primary" : "border-border"
        )}
      >
        {/* A-3 ダークキャップヘッダー */}
        <div
          className={cn(
            "bg-[#0f172a] text-slate-50 px-4 py-3 flex items-center justify-between gap-2 border-b-[3px]",
            options?.isFeatured ? "border-primary" : "border-teal-500"
          )}
        >
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            {typeof options?.battingOrder === "number" && (
              <span className="px-2 py-0.5 rounded-lg bg-primary text-primary-foreground text-xs font-black tabular-nums shrink-0">
                {options.battingOrder}番
              </span>
            )}
            <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-amber-300 border border-slate-700 text-xs font-black tabular-nums shrink-0">
              #{player.uniformNumber || "—"}
            </span>
            <h3 className="text-sm sm:text-base font-black text-white truncate">
              {player.name}
            </h3>
            {posLabel && (
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10.5px] font-black shrink-0">
                {posLabel}
              </span>
            )}
            {batsLabel && (
              <span className="text-[10px] font-bold text-slate-300 shrink-0">
                {batsLabel}
              </span>
            )}
          </div>

          {player.canEditCheer && (
            <button
              type="button"
              onClick={() => openPlayerEditModal(player)}
              className="py-1 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-[11px] font-black inline-flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer"
            >
              <Edit3 className="w-3 h-3 text-sky-300" />
              <span>編集</span>
            </button>
          )}
        </div>

        {/* 本文エリア */}
        <div className="p-4 space-y-3">
          {/* 呼び名・登場曲バー */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="px-3 py-2 rounded-xl bg-muted/45 border border-border flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold text-muted-foreground shrink-0">
                📣 呼び名・コール名
              </span>
              <span className="text-xs font-black text-primary truncate">
                {callName}
              </span>
            </div>

            <div className="px-3 py-2 rounded-xl bg-muted/45 border border-border flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold text-muted-foreground shrink-0">
                🎵 登場曲
              </span>
              <span className="text-xs font-black text-foreground truncate">
                {player.walkUpSong || "未設定"}
              </span>
            </div>
          </div>

          {/* 応援歌歌詞・コール表示ボックス（屋外高視認性） */}
          <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="px-2 py-0.5 rounded-md bg-primary/12 text-primary text-[10.5px] font-black inline-flex items-center gap-1">
                <Volume2 className="w-3 h-3" />
                <span>応援歌・コール</span>
              </span>
              {!player.cheerLyrics && player.canEditCheer && (
                <button
                  type="button"
                  onClick={() => openPlayerEditModal(player)}
                  className="text-[10.5px] font-black text-primary hover:underline cursor-pointer"
                >
                  ＋ 歌詞を登録する
                </button>
              )}
            </div>

            {player.cheerLyrics && player.cheerLyrics.trim() ? (
              <p className="text-sm sm:text-base font-black text-foreground leading-relaxed whitespace-pre-wrap tracking-wide">
                {applyPlayerCallToLyrics(player.cheerLyrics, callName)}
              </p>
            ) : teamChants[0] ? (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground block">
                  ※ 個別歌詞未設定のためチーム共通「{teamChants[0].title}」を表示中
                </span>
                <p className="text-sm font-black text-foreground leading-relaxed whitespace-pre-wrap">
                  {applyPlayerCallToLyrics(teamChants[0].lyrics, callName)}
                </p>
              </div>
            ) : (
              <p className="text-xs font-bold text-muted-foreground">
                個別応援歌はまだ登録されていません。下のコールで盛り上げましょう！
              </p>
            )}

            <div className="pt-2 border-t border-border flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs sm:text-sm font-black text-primary">
                📣 {defaultCall}
              </p>

              {youtubeHref && (
                <a
                  href={youtubeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-1.5 px-3 rounded-xl bg-[#FF0000] hover:bg-[#CC0000] text-white text-[11px] font-black inline-flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>YouTubeで原曲を聴く</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  };

  const activeBatterEntry = resolvedLineupEntries[activeBatterIndex] || null;

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader
        shareData={{
          title: `【応援歌・コール】${currentTeam?.name || "チーム"} スタメン応援ボード`,
          text: "スタメン打順連動の応援歌・選手コールはこちらから確認できます",
        }}
      />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="応援歌・コール"
          subtitle="スタメン打順連動・選手コール＆チャンステーマ"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <Music className="w-4 h-4" />
            </span>
          }
          showBack
        />

        {/* 🔀 3モード切替タブ */}
        <div className="grid grid-cols-3 gap-1 bg-muted p-1 rounded-2xl border border-border">
          {(
            [
              {
                id: "lineup" as const,
                label: "⚾ スタメン打順",
              },
              {
                id: "roster" as const,
                label: "🔢 背番号順",
              },
              {
                id: "team" as const,
                label: "🎺 チーム応援歌",
              },
            ] as const
          ).map((tab) => {
            const isActive = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMode(tab.id)}
                className={cn(
                  "py-2.5 px-1.5 rounded-xl text-[11px] sm:text-xs transition-all cursor-pointer truncate",
                  isActive
                    ? "bg-card text-foreground shadow-xs border border-border font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent active:scale-95"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 初期ロードエラー（リトライ中もアンマウントせずスピナー維持） */}
        {!hasLoaded && loadError ? (
          <LiffDataLoadErrorCard
            title="応援歌・コールデータを読み込めませんでした"
            onRetry={() => void loadCheerBoard(true)}
            isRetrying={isLoading}
          />
        ) : isLoading && !hasLoaded ? (
          <div className="rounded-2xl border border-border bg-card shadow-xs p-8 flex flex-col items-center justify-center gap-2.5">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold text-muted-foreground">
              選手・スタメン応援データを読み込み中...
            </span>
          </div>
        ) : mode === "lineup" ? (
          /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
             MODE 1: ⚾ スタメン打順 1〜9番 連動ボード
             ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
          resolvedLineupEntries.length === 0 ? (
            <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-sky-300 shrink-0" />
                <h2 className="text-xs sm:text-sm font-black text-white">
                  スタメン打順データがありません
                </h2>
              </div>
              <div className="p-5 text-center space-y-3">
                <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                  まだスタメン登録済みの試合またはオーダーテンプレートがありません。試合管理でスタメンを登録すると、1番〜9番の打順どおりにワンタップで応援歌を送れます。
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setMode("roster")}
                    className="py-2 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    🔢 背番号順（全員）を見る
                  </button>
                  <Link
                    href="/liff/lineups"
                    className="py-2 px-4 rounded-xl bg-card hover:bg-muted border border-border text-xs font-black text-foreground active:scale-95 transition-all"
                  >
                    スタメン編成へ
                  </Link>
                </div>
              </div>
            </section>
          ) : (
            <div className="space-y-4">
              {/* スタメン選択 ＆ 打順クイックジャンプ ＆ ◀前の打者 / 次の打者▶ */}
              <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ListOrdered className="w-4 h-4 text-sky-300 shrink-0" />
                    <h2 className="text-xs sm:text-sm font-black text-white truncate">
                      応援スタンド・打順ナビ
                    </h2>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 border border-slate-700 text-[10px] font-black shrink-0 tabular-nums">
                    現在 {activeBatterEntry?.order || 1}番打者
                  </span>
                </div>

                <div className="p-3.5 space-y-3">
                  {/* 参照スタメン切替 (LiffSelect) */}
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-black text-muted-foreground block">
                      参照するスタメン・オーダー
                    </label>
                    <LiffSelect
                      value={activeLineupSource?.id || ""}
                      onChange={(val) => {
                        setSelectedLineupId(val);
                        setActiveBatterIndex(0);
                      }}
                      options={lineupSelectOptions}
                      title="参照するスタメンを選択"
                      accent="primary"
                      size="sm"
                      searchable={lineupSelectOptions.length > 6}
                      className="w-full"
                    />
                  </div>

                  {/* 横スクロール 1〜9番 クイックジャンプピル */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {resolvedLineupEntries.map((entry, idx) => {
                      const isCurrent = idx === activeBatterIndex;
                      const shortCall = resolveCallName(entry.player);
                      return (
                        <button
                          key={`${entry.order}-${entry.player.id}`}
                          type="button"
                          onClick={() => setActiveBatterIndex(idx)}
                          className={cn(
                            "px-2.5 py-1.5 rounded-xl border text-left shrink-0 transition-all active:scale-95 cursor-pointer min-w-[72px]",
                            isCurrent
                              ? "bg-[#0f172a] text-white border-[#0f172a] shadow-xs"
                              : "bg-muted/45 hover:bg-muted text-foreground border-border"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1 text-[10px] font-black tabular-nums">
                            <span
                              className={
                                isCurrent
                                  ? "text-sky-300"
                                  : "text-muted-foreground"
                              }
                            >
                              {entry.order}番
                            </span>
                            <span
                              className={
                                isCurrent
                                  ? "text-amber-300"
                                  : "text-muted-foreground"
                              }
                            >
                              #{entry.player.uniformNumber || "—"}
                            </span>
                          </div>
                          <div className="text-xs font-black truncate mt-0.5">
                            {shortCall}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* ワンタップ打者送りバー */}
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleStepBatter(-1)}
                      className="py-2.5 px-3 rounded-xl bg-card hover:bg-muted border border-border text-xs font-black text-foreground flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                      <span>前の打者</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStepBatter(1)}
                      className="py-2.5 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-2xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                    >
                      <span>次の打者へ</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </section>

              {/* 現在選択中の打席選手カード */}
              {activeBatterEntry &&
                renderPlayerCheerCard(activeBatterEntry.player, {
                  battingOrder: activeBatterEntry.order,
                  lineupPosition: activeBatterEntry.position,
                  isFeatured: true,
                })}

              {/* 得点圏・チャンステーマ即応ミニカード（現在の打者名を自動差込） */}
              {activeBatterEntry && teamChants.length > 0 && (
                <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                  <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 px-4 py-2.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-white flex items-center gap-1.5">
                      <Megaphone className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>
                        チャンス・共通テーマ（{resolveCallName(activeBatterEntry.player)} 差込）
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setMode("team")}
                      className="text-[10.5px] font-black text-slate-300 hover:text-white cursor-pointer"
                    >
                      一覧へ →
                    </button>
                  </div>
                  <div className="p-3.5 space-y-2.5">
                    {teamChants.slice(0, 2).map((chant) => {
                      const catMeta = CHANT_CATEGORY_META[chant.category];
                      const ytUrl = isValidHttpUrl(chant.youtubeUrl)
                        ? chant.youtubeUrl.trim()
                        : null;
                      return (
                        <div
                          key={chant.id}
                          className="p-3 rounded-xl bg-muted/35 border border-border space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-foreground truncate">
                              {chant.title}
                            </span>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[9.5px] font-black border shrink-0",
                                catMeta.badgeClass
                              )}
                            >
                              {catMeta.shortLabel}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm font-black text-foreground leading-relaxed whitespace-pre-wrap">
                            {applyPlayerCallToLyrics(
                              chant.lyrics,
                              resolveCallName(activeBatterEntry.player)
                            )}
                          </p>
                          {ytUrl && (
                            <div className="pt-1 flex justify-end">
                              <a
                                href={ytUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="py-1 px-2.5 rounded-lg bg-[#FF0000] hover:bg-[#CC0000] text-white text-[10.5px] font-black inline-flex items-center gap-1 active:scale-95 transition-all"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>YouTube</span>
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* スタメン全体一覧（タップで打者切替） */}
              <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-black text-white">
                    本日の打順一覧（タップで表示切替）
                  </span>
                  <span className="text-[10px] font-bold text-slate-300 tabular-nums">
                    全{resolvedLineupEntries.length}名
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {resolvedLineupEntries.map((entry, idx) => {
                    const isCurrent = idx === activeBatterIndex;
                    const posLabel = formatPositionLabel(
                      entry.position || entry.player.primaryPosition
                    );
                    return (
                      <div
                        key={`list-${entry.order}-${entry.player.id}`}
                        className={cn(
                          "px-3.5 py-2.5 flex items-center justify-between gap-2 transition-colors",
                          isCurrent ? "bg-primary/8" : "hover:bg-muted/40"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveBatterIndex(idx)}
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <span
                            className={cn(
                              "w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center tabular-nums shrink-0",
                              isCurrent
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground border border-border"
                            )}
                          >
                            {entry.order}
                          </span>
                          {posLabel && (
                            <span className="w-6 text-center py-0.5 rounded bg-muted text-foreground border border-border text-[10.5px] font-black shrink-0">
                              {posLabel}
                            </span>
                          )}
                          <span className="text-[11px] font-black text-muted-foreground tabular-nums shrink-0">
                            #{entry.player.uniformNumber || "—"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-foreground truncate">
                              {entry.player.name}
                            </p>
                            <p className="text-[10px] font-bold text-muted-foreground truncate">
                              📣 {resolveCallName(entry.player)}
                              {entry.player.walkUpSong
                                ? ` ／ 🎵 ${entry.player.walkUpSong}`
                                : ""}
                            </p>
                          </div>
                        </button>

                        {entry.player.canEditCheer && (
                          <button
                            type="button"
                            onClick={() => openPlayerEditModal(entry.player)}
                            className="py-1 px-2 rounded-lg bg-card hover:bg-muted border border-border text-[10.5px] font-black text-foreground shrink-0 cursor-pointer"
                          >
                            編集
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )
        ) : mode === "roster" ? (
          /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
             MODE 2: 🔢 背番号順（全員）リスト
             ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
          <div className="space-y-3.5">
            {players.length > 5 && (
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={rosterQuery}
                  onChange={(e) => setRosterQuery(e.target.value)}
                  placeholder="背番号・選手名・コール名・登場曲で検索"
                  className="w-full pl-9 pr-8 py-2.5 rounded-2xl bg-card border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary shadow-2xs"
                />
                {rosterQuery && (
                  <button
                    type="button"
                    onClick={() => setRosterQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label="検索条件をクリア"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {players.length === 0 ? (
              <section className="rounded-2xl border border-border bg-card shadow-xs p-6 text-center space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-primary/12 text-primary flex items-center justify-center mx-auto">
                  <Users className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-foreground">
                    登録選手がいません
                  </h3>
                  <p className="text-xs font-bold text-muted-foreground">
                    選手名鑑に選手を登録すると、選手ごとの応援歌・登場曲・コールを設定できます。
                  </p>
                </div>
                <Link
                  href="/liff/players"
                  className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black"
                >
                  <IdCard className="w-3.5 h-3.5" />
                  <span>選手名鑑を開く</span>
                </Link>
              </section>
            ) : filteredRosterPlayers.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card shadow-xs p-6 text-center text-xs font-bold text-muted-foreground">
                「{rosterQuery}」に一致する選手が見つかりませんでした
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredRosterPlayers.map((p) => renderPlayerCheerCard(p))}
              </div>
            )}
          </div>
        ) : (
          /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
             MODE 3: 🎺 チーム共通応援歌・チャンステーマ
             ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-muted-foreground leading-snug">
                歌詞に <code className="px-1 py-0.5 rounded bg-muted text-foreground font-black">（選手名）</code> と入れると、打順ボードで打者のコール名に自動変換されます。
              </p>
              {canManageTeamChants && (
                <button
                  type="button"
                  disabled={isSavingTeamChants}
                  onClick={openAddChantModal}
                  className="py-2 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black inline-flex items-center gap-1 shrink-0 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>追加</span>
                </button>
              )}
            </div>

            {teamChants.length === 0 ? (
              <section className="rounded-2xl border border-border bg-card shadow-xs p-6 text-center space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-primary/12 text-primary flex items-center justify-center mx-auto">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-foreground">
                    チーム共通応援歌が未登録です
                  </h3>
                  <p className="text-xs font-bold text-muted-foreground">
                    チャンステーマや出塁テーマを登録して、保護者・ベンチ全員で共有しましょう。
                  </p>
                </div>
                {canManageTeamChants && (
                  <button
                    type="button"
                    onClick={openAddChantModal}
                    className="py-2 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>最初の応援歌を追加する</span>
                  </button>
                )}
              </section>
            ) : (
              <div className="space-y-3.5">
                {teamChants.map((chant) => {
                  const catMeta = CHANT_CATEGORY_META[chant.category];
                  const youtubeHref = isValidHttpUrl(chant.youtubeUrl)
                    ? chant.youtubeUrl.trim()
                    : null;
                  const isConfirmingDelete = confirmDeleteChantId === chant.id;

                  return (
                    <article
                      key={chant.id}
                      className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
                    >
                      <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <span
                            className={cn(
                              "inline-block px-2 py-0.5 rounded-md text-[10px] font-black border",
                              chant.category === "chance"
                                ? "bg-rose-500/20 text-rose-300 border-rose-400/35"
                                : chant.category === "call"
                                ? "bg-teal-500/20 text-teal-300 border-teal-400/35"
                                : "bg-primary/25 text-sky-200 border-sky-400/35"
                            )}
                          >
                            {catMeta.label}
                          </span>
                          <h3 className="text-sm sm:text-base font-black text-white truncate">
                            {chant.title}
                          </h3>
                        </div>

                        {canManageTeamChants && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={isSavingTeamChants}
                              onClick={() => openEditChantModal(chant)}
                              className="py-1 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-[11px] font-black inline-flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3 text-sky-300" />
                              <span>編集</span>
                            </button>
                            <button
                              type="button"
                              disabled={isSavingTeamChants}
                              onClick={() =>
                                setConfirmDeleteChantId((prev) =>
                                  prev === chant.id ? null : chant.id
                                )
                              }
                              className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 transition-colors cursor-pointer"
                              aria-label={`${chant.title}を削除`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="p-3.5 rounded-2xl bg-muted/40 border border-border">
                          <p className="text-sm sm:text-base font-black text-foreground leading-relaxed whitespace-pre-wrap tracking-wide">
                            {chant.lyrics}
                          </p>
                        </div>

                        {youtubeHref && (
                          <div className="flex justify-end">
                            <a
                              href={youtubeHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="py-2 px-3.5 rounded-xl bg-[#FF0000] hover:bg-[#CC0000] text-white text-xs font-black inline-flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>YouTubeで原曲・リズムを確認</span>
                            </a>
                          </div>
                        )}

                        {canManageTeamChants && isConfirmingDelete && (
                          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-destructive">
                              「{chant.title}」を削除しますか？
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isSavingTeamChants}
                                onClick={() => setConfirmDeleteChantId(null)}
                                className="px-2.5 py-1 rounded-lg bg-card border border-border text-[11px] font-black text-foreground cursor-pointer"
                              >
                                やめる
                              </button>
                              <button
                                type="button"
                                disabled={isSavingTeamChants}
                                onClick={() =>
                                  void handleDeleteTeamChant(
                                    chant.id,
                                    chant.title
                                  )
                                }
                                className="px-3 py-1 rounded-lg bg-destructive text-white text-[11px] font-black cursor-pointer"
                              >
                                {isSavingTeamChants ? "削除中..." : "削除する"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          MODAL 1: 選手応援歌・登場曲 編集モーダル (Portal z-[9999])
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted &&
        typeof document !== "undefined" &&
        editingPlayerDraft &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => !isSavingPlayer && setEditingPlayerDraft(null)}
          >
            <div
              className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[90dvh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-amber-300 border border-slate-700 text-xs font-black tabular-nums shrink-0">
                    #{editingPlayerDraft.uniformNumber || "—"}
                  </span>
                  <h3 className="text-sm font-black text-white truncate">
                    {editingPlayerDraft.playerName} の応援歌設定
                  </h3>
                </div>
                <button
                  type="button"
                  disabled={isSavingPlayer}
                  onClick={() => setEditingPlayerDraft(null)}
                  className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    📣 呼び名・コール名
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={editingPlayerDraft.nickname}
                    onChange={(e) =>
                      setEditingPlayerDraft({
                        ...editingPlayerDraft,
                        nickname: e.target.value,
                      })
                    }
                    placeholder="例: ショウタ、キャプテン颯太"
                    className="w-full px-3 py-2 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    🎵 登場曲（曲名 / アーティスト）
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={editingPlayerDraft.walkUpSong}
                    onChange={(e) =>
                      setEditingPlayerDraft({
                        ...editingPlayerDraft,
                        walkUpSong: e.target.value,
                      })
                    }
                    placeholder="例: 栄光の架橋 / ゆず"
                    className="w-full px-3 py-2 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    🗣️ 応援コール（掛け声）
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={editingPlayerDraft.cheerCall}
                    onChange={(e) =>
                      setEditingPlayerDraft({
                        ...editingPlayerDraft,
                        cheerCall: e.target.value,
                      })
                    }
                    placeholder="例: かっとばせー！ショウタ！"
                    className="w-full px-3 py-2 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    🎶 個別応援歌の歌詞（未入力ならチーム共通テーマを表示）
                  </label>
                  <textarea
                    rows={4}
                    maxLength={400}
                    value={editingPlayerDraft.cheerLyrics}
                    onChange={(e) =>
                      setEditingPlayerDraft({
                        ...editingPlayerDraft,
                        cheerLyrics: e.target.value,
                      })
                    }
                    placeholder="例: 鋭いスイング見せろよ翔太　勝利へ導く一撃を"
                    className="w-full px-3 py-2 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary resize-none leading-relaxed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    ▶️ 参考YouTube URL（任意）
                  </label>
                  <input
                    type="url"
                    maxLength={300}
                    value={editingPlayerDraft.cheerYoutubeUrl}
                    onChange={(e) =>
                      setEditingPlayerDraft({
                        ...editingPlayerDraft,
                        cheerYoutubeUrl: e.target.value,
                      })
                    }
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-3 py-2 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="px-4 py-3.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card shrink-0 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={isSavingPlayer}
                  onClick={() => setEditingPlayerDraft(null)}
                  className="py-2.5 px-4 rounded-xl bg-card hover:bg-muted border border-border text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSavingPlayer}
                  onClick={() => void handleSavePlayerCheer()}
                  className="py-2.5 px-5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black inline-flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingPlayer ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>保存中...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>保存する</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          MODAL 2: チーム共通応援歌 追加・編集モーダル (Portal z-[9999])
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted &&
        typeof document !== "undefined" &&
        editingChantDraft &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => !isSavingTeamChants && setEditingChantDraft(null)}
          >
            <div
              className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[90dvh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2 shrink-0">
                <h3 className="text-sm font-black text-white truncate">
                  {editingChantDraft.isNew
                    ? "チーム共通応援歌を追加"
                    : "チーム共通応援歌を編集"}
                </h3>
                <button
                  type="button"
                  disabled={isSavingTeamChants}
                  onClick={() => setEditingChantDraft(null)}
                  className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    応援場面・カテゴリ
                  </label>
                  <LiffSelect
                    value={editingChantDraft.category}
                    onChange={(val) =>
                      setEditingChantDraft({
                        ...editingChantDraft,
                        category: val as TeamChantCategory,
                      })
                    }
                    options={CHANT_CATEGORY_SELECT_OPTIONS}
                    title="応援歌のカテゴリを選択"
                    accent="primary"
                    size="sm"
                    searchable={false}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    テーマ名・場面タイトル <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={50}
                    value={editingChantDraft.title}
                    onChange={(e) =>
                      setEditingChantDraft({
                        ...editingChantDraft,
                        title: e.target.value,
                      })
                    }
                    placeholder="例: チャンステーマ（走者二・三塁）"
                    className="w-full px-3 py-2 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-black text-foreground">
                      歌詞・コール内容 <span className="text-destructive">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingChantDraft({
                          ...editingChantDraft,
                          lyrics: `${editingChantDraft.lyrics}（選手名）`,
                        })
                      }
                      className="px-2 py-0.5 rounded-md bg-primary/12 text-primary text-[10px] font-black hover:bg-primary/20 cursor-pointer"
                    >
                      ＋（選手名）を挿入
                    </button>
                  </div>
                  <textarea
                    rows={5}
                    maxLength={600}
                    value={editingChantDraft.lyrics}
                    onChange={(e) =>
                      setEditingChantDraft({
                        ...editingChantDraft,
                        lyrics: e.target.value,
                      })
                    }
                    placeholder="例: レッツゴー！レッツゴー！（選手名）！&#10;ここで決めろよ 勝利の一打！"
                    className="w-full px-3 py-2 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary resize-none leading-relaxed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    ▶️ 参考YouTube URL（任意）
                  </label>
                  <input
                    type="url"
                    maxLength={300}
                    value={editingChantDraft.youtubeUrl}
                    onChange={(e) =>
                      setEditingChantDraft({
                        ...editingChantDraft,
                        youtubeUrl: e.target.value,
                      })
                    }
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-3 py-2 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="px-4 py-3.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card shrink-0 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={isSavingTeamChants}
                  onClick={() => setEditingChantDraft(null)}
                  className="py-2.5 px-4 rounded-xl bg-card hover:bg-muted border border-border text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSavingTeamChants}
                  onClick={() => void handleSaveTeamChantDraft()}
                  className="py-2.5 px-5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black inline-flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingTeamChants ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>保存中...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>
                        {editingChantDraft.isNew ? "追加する" : "更新する"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
