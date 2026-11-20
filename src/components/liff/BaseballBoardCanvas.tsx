// filepath: src/components/liff/BaseballBoardCanvas.tsx
"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import {
  BASE_COORDS,
  BOARD_HEIGHT,
  BOARD_PINS,
  BOARD_WIDTH,
  FENCE_ARC_CX,
  FENCE_ARC_CY,
  FENCE_ARC_RADIUS,
  FENCE_POCKETS,
  FIELDER_TRAPS,
  HOME_X,
  HOME_Y,
  MOUND_X,
  MOUND_Y,
  PITCH_TYPE_META,
  TRAPDOOR_Y,
  decideCpuBatterPlan,
  getCourseTargetX,
  isFairTerritory,
  resolveFencePocketAtAngle,
  resolveLaunchSpeedMetrics,
  type BatterHand,
  type BatterStance,
  type CpuDifficulty,
  type PitchSpec,
  type PitchSpeedPreset,
  type PlayOutcomeCode,
  type RunnerBases,
} from "@/lib/liff/baseball-board-engine";
import {
  playBatContact,
  playPitchSpring,
  playPinRicochet,
  playSwingWhoosh,
  playVanishTrap,
} from "@/lib/liff/baseball-board-audio";
import type {
  OnlineBatterReplayContact,
  OnlinePlayReplayData,
  OnlineResolvedPlayPayload,
} from "@/types/baseball-board-online";

export type BoardActionPhase = "idle" | "pitching" | "batted" | "resolving";

export type OnlinePitchButtonMode =
  | "normal"
  | "wait_opponent_pitch"
  | "pitch_sent"
  | "spectator";

export interface ResolvedBoardPlay {
  outcome: PlayOutcomeCode;
  detailLabel: string;
  usedVanishPitch: boolean;
  pitchKmh: number;
  exitVelocityKmh: number;
  replayData?: OnlinePlayReplayData;
}

export interface BaseballBoardCanvasHandle {
  launchPitch: (params: {
    pitch: PitchSpec;
    speedPreset: PitchSpeedPreset;
    batterBats: BatterHand;
    batterIsCpu: boolean;
    cpuDifficulty: CpuDifficulty;
    strikes: number;
    outs: number;
    bases: RunnerBases;
  }) => void;
  playOnlineReplay: (params: {
    pitch: PitchSpec;
    speedPreset: PitchSpeedPreset;
    batterBats: BatterHand;
    replayData: OnlinePlayReplayData;
    authoritativeResult: OnlineResolvedPlayPayload;
    onArriveResult?: () => void;
    onReplayFinished?: () => void;
  }) => void;
  triggerSwing: (stance?: BatterStance) => boolean;
  resetBoardIdle: () => void;
}

interface BaseballBoardCanvasProps {
  bases: RunnerBases;
  outs: number;
  strikes: number;
  batterBats: BatterHand;
  stance: BatterStance;
  speedBadgeText: string;
  soundEnabled: boolean;
  isHumanBatterTurn: boolean;
  isGameOver: boolean;
  isVersusPitchLockMode?: boolean;
  onlinePitchButtonMode?: OnlinePitchButtonMode;
  bannerText: string | null;
  bannerTone: "hr" | "hit" | "out" | "walk" | "magic" | "neutral";
  onPhaseChange: (phase: BoardActionPhase) => void;
  onPlayResolved: (play: ResolvedBoardPlay) => void;
  onPressBoardPitch: () => void;
  onPracticeSwing?: () => void;
  onVisibilityAbort?: () => void;
}

interface TrailPoint {
  x: number;
  y: number;
  z: number;
}

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
}

interface InternalSimState {
  phase: BoardActionPhase;
  ballVisible: boolean;
  ballX: number;
  ballY: number;
  ballZ: number;
  vx: number;
  vy: number;
  vz: number;
  isSweetHit: boolean;
  isBuntBall: boolean;
  elapsedSec: number;
  // 投球・スピードガンパラメータ
  pitchSpec: PitchSpec;
  pitchSpeedPxPerSec: number;
  carryMultiplier: number;
  isFireball: boolean;
  prevPitchKmh: number;
  lastPitchKmh: number;
  lastExitVelocityKmh: number;
  whiffDetail: string;
  billboardFlashedUntilMs: number;
  pitchStartX: number;
  pitchTargetX: number;
  pitchProgress: number;
  trapdoorOpen: boolean;
  ballVanished: boolean;
  // 打者スイング・素振り状態
  batterBats: BatterHand;
  activeStance: BatterStance;
  hasSwung: boolean;
  swingAnimProgress: number;
  isPracticeSwinging: boolean;
  // CPU打者自動スイング予約
  cpuPlan: {
    enabled: boolean;
    willSwing: boolean;
    stance: BatterStance;
    targetHitY: number;
  };
  // オンライン通信対戦用の打球記録＆リプレイ制御
  recordedSwingTriggerY: number;
  recordedContact: OnlineBatterReplayContact | null;
  onlineReplay: {
    enabled: boolean;
    replayData: OnlinePlayReplayData | null;
    authoritativeResult: OnlineResolvedPlayPayload | null;
    onArriveResult: (() => void) | null;
    onReplayFinished: (() => void) | null;
  };
  // エフェクト（アニメーション中のみ稼働、待機時完全停止）
  trail: TrailPoint[];
  flashedPinIdx: number;
  flashedPinUntilMs: number;
  confetti: ConfettiPiece[];
  resolveTimerSec: number;
  pendingResult: ResolvedBoardPlay | null;
}

const CONFETTI_COLORS = ["#ef4444", "#f59e0b", "#2563eb", "#10b981", "#ffffff"];

function createInitialSimState(
  batterBats: BatterHand,
  stance: BatterStance
): InternalSimState {
  return {
    phase: "idle",
    ballVisible: true,
    ballX: MOUND_X,
    ballY: MOUND_Y,
    ballZ: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    isSweetHit: false,
    isBuntBall: false,
    elapsedSec: 0,
    pitchSpec: { type: "straight", course: "middle" },
    pitchSpeedPxPerSec: 235,
    carryMultiplier: 1,
    isFireball: false,
    prevPitchKmh: 0,
    lastPitchKmh: 0,
    lastExitVelocityKmh: 0,
    whiffDetail: "",
    billboardFlashedUntilMs: 0,
    pitchStartX: MOUND_X,
    pitchTargetX: HOME_X,
    pitchProgress: 0,
    trapdoorOpen: false,
    ballVanished: false,
    batterBats,
    activeStance: stance,
    hasSwung: false,
    swingAnimProgress: 0,
    isPracticeSwinging: false,
    cpuPlan: {
      enabled: false,
      willSwing: false,
      stance: "contact",
      targetHitY: HOME_Y - 6,
    },
    recordedSwingTriggerY: HOME_Y - 6,
    recordedContact: null,
    onlineReplay: {
      enabled: false,
      replayData: null,
      authoritativeResult: null,
      onArriveResult: null,
      onReplayFinished: null,
    },
    trail: [],
    flashedPinIdx: -1,
    flashedPinUntilMs: 0,
    confetti: [],
    resolveTimerSec: 0,
    pendingResult: null,
  };
}

export const BaseballBoardCanvas = forwardRef<
  BaseballBoardCanvasHandle,
  BaseballBoardCanvasProps
