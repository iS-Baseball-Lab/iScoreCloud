// filepath: src/app/liff/tools/cheer-songs/page.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  LiffToolSubNav,
  LiffToolOtherLinks,
} from "@/components/liff/LiffToolSubNav";
import {
  Music,
  Volume2,
  Users,
  Sparkles,
  ArrowRight,
  IdCard,
} from "lucide-react";

interface SamplePlayer {
  id: string;
  number: string;
  callName: string;
}

const SAMPLE_PLAYERS: SamplePlayer[] = [
  { id: "p1", number: "10", callName: "タロウ" },
  { id: "p2", number: "1", callName: "ハルト" },
  { id: "p3", number: "6", callName: "ソウタ" },
  { id: "p4", number: "2", callName: "リク" },
];

export default function LiffCheerSongsPage() {
  const [selectedPlayer, setSelectedPlayer] = useState<SamplePlayer>(
    SAMPLE_PLAYERS[0]
  );
  const [selectedCategory, setSelectedCategory] = useState<
    "attack" | "chance" | "call"
  >("attack");

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="応援歌あんちょこ"
          subtitle="CHEER SONG LYRICS"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
              <Music className="w-4 h-4" />
            </span>
          }
          rightElement={
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-primary/10 text-primary border border-primary/25">
              枠プレビュー・準備中
            </span>
          }
          showBack
        />

        {/* ツール切替ナビ */}
        <LiffToolSubNav />

        {/* コンセプト概要バナー */}
        <section className="rounded-2xl border border-border/60 bg-card shadow-xs p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-[10px] font-black">
              CONCEPT
            </span>
            <h2 className="text-xs font-black text-foreground">
              選手名を自動差し込み！応援席ですぐ歌える歌詞カード
            </h2>
          </div>
          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
            打席に入った選手をタップするだけで、歌詞の中の名前・コール部分が自動的に切り替わり、新しく入った保護者や体験メンバーでもすぐ一緒に応援できるあんちょこ画面です。
          </p>
        </section>

        {/* 選手選択＆テーマ切替 プレビュー枠 */}
        <section className="rounded-2xl border border-border/60 bg-card shadow-xs p-4 space-y-4">
          {/* 選手選択チップ（サンプル連動） */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-primary" />
                打席の選手を選択（サンプル切替）
              </span>
              <span className="text-[10px] font-bold text-muted-foreground">
                選手名鑑・打順連動予定
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {SAMPLE_PLAYERS.map((player) => {
                const isSelected = selectedPlayer.id === player.id;
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedPlayer(player)}
                    className={`py-2 px-2 rounded-2xl border text-center transition-all active:scale-95 cursor-pointer ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary font-black shadow-2xs"
                        : "bg-muted/35 border-border/60 text-foreground font-bold hover:bg-muted"
                    }`}
                  >
                    <span
                      className={`text-[9px] block leading-none ${
                        isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      #{player.number}
                    </span>
                    <span className="text-xs block mt-0.5 truncate">
                      {player.callName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 応援歌カテゴリタブ */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-muted/50 border border-border/60">
            {[
              { id: "attack" as const, label: "通常打席テーマ" },
              { id: "chance" as const, label: "チャンステーマ" },
              { id: "call" as const, label: "守備・好プレー" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                className={`py-2 px-2 rounded-xl text-xs transition-all cursor-pointer ${
                  selectedCategory === tab.id
                    ? "bg-primary text-primary-foreground font-black shadow-2xs"
                    : "text-muted-foreground hover:text-foreground font-bold"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 屋外視認性重視の歌詞カード表示枠 */}
          <div className="rounded-2xl bg-muted/35 text-foreground p-5 space-y-3 border border-border/60">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black">
                {selectedCategory === "attack"
                  ? "♪ チーム共通ヒッティングマーチ"
                  : selectedCategory === "chance"
                  ? "♪ チャンステーマ（走者得点圏）"
                  : "♪ ナイスプレーコール"}
              </span>
              <Volume2 className="w-4 h-4 text-muted-foreground" />
            </div>

            {selectedCategory === "attack" && (
              <div className="space-y-2.5 text-base sm:text-lg font-black leading-relaxed tracking-wide">
                <p>
                  さあ行こうぜ{" "}
                  <span className="px-2 py-0.5 rounded-lg bg-primary text-primary-foreground">
                    {selectedPlayer.callName}！
                  </span>
                </p>
                <p>勝利へ導く一撃を</p>
                <p>今ここで放て</p>
                <p className="text-sm text-primary pt-1">
                  📣 コール：かっ飛ばせー{" "}
                  <span className="underline decoration-primary decoration-2 underline-offset-4">
                    {selectedPlayer.callName}！
                  </span>{" "}
                  （👏👏・👏👏👏）
                </p>
              </div>
            )}

            {selectedCategory === "chance" && (
              <div className="space-y-2.5 text-base sm:text-lg font-black leading-relaxed tracking-wide">
                <p>燃えろ みんなの想いを乗せて</p>
                <p>
                  決めろ{" "}
                  <span className="px-2 py-0.5 rounded-lg bg-primary text-primary-foreground">
                    {selectedPlayer.callName}！
                  </span>{" "}
                  今がチャンスだ
                </p>
                <p className="text-sm text-primary pt-1">
                  📣 コール：打て！打て！{" "}
                  <span className="underline decoration-primary decoration-2 underline-offset-4">
                    {selectedPlayer.callName}！
                  </span>
                </p>
              </div>
            )}

            {selectedCategory === "call" && (
              <div className="space-y-2.5 text-base sm:text-lg font-black leading-relaxed tracking-wide">
                <p>
                  いいぞ いいぞ{" "}
                  <span className="px-2 py-0.5 rounded-lg bg-primary text-primary-foreground">
                    {selectedPlayer.callName}！
                  </span>
                </p>
                <p className="text-sm text-primary pt-1">
                  📣 もう一回！いいぞ いいぞ {selectedPlayer.callName}！
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 今後の実装予定メモ */}
        <section className="rounded-2xl border border-border/60 bg-card shadow-xs p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-black text-foreground">
              搭載予定の機能リスト
            </h3>
          </div>
          <ul className="space-y-1.5 text-[11px] font-bold text-muted-foreground list-disc pl-4 leading-relaxed">
            <li>チーム独自の応援歌テンプレート登録・編集機能（管理者・応援係向け）</li>
            <li>選手ごとのコール名（下の名前・ニックネーム）設定との連携</li>
            <li>当日のスタメン打順どおりにワンタップで次の打者へ送る「打順モード」</li>
            <li>原曲参考リンク（YouTube等）やリズム表記メモの添付</li>
          </ul>

          <Link
            href="/liff/players"
            className="w-full py-2.5 px-4 rounded-2xl bg-card hover:bg-muted hover:border-primary/40 border border-border/60 text-xs font-black text-foreground flex items-center justify-between transition-all active:scale-98"
          >
            <span className="flex items-center gap-2">
              <IdCard className="w-3.5 h-3.5 text-primary" />
              選手名鑑を見る
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        </section>

        {/* 他のツールへの回遊リンク */}
        <LiffToolOtherLinks />
      </div>
    </div>
  );
}

