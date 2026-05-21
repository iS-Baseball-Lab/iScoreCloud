// filepath: src/components/score/SubstitutionModal.tsx
"use client";

import { useState, useEffect } from "react";
/**
 * 💡 選手交代モーダル (極上2ステップUI版)
 * 1. 意匠: bg-background と border-border による極上の高コントラスト屋外向けデザイン。
 * 2. 構造: 
 *    - Step 1: 現在の打順スロット (1番〜9番) の選択。自チーム・相手チームのタブ切り替え。
 *    - Step 2: 選手選択。自チームの場合はベンチメンバー一覧の表示＋新規ゲスト手動入力。
 *              相手チームの場合は、その場での選手詳細（名前、背番号、ポジション）の手動入力。
 * 3. 整理: スコアラーが炎天下でグローブをはめていても操作しやすい極太タップ領域。
 * 4. 規則: border-border。角丸は [var(--radius-xl)] に準拠。
 */
import { createPortal } from "react-dom";
import { Search, UserCog, Repeat, UserPlus, Loader2, ArrowLeft, X } from "lucide-react";
import { useScore } from "@/contexts/ScoreContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Player } from "@/types/player";

export interface SubstitutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: 'my' | 'opponent';
  initialSlotIndex?: number | null;
}

export function SubstitutionModal({
  open,
  onOpenChange,
  initialTab,
  initialSlotIndex
}: SubstitutionModalProps) {
  const { state, substitutePlayer } = useScore();
  const [activeTab, setActiveTab] = useState<'my' | 'opponent'>('my');
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  
  const [rosterPlayers, setRosterPlayers] = useState<Player[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);

  // 新しい即席入力用
  const [customName, setCustomName] = useState("");
  const [customNumber, setCustomNumber] = useState("");
  const [customPosition, setCustomPosition] = useState("DH");

  // ポジションの定義
  const posOptions = [
    { id: "1", label: "投" },
    { id: "2", label: "捕" },
    { id: "3", label: "一" },
    { id: "4", label: "二" },
    { id: "5", label: "三" },
    { id: "6", label: "遊" },
    { id: "7", label: "左" },
    { id: "8", label: "中" },
    { id: "9", label: "右" },
    { id: "DH", label: "指" },
  ];

  // 1. 自チームの名簿をロード
  useEffect(() => {
    if (open && state.teamId && activeTab === 'my') {
      setIsLoadingRoster(true);
      fetch(`/api/teams/${state.teamId}/players`)
        .then((res) => {
          if (!res.ok) throw new Error();
          return res.json();
        })
        .then((data: any) => {
          if (Array.isArray(data)) {
            setRosterPlayers(data);
          }
        })
        .catch(() => {
          console.warn("Failed to load roster. Using fallback empty list.");
        })
        .finally(() => setIsLoadingRoster(false));
    }
  }, [open, state.teamId, activeTab]);

  // モーダルオープン時の初期値プリセットと、クローズ時の状態クリア
  useEffect(() => {
    if (open) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      if (initialSlotIndex !== undefined) {
        setSelectedSlotIndex(initialSlotIndex);
        
        // プリセット用
        if (initialSlotIndex !== null) {
          const tab = initialTab || 'my';
          const lineupList = tab === 'my' ? state.myLineup || [] : state.opponentLineup || [];
          const slot = lineupList[initialSlotIndex];
          if (slot) {
            setCustomName("");
            setCustomNumber("");
            setCustomPosition(slot.position !== "-" && slot.position ? slot.position : "DH");
          } else {
            setCustomName("");
            setCustomNumber("");
            setCustomPosition("DH");
          }
        }
      } else {
        setSelectedSlotIndex(null);
      }
    } else {
      setSelectedSlotIndex(null);
      setSearchQuery("");
      setCustomName("");
      setCustomNumber("");
      setCustomPosition("DH");
    }
  }, [open, initialTab, initialSlotIndex, state.myLineup, state.opponentLineup]);

  const lineup = activeTab === 'my' ? state.myLineup || [] : state.opponentLineup || [];
  
  // 1〜9番のスロットを確実に生成
  const slots = Array.from({ length: 9 }, (_, i) => {
    const p = lineup[i];
    return {
      index: i,
      battingOrder: i + 1,
      playerId: p?.playerId || "",
      playerName: p?.playerName || p?.name || "未設定",
      uniformNumber: p?.uniformNumber || "-",
      position: p?.position || "-",
    };
  });

  const activeSlot = selectedSlotIndex !== null ? slots[selectedSlotIndex] : null;

  // ベンチメンバーの抽出 (登録されている選手のうち、スタメン lineup にいない選手)
  const activePlayerIds = new Set(lineup.map((p) => p?.playerId).filter(Boolean));
  const benchPlayers = rosterPlayers.filter((p) => !activePlayerIds.has(p.id));
  
  const filteredBench = benchPlayers.filter((p) =>
    p.name.includes(searchQuery) || (p.uniformNumber && p.uniformNumber.includes(searchQuery))
  );

  const handleSelectSlot = (index: number) => {
    setSelectedSlotIndex(index);
    // 初期値として現在のスロットの情報を入力フィールドにプリセット
    const slot = slots[index];
    if (slot.playerName !== "未設定") {
      setCustomName("");
      setCustomNumber("");
      setCustomPosition(slot.position !== "-" ? slot.position : "DH");
    } else {
      setCustomName("");
      setCustomNumber("");
      setCustomPosition("DH");
    }
  };

  const handleExecuteSubstitution = (
    playerId: string,
    playerName: string,
    uniformNumber: string,
    position: string
  ) => {
    if (selectedSlotIndex === null) return;
    
    substitutePlayer(activeTab, selectedSlotIndex, playerId, playerName, uniformNumber, position);
    toast.success(`${selectedSlotIndex + 1}番に「${playerName}」選手を登録しました！`);
    
    // Close & Reset
    setSelectedSlotIndex(null);
    onOpenChange(false);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) {
      toast.error("選手名を入力してください");
      return;
    }
    const newId = `custom-${Date.now()}`;
    handleExecuteSubstitution(newId, customName.trim(), customNumber.trim(), customPosition);
  };

  const getPositionLabel = (pos: string) => {
    const opt = posOptions.find(o => o.id === pos);
    return opt ? opt.label : pos;
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg flex flex-col h-[80vh] max-h-[700px] overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_50px_rgba(0,0,0,0.5)]">
        
        {/* モーダルヘッダー */}
        <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-4 flex items-center gap-4 border-b border-zinc-100 dark:border-zinc-800">
          {selectedSlotIndex !== null && (
            <button
              onClick={() => setSelectedSlotIndex(null)}
              className="h-9 w-9 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-650 dark:text-zinc-400 flex items-center justify-center transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-black text-primary uppercase tracking-widest bg-primary/5 dark:bg-primary/10 border border-primary/10 dark:border-primary/20 px-2 py-0.5 rounded-full">
                {selectedSlotIndex === null ? "Step 1: Select Position" : "Step 2: Assign Player"}
              </span>
            </div>
            <h3 className="text-base font-black text-zinc-900 dark:text-white leading-tight">
              選手交代
              {selectedSlotIndex !== null && (
                <span className="text-zinc-500 dark:text-zinc-400 text-xs font-bold ml-2">
                  ( {selectedSlotIndex + 1}番 スロット )
                </span>
              )}
            </h3>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブ切り替え - Step 1 の時のみ表示 */}
        {selectedSlotIndex === null && (
          <div className="grid grid-cols-2 p-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 mt-4 mx-5">
            <button
              onClick={() => setActiveTab('my')}
              className={cn(
                "py-3 rounded-xl font-black text-sm tracking-wide transition-all",
                activeTab === 'my'
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-zinc-200/50 dark:border-zinc-700/50"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              自チーム (My Team)
            </button>
            <button
              onClick={() => setActiveTab('opponent')}
              className={cn(
                "py-3 rounded-xl font-black text-sm tracking-wide transition-all",
                activeTab === 'opponent'
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-zinc-200/50 dark:border-zinc-700/50"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              相手チーム (Opponent)
            </button>
          </div>
        )}

        {/* メインコンテンツエリア */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-4 px-5 pb-5 scrollbar-hide">
          {selectedSlotIndex === null ? (
            /* STEP 1: LINEUP SLOTS LIST */
            <div className="grid grid-cols-1 gap-2.5">
              <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] px-1">
                交代対象の打順スロットを選択してください
              </p>
              {slots.map((slot) => {
                const isUnset = slot.playerName === "未設定";
                
                return (
                  <button
                    key={slot.index}
                    onClick={() => handleSelectSlot(slot.index)}
                    className={cn(
                      "w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border hover:border-primary/50 dark:hover:border-primary/50 transition-all flex items-center justify-between text-left group",
                      isUnset 
                        ? "border-zinc-200 dark:border-zinc-800 opacity-70 hover:opacity-100" 
                        : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      {/* 打順番号 */}
                      <div className="h-10 w-10 rounded-full bg-primary/5 dark:bg-primary/10 border border-primary/10 dark:border-primary/20 text-primary flex items-center justify-center font-black italic">
                        {slot.battingOrder}
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">守備位置:</span>
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-zinc-200/50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white">
                            {getPositionLabel(slot.position)}
                          </span>
                          {slot.uniformNumber !== "-" && (
                            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">
                              背番号 {slot.uniformNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-lg font-black tracking-tight text-zinc-900 dark:text-white mt-0.5">
                          {slot.playerName}
                        </p>
                      </div>
                    </div>

                    <div className="h-9 w-9 rounded-full bg-zinc-200/50 dark:bg-zinc-800 group-hover:bg-primary group-hover:text-primary-foreground flex items-center justify-center text-zinc-500 dark:text-zinc-400 transition-all duration-300">
                      <Repeat className="h-4 w-4" />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* STEP 2: ASSIGN PLAYER (BENCH SELECTOR / MANUAL ENTRY) */
            <div className="space-y-6">
              
              {/* 選択中のスロット情報 */}
              <div className="p-4 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/10 dark:border-primary/20 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black text-primary uppercase tracking-widest">SUBSTITUTING SLOT</span>
                  <p className="text-lg font-black italic leading-none text-zinc-900 dark:text-white mt-1">
                    {selectedSlotIndex + 1}番 {activeSlot ? getPositionLabel(activeSlot.position) : ""}
                  </p>
                  <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400 mt-0.5">
                    現在の選手: {activeSlot ? activeSlot.playerName : "未設定"}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSlotIndex(null)}
                  className="rounded-full text-xs font-black px-3 h-8 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  枠の変更
                </button>
              </div>

              {/* 手動追加・即席入力フォーム */}
              <form onSubmit={handleCustomSubmit} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-4">
                <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                  <UserPlus className="h-3.5 w-3.5 text-primary" /> 選手情報の直接入力（即席追加）
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 ml-1">選手名 *</span>
                    <input
                      placeholder="例: 佐藤 翼"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-primary transition-colors text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 ml-1">背番号</span>
                    <input
                      placeholder="例: 10"
                      value={customNumber}
                      onChange={(e) => setCustomNumber(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-primary transition-colors text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 ml-1">守備位置</span>
                  <div className="grid grid-cols-5 gap-1">
                    {posOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCustomPosition(opt.id)}
                        className={cn(
                          "py-2 text-xs font-black rounded-lg border transition-all active:scale-95",
                          customPosition === opt.id
                            ? "bg-primary border-primary text-primary-foreground"
                            : "bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!customName.trim()}
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-black text-sm tracking-wide disabled:opacity-50 active:scale-95 transition-all"
                >
                  手動入力選手で交代を実行
                </button>
              </form>

              {/* 名簿から選択 (自チームのみ) */}
              {activeTab === 'my' && (
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">
                    自チームのベンチメンバーから選択
                  </p>
                  
                  {/* 検索バー */}
                  <div className="relative group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-zinc-500 group-focus-within:text-primary transition-colors" />
                    <input
                      placeholder="ベンチ選手名・背番号で検索..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-11 pl-10 pr-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-primary transition-colors font-bold text-sm shadow-none"
                    />
                  </div>

                  {/* ベンチ選手リスト */}
                  <div className="space-y-2">
                    {isLoadingRoster ? (
                      <div className="flex py-12 justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" />
                      </div>
                    ) : filteredBench.length > 0 ? (
                      filteredBench.map((player) => (
                        <button
                          key={player.id}
                          onClick={() => handleExecuteSubstitution(
                            player.id,
                            player.name,
                            player.uniformNumber || "",
                            player.primaryPosition || "DH"
                          )}
                          className="w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-primary/50 dark:hover:border-primary/50 transition-all flex items-center justify-between text-left group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-11 w-11 rounded-full bg-zinc-200/50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-sm font-black italic group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all duration-300 text-zinc-900 dark:text-white">
                              {player.uniformNumber || "-"}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-zinc-200/50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400">
                                  {getPositionLabel(player.primaryPosition || "DH")}
                                </span>
                              </div>
                              <p className="text-base font-black tracking-tight text-zinc-900 dark:text-white mt-0.5">{player.name}</p>
                            </div>
                          </div>
                          <div className="h-8 w-8 rounded-full bg-zinc-200/50 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-primary/10 group-hover:text-primary transition-all">
                            <UserPlus className="h-4 w-4" />
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="py-8 text-center opacity-30 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                        <UserCog className="h-8 w-8 mx-auto mb-1.5" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">No Bench Players Available</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="mt-auto bg-zinc-50 dark:bg-zinc-900 px-5 py-4 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 text-zinc-450 dark:text-zinc-500">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-widest leading-none">Roster Syncing Enabled</span>
          </div>
          <p className="text-[9px] font-bold">iScore Personnel System</p>
        </div>
      </div>
    </div>,
    document.body
  );
}