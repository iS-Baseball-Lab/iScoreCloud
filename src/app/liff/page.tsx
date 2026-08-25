// filepath: src/app/liff/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { HubHeroCard, type LiffViewMode } from "@/components/liff/HubHeroCard";
import { HubQuickNav } from "@/components/liff/HubQuickNav";
import { MatchScoreCard, type MatchCardData } from "@/components/liff/MatchScoreCard";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { useLiff } from "@/components/liff/LiffProvider";
import { Video, ChevronRight, User, Users2, Settings2, Check, AlertTriangle, Key } from "lucide-react";

export default function LiffHubPage() {
  const { profile, isMock, isInClient, reason } = useLiff();
  const [viewMode, setViewMode] = useState<LiffViewMode>("player");
  const [userName, setUserName] = useState<string>("メンバー");
  const [teamName, setTeamName] = useState<string>("チームHUB");
  const [matches, setMatches] = useState<MatchCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 設定用モーダル
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [inputLiffId, setInputLiffId] = useState("");
  const [inputUserName, setInputUserName] = useState("");
  const [inputTeamName, setInputTeamName] = useState("");

  // ローカルストレージまたは初期ロールから復元
  useEffect(() => {
    const savedMode = localStorage.getItem("iscore_liff_view_mode") as LiffViewMode;
    if (savedMode === "player" || savedMode === "parent") {
      setViewMode(savedMode);
    }
    const savedUserName = localStorage.getItem("iscore_liff_user_name");
    if (savedUserName) {
      setUserName(savedUserName);
      setInputUserName(savedUserName);
    }
    const savedTeamName = localStorage.getItem("iscore_liff_team_name");
    if (savedTeamName) {
      setTeamName(savedTeamName);
      setInputTeamName(savedTeamName);
    }
    const savedLiffId = localStorage.getItem("iscore_liff_id");
    if (savedLiffId) {
      setInputLiffId(savedLiffId);
    }
  }, []);

  const handleModeChange = (mode: LiffViewMode) => {
    setViewMode(mode);
    localStorage.setItem("iscore_liff_view_mode", mode);
  };

  useEffect(() => {
    // 1. プロフィール名が取得できた場合は最優先反映
    if (profile?.displayName) {
      setUserName(profile.displayName);
      localStorage.setItem("iscore_liff_user_name", profile.displayName);
    }
  }, [profile]);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const urlParams = new URLSearchParams(window.location.search);
        let targetTeamId = urlParams.get("teamId") || localStorage.getItem("iscore_selectedTeamId");
        const queryTeamName = urlParams.get("teamName");

        if (queryTeamName) {
          const decoded = decodeURIComponent(queryTeamName);
          setTeamName(decoded);
          localStorage.setItem("iscore_liff_team_name", decoded);
        }

        // ユーザー認証・チーム情報の取得
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const meData = (await meRes.json()) as {
            data?: {
              user?: { name?: string };
              memberships?: { teamId: string; teamName: string; memberType?: string }[];
            };
          };

          if (meData.data?.user?.name && !profile?.displayName && !localStorage.getItem("iscore_liff_user_name")) {
            setUserName(meData.data.user.name);
          }

          const firstTeam = meData.data?.memberships?.[0];
          if (firstTeam) {
            if (!targetTeamId) {
              targetTeamId = firstTeam.teamId;
            }
            if (!queryTeamName && !localStorage.getItem("iscore_liff_team_name")) {
              setTeamName(firstTeam.teamName);
            }
            if (firstTeam.memberType === "parent" && !localStorage.getItem("iscore_liff_view_mode")) {
              setViewMode("parent");
            }
          }
        }

        // 試合一覧データの取得
        if (targetTeamId) {
          const res = await fetch(`/api/matches?teamId=${targetTeamId}`);
          if (res.ok) {
            const data = (await res.json()) as MatchCardData[];
            setMatches(Array.isArray(data) ? data : []);
          }
        }
      } catch (error) {
        console.error("Failed to load hub data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [profile]);

  // 設定保存
  const handleSaveConfig = () => {
    if (inputLiffId.trim()) {
      localStorage.setItem("iscore_liff_id", inputLiffId.trim());
    }
    if (inputUserName.trim()) {
      setUserName(inputUserName.trim());
      localStorage.setItem("iscore_liff_user_name", inputUserName.trim());
    }
    if (inputTeamName.trim()) {
      setTeamName(inputTeamName.trim());
      localStorage.setItem("iscore_liff_team_name", inputTeamName.trim());
    }
    setIsConfigOpen(false);
    if (inputLiffId.trim()) {
      window.location.reload();
    }
  };

  // 最新の動画付き試合
  const latestVideoMatch = matches.find((m) => !!extractYouTubeVideoId(m.youtubeUrl));

  // モード切り替えスイッチ
  const ModeSwitch = (
    <div className="flex items-center p-0.5 bg-muted/80 rounded-xl border border-border">
      <button
        type="button"
        onClick={() => handleModeChange("player")}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
          viewMode === "player"
            ? "bg-card text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <User className="w-3 h-3" />
        <span>選手</span>
      </button>
      <button
        type="button"
        onClick={() => handleModeChange("parent")}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
          viewMode === "parent"
            ? "bg-card text-blue-600 dark:text-blue-400 shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Users2 className="w-3 h-3" />
        <span>保護者</span>
      </button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader
        title={teamName}
        subtitle="チームHUB"
        rightElement={ModeSwitch}
        shareData={{
          title: `${teamName} チームHUB`,
          text: `出欠回答、予定確認、試合動画の閲覧はこちらから！`,
        }}
      />

      {/* ⚠️ LIFF ID未設定時の初期設定案内バナー */}
      {isMock && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="truncate text-[11px]">
              {reason === "LIFF_ID_NOT_CONFIGURED" ? "LIFF IDが未設定です (LINE認証連携用)" : "LINE連携 待機中"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsConfigOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black shrink-0 shadow-xs"
          >
            <Key className="w-3 h-3" />
            <span>設定する</span>
          </button>
        </div>
      )}

      <div className="p-4 space-y-6">
        {/* 👋 ユーザー挨拶 & 設定ボタン */}
        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-muted-foreground">
              {viewMode === "parent" ? "👨‍👩‍👧 保護者モード表示中" : "👦 選手モード表示中"}
            </span>
            <h2 className="text-lg font-black text-foreground tracking-tight">
              こんにちは、{userName} さん 👋
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setIsConfigOpen(true)}
            className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted shadow-xs transition-all active:scale-95"
            title="チーム名・名前・LIFF設定"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>

        {/* 🌟 ヒーローセクション：次回予定 & 出欠 */}
        <section>
          <HubHeroCard
            viewMode={viewMode}
            teamName={teamName}
          />
        </section>

        {/* 🚀 クイックメニュー */}
        <section>
          <HubQuickNav viewMode={viewMode} />
        </section>

        {/* 🎬 最新の試合動画ハイライト */}
        {latestVideoMatch && (
          <section className="space-y-3 pt-1 border-t border-border/50">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                <Video className="w-4 h-4 text-red-500" />
                <span>最新の試合動画</span>
              </div>

              <a
                href="/liff/matches"
                className="flex items-center gap-0.5 text-xs font-black text-primary hover:underline"
              >
                <span>一覧を見る</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </a>
            </div>

            <MatchScoreCard match={latestVideoMatch} />
          </section>
        )}
      </div>

      {/* ⚙️ チームHUB 設定モーダル */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-card border border-border rounded-3xl p-5 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-black text-foreground">
                  チームHUB 設定
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="text-xs font-bold text-muted-foreground hover:text-foreground p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* LIFF ID 設定 */}
              <div>
                <label className="block font-black text-foreground mb-1">
                  LINE Developers LIFF ID
                </label>
                <input
                  type="text"
                  placeholder="例: 2001234567-AbcdEfgh"
                  value={inputLiffId}
                  onChange={(e) => setInputLiffId(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-xl font-mono text-xs focus:ring-2 focus:ring-primary/20 focus:outline-hidden"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  ※ LINE Developersの「LIFF」タブに記載されているIDです
                </span>
              </div>

              {/* チーム名 設定 */}
              <div>
                <label className="block font-black text-foreground mb-1">
                  表示チーム名
                </label>
                <input
                  type="text"
                  placeholder="例: 川崎ホークス"
                  value={inputTeamName}
                  onChange={(e) => setInputTeamName(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-xl font-bold text-xs focus:ring-2 focus:ring-primary/20 focus:outline-hidden"
                />
              </div>

              {/* 表示名 設定 */}
              <div>
                <label className="block font-black text-foreground mb-1">
                  あなたの表示名 (選手 / 保護者)
                </label>
                <input
                  type="text"
                  placeholder="例: 佐藤 翔太"
                  value={inputUserName}
                  onChange={(e) => setInputUserName(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-xl font-bold text-xs focus:ring-2 focus:ring-primary/20 focus:outline-hidden"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  ※ LINE連携完了後はLINEの登録名が自動反映されます
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-muted text-muted-foreground text-xs font-bold hover:bg-muted/80"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-xs hover:bg-primary/90 flex items-center justify-center gap-1"
              >
                <Check className="w-4 h-4" />
                <span>保存する</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
