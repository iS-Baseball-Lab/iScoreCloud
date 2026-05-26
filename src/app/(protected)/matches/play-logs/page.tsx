// filepath: src/app/(protected)/matches/play-logs/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { PlayLogCard, PlayLog } from "@/components/matches/PlayLogCard";

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
    description: "高めのストレートをジャストミートし、三遊間を鋭く抜けるレフト前安打。ランナー進塁。",
    createdAt: "2026-05-25 10:30",
  },
];

export default function PlayLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<PlayLog[]>(MOCK_PLAY_LOGS);

  const handleEdit = (id: string) => {
    router.push(`/matches/play-logs/edit?id=${id}`);
  };

  const handleDelete = (id: string) => {
    setLogs(prev => prev.filter(log => log.id !== id));
  };

  return (
    <div className="min-h-screen pb-28 animate-in fade-in duration-400">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-6">
        
        {/* ━━ 戻るボタン & セクションヘッダー ━━ */}
        <div className="space-y-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => router.back()}
            className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
            戻る
          </Button>
          <SectionHeader 
            title="プレイログ一覧" 
            subtitle="PLAY LOGS" 
            showPulse={false} 
          />
        </div>

        {/* ━━ ログカードリスト ━━ */}
        <div className="grid grid-cols-1 gap-3">
          {logs.length === 0 ? (
            <EmptyState 
              icon={History} 
              title="プレイログがありません" 
              description="試合中に入力された打席結果のログがここに表示されます" 
              className="mt-4"
            />
          ) : (
            logs.map(log => (
              <PlayLogCard 
                key={log.id} 
                log={log} 
                onEdit={handleEdit} 
                onDelete={handleDelete} 
              />
            ))
          )}
        </div>

      </div>
    </div>
  );
}
