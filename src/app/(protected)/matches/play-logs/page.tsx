// filepath: src/app/(protected)/matches/play-logs/page.tsx
"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, History, Loader2, Calendar, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { PlayLogCard, PlayLog, parseD1PlayLog } from "@/components/matches/PlayLogCard";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { AtBatEvent, ValidationMessage } from "@/types/api";

interface MatchOption {
  id: string;
  opponent: string;
  date: string;
}

function PlayLogsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlMatchId = searchParams.get("matchId") || searchParams.get("id");

  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [logs, setLogs] = useState<PlayLog[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // 🌟 スコアブックAIインポート用ステート
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedEvents, setAnalyzedEvents] = useState<AtBatEvent[]>([]);
  const [validationMessages, setValidationMessages] = useState<ValidationMessage[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // 🌟 スコアブック画像AI解析実行
  const handleStartImport = async () => {
    if (!selectedFile || !selectedMatchId) return;
    setIsAnalyzing(true);
    setValidationMessages([]);
    setAnalyzedEvents([]);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`/api/matches/${selectedMatchId}/scorebook/import`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("API Error Text:", errorText);
        
        let errorMessage = "解析に失敗しました";
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
          if (errorJson.details) {
            console.error("API Error Details:", errorJson.details);
          }
        } catch (_) {
          errorMessage = errorText.substring(0, 150) || errorMessage;
        }
        
        toast.error(errorMessage);
        setIsAnalyzing(false);
        return;
      }

      const data = await res.json() as { success: boolean; events?: AtBatEvent[]; validationMessages?: ValidationMessage[]; error?: string };

      if (data.success && data.events) {
        setAnalyzedEvents(data.events);
        setValidationMessages(data.validationMessages || []);
        toast.success("スコアブックの解析が完了しました！");
      } else {
        toast.error(data.error || "解析に失敗しました");
      }
    } catch (err: any) {
      console.error("Fetch Exception:", err);
      toast.error(`通信エラーが発生しました: ${err.message || err}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 🌟 編集時のリアルタイム論理検証
  const reEvaluateValidation = (events: AtBatEvent[]) => {
    const messages: ValidationMessage[] = [];
    const groups: { [key: string]: AtBatEvent[] } = {};
    events.forEach(e => {
      const key = `${e.inning}-${e.isTop ? 'top' : 'bottom'}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });

    for (const key in groups) {
      const inningEvents = groups[key].sort((a, b) => a.battingOrder - b.battingOrder);
      let accumulatedOuts = 0;
      inningEvents.forEach(e => {
        accumulatedOuts += Number(e.outsInThisPlay);
        if (accumulatedOuts > 3) {
          messages.push({
            type: 'ERROR',
            inning: e.inning,
            isTop: e.isTop,
            battingOrder: e.battingOrder,
            message: `イニング内のアウト数が3を超えています（現在のアウト数: ${accumulatedOuts}）。`
          });
        }
        
        const homeInCount = e.advances ? e.advances.filter(adv => adv.to === 'HP').length : 0;
        if (homeInCount !== Number(e.runsInThisPlay)) {
          messages.push({
            type: 'ERROR',
            inning: e.inning,
            isTop: e.isTop,
            battingOrder: e.battingOrder,
            message: `得点数（${e.runsInThisPlay}点）と生還した走者数（${homeInCount}人）が一致していません。`
          });
        }
      });
    }
    setValidationMessages(messages);
  };

  // 🌟 解析データ編集処理
  const handleEventChange = (index: number, field: keyof AtBatEvent, value: any) => {
    setAnalyzedEvents(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      reEvaluateValidation(copy);
      return copy;
    });
  };

  // 🌟 最終データ保存処理
  const handleSaveImport = async () => {
    if (analyzedEvents.length === 0 || !selectedMatchId) return;
    setIsSaving(true);

    try {
      const res = await fetch(`/api/matches/${selectedMatchId}/scorebook/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: analyzedEvents }),
      });
      const data = await res.json() as { success: boolean; error?: string };

      if (data.success) {
        toast.success("試合データを正常にインポートしました！");
        setIsImportModalOpen(false);
        setAnalyzedEvents([]);
        window.location.reload();
      } else {
        toast.error(data.error || "保存に失敗しました");
      }
    } catch (err) {
      console.error(err);
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSaving(false);
    }
  };

  // 1. Fetch matches for the selected team
  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const teamId = typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : null;
        if (!teamId) {
          setIsLoadingMatches(false);
          return;
        }

        const res = await fetch(`/api/matches?teamId=${teamId}`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data.map((m: any) => ({
            id: m.id,
            opponent: m.opponent || "対戦相手不明",
            date: m.date ? m.date.split("T")[0] : "",
          })) : [];

          setMatches(list);

          // Select default match: query param or the latest match
          if (urlMatchId && list.some((m: any) => m.id === urlMatchId)) {
            setSelectedMatchId(urlMatchId);
          } else if (list.length > 0) {
            setSelectedMatchId(list[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch matches:", error);
        toast.error("試合一覧の読み込みに失敗しました");
      } finally {
        setIsLoadingMatches(false);
      }
    };

    fetchMatches();
  }, [urlMatchId]);

  // 2. Fetch play logs when selected match changes
  useEffect(() => {
    if (!selectedMatchId) {
      setLogs([]);
      return;
    }

    const fetchLogs = async () => {
      setIsLoadingLogs(true);
      try {
        const res = await fetch(`/api/matches/${selectedMatchId}/logs`);
        if (res.ok) {
          const data = (await res.json()) as { success: boolean; logs: any[] };
          if (data.success && Array.isArray(data.logs)) {
            const selectedMatch = matches.find((m) => m.id === selectedMatchId);
            const gameTitle = selectedMatch
              ? `${selectedMatch.date} vs ${selectedMatch.opponent}`
              : "試合";

            // Parse D1 log entries dynamically (supports EDH/DH batter order correctly)
            const parsed = data.logs.map((log: any) => {
              const playLog = parseD1PlayLog(log, gameTitle);
              playLog.gameId = selectedMatchId;
              return playLog;
            });
            setLogs(parsed);
          } else {
            setLogs([]);
          }
        } else {
          setLogs([]);
        }
      } catch (error) {
        console.error("Failed to fetch logs:", error);
        toast.error("プレイログの取得に失敗しました");
      } finally {
        setIsLoadingLogs(false);
      }
    };

    fetchLogs();
  }, [selectedMatchId, matches]);

  const handleMatchChange = (matchId: string) => {
    setSelectedMatchId(matchId);
    // Sync the URL parameter
    router.replace(`/matches/play-logs?matchId=${matchId}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/matches/play-logs/edit?id=${id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/matches/logs/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        const data = (await res.json()) as { success: boolean };
        if (data.success) {
          setLogs((prev) => prev.filter((log) => log.id !== id));
          toast.success("プレイログを削除しました");
        } else {
          toast.error("プレイログの削除に失敗しました");
        }
      } else {
        toast.error("通信エラーが発生しました");
      }
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("削除処理に失敗しました");
    }
  };

  if (isLoadingMatches) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
            title="プレイログ" 
            subtitle="PLAY LOGS" 
            showPulse={false} 
          />
        </div>

        {/* ━━ 試合選択ドロップダウン ━━ */}
        {matches.length > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest pl-1">表示対象の試合を選択</label>
            <div className="relative">
              <select
                value={selectedMatchId}
                onChange={(e) => handleMatchChange(e.target.value)}
                className="w-full h-12 bg-card border-2 border-border/40 rounded-2xl px-4 text-xs font-black focus:outline-none appearance-none cursor-pointer hover:bg-muted/50 transition-colors"
              >
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.date} vs {m.opponent}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
          </div>
        )}

        {selectedMatchId && (
          <Button
            onClick={() => setIsImportModalOpen(true)}
            className="w-full h-12 rounded-2xl font-black italic gap-2 bg-primary text-primary-foreground shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Upload className="w-5 h-5" />
            手書きスコアから一括取込 (AI)
          </Button>
        )}

        {/* ━━ ログカードリスト ━━ */}
        <div className="grid grid-cols-1 gap-3">
          {isLoadingLogs ? (
            <div className="p-12 text-center flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider animate-pulse">Loading play logs...</span>
            </div>
          ) : logs.length === 0 ? (
            <EmptyState 
              icon={History} 
              title="プレイログがありません" 
              description={matches.length === 0 ? "チームの試合データを登録してください" : "選択した試合にはまだプレイログが記録されていません"} 
              className="mt-4"
            />
          ) : (
            logs.map((log) => (
              <PlayLogCard 
                key={log.id} 
                log={log} 
                onEdit={handleEdit} 
                onDelete={handleDelete} 
              />
            ))
          )}
        </div>

        {/* 🌟 スコアブックAI取込モーダル */}
        <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
          <DialogContent className="max-w-3xl rounded-[30px] p-6 sm:p-8 space-y-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-black italic text-primary flex items-center gap-2">
                <Upload className="h-6 w-6" />
                スコアブック一括取込 (AI)
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                手書きスコアブックの画像をAIで構造化データに変換し、試合データに流し込みます。
              </DialogDescription>
            </DialogHeader>

            {analyzedEvents.length === 0 ? (
              /* Step 1: 画像選択とアップロード */
              <div className="space-y-6">
                <div className="border-2 border-dashed border-border/80 rounded-2xl p-8 text-center space-y-4">
                  {selectedFile ? (
                    <div className="space-y-3">
                      <div className="h-40 relative flex items-center justify-center bg-muted/30 rounded-xl overflow-hidden">
                        <img 
                          src={URL.createObjectURL(selectedFile)} 
                          alt="Preview" 
                          className="h-full object-contain"
                        />
                      </div>
                      <p className="text-xs font-bold text-foreground truncate max-w-xs mx-auto">
                        選択されたファイル: {selectedFile.name}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedFile(null)}
                        className="text-xs text-destructive font-bold underline"
                      >
                        画像をクリア
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="h-16 w-16 bg-primary/5 rounded-full flex items-center justify-center mx-auto text-primary">
                        <Upload className="h-8 w-8" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-black">スコアブック画像をアップロード</p>
                        <p className="text-[10px] text-muted-foreground">JPEG, PNG, WEBP形式に対応しています</p>
                      </div>
                      <label className="inline-flex items-center justify-center px-6 h-10 rounded-full bg-primary text-primary-foreground font-black text-xs cursor-pointer shadow-sm hover:scale-[1.02] active:scale-95 transition-all">
                        画像を選択する
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                  )}
                </div>

                {selectedFile && (
                  <Button
                    onClick={handleStartImport}
                    disabled={isAnalyzing}
                    className="w-full h-14 rounded-2xl font-black text-sm gap-2"
                  >
                    {isAnalyzing ? (
                      <><Loader2 className="h-5 w-5 animate-spin" />画像を解析中...</>
                    ) : (
                      "AI解析を実行する"
                    )}
                  </Button>
                )}
              </div>
            ) : (
              /* Step 2: データ確認と編集 (Reconciliation UI) */
              <div className="space-y-6">
                {/* 警告メッセージの一覧表示 */}
                {validationMessages.length > 0 && (
                  <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-2xl space-y-2">
                    <p className="text-xs font-black text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      ルール上の矛盾が {validationMessages.length} 件検出されました。画像を確認して修正してください。
                    </p>
                    <div className="max-h-24 overflow-y-auto space-y-1 text-[10px] font-bold text-destructive/80 leading-relaxed pl-5 list-disc list-inside">
                      {validationMessages.map((msg, idx) => (
                        <div key={idx}>
                          ・{msg.inning}回{msg.isTop ? '表' : '裏'} 打順{msg.battingOrder}: {msg.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {validationMessages.length === 0 && (
                  <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-2xl flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <p className="text-xs font-black text-green-600 dark:text-green-400">
                      論理矛盾はありません。スコアデータの整合性が確認されました。
                    </p>
                  </div>
                )}

                {/* データ編集グリッドテーブル */}
                <div className="overflow-x-auto border border-border/60 rounded-2xl max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-black sticky top-0 border-b border-border/60">
                      <tr>
                        <th className="p-3">イニング</th>
                        <th className="p-3">打順</th>
                        <th className="p-3">打者</th>
                        <th className="p-3">投手</th>
                        <th className="p-3">打撃結果</th>
                        <th className="p-3 text-center">アウト</th>
                        <th className="p-3 text-center">得点</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-bold">
                      {analyzedEvents.map((e, idx) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="p-3 whitespace-nowrap">{e.inning}回{e.isTop ? '表' : '裏'}</td>
                          <td className="p-3">{e.battingOrder}</td>
                          <td className="p-3 text-primary truncate max-w-[80px]">{e.batterName}</td>
                          <td className="p-3 text-muted-foreground truncate max-w-[80px]">{e.pitcherName}</td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={e.result}
                              onChange={(evt) => handleEventChange(idx, 'result', evt.target.value)}
                              className="w-16 h-8 bg-card border border-border/60 rounded-xl px-2 text-center text-xs font-black focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max="3"
                              value={e.outsInThisPlay}
                              onChange={(evt) => handleEventChange(idx, 'outsInThisPlay', parseInt(evt.target.value) || 0)}
                              className="w-12 h-8 bg-card border border-border/60 rounded-xl px-2 text-center text-xs font-black focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max="4"
                              value={e.runsInThisPlay}
                              onChange={(evt) => handleEventChange(idx, 'runsInThisPlay', parseInt(evt.target.value) || 0)}
                              className="w-12 h-8 bg-card border border-border/60 rounded-xl px-2 text-center text-xs font-black focus:outline-none focus:border-primary"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAnalyzedEvents([]);
                      setValidationMessages([]);
                    }}
                    className="flex-1 h-12 rounded-xl font-bold"
                  >
                    やり直す
                  </Button>
                  <Button
                    onClick={handleSaveImport}
                    disabled={isSaving}
                    className="flex-1 h-12 rounded-xl font-black gap-2 bg-primary text-primary-foreground"
                  >
                    {isSaving ? (
                      <><Loader2 className="h-5 w-5 animate-spin" />保存中...</>
                    ) : (
                      "試合データに流し込む"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}

export default function PlayLogsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <PlayLogsContent />
    </Suspense>
  );
}
