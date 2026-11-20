// filepath: src/lib/liff/baseball-board-engine.ts

export type GameMode = "cpu" | "versus" | "derby";
export type CpuDifficulty = "easy" | "normal" | "hard";
export type PitchType = "straight" | "curve" | "shoot" | "changeup" | "vanish";
export type PitchCourse = "inside" | "middle" | "outside";
export type BatterStance = "contact" | "power" | "bunt";
export type BatterHand = "R" | "L";

export interface BoardPlayer {
  id: string;
  name: string;
  uniformNumber: string;
  bats: BatterHand;
  positionLabel: string;
  atBats: number;
  hits: number;
  homeRuns: number;
  rbi: number;
}

export type PitchSpeedPreset = "slow" | "normal" | "fast" | "monster" | "chaos";

export interface PitchSpec {
  type: PitchType;
  course: PitchCourse;
  speedPreset?: PitchSpeedPreset;
}

export interface PitchSpeedPresetMeta {
  id: PitchSpeedPreset;
  label: string;
  shortLabel: string;
  kmhBadge: string;
  baseKmh: number;
  speedMultiplier: number;
  carryMultiplier: number;
  description: string;
}

export const PITCH_SPEED_PRESETS: readonly PitchSpeedPresetMeta[] = [
  {
    id: "slow",
    label: "スロー (80km)",
    shortLabel: "🐢 80km",
    kmhBadge: "80km/h",
    baseKmh: 80,
    speedMultiplier: 0.64,
    carryMultiplier: 0.96,
    description: "初心者でもしっかり見て打てる安心スピード",
  },
  {
    id: "normal",
    label: "ふつう (115km)",
    shortLabel: "⚾ 115km",
    kmhBadge: "115km/h",
    baseKmh: 115,
    speedMultiplier: 0.95,
    carryMultiplier: 1.0,
    description: "草野球・中学野球の心地よい標準スピード",
  },
  {
    id: "fast",
    label: "剛速球 (145km)",
    shortLabel: "⚡ 145km",
    kmhBadge: "145km/h",
    baseKmh: 145,
    speedMultiplier: 1.25,
    carryMultiplier: 1.09,
    description: "プロ級の速球！球威に負けず弾き返せば飛距離UP",
  },
  {
    id: "monster",
    label: "怪物級 (165km)",
    shortLabel: "🔥 165km",
    kmhBadge: "165km/h",
    baseKmh: 165,
    speedMultiplier: 1.54,
    carryMultiplier: 1.18,
    description: "うなる火の玉ストレート！真芯で捉えれば超特大アーチ",
  },
  {
    id: "chaos",
    label: "緩急MIX",
    shortLabel: "🛸 緩急",
    kmhBadge: "65〜168km",
    baseKmh: 125,
    speedMultiplier: 1.0,
    carryMultiplier: 1.08,
    description: "超スロー山なり球と168km剛速球がランダムに来る魔境モード！",
  },
];

const PITCH_SPEED_PRESET_MAP: Readonly<Record<PitchSpeedPreset, PitchSpeedPresetMeta>> = {
  slow: PITCH_SPEED_PRESETS[0]!,
  normal: PITCH_SPEED_PRESETS[1]!,
  fast: PITCH_SPEED_PRESETS[2]!,
  monster: PITCH_SPEED_PRESETS[3]!,
  chaos: PITCH_SPEED_PRESETS[4]!,
};

export interface PitchTypeMeta {
  id: PitchType;
  label: string;
  shortLabel: string;
  speedPxPerSec: number;
  kmhRatio: number;
  curveFactor: number;
  description: string;
}

export const PITCH_TYPE_META: Readonly<Record<PitchType, PitchTypeMeta>> = {
  straight: {
    id: "straight",
    label: "ストレート",
    shortLabel: "直球",
    speedPxPerSec: 235,
    kmhRatio: 1.0,
    curveFactor: 0,
    description: "伸びのある王道ストレート",
  },
  curve: {
    id: "curve",
    label: "カーブ",
    shortLabel: "カーブ",
    speedPxPerSec: 178,
    kmhRatio: 0.81,
    curveFactor: 1,
    description: "外角方向へ大きく曲がる変化球",
  },
  shoot: {
    id: "shoot",
    label: "シュート",
    shortLabel: "シュート",
    speedPxPerSec: 196,
    kmhRatio: 0.91,
    curveFactor: -1,
    description: "打者の手元へ食い込む変化球",
  },
  changeup: {
    id: "changeup",
    label: "チェンジアップ",
    shortLabel: "緩球",
    speedPxPerSec: 136,
    kmhRatio: 0.69,
    curveFactor: 0.2,
    description: "タイミングを外すスローボール",
  },
  vanish: {
    id: "vanish",
    label: "消える魔球",
    shortLabel: "魔球",
    speedPxPerSec: 205,
    kmhRatio: 0.9,
    curveFactor: 0,
    description: "本塁手前で床下へ消える必殺魔球！見送ればボール",
  },
};

export interface LaunchSpeedMetrics {
  displayKmh: number;
  effectiveSpeedPxPerSec: number;
  carryMultiplier: number;
  isFireball: boolean;
  isUltraSlow: boolean;
}

/**
 * 球種×球速プリセットからスピードガン表示値(km/h)と盤面物理速度を算出する
 */
export function resolveLaunchSpeedMetrics(
  pitchType: PitchType,
  preset: PitchSpeedPreset = "normal"
): LaunchSpeedMetrics {
  const typeMeta = PITCH_TYPE_META[pitchType];
  let baseKmh: number;
  let speedMul: number;
  let carryMul: number;

  if (preset === "chaos") {
    const roll = Math.random();
    if (roll < 0.28) {
      // 超スローボール（イーファス風）
      baseKmh = 68;
      speedMul = 0.5;
      carryMul = 0.95;
    } else if (roll < 0.52) {
      baseKmh = 92;
      speedMul = 0.74;
      carryMul = 0.98;
    } else if (roll < 0.76) {
      baseKmh = 146;
      speedMul = 1.26;
      carryMul = 1.1;
    } else {
      baseKmh = 167;
      speedMul = 1.57;
      carryMul = 1.2;
    }
  } else {
    const pMeta = PITCH_SPEED_PRESET_MAP[preset] ?? PITCH_SPEED_PRESETS[1]!;
    baseKmh = pMeta.baseKmh;
    speedMul = pMeta.speedMultiplier;
    carryMul = pMeta.carryMultiplier;
  }

  const jitterKmh = Math.round((Math.random() - 0.5) * 6);
  const displayKmh = Math.max(
    52,
    Math.min(175, Math.round(baseKmh * typeMeta.kmhRatio + jitterKmh))
  );
  const effectiveSpeedPxPerSec = Math.max(
    88,
    Math.round(typeMeta.speedPxPerSec * speedMul)
  );

  return {
    displayKmh,
    effectiveSpeedPxPerSec,
    carryMultiplier: carryMul,
    isFireball: displayKmh >= 152,
    isUltraSlow: displayKmh <= 82,
  };
}

export const MAX_VANISH_PITCHES_PER_GAME = 2;
export const DERBY_TOTAL_PITCHES = 10;

