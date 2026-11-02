// filepath: src/components/features/news-generator/NewsParameterPanel.tsx
import React, { useState } from "react";
import { 
  ChevronRight, ChevronDown, Zap, Users, Trophy, Activity,
  User, MessageSquare, Award, FileText, Settings, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InningOption {
  label: string;
  inning: number;
  isBottom: boolean;
}

interface NewsParameterPanelProps {
  // tab state
  newsType: "lineup" | "inning" | "end";
  setNewsType: (type: "lineup" | "inning" | "end") => void;

  // accordion state
  isParamExpanded: boolean;
  setIsParamExpanded: (expanded: boolean) => void;

  // basic fields
  matchName: string;
  setMatchName: (val: string) => void;
  venueName: string;
  setVenueName: (val: string) => void;
  opponentName: string;
  setOpponentName: (val: string) => void;
  reporterName: string;
  handleReporterChange: (val: string) => void;
  startTime: string;
  setStartTime: (val: string) => void;
  endTime: string;
  setEndTime: (val: string) => void;

  // score display names
  firstTeamDisp: string;
  setFirstTeamDisp: (val: string) => void;
  secondTeamDisp: string;
  setSecondTeamDisp: (val: string) => void;

  inningOptions: InningOption[];
  selectedInningIndex: number;
  setSelectedInningIndex: (idx: number) => void;
  inningComment: string;
  setInningComment: (val: string) => void;

  heroPlayer: string;
  setHeroPlayer: (val: string) => void;
  summaryText: string;
  setSummaryText: (val: string) => void;

  // 🌟 苗字のみ出力オプション
  showSurnameOnly: boolean;
  setShowSurnameOnly: (val: boolean) => void;
}

export function NewsParameterPanel({
  newsType,
  setNewsType,
  isParamExpanded,
  setIsParamExpanded,
  matchName,
  setMatchName,
  venueName,
  setVenueName,
  opponentName,
  setOpponentName,
  reporterName,
  handleReporterChange,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  firstTeamDisp,
  setFirstTeamDisp,
  secondTeamDisp,
  setSecondTeamDisp,
  inningOptions,
  selectedInningIndex,
  setSelectedInningIndex,
  inningComment,
  setInningComment,
  heroPlayer,
  setHeroPlayer,
  summaryText,
  setSummaryText,
  showSurnameOnly,
  setShowSurnameOnly
}: NewsParameterPanelProps) {
  const [isInningDropdownOpen, setIsInningDropdownOpen] = useState(false);

  return (
    <div className="space-y-6">
      
      {/* 🚀 常時表示の「速報担当者」入力カード */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-xs p-5 space-y-3">
        <label className="flex items-center gap-1.5 text-[10.5px] font-black text-muted-foreground tracking-wider uppercase">
          <User className="h-3.5 w-3.5 text-primary" />
          速報担当者
        </label>
        <input
          type="text"
          value={reporterName}
          onChange={(e) => handleReporterChange(e.target.value)}
          placeholder="例: 佐藤 祖一"
          className="w-full h-10 bg-background border border-border/60 text-foreground text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all placeholder:text-muted-foreground font-bold"
        />
      </div>

      {/* 🚀 1. 速報パラメータの設定欄 (アコーディオン。デフォルト閉) */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-xs p-5 space-y-4 transition-all duration-300">
        <div 
          onClick={() => setIsParamExpanded(!isParamExpanded)}
          className="flex items-center justify-between gap-2 cursor-pointer group select-none"
        >
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-black text-foreground tracking-wider group-hover:text-primary transition-colors">
              速報パラメータの設定
            </h4>
          </div>
          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform duration-300", isParamExpanded && "rotate-90")} />
        </div>

        {isParamExpanded && (
          <div className="space-y-4 pt-3 border-t border-border/60 animate-in fade-in duration-300">
            {/* 🌟 苗字のみ出力オプション */}
            <div className="flex items-center justify-between p-3.5 bg-muted/35 border border-border/60 rounded-xl select-none">
              <div className="flex items-start gap-2.5 min-w-0">
                <User className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-0.5 min-w-0">
                  <span className="text-xs font-black text-foreground block">選手名を苗字のみにする</span>
                  <p className="text-[10px] font-bold text-muted-foreground leading-tight">スタメンやプレイログ of 選手名を苗字だけで出力します</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSurnameOnly(!showSurnameOnly)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/20",
                  showSurnameOnly ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    showSurnameOnly ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* 基本情報の手動調整 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10.5px] font-black text-muted-foreground uppercase tracking-wider">試合名/大会名</label>
                <input
                  type="text"
                  value={matchName}
                  onChange={(e) => setMatchName(e.target.value)}
                  className="w-full h-10 bg-background border border-border/60 text-foreground text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10.5px] font-black text-muted-foreground uppercase tracking-wider">対戦相手</label>
                <input
                  type="text"
                  value={opponentName}
                  onChange={(e) => setOpponentName(e.target.value)}
                  className="w-full h-10 bg-background border border-border/60 text-foreground text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all font-bold"
                />
              </div>
              
              {/* 球場名 (1カラム幅 full-width にしてバランス調整) */}
              <div className="space-y-1.5 col-span-2">
                <label className="block text-[10.5px] font-black text-muted-foreground uppercase tracking-wider">球場名</label>
                <input
                  type="text"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="w-full h-10 bg-background border border-border/60 text-foreground text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all font-bold"
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="block text-[10.5px] font-black text-muted-foreground uppercase tracking-wider">開始時間</label>
                <input
                  type="text"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  placeholder="例: 15:20"
                  className="w-full h-10 bg-background border border-border/60 text-foreground text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all placeholder:text-muted-foreground font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10.5px] font-black text-muted-foreground uppercase tracking-wider">終了時間</label>
                <input
                  type="text"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  placeholder="例: 17:01"
                  className="w-full h-10 bg-background border border-border/60 text-foreground text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all placeholder:text-muted-foreground font-bold"
                />
              </div>
            </div>

            {/* スコア用表示名の手動調整 (イニング・終了速報時のみ表示) */}
            {newsType !== "lineup" && (
              <div className="space-y-3 pt-1 animate-in fade-in duration-300">
                <div className="border-t border-border/60 my-2" />
                <label className="flex items-center gap-1.5 text-[10.5px] font-black text-muted-foreground tracking-wider uppercase">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  スコアボードチーム名（等幅スペース調整用）
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground font-sans">先攻表示名（全角2文字はスペース推奨）</span>
                    <input
                      type="text"
                      value={firstTeamDisp}
                      onChange={(e) => setFirstTeamDisp(e.target.value)}
                      placeholder="例: 逗　子"
                      className="w-full h-10 bg-background border border-border/60 text-foreground text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all placeholder:text-muted-foreground font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground font-sans">後攻表示名（全角2文字はスペース推奨）</span>
                    <input
                      type="text"
                      value={secondTeamDisp}
                      onChange={(e) => setSecondTeamDisp(e.target.value)}
                      placeholder="例: 川　中"
                      className="w-full h-10 bg-background border border-border/60 text-foreground text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all placeholder:text-muted-foreground font-mono font-bold"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🚀 2. 速報タイプのタブ切り替え */}
      <div className="rounded-2xl border border-border/60 bg-muted/80 dark:bg-muted/50 p-1 flex gap-1">
        {(
          [
            { id: "lineup", label: "スタメン速報", icon: Users },
            { id: "inning", label: "イニング速報", icon: Activity },
            { id: "end", label: "試合終了速報", icon: Trophy },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = newsType === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setNewsType(tab.id)}
              className={cn(
                "flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 sm:py-2.5 rounded-xl border text-[11px] sm:text-xs transition-all duration-200 cursor-pointer",
                isActive
                  ? "bg-card text-foreground border-border/50 shadow-sm font-black"
                  : "border-transparent text-muted-foreground hover:text-foreground font-bold active:scale-95"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", isActive && "text-primary")} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 🚀 3. タイプ別の詳細手動コメント入力欄 (イニング・終了速報時のみ表示) */}
      {newsType !== "lineup" && (
        <div className="rounded-2xl border border-border/60 bg-card shadow-xs p-5 space-y-4">
          
          {/* --- B. イニング速報用の設定 --- */}
          {newsType === "inning" && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div>
                <label className="flex items-center gap-1.5 text-[10.5px] font-black text-muted-foreground tracking-wider uppercase mb-1.5">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  速報に含めるイニングの選択
                </label>
                {inningOptions.length === 0 ? (
                  <div className="text-xs font-bold text-muted-foreground py-2">
                    進行中のイニングデータが存在しません。イニングスコアを入力してください。
                  </div>
                ) : (
                  <div className="relative">
                    {/* トリガーボタン */}
                    <button
                      type="button"
                      onClick={() => setIsInningDropdownOpen(!isInningDropdownOpen)}
                      className={cn(
                        "w-full h-11 bg-background border border-border/60 hover:border-primary/40 text-foreground font-bold text-xs px-4 rounded-xl outline-none transition-all flex items-center justify-between cursor-pointer",
                        isInningDropdownOpen && "border-primary ring-2 ring-primary/15"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary shrink-0 animate-pulse" />
                        <span>{inningOptions[selectedInningIndex]?.label}まで表示する</span>
                      </div>
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-300 shrink-0", isInningDropdownOpen && "rotate-180")} />
                    </button>

                    {/* 背面オーバーレイ（クリックで閉じる） */}
                    {isInningDropdownOpen && (
                      <div 
                        className="fixed inset-0 z-40 bg-transparent" 
                        onClick={() => setIsInningDropdownOpen(false)}
                      />
                    )}

                    {/* ドロップダウンメニュー */}
                    {isInningDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-1.5 z-50 bg-card/95 backdrop-blur-md border border-border/60 rounded-xl shadow-lg max-h-60 overflow-y-auto p-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                        {inningOptions.map((opt, idx) => {
                          const isSelected = idx === selectedInningIndex;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setSelectedInningIndex(idx);
                                setIsInningDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2.5 rounded-lg font-bold text-xs flex items-center justify-between transition-colors cursor-pointer",
                                isSelected 
                                  ? "bg-primary/10 text-primary" 
                                  : "text-foreground hover:bg-muted"
                              )}
                            >
                              <span>{opt.label}まで表示する</span>
                              {isSelected && <Zap className="h-3.5 w-3.5 text-primary animate-pulse" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[10.5px] font-black text-muted-foreground tracking-wider uppercase mb-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  戦況解説・追加コメント (自由に入力)
                </label>
                <textarea
                  value={inningComment}
                  onChange={(e) => setInningComment(e.target.value)}
                  placeholder="例：山田が先制の2ランを放ちリードする展開。先発佐藤も要所を締め好投中。"
                  className="w-full min-h-[95px] bg-background border border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/15 text-foreground text-xs p-3 rounded-xl outline-none resize-none transition-all placeholder:text-muted-foreground font-bold"
                />
              </div>
            </div>
          )}

          {/* --- C. 試合終了速報用の設定 --- */}
          {newsType === "end" && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div>
                <label className="flex items-center gap-1.5 text-[10.5px] font-black text-muted-foreground tracking-wider uppercase mb-1.5">
                  <Award className="h-3.5 w-3.5 text-primary" />
                  本日のヒーロー・活躍した選手
                </label>
                <input
                  type="text"
                  value={heroPlayer}
                  onChange={(e) => setHeroPlayer(e.target.value)}
                  placeholder="例：山田選手 (先制の2ランを含む3打点の大活躍！)"
                  className="w-full h-11 bg-background border border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/15 text-foreground text-xs px-4 rounded-xl outline-none transition-all placeholder:text-muted-foreground font-bold"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[10.5px] font-black text-muted-foreground tracking-wider uppercase mb-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  戦評・総括
                </label>
                <textarea
                  value={summaryText}
                  onChange={(e) => setSummaryText(e.target.value)}
                  placeholder="例：初回、3番山田の右越え2ランで先制。中盤に追いつかれるも、5回に相手の失策の間に勝ち越しに成功。投げては先発佐藤が7回2失点の力投で見事完投勝利を飾った。"
                  className="w-full min-h-[130px] bg-background border border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/15 text-foreground text-xs p-3 rounded-xl outline-none resize-none transition-all placeholder:text-muted-foreground font-bold"
                />
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
