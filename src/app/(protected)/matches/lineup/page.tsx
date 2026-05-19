// filepath: src/app/(protected)/matches/lineup/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, Users, Loader2, ChevronRight, Wand2,
  Shield, Swords, Save, UserMinus, UserCheck, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/layout/SectionHeader";

const POSITIONS = [
  { id: "1", label: "1 投", color: "bg-red-500" }, { id: "2", label: "2 捕", color: "bg-blue-500" },
  { id: "3", label: "3 一", color: "bg-orange-500" }, { id: "4", label: "4 二", color: "bg-emerald-500" },
  { id: "5", label: "5 三", color: "bg-amber-500" }, { id: "6", label: "6 遊", color: "bg-purple-500" },
  { id: "7", label: "7 左", color: "bg-lime-500" }, { id: "8", label: "8 中", color: "bg-teal-500" },
  { id: "9", label: "9 右", color: "bg-cyan-500" }, { id: "DH", label: "DH 指", color: "bg-zinc-500" }
];

interface Player {
  id: string;
  name: string;
  uniformNumber: string | null;
}

export default function LineupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("id");
  const urlTeamId = searchParams.get("teamId");

  const [activeTab, setActiveTab] = useState<"myTeam" | "opponent">("myTeam");
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [attendance, setAttendance] = useState<Record<string, "bench" | "absent">>({});
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const [myLineup, setMyLineup] = useState(
    Array.from({ length: 9 }, (_, i) => ({ order: i + 1, position: "", playerId: "", name: "", uniformNumber: "" }))
  );
  const [opponentLineup, setOpponentLineup] = useState(
    Array.from({ length: 9 }, (_, i) => ({ order: i + 1, position: "", name: "", uniformNumber: "" }))
  );

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const targetTeamId = urlTeamId || localStorage.getItem("iscore_selectedTeamId");
        if (!targetTeamId) {
          toast.error("チーム情報が特定できませんでした");
          setIsLoading(false);
          return;
        }

        const res = await fetch(`/api/teams/${targetTeamId}/players`, { cache: "no-store" });
        if (!res.ok) throw new Error("選手データの取得に失敗しました");
        
        const data = await res.json() as Player[];
        setTeamPlayers(data || []);
        
        const initialAttendance: Record<string, "bench" | "absent"> = {};
        data.forEach(p => { 
          initialAttendance[p.id] = "bench"; 
        });
        setAttendance(initialAttendance);

      } catch (error) {
        console.error(error);
        toast.error("選手情報の読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlayers();
  }, [urlTeamId]);

  const getDisabledPositions = (lineup: any[], currentIndex: number) =>
    lineup.filter((_, i) => i !== currentIndex).map(p => p.position).filter(Boolean);
  
  const getDisabledPlayers = (lineup: any[], currentIndex: number) =>
    lineup.filter((_, i) => i !== currentIndex).map(p => p.playerId).filter(Boolean);

  const saveTemplate = () => {
    if (!templateName) return toast.error("名前を入力してください");
    toast.success(`「${templateName}」を保存しました（モック）`);
    setIsTemplateModalOpen(false);
  };

  const handleFillDummyOpponent = () => {
    setOpponentLineup(prev => prev.map((p, i) => ({
      ...p,
      position: (i + 1).toString(),
      name: `相手打者 ${i + 1}`
    })));
  };

  const startingPlayerIds = myLineup.map(p => p.playerId).filter(Boolean);
  const remainingPlayers = teamPlayers.filter(p => !startingPlayerIds.includes(p.id));
  const benchCount = remainingPlayers.filter(p => attendance[p.id] !== "absent").length;
  const absentCount = remainingPlayers.filter(p => attendance[p.id] === "absent").length;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary/40 mx-auto" />
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Loading Squad...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full animate-in fade-in duration-500 min-h-screen pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-8 space-y-8">

        {/* ━━ トップ：戻るボタン & SectionHeader ━━ */}
        <div className="space-y-4 mb-6">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => router.back()}
            className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
            戻る
          </Button>
          <SectionHeader title="スタメン登録" subtitle="Lineup Setup" showPulse />
        </div>

        {/* タブ切り替え */}
        <div className="flex bg-muted/30 p-1.5 rounded-3xl border border-border/40 shadow-inner">
          <button
            onClick={() => setActiveTab("myTeam")}
            className={cn(
              "flex-1 py-4 text-sm sm:text-base font-black rounded-2xl transition-all flex items-center justify-center gap-2",
              activeTab === "myTeam" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Shield className="w-4 h-4 sm:w-5 sm:h-5" /> 自チーム
          </button>
          <button
            onClick={() => setActiveTab("opponent")}
            className={cn(
              "flex-1 py-4 text-sm sm:text-base font-black rounded-2xl transition-all flex items-center justify-center gap-2",
              activeTab === "opponent" ? "bg-rose-500 text-white shadow-sm" : "text-muted-foreground"
            )}
          >
            <Swords className="w-4 h-4 sm:w-5 sm:h-5" /> 相手チーム
          </button>
        </div>

        {/* 操作メニュー */}
        <div className="flex justify-between items-center px-1">
          {activeTab === "myTeam" ? (
            <div className="flex gap-2 w-full">
              <select className="flex-1 h-12 bg-card/50 border-2 border-border/40 rounded-2xl px-4 text-xs font-black focus:outline-none">
                <option>📂 テンプレート読込</option>
              </select>
              <Button variant="outline" onClick={() => setIsTemplateModalOpen(true)} className="h-12 rounded-2xl border-2 border-primary/20 text-primary font-black px-6">
                <Save className="w-4 h-4 mr-2" /> 保存
              </Button>
            </div>
          ) : (
            <Button onClick={handleFillDummyOpponent} variant="outline" className="w-full h-12 rounded-2xl border-2 border-rose-200 text-rose-500 font-black">
              <Wand2 className="w-4 h-4 mr-2" /> 相手スタメンを一括生成
            </Button>
          )}
        </div>

        {/* メインリストエリア */}
        <div className="space-y-8">
          
          {/* 【セクション1】スターティングメンバー */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-2 mb-2">
              <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> スターティングメンバー
              </h3>
              {activeTab === "myTeam" ? (
                <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                  {startingPlayerIds.length} / 9人
                </span>
              ) : null}
            </div>

            {(activeTab === "myTeam" ? myLineup : opponentLineup).map((player, index) => {
              const disabledPos = getDisabledPositions(activeTab === "myTeam" ? myLineup : opponentLineup, index);
              const disabledPlayers = activeTab === "myTeam" ? getDisabledPlayers(myLineup, index) : [];

              const isCompleted = activeTab === "myTeam" 
                ? Boolean(player.position && (player as typeof myLineup[0]).playerId)
                : Boolean(player.position && player.name.trim());

              return (
                <div 
                  key={index} 
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-2xl transition-all duration-300 focus-within:border-primary/50",
                    isCompleted
                      ? "bg-white dark:bg-zinc-800 border-2 border-primary/30 shadow-md opacity-100"
                      : "bg-card/40 border-2 border-border/50 border-dashed opacity-80"
                  )}
                >
                  <div className={cn(
                    "w-8 text-center font-black italic transition-colors flex items-center justify-center",
                    isCompleted ? "text-primary" : "text-primary/40"
                  )}>
                    {index + 1}
                  </div>

                  <select
                    value={player.position}
                    onChange={(e) => {
                      if (activeTab === "myTeam") {
                        const list = [...myLineup];
                        list[index].position = e.target.value;
                        setMyLineup(list);
                      } else {
                        const list = [...opponentLineup];
                        list[index].position = e.target.value;
                        setOpponentLineup(list);
                      }
                    }}
                    className={cn(
                      "w-14 h-11 rounded-xl text-white font-black text-xs appearance-none text-center shadow-sm cursor-pointer",
                      POSITIONS.find(p => p.id === player.position)?.color || "bg-zinc-300 dark:bg-zinc-700"
                    )}
                  >
                    <option value="">守備</option>
                    {POSITIONS.map(p => !disabledPos.includes(p.id) && (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>

                  {activeTab === "myTeam" ? (
                    <select 
                      value={(player as typeof myLineup[0]).playerId || ""}
                      onChange={(e) => {
                        const list = [...myLineup];
                        const selectedId = e.target.value;
                        const selectedPlayer = teamPlayers.find(p => p.id === selectedId);
                        list[index].playerId = selectedId;
                        list[index].name = selectedPlayer ? selectedPlayer.name : "";
                        list[index].uniformNumber = selectedPlayer ? (selectedPlayer.uniformNumber || "") : "";
                        setMyLineup(list);
                      }}
                      className={cn(
                        "flex-1 h-11 bg-transparent border-none font-bold text-sm focus:outline-none cursor-pointer transition-colors",
                        isCompleted ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      <option value="">選手を選択...</option>
                      {teamPlayers.map(p => {
                        const isAlreadySelected = disabledPlayers.includes(p.id);
                        // 🌟 欠席判定を追加
                        const isAbsent = attendance[p.id] === "absent";
                        
                        // 既に選択済みか、欠席の場合は選択不可（disabled）にする
                        const isDisabled = isAlreadySelected || isAbsent;

                        // 表示するラベルを状態に応じて変更
                        let label = `${p.uniformNumber ? p.uniformNumber + '.' : ''} ${p.name}`;
                        if (isAlreadySelected) {
                          label = `[選択済] ${p.name}`;
                        } else if (isAbsent) {
                          label = `[欠席] ${p.name}`; // 🌟 欠席者には [欠席] と表示
                        }

                        return (
                          <option key={p.id} value={p.id} disabled={isDisabled}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <Input
                      placeholder="相手選手名"
                      className={cn(
                        "flex-1 h-11 border-none bg-transparent font-bold focus-visible:ring-0 transition-colors",
                        isCompleted ? "text-foreground" : "text-muted-foreground"
                      )}
                      value={player.name}
                      onChange={(e) => {
                        const list = [...opponentLineup];
                        list[index].name = e.target.value;
                        setOpponentLineup(list);
                      }}
                    />
                  )}

                  {isCompleted && (
                    <div className="w-8 flex justify-center animate-in zoom-in duration-300">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 【セクション2】ベンチ・欠席メンバー（自チームタブのみ表示） */}
          {activeTab === "myTeam" ? (
            <div className="space-y-4 pt-6 border-t-2 border-border/40 border-dashed">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" /> ベンチ・欠席メンバー
                </h3>
                <div className="flex gap-2">
                  <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md">控え: {benchCount}人</span>
                  <span className="text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-md">欠席: {absentCount}人</span>
                </div>
              </div>

              {remainingPlayers.length === 0 ? (
                <div className="text-center py-8 bg-card/30 rounded-2xl border border-border/30">
                  <p className="text-xs font-bold text-muted-foreground">全員がスタメンに登録されています</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {remainingPlayers.map(player => {
                    const status = attendance[player.id] || "bench";
                    const isAbsent = status === "absent";
                    return (
                      <div 
                        key={player.id} 
                        // 🌟 欠席の場合は確定イメージ（ソリッドな背景と枠）を強める
                        className={cn(
                          "flex items-center justify-between p-2 pl-4 rounded-xl transition-all duration-300",
                          isAbsent 
                            ? "bg-rose-500/5 border-2 border-rose-500/20 shadow-sm opacity-90"
                            : "bg-card/50 border-2 border-border/40"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "text-xs font-black w-4",
                            isAbsent ? "text-rose-500/50" : "text-muted-foreground"
                          )}>
                            {player.uniformNumber || "-"}
                          </span>
                          <span className={cn(
                            "text-sm font-bold transition-all", 
                            isAbsent ? "text-rose-600/60 dark:text-rose-400/60 line-through" : "text-foreground"
                          )}>
                            {player.name}
                          </span>
                        </div>
                        
                        <div className="flex bg-muted p-1 rounded-lg w-32">
                          <button
                            onClick={() => setAttendance(prev => ({ ...prev, [player.id]: "bench" }))}
                            className={cn(
                              "flex-1 flex items-center justify-center py-1.5 rounded-md text-[10px] font-black transition-all cursor-pointer",
                              status === "bench" ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <UserCheck className="w-3 h-3 mr-1" /> 控え
                          </button>
                          <button
                            onClick={() => setAttendance(prev => ({ ...prev, [player.id]: "absent" }))}
                            className={cn(
                              "flex-1 flex items-center justify-center py-1.5 rounded-md text-[10px] font-black transition-all cursor-pointer",
                              status === "absent" ? "bg-white dark:bg-zinc-700 text-rose-500 shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <UserMinus className="w-3 h-3 mr-1" /> 欠席
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* プレイボールボタン */}
        <div className="pt-8">
          <Button
            onClick={() => router.push(`/matches/score?id=${matchId}`)}
            className="w-full h-20 rounded-full text-xl font-black uppercase tracking-[0.3em] shadow-sm shadow-primary/30 active:scale-95 transition-all"
          >
            PLAYBALL
            <ChevronRight className="ml-2 h-8 w-8" />
          </Button>
        </div>
      </div>

      {/* テンプレート保存モーダル */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-sm rounded-[40px] border-2 border-border/40 p-8 shadow-2xl space-y-6">
            <SectionHeader title="設定保存" subtitle="Save Template" />
            <Input
              placeholder="例：2026年 基本オーダー"
              className="h-14 rounded-2xl bg-muted/50 border-none font-bold text-center"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setIsTemplateModalOpen(false)} className="flex-1 h-14 rounded-2xl font-black">
                キャンセル
              </Button>
              <Button onClick={saveTemplate} className="flex-1 h-14 rounded-2xl font-black shadow-lg shadow-primary/20">
                保存する
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