// 盤面論理サイズ（Retina 2x スケーリング対応）
export const BOARD_WIDTH = 400;
export const BOARD_HEIGHT = 432;
export const HOME_X = 200;
export const HOME_Y = 388;
export const MOUND_X = 200;
export const MOUND_Y = 250;
export const TRAPDOOR_Y = 338;
export const FENCE_ARC_CX = 200;
export const FENCE_ARC_CY = 236;
export const FENCE_ARC_RADIUS = 180;

export const BASE_COORDS = {
  first: { x: 288, y: 296 },
  second: { x: 200, y: 208 },
  third: { x: 112, y: 296 },
  home: { x: HOME_X, y: HOME_Y },
} as const;

export type FencePocketKind = "1b" | "2b" | "3b" | "hr" | "out";

export interface FencePocketDef {
  id: string;
  label: string;
  announceLabel: string;
  kind: FencePocketKind;
  startDeg: number;
  endDeg: number;
  colorHex: string;
}

// 左翼ポール (-171.7°) 〜 右翼ポール (-8.3°) の外野フェンス7ポケット
export const FENCE_POCKETS: readonly FencePocketDef[] = [
  {
    id: "lf_hit",
    label: "左安",
    announceLabel: "レフト前ヒット！",
    kind: "1b",
    startDeg: -171.7,
    endDeg: -148.0,
    colorHex: "#2563eb",
  },
  {
    id: "lc_2b",
    label: "二塁打",
    announceLabel: "左中間ツーベースヒット！！",
    kind: "2b",
    startDeg: -148.0,
    endDeg: -125.0,
    colorHex: "#0d9488",
  },
  {
    id: "lc_out",
    label: "OUT",
    announceLabel: "左中間アウト！",
    kind: "out",
    startDeg: -125.0,
    endDeg: -102.0,
    colorHex: "#475569",
  },
  {
    id: "cf_hr",
    label: "本塁打",
    announceLabel: "センターオーバー本塁打！！",
    kind: "hr",
    startDeg: -102.0,
    endDeg: -78.0,
    colorHex: "#dc2626",
  },
  {
    id: "rc_out",
    label: "OUT",
    announceLabel: "右中間アウト！",
    kind: "out",
    startDeg: -78.0,
    endDeg: -55.0,
    colorHex: "#475569",
  },
  {
    id: "rc_3b",
    label: "三塁打",
    announceLabel: "右中間スリーベースヒット！！",
    kind: "3b",
    startDeg: -55.0,
    endDeg: -32.0,
    colorHex: "#4f46e5",
  },
  {
    id: "rf_hit",
    label: "右安",
    announceLabel: "ライト前ヒット！",
    kind: "1b",
    startDeg: -32.0,
    endDeg: -8.3,
    colorHex: "#2563eb",
  },
];

export interface FielderTrapDef {
  id: string;
  positionCode: string;
  shortLabel: string;
  x: number;
  y: number;
  radius: number;
  isOutfield: boolean;
  canDoublePlay: boolean;
  groundOutLabel: string;
  flyOutLabel: string;
}

export const FIELDER_TRAPS: readonly FielderTrapDef[] = [
  {
    id: "1b",
    positionCode: "3",
    shortLabel: "一",
    x: 273,
    y: 280,
    radius: 10.5,
    isOutfield: false,
    canDoublePlay: false,
    groundOutLabel: "ファーストゴロ アウト！",
    flyOutLabel: "ファーストフライ アウト！",
  },
  {
    id: "2b",
    positionCode: "4",
    shortLabel: "二",
    x: 236,
    y: 224,
    radius: 10.5,
    isOutfield: false,
    canDoublePlay: true,
    groundOutLabel: "セカンドゴロ アウト！",
    flyOutLabel: "セカンドフライ アウト！",
  },
  {
    id: "ss",
    positionCode: "6",
    shortLabel: "遊",
    x: 164,
    y: 224,
    radius: 10.5,
    isOutfield: false,
    canDoublePlay: true,
    groundOutLabel: "ショートゴロ アウト！",
    flyOutLabel: "ショートフライ アウト！",
  },
  {
    id: "3b",
    positionCode: "5",
    shortLabel: "三",
    x: 127,
    y: 280,
    radius: 10.5,
    isOutfield: false,
    canDoublePlay: false,
    groundOutLabel: "サードゴロ アウト！",
    flyOutLabel: "サードフライ アウト！",
  },
  {
    id: "lf",
    positionCode: "7",
    shortLabel: "左",
    x: 104,
    y: 148,
    radius: 11.5,
    isOutfield: true,
    canDoublePlay: false,
    groundOutLabel: "レフト前ゴロ封殺・アウト！",
    flyOutLabel: "レフトフライ アウト！",
  },
  {
    id: "cf",
    positionCode: "8",
    shortLabel: "中",
    x: 200,
    y: 122,
    radius: 11.5,
    isOutfield: true,
    canDoublePlay: false,
    groundOutLabel: "センター前アウト！",
    flyOutLabel: "センターフライ アウト！",
  },
  {
    id: "rf",
    positionCode: "9",
    shortLabel: "右",
    x: 296,
    y: 148,
    radius: 11.5,
    isOutfield: true,
    canDoublePlay: false,
    groundOutLabel: "ライト前アウト！",
    flyOutLabel: "ライトフライ アウト！",
  },
];

export interface PinPostDef {
  x: number;
  y: number;
  radius: number;
  isPitcherPin?: boolean;
}

function buildBoardPins(): PinPostDef[] {
  const pins: PinPostDef[] = [
    // ピッチャーピン（マウンド中央）
    { x: MOUND_X, y: MOUND_Y, radius: 5.5, isPitcherPin: true },
    // 内野芝エッジピン
    { x: 180, y: 270, radius: 4.5 },
    { x: 220, y: 270, radius: 4.5 },
    // 三遊間・一二間ピン
    { x: 146, y: 248, radius: 4.5 },
    { x: 254, y: 248, radius: 4.5 },
    // 外野浅めピン
    { x: 136, y: 186, radius: 4.5 },
    { x: 264, y: 186, radius: 4.5 },
    { x: 170, y: 162, radius: 4.5 },
    { x: 230, y: 162, radius: 4.5 },
    // ライン際ピン
    { x: 82, y: 188, radius: 4.5 },
    { x: 318, y: 188, radius: 4.5 },
  ];

  // 外野フェンス各ポケット境界の仕切りピン
  const dividerAngles = [-171.7, -148.0, -125.0, -102.0, -78.0, -55.0, -32.0, -8.3];
  for (const deg of dividerAngles) {
    const rad = (deg * Math.PI) / 180;
    pins.push({
      x: FENCE_ARC_CX + (FENCE_ARC_RADIUS - 3) * Math.cos(rad),
      y: FENCE_ARC_CY + (FENCE_ARC_RADIUS - 3) * Math.sin(rad),
      radius: 4.5,
    });
  }

  return pins;
}

export const BOARD_PINS: readonly PinPostDef[] = buildBoardPins();

export type PlayOutcomeCode =
  | "ball"
  | "called_strike"
  | "swinging_strike"
  | "foul"
  | "three_bunt_out"
  | "walk"
  | "strikeout"
  | "ground_out"
  | "fly_out"
  | "sac_fly"
  | "sac_bunt"
  | "double_play"
  | "single"
  | "double"
  | "triple"
  | "homerun";

