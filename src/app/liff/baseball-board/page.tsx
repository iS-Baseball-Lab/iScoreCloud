// filepath: src/app/liff/baseball-board/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  Gamepad2,
  ChevronLeft,
  Settings2,
  Volume2,
  VolumeX,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  Flame,
  Users,
  Bot,
  Wifi,
  ShieldCheck,
  Copy,
  Share2,
  Lock,
  ListOrdered,
  X,
  Trash2,
  Loader2,
  Gauge,
} from "lucide-react";
import { toast } from "sonner";
import {
  useLiff,
  useScoreTeamDisplayName,
} from "@/components/liff/LiffProvider";
import { peekLiffApiCache } from "@/lib/liff/api-cache";
import {
  buildShareableLiffPageUrl,
  getClientQueryParam,
  shareLiffPageViaLine,
  sharePlainTextViaLine,
} from "@/lib/liff/liff-client";
import { canGoBackInLiff, navigateToLiffRoot } from "@/lib/liff/navigation";
import {
  BaseballBoardCanvas,
  type BaseballBoardCanvasHandle,
  type BoardActionPhase,
  type OnlinePitchButtonMode,
  type ResolvedBoardPlay,
} from "@/components/liff/BaseballBoardCanvas";
import { BaseballBoardOnlineModal } from "@/components/liff/BaseballBoardOnlineModal";
import {
  DERBY_TOTAL_PITCHES,
  MAX_VANISH_PITCHES_PER_GAME,
  PITCH_SPEED_PRESETS,
  PITCH_TYPE_META,
  applyPlayOutcome,
  buildBaseballBoardShareText,
  buildTeamLineupFromRoster,
  chooseCpuPitch,
  createGenericLineup,
  createInitialMatchState,
  formatRunnerSituationLabel,
  loadBaseballBoardLocalStats,
  recordFinishedGameToLocalStats,
  recordMaxExitVelocityToLocalStats,
  resetBaseballBoardLocalStats,
  type BaseballBoardLocalStats,
  type BaseballBoardMatchState,
  type BatterStance,
  type BoardPlayer,
  type CpuDifficulty,
  type GameMode,
  type PitchCourse,
  type PitchSpec,
  type PitchSpeedPreset,
  type PitchType,
  type RawRosterPlayerCandidate,
} from "@/lib/liff/baseball-board-engine";
import {
  getSavedBaseballBoardSoundEnabled,
  playGameSetFanfare,
  playPocketResult,
  saveBaseballBoardSoundEnabled,
} from "@/lib/liff/baseball-board-audio";
import type {
  OnlinePlayReplayData,
  OnlineResolvedPlayPayload,
  OnlineRoomActionResponse,
  OnlineRoomDetail,
  OnlineRoomSummary,
  OnlineRoomsListResponse,
} from "@/types/baseball-board-online";

interface PlayersApiMinimalResponse {
  success: boolean;
  players?: RawRosterPlayerCandidate[];
}

function extractOnlineRoomIdFromQuery(): string | null {
  const direct = getClientQueryParam("room")?.trim() || "";
  if (direct) return direct;
  const liffState = getClientQueryParam("liff.state") || "";
  if (liffState) {
    const qIdx = liffState.indexOf("?");
    if (qIdx >= 0) {
      try {
        const sp = new URLSearchParams(liffState.slice(qIdx));
        const nested = sp.get("room")?.trim() || "";
        if (nested) return nested;
      } catch {
        return null;
      }
    }
  }
  return null;
}

const MODE_OPTIONS: ReadonlyArray<{
  id: GameMode;
  label: string;
  shortDesc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "cpu",
    label: "1P vs CPU",
    shortDesc: "投打でCPUと真剣勝負",
    icon: Bot,
  },
  {
    id: "online",
    label: "通信対戦 (チーム内)",
    shortDesc: "仲間とリアルタイム対決",
    icon: Wifi,
  },
  {
    id: "versus",
    label: "2P 1台対戦",
    shortDesc: "親子・友達と交互に対戦",
    icon: Users,
  },
  {
    id: "derby",
    label: "HR競争 (10球)",
    shortDesc: "サクッと柵越え連発狙い",
    icon: Flame,
  },
];

const INNING_OPTIONS = [1, 3, 5, 7] as const;

const DIFFICULTY_OPTIONS: ReadonlyArray<{
  id: CpuDifficulty;
  label: string;
}> = [
  { id: "easy", label: "やさしい" },
  { id: "normal", label: "ふつう" },
  { id: "hard", label: "つよい" },
];

const COURSE_CYCLE: readonly PitchCourse[] = ["inside", "middle", "outside"];
const COURSE_LABELS: Readonly<Record<PitchCourse, string>> = {
  inside: "内角",
  middle: "真ん中",
  outside: "外角",
};

const STANDARD_PITCH_TYPES: readonly PitchType[] = [
  "straight",
  "curve",
  "shoot",
  "changeup",
];

