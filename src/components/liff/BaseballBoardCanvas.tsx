// filepath: src/components/liff/BaseballBoardCanvas.tsx
"use client";

import React, {
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
  type BatterHand,
  type BatterStance,
  type CpuDifficulty,
  type PitchSpec,
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

export type BoardActionPhase = "idle" | "pitching" | "batted" | "resolving";

export interface ResolvedBoardPlay {
  outcome: PlayOutcomeCode;
  detailLabel: string;
  usedVanishPitch: boolean;
}

export interface BaseballBoardCanvasHandle {
  launchPitch: (params: {
    pitch: PitchSpec;
    batterBats: BatterHand;
    batterIsCpu: boolean;
    cpuDifficulty: CpuDifficulty;
    strikes: number;
    outs: number;
    bases: RunnerBases;
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
  soundEnabled: boolean;
  canTapToSwing: boolean;
  canTapToPitch: boolean;
  bannerText: string | null;
  bannerTone: "hr" | "hit" | "out" | "walk" | "magic" | "neutral";
  onPhaseChange: (phase: BoardActionPhase) => void;
  onPlayResolved: (play: ResolvedBoardPlay) => void;
  onRequestQuickPitch?: () => void;
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
  // 投球パラメータ
  pitchSpec: PitchSpec;
  pitchStartX: number;
  pitchTargetX: number;
  pitchProgress: number;
  trapdoorOpen: boolean;
  ballVanished: boolean;
  // 打者スイング状態
  batterBats: BatterHand;
  activeStance: BatterStance;
  hasSwung: boolean;
  swingAnimProgress: number; // 0 = 構え, 0..1 = スイング軌道
  // CPU打者自動スイング予約
  cpuPlan: {
    enabled: boolean;
    willSwing: boolean;
    stance: BatterStance;
    targetHitY: number;
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

function createInitialSimState(batterBats: BatterHand, stance: BatterStance): InternalSimState {
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
    pitchStartX: MOUND_X,
    pitchTargetX: HOME_X,
    pitchProgress: 0,
    trapdoorOpen: false,
    ballVanished: false,
    batterBats,
    activeStance: stance,
    hasSwung: false,
    swingAnimProgress: 0,
    cpuPlan: {
      enabled: false,
      willSwing: false,
      stance: "contact",
      targetHitY: HOME_Y - 6,
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
    soundEnabled,
    canTapToSwing,
    canTapToPitch,
    bannerText,
    bannerTone,
    onPhaseChange,
    onPlayResolved,
    onRequestQuickPitch,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastFrameMsRef = useRef<number>(0);

  const propsRef = useRef({
    bases,
    outs,
    strikes,
    batterBats,
    stance,
    soundEnabled,
    bannerText,
    bannerTone,
    onPhaseChange,
    onPlayResolved,
  });
  propsRef.current = {
    bases,
    outs,
    strikes,
    batterBats,
    stance,
    soundEnabled,
    bannerText,
    bannerTone,
    onPhaseChange,
    onPlayResolved,
  };

  const simRef = useRef<InternalSimState>(
    createInitialSimState(batterBats, stance)
  );

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

    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
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
    } = propsRef.current;
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();

    // 1. 野球盤の外枠筐体（ソリッドダークネイビー・グラデーション完全不使用）
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // 四隅のボードビス装飾
    const rivets = [
      [12, 12],
      [BOARD_WIDTH - 12, 12],
      [12, BOARD_HEIGHT - 12],
      [BOARD_WIDTH - 12, BOARD_HEIGHT - 12],
    ];
    ctx.fillStyle = "#334155";
    for (const [rx, ry] of rivets) {
      ctx.beginPath();
      ctx.arc(rx ?? 0, ry ?? 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. 上部スタンド席（柵越え HOME RUN ゾーン）
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.roundRect(10, 8, BOARD_WIDTH - 20, 42, 10);
    ctx.fill();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // LEFT / CENTER / RIGHT HOME RUN アーチ看板
    const standSigns = [
      { x: 18, w: 96, label: "LEFT HR", bg: "#1d4ed8" },
      { x: 124, w: 152, label: "★ HOME RUN STAND ★", bg: "#dc2626" },
      { x: 286, w: 96, label: "RIGHT HR", bg: "#1d4ed8" },
    ];
    for (const sign of standSigns) {
      ctx.fillStyle = sign.bg;
      ctx.beginPath();
      ctx.roundRect(sign.x, 13, sign.w, 20, 5);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 9.5px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(sign.label, sign.x + sign.w / 2, 23.5);
    }

    // 3. グラウンド土台（ファウルゾーン濃緑）
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(10, 46, BOARD_WIDTH - 20, BOARD_HEIGHT - 56, 14);
    ctx.clip();

    ctx.fillStyle = "#14532d";
    ctx.fillRect(10, 46, BOARD_WIDTH - 20, BOARD_HEIGHT - 56);

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

    // 同心円の刈り込み模様（すべて単色ソリッド）
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

    // 内野中央の芝生ダイヤモンド
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

    // マウンドから本塁への投球レーンガイド（野球盤らしい溝表現）
    ctx.fillStyle = "#14532d";
    ctx.fillRect(HOME_X - 7, MOUND_Y + 14, 14, TRAPDOOR_Y - MOUND_Y - 12);

    // 5. 「消える魔球」トラップドア（本塁手前の秘密ハッチ）
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

    // 左右バッターボックス
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
        // 塁上の走者バッジ（単色アンバー丸バッジ）
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

    // 8. 外野フェンス 7つの判定ポケット（アーチ型ソリッドポケット）
    const pocketInnerR = FENCE_ARC_RADIUS - 11;
    const pocketOuterR = FENCE_ARC_RADIUS + 7;
    for (const pocket of FENCE_POCKETS) {
      const startRad = (pocket.startDeg * Math.PI) / 180;
      const endRad = (pocket.endDeg * Math.PI) / 180;

      ctx.fillStyle = pocket.colorHex;
      ctx.beginPath();
      ctx.arc(FENCE_ARC_CX, FENCE_ARC_CY, pocketOuterR, startRad, endRad, false);
      ctx.arc(FENCE_ARC_CX, FENCE_ARC_CY, pocketInnerR, endRad, startRad, true);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.3;
      ctx.stroke();

      const midRad = ((pocket.startDeg + pocket.endDeg) * 0.5 * Math.PI) / 180;
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

    // 左右ファウルポールの黄色丸ポスト
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
      // ポケット穴
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

      // ポケット後方の守備人形ピン
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

    // 10. 銀色の反射ピン（ボールが当たるとカン！と跳ね返る野球盤の名物ピン）
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

    // 11. 打者フィギュア＆可動バット（右打席 / 左打席・バント対応）
    const activeBats =
      sim.phase === "idle" ? propsRef.current.batterBats : sim.batterBats;
    const activeStance =
      sim.phase === "idle" ? propsRef.current.stance : sim.activeStance;
    const isRightBatter = activeBats === "R";
    const batterX = isRightBatter ? HOME_X - 18 : HOME_X + 18;
    const batterY = HOME_Y - 4;

    // 打者ヘルメット丸アイコン
    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.arc(batterX, batterY, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // バット描画
    ctx.save();
    const pivotX = isRightBatter ? HOME_X - 13 : HOME_X + 13;
    const pivotY = HOME_Y + 2;
    ctx.translate(pivotX, pivotY);

    let batAngleRad = 0;
    if (activeStance === "bunt") {
      // バント構え：本塁上に水平セット
      const buntSlide = sim.hasSwung ? Math.min(1, sim.swingAnimProgress * 2.5) : 0;
      ctx.translate(0, -6 - buntSlide * 4);
      batAngleRad = isRightBatter ? 0.04 : Math.PI - 0.04;
    } else {
      const restAngle = isRightBatter ? 2.25 : Math.PI - 2.25;
      const finishAngle = isRightBatter ? -1.15 : Math.PI + 1.15;
      const t = sim.hasSwung ? Math.min(1, sim.swingAnimProgress) : 0;
      // イーズアウトで鋭く振り抜く
      const eased = 1 - Math.pow(1 - t, 3);
      batAngleRad = restAngle + (finishAngle - restAngle) * eased;
    }

    ctx.rotate(batAngleRad);
    // グリップ＋木製/ゴールドバレル（ソリッド単色）
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

    // キャッチャーミット目標ゾーン（投球中のみ控えめガイド）
    if (sim.phase === "pitching" && !sim.hasSwung) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(HOME_X - 14, HOME_Y - 14, 28, 18);
      ctx.setLineDash([]);
    }

    // 12. ボール軌跡（単色ソリッドドット）＆白球（フライ時は地面の影＋拡大球）
    if (sim.ballVisible && !sim.ballVanished) {
      for (let i = 0; i < sim.trail.length; i++) {
        const pt = sim.trail[i];
        if (!pt) continue;
        const r = 1.6 + (i / Math.max(1, sim.trail.length)) * 2.2;
        ctx.fillStyle = sim.isSweetHit ? "#fde047" : "#bae6fd";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y - pt.z * 0.72, r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (sim.ballZ > 1) {
        // 地面に落ちるソリッドな影（フライの立体感が一目で分かる）
        ctx.fillStyle = "#052e16";
        ctx.beginPath();
        const shadowR = Math.max(2.5, 5 - sim.ballZ * 0.03);
        ctx.ellipse(sim.ballX, sim.ballY, shadowR * 1.2, shadowR * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const drawY = sim.ballY - sim.ballZ * 0.72;
      const ballRadius = 5.2 * (1 + Math.min(0.65, sim.ballZ / 85));

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(sim.ballX, drawY, ballRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.3;
      ctx.stroke();

      // 赤い縫い目
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(sim.ballX - ballRadius * 0.3, drawY, ballRadius * 0.55, -0.7, 0.7);
      ctx.stroke();
    }

    // 13. ホームラン等の紙吹雪（単色ソリッド矩形のみ）
    for (const c of sim.confetti) {
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.w, c.h);
    }

    ctx.restore(); // グラウンドクリップ解除

    // 14. 判定ポップアップバナー（盤面中央上部・ソリッドA-3スタイル）
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
      const boxW = Math.min(BOARD_WIDTH - 44, Math.max(176, curBanner.length * 14 + 34));
      const boxX = (BOARD_WIDTH - boxW) / 2;
      const boxY = 74;

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

  const spawnCelebrationConfetti = useCallback(() => {
    const pieces: ConfettiPiece[] = [];
    for (let i = 0; i < 26; i++) {
      const angle = (Math.PI * 2 * i) / 26 + Math.random() * 0.2;
      const speed = 55 + Math.random() * 110;
      pieces.push({
        x: BOARD_WIDTH / 2,
        y: 120,
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
    (result: ResolvedBoardPlay, celebrateHr = false) => {
      const sim = simRef.current;
      if (sim.phase === "resolving") return;
      sim.phase = "resolving";
      sim.pendingResult = result;
      sim.resolveTimerSec = celebrateHr ? 0.95 : 0.52;
      if (celebrateHr) {
        spawnCelebrationConfetti();
      }
      propsRef.current.onPhaseChange("resolving");
      // スコアボード・バナー更新は即座に親へ通知し、余韻後に idle へ戻す
      propsRef.current.onPlayResolved(result);
    },
    [spawnCelebrationConfetti]
  );

  const executeSwingOnCurrentPitch = useCallback(
    (overrideStance?: BatterStance): boolean => {
      const sim = simRef.current;
      if (sim.phase !== "pitching" || sim.hasSwung) {
        return false;
      }

      const chosenStance = overrideStance ?? propsRef.current.stance;
      sim.activeStance = chosenStance;
      sim.hasSwung = true;
      sim.swingAnimProgress = 0.05;

      // 消える魔球で既に消えている・または直前で消えた場合は空振り！
      if (sim.pitchSpec.type === "vanish" && sim.ballY >= TRAPDOOR_Y - 10) {
        sim.trapdoorOpen = true;
        sim.ballVanished = true;
        playSwingWhoosh(propsRef.current.soundEnabled);
        return true;
      }

      const idealY = HOME_Y - 6; // 382
      const deltaY = sim.ballY - idealY;
      const absDeltaY = Math.abs(deltaY);
      const maxReachY =
        chosenStance === "bunt"
          ? 29
          : chosenStance === "contact"
          ? 27
          : 21;

      const lateralDist = Math.abs(sim.ballX - HOME_X);
      if (absDeltaY > maxReachY || lateralDist > 26 || sim.ballVanished) {
        // 空振り（ボールはそのままキャッチャーまで抜けてから判定）
        playSwingWhoosh(propsRef.current.soundEnabled);
        return true;
      }

      // バットに当たった！打球物理モードへ移行
      sim.phase = "batted";
      sim.elapsedSec = 0;
      sim.trail = [];
      propsRef.current.onPhaseChange("batted");

      const isRightBatter = sim.batterBats === "R";

      if (chosenStance === "bunt") {
        // 2ストライクからのバントファウルはスリーバント失敗のスリル！
        const buntAngleOffset = (Math.random() - 0.5) * 1.15;
        const angleRad = -Math.PI / 2 + buntAngleOffset;
        const speed = 72 + Math.random() * 48;
        sim.vx = Math.cos(angleRad) * speed;
        sim.vy = Math.sin(angleRad) * speed;
        sim.vz = 0;
        sim.ballZ = 0;
        sim.isBuntBall = true;
        sim.isSweetHit = false;
        playBatContact(propsRef.current.soundEnabled, "bunt");
        return true;
      }

      sim.isBuntBall = false;
      // タイミングに応じた打球方向（早め＝引っ張り、遅め＝流し打ち）
      // deltaY < 0: 早振り, deltaY > 0: 振り遅れ
      const normalizedTiming = Math.max(-1.15, Math.min(1.15, deltaY / maxReachY));
      // 右打者: 早振り(-1) -> レフト方向(左: -0.88 rad from -PI/2), 遅振り(+1) -> ライト方向(+0.88 rad)
      // 左打者: 早振り(-1) -> ライト方向(+0.88 rad), 遅振り(+1) -> レフト方向(-0.88 rad)
      const pullSign = isRightBatter ? 1 : -1;
      const courseInfluence = (sim.ballX - HOME_X) * 0.012;
      const jitter = (Math.random() - 0.5) * 0.14;
      const sprayOffsetRad =
        normalizedTiming * 0.92 * pullSign + courseInfluence + jitter;
      const launchAngleRad = -Math.PI / 2 + sprayOffsetRad;

      const timingQuality = Math.max(0, 1 - absDeltaY / maxReachY);
      const isSweet =
        timingQuality >= (chosenStance === "power" ? 0.7 : 0.78) &&
        Math.abs(sprayOffsetRad) <= 0.76;
      sim.isSweetHit = isSweet;

      if (Math.abs(sprayOffsetRad) > 0.82) {
        // ファウルゾーン方向への鋭い打球
        const foulSpeed = 230 + Math.random() * 60;
        sim.vx = Math.cos(launchAngleRad) * foulSpeed;
        sim.vy = Math.sin(launchAngleRad) * foulSpeed;
        sim.vz = 35;
        playBatContact(propsRef.current.soundEnabled, "foul");
        return true;
      }

      if (chosenStance === "power") {
        const baseSpeed = isSweet
          ? 275 + timingQuality * 75
          : 190 + timingQuality * 65;
        sim.vx = Math.cos(launchAngleRad) * baseSpeed;
        sim.vy = Math.sin(launchAngleRad) * baseSpeed;
        // 強振ジャストミート時は高弾道アーチ（柵越えスタンドイン軌道！）
        sim.vz = isSweet
          ? 122 + Math.random() * 26
          : Math.random() < 0.55
          ? 82 + Math.random() * 24
          : 18;
      } else {
        // ミート打ち：ライナー＆鋭いゴロ中心（真芯なら柵越えもあり！）
        const baseSpeed = isSweet
          ? 258 + timingQuality * 58
          : 195 + timingQuality * 55;
        sim.vx = Math.cos(launchAngleRad) * baseSpeed;
        sim.vy = Math.sin(launchAngleRad) * baseSpeed;
        sim.vz =
          isSweet && Math.random() < 0.42
            ? 116 + Math.random() * 18
            : isSweet
            ? 44 + Math.random() * 28
            : 12;
      }

      playBatContact(
        propsRef.current.soundEnabled,
        isSweet ? "sweet" : "normal"
      );
      return true;
    },
    []
  );

  const stepSimulation = useCallback(
    (dt: number, nowMs: number) => {
      const sim = simRef.current;

      // スイングアニメーション進行
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
          sim.phase = "idle";
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
          propsRef.current.onPhaseChange("idle");
        }
        return;
      }

      if (sim.phase === "pitching") {
        const meta = PITCH_TYPE_META[sim.pitchSpec.type];
        const totalDist = HOME_Y + 22 - MOUND_Y;
        const prevY = sim.ballY;
        sim.ballY += meta.speedPxPerSec * dt;
        sim.pitchProgress = Math.max(
          0,
          Math.min(1.2, (sim.ballY - MOUND_Y) / totalDist)
        );

        // 変化球の横変化（打者の左右に合わせてカーブ＝外角方向、シュート＝内角方向）
        const handSign = sim.batterBats === "R" ? 1 : -1;
        const curveBend =
          meta.curveFactor * handSign * Math.pow(sim.pitchProgress, 2.1) * 19;
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

        // CPU打者の自動スイング判定
        if (
          sim.cpuPlan.enabled &&
          sim.cpuPlan.willSwing &&
          !sim.hasSwung &&
          prevY < sim.cpuPlan.targetHitY &&
          sim.ballY >= sim.cpuPlan.targetHitY
        ) {
          executeSwingOnCurrentPitch(sim.cpuPlan.stance);
          if ((sim.phase as BoardActionPhase) !== "pitching") return;
        }

        // 捕手到達（見逃し or 空振り確定）
        if (sim.ballY >= HOME_Y + 22) {
          const usedVanish = sim.pitchSpec.type === "vanish";
          if (sim.hasSwung) {
            beginResolving({
              outcome: "swinging_strike",
              detailLabel: usedVanish ? "消える魔球で空振り！" : "空振りストライク！",
              usedVanishPitch: usedVanish,
            });
          } else if (usedVanish) {
            // 消える魔球を見送ったらボール！
            beginResolving({
              outcome: "ball",
              detailLabel: "消える魔球を見極めた！ボール！",
              usedVanishPitch: true,
            });
          } else {
            // ストライクゾーン通過判定
            const inZone = Math.abs(sim.ballX - HOME_X) <= 16.5;
            // 内角・外角ぎりぎりでたまにボール球になるリアルな駆け引き
            const isBallCall = !inZone || (sim.pitchSpec.course !== "middle" && Math.random() < 0.28);
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

        // サブステップ分割でピンすり抜けを防止
        const subSteps = 3;
        const subDt = dt / subSteps;

        for (let s = 0; s < subSteps; s++) {
          sim.ballX += sim.vx * subDt;
          sim.ballY += sim.vy * subDt;

          if (sim.ballZ > 0 || sim.vz > 0) {
            sim.ballZ += sim.vz * subDt;
            sim.vz -= 165 * subDt; // 重力加速度
            if (sim.ballZ <= 0) {
              sim.ballZ = 0;
              // 外野手のフライ直接捕球チェック！
              for (const trap of FIELDER_TRAPS) {
                const dist = Math.hypot(sim.ballX - trap.x, sim.ballY - trap.y);
                const flyCatchRadius = trap.isOutfield ? 21 : 15;
                if (dist <= flyCatchRadius && isFairTerritory(sim.ballX, sim.ballY)) {
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

              // ワンバウンド減衰
              if (Math.abs(sim.vz) > 28) {
                sim.vz = Math.abs(sim.vz) * 0.28;
                sim.vx *= 0.78;
                sim.vy *= 0.78;
              } else {
                sim.vz = 0;
              }
            }
          } else {
            // 芝生上の転がり摩擦
            const friction = Math.pow(sim.isBuntBall ? 0.26 : 0.58, subDt);
            sim.vx *= friction;
            sim.vy *= friction;
          }

          // 1) ファウル判定（本塁〜ポール間のライン外へ出た場合）
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

          // 2) 外野フェンス到達判定（中心 (200, 236) からの距離 >= R）
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

              // 空中でフェンスを越えた場合は問答無用の「柵越えスタンドイン HOME RUN!!」
              if (sim.ballZ >= 9) {
                const standDirection =
                  angleDeg < -118
                    ? "レフトスタンドへ柵越え本塁打！！"
                    : angleDeg > -62
                    ? "ライトスタンドへ柵越え本塁打！！"
                    : "バックスクリーン直撃の特大本塁打！！";
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

              // 地上ゴロ・ワンバウンドで外野ポケットにスポッ！と入った場合
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

          // 3) 地上転がり中（ballZ < 5）のピン反射 ＆ 野手OUTポケット吸い込み判定
          if (sim.ballZ < 5) {
            // 銀色ピンとの衝突反射
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
                  sim.vx = (sim.vx - 2 * dot * nx) * restitution + (Math.random() - 0.5) * 16;
                  sim.vy = (sim.vy - 2 * dot * ny) * restitution;
                  sim.flashedPinIdx = pIdx;
                  sim.flashedPinUntilMs = nowMs + 130;
                  playPinRicochet(propsRef.current.soundEnabled);
                }
              }
            }

            // 野手OUTトラップポケット判定
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

        // 4) 芝生上でボールが完全停止した場合（バント成功 / セーフティ内野安打 / 凡打判定）
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
            // 絶妙なライン際バントはセーフティ内野安打！
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

          // 外野芝生まで転がって止まった打球はクリーンヒット！内野内で止まった場合は内野安打 or 内野ゴロ
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
    [beginResolving, executeSwingOnCurrentPitch]
  );

  const startAnimationLoop = useCallback(() => {
    if (rafIdRef.current !== null) return;
    lastFrameMsRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const tick = (nowMs: number) => {
      if (typeof document !== "undefined" && document.hidden) {
        // バックグラウンド遷移時は省電力のため即座に停止・安全リセット
        rafIdRef.current = null;
        simRef.current = createInitialSimState(
          propsRef.current.batterBats,
          propsRef.current.stance
        );
        propsRef.current.onPhaseChange("idle");
        return;
      }

      const rawDt = (nowMs - lastFrameMsRef.current) / 1000;
      lastFrameMsRef.current = nowMs;
      const dt = Math.min(0.04, Math.max(0.001, rawDt));

      stepSimulation(dt, nowMs);
      drawBoard();

      if (simRef.current.phase !== "idle") {
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        rafIdRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, [drawBoard, stepSimulation]);

  useImperativeHandle(
    ref,
    () => ({
      launchPitch: ({
        pitch,
        batterBats: targetBats,
        batterIsCpu,
        cpuDifficulty,
        strikes: curStrikes,
        outs: curOuts,
        bases: curBases,
      }) => {
        const sim = simRef.current;
        if (sim.phase !== "idle") return;

        const targetX = getCourseTargetX(pitch.course, targetBats);
        sim.phase = "pitching";
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
        sim.pitchSpec = pitch;
        sim.pitchStartX = MOUND_X;
        sim.pitchTargetX = targetX;
        sim.pitchProgress = 0;
        sim.trapdoorOpen = false;
        sim.ballVanished = false;
        sim.batterBats = targetBats;
        sim.activeStance = propsRef.current.stance;
        sim.hasSwung = false;
        sim.swingAnimProgress = 0;
        sim.trail = [];
        sim.confetti = [];
        sim.pendingResult = null;

        if (batterIsCpu) {
          const plan = decideCpuBatterPlan({
            difficulty: cpuDifficulty,
            pitch,
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
        propsRef.current.onPhaseChange("pitching");
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
        propsRef.current.onPhaseChange("idle");
        drawBoard();
      },
    }),
    [drawBoard, executeSwingOnCurrentPitch, startAnimationLoop, stopLoop]
  );

  // 待機中の表示プロパティ更新時に静止1フレームのみ再描画（0 FPS 省電力）
  useEffect(() => {
    if (simRef.current.phase === "idle") {
      simRef.current.batterBats = batterBats;
      simRef.current.activeStance = stance;
    }
    drawBoard();
  }, [bases, outs, strikes, batterBats, stance, bannerText, bannerTone, drawBoard]);

  useEffect(() => {
    return () => {
      stopLoop();
    };
  }, [stopLoop]);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (simRef.current.phase === "pitching" && canTapToSwing) {
      e.preventDefault();
      executeSwingOnCurrentPitch();
      drawBoard();
      return;
    }
    if (simRef.current.phase === "idle" && canTapToPitch && onRequestQuickPitch) {
      e.preventDefault();
      onRequestQuickPitch();
    }
  };

  return (
    <div className="w-full flex justify-center select-none">
      <canvas
        ref={canvasRef}
        id="baseball-board-canvas"
        onPointerDown={handleCanvasPointerDown}
        className="w-full max-w-[410px] aspect-[400/432] rounded-2xl border-2 border-[#0f172a] shadow-sm touch-manipulation cursor-pointer block bg-[#0f172a]"
        aria-label="野球盤ゲーム盤面"
      />
    </div>
  );
});
