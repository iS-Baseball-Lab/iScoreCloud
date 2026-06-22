// filepath: src/app/(protected)/matches/lineup/page.tsx
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, Users, Loader2, ChevronRight, Wand2,
  Shield, Swords, Save, UserMinus, UserCheck, CheckCircle2,
  FolderOpen, ChevronDown
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

function LineupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("id");
  const urlTeamId = searchParams.get("teamId");

  const getTeamId = () => {
    const id = urlTeamId;
    if (!id || id === "undefined" || id === "null") {
      return localStorage.getItem("iscore_selectedTeamId") || "";
    }
    return id;
  };

  const [activeTab, setActiveTab] = useState<"myTeam" | "opponent">("myTeam");
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [attendance, setAttendance] = useState<Record<string, "bench" | "absent">>({});
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const [myLineup, setMyLineup] = useState(
    Array.from({ length: 9 }, (_, i) => ({ order: i + 1, position: "", playerId: "", name: "", uniformNumber: "" }))
  );
  const [opponentLineup, setOpponentLineup] = useState(
    Array.from({ length: 9 }, (_, i) => ({ order: i + 1, position: "", name: "", uniformNumber: "" }))
  );

  // 🌟 EDH（全員打撃）に対応するためのスタメン動的追加・削除ハンドラー
  const handleAddBatter = (type: "myTeam" | "opponent") => {
    if (type === "myTeam") {
      setMyLineup(prev => [
        ...prev,
        { order: prev.length + 1, position: "", playerId: "", name: "", uniformNumber: "" }
      ]);
      toast.success("打撃スタメン枠を追加しました");
    } else {
      setOpponentLineup(prev => [
        ...prev,
        { order: prev.length + 1, position: "", name: "", uniformNumber: "" }
      ]);
      toast.success("相手チームの打撃枠を追加しました");
    }
  };

  const handleRemoveBatter = (type: "myTeam" | "opponent", targetIndex: number) => {
    if (type === "myTeam") {
      if (myLineup.length <= 9) return;
      setMyLineup(prev => {
        const filtered = prev.filter((_, i) => i !== targetIndex);
        return filtered.map((p, idx) => ({ ...p, order: idx + 1 }));
      });
      toast.success("打撃スタメン枠を削除しました");
    } else {
      if (opponentLineup.length <= 9) return;
      setOpponentLineup(prev => {
        const filtered = prev.filter((_, i) => i !== targetIndex);
        return filtered.map((p, idx) => ({ ...p, order: idx + 1 }));
      });
      toast.success("相手チームの打撃枠を削除しました");
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const targetTeamId = getTeamId();
        if (!targetTeamId) {
          toast.error("チーム情報が特定できませんでした");
          setIsLoading(false);
          return;
        }

        const [playersRes, lineupsRes, templatesRes, matchDetailRes, attendanceRes] = await Promise.all([
          fetch(`/api/teams/${targetTeamId}/players`, { cache: "no-store" }),
          matchId ? fetch(`/api/matches/${matchId}/lineups`, { cache: "no-store" }) : Promise.resolve(null),
          fetch(`/api/teams/${targetTeamId}/lineup-templates`, { cache: "no-store" }),
          matchId ? fetch(`/api/matches/${matchId}`, { cache: "no-store" }) : Promise.resolve(null),
          fetch(`/api/attendance?teamId=${targetTeamId}`, { cache: "no-store" })
        ]);

        if (!playersRes.ok) throw new Error("選手データの取得に失敗しました");
        const playersData = await playersRes.json() as Player[];
        setTeamPlayers(playersData || []);
        
        const initialAttendance: Record<string, "bench" | "absent"> = {};
        playersData.forEach(p => { 
          initialAttendance[p.id] = "bench"; 
        });

        // 試合と同日の出欠管理イベントを特定し、欠席者を自動的にマッピングする
        let matchDate: string | null = null;
        if (matchDetailRes && matchDetailRes.ok) {
          const matchDetailJson = (await matchDetailRes.json()) as any;
          if (matchDetailJson.success && matchDetailJson.match) {
            matchDate = matchDetailJson.match.date;
          }
        }

        if (matchDate && attendanceRes && attendanceRes.ok) {
          const attendanceJson = (await attendanceRes.json()) as any;
          if (attendanceJson.success && attendanceJson.data) {
            const { events: eventsList, attendances: attendancesList } = attendanceJson.data;
            
            const isSameDay = (dateStr1: string, dateVal2: any) => {
              try {
                const d1 = new Date(dateStr1);
                let d2: Date;
                if (typeof dateVal2 === 'number') {
                  d2 = dateVal2 < 10000000000 ? new Date(dateVal2 * 1000) : new Date(dateVal2);
                } else {
                  d2 = new Date(dateVal2);
                }
                return d1.getFullYear() === d2.getFullYear() &&
                       d1.getMonth() === d2.getMonth() &&
                       d1.getDate() === d2.getDate();
              } catch (e) {
                return false;
              }
            };

            const matchedEvent = (eventsList || []).find((e: any) => isSameDay(matchDate!, e.startAt));
            if (matchedEvent) {
              const eventAttendances = (attendancesList || []).filter((a: any) => a.eventId === matchedEvent.id);
              eventAttendances.forEach((att: any) => {
                if (att.playerId && att.status === 'absent') {
                  initialAttendance[att.playerId] = 'absent';
                }
              });
            }
          }
        }

        if (lineupsRes && lineupsRes.ok) {
          const lineupsData = await lineupsRes.json() as any;
          if (lineupsData.success && lineupsData.lineups) {
            if (lineupsData.lineups.myLineup?.length > 0) {
              setMyLineup(lineupsData.lineups.myLineup);
            }
            if (lineupsData.lineups.opponentLineup?.length > 0) {
              setOpponentLineup(lineupsData.lineups.opponentLineup);
            }
            const savedAttendance = lineupsData.lineups.myAttendance || {};
            Object.keys(savedAttendance).forEach(pid => {
              if (savedAttendance[pid] === 'absent') {
                initialAttendance[pid] = 'absent';
              }
            });
          }
        }

        setAttendance(initialAttendance);

        if (templatesRes && templatesRes.ok) {
          const templatesData = await templatesRes.json() as any[];
          setTemplates(templatesData || []);
        }

      } catch (error) {
        console.error(error);
        toast.error("データの読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [urlTeamId, matchId]);

  const getDisabledPositions = (lineup: any[], currentIndex: number) =>
    lineup
      .filter((_, i) => i !== currentIndex)
      .map(p => p.position)
      .filter(pos => pos && pos !== "DH"); // 🌟 DH (指名打者 / エキストラ指名打者) は全員打撃(EDH)のために重複選択を許可する
  
  const getDisabledPlayers = (lineup: any[], currentIndex: number) =>
    lineup.filter((_, i) => i !== currentIndex).map(p => p.playerId).filter(Boolean);

  const saveTemplate = async () => {
    if (!templateName) return toast.error("名前を入力してください");
    
    try {
      const targetTeamId = getTeamId();
      if (!targetTeamId) {
        toast.error("チーム情報が特定できませんでした");
        return;
      }

      const res = await fetch(`/api/teams/${targetTeamId}/lineup-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          lineupData: myLineup
        })
      });

      if (!res.ok) throw new Error("保存に失敗しました");

      toast.success(`「${templateName}」を保存しました`);
      setIsTemplateModalOpen(false);
      setTemplateName("");

      // テンプレート一覧を再取得
      const templatesRes = await fetch(`/api/teams/${targetTeamId}/lineup-templates`, { cache: "no-store" });
      if (templatesRes.ok) {
        const templatesData = await templatesRes.json() as any[];
        setTemplates(templatesData || []);
      }
    } catch (error) {
      console.error(error);
      toast.error("テンプレートの保存に失敗しました");
    }
  };

  const handleLoadTemplate = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const templateId = e.target.value;
    setSelectedTemplateId(templateId);
    if (!templateId) return;

    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    try {
      let lineupData = template.lineupData;
      if (typeof lineupData === "string") {
        lineupData = JSON.parse(lineupData);
      }

      if (Array.isArray(lineupData)) {
        const restored = lineupData.map((item: any) => {
          const player = teamPlayers.find(p => p.id === item.playerId);
          return {
            order: item.order,
            position: item.position || "",
            playerId: item.playerId || "",
            name: player ? player.name : (item.name || ""),
            uniformNumber: player ? (player.uniformNumber || "") : (item.uniformNumber || "")
          };
        });

        // 🌟 テンプレートから10人以上のスタメン（EDH）をそのまま動的に復元
        const maxOrder = Math.max(9, ...restored.map((r: any) => r.order));
        const fullLineup = Array.from({ length: maxOrder }, (_, i) => {
          const found = restored.find((r: any) => r.order === i + 1);
          return found || { order: i + 1, position: "", playerId: "", name: "", uniformNumber: "" };
        });

        // 互換性維持: もし旧データの order: 0 (打席なし投手) が保存されていれば、それも末尾に打撃順枠として復元する
        const dhPitcher = restored.find((r: any) => r.order === 0);
        if (dhPitcher) {
          fullLineup.push({
            order: fullLineup.length + 1,
            position: dhPitcher.position || "1",
            playerId: dhPitcher.playerId || "",
            name: dhPitcher.name || "",
            uniformNumber: dhPitcher.uniformNumber || ""
          });
        }

        setMyLineup(fullLineup);
        toast.success(`テンプレート「${template.name}」を適用しました`);
      }
    } catch (error) {
      console.error(error);
      toast.error("テンプレートの読み込みに失敗しました");
    }
  };

  const handleFillDummyOpponent = () => {
    setOpponentLineup(prev => prev.map((p, i) => ({
      ...p,
      position: (i + 1).toString(),
      name: `相手打者 ${i + 1}`
    })));
  };

  const handlePlayBall = async () => {
    if (!matchId) {
      router.push("/matches");
      return;
    }
    
    setIsLoading(true);
    try {
      // 🌟 相手チームのスタメンが未入力の箇所を自動でダミー補完する
      let hasDummyAdded = false;
      const filledOpponentLineup = opponentLineup.map((p) => {
        const hasName = p.name && p.name.trim() !== "";
        const hasPos = p.position && p.position !== "";
        
        if (!hasName || !hasPos) {
          hasDummyAdded = true;
        }

        return {
          ...p,
          name: hasName ? p.name : `相手打者 ${p.order}`,
          position: hasPos ? p.position : (p.order <= 9 ? p.order.toString() : "DH")
        };
      });

      const res = await fetch(`/api/matches/${matchId}/lineups`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ myLineup, opponentLineup: filledOpponentLineup, myAttendance: attendance })
      });
      
      if (!res.ok) throw new Error("Failed to save lineups");

      if (hasDummyAdded) {
        toast.success("未入力の相手スタメンにダミー選手を自動追加しました");
      }
      
      router.push(`/matches/score?id=${matchId}`);
    } catch (error) {
      console.error(error);
      toast.error("スタメンの保存に失敗しました");
      setIsLoading(false);
    }
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
              <div className="relative flex-1">
                <FolderOpen className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60 pointer-events-none" />
                <select
                  value={selectedTemplateId}
                  onChange={handleLoadTemplate}
                  className="w-full h-12 bg-card/50 border-2 border-border/40 rounded-2xl pl-10 pr-8 text-xs font-black focus:outline-none appearance-none cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <option value="">テンプレート読込</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
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
                    "w-8 text-center font-black italic transition-colors flex items-center justify-center text-xs",
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

                  {/* 10人目（インデックス9）以降の場合に削除ボタンを配置 */}
                  {index >= 9 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBatter(activeTab, index)}
                      className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 active:scale-95 transition-all shrink-0 ml-1 cursor-pointer"
                      title="この打順枠を削除"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  )}

                  {isCompleted && (
                    <div className="w-8 flex justify-center animate-in zoom-in duration-300">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* 🌟 打撃枠の動的追加ボタン */}
            <div className="pt-2 px-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleAddBatter(activeTab)}
                className="w-full h-12 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-black flex items-center justify-center gap-2 hover:bg-primary/5 active:scale-[0.98] transition-all cursor-pointer"
              >
                ➕ 打順（バッター）を追加
              </Button>
            </div>
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
            onClick={handlePlayBall}
            className="w-full h-16 rounded-2xl text-lg font-black tracking-widest shadow-sm shadow-primary/30 active:scale-95 transition-all"
          >
            保存してスコア画面へ
            <ChevronRight className="ml-2 h-6 w-6" />
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

export default function LineupPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[60vh] items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary/40 mx-auto" />
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Loading Lineup...</p>
        </div>
      </div>
    }>
      <LineupPageContent />
    </Suspense>
  );
}
