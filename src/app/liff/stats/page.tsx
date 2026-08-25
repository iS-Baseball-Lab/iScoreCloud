// filepath: src/app/liff/stats/page.tsx
"use client";

import React, { useState } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { Trophy, Award, TrendingUp, User, Flame, Activity } from "lucide-react";

export default function LiffStatsPage() {
  const [tab, setTab] = useState<"team" | "batting" | "pitching">("batting");

  // モックデータ
  const teamStats = {
    matches: 16,
    wins: 12,
    losses: 3,
    draws: 1,
    winRate: ".800",
    runsScored: 98,
    runsAllowed: 42,
  };

  const battingRankings = [
    { rank: 1, name: "佐藤 翔太", uniform: "10", value: ".438", label: "打率", detail: "32打数 14安打" },
    { rank: 2, name: "鈴木 蓮", uniform: "1", value: ".387", label: "打率", detail: "31打数 12安打" },
    { rank: 3, name: "田中 健太", uniform: "6", value: ".355", label: "打率", detail: "31打数 11安打" },
  ];

  const hrRankings = [
    { rank: 1, name: "渡辺 陽向", uniform: "4", value: "3 本", label: "本塁打", detail: "打点 12" },
    { rank: 2, name: "佐藤 翔太", uniform: "10", value: "2 本", label: "本塁打", detail: "打点 9" },
    { rank: 3, name: "山下 颯太", uniform: "8", value: "2 本", label: "本塁打", detail: "打点 8" },
  ];

  const pitchingRankings = [
    { rank: 1, name: "鈴木 蓮", uniform: "1", value: "1.85", label: "防御率", detail: "24回 奪三振 28 (5勝0敗)" },
    { rank: 2, name: "高橋 陸", uniform: "11", value: "2.40", label: "防御率", detail: "18回 奪三振 19 (4勝1敗)" },
    { rank: 3, name: "小林 樹", uniform: "18", value: "3.15", label: "防御率", detail: "12回 奪三振 10 (3勝2敗)" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader
        title="成績 & ランキング"
        subtitle="2026年度 チーム・個人スタッツ"
        showBack
        shareData={{
          title: `【成績速報】チーム勝率 ${teamStats.winRate} (${teamStats.wins}勝${teamStats.losses}敗)`,
          text: `打率・本塁打・投手成績ランキングをチェック！`,
        }}
      />

      <div className="p-4 space-y-5">
        {/* 🏆 チーム勝敗サマリーカード */}
        <section className="bg-card border-2 border-amber-500/40 rounded-3xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-black text-xs text-amber-600 dark:text-amber-400">
              <Trophy className="w-4 h-4 shrink-0" />
              <span>2026シーズン 通算成績</span>
            </div>
            <span className="text-xs font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
              勝率 {teamStats.winRate}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center pt-1">
            <div className="p-2 rounded-2xl bg-muted/50 border border-border/50">
              <span className="text-[10px] text-muted-foreground font-bold block">試合</span>
              <span className="text-base font-black text-foreground">{teamStats.matches}</span>
            </div>
            <div className="p-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[10px] text-emerald-600 font-bold block">勝利</span>
              <span className="text-base font-black text-emerald-600">{teamStats.wins}</span>
            </div>
            <div className="p-2 rounded-2xl bg-rose-500/10 border border-rose-500/20">
              <span className="text-[10px] text-rose-600 font-bold block">敗戦</span>
              <span className="text-base font-black text-rose-600">{teamStats.losses}</span>
            </div>
            <div className="p-2 rounded-2xl bg-muted/50 border border-border/50">
              <span className="text-[10px] text-muted-foreground font-bold block">引分</span>
              <span className="text-base font-black text-foreground">{teamStats.draws}</span>
            </div>
          </div>
        </section>

        {/* スタッツカテゴリタブ */}
        <div className="flex p-1 bg-muted/60 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setTab("batting")}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
              tab === "batting"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🏏 打撃ランキング
          </button>
          <button
            type="button"
            onClick={() => setTab("pitching")}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
              tab === "pitching"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ⚾ 投手ランキング
          </button>
        </div>

        {/* 打撃ランキング表示 */}
        {tab === "batting" && (
          <div className="space-y-4">
            {/* 打率TOP3 */}
            <div className="bg-card border border-border rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-rose-500" />
                  <span>打率 リーダー TOP3</span>
                </h3>
              </div>

              <div className="space-y-2">
                {battingRankings.map((item) => (
                  <div
                    key={item.rank}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-5 h-5 rounded-md font-black text-xs flex items-center justify-center ${
                          item.rank === 1
                            ? "bg-amber-400 text-amber-950 shadow-xs"
                            : item.rank === 2
                            ? "bg-slate-300 text-slate-800"
                            : "bg-amber-700/30 text-amber-900 dark:text-amber-200"
                        }`}
                      >
                        {item.rank}
                      </span>
                      <div>
                        <span className="font-bold text-foreground">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1.5">
                          #{item.uniform}
                        </span>
                        <span className="text-[10px] text-muted-foreground block">
                          {item.detail}
                        </span>
                      </div>
                    </div>

                    <span className="text-base font-black tabular-nums text-foreground">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 本塁打TOP3 */}
            <div className="bg-card border border-border rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  <span>本塁打 リーダー TOP3</span>
                </h3>
              </div>

              <div className="space-y-2">
                {hrRankings.map((item) => (
                  <div
                    key={item.rank}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-5 h-5 rounded-md font-black text-xs flex items-center justify-center ${
                          item.rank === 1
                            ? "bg-amber-400 text-amber-950 shadow-xs"
                            : item.rank === 2
                            ? "bg-slate-300 text-slate-800"
                            : "bg-amber-700/30 text-amber-900 dark:text-amber-200"
                        }`}
                      >
                        {item.rank}
                      </span>
                      <div>
                        <span className="font-bold text-foreground">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1.5">
                          #{item.uniform}
                        </span>
                        <span className="text-[10px] text-muted-foreground block">
                          {item.detail}
                        </span>
                      </div>
                    </div>

                    <span className="text-base font-black tabular-nums text-foreground">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 投手ランキング表示 */}
        {tab === "pitching" && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-blue-500" />
                  <span>防御率 リーダー TOP3</span>
                </h3>
              </div>

              <div className="space-y-2">
                {pitchingRankings.map((item) => (
                  <div
                    key={item.rank}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-5 h-5 rounded-md font-black text-xs flex items-center justify-center ${
                          item.rank === 1
                            ? "bg-amber-400 text-amber-950 shadow-xs"
                            : item.rank === 2
                            ? "bg-slate-300 text-slate-800"
                            : "bg-amber-700/30 text-amber-900 dark:text-amber-200"
                        }`}
                      >
                        {item.rank}
                      </span>
                      <div>
                        <span className="font-bold text-foreground">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1.5">
                          #{item.uniform}
                        </span>
                        <span className="text-[10px] text-muted-foreground block">
                          {item.detail}
                        </span>
                      </div>
                    </div>

                    <span className="text-base font-black tabular-nums text-foreground">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
