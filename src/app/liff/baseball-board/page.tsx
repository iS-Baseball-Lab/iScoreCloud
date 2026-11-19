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
import {
  Gamepad2,
  Volume2,
  VolumeX,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  Flame,
  Users,
  Bot,
  ShieldCheck,
  Copy,
  Share2,
  Lock,
  ListOrdered,
  X,
  Zap,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  useLiff,
  useScoreTeamDisplayName,
} from "@/components/liff/LiffProvider";
import { peekLiffApiCache } from "@/lib/liff/api-cache";
import { sharePlainTextViaLine } from "@/lib/liff/liff-client";
import {
  BaseballBoardCanvas,
  type BaseballBoardCanvasHandle,
  type BoardActionPhase,
  type ResolvedBoardPlay,
} from "@/components/liff/BaseballBoardCanvas";
import {
  DERBY_TOTAL_PITCHES,
  MAX_VANISH_PITCHES_PER_GAME,
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
  resetBaseballBoardLocalStats,
  type BaseballBoardLocalStats,
  type BaseballBoardMatchState,
  type BatterStance,
  type BoardPlayer,
  type CpuDifficulty,
  type GameMode,
  type PitchCourse,
  type PitchSpec,
  type PitchType,
  type RawRosterPlayerCandidate,
} from "@/lib/liff/baseball-board-engine";
import {
  getSavedBaseballBoardSoundEnabled,
  playGameSetFanfare,
  playPocketResult,
  saveBaseballBoardSoundEnabled,
} from "@/lib/liff/baseball-board-audio";

