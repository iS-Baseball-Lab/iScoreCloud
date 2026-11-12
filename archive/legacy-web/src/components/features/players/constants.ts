// src/components/features/players/constants.ts
/* 💡 選手関連の定数・UI用カラー設定 */
import { PositionKey, PosCategory } from "@/types/player";

export const POSITION_LABELS: Record<PositionKey, string> = {
  P: "投手", C: "捕手", "1B": "一塁", "2B": "二塁", "3B": "三塁",
  SS: "遊撃", LF: "左翼", CF: "中堅", RF: "右翼", DH: "指名打者",
};

export const POSITION_CATEGORY: Record<PositionKey, PosCategory> = {
  P: "投手", C: "捕手",
  "1B": "内野手", "2B": "内野手", "3B": "内野手", SS: "内野手",
  LF: "外野手", CF: "外野手", RF: "外野手",
  DH: "DH",
};

export const POSITION_COLOR: Record<PosCategory, {
  accent: string;       
  accentText: string;   
  badge: string;        
  dot: string;          
  filter: string;       
}> = {
  投手: {
    accent: "bg-blue-500", accentText: "text-white",
    badge: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
    dot: "bg-blue-500", filter: "bg-blue-500/15 text-blue-700 border-blue-500/40 dark:text-blue-300",
  },
  捕手: {
    accent: "bg-orange-500", accentText: "text-white",
    badge: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400",
    dot: "bg-orange-500", filter: "bg-orange-500/15 text-orange-700 border-orange-500/40 dark:text-orange-300",
  },
  内野手: {
    accent: "bg-emerald-500", accentText: "text-white",
    badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
    dot: "bg-emerald-500", filter: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300",
  },
  外野手: {
    accent: "bg-amber-500", accentText: "text-white",
    badge: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
    dot: "bg-amber-500", filter: "bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-300",
  },
  DH: {
    accent: "bg-purple-500", accentText: "text-white",
    badge: "bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-400",
    dot: "bg-purple-500", filter: "bg-purple-500/15 text-purple-700 border-purple-500/40 dark:text-purple-300",
  },
  未設定: {
    accent: "bg-muted", accentText: "text-muted-foreground",
    badge: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/50", filter: "bg-muted text-muted-foreground border-border",
  },
};

export function getCategory(pos: string | null): PosCategory {
  if (!pos) return "未設定";
  return POSITION_CATEGORY[pos as PositionKey] ?? "未設定";
}