export interface RunnerBases {
  first: boolean;
  second: boolean;
  third: boolean;
}

export interface InningScoreCell {
  top: number | null;
  bottom: number | "x" | null;
  bottomWalkOffRuns?: number | null;
}

export interface BaseballBoardMatchState {
  mode: GameMode;
  totalInnings: number;
  difficulty: CpuDifficulty;
  playerSide: "away" | "home";
  inning: number;
  isTop: boolean;
  balls: number;
  strikes: number;
  outs: number;
  bases: RunnerBases;
  awayTeamName: string;
  homeTeamName: string;
  awayLineup: BoardPlayer[];
  homeLineup: BoardPlayer[];
  awayBatterIdx: number;
  homeBatterIdx: number;
  awayScore: number;
  homeScore: number;
  awayHits: number;
  homeHits: number;
  awayVanishLeft: number;
  homeVanishLeft: number;
  innings: InningScoreCell[];
  isGameOver: boolean;
  winner: "away" | "home" | "draw" | null;
  lastCallout: string;
  lastSubCallout: string;
  // ホームラン競争専用
  derbyPitchNumber: number;
  derbyHomeRuns: number;
  derbyPoints: number;
}

export interface PlayApplyResult {
  nextState: BaseballBoardMatchState;
  runsScored: number;
  outsAdded: number;
  halfInningEnded: boolean;
  isWalkOff: boolean;
  soundKind: "hr" | "3b" | "2b" | "1b" | "out" | "dp" | "walk" | "strikeout" | null;
  bannerTitle: string;
  bannerTone: "hr" | "hit" | "out" | "walk" | "magic" | "neutral";
}

export interface BaseballBoardLocalStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  totalHomeRuns: number;
  bestSingleGameRuns: number;
  derbyHighScore: number;
  derbyBestHr: number;
  maxExitVelocityKmh: number;
}

export const EMPTY_LOCAL_STATS: BaseballBoardLocalStats = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  totalHomeRuns: 0,
  bestSingleGameRuns: 0,
  derbyHighScore: 0,
  derbyBestHr: 0,
  maxExitVelocityKmh: 0,
};

const DEFAULT_POSITION_ORDER: ReadonlyArray<{
  pos: string;
  num: string;
  bats: BatterHand;
}> = [
  { pos: "中堅", num: "8", bats: "L" },
  { pos: "二塁", num: "4", bats: "R" },
  { pos: "遊撃", num: "6", bats: "R" },
  { pos: "一塁", num: "3", bats: "R" },
  { pos: "捕手", num: "2", bats: "R" },
  { pos: "三塁", num: "5", bats: "L" },
  { pos: "左翼", num: "7", bats: "L" },
  { pos: "右翼", num: "9", bats: "R" },
  { pos: "投手", num: "1", bats: "R" },
];

export function createGenericLineup(prefix: "my" | "opp"): BoardPlayer[] {
  return DEFAULT_POSITION_ORDER.map((slot, idx) => ({
    id: `${prefix}-slot-${idx + 1}`,
    name:
      prefix === "my"
        ? `${idx + 1}番 ${slot.pos}`
        : `相手${idx + 1}番（${slot.pos}）`,
    uniformNumber: slot.num,
    bats: slot.bats,
    positionLabel: slot.pos,
    atBats: 0,
    hits: 0,
    homeRuns: 0,
    rbi: 0,
  }));
}

export interface RawRosterPlayerCandidate {
  id: string;
  name: string;
  uniformNumber?: string | null;
  bats?: string | null;
  primaryPosition?: string | null;
  conditionStatus?: string | null;
  isActive?: boolean;
}

function parseBatterHand(bats: string | null | undefined): BatterHand {
  if (!bats) return "R";
  const normalized = bats.trim();
  if (normalized.includes("左") || normalized.toUpperCase().startsWith("L")) {
    return "L";
  }
  return "R";
}

export function buildTeamLineupFromRoster(
  candidates: readonly RawRosterPlayerCandidate[]
): BoardPlayer[] {
  const active = candidates.filter(
    (p) =>
      p.isActive !== false &&
      p.conditionStatus !== "on_leave" &&
      Boolean(p.name && p.name.trim())
  );

  if (active.length === 0) {
    return createGenericLineup("my");
  }

  const result: BoardPlayer[] = [];
  for (let i = 0; i < 9; i++) {
    const src = active[i];
    if (src) {
      result.push({
        id: src.id,
        name: src.name.trim(),
        uniformNumber: (src.uniformNumber || String(i + 1)).trim() || String(i + 1),
        bats: parseBatterHand(src.bats),
        positionLabel: src.primaryPosition || DEFAULT_POSITION_ORDER[i]?.pos || "野手",
        atBats: 0,
        hits: 0,
        homeRuns: 0,
        rbi: 0,
      });
    } else {
      const fallbackSlot = DEFAULT_POSITION_ORDER[i] ?? {
        pos: "野手",
        num: String(i + 1),
        bats: "R" as const,
      };
      result.push({
        id: `supp-slot-${i + 1}`,
        name: `${i + 1}番 サポート`,
        uniformNumber: fallbackSlot.num,
        bats: fallbackSlot.bats,
        positionLabel: fallbackSlot.pos,
        atBats: 0,
        hits: 0,
        homeRuns: 0,
        rbi: 0,
      });
    }
  }
  return result;
}

export function createInitialMatchState(params: {
  mode: GameMode;
  totalInnings: number;
  difficulty: CpuDifficulty;
  myTeamName: string;
  myLineup: BoardPlayer[];
  playerIsHome?: boolean;
}): BaseballBoardMatchState {
  const {
    mode,
    totalInnings,
    difficulty,
    myTeamName,
    myLineup,
    playerIsHome = true,
  } = params;

  const cleanMyName = myTeamName.trim() || "自チーム";
  const oppName = mode === "versus" ? "2P チャレンジャーズ" : "CPU ライバルズ";

  const resetStats = (list: BoardPlayer[]): BoardPlayer[] =>
    list.map((p) => ({ ...p, atBats: 0, hits: 0, homeRuns: 0, rbi: 0 }));

  const awayLineup = playerIsHome
    ? createGenericLineup("opp")
    : resetStats(myLineup);
  const homeLineup = playerIsHome
    ? resetStats(myLineup)
    : createGenericLineup("opp");

  const awayTeamName =
    mode === "versus"
      ? `1P ${cleanMyName}`
      : playerIsHome
      ? oppName
      : cleanMyName;
  const homeTeamName =
    mode === "versus"
      ? "2P ビジターズ"
      : playerIsHome
      ? cleanMyName
      : oppName;

  const innings: InningScoreCell[] = Array.from(
    { length: Math.max(1, totalInnings) },
    (_, idx) => ({
      top: idx === 0 && mode !== "derby" ? 0 : null,
      bottom: null,
    })
  );

  return {
    mode,
    totalInnings: Math.max(1, totalInnings),
    difficulty,
    playerSide: playerIsHome ? "home" : "away",
    inning: 1,
    isTop: mode !== "derby",
    balls: 0,
    strikes: 0,
    outs: 0,
    bases: { first: false, second: false, third: false },
    awayTeamName,
    homeTeamName,
    awayLineup,
    homeLineup,
    awayBatterIdx: 0,
    homeBatterIdx: 0,
    awayScore: 0,
    homeScore: 0,
    awayHits: 0,
    homeHits: 0,
    awayVanishLeft: MAX_VANISH_PITCHES_PER_GAME,
    homeVanishLeft: MAX_VANISH_PITCHES_PER_GAME,
    innings,
    isGameOver: false,
    winner: null,
    lastCallout:
      mode === "derby"
        ? "①左下「投球」➔ ②右下「打つ！」で柵越え連発を狙おう！"
        : !playerIsHome
        ? "プレイボール！①左下「投球」➔ ②右下「打つ！」で攻撃開始！"
        : "プレイボール！コース・球速・球種を選んで投球開始！",
    lastSubCallout:
      mode === "derby"
        ? "センター看板直撃ならボーナス +150pt！"
        : "球速ギア変更・素振りテストもいつでもOK",
    derbyPitchNumber: 1,
    derbyHomeRuns: 0,
    derbyPoints: 0,
  };
}