interface PlayersApiMinimalResponse {
  success: boolean;
  players?: RawRosterPlayerCandidate[];
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

const COURSE_OPTIONS: ReadonlyArray<{
  id: PitchCourse;
  label: string;
}> = [
  { id: "inside", label: "内角" },
  { id: "middle", label: "真ん中" },
  { id: "outside", label: "外角" },
];

const STANDARD_PITCH_TYPES: readonly PitchType[] = [
  "straight",
  "curve",
  "shoot",
  "changeup",
];

export default function LiffBaseballBoardPage() {
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
  const [useTeamRoster, setUseTeamRoster] = useState<boolean>(true);
  const [autoPitchEnabled, setAutoPitchEnabled] = useState<boolean>(false);

  // チーム選手名鑑（読取専用キャッシュ連携）
  const [rosterPlayers, setRosterPlayers] = useState<RawRosterPlayerCandidate[]>(
    () => {
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
    }
  );

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
      playerIsHome: true,
    })
  );

  const [boardPhase, setBoardPhase] = useState<BoardActionPhase>("idle");
  const [stance, setStance] = useState<BatterStance>("contact");
  const [selectedCourse, setSelectedCourse] = useState<PitchCourse>("middle");
  const [selectedPitchType, setSelectedPitchType] =
    useState<PitchType>("straight");
  // 2P 1台対戦用：投手が球種をセット完了した状態（打者に球種を見せないためのロック）
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

  // モーダル開閉ステート（チーム切替時は自動クローズ）
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isBoxScoreOpen, setIsBoxScoreOpen] = useState(false);
  const [isConfirmResetStatsOpen, setIsConfirmResetStatsOpen] = useState(false);

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
      durationMs = 1550
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
        // オフライン時も標準メンバーで問題なくプレイ可能
      }
    };

    void loadRoster();
    return () => {
      cancelled = true;
    };
  }, [activeTeamId, profile?.displayName, profile?.userId]);

  // チーム切替時の状態・モーダル完全リセット（マルチチーム分離規約）
  const prevTeamIdRef = useRef<string>(activeTeamId);
  useEffect(() => {
    if (prevTeamIdRef.current !== activeTeamId) {
      prevTeamIdRef.current = activeTeamId;
      clearTimers();
      setIsGuideOpen(false);
      setIsBoxScoreOpen(false);
      setIsConfirmResetStatsOpen(false);
      setLockedVersusPitch(null);
      setBannerText(null);
      setLocalStats(loadBaseballBoardLocalStats(activeTeamId));
      canvasRef.current?.resetBoardIdle();
    }
  }, [activeTeamId, clearTimers]);

  // 新規試合開始・設定反映関数
  const startNewGame = useCallback(
    (overrides?: {
      nextMode?: GameMode;
      nextInnings?: number;
      nextDifficulty?: CpuDifficulty;
      nextUseRoster?: boolean;
    }) => {
      clearTimers();
      const targetMode = overrides?.nextMode ?? mode;
      const targetInnings = overrides?.nextInnings ?? totalInnings;
      const targetDiff = overrides?.nextDifficulty ?? difficulty;
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
          playerIsHome: true,
        })
      );
    },
    [
      clearTimers,
      difficulty,
      mode,
      rosterPlayers,
      scoreTeamName,
      totalInnings,
      useTeamRoster,
    ]
  );

  // 初回名鑑ロード完了時（まだ1球も進んでいない初期状態の場合のみ）チーム名・選手名を自動同期
  const isFreshUntouchedGame =
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
        playerIsHome: true,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreTeamName, effectiveMyLineup]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  // 現在の打者・守備側の魔球残数
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

  // 現在人間プレイヤーが「打者操作」か「投手操作」か
  // - cpuモード: 表＝人間が投手（CPU打者）、裏＝人間が打者（CPU投手）
  // - derbyモード: 常時人間が打者
  // - versusモード: 球種未ロック時は投手フェーズ、球種ロック後は打者フェーズ
  const isHumanBatterTurn =
    matchState.mode === "derby" ||
    (matchState.mode === "cpu" && !matchState.isTop) ||
    (matchState.mode === "versus" && lockedVersusPitch !== null);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveBaseballBoardSoundEnabled(next);
    toast.success(next ? "効果音をONにしました" : "効果音をOFF（消音）にしました");
  };

  // CPU投手（裏イニング / HR競争）または 2Pロック済み球種での投球開始
  const handleStartPitchForBatter = useCallback(() => {
    if (boardPhase !== "idle" || matchState.isGameOver) return;
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

    canvasRef.current?.launchPitch({
      pitch: pitchToThrow,
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
    pitcherVanishLeft,
  ]);

  // 1P vs CPU の表イニング：プレイヤーが球種を選んでCPU打者へ投げる
  const handleHumanPitchToCpu = (pitchTypeOverride?: PitchType) => {
    if (boardPhase !== "idle" || matchState.isGameOver) return;
    const chosenType = pitchTypeOverride ?? selectedPitchType;
    if (chosenType === "vanish" && pitcherVanishLeft <= 0) {
      toast.error("消える魔球の残り回数がありません");
      return;
    }
    setSelectedPitchType(chosenType);
    canvasRef.current?.launchPitch({
      pitch: { type: chosenType, course: selectedCourse },
      batterBats: currentBatter.bats,
      batterIsCpu: true,
      cpuDifficulty: matchState.difficulty,
      strikes: matchState.strikes,
      outs: matchState.outs,
      bases: matchState.bases,
    });
  };

  // 2P 1台対戦：投手が球種＆コースを秘密ロックして打者へ渡す
  const handleLockVersusPitch = (pitchTypeOverride?: PitchType) => {
    if (boardPhase !== "idle" || matchState.isGameOver) return;
    const chosenType = pitchTypeOverride ?? selectedPitchType;
    if (chosenType === "vanish" && pitcherVanishLeft <= 0) {
      toast.error("消える魔球の残り回数がありません");
      return;
    }
    setLockedVersusPitch({
      type: chosenType,
      course: selectedCourse,
    });
  };

  // スイング実行（0ms レスポンスのため onPointerDown から発火）
  const handleSwingPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (boardPhase === "pitching" && isHumanBatterTurn) {
      canvasRef.current?.triggerSwing(stance);
    }
  };

  // 1プレイ決着時のスコア・カウント更新コールバック
  const handlePlayResolved = useCallback(
    (play: ResolvedBoardPlay) => {
      setLockedVersusPitch(null);
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
          applied.nextState.isGameOver ? 2600 : 1500
        );

        if (applied.nextState.isGameOver && !prev.isGameOver) {
          const didWin =
            applied.nextState.mode === "derby"
              ? applied.nextState.derbyHomeRuns >= 3
              : applied.nextState.winner === "home";
          playGameSetFanfare(soundEnabled, didWin);
          const updatedStats = recordFinishedGameToLocalStats(
            activeTeamId,
            applied.nextState
          );
          setLocalStats(updatedStats);
        } else if (applied.soundKind) {
          playPocketResult(soundEnabled, applied.soundKind);
        }

        // 魔球残り0になった場合、選択球種をストレートへ安全に戻す
        const nextDefVanish = applied.nextState.isTop
          ? applied.nextState.homeVanishLeft
          : applied.nextState.awayVanishLeft;
        if (nextDefVanish <= 0) {
          setSelectedPitchType((cur) => (cur === "vanish" ? "straight" : cur));
        }

        return applied.nextState;
      });
    },
    [activeTeamId, showTemporaryBanner, soundEnabled]
  );

  // 自動投球モード ON 時：打者ターン待機になったら 1.0秒後に自動で次球を投げる（モーダル表示中・非表示タブ時は完全停止）
  useEffect(() => {
    if (autoPitchTimerRef.current) {
      clearTimeout(autoPitchTimerRef.current);
      autoPitchTimerRef.current = null;
    }

    const canAutoPitch =
      autoPitchEnabled &&
      boardPhase === "idle" &&
      !matchState.isGameOver &&
      (matchState.mode === "derby" ||
        (matchState.mode === "cpu" && !matchState.isTop)) &&
      !isGuideOpen &&
      !isBoxScoreOpen &&
      !isConfirmResetStatsOpen;

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
    isGuideOpen,
    matchState.isGameOver,
    matchState.isTop,
    matchState.mode,
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

  const activeRosterCount = useMemo(
    () =>
      rosterPlayers.filter(
        (p) => p.isActive !== false && p.conditionStatus !== "on_leave"
      ).length,
    [rosterPlayers]
  );

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="野球盤ゲーム"
          subtitle="投げて打つ懐かしの盤上対決"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <Gamepad2 className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: "野球盤ゲーム｜iScoreCloud",
            text: "懐かしの野球盤ミニゲームで対決しよう！（消える魔球・柵越えHR対応）",
          }}
          rightElement={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                id="btn-baseball-board-sound"
                onClick={handleToggleSound}
                className={`h-9 px-2.5 rounded-2xl border text-[11px] font-black flex items-center gap-1 shadow-xs active:scale-95 transition-all cursor-pointer ${
                  soundEnabled
                    ? "bg-card border-border text-foreground hover:bg-muted"
                    : "bg-muted border-border text-muted-foreground"
                }`}
                aria-label={soundEnabled ? "効果音ON" : "効果音OFF"}
              >
                {soundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
                <span>{soundEnabled ? "音ON" : "消音"}</span>
              </button>
              <button
                type="button"
                id="btn-baseball-board-guide"
                onClick={() => setIsGuideOpen(true)}
                className="h-9 px-2.5 rounded-2xl bg-card border border-border text-foreground hover:bg-muted text-[11px] font-black flex items-center gap-1 shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-primary" />
                <span>遊び方</span>
              </button>
            </div>
          }
        />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            🏟️ メイン野球盤スタジアムカード（A-3 上帯電光スコアボード × 盤面 × 片手操作パネル）
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          {/* A-3 電光掲示板ダークキャップ */}
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary p-3 space-y-2.5">
            {/* 上段ステータス＆やり直しボタン */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black shrink-0">
                  {matchState.mode === "cpu"
                    ? "1P vs CPU"
                    : matchState.mode === "versus"
                    ? "2P 対戦"
                    : "HR競争"}
                </span>
                <span className="text-xs font-black text-amber-300 truncate">
                  {matchState.isGameOver
                    ? "試合終了（GAME SET）"
                    : matchState.mode === "derby"
                    ? `第 ${matchState.derbyPitchNumber} / ${DERBY_TOTAL_PITCHES} 球`
                    : `${
                        matchState.inning > matchState.totalInnings ? "延長" : ""
                      }${matchState.inning}回${matchState.isTop ? "表" : "裏"}`}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {matchState.mode !== "derby" && (
                  <span
                    className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-black text-amber-300 flex items-center gap-1"
                    title="守備側チームの消える魔球残り回数"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>魔球あと{pitcherVanishLeft}</span>
                  </span>
                )}
                <button
                  type="button"
                  id="btn-baseball-board-restart"
                  onClick={() => startNewGame()}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-black text-slate-200 flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>最初</span>
                </button>
              </div>
            </div>

            {matchState.mode === "derby" ? (
              /* ホームラン競争専用スコアバー */
              <div className="grid grid-cols-3 gap-2 pt-0.5">
                <div className="rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-center">
                  <p className="text-[10px] font-bold text-slate-400">球数</p>
                  <p className="text-sm font-black text-white tabular-nums">
                    {matchState.derbyPitchNumber}{" "}
                    <span className="text-[11px] text-slate-400">
                      / {DERBY_TOTAL_PITCHES}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-center">
                  <p className="text-[10px] font-bold text-slate-400">
                    ホームラン
                  </p>
                  <p className="text-sm font-black text-amber-400 tabular-nums">
                    {matchState.derbyHomeRuns} 本
                  </p>
                </div>
                <div className="rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-center">
                  <p className="text-[10px] font-bold text-slate-400">
                    獲得ポイント
                  </p>
                  <p className="text-sm font-black text-emerald-400 tabular-nums">
                    {matchState.derbyPoints} pt
                  </p>
                </div>
              </div>
            ) : (
              /* 公式スコアボード ＋ BSOランプ ＋ 走者ダイヤモンド */
              <div className="flex items-stretch gap-2">
                <div className="flex-1 min-w-0 rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto">
                  <table className="w-full text-center border-collapse text-[11px] tabular-nums">
                    <thead>
                      <tr className="border-b border-slate-800 text-[9.5px] font-bold text-slate-400">
                        <th className="py-1 px-2 text-left font-bold">チーム</th>
                        {matchState.innings.map((_, idx) => (
                          <th key={idx} className="py-1 px-1 min-w-[18px]">
                            {idx + 1}
                          </th>
                        ))}
                        <th className="py-1 px-1.5 text-amber-300 font-black border-l border-slate-800">
                          計
                        </th>
                        <th className="py-1 px-1.5 text-slate-300 font-bold">
                          安
                        </th>
                      </tr>
                    </thead>
                    <tbody className="font-black">
                      <tr
                        className={`border-b border-slate-800/80 ${
                          matchState.isTop && !matchState.isGameOver
                            ? "bg-slate-800/70"
                            : ""
                        }`}
                      >
                        <td className="py-1 px-2 text-left truncate max-w-[92px] text-[10.5px] text-slate-100">
                          {matchState.isTop && !matchState.isGameOver && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 align-middle" />
                          )}
                          {matchState.awayTeamName}
                        </td>
                        {matchState.innings.map((cell, idx) => (
                          <td
                            key={idx}
                            className={`py-1 px-1 ${
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
                        <td className="py-1 px-1.5 text-amber-300 text-xs border-l border-slate-800">
                          {matchState.awayScore}
                        </td>
                        <td className="py-1 px-1.5 text-slate-400 text-[10.5px]">
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
                        <td className="py-1 px-2 text-left truncate max-w-[92px] text-[10.5px] text-slate-100">
                          {!matchState.isTop && !matchState.isGameOver && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 align-middle" />
                          )}
                          {matchState.homeTeamName}
                        </td>
                        {matchState.innings.map((cell, idx) => (
                          <td
                            key={idx}
                            className={`py-1 px-1 ${
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
                        <td className="py-1 px-1.5 text-amber-300 text-xs border-l border-slate-800">
                          {matchState.homeScore}
                        </td>
                        <td className="py-1 px-1.5 text-slate-400 text-[10.5px]">
                          {matchState.homeHits}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* BSO電光インジケーター ＋ 塁状況ミニダイヤ */}
                <div className="w-[104px] shrink-0 rounded-xl bg-slate-900 border border-slate-800 px-2 py-1.5 flex items-center justify-between gap-1">
                  <div className="space-y-1 text-[10px] font-black leading-none">
                    <div className="flex items-center gap-1">
                      <span className="w-3 text-emerald-400">B</span>
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
                    <div className="flex items-center gap-1">
                      <span className="w-3 text-amber-400">S</span>
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
                    <div className="flex items-center gap-1">
                      <span className="w-3 text-red-400">O</span>
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

                  {/* ミニ走者ダイヤモンド */}
                  <svg
                    viewBox="0 0 36 36"
                    className="w-9 h-9 shrink-0"
                    aria-label={formatRunnerSituationLabel(matchState.bases)}
                  >
                    {/* 二塁 */}
                    <polygon
                      points="18,4 24,10 18,16 12,10"
                      fill={matchState.bases.second ? "#fbbf24" : "#1e293b"}
                      stroke="#64748b"
                      strokeWidth="1.5"
                    />
                    {/* 三塁 */}
                    <polygon
                      points="8,14 14,20 8,26 2,20"
                      fill={matchState.bases.third ? "#fbbf24" : "#1e293b"}
                      stroke="#64748b"
                      strokeWidth="1.5"
                    />
                    {/* 一塁 */}
                    <polygon
                      points="28,14 34,20 28,26 22,20"
                      fill={matchState.bases.first ? "#fbbf24" : "#1e293b"}
                      stroke="#64748b"
                      strokeWidth="1.5"
                    />
                    {/* 本塁 */}
                    <polygon
                      points="15,26 21,26 21,29 18,32 15,29"
                      fill="#e2e8f0"
                    />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* 打席情報 ＆ 実況アナウンス帯 */}
          <div className="px-3.5 py-2.5 bg-muted/60 border-b border-border flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-[#0f172a] text-white text-[10px] font-black shrink-0">
                  #{currentBatter.uniformNumber}
                </span>
                <span className="text-xs font-black text-foreground truncate">
                  {currentBatter.name}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-card border border-border text-[9.5px] font-bold text-muted-foreground shrink-0">
                  {currentBatter.bats === "L" ? "左打" : "右打"}・
                  {currentBatter.atBats}打数{currentBatter.hits}安打
                  {currentBatter.homeRuns > 0
                    ? ` ${currentBatter.homeRuns}HR`
                    : ""}
                </span>
              </div>
              <p className="text-[11px] font-bold text-primary truncate mt-0.5">
                {matchState.lastCallout}
              </p>
            </div>

            <button
              type="button"
              id="btn-baseball-board-boxscore"
              onClick={() => setIsBoxScoreOpen(true)}
              className="h-8 px-2.5 rounded-xl bg-card hover:bg-muted border border-border text-[10.5px] font-black text-foreground flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer"
            >
              <ListOrdered className="w-3.5 h-3.5 text-primary" />
              <span>成績</span>
            </button>
          </div>

          {/* 🎯 野球盤メイン盤面 Canvas */}
          <div className="p-3 bg-card">
            <BaseballBoardCanvas
              ref={canvasRef}
              bases={matchState.bases}
              outs={matchState.outs}
              strikes={matchState.strikes}
              batterBats={currentBatter.bats}
              stance={stance}
              soundEnabled={soundEnabled}
              canTapToSwing={isHumanBatterTurn && !matchState.isGameOver}
              canTapToPitch={
                isHumanBatterTurn &&
                boardPhase === "idle" &&
                !matchState.isGameOver
              }
              bannerText={bannerText}
              bannerTone={bannerTone}
              onPhaseChange={setBoardPhase}
              onPlayResolved={handlePlayResolved}
              onRequestQuickPitch={handleStartPitchForBatter}
            />
          </div>

          {/* 🕹️ 片手親指コックピット操作エリア */}
          <div className="px-3.5 pb-4 pt-1 space-y-2.5 border-t border-border bg-muted/30">
            {matchState.isGameOver ? (
              /* 🏁 試合終了パネル */
              <div className="pt-2 space-y-2.5">
                <div className="p-3 rounded-2xl bg-card border border-border text-center space-y-1">
                  <p className="text-xs font-black text-primary">
                    {matchState.mode === "derby"
                      ? "🌈 ホームラン競争 終了！"
                      : matchState.winner === "home"
                      ? `🏆 ${matchState.homeTeamName} の勝利！！`
                      : matchState.winner === "away"
                      ? `⚾ ${matchState.awayTeamName} の勝利！`
                      : "🤝 白熱の引き分け！"}
                  </p>
                  <p className="text-sm font-black text-foreground">
                    {matchState.mode === "derby"
                      ? `${DERBY_TOTAL_PITCHES}球中 ${matchState.derbyHomeRuns}本塁打 / ${matchState.derbyPoints}pt`
                      : `${matchState.awayTeamName} ${matchState.awayScore} - ${matchState.homeScore} ${matchState.homeTeamName}`}
                  </p>
                </div>

                <button
                  type="button"
                  id="btn-baseball-board-play-again"
                  onClick={() => startNewGame()}
                  className="w-full h-12 rounded-2xl bg-primary hover:brightness-105 text-primary-foreground font-black text-sm flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>もう1試合あそぶ！</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    id="btn-baseball-board-copy-result"
                    onClick={() => void handleCopyResultText()}
                    className="h-10 rounded-xl bg-card hover:bg-muted border border-border text-foreground font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-primary" />
                    <span>結果をコピー</span>
                  </button>
                  <button
                    type="button"
                    id="btn-baseball-board-share-line"
                    onClick={() => void handleShareResultLine()}
                    className="h-10 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>LINEで共有</span>
                  </button>
                </div>
              </div>
            ) : isHumanBatterTurn ? (
              /* 🏏 打者ターン操作UI（裏イニング / HR競争 / 2P球種ロック後） */
              <div className="pt-2 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-foreground flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>
                      {matchState.mode === "versus"
                        ? `${
                            matchState.isTop
                              ? matchState.awayTeamName
                              : matchState.homeTeamName
                          }（打者）の番！`
                        : "あなたの打席：狙いを選んでスイング！"}
                    </span>
                  </span>

                  {matchState.mode !== "versus" && (
                    <button
                      type="button"
                      id="btn-baseball-board-autopitch"
                      onClick={() => setAutoPitchEnabled((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-full border text-[10px] font-black transition-all cursor-pointer ${
                        autoPitchEnabled
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      自動投球 {autoPitchEnabled ? "ON" : "OFF"}
                    </button>
                  )}
                </div>

                {/* 打撃スタイル3択 */}
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      {
                        id: "contact" as const,
                        label: "⚡ ミート",
                        sub: "広角・安打",
                      },
                      {
                        id: "power" as const,
                        label: "🔥 強振",
                        sub: "柵越えHR狙い",
                      },
                      {
                        id: "bunt" as const,
                        label: "🎯 バント",
                        sub: "進塁・内野安打",
                      },
                    ] as const
                  ).map((opt) => {
                    const active = stance === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setStance(opt.id)}
                        className={`py-2 px-2 rounded-xl border text-center transition-all active:scale-95 cursor-pointer ${
                          active
                            ? "bg-[#0f172a] text-white border-primary ring-2 ring-primary/25"
                            : "bg-card text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        <p className="text-xs font-black leading-tight">
                          {opt.label}
                        </p>
                        <p
                          className={`text-[9.5px] font-bold mt-0.5 ${
                            active ? "text-slate-300" : "text-muted-foreground"
                          }`}
                        >
                          {opt.sub}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* メイン大型アクションボタン（投球スタート ➔ 0msスイング！） */}
                {boardPhase === "pitching" ? (
                  <button
                    type="button"
                    id="btn-baseball-board-swing"
                    onPointerDown={handleSwingPointerDown}
                    className="w-full h-14 rounded-2xl bg-[#dc2626] hover:bg-[#b91c1c] text-white font-black text-base tracking-wide shadow-sm active:scale-97 transition-transform flex items-center justify-center gap-2 cursor-pointer select-none touch-manipulation"
                  >
                    <span>🏏 スイング！！（盤面タップでもOK）</span>
                  </button>
                ) : boardPhase === "idle" ? (
                  <button
                    type="button"
                    id="btn-baseball-board-pitch-start"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handleStartPitchForBatter();
                    }}
                    className="w-full h-14 rounded-2xl bg-primary hover:brightness-105 text-primary-foreground font-black text-base tracking-wide shadow-sm active:scale-97 transition-transform flex items-center justify-center gap-2 cursor-pointer select-none touch-manipulation"
                  >
                    <span>
                      ⚾{" "}
                      {autoPitchEnabled
                        ? "すぐ投球する（自動投球待機中）"
                        : "ピッチャー投球スタート！"}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full h-14 rounded-2xl bg-muted border border-border text-muted-foreground font-black text-sm flex items-center justify-center cursor-not-allowed"
                  >
                    <span>打球の行方を見守り中…！</span>
                  </button>
                )}
              </div>
            ) : (
              /* ⚾ 投手ターン操作UI（1P表イニング守備 または 2P投手の球種セット） */
              <div className="pt-2 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-foreground flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-primary" />
                    <span>
                      {matchState.mode === "versus"
                        ? `${
                            matchState.isTop
                              ? matchState.homeTeamName
                              : matchState.awayTeamName
                          }（投手）：打者に見せないよう球種を選択！`
                        : "あなたの投球（守備）：コースと球種で打ち取ろう！"}
                    </span>
                  </span>
                </div>

                {/* コース3択 */}
                <div className="grid grid-cols-3 gap-1.5">
                  {COURSE_OPTIONS.map((c) => {
                    const active = selectedCourse === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={boardPhase !== "idle"}
                        onClick={() => setSelectedCourse(c.id)}
                        className={`h-9 rounded-xl border text-xs font-black transition-all active:scale-95 cursor-pointer disabled:opacity-50 ${
                          active
                            ? "bg-[#0f172a] text-white border-primary"
                            : "bg-card text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        コース：{c.label}
                      </button>
                    );
                  })}
                </div>

                {/* 4球種ボタン（1タップ即投球 / 2P時は1タップ秘密セット） */}
                <div className="grid grid-cols-2 gap-2">
                  {STANDARD_PITCH_TYPES.map((pType) => {
                    const meta = PITCH_TYPE_META[pType];
                    return (
                      <button
                        key={pType}
                        type="button"
                        disabled={boardPhase !== "idle"}
                        onClick={() =>
                          matchState.mode === "versus"
                            ? handleLockVersusPitch(pType)
                            : handleHumanPitchToCpu(pType)
                        }
                        className="p-2.5 rounded-xl bg-card hover:bg-muted border border-border hover:border-primary/50 text-left transition-all active:scale-97 cursor-pointer disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-black text-foreground">
                            ⚾ {meta.label}
                          </span>
                          {matchState.mode === "versus" && (
                            <Lock className="w-3 h-3 text-muted-foreground" />
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-muted-foreground mt-0.5 truncate">
                          {meta.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* 必殺「消える魔球」ボタン */}
                <button
                  type="button"
                  id="btn-baseball-board-vanish-pitch"
                  disabled={boardPhase !== "idle" || pitcherVanishLeft <= 0}
                  onClick={() =>
                    matchState.mode === "versus"
                      ? handleLockVersusPitch("vanish")
                      : handleHumanPitchToCpu("vanish")
                  }
                  className={`w-full h-11 rounded-2xl border-2 font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-98 ${
                    pitcherVanishLeft > 0 && boardPhase === "idle"
                      ? "bg-[#0f172a] hover:bg-slate-800 text-amber-300 border-amber-500 cursor-pointer shadow-xs"
                      : "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-60"
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>
                    {pitcherVanishLeft > 0
                      ? `必殺「消える魔球」を投げる！（残り ${pitcherVanishLeft} / ${MAX_VANISH_PITCHES_PER_GAME} 球）`
                      : "消える魔球は使い切りました（0球）"}
                  </span>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⚙️ 対戦モード・イニング・選手連動設定カード（A-3 ソリッドカード）
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs font-black flex items-center gap-1.5">
              <Gamepad2 className="w-4 h-4 text-blue-300" />
              <span>ゲームモード・試合設定</span>
            </span>
            <span className="text-[10px] font-bold text-slate-300">
              切替で新規プレイ開始
            </span>
          </div>

          <div className="p-4 space-y-3.5">
            {/* 対戦モード選択 */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-black text-foreground">
                1. 遊び方モード
              </p>
              <div className="grid grid-cols-3 gap-2">
                {MODE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = mode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
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

            {mode !== "derby" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* イニング数 */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-black text-foreground">
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

                {/* CPU強さ */}
                {mode === "cpu" && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-black text-foreground">
                      3. CPUの強さ
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
                )}
              </div>
            )}

            {/* 出場打順の名鑑選手連動トグル */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-black text-foreground">
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
                  <p className="text-xs font-black">
                    🧢 チーム選手で遊ぶ
                  </p>
                  <p
                    className={`text-[10px] font-bold mt-0.5 ${
                      useTeamRoster ? "text-slate-300" : "text-muted-foreground"
                    }`}
                  >
                    {activeRosterCount > 0
                      ? `選手名鑑（${activeRosterCount}名）から自動編成`
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
                      !useTeamRoster ? "text-slate-300" : "text-muted-foreground"
                    }`}
                  >
                    1番〜9番の汎用ポジション名
                  </p>
                </button>
              </div>
            </div>

            {/* 安全保護の注記 */}
            <div className="p-3 rounded-xl bg-muted border border-border flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-[10.5px] font-bold text-muted-foreground leading-relaxed">
                この野球盤ゲームのスコアや打撃成績は端末内のお楽しみ専用です。チームの公式「試合・スコア」や「チーム成績」「個人成長レポート」のデータには一切影響しませんので安心して遊べます。
              </p>
            </div>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            🏆 マイ戦績＆ハイスコア（端末ローカル保存・チーム別分離）
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs font-black flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>マイ野球盤レコード（この端末の記録）</span>
            </span>
            {localStats.gamesPlayed > 0 || localStats.derbyHighScore > 0 ? (
              <button
                type="button"
                onClick={() => setIsConfirmResetStatsOpen(true)}
                className="text-[10px] font-bold text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>記録クリア</span>
              </button>
            ) : null}
          </div>

          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-xl bg-muted border border-border text-center">
              <p className="text-[10px] font-bold text-muted-foreground">
                通算勝敗
              </p>
              <p className="text-sm font-black text-foreground tabular-nums mt-0.5">
                {localStats.wins}勝 {localStats.losses}敗{" "}
                {localStats.draws > 0 ? `${localStats.draws}分` : ""}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-muted border border-border text-center">
              <p className="text-[10px] font-bold text-muted-foreground">
                通算ホームラン
              </p>
              <p className="text-sm font-black text-primary tabular-nums mt-0.5">
                {localStats.totalHomeRuns} 本
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-muted border border-border text-center">
              <p className="text-[10px] font-bold text-muted-foreground">
                1試合最多得点
              </p>
              <p className="text-sm font-black text-foreground tabular-nums mt-0.5">
                {localStats.bestSingleGameRuns} 点
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-muted border border-border text-center">
              <p className="text-[10px] font-bold text-muted-foreground">
                HR競争ハイスコア
              </p>
              <p className="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                {localStats.derbyHighScore} pt ({localStats.derbyBestHr}本)
              </p>
            </div>
          </div>
        </section>

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

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
                    1. スイングのタイミングと打球方向
                  </p>
                  <p className="text-muted-foreground font-bold">
                    ホームベース手前の白枠にボールが重なる瞬間がベストタイミング！「強振」で真芯にとらえると野手の頭を越えてスタンドイン（柵越えHOME RUN）になります。早振りは引っ張り、遅振りは流し打ちになります。
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-muted border border-border space-y-1">
                  <p className="font-black text-foreground">
                    2. 必殺「消える魔球」（1試合2球まで）
                  </p>
                  <p className="text-muted-foreground font-bold">
                    本塁手前のトラップドアが開いてボールが床下へ消えます！振ってしまうと空振りストライクですが、じっと我慢して見送れば「ボール」になります。ここぞの2ストライク勝負で使いましょう！
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-muted border border-border space-y-1">
                  <p className="font-black text-foreground">
                    3. 本格野球ルールも再現！
                  </p>
                  <p className="text-muted-foreground font-bold">
                    ・一塁走者あり（無死/一死）で二塁・遊撃ポケットに入ると「6-4-3 ダブルプレー」！
                    <br />
                    ・三塁走者あり（無死/一死）で外野フライ捕球になると「タッチアップ犠牲フライ」で1点！
                    <br />
                    ・2ストライク後のバントファウルは「スリーバント失敗」で三振アウト！
                    <br />
                    ・同点時は無死一・二塁からの「延長タイブレーク」に突入します。
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-muted border border-border space-y-1">
                  <p className="font-black text-foreground">
                    4. 2P 1台対戦（スマホ1台で交互プレイ）
                  </p>
                  <p className="text-muted-foreground font-bold">
                    まず投手側がコースと球種をタップしてロック（画面上では球種が隠れます）し、打者側へスマホを渡して投球スタート＆スイングで対戦できます！移動中や雨天待機中にもおすすめです。
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
          📋 出場メンバー・本日の打撃成績モーダル（createPortal & z-[9999]）
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
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3.5 flex items-center justify-between shrink-0">
                <span className="text-sm font-black flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-blue-300" />
                  <span>出場打順・この試合の打撃成績</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsBoxScoreOpen(false)}
                  className="p-1 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto">
                {[
                  {
                    title: matchState.homeTeamName,
                    lineup: matchState.homeLineup,
                    activeIdx:
                      !matchState.isTop || matchState.mode === "derby"
                        ? matchState.homeBatterIdx
                        : -1,
                  },
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
                          <th className="py-1.5 px-2 text-left">打順・選手</th>
                          <th className="py-1.5 px-1.5 text-center">打数</th>
                          <th className="py-1.5 px-1.5 text-center">安打</th>
                          <th className="py-1.5 px-1.5 text-center">本塁打</th>
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
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card shrink-0">
                <button
                  type="button"
                  onClick={() => setIsBoxScoreOpen(false)}
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-black text-xs cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          🗑️ 戦績リセット確認モーダル（createPortal & z-[9999]）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isConfirmResetStatsOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60">
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
                  この端末に保存されている野球盤の通算勝敗・ホームラン数・ハイスコアをリセットしますか？
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