export default function LiffBaseballBoardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentTeam, profile, liff } = useLiff();
  const { scoreTeamName } = useScoreTeamDisplayName("自チーム");

  const activeTeamId =
    currentTeam?.id ||
    (typeof window !== "undefined"
      ? localStorage.getItem("iscore_selectedTeamId") || "demo-team"
      : "demo-team");

  const canvasRef = useRef<BaseballBoardCanvasHandle | null>(null);
  const autoPitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    getSavedBaseballBoardSoundEnabled()
  );
  const [mode, setMode] = useState<GameMode>("cpu");
  const [totalInnings, setTotalInnings] = useState<number>(3);
  const [difficulty, setDifficulty] = useState<CpuDifficulty>("normal");
  // 初期状態で迷わずすぐバッティングできるよう「先攻（1回表＝自分の攻撃）」をデフォルト化！
  const [playerBatsFirst, setPlayerBatsFirst] = useState<boolean>(true);
  const [speedPreset, setSpeedPreset] = useState<PitchSpeedPreset>("normal");
  const [useTeamRoster, setUseTeamRoster] = useState<boolean>(true);
  const [autoPitchEnabled, setAutoPitchEnabled] = useState<boolean>(false);
  const [isPageSharing, setIsPageSharing] = useState<boolean>(false);

  // チーム選手名鑑（読取専用キャッシュ連携）
  const [rosterPlayers, setRosterPlayers] = useState<
    RawRosterPlayerCandidate[]
  >(() => {
    if (typeof window === "undefined") return [];
    const uid =
      localStorage.getItem("iscore_user_id") ||
      localStorage.getItem("iscore_userId") ||
      "";
    const uName = localStorage.getItem("iscore_user_name") || "";
    const qs = new URLSearchParams({ teamId: activeTeamId });
    if (uid && uid !== "cached-user") qs.set("userId", uid);
    if (uName) qs.set("userName", uName);
    const cached = peekLiffApiCache<PlayersApiMinimalResponse>(
      `/api/liff/players?${qs.toString()}`
    );
    return cached?.success && Array.isArray(cached.players)
      ? cached.players
      : [];
  });

  const effectiveMyLineup: BoardPlayer[] = useMemo(() => {
    if (useTeamRoster && rosterPlayers.length > 0) {
      return buildTeamLineupFromRoster(rosterPlayers);
    }
    return createGenericLineup("my");
  }, [rosterPlayers, useTeamRoster]);

  const [matchState, setMatchState] = useState<BaseballBoardMatchState>(() =>
    createInitialMatchState({
      mode: "cpu",
      totalInnings: 3,
      difficulty: "normal",
      myTeamName: scoreTeamName,
      myLineup: effectiveMyLineup,
      playerIsHome: false, // 先攻＝最初からバッティング！
    })
  );

  const [boardPhase, setBoardPhase] = useState<BoardActionPhase>("idle");
  const [stance, setStance] = useState<BatterStance>("contact");
  const [selectedCourse, setSelectedCourse] = useState<PitchCourse>("middle");
  const [selectedPitchType, setSelectedPitchType] =
    useState<PitchType>("straight");
  const [lockedVersusPitch, setLockedVersusPitch] = useState<PitchSpec | null>(
    null
  );

  const [bannerText, setBannerText] = useState<string | null>(null);
  const [bannerTone, setBannerTone] = useState<
    "hr" | "hit" | "out" | "walk" | "magic" | "neutral"
  >("neutral");
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [localStats, setLocalStats] = useState<BaseballBoardLocalStats>(() =>
    loadBaseballBoardLocalStats(activeTeamId)
  );

  // モーダル開閉ステート
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOnlineModalOpen, setIsOnlineModalOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isBoxScoreOpen, setIsBoxScoreOpen] = useState(false);
  const [statsModalTab, setStatsModalTab] = useState<"match" | "records">(
    "match"
  );
  const [isConfirmResetStatsOpen, setIsConfirmResetStatsOpen] = useState(false);

  // 🌐 チーム内オンライン通信対戦ステート＆同期Ref
  const [onlineRooms, setOnlineRooms] = useState<OnlineRoomSummary[]>([]);
  const [onlineMyDefaultName, setOnlineMyDefaultName] = useState<string>(
    () => profile?.displayName?.trim().slice(0, 16) || ""
  );
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomDetail | null>(null);
  const [isLoadingOnlineRooms, setIsLoadingOnlineRooms] = useState(false);
  const [isSubmittingOnline, setIsSubmittingOnline] = useState(false);
  const [isOnlineReplayRunning, setIsOnlineReplayRunning] = useState(false);

  const onlineRoomRef = useRef<OnlineRoomDetail | null>(null);
  onlineRoomRef.current = onlineRoom;
  const lastLaunchedOnlinePitchSeqRef = useRef<number>(0);
  const lastReplayedOnlinePlaySeqRef = useRef<number>(0);
  const isOnlineReplayRunningRef = useRef<boolean>(false);
  const recordedOnlineGameFinishKeyRef = useRef<string>("");
  const handledDeepLinkRoomIdRef = useRef<string>("");
  const pendingOnlineResolveRef = useRef<{
    roomId: string;
    turnSeq: number;
    resolvedPlay: OnlineResolvedPlayPayload;
    replayData: OnlinePlayReplayData;
  } | null>(null);

  useEffect(() => {
    if (profile?.displayName && !onlineMyDefaultName) {
      setOnlineMyDefaultName(profile.displayName.trim().slice(0, 16));
    }
  }, [onlineMyDefaultName, profile?.displayName]);

  const clearTimers = useCallback(() => {
    if (autoPitchTimerRef.current) {
      clearTimeout(autoPitchTimerRef.current);
      autoPitchTimerRef.current = null;
    }
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
  }, []);

  const showTemporaryBanner = useCallback(
    (
      title: string,
      tone: "hr" | "hit" | "out" | "walk" | "magic" | "neutral",
      durationMs = 1500
    ) => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
      setBannerText(title);
      setBannerTone(tone);
      bannerTimerRef.current = setTimeout(() => {
        setBannerText(null);
        bannerTimerRef.current = null;
      }, durationMs);
    },
    []
  );

  // チーム選手一覧（読取専用）取得
  useEffect(() => {
    let cancelled = false;
    const loadRoster = async () => {
      const uid =
        profile?.userId ||
        (typeof window !== "undefined"
          ? localStorage.getItem("iscore_user_id") ||
            localStorage.getItem("iscore_userId") ||
            ""
          : "");
      const uName =
        profile?.displayName ||
        (typeof window !== "undefined"
          ? localStorage.getItem("iscore_user_name") || ""
          : "");
      const qs = new URLSearchParams({ teamId: activeTeamId });
      if (uid && uid !== "cached-user") qs.set("userId", uid);
      if (uName) qs.set("userName", uName);
      const url = `/api/liff/players?${qs.toString()}`;

      const cached = peekLiffApiCache<PlayersApiMinimalResponse>(url);
      if (cached?.success && Array.isArray(cached.players) && !cancelled) {
        setRosterPlayers(cached.players);
      }

      try {
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as PlayersApiMinimalResponse;
        if (!cancelled && data.success && Array.isArray(data.players)) {
          setRosterPlayers(data.players);
        }
      } catch {
        // オフライン時も標準メンバーでプレイ可能
      }
    };

    void loadRoster();
    return () => {
      cancelled = true;
    };
  }, [activeTeamId, profile?.displayName, profile?.userId]);

  // チーム切替時の状態・モーダル完全リセット
  const prevTeamIdRef = useRef<string>(activeTeamId);
  useEffect(() => {
    if (prevTeamIdRef.current !== activeTeamId) {
      prevTeamIdRef.current = activeTeamId;
      clearTimers();
      setIsSettingsOpen(false);
      setIsOnlineModalOpen(false);
      setIsGuideOpen(false);
      setIsBoxScoreOpen(false);
      setIsConfirmResetStatsOpen(false);
      setLockedVersusPitch(null);
      setOnlineRoom(null);
      setOnlineRooms([]);
      isOnlineReplayRunningRef.current = false;
      setIsOnlineReplayRunning(false);
      pendingOnlineResolveRef.current = null;
      setBannerText(null);
      setLocalStats(loadBaseballBoardLocalStats(activeTeamId));
      canvasRef.current?.resetBoardIdle();
    }
  }, [activeTeamId, clearTimers]);

  // 新規オフライン試合開始
  const startNewGame = useCallback(
    (overrides?: {
      nextMode?: GameMode;
      nextInnings?: number;
      nextDifficulty?: CpuDifficulty;
      nextBatsFirst?: boolean;
      nextUseRoster?: boolean;
    }) => {
      clearTimers();
      const targetMode = overrides?.nextMode ?? mode;
      if (targetMode === "online") {
        setIsOnlineModalOpen(true);
        return;
      }

      setOnlineRoom(null);
      isOnlineReplayRunningRef.current = false;
      setIsOnlineReplayRunning(false);
      pendingOnlineResolveRef.current = null;

      const targetInnings = overrides?.nextInnings ?? totalInnings;
      const targetDiff = overrides?.nextDifficulty ?? difficulty;
      const targetBatsFirst = overrides?.nextBatsFirst ?? playerBatsFirst;
      const targetUseRoster = overrides?.nextUseRoster ?? useTeamRoster;

      const lineup =
        targetUseRoster && rosterPlayers.length > 0
          ? buildTeamLineupFromRoster(rosterPlayers)
          : createGenericLineup("my");

      canvasRef.current?.resetBoardIdle();
      setLockedVersusPitch(null);
      setBannerText(null);
      setMatchState(
        createInitialMatchState({
          mode: targetMode,
          totalInnings: targetInnings,
          difficulty: targetDiff,
          myTeamName: scoreTeamName,
          myLineup: lineup,
          playerIsHome: targetMode === "derby" ? true : !targetBatsFirst,
        })
      );
    },
    [
      clearTimers,
      difficulty,
      mode,
      playerBatsFirst,
      rosterPlayers,
      scoreTeamName,
      totalInnings,
      useTeamRoster,
    ]
  );

  // 初回名鑑ロード完了時（まだ1球も進んでいない初期状態かつオフラインモードの場合のみ）チーム名・選手名を自動同期
  const isFreshUntouchedGame =
    mode !== "online" &&
    !matchState.isGameOver &&
    matchState.inning === 1 &&
    matchState.balls === 0 &&
    matchState.strikes === 0 &&
    matchState.outs === 0 &&
    matchState.awayScore === 0 &&
    matchState.homeScore === 0 &&
    matchState.awayBatterIdx === 0 &&
    matchState.homeBatterIdx === 0 &&
    matchState.derbyPitchNumber === 1 &&
    boardPhase === "idle";

  useEffect(() => {
    if (!isFreshUntouchedGame) return;
    setMatchState(
      createInitialMatchState({
        mode,
        totalInnings,
        difficulty,
        myTeamName: scoreTeamName,
        myLineup: effectiveMyLineup,
        playerIsHome: mode === "derby" ? true : !playerBatsFirst,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreTeamName, effectiveMyLineup]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const currentBatter: BoardPlayer = useMemo(() => {
    if (matchState.mode === "derby") {
      return (
        matchState.homeLineup[matchState.homeBatterIdx] ??
        createGenericLineup("my")[0]!
      );
    }
    const list = matchState.isTop
      ? matchState.awayLineup
      : matchState.homeLineup;
    const idx = matchState.isTop
      ? matchState.awayBatterIdx
      : matchState.homeBatterIdx;
    return list[idx] ?? createGenericLineup("my")[0]!;
  }, [matchState]);

  const pitcherVanishLeft =
    matchState.mode === "derby"
      ? 0
      : matchState.isTop
      ? matchState.homeVanishLeft
      : matchState.awayVanishLeft;

  const isCpuModePlayerBatting =
    (matchState.isTop && matchState.playerSide === "away") ||
    (!matchState.isTop && matchState.playerSide === "home");

  const isMyOnlineBattingHalf =
    mode === "online" &&
    onlineRoom !== null &&
    onlineRoom.status === "playing" &&
    onlineRoom.mySide !== null &&
    ((matchState.isTop && onlineRoom.mySide === "away") ||
      (!matchState.isTop && onlineRoom.mySide === "home"));

  const isHumanBatterTurn =
    matchState.mode === "derby" ||
    (matchState.mode === "cpu" && isCpuModePlayerBatting) ||
    (matchState.mode === "versus" && lockedVersusPitch !== null) ||
    (mode === "online" && isMyOnlineBattingHalf && !isOnlineReplayRunning);

  const onlinePitchButtonMode: OnlinePitchButtonMode = useMemo(() => {
    if (mode !== "online") return "normal";
    if (
      !onlineRoom ||
      onlineRoom.status !== "playing" ||
      onlineRoom.myRole === "spectator" ||
      !onlineRoom.mySide
    ) {
      return "spectator";
    }
    if (isMyOnlineBattingHalf) {
      return "wait_opponent_pitch";
    }
    if (
      onlineRoom.pitchSeq >= onlineRoom.turnSeq &&
      !onlineRoom.canRetryStuckPitch
    ) {
      return "pitch_sent";
    }
    return "normal";
  }, [isMyOnlineBattingHalf, mode, onlineRoom]);

  const currentSpeedMeta = useMemo(
    () =>
      PITCH_SPEED_PRESETS.find((p) => p.id === speedPreset) ??
      PITCH_SPEED_PRESETS[1]!,
    [speedPreset]
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🌐 チーム内オンライン対戦：同期・ルーム操作ハンドラ群
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const recordOnlineFinishOnce = useCallback(
    (room: OnlineRoomDetail) => {
      if (!room.matchState.isGameOver) return;
      const finishKey = `${room.id}:${room.turnSeq}`;
      if (recordedOnlineGameFinishKeyRef.current === finishKey) return;
      recordedOnlineGameFinishKeyRef.current = finishKey;

      if (room.mySide) {
        const didWin = room.matchState.winner === room.mySide;
        playGameSetFanfare(soundEnabled, didWin);
        const updated = recordFinishedGameToLocalStats(
          activeTeamId,
          room.matchState,
          room.mySide
        );
        setLocalStats(updated);
      }
    },
    [activeTeamId, soundEnabled]
  );

  const syncOnlineRoomFromServer = useCallback(
    (nextRoom: OnlineRoomDetail, isInitialJoin = false) => {
      const prevRoom = onlineRoomRef.current;
      onlineRoomRef.current = nextRoom;
      setOnlineRoom(nextRoom);

      if (isInitialJoin) {
        lastLaunchedOnlinePitchSeqRef.current =
          nextRoom.mySide &&
          ((nextRoom.matchState.isTop && nextRoom.mySide === "away") ||
            (!nextRoom.matchState.isTop && nextRoom.mySide === "home"))
            ? 0
            : nextRoom.pitchSeq;
        lastReplayedOnlinePlaySeqRef.current = nextRoom.lastPlay?.seq ?? 0;
        isOnlineReplayRunningRef.current = false;
        setIsOnlineReplayRunning(false);
        canvasRef.current?.resetBoardIdle();
        setMatchState(nextRoom.matchState);
        if (nextRoom.matchState.isGameOver) {
          recordedOnlineGameFinishKeyRef.current = `${nextRoom.id}:${nextRoom.turnSeq}`;
        }
        return;
      }

      // 1) 待機中だったルームに相手が入室して試合開始！
      if (prevRoom?.status === "waiting" && nextRoom.status === "playing") {
        lastLaunchedOnlinePitchSeqRef.current = 0;
        lastReplayedOnlinePlaySeqRef.current = 0;
        canvasRef.current?.resetBoardIdle();
        setMatchState(nextRoom.matchState);
        showTemporaryBanner("🔥 プレイボール！！", "hit", 1800);
        toast.success(
          `⚾ ${nextRoom.guestName || "チームメイト"}さんが参加しました！`
        );
        return;
      }

      // 2) 試合終了状態から再戦が成立して第2戦開始！
      if (prevRoom?.status === "finished" && nextRoom.status === "playing") {
        lastLaunchedOnlinePitchSeqRef.current = 0;
        lastReplayedOnlinePlaySeqRef.current = 0;
        isOnlineReplayRunningRef.current = false;
        setIsOnlineReplayRunning(false);
        canvasRef.current?.resetBoardIdle();
        setMatchState(nextRoom.matchState);
        showTemporaryBanner("🔥 再戦プレイボール！！", "hit", 1800);
        toast.success("🔥 先攻・後攻を入れ替えて再戦スタート！");
        return;
      }

      // 3) 相手打者の打席結果が確定した瞬間 ➔ 投手（または観戦者）の盤面でリアル軌道リプレイ！
      if (
        nextRoom.lastPlay &&
        nextRoom.lastPlay.seq > lastReplayedOnlinePlaySeqRef.current
      ) {
        const lp = nextRoom.lastPlay;
        lastReplayedOnlinePlaySeqRef.current = lp.seq;
        isOnlineReplayRunningRef.current = true;
        setIsOnlineReplayRunning(true);

        const prePlayBatterBats = currentBatter.bats;
        canvasRef.current?.playOnlineReplay({
          pitch: lp.pitch,
          speedPreset: lp.speedPreset,
          batterBats: prePlayBatterBats,
          replayData: lp.replayData,
          authoritativeResult: lp.resolvedPlay,
          onArriveResult: () => {
            setMatchState(nextRoom.matchState);
            showTemporaryBanner(
              lp.bannerTitle,
              lp.bannerTone,
              nextRoom.matchState.isGameOver ? 2500 : 1450
            );
            if (nextRoom.matchState.isGameOver) {
              recordOnlineFinishOnce(nextRoom);
            } else if (lp.soundKind) {
              playPocketResult(soundEnabled, lp.soundKind);
            }
            const nextDefVanish = nextRoom.matchState.isTop
              ? nextRoom.matchState.homeVanishLeft
              : nextRoom.matchState.awayVanishLeft;
            if (nextDefVanish <= 0) {
              setSelectedPitchType((cur) =>
                cur === "vanish" ? "straight" : cur
              );
            }
          },
          onReplayFinished: () => {
            isOnlineReplayRunningRef.current = false;
            setIsOnlineReplayRunning(false);
            if (onlineRoomRef.current) {
              setMatchState(onlineRoomRef.current.matchState);
            }
          },
        });
        return;
      }

      // 4) リプレイ中でなければ最新スコア・状態を同期（途中退出による決着等も反映）
      if (!isOnlineReplayRunningRef.current) {
        setMatchState(nextRoom.matchState);
        if (
          nextRoom.matchState.isGameOver &&
          prevRoom &&
          !prevRoom.matchState.isGameOver
        ) {
          recordOnlineFinishOnce(nextRoom);
          showTemporaryBanner(nextRoom.matchState.lastCallout, "neutral", 2400);
        }
      }
    },
    [
      currentBatter.bats,
      recordOnlineFinishOnce,
      showTemporaryBanner,
      soundEnabled,
    ]
  );

  const fetchOnlineLobbyRooms = useCallback(async () => {
    if (!activeTeamId || activeTeamId === "demo-team") return;
    setIsLoadingOnlineRooms(true);
    try {
      const res = await fetch(
        `/api/liff/baseball-board/rooms?teamId=${encodeURIComponent(
          activeTeamId
        )}`
      );
      const data = (await res.json()) as OnlineRoomsListResponse;
      if (res.ok && data.success) {
        if (data.myDefaultName) {
          setOnlineMyDefaultName(data.myDefaultName);
        }
        setOnlineRooms(Array.isArray(data.rooms) ? data.rooms : []);
      }
    } catch {
      // ネットワーク一時エラー時は既存リストを維持
    } finally {
      setIsLoadingOnlineRooms(false);
    }
  }, [activeTeamId]);

  const handleOpenOnlineLobby = useCallback(() => {
    setIsSettingsOpen(false);
    setIsOnlineModalOpen(true);
    if (activeTeamId && activeTeamId !== "demo-team") {
      void fetchOnlineLobbyRooms();
    }
  }, [activeTeamId, fetchOnlineLobbyRooms]);

  const handleCreateOnlineRoom = useCallback(
    async (params: {
      totalInnings: number;
      hostBatsFirst: boolean;
      displayName: string;
    }) => {
      if (isSubmittingOnline || activeTeamId === "demo-team") return;
      setIsSubmittingOnline(true);
      try {
        const res = await fetch("/api/liff/baseball-board/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: activeTeamId,
            totalInnings: params.totalInnings,
            hostBatsFirst: params.hostBatsFirst,
            hostDisplayName: params.displayName,
          }),
        });
        const data = (await res.json()) as OnlineRoomActionResponse;
        if (!res.ok || !data.success || !data.room) {
          toast.error(data.error || "ルームの作成に失敗しました");
          return;
        }
        setMode("online");
        syncOnlineRoomFromServer(data.room, true);
        setIsOnlineModalOpen(false);
        toast.success(
          `ルーム #${data.room.roomCode} を作成しました！LINEで相手を招待できます`
        );
      } catch {
        toast.error("通信エラーが発生しました");
      } finally {
        setIsSubmittingOnline(false);
      }
    },
    [activeTeamId, isSubmittingOnline, syncOnlineRoomFromServer]
  );

  const handleJoinOnlineByRoomId = useCallback(
    async (roomId: string, displayName?: string) => {
      if (!roomId) return;
      setIsSubmittingOnline(true);
      try {
        const res = await fetch("/api/liff/baseball-board/rooms/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: activeTeamId !== "demo-team" ? activeTeamId : undefined,
            roomId,
            guestDisplayName: displayName || onlineMyDefaultName || undefined,
          }),
        });
        const data = (await res.json()) as OnlineRoomActionResponse;
        if (!res.ok || !data.success || !data.room) {
          toast.error(data.error || "対戦ルームに参加できませんでした");
          return;
        }
        setMode("online");
        syncOnlineRoomFromServer(data.room, true);
        setIsOnlineModalOpen(false);
        if (data.room.status === "playing") {
          showTemporaryBanner("🔥 プレイボール！！", "hit", 1800);
          toast.success(
            data.room.myRole === "spectator"
              ? "ライブ観戦モードで入室しました！"
              : `🔥 ${data.room.hostName} vs ${
                  data.room.guestName || ""
                } 対戦開始！`
          );
        }
      } catch {
        toast.error("対戦ルームへの接続に失敗しました");
      } finally {
        setIsSubmittingOnline(false);
      }
    },
    [
      activeTeamId,
      onlineMyDefaultName,
      showTemporaryBanner,
      syncOnlineRoomFromServer,
    ]
  );

  const handleJoinOnlineByCode = useCallback(
    async (roomCode: string, displayName: string) => {
      if (!roomCode || activeTeamId === "demo-team") return;
      setIsSubmittingOnline(true);
      try {
        const res = await fetch("/api/liff/baseball-board/rooms/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: activeTeamId,
            roomCode,
            guestDisplayName: displayName,
          }),
        });
        const data = (await res.json()) as OnlineRoomActionResponse;
        if (!res.ok || !data.success || !data.room) {
          toast.error(data.error || "該当番号のルームが見つかりません");
          return;
        }
        setMode("online");
        syncOnlineRoomFromServer(data.room, true);
        setIsOnlineModalOpen(false);
        showTemporaryBanner("🔥 プレイボール！！", "hit", 1800);
        toast.success("ルームに参加しました！プレイボール！");
      } catch {
        toast.error("ルーム参加中に通信エラーが発生しました");
      } finally {
        setIsSubmittingOnline(false);
      }
    },
    [activeTeamId, showTemporaryBanner, syncOnlineRoomFromServer]
  );

  const handleShareOnlineRoomLine = useCallback(
    async (room: OnlineRoomDetail) => {
      const inviteUrl = buildShareableLiffPageUrl({
        pathname: "/liff/baseball-board",
        teamId: room.teamId,
        queryParams: { room: room.id },
        inheritCurrentSearch: false,
      });
      const outcome = await shareLiffPageViaLine({
        title: `⚾ ${room.hostName}さんから野球盤の対戦招待！（#${room.roomCode}）`,
        text: `${scoreTeamName}のチーム内オンライン野球盤（${room.totalInnings}回制）で今すぐ真剣勝負しよう！\nルーム番号: #${room.roomCode}`,
        url: inviteUrl,
        teamId: room.teamId,
        teamName: scoreTeamName,
        liff,
      });
      if (outcome === "shared") {
        toast.success("LINEで対戦招待を送りました！");
      }
    },
    [liff, scoreTeamName]
  );

  const handleCopyRoomCode = useCallback(async (roomCode: string) => {
    try {
      await navigator.clipboard.writeText(roomCode);
      toast.success(`ルーム番号「${roomCode}」をコピーしました！`);
    } catch {
      toast.error("コピーに失敗しました");
    }
  }, []);

  const handleLeaveOnlineRoom = useCallback(
    async (roomId: string) => {
      setIsSubmittingOnline(true);
      try {
        await fetch(`/api/liff/baseball-board/rooms/${roomId}/leave`, {
          method: "POST",
        });
      } catch {
        // ignore network error on leave
      } finally {
        setIsSubmittingOnline(false);
        setOnlineRoom(null);
        onlineRoomRef.current = null;
        pendingOnlineResolveRef.current = null;
        setMode("cpu");
        startNewGame({ nextMode: "cpu" });
        setIsOnlineModalOpen(false);
        toast.success("オンラインルームから退出しました");
      }
    },
    [startNewGame]
  );

  const handleRequestOnlineRematch = useCallback(async () => {
    if (!onlineRoom || isSubmittingOnline) return;
    setIsSubmittingOnline(true);
    try {
      const res = await fetch(
        `/api/liff/baseball-board/rooms/${onlineRoom.id}/rematch`,
        { method: "POST" }
      );
      const data = (await res.json()) as OnlineRoomActionResponse;
      if (res.ok && data.success && data.room) {
        syncOnlineRoomFromServer(data.room);
        if (data.room.status === "finished") {
          toast.success("対戦相手に再戦リクエストを送りました！");
        }
      } else {
        toast.error(data.error || "再戦リクエストに失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmittingOnline(false);
    }
  }, [isSubmittingOnline, onlineRoom, syncOnlineRoomFromServer]);

  // LINE招待カードのディープリンク (`?room=...`) 自動参加
  useEffect(() => {
    const queryRoomId = extractOnlineRoomIdFromQuery();
    if (!queryRoomId || handledDeepLinkRoomIdRef.current === queryRoomId) {
      return;
    }
    if (activeTeamId === "demo-team" && !profile?.userId) {
      return;
    }
    handledDeepLinkRoomIdRef.current = queryRoomId;
    void handleJoinOnlineByRoomId(queryRoomId);
  }, [activeTeamId, handleJoinOnlineByRoomId, profile?.userId]);

  // 省電力・可視状態連動のオンラインルームポーリング（モバイル無線モデム保護対応）
  useEffect(() => {
    const activeRoomId =
      mode === "online" && onlineRoom && onlineRoom.status !== "closed"
        ? onlineRoom.id
        : null;
    const shouldPollLobby = isOnlineModalOpen && activeTeamId !== "demo-team";

    if (!activeRoomId && !shouldPollLobby) return;

    let stopped = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const computeNextIntervalMs = (): number => {
      const rm = onlineRoomRef.current;
      if (!activeRoomId || !rm) return 4000;
      if (rm.status === "waiting") return 2000;
      if (rm.status === "finished") return 2500;
      const idleAge = Date.now() - rm.updatedAt;
      if (idleAge > 180_000) return 7500;
      if (idleAge > 60_000) return 3500;
      return 1200;
    };

    const pollOnce = async () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        timerId = setTimeout(() => void pollOnce(), 4000);
        return;
      }

      // 未送信の打席確定データがあれば優先再送（冪等保護済み）
      const pending = pendingOnlineResolveRef.current;
      if (pending && activeRoomId === pending.roomId) {
        try {
          const retryRes = await fetch(
            `/api/liff/baseball-board/rooms/${pending.roomId}/resolve`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                turnSeq: pending.turnSeq,
                resolvedPlay: pending.resolvedPlay,
                replayData: pending.replayData,
              }),
            }
          );
          const retryData = (await retryRes.json()) as OnlineRoomActionResponse;
          if (retryRes.ok && retryData.success) {
            pendingOnlineResolveRef.current = null;
            if (retryData.room) {
              syncOnlineRoomFromServer(retryData.room);
            }
          }
        } catch {
          // 次のポーリング周期で再試行
        }
      }

      if (activeRoomId) {
        try {
          const res = await fetch(
            `/api/liff/baseball-board/rooms/${activeRoomId}`
          );
          if (res.status === 404) {
            toast.error("対戦ルームが終了しました");
            setOnlineRoom(null);
            setMode("cpu");
            return;
          }
          const data = (await res.json()) as OnlineRoomActionResponse;
          if (!stopped && res.ok && data.success && data.room) {
            syncOnlineRoomFromServer(data.room);
          }
        } catch {
          // 一時通信断時は次サイクルで自動復帰
        }
      }

      if (shouldPollLobby && !stopped) {
        await fetchOnlineLobbyRooms();
      }

      if (!stopped) {
        timerId = setTimeout(() => void pollOnce(), computeNextIntervalMs());
      }
    };

    timerId = setTimeout(() => void pollOnce(), computeNextIntervalMs());

    const handleResume = () => {
      if (typeof document !== "undefined" && !document.hidden && !stopped) {
        if (timerId) clearTimeout(timerId);
        void pollOnce();
      }
    };

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("online", handleResume);

    return () => {
      stopped = true;
      if (timerId) clearTimeout(timerId);
      document.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("online", handleResume);
    };
  }, [
    activeTeamId,
    fetchOnlineLobbyRooms,
    isOnlineModalOpen,
    mode,
    onlineRoom?.id,
    onlineRoom?.status,
    syncOnlineRoomFromServer,
  ]);

  // オンライン打者ターン：相手ピッチャーが投げたボールを受信したら即座に盤面発射！
  useEffect(() => {
    if (
      mode !== "online" ||
      !onlineRoom ||
      onlineRoom.status !== "playing" ||
      !isMyOnlineBattingHalf ||
      isOnlineReplayRunning ||
      boardPhase !== "idle"
    ) {
      return;
    }

    const incomingPitch = onlineRoom.currentPitch;
    if (
      onlineRoom.pitchSeq === onlineRoom.turnSeq &&
      incomingPitch &&
      incomingPitch.seq > lastLaunchedOnlinePitchSeqRef.current
    ) {
      lastLaunchedOnlinePitchSeqRef.current = incomingPitch.seq;
      canvasRef.current?.launchPitch({
        pitch: incomingPitch.pitch,
        speedPreset: incomingPitch.speedPreset,
        batterBats: currentBatter.bats,
        batterIsCpu: false,
        cpuDifficulty: "normal",
        strikes: onlineRoom.matchState.strikes,
        outs: onlineRoom.matchState.outs,
        bases: onlineRoom.matchState.bases,
      });
    }
  }, [
    boardPhase,
    currentBatter.bats,
    isMyOnlineBattingHalf,
    isOnlineReplayRunning,
    mode,
    onlineRoom,
  ]);

  const handleVisibilityAbort = useCallback(() => {
    if (mode === "online") {
      lastLaunchedOnlinePitchSeqRef.current = 0;
    }
  }, [mode]);

  const handleBackClick = () => {
    if (canGoBackInLiff()) {
      router.back();
    } else {
      navigateToLiffRoot(router, pathname);
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveBaseballBoardSoundEnabled(next);
    toast.success(next ? "効果音 ON" : "効果音 OFF（消音）");
  };

  const handleSharePage = async () => {
    if (isPageSharing) return;
    setIsPageSharing(true);
    try {
      if (mode === "online" && onlineRoom && onlineRoom.status === "waiting") {
        await handleShareOnlineRoomLine(onlineRoom);
        return;
      }
      const outcome = await shareLiffPageViaLine({
        title: "野球盤ゲーム｜iScoreCloud",
        text: "懐かしの野球盤ミニゲームで対決しよう！（チーム内オンライン対戦・球速ギア・消える魔球対応）",
        pathname,
        teamId: currentTeam?.id || null,
        teamName: currentTeam?.orgName || currentTeam?.name || null,
        liff,
      });
      if (outcome === "shared") {
        toast.success("LINEでページを共有しました！");
      }
    } finally {
      setIsPageSharing(false);
    }
  };

  // 打者ターンでの投球開始（左下「⚾ 投球」ボタン or 自動投球：CPU投手が球速・球種を自動で投げ分ける）
  const handleStartPitchForBatter = useCallback(() => {
    if (boardPhase !== "idle" || matchState.isGameOver || mode === "online") {
      return;
    }
    if (autoPitchTimerRef.current) {
      clearTimeout(autoPitchTimerRef.current);
      autoPitchTimerRef.current = null;
    }

    let pitchToThrow: PitchSpec;
    if (matchState.mode === "versus") {
      if (!lockedVersusPitch) return;
      pitchToThrow = lockedVersusPitch;
    } else {
      pitchToThrow = chooseCpuPitch({
        difficulty: matchState.difficulty,
        balls: matchState.balls,
        strikes: matchState.strikes,
        vanishLeft: pitcherVanishLeft,
        isDerby: matchState.mode === "derby",
      });
    }

    const effectivePreset: PitchSpeedPreset =
      pitchToThrow.speedPreset ?? "normal";

    canvasRef.current?.launchPitch({
      pitch: pitchToThrow,
      speedPreset: effectivePreset,
      batterBats: currentBatter.bats,
      batterIsCpu: false,
      cpuDifficulty: matchState.difficulty,
      strikes: matchState.strikes,
      outs: matchState.outs,
      bases: matchState.bases,
    });
  }, [
    boardPhase,
    currentBatter.bats,
    lockedVersusPitch,
    matchState.balls,
    matchState.bases,
    matchState.difficulty,
    matchState.isGameOver,
    matchState.mode,
    matchState.outs,
    matchState.strikes,
    mode,
    pitcherVanishLeft,
  ]);

  // 守備ターン（プレイヤーがCPUへ投球）
  const handleHumanPitchToCpu = useCallback(
    (pitchTypeOverride?: PitchType) => {
      if (boardPhase !== "idle" || matchState.isGameOver) return;
      const chosenType = pitchTypeOverride ?? selectedPitchType;
      if (chosenType === "vanish" && pitcherVanishLeft <= 0) {
        toast.error("消える魔球の残り回数がありません");
        return;
      }
      setSelectedPitchType(chosenType);
      canvasRef.current?.launchPitch({
        pitch: {
          type: chosenType,
          course: selectedCourse,
          speedPreset,
        },
        speedPreset,
        batterBats: currentBatter.bats,
        batterIsCpu: true,
        cpuDifficulty: matchState.difficulty,
        strikes: matchState.strikes,
        outs: matchState.outs,
        bases: matchState.bases,
      });
    },
    [
      boardPhase,
      currentBatter.bats,
      matchState.bases,
      matchState.difficulty,
      matchState.isGameOver,
      matchState.outs,
      matchState.strikes,
      pitcherVanishLeft,
      selectedCourse,
      selectedPitchType,
      speedPreset,
    ]
  );

  // オンライン守備ターン：チームメイトへ投球送信！
  const handleOnlinePitchToTeammate = useCallback(async () => {
    const rm = onlineRoomRef.current;
    if (
      !rm ||
      rm.status !== "playing" ||
      boardPhase !== "idle" ||
      isSubmittingOnline
    ) {
      return;
    }
    if (selectedPitchType === "vanish" && pitcherVanishLeft <= 0) {
      toast.error("消える魔球の残り回数がありません");
      return;
    }
    setIsSubmittingOnline(true);
    try {
      const res = await fetch(
        `/api/liff/baseball-board/rooms/${rm.id}/pitch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            turnSeq: rm.turnSeq,
            pitch: {
              type: selectedPitchType,
              course: selectedCourse,
              speedPreset,
            },
          }),
        }
      );
      const data = (await res.json()) as OnlineRoomActionResponse;
      if (!res.ok || !data.success || !data.room) {
        toast.error(data.error || "投球の送信に失敗しました");
        return;
      }
      syncOnlineRoomFromServer(data.room);
      setMatchState((prev) => ({
        ...prev,
        lastCallout: `⚾ ${PITCH_TYPE_META[selectedPitchType].label}（${currentSpeedMeta.baseKmh}km/h）を投げ込みました！相手の打撃待ち…`,
      }));
    } catch {
      toast.error("投球送信中に通信エラーが発生しました");
    } finally {
      setIsSubmittingOnline(false);
    }
  }, [
    boardPhase,
    currentSpeedMeta.baseKmh,
    isSubmittingOnline,
    pitcherVanishLeft,
    selectedCourse,
    selectedPitchType,
    speedPreset,
    syncOnlineRoomFromServer,
  ]);

  // 2P 1台対戦：投手が球種・コース・球速を秘密ロックして打者へ渡す
  const handleLockVersusPitch = useCallback(
    (pitchTypeOverride?: PitchType) => {
      if (boardPhase !== "idle" || matchState.isGameOver) return;
      const chosenType = pitchTypeOverride ?? selectedPitchType;
      if (chosenType === "vanish" && pitcherVanishLeft <= 0) {
        toast.error("消える魔球の残り回数がありません");
        return;
      }
      setLockedVersusPitch({
        type: chosenType,
        course: selectedCourse,
        speedPreset,
      });
    },
    [
      boardPhase,
      matchState.isGameOver,
      pitcherVanishLeft,
      selectedCourse,
      selectedPitchType,
      speedPreset,
    ]
  );

  // ボード左下「⚾ 投球」ボタンからの統一ハンドラ
  const handleBoardCornerPitch = useCallback(() => {
    if (mode === "online") {
      void handleOnlinePitchToTeammate();
      return;
    }
    if (isHumanBatterTurn) {
      handleStartPitchForBatter();
    } else if (matchState.mode === "versus") {
      handleLockVersusPitch();
    } else {
      handleHumanPitchToCpu();
    }
  }, [
    handleHumanPitchToCpu,
    handleLockVersusPitch,
    handleOnlinePitchToTeammate,
    handleStartPitchForBatter,
    isHumanBatterTurn,
    matchState.mode,
    mode,
  ]);

  // 投球前に右下「🏏 打つ！」を押して素振りした時の親切ガイド
  const handlePracticeSwing = useCallback(() => {
    setMatchState((prev) => ({
      ...prev,
      lastCallout:
        mode === "online"
          ? "🏏 ナイス素振り！相手ピッチャーの投球が来たら「打つ！」で打ち返そう！"
          : "🏏 ナイス素振り！左下の青い「⚾ 投球」を押すとボールが来ます！",
    }));
  }, [mode]);

  // 1プレイ決着時のスコア・カウント・最高打球速度更新
  const handlePlayResolved = useCallback(
    (play: ResolvedBoardPlay) => {
      setLockedVersusPitch(null);

      if (play.exitVelocityKmh > 0 && play.outcome !== "foul") {
        const updatedVelStats = recordMaxExitVelocityToLocalStats(
          activeTeamId,
          play.exitVelocityKmh
        );
        setLocalStats(updatedVelStats);
      }

      // 🌐 オンライン通信対戦の打者側確定処理（即時ローカル演出 ＋ サーバー権威確定）
      if (mode === "online" && onlineRoomRef.current) {
        const rm = onlineRoomRef.current;
        const activeSeq = rm.turnSeq;
        lastReplayedOnlinePlaySeqRef.current = activeSeq;

        const resolvedPayload: OnlineResolvedPlayPayload = {
          outcome: play.outcome,
          detailLabel: play.detailLabel,
          usedVanishPitch: play.usedVanishPitch,
          pitchKmh: play.pitchKmh,
          exitVelocityKmh: play.exitVelocityKmh,
        };
        const replayPayload: OnlinePlayReplayData = play.replayData ?? {
          didSwing: false,
          swingTriggerY: 382,
          stance,
          contact: null,
        };

        setMatchState((prev) => {
          const applied = applyPlayOutcome(
            prev,
            play.outcome,
            play.detailLabel,
            play.usedVanishPitch
          );
          showTemporaryBanner(
            applied.bannerTitle,
            applied.bannerTone,
            applied.nextState.isGameOver ? 2500 : 1450
          );
          if (applied.nextState.isGameOver && !prev.isGameOver && rm.mySide) {
            const finishKey = `${rm.id}:${activeSeq + 1}`;
            recordedOnlineGameFinishKeyRef.current = finishKey;
            const didWin = applied.nextState.winner === rm.mySide;
            playGameSetFanfare(soundEnabled, didWin);
            const updatedStats = recordFinishedGameToLocalStats(
              activeTeamId,
              applied.nextState,
              rm.mySide
            );
            setLocalStats(updatedStats);
          } else if (applied.soundKind) {
            playPocketResult(soundEnabled, applied.soundKind);
          }
          return applied.nextState;
        });

        pendingOnlineResolveRef.current = {
          roomId: rm.id,
          turnSeq: activeSeq,
          resolvedPlay: resolvedPayload,
          replayData: replayPayload,
        };

        void (async () => {
          try {
            const res = await fetch(
              `/api/liff/baseball-board/rooms/${rm.id}/resolve`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  turnSeq: activeSeq,
                  resolvedPlay: resolvedPayload,
                  replayData: replayPayload,
                }),
              }
            );
            const data = (await res.json()) as OnlineRoomActionResponse;
            if (res.ok && data.success) {
              pendingOnlineResolveRef.current = null;
              if (data.room) {
                syncOnlineRoomFromServer(data.room);
              }
            }
          } catch {
            // 次回ポーリング時に pendingOnlineResolveRef から自動再送される
          }
        })();

        return;
      }

      setMatchState((prev) => {
        const applied = applyPlayOutcome(
          prev,
          play.outcome,
          play.detailLabel,
          play.usedVanishPitch
        );

        showTemporaryBanner(
          applied.bannerTitle,
          applied.bannerTone,
          applied.nextState.isGameOver ? 2500 : 1450
        );

        if (applied.nextState.isGameOver && !prev.isGameOver) {
          const didWin =
            applied.nextState.mode === "derby"
              ? applied.nextState.derbyHomeRuns >= 3
              : applied.nextState.winner === applied.nextState.playerSide;
          playGameSetFanfare(soundEnabled, didWin);
          const updatedStats = recordFinishedGameToLocalStats(
            activeTeamId,
            applied.nextState
          );
          setLocalStats(updatedStats);
        } else if (applied.soundKind) {
          playPocketResult(soundEnabled, applied.soundKind);
        }

        const nextDefVanish = applied.nextState.isTop
          ? applied.nextState.homeVanishLeft
          : applied.nextState.awayVanishLeft;
        if (nextDefVanish <= 0) {
          setSelectedPitchType((cur) => (cur === "vanish" ? "straight" : cur));
        }

        return applied.nextState;
      });
    },
    [
      activeTeamId,
      mode,
      showTemporaryBanner,
      soundEnabled,
      stance,
      syncOnlineRoomFromServer,
    ]
  );

  // 自動投球モード ON 時（1P vs CPU / HR競争のみ）
  useEffect(() => {
    if (autoPitchTimerRef.current) {
      clearTimeout(autoPitchTimerRef.current);
      autoPitchTimerRef.current = null;
    }

    const anyModalOpen =
      isSettingsOpen ||
      isOnlineModalOpen ||
      isGuideOpen ||
      isBoxScoreOpen ||
      isConfirmResetStatsOpen;

    const canAutoPitch =
      mode !== "online" &&
      autoPitchEnabled &&
      boardPhase === "idle" &&
      !matchState.isGameOver &&
      (matchState.mode === "derby" ||
        (matchState.mode === "cpu" && isCpuModePlayerBatting)) &&
      !anyModalOpen;

    if (!canAutoPitch) return;

    autoPitchTimerRef.current = setTimeout(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      handleStartPitchForBatter();
    }, 1050);

    return () => {
      if (autoPitchTimerRef.current) {
        clearTimeout(autoPitchTimerRef.current);
        autoPitchTimerRef.current = null;
      }
    };
  }, [
    autoPitchEnabled,
    boardPhase,
    handleStartPitchForBatter,
    isBoxScoreOpen,
    isConfirmResetStatsOpen,
    isCpuModePlayerBatting,
    isGuideOpen,
    isOnlineModalOpen,
    isSettingsOpen,
    matchState.isGameOver,
    matchState.mode,
    mode,
  ]);

  const handleCopyResultText = async () => {
    const text = buildBaseballBoardShareText(matchState);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("野球盤の結果テキストをコピーしました！");
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  const handleShareResultLine = async () => {
    const text = buildBaseballBoardShareText(matchState);
    const outcome = await sharePlainTextViaLine({ text, liff });
    if (outcome === "shared") {
      toast.success("LINEで結果を共有しました！");
    }
  };

  const handleCycleCourse = () => {
    const idx = COURSE_CYCLE.indexOf(selectedCourse);
    const next = COURSE_CYCLE[(idx + 1) % COURSE_CYCLE.length] ?? "middle";
    setSelectedCourse(next);
  };

  const activeRosterCount = useMemo(
    () =>
      rosterPlayers.filter(
        (p) => p.isActive !== false && p.conditionStatus !== "on_leave"
      ).length,
    [rosterPlayers]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden overscroll-none bg-background select-none">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ① 上部固定：コンパクトナビ ＆ 電光スコアボード（A-3 Dark Cap）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className="shrink-0 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary pt-[max(env(safe-area-inset-top),8px)] px-3 pb-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              id="btn-baseball-board-back"
              onClick={handleBackClick}
              className="h-8 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-black flex items-center gap-0.5 active:scale-95 transition-all shrink-0 cursor-pointer"
              aria-label="前の画面へ戻る"
            >
              <ChevronLeft className="w-4 h-4 -ml-0.5" />
              <span>戻る</span>
            </button>

            <span className="text-xs font-black text-white whitespace-nowrap shrink-0">
              野球盤
            </span>

            <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black shrink-0">
              {mode === "online" && onlineRoom?.status === "waiting"
                ? "相手待ち"
                : matchState.isGameOver
                ? "試合終了"
                : matchState.mode === "derby"
                ? `${matchState.derbyPitchNumber}/${DERBY_TOTAL_PITCHES}球`
                : `${
                    matchState.inning > matchState.totalInnings ? "延" : ""
                  }${matchState.inning}回${matchState.isTop ? "表" : "裏"}`}
            </span>

            {!matchState.isGameOver &&
              (matchState.mode === "cpu" ||
                (mode === "online" && onlineRoom?.status === "playing")) && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-black shrink-0 ${
                    mode === "online" && onlineRoom?.myRole === "spectator"
                      ? "bg-slate-700 text-slate-200"
                      : isHumanBatterTurn
                      ? "bg-[#dc2626] text-white"
                      : "bg-sky-600 text-white"
                  }`}
                >
                  {mode === "online" && onlineRoom?.myRole === "spectator"
                    ? "観戦"
                    : isHumanBatterTurn
                    ? "攻撃"
                    : "守備"}
                </span>
              )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              id="btn-baseball-board-online"
              onClick={handleOpenOnlineLobby}
              className={`h-8 px-2.5 rounded-xl border text-xs font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer ${
                mode === "online"
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-sky-300"
              }`}
              title="チーム内オンライン対戦ロビー"
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>通信</span>
            </button>

            <button
              type="button"
              id="btn-baseball-board-settings"
              onClick={() => setIsSettingsOpen(true)}
              className="h-8 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
              title="メニュー・試合設定・成績・遊び方"
            >
              <Settings2 className="w-3.5 h-3.5 text-blue-300" />
              <span>メニュー</span>
            </button>
          </div>
        </div>

        {/* 電光スコアボード（タップで打順成績・マイレコードを表示） */}
        {matchState.mode === "derby" ? (
          <div
            onClick={() => {
              setStatsModalTab("records");
              setIsBoxScoreOpen(true);
            }}
            title="タップでマイ戦績レコードを表示"
            className="grid grid-cols-3 gap-1.5 cursor-pointer"
          >
            <div className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">球数</span>
              <span className="text-xs font-black text-white tabular-nums">
                {matchState.derbyPitchNumber}/{DERBY_TOTAL_PITCHES}
              </span>
            </div>
            <div className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">HR</span>
              <span className="text-xs font-black text-amber-400 tabular-nums">
                {matchState.derbyHomeRuns}本
              </span>
            </div>
            <div className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">得点</span>
              <span className="text-xs font-black text-emerald-400 tabular-nums">
                {matchState.derbyPoints}pt
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-stretch gap-1.5">
            <div
              onClick={() => {
                setStatsModalTab("match");
                setIsBoxScoreOpen(true);
              }}
              title="タップでこの試合の打順成績・マイレコードを表示"
              className="flex-1 min-w-0 rounded-xl bg-slate-900 hover:bg-slate-900/90 border border-slate-800 hover:border-slate-700 overflow-x-auto cursor-pointer transition-colors"
            >
              <table className="w-full text-center border-collapse text-[10.5px] tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-[9px] font-bold text-slate-400">
                    <th className="py-0.5 px-1.5 text-left font-bold">
                      {mode === "online"
                        ? "通信対戦"
                        : matchState.mode === "versus"
                        ? "2P対戦"
                        : "チーム"}
                    </th>
                    {matchState.innings.map((_, idx) => (
                      <th key={idx} className="py-0.5 px-1 min-w-[16px]">
                        {idx + 1}
                      </th>
                    ))}
                    <th className="py-0.5 px-1.5 text-amber-300 font-black border-l border-slate-800">
                      計
                    </th>
                    <th className="py-0.5 px-1 text-slate-400 font-bold">安</th>
                  </tr>
                </thead>
                <tbody className="font-black leading-tight">
                  <tr
                    className={`border-b border-slate-800/80 ${
                      matchState.isTop && !matchState.isGameOver
                        ? "bg-slate-800/70"
                        : ""
                    }`}
                  >
                    <td className="py-0.5 px-1.5 text-left truncate max-w-[92px] text-[10px] text-slate-100">
                      {matchState.isTop && !matchState.isGameOver && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 align-middle" />
                      )}
                      {matchState.awayTeamName}
                    </td>
                    {matchState.innings.map((cell, idx) => (
                      <td
                        key={idx}
                        className={`py-0.5 px-1 ${
                          matchState.inning === idx + 1 &&
                          matchState.isTop &&
                          !matchState.isGameOver
                            ? "text-amber-300"
                            : "text-slate-200"
                        }`}
                      >
                        {cell.top === null ? "-" : cell.top}
                      </td>
                    ))}
                    <td className="py-0.5 px-1.5 text-amber-300 text-[11px] border-l border-slate-800">
                      {matchState.awayScore}
                    </td>
                    <td className="py-0.5 px-1 text-slate-400 text-[10px]">
                      {matchState.awayHits}
                    </td>
                  </tr>
                  <tr
                    className={
                      !matchState.isTop && !matchState.isGameOver
                        ? "bg-slate-800/70"
                        : ""
                    }
                  >
                    <td className="py-0.5 px-1.5 text-left truncate max-w-[92px] text-[10px] text-slate-100">
                      {!matchState.isTop && !matchState.isGameOver && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 align-middle" />
                      )}
                      {matchState.homeTeamName}
                    </td>
                    {matchState.innings.map((cell, idx) => (
                      <td
                        key={idx}
                        className={`py-0.5 px-1 ${
                          matchState.inning === idx + 1 &&
                          !matchState.isTop &&
                          !matchState.isGameOver
                            ? "text-amber-300"
                            : "text-slate-200"
                        }`}
                      >
                        {cell.bottom === null
                          ? "-"
                          : cell.bottom === "x"
                          ? "X"
                          : typeof cell.bottomWalkOffRuns === "number"
                          ? `${cell.bottom}x`
                          : cell.bottom}
                      </td>
                    ))}
                    <td className="py-0.5 px-1.5 text-amber-300 text-[11px] border-l border-slate-800">
                      {matchState.homeScore}
                    </td>
                    <td className="py-0.5 px-1 text-slate-400 text-[10px]">
                      {matchState.homeHits}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* BSO電光ランプ ＋ 走者ミニダイヤ */}
            <div className="w-[96px] shrink-0 rounded-xl bg-slate-900 border border-slate-800 px-2 py-1 flex items-center justify-between gap-1">
              <div className="space-y-0.5 text-[9.5px] font-black leading-none">
                <div className="flex items-center gap-0.5">
                  <span className="w-2.5 text-emerald-400">B</span>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`w-2.5 h-2.5 rounded-full border ${
                        i < matchState.balls
                          ? "bg-[#22c55e] border-emerald-300"
                          : "bg-slate-800 border-slate-700"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-0.5">
                  <span className="w-2.5 text-amber-400">S</span>
                  {[0, 1].map((i) => (
                    <span
                      key={i}
                      className={`w-2.5 h-2.5 rounded-full border ${
                        i < matchState.strikes
                          ? "bg-[#f59e0b] border-amber-300"
                          : "bg-slate-800 border-slate-700"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-0.5">
                  <span className="w-2.5 text-red-400">O</span>
                  {[0, 1].map((i) => (
                    <span
                      key={i}
                      className={`w-2.5 h-2.5 rounded-full border ${
                        i < matchState.outs
                          ? "bg-[#ef4444] border-red-300"
                          : "bg-slate-800 border-slate-700"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <svg
                viewBox="0 0 36 36"
                className="w-8 h-8 shrink-0"
                aria-label={formatRunnerSituationLabel(matchState.bases)}
              >
                <polygon
                  points="18,4 24,10 18,16 12,10"
                  fill={matchState.bases.second ? "#fbbf24" : "#1e293b"}
                  stroke="#64748b"
                  strokeWidth="1.5"
                />
                <polygon
                  points="8,14 14,20 8,26 2,20"
                  fill={matchState.bases.third ? "#fbbf24" : "#1e293b"}
                  stroke="#64748b"
                  strokeWidth="1.5"
                />
                <polygon
                  points="28,14 34,20 28,26 22,20"
                  fill={matchState.bases.first ? "#fbbf24" : "#1e293b"}
                  stroke="#64748b"
                  strokeWidth="1.5"
                />
                <polygon
                  points="15,26 21,26 21,29 18,32 15,29"
                  fill="#e2e8f0"
                />
              </svg>
            </div>
          </div>
        )}
      </header>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ② 打者＆実況スリムバー（h-[46px] 完全固定・右端に「自動投球 ON/OFF」＆「リセット」を1タップ配置）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="shrink-0 h-[46px] px-3 bg-card border-b border-border flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.2 rounded bg-[#0f172a] text-white text-[9.5px] font-black shrink-0">
              #{currentBatter.uniformNumber}
            </span>
            <span className="text-xs font-black text-foreground truncate">
              {currentBatter.name}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground shrink-0">
              ({currentBatter.bats === "L" ? "左" : "右"}・{currentBatter.atBats}
              -{currentBatter.hits}
              {currentBatter.homeRuns > 0
                ? ` ${currentBatter.homeRuns}HR`
                : ""}
              )
            </span>
          </div>
          <p className="text-[10.5px] font-bold text-primary truncate leading-tight mt-0.5">
            {matchState.lastCallout}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {mode === "online" ? (
            onlineRoom ? (
              <button
                type="button"
                onClick={handleOpenOnlineLobby}
                className={`h-7 px-2.5 rounded-full border text-[10px] font-black flex items-center gap-1.5 max-w-[128px] shrink-0 active:scale-95 transition-all cursor-pointer ${
                  onlineRoom.status === "waiting"
                    ? "bg-muted text-muted-foreground border-border"
                    : onlineRoom.opponentOnline
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                    : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                }`}
                title="オンラインルーム情報"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    onlineRoom.status === "waiting"
                      ? "bg-slate-400"
                      : onlineRoom.opponentOnline
                      ? "bg-[#22c55e]"
                      : "bg-[#f59e0b]"
                  }`}
                />
                <span className="truncate">
                  {onlineRoom.status === "waiting"
                    ? `#${onlineRoom.roomCode} 待機中`
                    : onlineRoom.opponentName || `#${onlineRoom.roomCode}`}
                </span>
              </button>
            ) : null
          ) : (
            <>
              {(matchState.mode === "cpu" || matchState.mode === "derby") &&
                !matchState.isGameOver && (
                  <button
                    type="button"
                    id="btn-baseball-board-autopitch"
                    aria-pressed={autoPitchEnabled}
                    onClick={() => setAutoPitchEnabled((prev) => !prev)}
                    className={`h-7 px-2 rounded-full border text-[10px] font-black flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer ${
                      autoPitchEnabled
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border-border"
                    }`}
                    title={
                      autoPitchEnabled
                        ? "タップで自動投球をOFFにする"
                        : "タップで自動投球をONにする"
                    }
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        autoPitchEnabled ? "bg-white" : "bg-slate-400"
                      }`}
                    />
                    <span>
                      {autoPitchEnabled ? "自動投球 ON" : "自動投球 OFF"}
                    </span>
                  </button>
                )}

              <button
                type="button"
                id="btn-baseball-board-restart"
                onClick={() => {
                  startNewGame();
                  showTemporaryBanner("⚾ プレイボール！", "neutral", 1100);
                }}
                className="h-7 px-2 rounded-full bg-muted hover:bg-accent border border-border text-[10px] font-black text-foreground flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer"
                title="試合をリセットして最初からやり直す"
              >
                <RotateCcw className="w-3 h-3 text-muted-foreground" />
                <span>リセット</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ③ 中央伸縮：野球盤メインステージ（左下「⚾投球」＆右下「🏏打つ！」丸ボタン内蔵）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex-1 min-h-0 w-full px-2 py-1.5 bg-background flex items-center justify-center overflow-hidden">
        <BaseballBoardCanvas
          ref={canvasRef}
          bases={matchState.bases}
          outs={matchState.outs}
          strikes={matchState.strikes}
          batterBats={currentBatter.bats}
          stance={stance}
          speedBadgeText={`${PITCH_TYPE_META[selectedPitchType].shortLabel}・${currentSpeedMeta.baseKmh}k`}
          soundEnabled={soundEnabled}
          isHumanBatterTurn={isHumanBatterTurn}
          isGameOver={matchState.isGameOver}
          isVersusPitchLockMode={
            matchState.mode === "versus" && !isHumanBatterTurn
          }
          onlinePitchButtonMode={onlinePitchButtonMode}
          bannerText={bannerText}
          bannerTone={bannerTone}
          onPhaseChange={setBoardPhase}
          onPlayResolved={handlePlayResolved}
          onPressBoardPitch={handleBoardCornerPitch}
          onPracticeSwing={handlePracticeSwing}
          onVisibilityAbort={handleVisibilityAbort}
        />
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ④ 最下部固定ドック（内部 h-[78px] 完全固定により攻守交代・試合終了・通信待機時も盤面位置が1pxもズレない！）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer className="shrink-0 px-2.5 pt-2 pb-[max(env(safe-area-inset-bottom),10px)] bg-card border-t border-border">
        <div className="h-[78px] flex flex-col justify-between">
          {mode === "online" &&
          (!onlineRoom || onlineRoom.status === "waiting") ? (
            <>
              <div className="h-[32px] px-3 rounded-xl bg-muted border border-border flex items-center justify-between gap-2">
                <span className="text-xs font-black text-foreground truncate">
                  {onlineRoom
                    ? `⏳ ルーム #${onlineRoom.roomCode} 相手メンバー参加待ち…`
                    : "🌐 チーム内オンライン対戦（ルーム未接続）"}
                </span>
                {onlineRoom && (
                  <button
                    type="button"
                    onClick={() => void handleCopyRoomCode(onlineRoom.roomCode)}
                    className="h-6 px-2 rounded-lg bg-card border border-border text-[10px] font-black text-primary flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>#{onlineRoom.roomCode}</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-12 gap-1.5 h-[40px]">
                {onlineRoom ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleShareOnlineRoomLine(onlineRoom)}
                      className="col-span-8 h-full rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-xs flex items-center justify-center gap-1.5 active:scale-97 transition-all cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>LINEで対戦相手を招待</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenOnlineLobby}
                      className="col-span-4 h-full rounded-xl bg-muted hover:bg-accent border border-border text-foreground font-black text-xs flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                    >
                      <Wifi className="w-3.5 h-3.5 text-primary" />
                      <span>ロビー</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleOpenOnlineLobby}
                    className="col-span-12 h-full rounded-xl bg-primary text-primary-foreground font-black text-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer"
                  >
                    <Wifi className="w-4 h-4" />
                    <span>チーム内オンライン対戦ロビーを開く</span>
                  </button>
                )}
              </div>
            </>
          ) : matchState.isGameOver ? (
            <>
              <div className="h-[32px] px-3 rounded-xl bg-muted border border-border flex items-center justify-between gap-2">
                <span className="text-xs font-black text-primary truncate">
                  {mode === "online" &&
                  onlineRoom?.rematchRequestedBy &&
                  onlineRoom.rematchRequestedBy !== onlineRoom.myRole
                    ? "🔥 相手が再戦を希望しています！"
                    : matchState.mode === "derby"
                    ? "🌈 ホームラン競争 終了！"
                    : matchState.winner === "home"
                    ? `🏆 ${matchState.homeTeamName} 勝利！`
                    : matchState.winner === "away"
                    ? `⚾ ${matchState.awayTeamName} 勝利！`
                    : "🤝 引き分け！"}
                </span>
                <span className="text-xs font-black text-foreground tabular-nums shrink-0">
                  {matchState.mode === "derby"
                    ? `${matchState.derbyHomeRuns}本 / ${matchState.derbyPoints}pt`
                    : `${matchState.awayScore} - ${matchState.homeScore}`}
                </span>
              </div>

              <div className="grid grid-cols-12 gap-1.5 h-[40px]">
                {mode === "online" &&
                onlineRoom &&
                onlineRoom.myRole !== "spectator" ? (
                  <button
                    type="button"
                    id="btn-baseball-board-online-rematch"
                    disabled={
                      isSubmittingOnline ||
                      onlineRoom.rematchRequestedBy === onlineRoom.myRole
                    }
                    onClick={() => void handleRequestOnlineRematch()}
                    className="col-span-6 h-full rounded-xl bg-primary hover:brightness-105 text-primary-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-97 transition-all cursor-pointer disabled:opacity-65"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>
                      {onlineRoom.rematchRequestedBy === onlineRoom.myRole
                        ? "相手の応答待ち…"
                        : onlineRoom.rematchRequestedBy !== null
                        ? "🔥 再戦を受ける！"
                        : "この相手と再戦！"}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    id="btn-baseball-board-play-again"
                    onClick={() => startNewGame()}
                    className="col-span-6 h-full rounded-xl bg-primary hover:brightness-105 text-primary-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-97 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>もう1試合！</span>
                  </button>
                )}
                <button
                  type="button"
                  id="btn-baseball-board-copy-result"
                  onClick={() => void handleCopyResultText()}
                  className="col-span-3 h-full rounded-xl bg-muted hover:bg-accent border border-border text-foreground font-black text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-primary" />
                  <span>コピー</span>
                </button>
                <button
                  type="button"
                  id="btn-baseball-board-share-line"
                  onClick={() => void handleShareResultLine()}
                  className="col-span-3 h-full rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>LINE</span>
                </button>
              </div>
            </>
          ) : mode === "online" && onlineRoom?.myRole === "spectator" ? (
            <>
              <div className="h-[32px] px-3 rounded-xl bg-muted border border-border flex items-center justify-between gap-2">
                <span className="text-xs font-black text-foreground truncate">
                  👀 チーム内オンライン試合をライブ観戦中
                </span>
                <span className="text-[10.5px] font-bold text-muted-foreground shrink-0">
                  #{onlineRoom.roomCode}
                </span>
              </div>
              <button
                type="button"
                onClick={handleOpenOnlineLobby}
                className="h-[40px] w-full rounded-xl bg-[#0f172a] text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Wifi className="w-3.5 h-3.5 text-sky-300" />
                <span>ロビーを開いて自分の対戦ルームを作る</span>
              </button>
            </>
          ) : isHumanBatterTurn ? (
            /* 打者ターン（h-[78px] 内にガイド行20px ＋ 打撃スタイル52px を配置） */
            <>
              <div className="h-[20px] px-1 flex items-center justify-between gap-2 text-[10px]">
                <span className="font-black text-foreground">
                  🏏 打撃スタイルを選択
                </span>
                <span className="font-bold text-muted-foreground truncate">
                  {mode === "online"
                    ? "相手投球が来たら右下「打つ！」"
                    : autoPitchEnabled && matchState.mode !== "versus"
                    ? "自動投球中！来たら右下「打つ！」"
                    : "①左下「投球」➔ ②右下「打つ！」"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 h-[52px]">
                {(
                  [
                    {
                      id: "contact" as const,
                      label: "⚡ ミート",
                      sub: "広角ヒット",
                    },
                    {
                      id: "power" as const,
                      label: "🔥 強振",
                      sub: "柵越えHR",
                    },
                    {
                      id: "bunt" as const,
                      label: "🎯 バント",
                      sub: "進塁・内安",
                    },
                  ] as const
                ).map((opt) => {
                  const active = stance === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStance(opt.id)}
                      className={`h-full px-1.5 rounded-xl border flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
                        active
                          ? "bg-[#0f172a] text-white border-primary ring-2 ring-primary/25"
                          : "bg-card text-foreground border-border hover:bg-muted"
                      }`}
                    >
                      <span className="text-xs font-black leading-none">
                        {opt.label}
                      </span>
                      <span
                        className={`text-[9px] font-bold mt-1 leading-none ${
                          active ? "text-slate-300" : "text-muted-foreground"
                        }`}
                      >
                        {opt.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            /* 投手ターン（h-[78px] 内に球速32px ＋ コース・球種40px を配置。投球発射はボード左下の丸い「投球」ボタンのみ！） */
            <>
              {mode === "online" && onlineRoom?.canRetryStuckPitch ? (
                <button
                  type="button"
                  onClick={() => void handleOnlinePitchToTeammate()}
                  className="h-[32px] w-full rounded-xl bg-amber-500 text-[#0f172a] font-black text-xs flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>相手が未応答のため同じ配球を再送する</span>
                </button>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 h-[32px]">
                  {PITCH_SPEED_PRESETS.filter((sp) => sp.id !== "chaos").map(
                    (sp) => {
                      const active = speedPreset === sp.id;
                      const isMonster = sp.id === "monster";
                      const pitchLocked =
                        boardPhase !== "idle" ||
                        onlinePitchButtonMode === "pitch_sent";
                      return (
                        <button
                          key={sp.id}
                          type="button"
                          disabled={pitchLocked}
                          onClick={() => setSpeedPreset(sp.id)}
                          className={`h-full px-1 rounded-xl border text-[10.5px] font-black tracking-tight transition-all active:scale-95 cursor-pointer disabled:opacity-60 truncate ${
                            active
                              ? isMonster
                                ? "bg-[#dc2626] text-white border-[#991b1b]"
                                : "bg-[#0f172a] text-amber-300 border-primary"
                              : "bg-muted/60 text-foreground border-border hover:bg-muted"
                          }`}
                          title={sp.description}
                        >
                          {sp.shortLabel}
                        </button>
                      );
                    }
                  )}
                </div>
              )}

              <div className="grid grid-cols-6 gap-1 h-[40px]">
                <button
                  type="button"
                  disabled={
                    boardPhase !== "idle" ||
                    onlinePitchButtonMode === "pitch_sent"
                  }
                  onClick={handleCycleCourse}
                  className="h-full px-1 rounded-xl bg-[#0f172a] text-sky-300 border border-slate-700 flex flex-col items-center justify-center active:scale-95 cursor-pointer disabled:opacity-50"
                  title="タップでコース切り替え"
                >
                  <span className="text-[8.5px] font-bold text-slate-300 leading-none">
                    コース
                  </span>
                  <span className="text-[11px] font-black text-white leading-tight mt-0.5">
                    {COURSE_LABELS[selectedCourse]}
                  </span>
                </button>

                {STANDARD_PITCH_TYPES.map((pType) => {
                  const meta = PITCH_TYPE_META[pType];
                  const isSelected = selectedPitchType === pType;
                  return (
                    <button
                      key={pType}
                      type="button"
                      disabled={
                        boardPhase !== "idle" ||
                        onlinePitchButtonMode === "pitch_sent"
                      }
                      onClick={() => setSelectedPitchType(pType)}
                      className={`h-full px-1 rounded-xl border flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer disabled:opacity-50 ${
                        isSelected
                          ? "bg-[#0f172a] text-white border-primary ring-2 ring-primary/25"
                          : "bg-card hover:bg-muted border-border text-foreground"
                      }`}
                    >
                      <span className="text-[10.5px] font-black leading-none truncate max-w-full">
                        {meta.shortLabel}
                      </span>
                      <span
                        className={`text-[8px] font-bold mt-0.5 leading-none ${
                          isSelected ? "text-sky-300" : "text-muted-foreground"
                        }`}
                      >
                        {isSelected ? "選択中" : "球種"}
                      </span>
                    </button>
                  );
                })}

                {/* 消える魔球（選択のみ：実際の発射はボード左下の投球ボタン！） */}
                <button
                  type="button"
                  id="btn-baseball-board-vanish-pitch"
                  disabled={
                    boardPhase !== "idle" ||
                    onlinePitchButtonMode === "pitch_sent" ||
                    pitcherVanishLeft <= 0
                  }
                  onClick={() => setSelectedPitchType("vanish")}
                  className={`h-full px-1 rounded-xl border-2 flex flex-col items-center justify-center transition-all active:scale-95 ${
                    pitcherVanishLeft <= 0 ||
                    boardPhase !== "idle" ||
                    onlinePitchButtonMode === "pitch_sent"
                      ? "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-55"
                      : selectedPitchType === "vanish"
                      ? "bg-[#0f172a] text-amber-300 border-amber-400 ring-2 ring-amber-400/35 cursor-pointer"
                      : "bg-card hover:bg-muted text-foreground border-amber-500/60 cursor-pointer"
                  }`}
                >
                  <span className="text-[10.5px] font-black leading-none flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                    <span>魔球</span>
                  </span>
                  <span
                    className={`text-[8px] font-bold mt-0.5 leading-none ${
                      selectedPitchType === "vanish"
                        ? "text-amber-200"
                        : "text-muted-foreground"
                    }`}
                  >
                    {selectedPitchType === "vanish"
                      ? `選択(残${pitcherVanishLeft})`
                      : `残${pitcherVanishLeft}/${MAX_VANISH_PITCHES_PER_GAME}`}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </footer>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ⚙️ ゲームメニュー・試合設定モーダル（createPortal & z-[9999]）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isSettingsOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60">
            <div
              className="absolute inset-0"
              onClick={() => setIsSettingsOpen(false)}
            />
            <div className="relative z-10 w-full max-w-md max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3.5 flex items-center justify-between shrink-0">
                <span className="text-sm font-black flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-blue-300" />
                  <span>ゲームメニュー・試合設定</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto">
                {/* クイックメニュー（成績・効果音・遊び方・LINE共有をここにスッキリ集約） */}
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    id="btn-baseball-board-records"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setStatsModalTab("match");
                      setIsBoxScoreOpen(true);
                    }}
                    className="p-2.5 rounded-2xl border border-border bg-muted/60 hover:bg-muted flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                  >
                    <Trophy className="w-4 h-4 text-amber-500" />
                    <span className="text-[11px] font-black text-foreground leading-none">
                      成績
                    </span>
                    <span className="text-[9px] font-bold text-muted-foreground leading-none">
                      打順・記録
                    </span>
                  </button>

                  <button
                    type="button"
                    id="btn-baseball-board-sound"
                    onClick={handleToggleSound}
                    className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer ${
                      soundEnabled
                        ? "bg-[#0f172a] text-white border-primary"
                        : "bg-muted/60 text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {soundEnabled ? (
                      <Volume2 className="w-4 h-4 text-sky-300" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="text-[11px] font-black leading-none">
                      効果音
                    </span>
                    <span
                      className={`text-[9px] font-bold leading-none ${
                        soundEnabled ? "text-sky-300" : "text-muted-foreground"
                      }`}
                    >
                      {soundEnabled ? "ON" : "消音"}
                    </span>
                  </button>

                  <button
                    type="button"
                    id="btn-baseball-board-guide"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setIsGuideOpen(true);
                    }}
                    className="p-2.5 rounded-2xl border border-border bg-muted/60 hover:bg-muted flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4 text-primary" />
                    <span className="text-[11px] font-black text-foreground leading-none">
                      遊び方
                    </span>
                    <span className="text-[9px] font-bold text-muted-foreground leading-none">
                      ルール説明
                    </span>
                  </button>

                  <button
                    type="button"
                    id="btn-baseball-board-share-page"
                    disabled={isPageSharing}
                    onClick={() => void handleSharePage()}
                    className="p-2.5 rounded-2xl border border-[#06C755] bg-[#06C755] hover:bg-[#05b34c] text-white flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {isPageSharing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Share2 className="w-4 h-4" />
                    )}
                    <span className="text-[11px] font-black leading-none">
                      LINE共有
                    </span>
                    <span className="text-[9px] font-bold text-white/90 leading-none">
                      仲間を誘う
                    </span>
                  </button>
                </div>

                {/* 1. 遊び方モード */}
                <div className="space-y-1.5">
                  <p className="text-xs font-black text-foreground">
                    1. 遊び方モード（切替で新規開始）
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {MODE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const active = mode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            if (opt.id === "online") {
                              handleOpenOnlineLobby();
                              return;
                            }
                            setMode(opt.id);
                            startNewGame({ nextMode: opt.id });
                          }}
                          className={`p-2.5 rounded-2xl border text-left transition-all active:scale-96 cursor-pointer ${
                            active
                              ? "bg-primary/10 border-primary text-foreground ring-1 ring-primary/30"
                              : "bg-card border-border text-foreground hover:bg-muted"
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 mb-1 ${
                              active ? "text-primary" : "text-muted-foreground"
                            }`}
                          />
                          <p className="text-[11px] font-black leading-tight">
                            {opt.label}
                          </p>
                          <p className="text-[9.5px] font-bold text-muted-foreground mt-0.5 leading-snug">
                            {opt.shortDesc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {mode !== "derby" && mode !== "online" && (
                  <>
                    {/* 2. イニング数 */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-black text-foreground">
                        2. 規定イニング数
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {INNING_OPTIONS.map((inn) => {
                          const active = totalInnings === inn;
                          return (
                            <button
                              key={inn}
                              type="button"
                              onClick={() => {
                                setTotalInnings(inn);
                                startNewGame({ nextInnings: inn });
                              }}
                              className={`h-9 rounded-xl border text-xs font-black transition-all active:scale-95 cursor-pointer ${
                                active
                                  ? "bg-[#0f172a] text-white border-primary"
                                  : "bg-card text-foreground border-border hover:bg-muted"
                              }`}
                            >
                              {inn}回制
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {mode === "cpu" && (
                      <>
                        {/* 3. 先攻・後攻 */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-black text-foreground">
                            3. 先攻・後攻（1P vs CPU）
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setPlayerBatsFirst(true);
                                startNewGame({ nextBatsFirst: true });
                              }}
                              className={`h-9 rounded-xl border text-xs font-black transition-all active:scale-95 cursor-pointer ${
                                playerBatsFirst
                                  ? "bg-[#0f172a] text-white border-primary"
                                  : "bg-card text-foreground border-border hover:bg-muted"
                              }`}
                            >
                              🏏 先攻（最初から打撃）
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPlayerBatsFirst(false);
                                startNewGame({ nextBatsFirst: false });
                              }}
                              className={`h-9 rounded-xl border text-xs font-black transition-all active:scale-95 cursor-pointer ${
                                !playerBatsFirst
                                  ? "bg-[#0f172a] text-white border-primary"
                                  : "bg-card text-foreground border-border hover:bg-muted"
                              }`}
                            >
                              ⚾ 後攻（裏にサヨナラ狙い）
                            </button>
                          </div>
                        </div>

                        {/* 4. CPU強さ */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-black text-foreground">
                            4. CPUの強さ
                          </p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {DIFFICULTY_OPTIONS.map((diff) => {
                              const active = difficulty === diff.id;
                              return (
                                <button
                                  key={diff.id}
                                  type="button"
                                  onClick={() => {
                                    setDifficulty(diff.id);
                                    startNewGame({ nextDifficulty: diff.id });
                                  }}
                                  className={`h-9 rounded-xl border text-xs font-black transition-all active:scale-95 cursor-pointer ${
                                    active
                                      ? "bg-[#0f172a] text-white border-primary"
                                      : "bg-card text-foreground border-border hover:bg-muted"
                                  }`}
                                >
                                  {diff.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* 自動投球オプション（1P vs CPU / HR競争時） */}
                {(mode === "cpu" || mode === "derby") && (
                  <div className="p-3 rounded-xl border border-border bg-muted/40 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-foreground">
                        自動投球モード（打撃時）
                      </p>
                      <p className="text-[10px] font-bold text-muted-foreground mt-0.5">
                        左下の「投球」ボタンを押さずに自動で次球を投げます
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoPitchEnabled((prev) => !prev)}
                      className={`h-8 px-3 rounded-xl border text-xs font-black shrink-0 active:scale-95 transition-all cursor-pointer ${
                        autoPitchEnabled
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {autoPitchEnabled ? "ON" : "OFF"}
                    </button>
                  </div>
                )}

                {mode !== "online" && (
                  /* 出場メンバー表示 */
                  <div className="space-y-1.5">
                    <p className="text-xs font-black text-foreground">
                      出場メンバー表示
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setUseTeamRoster(true);
                          startNewGame({ nextUseRoster: true });
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all active:scale-97 cursor-pointer ${
                          useTeamRoster
                            ? "bg-[#0f172a] text-white border-primary"
                            : "bg-card text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        <p className="text-xs font-black">🧢 チーム選手で遊ぶ</p>
                        <p
                          className={`text-[10px] font-bold mt-0.5 ${
                            useTeamRoster
                              ? "text-slate-300"
                              : "text-muted-foreground"
                          }`}
                        >
                          {activeRosterCount > 0
                            ? `名鑑（${activeRosterCount}名）から自動編成`
                            : "未登録時は標準打順を使用"}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUseTeamRoster(false);
                          startNewGame({ nextUseRoster: false });
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all active:scale-97 cursor-pointer ${
                          !useTeamRoster
                            ? "bg-[#0f172a] text-white border-primary"
                            : "bg-card text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        <p className="text-xs font-black">⚾ 標準メンバーで遊ぶ</p>
                        <p
                          className={`text-[10px] font-bold mt-0.5 ${
                            !useTeamRoster
                              ? "text-slate-300"
                              : "text-muted-foreground"
                          }`}
                        >
                          1番〜9番の汎用ポジション名
                        </p>
                      </button>
                    </div>
                  </div>
                )}

                {/* 安全保護の注記 */}
                <div className="p-3 rounded-xl bg-muted border border-border flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-[10.5px] font-bold text-muted-foreground leading-relaxed">
                    この野球盤のスコア・打撃結果は端末内のお楽しみ専用です。公式の「試合・スコア」「チーム成績」「個人成長レポート」には一切影響しません。
                  </p>
                </div>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card grid grid-cols-2 gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (mode === "online") {
                      handleOpenOnlineLobby();
                      return;
                    }
                    startNewGame();
                    setIsSettingsOpen(false);
                    toast.success("新しい試合を開始しました！");
                  }}
                  className="h-11 rounded-xl bg-muted hover:bg-accent border border-border text-foreground font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {mode === "online" ? (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-primary" />
                      <span>対戦ロビーを開く</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>最初からやり直す</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="h-11 rounded-xl bg-primary text-primary-foreground font-black text-xs cursor-pointer"
                >
                  閉じてゲームに戻る
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          🏆 出場打順・本日の打撃成績 ＆ マイ戦績レコードモーダル（createPortal & z-[9999]）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isBoxScoreOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60">
            <div
              className="absolute inset-0"
              onClick={() => setIsBoxScoreOpen(false)}
            />
            <div className="relative z-10 w-full max-w-md max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3.5 flex items-center justify-between shrink-0">
                <span className="text-sm font-black flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>打順成績・マイ野球盤レコード</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsBoxScoreOpen(false)}
                  className="p-1 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-4 pt-3 pb-2 bg-card border-b border-border shrink-0">
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted border border-border">
                  <button
                    type="button"
                    onClick={() => setStatsModalTab("match")}
                    className={`py-1.5 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer ${
                      statsModalTab === "match"
                        ? "bg-card text-foreground border border-border shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ListOrdered className="w-3.5 h-3.5 text-primary" />
                    <span>この試合の打順</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatsModalTab("records")}
                    className={`py-1.5 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer ${
                      statsModalTab === "records"
                        ? "bg-card text-foreground border border-border shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                    <span>マイ通算レコード</span>
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto">
                {statsModalTab === "match" ? (
                  <>
                    {[
                      ...(matchState.mode !== "derby"
                        ? [
                            {
                              title: matchState.awayTeamName,
                              lineup: matchState.awayLineup,
                              activeIdx: matchState.isTop
                                ? matchState.awayBatterIdx
                                : -1,
                            },
                          ]
                        : []),
                      {
                        title: matchState.homeTeamName,
                        lineup: matchState.homeLineup,
                        activeIdx:
                          !matchState.isTop || matchState.mode === "derby"
                            ? matchState.homeBatterIdx
                            : -1,
                      },
                    ].map((side) => (
                      <div
                        key={side.title}
                        className="rounded-xl border border-border overflow-hidden"
                      >
                        <div className="px-3 py-2 bg-muted border-b border-border text-xs font-black text-foreground">
                          {side.title}
                        </div>
                        <table className="w-full text-xs border-collapse tabular-nums">
                          <thead>
                            <tr className="border-b border-border text-[10px] font-bold text-muted-foreground bg-card">
                              <th className="py-1.5 px-2 text-left">
                                打順・選手
                              </th>
                              <th className="py-1.5 px-1.5 text-center">打数</th>
                              <th className="py-1.5 px-1.5 text-center">安打</th>
                              <th className="py-1.5 px-1.5 text-center">
                                本塁打
                              </th>
                              <th className="py-1.5 px-1.5 text-center">打点</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border bg-card">
                            {side.lineup.map((p, idx) => (
                              <tr
                                key={p.id}
                                className={
                                  side.activeIdx === idx ? "bg-primary/8" : ""
                                }
                              >
                                <td className="py-1.5 px-2 font-black text-foreground truncate max-w-[175px]">
                                  <span className="text-muted-foreground mr-1">
                                    {idx + 1}.
                                  </span>
                                  <span className="text-primary mr-1">
                                    #{p.uniformNumber}
                                  </span>
                                  <span>{p.name}</span>
                                </td>
                                <td className="py-1.5 px-1.5 text-center font-bold">
                                  {p.atBats}
                                </td>
                                <td className="py-1.5 px-1.5 text-center font-black text-primary">
                                  {p.hits}
                                </td>
                                <td className="py-1.5 px-1.5 text-center font-black text-amber-600 dark:text-amber-400">
                                  {p.homeRuns}
                                </td>
                                <td className="py-1.5 px-1.5 text-center font-bold">
                                  {p.rbi}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 rounded-xl bg-muted border border-border text-center">
                        <p className="text-[10px] font-bold text-muted-foreground">
                          通算勝敗
                        </p>
                        <p className="text-sm font-black text-foreground tabular-nums mt-0.5">
                          {localStats.wins}勝 {localStats.losses}敗{" "}
                          {localStats.draws > 0 ? `${localStats.draws}分` : ""}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-muted border border-border text-center">
                        <p className="text-[10px] font-bold text-muted-foreground">
                          通算ホームラン
                        </p>
                        <p className="text-sm font-black text-primary tabular-nums mt-0.5">
                          {localStats.totalHomeRuns} 本
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-muted border border-border text-center">
                        <p className="text-[10px] font-bold text-muted-foreground">
                          1試合最多得点
                        </p>
                        <p className="text-sm font-black text-foreground tabular-nums mt-0.5">
                          {localStats.bestSingleGameRuns} 点
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-muted border border-border text-center">
                        <p className="text-[10px] font-bold text-muted-foreground">
                          HR競争ハイスコア
                        </p>
                        <p className="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                          {localStats.derbyHighScore} pt (
                          {localStats.derbyBestHr}本)
                        </p>
                      </div>
                      <div className="col-span-2 p-3 rounded-xl bg-muted border border-border flex items-center justify-between">
                        <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                          <Gauge className="w-4 h-4 text-primary" />
                          <span>自己最速打球速度</span>
                        </span>
                        <span className="text-sm font-black text-[#dc2626] tabular-nums">
                          {localStats.maxExitVelocityKmh > 0
                            ? `${localStats.maxExitVelocityKmh} km/h`
                            : "--- km/h"}
                        </span>
                      </div>
                    </div>

                    {(localStats.gamesPlayed > 0 ||
                      localStats.derbyHighScore > 0 ||
                      localStats.maxExitVelocityKmh > 0) && (
                      <button
                        type="button"
                        onClick={() => setIsConfirmResetStatsOpen(true)}
                        className="w-full h-10 rounded-xl bg-card hover:bg-muted border border-border text-muted-foreground hover:text-foreground text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>この端末のマイ戦績をリセット</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card grid grid-cols-3 gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleCopyResultText()}
                  className="h-10 rounded-xl bg-muted hover:bg-accent border border-border text-foreground font-black text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-primary" />
                  <span>コピー</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleShareResultLine()}
                  className="h-10 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>LINE共有</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBoxScoreOpen(false)}
                  className="h-10 rounded-xl bg-primary text-primary-foreground font-black text-xs cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          📖 遊び方＆野球盤ルールガイドモーダル（createPortal & z-[9999]）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isGuideOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60">
            <div
              className="absolute inset-0"
              onClick={() => setIsGuideOpen(false)}
            />
            <div className="relative z-10 w-full max-w-md max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3.5 flex items-center justify-between shrink-0">
                <span className="text-sm font-black flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-blue-300" />
                  <span>野球盤ゲームの遊び方</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsGuideOpen(false)}
                  className="p-1 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto text-xs leading-relaxed">
                <div className="p-3 rounded-xl bg-muted border border-border space-y-1">
                  <p className="font-black text-foreground">
                    1. バッティングは「左下① ➔ 右下②」の2ステップ！
                  </p>
                  <p className="text-muted-foreground font-bold">
                    ① ボード左下の青い「⚾ 投球」ボタンを押すとピッチャーが投げます（「自動投球ON」も可）。
                    <br />
                    ② ホームベースの枠が黄色く「今だ！」と光る瞬間に、ボード右下の赤い「🏏 打つ！」ボタンを押して打ち返しましょう！（投球前に押すと素振りもできます）
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-muted border border-border space-y-1">
                  <p className="font-black text-foreground">
                    2. 守備（投球）時の球速ギア選択 ＆ 看板直撃ボーナス！
                  </p>
                  <p className="text-muted-foreground font-bold">
                    ・攻撃（打撃）時は相手ピッチャーが緩急（スロー〜165km剛速球）を織り交ぜて投げてきます！
                    <br />
                    ・守備（投球）時は下部バーで「球速ギア（80〜165km）・コース・球種」を選択し、ボード左下の青い「⚾ 投球」ボタンで投げ込みます！
                    <br />
                    ・センター最上部の「🎯看板直撃」に空中アーチが当たればボーナス演出（HR競争では+150pt）が発動します！
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-muted border border-border space-y-1">
                  <p className="font-black text-foreground">
                    3. 必殺「消える魔球」（1試合2球まで）
                  </p>
                  <p className="text-muted-foreground font-bold">
                    本塁手前のトラップドアが開いてボールが床下へ消えます！振ると空振りストライク、見送れば「ボール」になります。
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-muted border border-border space-y-1">
                  <p className="font-black text-foreground">
                    4. 🌐 チーム内オンライン対戦（メンバー限定）
                  </p>
                  <p className="text-muted-foreground font-bold">
                    上部「通信」ボタンから同じチームの仲間とリアルタイム対戦できます！ロビーからの1タップ参加、LINE招待カード送信、4桁ルーム番号入力のすべてに対応し、終了後は先攻・後攻を入れ替えて即座に再戦できます。
                  </p>
                </div>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card shrink-0">
                <button
                  type="button"
                  onClick={() => setIsGuideOpen(false)}
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-black text-xs cursor-pointer"
                >
                  閉じてゲームに戻る
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          🌐 チーム内オンライン対戦ロビー＆ルームモーダル（createPortal & z-[9999]）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <BaseballBoardOnlineModal
        isOpen={isOnlineModalOpen}
        onClose={() => setIsOnlineModalOpen(false)}
        isDemoTeam={activeTeamId === "demo-team"}
        teamDisplayName={scoreTeamName}
        myDefaultName={onlineMyDefaultName}
        rooms={onlineRooms}
        activeRoom={onlineRoom}
        isLoadingRooms={isLoadingOnlineRooms}
        isSubmitting={isSubmittingOnline}
        onRefreshRooms={() => void fetchOnlineLobbyRooms()}
        onCreateRoom={handleCreateOnlineRoom}
        onJoinByRoomId={(rId, name) => handleJoinOnlineByRoomId(rId, name)}
        onJoinByCode={handleJoinOnlineByCode}
        onShareRoomLine={handleShareOnlineRoomLine}
        onCopyRoomCode={handleCopyRoomCode}
        onLeaveRoom={handleLeaveOnlineRoom}
      />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          🗑️ 戦績リセット確認モーダル（createPortal & z-[10010]）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isConfirmResetStatsOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[10010] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60">
            <div
              className="absolute inset-0"
              onClick={() => setIsConfirmResetStatsOpen(false)}
            />
            <div className="relative z-10 w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-black">マイ戦績のリセット</span>
                <button
                  type="button"
                  onClick={() => setIsConfirmResetStatsOpen(false)}
                  className="p-1 rounded-full text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                  この端末に保存されている野球盤の通算勝敗・ホームラン数・ハイスコア・最速打球記録をリセットしますか？
                </p>
                <div className="grid grid-cols-2 gap-2 pb-[max(env(safe-area-inset-bottom),12px)] sm:pb-0">
                  <button
                    type="button"
                    onClick={() => setIsConfirmResetStatsOpen(false)}
                    className="h-10 rounded-xl bg-muted border border-border text-foreground font-black text-xs cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalStats(resetBaseballBoardLocalStats(activeTeamId));
                      setIsConfirmResetStatsOpen(false);
                      toast.success("野球盤のマイ戦績をリセットしました");
                    }}
                    className="h-10 rounded-xl bg-[#dc2626] text-white font-black text-xs cursor-pointer"
                  >
                    リセットする
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