/**
 * 座標 (x, y) がフェアゾーン内かどうかを判定する（本塁 (200, 388) から左右45°ライン）
 */
export function isFairTerritory(x: number, y: number): boolean {
  const dy = HOME_Y - y;
  if (dy < -2) return false;
  const dx = Math.abs(x - HOME_X);
  return dx <= dy + 4;
}

/**
 * 外野フェンス到達時の角度から該当ポケットを返す
 */
export function resolveFencePocketAtAngle(angleDeg: number): FencePocketDef | null {
  if (angleDeg < -171.7 || angleDeg > -8.3) {
    return null;
  }
  for (const pocket of FENCE_POCKETS) {
    if (angleDeg >= pocket.startDeg && angleDeg <= pocket.endDeg) {
      return pocket;
    }
  }
  return FENCE_POCKETS[3] ?? null;
}

/**
 * 投球コースのベース通過目標X座標を返す（打者の左右に応じて内角・外角を自動反転）
 */
export function getCourseTargetX(course: PitchCourse, batterBats: BatterHand): number {
  if (course === "middle") return HOME_X;
  const offset = 13;
  if (batterBats === "R") {
    // 右打者は左打席（画面左側）に立つため、内角＝左寄り(-offset)、外角＝右寄り(+offset)
    return course === "inside" ? HOME_X - offset : HOME_X + offset;
  }
  // 左打者は右打席（画面右側）に立つため、内角＝右寄り(+offset)、外角＝左寄り(-offset)
  return course === "inside" ? HOME_X + offset : HOME_X - offset;
}

/**
 * CPU投手の球種・コース選択AI
 */
export function chooseCpuPitch(params: {
  difficulty: CpuDifficulty;
  balls: number;
  strikes: number;
  vanishLeft: number;
  isDerby?: boolean;
}): PitchSpec {
  const { difficulty, balls, strikes, vanishLeft, isDerby } = params;
  if (isDerby) {
    const courses: PitchCourse[] = ["middle", "middle", "inside", "outside"];
    const c = courses[Math.floor(Math.random() * courses.length)] ?? "middle";
    return {
      type: Math.random() < 0.75 ? "straight" : "curve",
      course: c,
    };
  }

  // 2ストライク追い込み時、難易度に応じて「消える魔球」を勝負球に使う
  if (
    vanishLeft > 0 &&
    strikes === 2 &&
    balls < 3 &&
    ((difficulty === "hard" && Math.random() < 0.45) ||
      (difficulty === "normal" && Math.random() < 0.25))
  ) {
    return { type: "vanish", course: "middle" };
  }

  const courses: PitchCourse[] =
    balls === 3
      ? ["middle", "middle", "outside"]
      : ["inside", "middle", "outside"];
  const course = courses[Math.floor(Math.random() * courses.length)] ?? "middle";

  const r = Math.random();
  if (difficulty === "easy") {
    if (r < 0.68) return { type: "straight", course };
    if (r < 0.88) return { type: "curve", course };
    return { type: "changeup", course };
  }
  if (difficulty === "normal") {
    if (r < 0.42) return { type: "straight", course };
    if (r < 0.65) return { type: "curve", course };
    if (r < 0.84) return { type: "shoot", course };
    return { type: "changeup", course };
  }
  // hard
  if (r < 0.34) return { type: "straight", course };
  if (r < 0.58) return { type: "curve", course };
  if (r < 0.8) return { type: "shoot", course };
  return { type: "changeup", course };
}

/**
 * CPU打者のスイング意思決定（プレイヤーが投球する表イニング用）
 */
export function decideCpuBatterPlan(params: {
  difficulty: CpuDifficulty;
  pitch: PitchSpec;
  strikes: number;
  outs: number;
  bases: RunnerBases;
}): {
  willSwing: boolean;
  stance: BatterStance;
  targetHitY: number;
} {
  const { difficulty, pitch, strikes, outs, bases } = params;

  // 消える魔球への反応（難易度が高いほど見極める確率UP）
  if (pitch.type === "vanish") {
    const takeChance =
      difficulty === "hard" ? 0.48 : difficulty === "normal" ? 0.28 : 0.14;
    if (Math.random() < takeChance) {
      return { willSwing: false, stance: "contact", targetHitY: HOME_Y - 6 };
    }
    return { willSwing: true, stance: "power", targetHitY: TRAPDOOR_Y + 6 };
  }

  // 送りバント戦術（無死一塁・接戦時たまに）
  if (outs === 0 && bases.first && !bases.second && strikes < 2 && Math.random() < 0.16) {
    return {
      willSwing: true,
      stance: "bunt",
      targetHitY: HOME_Y - 8 + (Math.random() - 0.5) * 6,
    };
  }

  // 見送り判定
  const swingProb = strikes === 2 ? 0.92 : 0.78;
  if (Math.random() > swingProb) {
    return { willSwing: false, stance: "contact", targetHitY: HOME_Y - 6 };
  }

  const preset = pitch.speedPreset ?? "normal";
  const speedExtraJitter =
    preset === "monster"
      ? 9
      : preset === "fast"
      ? 5
      : preset === "chaos"
      ? 11
      : 0;
  const jitterRange =
    (difficulty === "hard" ? 13 : difficulty === "normal" ? 20 : 28) +
    speedExtraJitter;
  // チェンジアップやスロー球は前に突っ込み、剛速球は振り遅れやすくなるリアルな緩急効果
  const speedBias =
    pitch.type === "changeup" || preset === "slow"
      ? -6
      : preset === "monster"
      ? 5
      : 0;
  const targetHitY =
    HOME_Y - 6 + speedBias + (Math.random() - 0.5) * jitterRange;

  const stance: BatterStance =
    Math.random() < (difficulty === "hard" ? 0.42 : 0.28) ? "power" : "contact";

  return { willSwing: true, stance, targetHitY };
}