>(function BaseballBoardCanvas(
  {
    bases,
    outs,
    strikes,
    batterBats,
    stance,
    speedBadgeText,
    soundEnabled,
    isHumanBatterTurn,
    isGameOver,
    isVersusPitchLockMode = false,
    onlinePitchButtonMode = "normal",
    bannerText,
    bannerTone,
    onPhaseChange,
    onPlayResolved,
    onPressBoardPitch,
    onPracticeSwing,
    onVisibilityAbort,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastFrameMsRef = useRef<number>(0);
  const [livePhaseUi, setLivePhaseUi] = useState<BoardActionPhase>("idle");

  const propsRef = useRef({
    bases,
    outs,
    strikes,
    batterBats,
    stance,
    soundEnabled,
    isHumanBatterTurn,
    isGameOver,
    bannerText,
    bannerTone,
    onPhaseChange,
    onPlayResolved,
    onPracticeSwing,
    onVisibilityAbort,
  });
  propsRef.current = {
    bases,
    outs,
    strikes,
    batterBats,
    stance,
    soundEnabled,
    isHumanBatterTurn,
    isGameOver,
    bannerText,
    bannerTone,
    onPhaseChange,
    onPlayResolved,
    onPracticeSwing,
    onVisibilityAbort,
  };

  const simRef = useRef<InternalSimState>(
    createInitialSimState(batterBats, stance)
  );

  const syncPhase = useCallback((nextPhase: BoardActionPhase) => {
    simRef.current.phase = nextPhase;
    setLivePhaseUi(nextPhase);
    propsRef.current.onPhaseChange(nextPhase);
  }, []);

  const stopLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const drawBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      2
    );
    const targetW = Math.round(BOARD_WIDTH * dpr);
    const targetH = Math.round(BOARD_HEIGHT * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const sim = simRef.current;
    const {
      bases: curBases,
      bannerText: curBanner,
      bannerTone: curBannerTone,
      isHumanBatterTurn: humanBatting,
    } = propsRef.current;
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    // 1. 野球盤の外枠筐体（ソリッドダークネイビー・グラデーション完全不使用）
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // 四隅のビス装飾
    const rivets = [
      [12, 12],
      [BOARD_WIDTH - 12, 12],
      [12, BOARD_HEIGHT - 12],
      [BOARD_WIDTH - 12, BOARD_HEIGHT - 12],
    ];
    ctx.fillStyle = "#334155";
    for (const [rx, ry] of rivets) {
      ctx.beginPath();
      ctx.arc(rx ?? 0, ry ?? 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. 上部スタンド席（電光スピードガン ＋ センター大当たり看板 ＋ 打球速度計）
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.roundRect(10, 8, BOARD_WIDTH - 20, 42, 10);
    ctx.fill();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 左LED：投球スピードガン
    ctx.fillStyle = "#020617";
    ctx.beginPath();
    ctx.roundRect(16, 12, 102, 22, 5);
    ctx.fill();
    ctx.strokeStyle = sim.isFireball ? "#ef4444" : "#334155";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = sim.ballVanished
      ? "#f59e0b"
      : sim.lastPitchKmh >= 152
      ? "#f87171"
      : sim.lastPitchKmh > 0 && sim.lastPitchKmh <= 85
      ? "#a3e635"
      : "#38bdf8";
    ctx.font = "900 9.5px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const pitchGunLabel = sim.ballVanished
      ? "球速 ??? 魔球"
      : sim.lastPitchKmh > 0
      ? `球速 ${sim.lastPitchKmh} km/h`
      : "球速 --- km/h";
    ctx.fillText(pitchGunLabel, 67, 23.5);

    // 中央：🎯 看板直撃 ★ HOME RUN ターゲット
    const isBillboardLit = nowMs < sim.billboardFlashedUntilMs;
    ctx.fillStyle = isBillboardLit ? "#facc15" : "#dc2626";
    ctx.beginPath();
    ctx.roundRect(124, 12, 152, 22, 5);
    ctx.fill();
    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = isBillboardLit ? "#0f172a" : "#ffffff";
    ctx.font = "900 9.5px sans-serif";
    ctx.fillText("🎯 看板直撃 ★ HOME RUN", 200, 23.5);

    // 右LED：打球速度スピードガン
    ctx.fillStyle = "#020617";
    ctx.beginPath();
    ctx.roundRect(282, 12, 102, 22, 5);
    ctx.fill();
    ctx.strokeStyle = sim.lastExitVelocityKmh >= 155 ? "#f59e0b" : "#334155";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle =
      sim.lastExitVelocityKmh >= 155 ? "#fbbf24" : "#34d399";
    ctx.font = "900 9.5px sans-serif";
    const exitGunLabel =
      sim.lastExitVelocityKmh > 0
        ? `打球 ${sim.lastExitVelocityKmh} km/h`
        : "打球 --- km/h";
    ctx.fillText(exitGunLabel, 333, 23.5);

    // 3. グラウンド土台（ファウルゾーン濃緑）
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(10, 46, BOARD_WIDTH - 20, BOARD_HEIGHT - 56, 14);
    ctx.clip();

    ctx.fillStyle = "#14532d";
    ctx.fillRect(10, 46, BOARD_WIDTH - 20, BOARD_HEIGHT - 56);

    // 左右ファウルコーナーの丸ボタン専用台座リング（外枠から十分内側に配置）
    if (!propsRef.current.isGameOver) {
      ctx.fillStyle = "#0d3b20";
      ctx.strokeStyle = "#166534";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(62, 374, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(338, 374, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // フェアグラウンド扇形（芝生刈り込みストライプ：単色2トーン交互）
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(HOME_X, HOME_Y);
    ctx.lineTo(22, 210);
    ctx.arc(
      FENCE_ARC_CX,
      FENCE_ARC_CY,
      FENCE_ARC_RADIUS,
      (-171.7 * Math.PI) / 180,
      (-8.3 * Math.PI) / 180,
      false
    );
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = "#15803d";
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    const stripeRadii = [320, 276, 232, 188, 144];
    stripeRadii.forEach((r, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? "#166534" : "#15803d";
      ctx.beginPath();
      ctx.arc(HOME_X, HOME_Y, r, Math.PI, Math.PI * 2);
      ctx.lineTo(HOME_X, HOME_Y);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();

    // 4. 内野アンツーカ（土エリア）＆ダイヤモンド芝
    ctx.fillStyle = "#c2783c";
    ctx.beginPath();
    ctx.arc(HOME_X, 294, 98, Math.PI * 1.04, Math.PI * 1.96);
    ctx.lineTo(HOME_X + 94, 296);
    ctx.lineTo(HOME_X, HOME_Y + 18);
    ctx.lineTo(HOME_X - 94, 296);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#15803d";
    ctx.beginPath();
    ctx.moveTo(HOME_X, HOME_Y - 18);
    ctx.lineTo(BASE_COORDS.first.x - 14, BASE_COORDS.first.y);
    ctx.lineTo(BASE_COORDS.second.x, BASE_COORDS.second.y + 14);
    ctx.lineTo(BASE_COORDS.third.x + 14, BASE_COORDS.third.y);
    ctx.closePath();
    ctx.fill();

    // 本塁サークル＆ピッチャーマウンド（土）
    ctx.fillStyle = "#c2783c";
    ctx.beginPath();
    ctx.arc(HOME_X, HOME_Y - 2, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(MOUND_X, MOUND_Y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9a5b25";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 投球レーン溝ガイド
    ctx.fillStyle = "#14532d";
    ctx.fillRect(HOME_X - 7, MOUND_Y + 14, 14, TRAPDOOR_Y - MOUND_Y - 12);

    // 5. 「消える魔球」トラップドア
    if (sim.trapdoorOpen) {
      ctx.fillStyle = "#020617";
      ctx.beginPath();
      ctx.roundRect(HOME_X - 15, TRAPDOOR_Y - 10, 30, 20, 4);
      ctx.fill();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;
      ctx.strokeRect(HOME_X - 12, TRAPDOOR_Y - 8, 24, 16);
    }

    // 6. 白チョークライン（ファウルライン・バッターボックス）
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(HOME_X, HOME_Y);
    ctx.lineTo(22, 210);
    ctx.moveTo(HOME_X, HOME_Y);
    ctx.lineTo(378, 210);
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.strokeRect(HOME_X - 24, HOME_Y - 16, 13, 24);
    ctx.strokeRect(HOME_X + 11, HOME_Y - 16, 13, 24);

    // ホームベース（五角形）
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(HOME_X - 6.5, HOME_Y - 6);
    ctx.lineTo(HOME_X + 6.5, HOME_Y - 6);
    ctx.lineTo(HOME_X + 6.5, HOME_Y);
    ctx.lineTo(HOME_X, HOME_Y + 6.5);
    ctx.lineTo(HOME_X - 6.5, HOME_Y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ピッチャープレート
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(MOUND_X - 7, MOUND_Y - 2, 14, 4);

    // 7. 1塁・2塁・3塁ベース＆走者表示
    const baseEntries: Array<{
      key: keyof RunnerBases;
      x: number;
      y: number;
    }> = [
      { key: "first", x: BASE_COORDS.first.x, y: BASE_COORDS.first.y },
      { key: "second", x: BASE_COORDS.second.x, y: BASE_COORDS.second.y },
      { key: "third", x: BASE_COORDS.third.x, y: BASE_COORDS.third.y },
    ];

    for (const b of baseEntries) {
      const occupied = curBases[b.key];
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = occupied ? "#fbbf24" : "#ffffff";
      ctx.strokeStyle = occupied ? "#b45309" : "#334155";
      ctx.lineWidth = 1.5;
      ctx.fillRect(-6.5, -6.5, 13, 13);
      ctx.strokeRect(-6.5, -6.5, 13, 13);
      ctx.restore();

      if (occupied) {
        ctx.fillStyle = "#d97706";
        ctx.beginPath();
        ctx.arc(b.x, b.y - 13, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("走", b.x, b.y - 12.5);
      }
    }

    // 8. 外野フェンス 7つの判定ポケット
    const pocketInnerR = FENCE_ARC_RADIUS - 11;
    const pocketOuterR = FENCE_ARC_RADIUS + 7;
    for (const pocket of FENCE_POCKETS) {
      const startRad = (pocket.startDeg * Math.PI) / 180;
      const endRad = (pocket.endDeg * Math.PI) / 180;

      ctx.fillStyle = pocket.colorHex;
      ctx.beginPath();
      ctx.arc(
        FENCE_ARC_CX,
        FENCE_ARC_CY,
        pocketOuterR,
        startRad,
        endRad,
        false
      );
      ctx.arc(
        FENCE_ARC_CX,
        FENCE_ARC_CY,
        pocketInnerR,
        endRad,
        startRad,
        true
      );
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.3;
      ctx.stroke();

      const midRad =
        ((pocket.startDeg + pocket.endDeg) * 0.5 * Math.PI) / 180;
      const labelR = (pocketInnerR + pocketOuterR) * 0.5;
      const lx = FENCE_ARC_CX + labelR * Math.cos(midRad);
      const ly = FENCE_ARC_CY + labelR * Math.sin(midRad);

      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(midRad + Math.PI / 2);
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 9.5px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pocket.label, 0, 0.5);
      ctx.restore();
    }

    // 左右ファウルポール
    const poles = [
      { x: 22, y: 210 },
      { x: 378, y: 210 },
    ];
    for (const pole of poles) {
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(pole.x, pole.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 9. 野手ポケット（OUT / 併殺トラップ穴 ＋ 守備人形バッジ）
    for (const trap of FIELDER_TRAPS) {
      const isDpActive = trap.canDoublePlay && curBases.first && outs < 2;
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(trap.x, trap.y, trap.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isDpActive ? "#f59e0b" : "#ef4444";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = isDpActive ? "#fde68a" : "#fca5a5";
      ctx.font = "900 7.5px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(isDpActive ? "併殺" : "OUT", trap.x, trap.y + 0.5);

      const fy = trap.y - trap.radius - 6;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(trap.x, fy, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.fillStyle = "#0f172a";
      ctx.font = "900 7.5px sans-serif";
      ctx.fillText(trap.shortLabel, trap.x, fy + 0.5);
    }

    // 10. 銀色の反射ピン
    BOARD_PINS.forEach((pin, idx) => {
      const isFlashed =
        sim.flashedPinIdx === idx && nowMs < sim.flashedPinUntilMs;
      ctx.fillStyle = isFlashed
        ? "#fbbf24"
        : pin.isPitcherPin
        ? "#38bdf8"
        : "#e2e8f0";
      ctx.beginPath();
      ctx.arc(pin.x, pin.y, pin.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.arc(pin.x, pin.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });

    // 11. 初心者にも一目で分かるミートタイミング枠（人間打者ターン時）
    if (humanBatting && (sim.phase === "idle" || (sim.phase === "pitching" && !sim.hasSwung))) {
      const idealY = HOME_Y - 6;
      const inHitWindow =
        sim.phase === "pitching" &&
        !sim.ballVanished &&
        Math.abs(sim.ballY - idealY) <= 18;

      ctx.strokeStyle = inHitWindow ? "#facc15" : "#e2e8f0";
      ctx.lineWidth = inHitWindow ? 2.4 : 1.3;
      ctx.setLineDash(inHitWindow ? [] : [3, 3]);
      ctx.strokeRect(HOME_X - 15, HOME_Y - 17, 30, 22);
      ctx.setLineDash([]);

      if (inHitWindow) {
        // ボールがミート枠に入った瞬間に「今だ！」サイン点灯！
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.roundRect(HOME_X - 20, HOME_Y + 9, 40, 14, 4);
        ctx.fill();
        ctx.fillStyle = "#0f172a";
        ctx.font = "900 8.5px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("今だ！", HOME_X, HOME_Y + 16.5);
      }
    }

    // 12. 打者フィギュア＆可動バット（素振りアニメーション対応！）
    const activeBats =
      sim.phase === "idle" ? propsRef.current.batterBats : sim.batterBats;
    const activeStance =
      sim.phase === "idle" ? propsRef.current.stance : sim.activeStance;
    const isRightBatter = activeBats === "R";
    const batterX = isRightBatter ? HOME_X - 18 : HOME_X + 18;
    const batterY = HOME_Y - 4;

    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.arc(batterX, batterY, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    const pivotX = isRightBatter ? HOME_X - 13 : HOME_X + 13;
    const pivotY = HOME_Y + 2;
    ctx.translate(pivotX, pivotY);

    const isSwingingVisual = sim.hasSwung || sim.isPracticeSwinging;
    let batAngleRad = 0;
    if (activeStance === "bunt") {
      const buntSlide = isSwingingVisual
        ? Math.min(1, sim.swingAnimProgress * 2.5)
        : 0;
      ctx.translate(0, -6 - buntSlide * 4);
      batAngleRad = isRightBatter ? 0.04 : Math.PI - 0.04;
    } else {
      const restAngle = isRightBatter ? 2.25 : Math.PI - 2.25;
      const finishAngle = isRightBatter ? -1.15 : Math.PI + 1.15;
      let t = 0;
      if (sim.isPracticeSwinging) {
        // 素振り時は振り抜いてから構えへスッと戻る
        t =
          sim.swingAnimProgress <= 0.65
            ? sim.swingAnimProgress / 0.65
            : Math.max(0, 1 - (sim.swingAnimProgress - 0.65) / 0.35);
      } else if (sim.hasSwung) {
        t = Math.min(1, sim.swingAnimProgress);
      }
      const eased = 1 - Math.pow(1 - t, 3);
      batAngleRad = restAngle + (finishAngle - restAngle) * eased;
    }

    ctx.rotate(batAngleRad);
    ctx.fillStyle = activeStance === "power" ? "#f59e0b" : "#fde68a";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(0, -2.8, 30, 5.6, 2.8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, -2.2, 8, 4.4);
    ctx.restore();

    // 13. ボール軌跡（火の玉ストレート時は赤系ソリッドドット！）＆白球
    if (sim.ballVisible && !sim.ballVanished) {
      for (let i = 0; i < sim.trail.length; i++) {
        const pt = sim.trail[i];
        if (!pt) continue;
        const r = 1.6 + (i / Math.max(1, sim.trail.length)) * 2.3;
        ctx.fillStyle = sim.isSweetHit
          ? "#fde047"
          : sim.isFireball && sim.phase === "pitching"
          ? "#fca5a5"
          : "#bae6fd";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y - pt.z * 0.72, r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (sim.ballZ > 1) {
        ctx.fillStyle = "#052e16";
        ctx.beginPath();
        const shadowR = Math.max(2.5, 5 - sim.ballZ * 0.03);
        ctx.ellipse(
          sim.ballX,
          sim.ballY,
          shadowR * 1.2,
          shadowR * 0.75,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      const drawY = sim.ballY - sim.ballZ * 0.72;
      const ballRadius = 5.2 * (1 + Math.min(0.65, sim.ballZ / 85));

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(sim.ballX, drawY, ballRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle =
        sim.isFireball && sim.phase === "pitching" ? "#dc2626" : "#0f172a";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(
        sim.ballX - ballRadius * 0.3,
        drawY,
        ballRadius * 0.55,
        -0.7,
        0.7
      );
      ctx.stroke();
    }

    // 14. ホームラン紙吹雪
    for (const c of sim.confetti) {
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.w, c.h);
    }

    ctx.restore(); // グラウンドクリップ解除

    // 15. 判定ポップアップバナー
    if (curBanner) {
      const toneColors: Record<
        BaseballBoardCanvasProps["bannerTone"],
        { bg: string; border: string; text: string }
      > = {
        hr: { bg: "#dc2626", border: "#fde047", text: "#ffffff" },
        hit: { bg: "#2563eb", border: "#93c5fd", text: "#ffffff" },
        walk: { bg: "#0d9488", border: "#99f6e4", text: "#ffffff" },
        magic: { bg: "#0f172a", border: "#f59e0b", text: "#fde68a" },
        out: { bg: "#0f172a", border: "#ef4444", text: "#ffffff" },
        neutral: { bg: "#0f172a", border: "#94a3b8", text: "#f8fafc" },
      };
      const style = toneColors[curBannerTone];
      const boxW = Math.min(
        BOARD_WIDTH - 44,
        Math.max(176, curBanner.length * 14 + 34)
      );
      const boxX = (BOARD_WIDTH - boxW) / 2;
      const boxY = 72;

      ctx.fillStyle = style.bg;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, 32, 10);
      ctx.fill();
      ctx.strokeStyle = style.border;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.fillStyle = style.text;
      ctx.font = "900 12.5px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(curBanner, BOARD_WIDTH / 2, boxY + 16.5, boxW - 18);
    }

    ctx.restore();
  }, []);

  const spawnCelebrationConfetti = useCallback((count = 28) => {
    const pieces: ConfettiPiece[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
      const speed = 55 + Math.random() * 120;
      pieces.push({
        x: BOARD_WIDTH / 2,
        y: 112,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 35,
        w: 6,
        h: 4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? "#f59e0b",
      });
    }
    simRef.current.confetti = pieces;
  }, []);

  const beginResolving = useCallback(
    (
      partial: {
        outcome: PlayOutcomeCode;
        detailLabel: string;
        usedVanishPitch: boolean;
      },
      celebrateHr = false
    ) => {
      const sim = simRef.current;
      if (sim.phase === "resolving") return;

      if (sim.onlineReplay.enabled && sim.onlineReplay.authoritativeResult) {
        const auth = sim.onlineReplay.authoritativeResult;
        const isHr = auth.outcome === "homerun";
        sim.lastExitVelocityKmh = auth.exitVelocityKmh;
        sim.pendingResult = {
          outcome: auth.outcome,
          detailLabel: auth.detailLabel,
          usedVanishPitch: auth.usedVanishPitch,
          pitchKmh: auth.pitchKmh,
          exitVelocityKmh: auth.exitVelocityKmh,
        };
        sim.resolveTimerSec = isHr ? 0.98 : 0.52;
        if (isHr) {
          spawnCelebrationConfetti(
            auth.detailLabel.includes("看板直撃") ? 42 : 26
          );
        }
        syncPhase("resolving");
        const onArrive = sim.onlineReplay.onArriveResult;
        sim.onlineReplay.onArriveResult = null;
        onArrive?.();
        return;
      }

      const replayData: OnlinePlayReplayData = {
        didSwing: sim.hasSwung,
        swingTriggerY: sim.recordedSwingTriggerY,
        stance: sim.activeStance,
        whiffDetail: sim.whiffDetail || undefined,
        contact: sim.recordedContact,
      };

      const fullResult: ResolvedBoardPlay = {
        ...partial,
        pitchKmh: sim.lastPitchKmh,
        exitVelocityKmh: sim.lastExitVelocityKmh,
        replayData,
      };
      sim.pendingResult = fullResult;
      sim.resolveTimerSec = celebrateHr ? 0.98 : 0.52;
      if (celebrateHr) {
        spawnCelebrationConfetti(
          partial.detailLabel.includes("看板直撃") ? 42 : 26
        );
      }
      syncPhase("resolving");
      propsRef.current.onPlayResolved(fullResult);
    },
    [spawnCelebrationConfetti, syncPhase]
  );

  const executeSwingOnCurrentPitch = useCallback(
    (overrideStance?: BatterStance): boolean => {
      const sim = simRef.current;
      if (sim.phase !== "pitching" || sim.hasSwung || sim.onlineReplay.enabled) {
        return false;
      }

      const chosenStance = overrideStance ?? propsRef.current.stance;
      sim.activeStance = chosenStance;
      sim.hasSwung = true;
      sim.isPracticeSwinging = false;
      sim.swingAnimProgress = 0.05;
      sim.recordedSwingTriggerY = sim.ballY;
      sim.recordedContact = null;

      // 消える魔球で既に消えている・または直前で消えた場合は空振り！
      if (sim.pitchSpec.type === "vanish" && sim.ballY >= TRAPDOOR_Y - 10) {
        sim.trapdoorOpen = true;
        sim.ballVanished = true;
        sim.whiffDetail = "消える魔球で空振り！！";
        playSwingWhoosh(propsRef.current.soundEnabled);
        return true;
      }

      const idealY = HOME_Y - 6;
      const deltaY = sim.ballY - idealY;
      const absDeltaY = Math.abs(deltaY);
      // リアルなミート幅：強振は空振りリスクあり、ミートは広め
      const speedForgiveness = sim.isFireball ? 2.5 : 0;
      const maxReachY =
        (chosenStance === "bunt"
          ? 21
          : chosenStance === "contact"
          ? 19.5
          : 15.0) + speedForgiveness;

      // 横方向のバットリーチ：外角へ逃げるカーブ・シュートに強振で手を出すと空振り！
      const maxLateral =
        chosenStance === "power"
          ? 20.5
          : chosenStance === "bunt"
          ? 22.0
          : 24.5;

      const lateralDist = Math.abs(sim.ballX - HOME_X);
      if (
        absDeltaY > maxReachY ||
        lateralDist > maxLateral ||
        sim.ballVanished
      ) {
        if (sim.ballVanished) {
          sim.whiffDetail = "消える魔球で空振り！！";
        } else if (lateralDist > maxLateral) {
          sim.whiffDetail = "変化球が外れた！空振りストライク！";
        } else if (deltaY < 0) {
          sim.whiffDetail = "泳いだ！空振りストライク！";
        } else {
          sim.whiffDetail = "振り遅れ！空振りストライク！";
        }
        playSwingWhoosh(propsRef.current.soundEnabled);
        return true;
      }

      // バットに当たった！打球物理モードへ移行
      sim.elapsedSec = 0;
      sim.trail = [];
      syncPhase("batted");

      const isRightBatter = sim.batterBats === "R";

      if (chosenStance === "bunt") {
        const buntAngleOffset = (Math.random() - 0.5) * 1.15;
        const angleRad = -Math.PI / 2 + buntAngleOffset;
        const speed = 72 + Math.random() * 48;
        sim.vx = Math.cos(angleRad) * speed;
        sim.vy = Math.sin(angleRad) * speed;
        sim.vz = 0;
        sim.ballZ = 0;
        sim.isBuntBall = true;
        sim.isSweetHit = false;
        sim.lastExitVelocityKmh = Math.round(58 + Math.random() * 20);
        sim.recordedContact = {
          ballX: sim.ballX,
          ballY: sim.ballY,
          vx: sim.vx,
          vy: sim.vy,
          vz: sim.vz,
          peakZ: 0,
          exitVelocityKmh: sim.lastExitVelocityKmh,
        };
        playBatContact(propsRef.current.soundEnabled, "bunt");
        return true;
      }

      sim.isBuntBall = false;
      const normalizedTiming = Math.max(
        -1.15,
        Math.min(1.15, deltaY / maxReachY)
      );
      const pullSign = isRightBatter ? 1 : -1;
      const courseInfluence = (sim.ballX - HOME_X) * 0.012;
      const jitter = (Math.random() - 0.5) * 0.14;
      const sprayOffsetRad =
        normalizedTiming * 0.92 * pullSign + courseInfluence + jitter;
      const launchAngleRad = -Math.PI / 2 + sprayOffsetRad;

      const timingQuality = Math.max(0, 1 - absDeltaY / maxReachY);
      const isSweet =
        timingQuality >= (chosenStance === "power" ? 0.66 : 0.74) &&
        Math.abs(sprayOffsetRad) <= 0.76;
      sim.isSweetHit = isSweet;

      // 打球速度（km/h）算出
      const rawExitKmh =
        (chosenStance === "power" ? 112 : 102) +
        timingQuality * (chosenStance === "power" ? 50 : 38) +
        (sim.lastPitchKmh - 110) * 0.28 +
        (Math.random() - 0.5) * 6;
      sim.lastExitVelocityKmh = Math.max(
        78,
        Math.min(188, Math.round(rawExitKmh))
      );

      if (Math.abs(sprayOffsetRad) > 0.82) {
        const foulSpeed = 230 + Math.random() * 60;
        sim.vx = Math.cos(launchAngleRad) * foulSpeed;
        sim.vy = Math.sin(launchAngleRad) * foulSpeed;
        sim.vz = 35;
        sim.recordedContact = {
          ballX: sim.ballX,
          ballY: sim.ballY,
          vx: sim.vx,
          vy: sim.vy,
          vz: sim.vz,
          peakZ: 0,
          exitVelocityKmh: sim.lastExitVelocityKmh,
        };
        playBatContact(propsRef.current.soundEnabled, "foul");
        return true;
      }

      const carryMul = sim.carryMultiplier;
      if (chosenStance === "power") {
        const baseSpeed =
          (isSweet ? 275 + timingQuality * 75 : 190 + timingQuality * 65) *
          carryMul;
        sim.vx = Math.cos(launchAngleRad) * baseSpeed;
        sim.vy = Math.sin(launchAngleRad) * baseSpeed;
        sim.vz = isSweet
          ? (122 + Math.random() * 26) * Math.min(1.12, carryMul)
          : Math.random() < 0.55
          ? 82 + Math.random() * 24
          : 18;
      } else {
        const baseSpeed =
          (isSweet ? 258 + timingQuality * 58 : 195 + timingQuality * 55) *
          carryMul;
        sim.vx = Math.cos(launchAngleRad) * baseSpeed;
        sim.vy = Math.sin(launchAngleRad) * baseSpeed;
        sim.vz =
          isSweet && Math.random() < 0.45
            ? (116 + Math.random() * 18) * Math.min(1.1, carryMul)
            : isSweet
            ? 44 + Math.random() * 28
            : 12;
      }

      sim.recordedContact = {
        ballX: sim.ballX,
        ballY: sim.ballY,
        vx: sim.vx,
        vy: sim.vy,
        vz: sim.vz,
        peakZ: 0,
        exitVelocityKmh: sim.lastExitVelocityKmh,
      };

      playBatContact(
        propsRef.current.soundEnabled,
        isSweet ? "sweet" : "normal"
      );
      return true;
    },
    [syncPhase]
  );

  const stepSimulation = useCallback(
    (dt: number, nowMs: number) => {
      const sim = simRef.current;

      // 素振りアニメーション進行
      if (sim.isPracticeSwinging) {
        sim.swingAnimProgress += dt * 4.2;
        if (sim.swingAnimProgress >= 1) {
          sim.isPracticeSwinging = false;
          sim.swingAnimProgress = 0;
        }
      }

      // 実スイングアニメーション進行
      if (sim.hasSwung && sim.swingAnimProgress < 1) {
        sim.swingAnimProgress = Math.min(1, sim.swingAnimProgress + dt * 7.5);
      }

      // 紙吹雪更新
      if (sim.confetti.length > 0) {
        for (const c of sim.confetti) {
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.vy += 180 * dt;
        }
      }

      if (sim.phase === "resolving") {
        sim.resolveTimerSec -= dt;
        if (sim.resolveTimerSec <= 0) {
          const finishCallback = sim.onlineReplay.onReplayFinished;
          sim.onlineReplay = {
            enabled: false,
            replayData: null,
            authoritativeResult: null,
            onArriveResult: null,
            onReplayFinished: null,
          };
          sim.confetti = [];
          sim.trail = [];
          sim.trapdoorOpen = false;
          sim.ballVanished = false;
          sim.ballVisible = true;
          sim.ballX = MOUND_X;
          sim.ballY = MOUND_Y;
          sim.ballZ = 0;
          sim.hasSwung = false;
          sim.swingAnimProgress = 0;
          syncPhase("idle");
          finishCallback?.();
        }
        return;
      }

      if (sim.phase === "pitching") {
        const meta = PITCH_TYPE_META[sim.pitchSpec.type];
        // ホームベース上で変化球の変化量が100%になるよう基準距離を設定し、捕手後方(HOME_Y + 36)まで通過させて振り遅れ空振りも確実に判定！
        const plateDist = HOME_Y - MOUND_Y;
        const prevY = sim.ballY;
        sim.ballY += sim.pitchSpeedPxPerSec * dt;
        sim.pitchProgress = Math.max(
          0,
          Math.min(1.3, (sim.ballY - MOUND_Y) / plateDist)
        );

        const handSign = sim.batterBats === "R" ? 1 : -1;
        const curveBend =
          meta.curveFactor * handSign * Math.pow(sim.pitchProgress, 2.0) * 18;
        sim.ballX =
          sim.pitchStartX +
          (sim.pitchTargetX - sim.pitchStartX) * sim.pitchProgress +
          curveBend;

        // 消える魔球のトラップ発動
        if (
          sim.pitchSpec.type === "vanish" &&
          !sim.ballVanished &&
          sim.ballY >= TRAPDOOR_Y
        ) {
          sim.trapdoorOpen = true;
          sim.ballVanished = true;
          playVanishTrap(propsRef.current.soundEnabled);
        }

        if (!sim.ballVanished) {
          sim.trail.push({ x: sim.ballX, y: sim.ballY, z: 0 });
          if (sim.trail.length > 6) sim.trail.shift();
        }

        // オンライン通信リプレイ時の相手打者スイング再現
        if (
          sim.onlineReplay.enabled &&
          sim.onlineReplay.replayData &&
          sim.onlineReplay.replayData.didSwing &&
          !sim.hasSwung &&
          sim.ballY >= sim.onlineReplay.replayData.swingTriggerY
        ) {
          const rep = sim.onlineReplay.replayData;
          sim.hasSwung = true;
          sim.isPracticeSwinging = false;
          sim.swingAnimProgress = 0.05;
          sim.activeStance = rep.stance;

          if (rep.contact) {
            sim.ballX = rep.contact.ballX;
            sim.ballY = rep.contact.ballY;
            sim.vx = rep.contact.vx;
            sim.vy = rep.contact.vy;
            sim.vz = rep.contact.vz;
            sim.ballZ = 0;
            sim.isBuntBall = rep.stance === "bunt";
            sim.isSweetHit = rep.contact.exitVelocityKmh >= 135;
            sim.lastExitVelocityKmh = rep.contact.exitVelocityKmh;
            sim.elapsedSec = 0;
            sim.trail = [];
            const authOutcome = sim.onlineReplay.authoritativeResult?.outcome;
            playBatContact(
              propsRef.current.soundEnabled,
              sim.isBuntBall
                ? "bunt"
                : authOutcome === "foul"
                ? "foul"
                : sim.isSweetHit
                ? "sweet"
                : "normal"
            );
            syncPhase("batted");
            return;
          } else {
            if (sim.pitchSpec.type === "vanish" && sim.ballY >= TRAPDOOR_Y - 10) {
              sim.trapdoorOpen = true;
              sim.ballVanished = true;
            }
            sim.whiffDetail = rep.whiffDetail || "空振りストライク！";
            playSwingWhoosh(propsRef.current.soundEnabled);
          }
        }

        // CPU打者の自動スイング判定
        if (
          !sim.onlineReplay.enabled &&
          sim.cpuPlan.enabled &&
          sim.cpuPlan.willSwing &&
          !sim.hasSwung &&
          prevY < sim.cpuPlan.targetHitY &&
          sim.ballY >= sim.cpuPlan.targetHitY
        ) {
          executeSwingOnCurrentPitch(sim.cpuPlan.stance);
          if ((sim.phase as BoardActionPhase) !== "pitching") return;
        }

        // 捕手ミット・バックネット到達（HOME_Y + 36 まで余白を持たせることで剛速球への振り遅れ空振りがリアルに発生！）
        if (sim.ballY >= HOME_Y + 36) {
          const usedVanish = sim.pitchSpec.type === "vanish";
          if (sim.hasSwung) {
            beginResolving({
              outcome: "swinging_strike",
              detailLabel:
                sim.whiffDetail ||
                (usedVanish ? "消える魔球で空振り！" : "空振りストライク！"),
              usedVanishPitch: usedVanish,
            });
          } else if (usedVanish) {
            beginResolving({
              outcome: "ball",
              detailLabel: "消える魔球を見極めた！ボール！",
              usedVanishPitch: true,
            });
          } else {
            // ホームベース通過時点(progress = 1.0)の横位置でストライク/ボール判定
            const plateX =
              sim.pitchTargetX + meta.curveFactor * handSign * 18;
            const inZone = Math.abs(plateX - HOME_X) <= 16.5;
            const isBallCall =
              !inZone ||
              (sim.pitchSpec.course !== "middle" && Math.random() < 0.28);
            beginResolving({
              outcome: isBallCall ? "ball" : "called_strike",
              detailLabel: isBallCall ? "ボール！" : "見逃しストライク！",
              usedVanishPitch: false,
            });
          }
        }
        return;
      }

      if (sim.phase === "batted") {
        sim.elapsedSec += dt;

        const subSteps = 3;
        const subDt = dt / subSteps;

        for (let s = 0; s < subSteps; s++) {
          sim.ballX += sim.vx * subDt;
          sim.ballY += sim.vy * subDt;

          if (sim.ballZ > 0 || sim.vz > 0) {
            sim.ballZ += sim.vz * subDt;
            sim.vz -= 165 * subDt;
            if (sim.ballZ <= 0) {
              sim.ballZ = 0;
              for (const trap of FIELDER_TRAPS) {
                const dist = Math.hypot(sim.ballX - trap.x, sim.ballY - trap.y);
                const flyCatchRadius = trap.isOutfield ? 21 : 15;
                if (
                  dist <= flyCatchRadius &&
                  isFairTerritory(sim.ballX, sim.ballY)
                ) {
                  const canSacFly =
                    trap.isOutfield &&
                    propsRef.current.outs < 2 &&
                    propsRef.current.bases.third;
                  beginResolving({
                    outcome: canSacFly ? "sac_fly" : "fly_out",
                    detailLabel: trap.flyOutLabel,
                    usedVanishPitch: false,
                  });
                  return;
                }
              }

              if (Math.abs(sim.vz) > 28) {
                sim.vz = Math.abs(sim.vz) * 0.28;
                sim.vx *= 0.78;
                sim.vy *= 0.78;
              } else {
                sim.vz = 0;
              }
            }
          } else {
            const friction = Math.pow(sim.isBuntBall ? 0.26 : 0.58, subDt);
            sim.vx *= friction;
            sim.vy *= friction;
          }

          // 1) ファウル判定
          if (sim.ballY > 210 && !isFairTerritory(sim.ballX, sim.ballY)) {
            const isThreeBuntOut =
              sim.isBuntBall && propsRef.current.strikes >= 2;
            beginResolving({
              outcome: isThreeBuntOut ? "three_bunt_out" : "foul",
              detailLabel: isThreeBuntOut
                ? "スリーバント失敗！アウト！"
                : "ファウルボール！",
              usedVanishPitch: false,
            });
            return;
          }

          // 2) 外野フェンス到達判定
          if (sim.ballY <= 236) {
            const dxFence = sim.ballX - FENCE_ARC_CX;
            const dyFence = sim.ballY - FENCE_ARC_CY;
            const distFence = Math.hypot(dxFence, dyFence);
            if (distFence >= FENCE_ARC_RADIUS - 7) {
              const angleDeg = (Math.atan2(dyFence, dxFence) * 180) / Math.PI;
              const pocket = resolveFencePocketAtAngle(angleDeg);
              if (!pocket) {
                const isThreeBuntOut =
                  sim.isBuntBall && propsRef.current.strikes >= 2;
                beginResolving({
                  outcome: isThreeBuntOut ? "three_bunt_out" : "foul",
                  detailLabel: "ポール際ファウル！",
                  usedVanishPitch: false,
                });
                return;
              }

              // 空中柵越えスタンドイン！（センター中央なら「看板直撃弾」ボーナス！）
              if (sim.ballZ >= 9) {
                const isCenterBillboard =
                  angleDeg >= -100 && angleDeg <= -80 && sim.ballZ >= 12;
                if (isCenterBillboard) {
                  sim.billboardFlashedUntilMs = nowMs + 1400;
                }
                const standDirection = isCenterBillboard
                  ? `看板直撃！打球${sim.lastExitVelocityKmh}km/hの特大本塁打！！`
                  : angleDeg < -118
                  ? "レフトスタンドへ柵越え本塁打！！"
                  : angleDeg > -62
                  ? "ライトスタンドへ柵越え本塁打！！"
                  : "バックスクリーンへ特大本塁打！！";
                beginResolving(
                  {
                    outcome: "homerun",
                    detailLabel: standDirection,
                    usedVanishPitch: false,
                  },
                  true
                );
                return;
              }

              // 地上ゴロ・ワンバウンドで外野ポケットにスポッ！
              const outcomeMap: Record<typeof pocket.kind, PlayOutcomeCode> = {
                "1b": "single",
                "2b": "double",
                "3b": "triple",
                hr: "homerun",
                out: "ground_out",
              };
              const mapped = outcomeMap[pocket.kind];
              beginResolving(
                {
                  outcome: mapped,
                  detailLabel: pocket.announceLabel,
                  usedVanishPitch: false,
                },
                mapped === "homerun"
              );
              return;
            }
          }

          // 3) 地上転がり中のピン反射 ＆ 野手OUTポケット吸い込み
          if (sim.ballZ < 5) {
            for (let pIdx = 0; pIdx < BOARD_PINS.length; pIdx++) {
              const pin = BOARD_PINS[pIdx];
              if (!pin) continue;
              const dx = sim.ballX - pin.x;
              const dy = sim.ballY - pin.y;
              const dist = Math.hypot(dx, dy);
              const minDist = pin.radius + 5.2;
              if (dist > 0.001 && dist < minDist) {
                const nx = dx / dist;
                const ny = dy / dist;
                sim.ballX = pin.x + nx * (minDist + 0.5);
                sim.ballY = pin.y + ny * (minDist + 0.5);
                const dot = sim.vx * nx + sim.vy * ny;
                if (dot < 0) {
                  const restitution = 0.78;
                  sim.vx =
                    (sim.vx - 2 * dot * nx) * restitution +
                    (Math.random() - 0.5) * 16;
                  sim.vy = (sim.vy - 2 * dot * ny) * restitution;
                  sim.flashedPinIdx = pIdx;
                  sim.flashedPinUntilMs = nowMs + 130;
                  playPinRicochet(propsRef.current.soundEnabled);
                }
              }
            }

            for (const trap of FIELDER_TRAPS) {
              const dist = Math.hypot(sim.ballX - trap.x, sim.ballY - trap.y);
              if (dist <= trap.radius - 0.5) {
                sim.ballX = trap.x;
                sim.ballY = trap.y;
                const isDoublePlay =
                  trap.canDoublePlay &&
                  propsRef.current.bases.first &&
                  propsRef.current.outs < 2;
                beginResolving({
                  outcome: isDoublePlay ? "double_play" : "ground_out",
                  detailLabel: isDoublePlay
                    ? "6-4-3 ダブルプレー！！"
                    : trap.groundOutLabel,
                  usedVanishPitch: false,
                });
                return;
              }
            }
          }
        }

        sim.trail.push({ x: sim.ballX, y: sim.ballY, z: sim.ballZ });
        if (sim.trail.length > 7) sim.trail.shift();

        const groundSpeed = Math.hypot(sim.vx, sim.vy);
        if ((sim.ballZ <= 0.5 && groundSpeed < 14) || sim.elapsedSec > 3.1) {
          if (!isFairTerritory(sim.ballX, sim.ballY)) {
            const isThreeBuntOut =
              sim.isBuntBall && propsRef.current.strikes >= 2;
            beginResolving({
              outcome: isThreeBuntOut ? "three_bunt_out" : "foul",
              detailLabel: "ファウルボール！",
              usedVanishPitch: false,
            });
            return;
          }

          if (sim.isBuntBall) {
            const hasRunnerToAdvance =
              (propsRef.current.bases.first ||
                propsRef.current.bases.second ||
                propsRef.current.bases.third) &&
              propsRef.current.outs < 2;
            const lineProximity = Math.abs(
              Math.abs(sim.ballX - HOME_X) - (HOME_Y - sim.ballY)
            );
            if (lineProximity < 26 && Math.random() < 0.45) {
              beginResolving({
                outcome: "single",
                detailLabel: "絶妙セーフティバント内野安打！！",
                usedVanishPitch: false,
              });
            } else if (hasRunnerToAdvance) {
              beginResolving({
                outcome: "sac_bunt",
                detailLabel: "送りバント成功！",
                usedVanishPitch: false,
              });
            } else {
              beginResolving({
                outcome: "ground_out",
                detailLabel: "ピッチャー前バントゴロ アウト！",
                usedVanishPitch: false,
              });
            }
            return;
          }

          if (sim.ballY < 225) {
            beginResolving({
              outcome: "single",
              detailLabel: "外野の間へポテンヒット！",
              usedVanishPitch: false,
            });
          } else {
            const isInfieldHit = Math.random() < 0.35;
            beginResolving({
              outcome: isInfieldHit ? "single" : "ground_out",
              detailLabel: isInfieldHit
                ? "全力疾走！内野安打！！"
                : "ピッチャーゴロ アウト！",
              usedVanishPitch: false,
            });
          }
        }
      }
    },
    [beginResolving, executeSwingOnCurrentPitch, syncPhase]
  );

  const startAnimationLoop = useCallback(() => {
    if (rafIdRef.current !== null) return;
    lastFrameMsRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const tick = (nowMs: number) => {
      if (typeof document !== "undefined" && document.hidden) {
        rafIdRef.current = null;
        const prevReplay = simRef.current.onlineReplay;
        const wasActive = simRef.current.phase !== "idle";
        simRef.current = createInitialSimState(
          propsRef.current.batterBats,
          propsRef.current.stance
        );
        syncPhase("idle");
        if (prevReplay.enabled) {
          prevReplay.onArriveResult?.();
          prevReplay.onReplayFinished?.();
        } else if (wasActive) {
          propsRef.current.onVisibilityAbort?.();
        }
        return;
      }

      const rawDt = (nowMs - lastFrameMsRef.current) / 1000;
      lastFrameMsRef.current = nowMs;
      const dt = Math.min(0.04, Math.max(0.001, rawDt));

      stepSimulation(dt, nowMs);
      drawBoard();

      if (
        simRef.current.phase !== "idle" ||
        simRef.current.isPracticeSwinging
      ) {
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        rafIdRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, [drawBoard, stepSimulation, syncPhase]);

  // 投球前の「素振り（テストスイング）」発動
  const triggerPracticeSwing = useCallback(() => {
    const sim = simRef.current;
    if (sim.phase !== "idle") return;
    sim.batterBats = propsRef.current.batterBats;
    sim.activeStance = propsRef.current.stance;
    sim.isPracticeSwinging = true;
    sim.swingAnimProgress = 0.04;
    playSwingWhoosh(propsRef.current.soundEnabled);
    propsRef.current.onPracticeSwing?.();
    startAnimationLoop();
  }, [startAnimationLoop]);

  useImperativeHandle(
    ref,
    () => ({
      launchPitch: ({
        pitch,
        speedPreset,
        batterBats: targetBats,
        batterIsCpu,
        cpuDifficulty,
        strikes: curStrikes,
        outs: curOuts,
        bases: curBases,
      }) => {
        const sim = simRef.current;
        if (sim.phase !== "idle") return;

        const speedMetrics = resolveLaunchSpeedMetrics(pitch.type, speedPreset);
        const targetX = getCourseTargetX(pitch.course, targetBats);

        sim.ballVisible = true;
        sim.ballX = MOUND_X;
        sim.ballY = MOUND_Y + 8;
        sim.ballZ = 0;
        sim.vx = 0;
        sim.vy = 0;
        sim.vz = 0;
        sim.isSweetHit = false;
        sim.isBuntBall = false;
        sim.elapsedSec = 0;
        sim.pitchSpec = { ...pitch, speedPreset };
        sim.pitchSpeedPxPerSec = speedMetrics.effectiveSpeedPxPerSec;
        sim.carryMultiplier = speedMetrics.carryMultiplier;
        sim.isFireball = speedMetrics.isFireball;
        const prevKmh = sim.lastPitchKmh;
        sim.prevPitchKmh = prevKmh;
        sim.lastPitchKmh = speedMetrics.displayKmh;
        sim.lastExitVelocityKmh = 0;
        sim.whiffDetail = "";
        sim.pitchStartX = MOUND_X;
        sim.pitchTargetX = targetX;
        sim.pitchProgress = 0;
        sim.trapdoorOpen = false;
        sim.ballVanished = false;
        sim.batterBats = targetBats;
        sim.activeStance = propsRef.current.stance;
        sim.hasSwung = false;
        sim.isPracticeSwinging = false;
        sim.swingAnimProgress = 0;
        sim.recordedSwingTriggerY = HOME_Y - 6;
        sim.recordedContact = null;
        sim.onlineReplay = {
          enabled: false,
          replayData: null,
          authoritativeResult: null,
          onArriveResult: null,
          onReplayFinished: null,
        };
        sim.trail = [];
        sim.confetti = [];
        sim.pendingResult = null;

        if (batterIsCpu) {
          const plan = decideCpuBatterPlan({
            difficulty: cpuDifficulty,
            pitch: { ...pitch, speedPreset },
            currentPitchKmh: speedMetrics.displayKmh,
            prevPitchKmh: prevKmh,
            strikes: curStrikes,
            outs: curOuts,
            bases: curBases,
          });
          sim.cpuPlan = {
            enabled: true,
            ...plan,
          };
        } else {
          sim.cpuPlan = {
            enabled: false,
            willSwing: false,
            stance: "contact",
            targetHitY: HOME_Y - 6,
          };
        }

        playPitchSpring(propsRef.current.soundEnabled);
        syncPhase("pitching");
        startAnimationLoop();
      },
      playOnlineReplay: ({
        pitch,
        speedPreset,
        batterBats: targetBats,
        replayData,
        authoritativeResult,
        onArriveResult,
        onReplayFinished,
      }) => {
        const sim = simRef.current;
        if (sim.phase !== "idle") {
          stopLoop();
        }
        const speedMetrics = resolveLaunchSpeedMetrics(pitch.type, speedPreset);
        const targetX = getCourseTargetX(pitch.course, targetBats);

        sim.ballVisible = true;
        sim.ballX = MOUND_X;
        sim.ballY = MOUND_Y + 8;
        sim.ballZ = 0;
        sim.vx = 0;
        sim.vy = 0;
        sim.vz = 0;
        sim.isSweetHit = false;
        sim.isBuntBall = false;
        sim.elapsedSec = 0;
        sim.pitchSpec = { ...pitch, speedPreset };
        sim.pitchSpeedPxPerSec = speedMetrics.effectiveSpeedPxPerSec;
        sim.carryMultiplier = speedMetrics.carryMultiplier;
        sim.isFireball = speedMetrics.isFireball;
        sim.prevPitchKmh = sim.lastPitchKmh;
        sim.lastPitchKmh = authoritativeResult.pitchKmh || speedMetrics.displayKmh;
        sim.lastExitVelocityKmh = 0;
        sim.whiffDetail = replayData.whiffDetail || "";
        sim.pitchStartX = MOUND_X;
        sim.pitchTargetX = targetX;
        sim.pitchProgress = 0;
        sim.trapdoorOpen = false;
        sim.ballVanished = false;
        sim.batterBats = targetBats;
        sim.activeStance = replayData.stance;
        sim.hasSwung = false;
        sim.isPracticeSwinging = false;
        sim.swingAnimProgress = 0;
        sim.cpuPlan = {
          enabled: false,
          willSwing: false,
          stance: "contact",
          targetHitY: HOME_Y - 6,
        };
        sim.onlineReplay = {
          enabled: true,
          replayData,
          authoritativeResult,
          onArriveResult: onArriveResult ?? null,
          onReplayFinished: onReplayFinished ?? null,
        };
        sim.trail = [];
        sim.confetti = [];
        sim.pendingResult = null;

        playPitchSpring(propsRef.current.soundEnabled);
        syncPhase("pitching");
        startAnimationLoop();
      },
      triggerSwing: (overrideStance) => {
        const ok = executeSwingOnCurrentPitch(overrideStance);
        if (ok) {
          drawBoard();
        }
        return ok;
      },
      resetBoardIdle: () => {
        stopLoop();
        simRef.current = createInitialSimState(
          propsRef.current.batterBats,
          propsRef.current.stance
        );
        syncPhase("idle");
        drawBoard();
      },
    }),
    [drawBoard, executeSwingOnCurrentPitch, startAnimationLoop, stopLoop, syncPhase]
  );

  useEffect(() => {
    if (simRef.current.phase === "idle") {
      simRef.current.batterBats = batterBats;
      simRef.current.activeStance = stance;
    }
    drawBoard();
  }, [bases, outs, strikes, batterBats, stance, bannerText, bannerTone, drawBoard]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [fitSize, setFitSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const updateFit = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const maxW = Math.min(rect.width, 460);
      const maxH = rect.height;
      const scale = Math.min(maxW / BOARD_WIDTH, maxH / BOARD_HEIGHT);
      const nextW = Math.max(180, Math.floor(BOARD_WIDTH * scale));
      const nextH = Math.max(194, Math.floor(BOARD_HEIGHT * scale));
      setFitSize((prev) =>
        prev && prev.w === nextW && prev.h === nextH
          ? prev
          : { w: nextW, h: nextH }
      );
    };

    updateFit();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        updateFit();
      });
      ro.observe(el);
      return () => {
        ro.disconnect();
      };
    }
    window.addEventListener("resize", updateFit);
    return () => {
      window.removeEventListener("resize", updateFit);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopLoop();
    };
  }, [stopLoop]);

  const handleCanvasPointerDown = (
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (simRef.current.phase === "pitching" && isHumanBatterTurn && !isGameOver) {
      e.preventDefault();
      executeSwingOnCurrentPitch();
      drawBoard();
    }
  };

  // 盤面右下「🏏 打つ！」ボタン押下（投球中は実スイング、待機中は素振り！）
  const handleCornerSwingPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (isGameOver || !isHumanBatterTurn) return;
    if (simRef.current.phase === "pitching") {
      executeSwingOnCurrentPitch();
      drawBoard();
    } else if (simRef.current.phase === "idle") {
      triggerPracticeSwing();
    }
  };

  // 盤面左下「⚾ 投球」ボタン押下
  const handleCornerPitchPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      isGameOver ||
      simRef.current.phase !== "idle" ||
      onlinePitchButtonMode !== "normal"
    ) {
      return;
    }
    onPressBoardPitch();
  };

  const canPitchNow =
    !isGameOver && livePhaseUi === "idle" && onlinePitchButtonMode === "normal";
  const isPitchingLive = !isGameOver && livePhaseUi === "pitching";

  return (
    <div
      ref={stageRef}
      className="w-full h-full min-h-0 flex items-center justify-center select-none overflow-hidden"
    >
      <div
        style={
          fitSize
            ? { width: `${fitSize.w}px`, height: `${fitSize.h}px` }
            : { maxWidth: "100%", maxHeight: "100%", aspectRatio: "400 / 432" }
        }
        className="relative shrink-0"
      >
        <canvas
          ref={canvasRef}
          id="baseball-board-canvas"
          onPointerDown={handleCanvasPointerDown}
          className="w-full h-full rounded-2xl shadow-sm touch-manipulation block bg-[#0f172a]"
          aria-label="野球盤ゲーム盤面"
        />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            🕹️ ボード左下：丸型プッシュボタン「⚾ 投球」（全周均一な白枠線）
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {!isGameOver && (
          <button
            type="button"
            id="btn-board-corner-pitch"
            disabled={!canPitchNow}
            onPointerDown={handleCornerPitchPointerDown}
            style={{
              left: "6%",
              bottom: "4.63%",
              width: "19%",
              height: "17.59%",
            }}
            className={`absolute rounded-full border-[2.5px] flex flex-col items-center justify-center px-1 touch-manipulation select-none transition-transform ${
              canPitchNow
                ? "bg-[#2563eb] hover:bg-[#1d4ed8] text-white border-white active:scale-95 shadow-md cursor-pointer"
                : "bg-slate-800/95 text-slate-400 border-slate-500 cursor-not-allowed"
            }`}
          >
            <span
              className={`text-[7.5px] font-black leading-none px-1.5 py-0.5 rounded-full ${
                canPitchNow
                  ? "bg-[#0f172a] text-sky-300"
                  : "bg-slate-900 text-slate-500"
              }`}
            >
              {onlinePitchButtonMode === "wait_opponent_pitch"
                ? "相手投手"
                : onlinePitchButtonMode === "pitch_sent"
                ? "⚾ 送信済"
                : onlinePitchButtonMode === "spectator"
                ? "観戦中"
                : isHumanBatterTurn
                ? "① 投げる"
                : isVersusPitchLockMode
                ? "🔒 ロック"
                : "⚾ 守備"}
            </span>
            <span className="text-xs sm:text-[13px] font-black leading-tight mt-0.5 tracking-tight">
              {onlinePitchButtonMode === "wait_opponent_pitch"
                ? "待機中"
                : onlinePitchButtonMode === "pitch_sent"
                ? "投球中"
                : onlinePitchButtonMode === "spectator"
                ? "観戦"
                : isVersusPitchLockMode
                ? "セット"
                : "投球"}
            </span>
            <span
              className={`text-[7.5px] font-bold leading-none mt-0.5 truncate max-w-[90%] ${
                canPitchNow ? "text-blue-100" : "text-slate-500"
              }`}
            >
              {onlinePitchButtonMode === "wait_opponent_pitch"
                ? "右下で準備"
                : onlinePitchButtonMode === "pitch_sent"
                ? "打撃待ち"
                : onlinePitchButtonMode === "spectator"
                ? "ライブ"
                : isHumanBatterTurn
                ? "スタート"
                : speedBadgeText}
            </span>
          </button>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            🏏 ボード右下：丸型プッシュボタン「🏏 打つ！」（全周均一な白枠線・好機時ゴールド枠線）
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {!isGameOver && (
          <button
            type="button"
            id="btn-board-corner-swing"
            disabled={!isHumanBatterTurn}
            onPointerDown={handleCornerSwingPointerDown}
            style={{
              right: "6%",
              bottom: "4.63%",
              width: "19%",
              height: "17.59%",
            }}
            className={`absolute rounded-full border-[2.5px] flex flex-col items-center justify-center px-1 touch-manipulation select-none transition-transform ${
              !isHumanBatterTurn
                ? "bg-slate-800/95 text-slate-400 border-slate-500 cursor-not-allowed"
                : isPitchingLive
                ? "bg-[#dc2626] hover:bg-[#b91c1c] text-white border-[#fde047] active:scale-95 shadow-lg cursor-pointer"
                : "bg-[#dc2626] hover:bg-[#b91c1c] text-white border-white active:scale-95 shadow-md cursor-pointer"
            }`}
          >
            <span
              className={`text-[7.5px] font-black leading-none px-1.5 py-0.5 rounded-full ${
                !isHumanBatterTurn
                  ? "bg-slate-900 text-slate-500"
                  : isPitchingLive
                  ? "bg-[#fde047] text-[#0f172a]"
                  : "bg-[#0f172a] text-amber-300"
              }`}
            >
              {!isHumanBatterTurn
                ? "守備中"
                : isPitchingLive
                ? "🔥 今だ！"
                : "② 振る"}
            </span>
            <span className="text-xs sm:text-[13px] font-black leading-tight mt-0.5 tracking-tight">
              {isHumanBatterTurn ? "打つ！" : "守備"}
            </span>
            <span
              className={`text-[7.5px] font-bold leading-none mt-0.5 truncate max-w-[90%] ${
                !isHumanBatterTurn
                  ? "text-slate-500"
                  : isPitchingLive
                  ? "text-yellow-200"
                  : "text-red-100"
              }`}
            >
              {!isHumanBatterTurn
                ? "左下へ"
                : isPitchingLive
                ? "SWING!"
                : "素振り可"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
});
