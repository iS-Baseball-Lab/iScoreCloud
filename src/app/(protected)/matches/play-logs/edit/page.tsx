// filepath: src/app/(protected)/matches/play-logs/edit/page.tsx
"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Save, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { toast } from "sonner";

function EditLogForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const logId = searchParams.get("id");

  const [log, setLog] = useState<any>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [batterId, setBatterId] = useState<string>("");
  const [pitcherId, setPitcherId] = useState<string>("");
  const [value, setValue] = useState("");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!logId) return;

    interface LogResponse {
      success: boolean;
      log?: {
        id: string;
        matchId: string;
        atBatId?: string;
        batterId?: string;
        pitcherId?: string;
        inningText: string;
        resultType: string;
        description: string;
        createdAt: string | number | Date;
      };
      roster?: any[];
      error?: string;
    }

    const fetchLog = async () => {
      try {
        const res = await fetch(`/api/matches/logs/${logId}`);
        if (res.ok) {
          const data = (await res.json()) as LogResponse;
          if (data.success && data.log) {
            setLog(data.log);
            setBatterId(data.log.batterId || "");
            setPitcherId(data.log.pitcherId || "");
            setRoster(data.roster || []);
            const desc = data.log.description || "";
            
            // 1. Extract BSO suffix if present
            const bsoMatch = desc.match(/\s\[B:(\d+),\s*S:(\d+),\s*O:(\d+)\]$/);
            let extractedSuffix = "";
            let cleanDesc = desc;
            if (bsoMatch) {
              extractedSuffix = bsoMatch[0]; // e.g. " [B:2, S:1, O:1]"
              cleanDesc = desc.replace(/\s\[B:\d+,\s*S:\d+,\s*O:\d+\]$/, "");
            }
            setSuffix(extractedSuffix);

            // 2. Extract batter prefix if present (e.g. "10番 佐藤: ")
            const batterMatch = cleanDesc.match(/^(\d+番\s*[^:]+):\s*(.*)$/);
            if (batterMatch) {
              setPrefix(`${batterMatch[1]}: `);
              setValue(batterMatch[2]);
            } else {
              setPrefix("");
              setValue(cleanDesc);
            }
          } else {
            toast.error("ログが見つかりませんでした");
          }
        } else {
          toast.error("ログの読み込みに失敗しました");
        }
      } catch (err) {
        console.error("Error fetching play log:", err);
        toast.error("通信エラーが発生しました");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLog();
  }, [logId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logId) return;

    // Rebuild the final description string to maintain structural compatibility
    const finalDescription = `${prefix}${value}${suffix}`;

    try {
      const res = await fetch(`/api/matches/logs/${logId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: finalDescription,
          resultType: log?.resultType || "play",
          atBatId: log?.atBatId || null,
          batterId: batterId || null,
          pitcherId: pitcherId || null,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { success: boolean };
        if (data.success) {
          toast.success("プレイログを保存しました！🔥");
          // Safely navigate back or to play-logs list with active match ID
          if (log?.matchId) {
            router.push(`/matches/play-logs?matchId=${log.matchId}`);
          } else {
            router.push("/matches/play-logs");
          }
        } else {
          toast.error("保存処理に失敗しました");
        }
      } else {
        toast.error("通信エラーが発生しました");
      }
    } catch (err) {
      console.error("Error saving log:", err);
      toast.error("保存に失敗しました");
    }
  };

  if (!logId) {
    return (
      <div className="p-6 bg-destructive/10 border border-destructive text-destructive font-black rounded-2xl text-center">
        エラー: ログIDが指定されていません。
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider animate-pulse">Loading play log...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 bg-card border border-border/50 p-5 rounded-[var(--radius-2xl)] shadow-sm">
      
      {/* 状況表示 */}
      {log && (
        <div className="bg-muted/30 border border-border/40 p-4 rounded-xl space-y-2 pointer-events-none">
          <div className="flex justify-between items-center text-xs font-black text-zinc-500">
            <span className="bg-foreground text-background px-2 py-0.5 rounded-sm">
              {log.inningText || "イニング不明"}
            </span>
            <span className="font-mono">{new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {prefix && (
            <div className="pt-1">
              <span className="text-[10px] font-black text-primary uppercase tracking-widest block">BATTER</span>
              <span className="text-base font-black italic text-zinc-900 dark:text-white">{prefix.replace(/:\s*$/, "")}</span>
            </div>
          )}
        </div>
      )}

      {/* 選手紐付け */}
      {log?.atBatId && (
        <div className="space-y-4 pt-2 border-t border-border/50">
          <div className="space-y-2 pt-2">
            <label className="text-xs font-black text-muted-foreground tracking-wider uppercase pl-1">打者 (Batter)</label>
            <select
              value={batterId}
              onChange={(e) => setBatterId(e.target.value)}
              className="flex h-12 w-full items-center justify-between rounded-[var(--radius-xl)] border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">(不明・未設定)</option>
              {roster.map(p => (
                <option key={p.id} value={p.id}>{p.uniform_number ? `${p.uniform_number} ` : ''}{p.name}</option>
              ))}
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-black text-muted-foreground tracking-wider uppercase pl-1">投手 (Pitcher)</label>
            <select
              value={pitcherId}
              onChange={(e) => setPitcherId(e.target.value)}
              className="flex h-12 w-full items-center justify-between rounded-[var(--radius-xl)] border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">(不明・未設定)</option>
              {roster.map(p => (
                <option key={p.id} value={p.id}>{p.uniform_number ? `${p.uniform_number} ` : ''}{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 打席結果入力 */}
      <div className="space-y-2">
        <label className="text-xs font-black text-muted-foreground tracking-wider uppercase pl-1">打席結果・メモ内容</label>
        <Input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="例：レフト前ヒット"
          className="rounded-[var(--radius-xl)]"
          required
        />
        {suffix && (
          <p className="text-[10px] text-zinc-400 font-bold pl-1">
            ※スコアコンテキスト {suffix} は自動的に保持されます
          </p>
        )}
      </div>

      {/* 保存ボタン */}
      <Button
        type="submit"
        className="w-full h-14 bg-primary text-primary-foreground font-black rounded-[var(--radius-xl)] shadow-md flex items-center justify-center gap-2 text-base active:scale-[0.98] transition-transform cursor-pointer"
      >
        <Save className="w-5 h-5" strokeWidth={2.5} />
        <span>ログを保存する</span>
      </Button>
    </form>
  );
}

export default function PlayLogEditPage() {
  const router = useRouter();

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
            title="プレイログ編集" 
            subtitle="EDIT PLAY LOG" 
            showPulse={false} 
          />
        </div>

        <Suspense fallback={
          <div className="p-12 text-center flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider animate-pulse">Loading form...</span>
          </div>
        }>
          <EditLogForm />
        </Suspense>

      </div>
    </div>
  );
}
