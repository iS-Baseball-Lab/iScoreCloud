// filepath: src/app/matches/play-logs/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit2, Trash2, History } from "lucide-react";
interface PlayLog {
  id: string;
  gameId: string;
  gameTitle: string;
  inning: number;
  topBottom: "top" | "bottom";
  batterName: string;
  pitcherName: string;
  balls: number;
  strikes: number;
  outs: number;
  result: string;
  description: string;
  createdAt: string;
}

// ダミーデータ
const MOCK_PLAY_LOGS: PlayLog[] = [
  {
    id: "log-1",
    gameId: "game-1",
    gameTitle: "春季大会 1回戦",
    inning: 3,
    topBottom: "top",
    batterName: "佐藤 (守)",
    pitcherName: "鈴木",
    balls: 2,
    strikes: 1,
    outs: 1,
    result: "レフト前ヒット",
    description: "高めのストレートをジャストミート",
    createdAt: "2026-05-25 10:30",
  },
];

export default function PlayLogsPage() {
  const [logs, setLogs] = useState<PlayLog[]>(MOCK_PLAY_LOGS);

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center bg-background">
        <div className="p-4 bg-muted rounded-full mb-4">
          <History className="w-12 h-12 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-black mb-2">プレイログがありません</h3>
        <Link href="/matches" className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-[var(--radius-xl)] shadow-md">
          試合一覧へ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto bg-background min-h-screen pb-24">
      <div>
        <span className="text-xs font-black text-muted-foreground tracking-wider block uppercase">PLAY LOGS</span>
        <h1 className="text-2xl font-black text-foreground">プレイログ閲覧</h1>
      </div>

      <div className="space-y-3">
        {logs.map((log) => (
          <div
            key={log.id}
            className="relative overflow-hidden border border-border bg-card shadow-sm"
            style={{
              borderRadius: "16px",
              WebkitMaskImage: "-webkit-linear-gradient(white, white)",
              maskImage: "linear-gradient(white, white)",
            }}
          >
            {/* 背面アクションボタン */}
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1 z-0">
              {/* 🔥 クエリパラメータ形式（?id=xxx）に変更 */}
              <Link
                href={`/matches/play-logs/edit?id=${log.id}`}
                className="p-3 bg-blue-600 text-white rounded-xl flex items-center justify-center"
              >
                <Edit2 className="w-5 h-5" />
              </Link>
              <button
                onClick={() => setLogs(logs.filter((l) => l.id !== log.id))}
                className="p-3 bg-destructive text-destructive-foreground rounded-xl flex items-center justify-center"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            {/* 前面カード本体 */}
            <div className="relative z-10 bg-card p-4 border-b border-border transition-transform duration-200 active:translate-x-[-96px] rounded-none">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="bg-foreground text-background font-black text-xs px-2 py-0.5 rounded">
                    {log.inning}回{log.topBottom === "top" ? "表" : "裏"}
                  </span>
                  <span className="text-sm font-bold text-muted-foreground">{log.gameTitle}</span>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{log.createdAt}</span>
              </div>

              <div className="flex justify-between items-center my-3">
                <div>
                  <div className="text-xs text-muted-foreground">投手: {log.pitcherName} vs 打者:</div>
                  <div className="text-lg font-black text-foreground">{log.batterName}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">結果</div>
                  <div className="text-lg font-black text-primary">{log.result}</div>
                </div>
              </div>

              {/* BSO・フラット表示 */}
              <div className="flex items-center gap-4 bg-muted/50 p-2 rounded-xl border border-border/50">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black w-4 text-yellow-500">B</span>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < log.balls ? "bg-yellow-500" : "bg-neutral-700"}`} />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black w-4 text-red-500">S</span>
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < log.strikes ? "bg-red-500" : "bg-neutral-700"}`} />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black w-4 text-blue-500">O</span>
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < log.outs ? "bg-blue-500" : "bg-neutral-700"}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