function advanceForcedRunnersOnWalk(bases: RunnerBases): {
  nextBases: RunnerBases;
  runs: number;
} {
  if (bases.first && bases.second && bases.third) {
    return {
      nextBases: { first: true, second: true, third: true },
      runs: 1,
    };
  }
  if (bases.first && bases.second) {
    return {
      nextBases: { first: true, second: true, third: true },
      runs: 0,
    };
  }
  if (bases.first) {
    return {
      nextBases: { first: true, second: true, third: bases.third },
      runs: 0,
    };
  }
  return {
    nextBases: { first: true, second: bases.second, third: bases.third },
    runs: 0,
  };
}

function advanceRunnersOnHit(
  bases: RunnerBases,
  hitBases: 1 | 2 | 3 | 4,
  outs: number
): {
  nextBases: RunnerBases;
  runs: number;
} {
  if (hitBases === 4) {
    const runnersCount =
      (bases.first ? 1 : 0) + (bases.second ? 1 : 0) + (bases.third ? 1 : 0);
    return {
      nextBases: { first: false, second: false, third: false },
      runs: runnersCount + 1,
    };
  }
  if (hitBases === 3) {
    const runnersCount =
      (bases.first ? 1 : 0) + (bases.second ? 1 : 0) + (bases.third ? 1 : 0);
    return {
      nextBases: { first: false, second: false, third: true },
      runs: runnersCount,
    };
  }
  if (hitBases === 2) {
    let runs = (bases.third ? 1 : 0) + (bases.second ? 1 : 0);
    let third = false;
    if (bases.first) {
      if (outs === 2) {
        runs += 1;
      } else {
        third = true;
      }
    }
    return {
      nextBases: { first: false, second: true, third },
      runs,
    };
  }
  // 単打 (1B): 二・三塁走者は生還、一塁走者は二塁へ
  const runs = (bases.third ? 1 : 0) + (bases.second ? 1 : 0);
  return {
    nextBases: {
      first: true,
      second: bases.first,
      third: false,
    },
    runs,
  };
}

function updateCurrentBatterStats(
  lineup: BoardPlayer[],
  batterIdx: number,
  delta: { ab: number; hits: number; hr: number; rbi: number }
): BoardPlayer[] {
  return lineup.map((p, idx) =>
    idx === batterIdx
      ? {
          ...p,
          atBats: p.atBats + delta.ab,
          hits: p.hits + delta.hits,
          homeRuns: p.homeRuns + delta.hr,
          rbi: p.rbi + delta.rbi,
        }
      : p
  );
}

/**
 * ホームラン競争モードでの1球結果反映
 */
function applyDerbyOutcome(
  state: BaseballBoardMatchState,
  outcome: PlayOutcomeCode,
  detailLabel: string
): PlayApplyResult {
  const next = structuredClone(state);
  let pointsAdded = 0;
  let hrAdded = 0;
  let bannerTitle = detailLabel;
  let bannerTone: PlayApplyResult["bannerTone"] = "neutral";
  let soundKind: PlayApplyResult["soundKind"] = "out";

  if (outcome === "homerun") {
    const isBillboard = detailLabel.includes("看板直撃");
    hrAdded = 1;
    pointsAdded = isBillboard ? 150 : 100;
    bannerTitle = isBillboard
      ? "🎯 看板直撃弾！！ +150pt"
      : "🌈 HOME RUN!! +100pt";
    bannerTone = "hr";
    soundKind = "hr";
    next.homeLineup = updateCurrentBatterStats(next.homeLineup, next.homeBatterIdx, {
      ab: 1,
      hits: 1,
      hr: 1,
      rbi: 1,
    });
  } else if (outcome === "triple") {
    pointsAdded = 50;
    bannerTitle = "🔥 スリーベース！ +50pt";
    bannerTone = "hit";
    soundKind = "3b";
    next.homeLineup = updateCurrentBatterStats(next.homeLineup, next.homeBatterIdx, {
      ab: 1,
      hits: 1,
      hr: 0,
      rbi: 0,
    });
  } else if (outcome === "double") {
    pointsAdded = 35;
    bannerTitle = "⚡ ツーベース！ +35pt";
    bannerTone = "hit";
    soundKind = "2b";
    next.homeLineup = updateCurrentBatterStats(next.homeLineup, next.homeBatterIdx, {
      ab: 1,
      hits: 1,
      hr: 0,
      rbi: 0,
    });
  } else if (outcome === "single") {
    pointsAdded = 20;
    bannerTitle = "✨ ヒット！ +20pt";
    bannerTone = "hit";
    soundKind = "1b";
    next.homeLineup = updateCurrentBatterStats(next.homeLineup, next.homeBatterIdx, {
      ab: 1,
      hits: 1,
      hr: 0,
      rbi: 0,
    });
  } else {
    bannerTitle = `${detailLabel} (+0pt)`;
    bannerTone = "out";
    soundKind = "out";
    next.homeLineup = updateCurrentBatterStats(next.homeLineup, next.homeBatterIdx, {
      ab: 1,
      hits: 0,
      hr: 0,
      rbi: 0,
    });
  }

  next.derbyHomeRuns += hrAdded;
  next.derbyPoints += pointsAdded;
  next.homeScore = next.derbyHomeRuns;
  next.homeHits += outcome === "homerun" || outcome === "triple" || outcome === "double" || outcome === "single" ? 1 : 0;

  if (next.derbyPitchNumber >= DERBY_TOTAL_PITCHES) {
    next.isGameOver = true;
    next.winner = next.derbyHomeRuns >= 3 ? "home" : "draw";
    next.lastCallout = `全${DERBY_TOTAL_PITCHES}球終了！ ${next.derbyHomeRuns}本塁打 / ${next.derbyPoints}pt！`;
    next.lastSubCallout =
      next.derbyHomeRuns >= 5
        ? "驚異のスラッガー！圧巻のアーチショー！"
        : "もう1回挑戦してハイスコアを更新しよう！";
  } else {
    next.derbyPitchNumber += 1;
    next.lastCallout = `${bannerTitle}`;
    next.lastSubCallout = `次が ${next.derbyPitchNumber} / ${DERBY_TOTAL_PITCHES} 球目`;
  }

  return {
    nextState: next,
    runsScored: hrAdded,
    outsAdded: 0,
    halfInningEnded: false,
    isWalkOff: false,
    soundKind,
    bannerTitle,
    bannerTone,
  };
}

/**
 * 1球または1打球の結果を公式野球ルール（四球押し出し・3バント失敗・併殺・犠飛・サヨナラx・延長タイブレーク）に準拠して反映する
 */
