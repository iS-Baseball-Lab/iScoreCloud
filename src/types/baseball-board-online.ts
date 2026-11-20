// filepath: src/types/baseball-board-online.ts
import type {
  BaseballBoardMatchState,
  BatterStance,
  PitchSpec,
  PitchSpeedPreset,
  PlayApplyResult,
  PlayOutcomeCode,
} from "@/lib/liff/baseball-board-engine";

export type OnlineRoomStatus = "waiting" | "playing" | "finished" | "closed";
export type OnlineParticipantRole = "host" | "guest" | "spectator";
export type OnlineTeamSide = "away" | "home";

export interface OnlineBatterReplayContact {
  ballX: number;
  ballY: number;
  vx: number;
  vy: number;
  vz: number;
  peakZ: number;
  exitVelocityKmh: number;
}

export interface OnlinePlayReplayData {
  didSwing: boolean;
  swingTriggerY: number;
  stance: BatterStance;
  whiffDetail?: string;
  contact: OnlineBatterReplayContact | null;
}

export interface OnlineResolvedPlayPayload {
  outcome: PlayOutcomeCode;
  detailLabel: string;
  usedVanishPitch: boolean;
  pitchKmh: number;
  exitVelocityKmh: number;
}

export interface OnlineCurrentPitchPayload {
  seq: number;
  pitch: PitchSpec;
  speedPreset: PitchSpeedPreset;
  thrownAtMs: number;
}

export interface OnlineLastPlayPayload {
  seq: number;
  pitch: PitchSpec;
  speedPreset: PitchSpeedPreset;
  replayData: OnlinePlayReplayData;
  resolvedPlay: OnlineResolvedPlayPayload;
  bannerTitle: string;
  bannerTone: PlayApplyResult["bannerTone"];
  soundKind: PlayApplyResult["soundKind"];
  resolvedAtMs: number;
}

export interface OnlineRoomSummary {
  id: string;
  teamId: string;
  roomCode: string;
  status: OnlineRoomStatus;
  totalInnings: number;
  hostName: string;
  hostSide: OnlineTeamSide;
  guestName: string | null;
  awayScore: number;
  homeScore: number;
  inning: number;
  isTop: boolean;
  isMine: boolean;
  canJoin: boolean;
  updatedAt: number;
}

export interface OnlineRoomDetail {
  id: string;
  teamId: string;
  roomCode: string;
  status: OnlineRoomStatus;
  totalInnings: number;
  hostName: string;
  hostSide: OnlineTeamSide;
  guestName: string | null;
  myRole: OnlineParticipantRole;
  mySide: OnlineTeamSide | null;
  myDisplayName: string;
  opponentName: string | null;
  opponentOnline: boolean;
  turnSeq: number;
  pitchSeq: number;
  canRetryStuckPitch: boolean;
  rematchRequestedBy: "host" | "guest" | null;
  currentPitch: OnlineCurrentPitchPayload | null;
  lastPlay: OnlineLastPlayPayload | null;
  matchState: BaseballBoardMatchState;
  updatedAt: number;
}

export interface OnlineRoomsListResponse {
  success: boolean;
  myDefaultName?: string;
  rooms?: OnlineRoomSummary[];
  error?: string;
  isForbidden?: boolean;
}

export interface OnlineRoomActionResponse {
  success: boolean;
  room?: OnlineRoomDetail;
  alreadyResolved?: boolean;
  error?: string;
  isForbidden?: boolean;
}
