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
  ShieldCheck,
  Copy,
  Share2,
  Lock,
  ListOrdered,
  X,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useLiff,
  useScoreTeamDisplayName,
} from "@/components/liff/LiffProvider";
import { peekLiffApiCache } from "@/lib/liff/api-cache";
import {
  shareLiffPageViaLine,
  sharePlainTextViaLine,
} from "@/lib/liff/liff-client";
import { canGoBackInLiff, navigateToLiffRoot } from "@/lib/liff/navigation";
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
  const [useTeamRoster, setUseTeamRoster] = useState<boolean>(true);
  const [autoPitchEnabled, setAutoPitchEnabled] = useState<boolean>(false);
  const [isPageSharing, setIsPageSharing] = useState<boolean>(false);

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

  // モーダル開閉ステート（1画面コックピットのため設定・成績・遊び方はすべてPortalモーダル化）
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isBoxScoreOpen, setIsBoxScoreOpen] = useState(false);
  const [statsModalTab, setStatsModalTab] = useState<"match" | "records">(
    "match"
  );
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
      setIsSettingsOpen(false);
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

  const isHumanBatterTurn =
    matchState.mode === "derby" ||
    (matchState.mode === "cpu" && !matchState.isTop) ||
    (matchState.mode === "versus" && lockedVersusPitch !== null);

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
      const outcome = await shareLiffPageViaLine({
        title: "野球盤ゲーム｜iScoreCloud",
        text: "懐かしの野球盤ミニゲームで対決しよう！（消える魔球・柵越えHR対応）",
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
  const handleHumanPitchToCpu = (pitchType: PitchType) => {
    if (boardPhase !== "idle" || matchState.isGameOver) return;
    if (pitchType === "vanish" && pitcherVanishLeft <= 0) {
      toast.error("消える魔球の残り回数がありません");
      return;
    }
    canvasRef.current?.launchPitch({
      pitch: { type: pitchType, course: selectedCourse },
      batterBats: currentBatter.bats,
      batterIsCpu: true,
      cpuDifficulty: matchState.difficulty,
      strikes: matchState.strikes,
      outs: matchState.outs,
      bases: matchState.bases,
    });
  };

  // 2P 1台対戦：投手が球種＆コースを秘密ロックして打者へ渡す
  const handleLockVersusPitch = (pitchType: PitchType) => {
    if (boardPhase !== "idle" || matchState.isGameOver) return;
    if (pitchType === "vanish" && pitcherVanishLeft <= 0) {
      toast.error("消える魔球の残り回数がありません");
      return;
    }
    setLockedVersusPitch({
      type: pitchType,
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
          applied.nextState.isGameOver ? 2500 : 1450
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

        return applied.nextState;
      });
    },
    [activeTeamId, showTemporaryBanner, soundEnabled]
  );

  // 自動投球モード ON 時：モーダル非表示・打者待機中のみ自動投球
  useEffect(() => {
    if (autoPitchTimerRef.current) {
      clearTimeout(autoPitchTimerRef.current);
      autoPitchTimerRef.current = null;
    }

    const anyModalOpen =
      isSettingsOpen ||
      isGuideOpen ||
      isBoxScoreOpen ||
      isConfirmResetStatsOpen;

    const canAutoPitch =
      autoPitchEnabled &&
      boardPhase === "idle" &&
      !matchState.isGameOver &&
      (matchState.mode === "derby" ||
        (matchState.mode === "cpu" && !matchState.isTop)) &&
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
    isGuideOpen,
    isSettingsOpen,
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
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden overscroll-none bg-background select-none">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ① 上部固定：コンパクト操作バー ＆ 電光スコアボード（A-3 Dark Cap・ヘッダーなし専用）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className="shrink-0 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary pt-[max(env(safe-area-inset-top),8px)] px-2.5 pb-2 space-y-1.5">
        {/* 最上段ナビバー：戻る ＋ タイトル・回表示 ＋ 設定/成績/音/遊び方/共有 */}
        <div className="flex items-center justify-between gap-1.5">
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

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-black text-white truncate">
                野球盤
              </span>
              <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black shrink-0">
                {matchState.isGameOver
                  ? "試合終了"
                  : matchState.mode === "derby"
                  ? `${matchState.derbyPitchNumber}/${DERBY_TOTAL_PITCHES}球`
                  : `${
                      matchState.inning > matchState.totalInnings ? "延" : ""
                    }${matchState.inning}回${matchState.isTop ? "表" : "裏"}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              id="btn-baseball-board-settings"
              onClick={() => setIsSettingsOpen(true)}
              className="h-8 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5 text-blue-300" />
              <span>設定</span>
            </button>

            <button
              type="button"
              id="btn-baseball-board-records"
              onClick={() => {
                setStatsModalTab("match");
                setIsBoxScoreOpen(true);
              }}
              className="h-8 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>成績</span>
            </button>

            <button
              type="button"
              id="btn-baseball-board-sound"
              onClick={handleToggleSound}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
                soundEnabled
                  ? "bg-slate-800 border-slate-700 text-blue-300 hover:bg-slate-700"
                  : "bg-slate-900 border-slate-800 text-slate-500"
              }`}
              aria-label={soundEnabled ? "効果音ON" : "効果音OFF"}
              title={soundEnabled ? "効果音ON" : "消音中"}
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              id="btn-baseball-board-guide"
              onClick={() => setIsGuideOpen(true)}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              aria-label="遊び方ガイド"
              title="遊び方ガイド"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            <button
              type="button"
              id="btn-baseball-board-share-page"
              disabled={isPageSharing}
              onClick={() => void handleSharePage()}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[#06C755] flex items-center justify-center active:scale-95 transition-all cursor-pointer disabled:opacity-60"
              aria-label="LINEで共有"
              title="LINEでページを共有"
            >
              {isPageSharing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* 電光スコアボード行 */}
        {matchState.mode === "derby" ? (
          <div className="grid grid-cols-3 gap-1.5">
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
            <div className="flex-1 min-w-0 rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto">
              <table className="w-full text-center border-collapse text-[10.5px] tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-[9px] font-bold text-slate-400">
                    <th className="py-0.5 px-1.5 text-left font-bold">
                      {matchState.mode === "versus" ? "2P対戦" : "1P対戦"}
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
                    <td className="py-0.5 px-1.5 text-left truncate max-w-[84px] text-[10px] text-slate-100">
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
                    <td className="py-0.5 px-1.5 text-left truncate max-w-[84px] text-[10px] text-slate-100">
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
          ② 打者＆実況スリムバー（shrink-0）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="shrink-0 px-3 py-1.5 bg-card border-b border-border flex items-center justify-between gap-2">
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
          {isHumanBatterTurn &&
            matchState.mode !== "versus" &&
            !matchState.isGameOver && (
              <button
                type="button"
                id="btn-baseball-board-autopitch"
                onClick={() => setAutoPitchEnabled((prev) => !prev)}
                className={`h-7 px-2 rounded-full border text-[10px] font-black transition-all cursor-pointer ${
                  autoPitchEnabled
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                自動投球 {autoPitchEnabled ? "ON" : "OFF"}
              </button>
            )}

          {matchState.mode !== "derby" && !isHumanBatterTurn && (
            <span className="px-2 py-1 rounded-full bg-[#0f172a] text-amber-300 text-[10px] font-black flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>魔球あと{pitcherVanishLeft}</span>
            </span>
          )}

          <button
            type="button"
            id="btn-baseball-board-restart"
            onClick={() => startNewGame()}
            className="h-7 px-2 rounded-lg bg-muted hover:bg-accent border border-border text-[10px] font-black text-foreground flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            title="最初からやり直す"
          >
            <RotateCcw className="w-3 h-3" />
            <span>最初</span>
          </button>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ③ 中央伸縮：野球盤メインステージ（flex-1 min-h-0 で画面縦幅に100%自動フィット）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex-1 min-h-0 w-full px-2 py-1.5 bg-background flex items-center justify-center overflow-hidden">
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

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ④ 最下部固定：親指ワンハンド操作ドック（shrink-0・ボトムナビ非表示のためSafe Area直置き）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer className="shrink-0 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),12px)] bg-card border-t border-border">
        {matchState.isGameOver ? (
          /* 🏁 試合終了ドック */
          <div className="space-y-2">
            <div className="px-3 py-1.5 rounded-xl bg-muted border border-border flex items-center justify-between gap-2">
              <span className="text-xs font-black text-primary truncate">
                {matchState.mode === "derby"
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

            <div className="grid grid-cols-12 gap-1.5">
              <button
                type="button"
                id="btn-baseball-board-play-again"
                onClick={() => startNewGame()}
                className="col-span-6 h-11 rounded-xl bg-primary hover:brightness-105 text-primary-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-97 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>もう1試合！</span>
              </button>
              <button
                type="button"
                id="btn-baseball-board-copy-result"
                onClick={() => void handleCopyResultText()}
                className="col-span-3 h-11 rounded-xl bg-muted hover:bg-accent border border-border text-foreground font-black text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-primary" />
                <span>コピー</span>
              </button>
              <button
                type="button"
                id="btn-baseball-board-share-line"
                onClick={() => void handleShareResultLine()}
                className="col-span-3 h-11 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>LINE</span>
              </button>
            </div>
          </div>
        ) : isHumanBatterTurn ? (
          /* 🏏 打者ターンドック（狙い3択 ＋ 大型スイングボタン） */
          <div className="space-y-1.5">
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "contact" as const, label: "⚡ ミート", sub: "広角安打" },
                  { id: "power" as const, label: "🔥 強振", sub: "柵越えHR" },
                  { id: "bunt" as const, label: "🎯 バント", sub: "進塁・内安" },
                ] as const
              ).map((opt) => {
                const active = stance === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStance(opt.id)}
                    className={`h-9 px-1.5 rounded-xl border flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer ${
                      active
                        ? "bg-[#0f172a] text-white border-primary ring-2 ring-primary/25"
                        : "bg-muted/60 text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    <span className="text-xs font-black">{opt.label}</span>
                    <span
                      className={`text-[9.5px] font-bold hidden xs:inline ${
                        active ? "text-slate-300" : "text-muted-foreground"
                      }`}
                    >
                      ({opt.sub})
                    </span>
                  </button>
                );
              })}
            </div>

            {boardPhase === "pitching" ? (
              <button
                type="button"
                id="btn-baseball-board-swing"
                onPointerDown={handleSwingPointerDown}
                className="w-full h-12 rounded-2xl bg-[#dc2626] hover:bg-[#b91c1c] text-white font-black text-base tracking-wide shadow-sm active:scale-97 transition-transform flex items-center justify-center gap-2 cursor-pointer touch-manipulation"
              >
                <span>🏏 スイング！！（盤面タップ可）</span>
              </button>
            ) : boardPhase === "idle" ? (
              <button
                type="button"
                id="btn-baseball-board-pitch-start"
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleStartPitchForBatter();
                }}
                className="w-full h-12 rounded-2xl bg-primary hover:brightness-105 text-primary-foreground font-black text-sm sm:text-base tracking-wide shadow-sm active:scale-97 transition-transform flex items-center justify-center gap-2 cursor-pointer touch-manipulation"
              >
                <span>
                  ⚾{" "}
                  {matchState.mode === "versus"
                    ? `${
                        matchState.isTop
                          ? matchState.awayTeamName
                          : matchState.homeTeamName
                      }：投球スタート！`
                    : autoPitchEnabled
                    ? "すぐ投球する（自動投球ON）"
                    : "ピッチャー投球スタート！"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="w-full h-12 rounded-2xl bg-muted border border-border text-muted-foreground font-black text-xs flex items-center justify-center cursor-not-allowed"
              >
                <span>打球の行方を見守り中…！</span>
              </button>
            )}
          </div>
        ) : (
          /* ⚾ 投手ターンドック（コース3択 ＋ 5球種アーケードデッキ：打者ターンと同高に揃えて盤面サイズ変動ゼロ！） */
          <div className="space-y-1.5">
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
                        : "bg-muted/60 text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    コース：{c.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-5 gap-1.5">
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
                    className="h-12 px-1 rounded-xl bg-card hover:bg-muted border border-border hover:border-primary/50 flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <span className="text-[11px] font-black text-foreground leading-tight truncate max-w-full">
                      {meta.shortLabel}
                    </span>
                    <span className="text-[9px] font-bold text-muted-foreground mt-0.5 flex items-center gap-0.5">
                      {matchState.mode === "versus" ? (
                        <>
                          <Lock className="w-2.5 h-2.5" />
                          <span>セット</span>
                        </>
                      ) : (
                        <span>投球</span>
                      )}
                    </span>
                  </button>
                );
              })}

              {/* 5枠目：必殺「消える魔球」ボタン */}
              <button
                type="button"
                id="btn-baseball-board-vanish-pitch"
                disabled={boardPhase !== "idle" || pitcherVanishLeft <= 0}
                onClick={() =>
                  matchState.mode === "versus"
                    ? handleLockVersusPitch("vanish")
                    : handleHumanPitchToCpu("vanish")
                }
                className={`h-12 px-1 rounded-xl border-2 flex flex-col items-center justify-center transition-all active:scale-95 ${
                  pitcherVanishLeft > 0 && boardPhase === "idle"
                    ? "bg-[#0f172a] hover:bg-slate-800 text-amber-300 border-amber-500 cursor-pointer"
                    : "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-55"
                }`}
              >
                <span className="text-[11px] font-black leading-tight flex items-center gap-0.5">
                  <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>魔球</span>
                </span>
                <span className="text-[9px] font-bold mt-0.5">
                  残{pitcherVanishLeft}/{MAX_VANISH_PITCHES_PER_GAME}
                </span>
              </button>
            </div>
          </div>
        )}
      </footer>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ⚙️ ゲームモード・試合設定モーダル（createPortal & z-[9999]）
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
                  <span>ゲームモード・試合設定</span>
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
                {/* 1. 遊び方モード */}
                <div className="space-y-1.5">
                  <p className="text-xs font-black text-foreground">
                    1. 遊び方モード（切替で新規開始）
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

                    {/* 3. CPU強さ */}
                    {mode === "cpu" && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-black text-foreground">
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
                  </>
                )}

                {/* 出場メンバー表示 */}
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
                    startNewGame();
                    setIsSettingsOpen(false);
                    toast.success("新しい試合を開始しました！");
                  }}
                  className="h-11 rounded-xl bg-muted hover:bg-accent border border-border text-foreground font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>最初からやり直す</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="h-11 rounded-xl bg-primary text-primary-foreground font-black text-xs cursor-pointer"
                >
                  設定を閉じて遊ぶ
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

              {/* モーダル内2タブ */}
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
                    </div>

                    {(localStats.gamesPlayed > 0 ||
                      localStats.derbyHighScore > 0) && (
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
                    4. モード切替・出場選手変更
                  </p>
                  <p className="text-muted-foreground font-bold">
                    右上の「設定」ボタンから、1P vs CPU・2P 1台交互対戦・10球ホームラン競争の切り替えや、チーム登録選手／標準メンバーの切り替えが行えます。
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