export function applyPlayOutcome(
  state: BaseballBoardMatchState,
  outcome: PlayOutcomeCode,
  detailLabel: string,
  usedVanishPitch = false
): PlayApplyResult {
  if (state.isGameOver) {
    return {
      nextState: state,
      runsScored: 0,
      outsAdded: 0,
      halfInningEnded: false,
      isWalkOff: false,
      soundKind: null,
      bannerTitle: state.lastCallout,
      bannerTone: "neutral",
    };
  }

  if (state.mode === "derby") {
    return applyDerbyOutcome(state, outcome, detailLabel);
  }

  const next = structuredClone(state);

  // 消える魔球の残り球数消費（守備側チームが消費）
  if (usedVanishPitch) {
    if (next.isTop) {
      next.homeVanishLeft = Math.max(0, next.homeVanishLeft - 1);
    } else {
      next.awayVanishLeft = Math.max(0, next.awayVanishLeft - 1);
    }
  }

  const battingIsTop = next.isTop;
  const batterIdx = battingIsTop ? next.awayBatterIdx : next.homeBatterIdx;
  const lineup = battingIsTop ? next.awayLineup : next.homeLineup;
  const batter = lineup[batterIdx];
  const batterTag = batter ? `#${batter.uniformNumber} ${batter.name}` : "打者";

  let effectiveOutcome = outcome;

  // カウント変動の解決
  if (effectiveOutcome === "ball") {
    if (next.balls + 1 >= 4) {
      effectiveOutcome = "walk";
    } else {
      next.balls += 1;
      const magicNote = usedVanishPitch ? "（消える魔球を見極めた！）" : "";
      next.lastCallout = `ボール！${magicNote}`;
      next.lastSubCallout = `カウント ${next.balls}B-${next.strikes}S`;
      return {
        nextState: next,
        runsScored: 0,
        outsAdded: 0,
        halfInningEnded: false,
        isWalkOff: false,
        soundKind: null,
        bannerTitle: usedVanishPitch ? "見極め！ BALL" : "BALL",
        bannerTone: usedVanishPitch ? "magic" : "neutral",
      };
    }
  } else if (
    effectiveOutcome === "called_strike" ||
    effectiveOutcome === "swinging_strike"
  ) {
    if (next.strikes + 1 >= 3) {
      effectiveOutcome = "strikeout";
    } else {
      next.strikes += 1;
      next.lastCallout =
        effectiveOutcome === "swinging_strike"
          ? usedVanishPitch
            ? "消える魔球で空振り！！"
            : "空振りストライク！"
          : "見逃しストライク！";
      next.lastSubCallout = `カウント ${next.balls}B-${next.strikes}S`;
      return {
        nextState: next,
        runsScored: 0,
        outsAdded: 0,
        halfInningEnded: false,
        isWalkOff: false,
        soundKind: null,
        bannerTitle: usedVanishPitch ? "✨ 消える魔球！ STRIKE" : "STRIKE!",
        bannerTone: usedVanishPitch ? "magic" : "out",
      };
    }
  } else if (effectiveOutcome === "foul") {
    if (next.strikes < 2) {
      next.strikes += 1;
    }
    next.lastCallout = `${detailLabel}`;
    next.lastSubCallout = `カウント ${next.balls}B-${next.strikes}S`;
    return {
      nextState: next,
      runsScored: 0,
      outsAdded: 0,
      halfInningEnded: false,
      isWalkOff: false,
      soundKind: null,
      bannerTitle: "FOUL!",
      bannerTone: "neutral",
    };
  }

  // ここから先は1打席完了（カウントリセット＆次打者へ）
  next.balls = 0;
  next.strikes = 0;

  let runsScored = 0;
  let outsAdded = 0;
  let hitsAdded = 0;
  let bannerTitle = detailLabel;
  let bannerTone: PlayApplyResult["bannerTone"] = "neutral";
  let soundKind: PlayApplyResult["soundKind"] = "out";

  switch (effectiveOutcome) {
    case "walk": {
      const adv = advanceForcedRunnersOnWalk(next.bases);
      next.bases = adv.nextBases;
      runsScored = adv.runs;
      bannerTitle = runsScored > 0 ? "押し出し四球！ +1点" : "フォアボール！一塁へ";
      bannerTone = "walk";
      soundKind = "walk";
      const updated = updateCurrentBatterStats(lineup, batterIdx, {
        ab: 0,
        hits: 0,
        hr: 0,
        rbi: runsScored,
      });
      if (battingIsTop) next.awayLineup = updated;
      else next.homeLineup = updated;
      break;
    }
    case "strikeout":
    case "three_bunt_out": {
      outsAdded = 1;
      bannerTitle =
        effectiveOutcome === "three_bunt_out"
          ? "スリーバント失敗！三振アウト！"
          : usedVanishPitch
          ? "✨ 消える魔球で空振り三振！！"
          : "三振アウト！！";
      bannerTone = usedVanishPitch ? "magic" : "out";
      soundKind = "strikeout";
      const updated = updateCurrentBatterStats(lineup, batterIdx, {
        ab: 1,
        hits: 0,
        hr: 0,
        rbi: 0,
      });
      if (battingIsTop) next.awayLineup = updated;
      else next.homeLineup = updated;
      break;
    }
    case "double_play": {
      outsAdded = Math.min(3 - next.outs, 2);
      // 一塁走者封殺＋打者一塁アウト（第3アウトになる場合は三塁走者得点なし）
      const totalOuts = next.outs + outsAdded;
      if (totalOuts >= 3) {
        next.bases = { first: false, second: false, third: false };
      } else {
        // 無死からの併殺（2死になる）：三塁走者がいれば生還（打点0）、二塁走者は三塁へ
        if (next.bases.third) {
          runsScored = 1;
        }
        next.bases = {
          first: false,
          second: false,
          third: next.bases.second,
        };
      }
      bannerTitle = "⚡ 6-4-3 ダブルプレー！！";
      bannerTone = "out";
      soundKind = "dp";
      const updated = updateCurrentBatterStats(lineup, batterIdx, {
        ab: 1,
        hits: 0,
        hr: 0,
        rbi: 0,
      });
      if (battingIsTop) next.awayLineup = updated;
      else next.homeLineup = updated;
      break;
    }
    case "sac_fly": {
      outsAdded = 1;
      runsScored = 1;
      next.bases = { ...next.bases, third: false };
      bannerTitle = `${detailLabel} タッチアップ生還！（犠飛 +1点）`;
      bannerTone = "hit";
      soundKind = "1b";
      // 犠飛は打数に含めない（打点1）
      const updated = updateCurrentBatterStats(lineup, batterIdx, {
        ab: 0,
        hits: 0,
        hr: 0,
        rbi: 1,
      });
      if (battingIsTop) next.awayLineup = updated;
      else next.homeLineup = updated;
      break;
    }
    case "sac_bunt": {
      outsAdded = 1;
      runsScored = next.bases.third && next.outs < 2 ? 1 : 0;
      next.bases = {
        first: false,
        second: next.bases.first,
        third: next.bases.second,
      };
      bannerTitle =
        runsScored > 0
          ? "スクイズ成功！！ +1点"
          : "送りバント成功！走者進塁！";
      bannerTone = runsScored > 0 ? "hit" : "walk";
      soundKind = runsScored > 0 ? "1b" : "out";
      const updated = updateCurrentBatterStats(lineup, batterIdx, {
        ab: 0,
        hits: 0,
        hr: 0,
        rbi: runsScored,
      });
      if (battingIsTop) next.awayLineup = updated;
      else next.homeLineup = updated;
      break;
    }
    case "ground_out":
    case "fly_out": {
      outsAdded = 1;
      bannerTitle = detailLabel;
      bannerTone = "out";
      soundKind = "out";
      const updated = updateCurrentBatterStats(lineup, batterIdx, {
        ab: 1,
        hits: 0,
        hr: 0,
        rbi: 0,
      });
      if (battingIsTop) next.awayLineup = updated;
      else next.homeLineup = updated;
      break;
    }
    case "single":
    case "double":
    case "triple":
    case "homerun": {
      const hitBases =
        effectiveOutcome === "homerun"
          ? 4
          : effectiveOutcome === "triple"
          ? 3
          : effectiveOutcome === "double"
          ? 2
          : 1;
      const adv = advanceRunnersOnHit(next.bases, hitBases, next.outs);
      next.bases = adv.nextBases;
      runsScored = adv.runs;
      hitsAdded = 1;
      if (effectiveOutcome === "homerun") {
        const isBillboard = detailLabel.includes("看板直撃");
        const hrKind =
          runsScored === 4
            ? "満塁ホームラン！！"
            : runsScored === 3
            ? "3ランホームラン！！"
            : runsScored === 2
            ? "2ランホームラン！！"
            : "ソロホームラン！！";
        bannerTitle = isBillboard
          ? `🎯 看板直撃！${hrKind} (+${runsScored}点)`
          : `🌈 ${hrKind} (+${runsScored}点)`;
        bannerTone = "hr";
        soundKind = "hr";
      } else if (effectiveOutcome === "triple") {
        bannerTitle =
          runsScored > 0
            ? `🔥 タイムリースリーベース！ (+${runsScored}点)`
            : `🔥 ${detailLabel}`;
        bannerTone = "hit";
        soundKind = "3b";
      } else if (effectiveOutcome === "double") {
        bannerTitle =
          runsScored > 0
            ? `⚡ タイムリーツーベース！ (+${runsScored}点)`
            : `⚡ ${detailLabel}`;
        bannerTone = "hit";
        soundKind = "2b";
      } else {
        bannerTitle =
          runsScored > 0
            ? `✨ タイムリーヒット！ (+${runsScored}点)`
            : `✨ ${detailLabel}`;
        bannerTone = "hit";
        soundKind = "1b";
      }
      const updated = updateCurrentBatterStats(lineup, batterIdx, {
        ab: 1,
        hits: 1,
        hr: effectiveOutcome === "homerun" ? 1 : 0,
        rbi: runsScored,
      });
      if (battingIsTop) next.awayLineup = updated;
      else next.homeLineup = updated;
      break;
    }
  }

  // スコア・安打・打順更新
  while (next.innings.length < next.inning) {
    next.innings.push({ top: null, bottom: null });
  }
  const inningCell = next.innings[next.inning - 1];

  if (battingIsTop) {
    next.awayScore += runsScored;
    next.awayHits += hitsAdded;
    next.awayBatterIdx = (next.awayBatterIdx + 1) % 9;
    if (inningCell) {
      inningCell.top = (inningCell.top ?? 0) + runsScored;
    }
  } else {
    next.homeScore += runsScored;
    next.homeHits += hitsAdded;
    next.homeBatterIdx = (next.homeBatterIdx + 1) % 9;
    if (inningCell) {
      const prevBottom =
        typeof inningCell.bottom === "number" ? inningCell.bottom : 0;
      inningCell.bottom = prevBottom + runsScored;
    }
  }

  next.outs += outsAdded;

  // 1) 最終回裏（または延長裏）でのサヨナラ勝ち判定！
  if (
    !battingIsTop &&
    next.inning >= next.totalInnings &&
    next.homeScore > next.awayScore
  ) {
    if (inningCell) {
      const bottomRuns =
        typeof inningCell.bottom === "number" ? inningCell.bottom : runsScored;
      inningCell.bottomWalkOffRuns = bottomRuns;
    }
    next.isGameOver = true;
    next.winner = "home";
    next.lastCallout = `${batterTag} — サヨナラ勝ち！！`;
    next.lastSubCallout = `${next.awayTeamName} ${next.awayScore} - ${next.homeScore}x ${next.homeTeamName}`;
    return {
      nextState: next,
      runsScored,
      outsAdded,
      halfInningEnded: true,
      isWalkOff: true,
      soundKind: effectiveOutcome === "homerun" ? "hr" : "2b",
      bannerTitle: `🏆 サヨナラ！！ ${bannerTitle}`,
      bannerTone: "hr",
    };
  }

  // 2) 3アウトチェンジ判定
  let halfInningEnded = false;
  if (next.outs >= 3) {
    halfInningEnded = true;
    next.outs = 0;
    next.balls = 0;
    next.strikes = 0;
    next.bases = { first: false, second: false, third: false };

    if (battingIsTop) {
      // 最終回表終了時点で後攻（裏）がリードしていれば後攻X勝ち（裏省略）
      if (next.inning >= next.totalInnings && next.homeScore > next.awayScore) {
        if (inningCell) {
          inningCell.bottom = "x";
        }
        next.isGameOver = true;
        next.winner = "home";
        next.lastCallout = `試合終了！ ${next.homeTeamName} の勝利！`;
        next.lastSubCallout = `${next.awayTeamName} ${next.awayScore} - ${next.homeScore}X ${next.homeTeamName}`;
      } else {
        next.isTop = false;
        const nextBottomCell = next.innings[next.inning - 1];
        if (nextBottomCell && nextBottomCell.bottom === null) {
          nextBottomCell.bottom = 0;
        }
        // 延長戦（タイブレーク：無死一・二塁スタート！）
        if (next.inning > next.totalInnings) {
          next.bases = { first: true, second: true, third: false };
          next.lastCallout = `${bannerTitle}（3アウト交代・延長タイブレーク無死一・二塁！）`;
        } else {
          next.lastCallout = `${bannerTitle}（3アウトチェンジ！${next.inning}回裏へ）`;
        }
        next.lastSubCallout = `${next.homeTeamName} の攻撃`;
      }
    } else {
      // 裏終了時：規定回数以降で勝敗がついていれば試合終了
      if (next.inning >= next.totalInnings) {
        if (next.awayScore > next.homeScore) {
          next.isGameOver = true;
          next.winner = "away";
          next.lastCallout = `試合終了！ ${next.awayTeamName} の勝利！`;
          next.lastSubCallout = `${next.awayTeamName} ${next.awayScore} - ${next.homeScore} ${next.homeTeamName}`;
        } else if (next.inning >= next.totalInnings + 2) {
          // 延長2回まで消化して同点なら引き分け
          next.isGameOver = true;
          next.winner = "draw";
          next.lastCallout = `規定延長終了・引き分け！ (${next.awayScore} - ${next.homeScore})`;
          next.lastSubCallout = "白熱の総力戦！ナイスゲーム！";
        } else {
          // 延長タイブレーク突入（無死一・二塁）
          next.inning += 1;
          next.isTop = true;
          next.innings.push({ top: 0, bottom: null });
          next.bases = { first: true, second: true, third: false };
          next.lastCallout = `同点のまま延長${next.inning}回タイブレーク（無死一・二塁）へ！`;
          next.lastSubCallout = `${next.awayTeamName} の攻撃`;
        }
      } else {
        next.inning += 1;
        next.isTop = true;
        while (next.innings.length < next.inning) {
          next.innings.push({ top: null, bottom: null });
        }
        const nextTopCell = next.innings[next.inning - 1];
        if (nextTopCell && nextTopCell.top === null) {
          nextTopCell.top = 0;
        }
        next.lastCallout = `${bannerTitle}（3アウトチェンジ！${next.inning}回表へ）`;
        next.lastSubCallout = `${next.awayTeamName} の攻撃`;
      }
    }
  } else {
    next.lastCallout = `${batterTag}: ${bannerTitle}`;
    next.lastSubCallout = `${next.outs}アウト / ${formatRunnerSituationLabel(next.bases)}`;
  }

  return {
    nextState: next,
    runsScored,
    outsAdded,
    halfInningEnded,
    isWalkOff: false,
    soundKind,
    bannerTitle,
    bannerTone,
  };
}

