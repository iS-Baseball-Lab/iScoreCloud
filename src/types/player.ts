// src/types/player.ts
/* 💡 選手関連の型定義 */

export interface Player {
  id: string;
  name: string;
  nameKana?: string | null;
  uniformNumber: string;
  primaryPosition: string | null;
  throws: string | null;
  bats: string | null;
  isActive: number | boolean;
  profileImageUrl?: string | null;
}

export type PositionKey = "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF" | "DH";
export type PosCategory = "投手" | "捕手" | "内野手" | "外野手" | "DH" | "未設定";

export interface PlayerFormData {
  name: string;
  nameKana?: string;
  uniformNumber: string;
  primaryPosition: string;
  throws: string;
  bats: string;
  profileImageUrl?: string;
}