export function formatRunnerSituationLabel(bases: RunnerBases): string {
  if (bases.first && bases.second && bases.third) return "満塁";
  if (bases.first && bases.second) return "一・二塁";
  if (bases.first && bases.third) return "一・三塁";
  if (bases.second && bases.third) return "二・三塁";
  if (bases.first) return "一塁";
  if (bases.second) return "二塁";
  if (bases.third) return "三塁";
  return "走者なし";
}

function getStatsStorageKey(teamId: string): string {
  const safeId = (teamId || "demo-team").trim() || "demo-team";
  return `iscore_baseball_board_stats_v1_${safeId}`;
}

export function loadBaseballBoardLocalStats(teamId: string): BaseballBoardLocalStats {
  if (typeof window === "undefined") return { ...EMPTY_LOCAL_STATS };
  try {
    const raw = localStorage.getItem(getStatsStorageKey(teamId));
    if (!raw) return { ...EMPTY_LOCAL_STATS };
    const parsed = JSON.parse(raw) as Partial<BaseballBoardLocalStats>;
    return {
      gamesPlayed: typeof parsed.gamesPlayed === "number" ? parsed.gamesPlayed : 0,
      wins: typeof parsed.wins === "number" ? parsed.wins : 0,
      losses: typeof parsed.losses === "number" ? parsed.losses : 0,
      draws: typeof parsed.draws === "number" ? parsed.draws : 0,
      totalHomeRuns: typeof parsed.totalHomeRuns === "number" ? parsed.totalHomeRuns : 0,
      bestSingleGameRuns:
        typeof parsed.bestSingleGameRuns === "number" ? parsed.bestSingleGameRuns : 0,
      derbyHighScore: typeof parsed.derbyHighScore === "number" ? parsed.derbyHighScore : 0,
      derbyBestHr: typeof parsed.derbyBestHr === "number" ? parsed.derbyBestHr : 0,
      maxExitVelocityKmh:
        typeof parsed.maxExitVelocityKmh === "number" ? parsed.maxExitVelocityKmh : 0,
    };
  } catch {
    return { ...EMPTY_LOCAL_STATS };
  }
}

export function recordMaxExitVelocityToLocalStats(
  teamId: string,
  exitVelocityKmh: number
): BaseballBoardLocalStats {
  const current = loadBaseballBoardLocalStats(teamId);
  if (exitVelocityKmh <= current.maxExitVelocityKmh) return current;
  const next: BaseballBoardLocalStats = {
    ...current,
    maxExitVelocityKmh: Math.round(exitVelocityKmh),
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(getStatsStorageKey(teamId), JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return next;
}

export function recordFinishedGameToLocalStats(
  teamId: string,
  state: BaseballBoardMatchState
): BaseballBoardLocalStats {
  const current = loadBaseballBoardLocalStats(teamId);
  const next = { ...current };

  if (state.mode === "derby") {
    next.totalHomeRuns += state.derbyHomeRuns;
    next.derbyHighScore = Math.max(next.derbyHighScore, state.derbyPoints);
    next.derbyBestHr = Math.max(next.derbyBestHr, state.derbyHomeRuns);
  } else {
    next.gamesPlayed += 1;
    const isMyHome = state.playerSide === "home";
    const myRuns = isMyHome ? state.homeScore : state.awayScore;
    const myLineup = isMyHome ? state.homeLineup : state.awayLineup;
    const myHrs = myLineup.reduce((acc, p) => acc + p.homeRuns, 0);
    const otherHrs =
      state.mode === "versus"
        ? (isMyHome ? state.awayLineup : state.homeLineup).reduce(
            (acc, p) => acc + p.homeRuns,
            0
          )
        : 0;
    next.totalHomeRuns += myHrs + otherHrs;
    next.bestSingleGameRuns = Math.max(
      next.bestSingleGameRuns,
      state.mode === "versus" ? Math.max(state.awayScore, state.homeScore) : myRuns
    );
    if (state.winner === "draw" || state.winner === null) {
      next.draws += 1;
    } else if (
      state.mode === "versus"
        ? state.winner === "away"
        : state.winner === state.playerSide
    ) {
      next.wins += 1;
    } else {
      next.losses += 1;
    }
  }

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(getStatsStorageKey(teamId), JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }
  return next;
}

export function resetBaseballBoardLocalStats(teamId: string): BaseballBoardLocalStats {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(getStatsStorageKey(teamId));
    } catch {
      // ignore
    }
  }
  return { ...EMPTY_LOCAL_STATS };
}

/**
 * LINE共有用テキスト生成（※公式試合速報と絶対に混同しないよう【野球盤ミニゲーム】と明記）
 */
export function buildBaseballBoardShareText(state: BaseballBoardMatchState): string {
  if (state.mode === "derby") {
    return [
      "【⚾ iScore 野球盤｜ホームラン競争】",
      `打者チーム: ${state.homeTeamName}`,
      `結果: 全${DERBY_TOTAL_PITCHES}球中 ${state.derbyHomeRuns}本塁打 / ${state.derbyPoints}pt！`,
      "iScoreCloud LINEミニアプリの「野球盤ゲーム」で挑戦しよう！",
    ].join("\n");
  }

  const inningNums = state.innings.map((_, idx) => `${idx + 1}`).join(" ");
  const topLine = state.innings
    .map((c) => (c.top === null ? "-" : String(c.top)))
    .join(" ");
  const bottomLine = state.innings
    .map((c) => {
      if (c.bottom === null) return "-";
      if (c.bottom === "x") return "X";
      if (typeof c.bottomWalkOffRuns === "number") return `${c.bottom}x`;
      return String(c.bottom);
    })
    .join(" ");

  const allPlayers = [...state.awayLineup, ...state.homeLineup];
  const sluggers = allPlayers
    .filter((p) => p.homeRuns > 0)
    .map((p) => `#${p.uniformNumber} ${p.name}(${p.homeRuns}本)`);

  const lines = [
    "【⚾ iScore 野球盤ミニゲーム 結果】",
    `${state.awayTeamName} ${state.awayScore} - ${state.homeScore}${
      state.innings.some((c) => typeof c.bottomWalkOffRuns === "number")
        ? "x"
        : state.innings.some((c) => c.bottom === "x")
        ? "X"
        : ""
    } ${state.homeTeamName}`,
    `回｜${inningNums}｜計`,
    `先｜${topLine}｜${state.awayScore}`,
    `後｜${bottomLine}｜${state.homeScore}`,
  ];

  if (sluggers.length > 0) {
    lines.push(`🌈 本塁打: ${sluggers.join("、")}`);
  }
  lines.push("※アプリ内ミニゲームの対戦結果です");
  return lines.join("\n");
}
