// filepath: src/app/(protected)/players/detail/page.tsx
"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, User, BarChart3, Activity, Map, Camera, ArrowLeft, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// 💡 共通コンポーネント（現場至上主義UI）
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";

// 💡 APIレスポンスの厳格な型定義
interface PlayerStats {
    playerName: string; plateAppearances: number; atBats: number; hits: number;
    singles: number; doubles: number; triples: number; homeRuns: number;
    walks: number; strikeouts: number;
}

interface PitcherStats {
    playerName: string; battersFaced: number; strikeouts: number; walks: number; hitsAllowed: number; outs: number;
}

interface SprayData {
    hitX: number; hitY: number; result: string; batterName: string;
}

// ━━ メインコンテンツコンポーネント ━━
function PlayerDetailContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const teamId = searchParams.get("teamId");
    const playerName = searchParams.get("playerName");
    const uniformNumber = searchParams.get("uniformNumber") || "--";

    const [isLoading, setIsLoading] = useState(true);
    const [batterStat, setBatterStat] = useState<PlayerStats | null>(null);
    const [pitcherStat, setPitcherStat] = useState<PitcherStats | null>(null);
    const [sprayData, setSprayData] = useState<SprayData[]>([]);

    useEffect(() => {
        if (!teamId || !playerName) {
            setIsLoading(false);
            return;
        }

        const fetchPlayerStats = async () => {
            setIsLoading(true);
            try {
                // Cloudflare Workers APIからのデータ取得
                const [bStatsRes, pStatsRes, sprayRes] = await Promise.all([
                    fetch(`/api/teams/${teamId}/stats`),
                    fetch(`/api/teams/${teamId}/pitcher-stats`),
                    fetch(`/api/teams/${teamId}/spray-chart`)
                ]);

                if (bStatsRes.ok) {
                    const allBStats = (await bStatsRes.json()) as PlayerStats[];
                    setBatterStat(allBStats.find(s => s.playerName === playerName) || null);
                }
                if (pStatsRes.ok) {
                    const allPStats = (await pStatsRes.json()) as PitcherStats[];
                    setPitcherStat(allPStats.find(s => s.playerName === playerName) || null);
                }
                if (sprayRes.ok) {
                    const allSpray = (await sprayRes.json()) as SprayData[];
                    setSprayData(allSpray.filter(s => s.batterName === playerName));
                }
            } catch (e) {
                console.error("データの取得に失敗しました", e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPlayerStats();
    }, [teamId, playerName]);

    const formatInnings = (outs: number) => {
        const fullInnings = Math.floor(outs / 3);
        const remainingOuts = outs % 3;
        return remainingOuts > 0 ? `${fullInnings} ${remainingOuts}/3` : `${fullInnings}`;
    };

    if (isLoading) {
        return (
            <div className="flex h-[60vh] items-center justify-center bg-background">
                <div className="text-center space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary/40 mx-auto" />
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Loading...</p>
                </div>
            </div>
        );
    }

    // 現場仕様: 情報不足時は EmptyState
    if (!playerName) {
        return (
            <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => router.back()}
                    className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
                >
                    <ArrowLeft className="h-4 w-4" />
                    戻る
                </Button>
                <EmptyState icon={UserCircle} title="選手情報が指定されていません" description="名簿一覧から再度選択してください" />
            </div>
        );
    }

    let avg = 0, obp = 0, slg = 0, ops = 0;
    if (batterStat) {
        avg = batterStat.atBats > 0 ? batterStat.hits / batterStat.atBats : 0;
        obp = batterStat.plateAppearances > 0 ? (batterStat.hits + batterStat.walks) / batterStat.plateAppearances : 0;
        const tb = batterStat.singles + (batterStat.doubles * 2) + (batterStat.triples * 3) + (batterStat.homeRuns * 4);
        slg = batterStat.atBats > 0 ? tb / batterStat.atBats : 0;
        ops = obp + slg;
    }

    return (
        <div className="flex flex-col min-h-screen text-foreground pb-24">
            <main className="flex-1 px-4 sm:px-6 max-w-5xl mx-auto w-full space-y-8 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* ━━ トップ：戻るボタン & SectionHeader ━━ */}
                <div className="space-y-4">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => router.back()}
                        className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        戻る
                    </Button>
                    <SectionHeader title="選手詳細" subtitle="PLAYER DETAILS" showPulse={false} />
                </div>

                {/* 究極UI: ヒーローパネル */}
                <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/90 text-primary-foreground rounded-[32px] p-6 sm:p-10 shadow-lg shadow-primary/20 border border-primary/20 group">
                    <div className="absolute -right-10 -top-10 w-64 h-64 bg-white/10 rounded-full pointer-events-none transition-transform duration-700 group-hover:scale-110" />

                    <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 relative z-10">
                        <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-[28px] bg-white/20 border border-white/30 flex flex-col items-center justify-center shrink-0 overflow-hidden text-white/80 relative shadow-inner">
                            <User className="h-12 w-12 sm:h-16 sm:w-16 mb-1 drop-shadow-sm" />
                            <span className="text-[10px] font-black uppercase tracking-wider">No Photo</span>
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-all duration-300 cursor-pointer">
                                <Camera className="h-8 w-8 text-white drop-shadow-md" />
                            </div>
                        </div>

                        <div className="space-y-3 text-center sm:text-left">
                            <div className="inline-flex items-center rounded-full px-3 py-1 text-[10px] sm:text-xs font-black bg-white/20 text-white uppercase tracking-[0.2em] border border-white/20 shadow-sm">
                                2026 Season
                            </div>
                            <div className="flex items-baseline justify-center sm:justify-start gap-3 sm:gap-4">
                                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter drop-shadow-md leading-none">
                                    {playerName}
                                </h1>
                                <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-white/70 drop-shadow-sm leading-none">
                                    #{uniformNumber}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-6">
                        
                        {/* 究極UI: 打撃成績 */}
                        <Card className="rounded-[32px] border-border/50 bg-card shadow-xs overflow-hidden transition-all duration-300 hover:shadow-md hover:border-primary/30">
                            <div className="bg-muted/30 p-5 sm:p-6 border-b border-border/50">
                                <h2 className="text-xl font-black tracking-tight flex items-center gap-2.5 text-foreground">
                                    <div className="p-2 bg-primary/10 rounded-xl text-primary"><BarChart3 className="h-5 w-5" /></div>
                                    打撃成績
                                </h2>
                            </div>
                            <CardContent className="p-5 sm:p-6">
                                {!batterStat ? (
                                    <div className="py-10 text-center text-muted-foreground font-bold bg-muted/20 rounded-[24px] border border-dashed border-border/60">打撃記録がありません</div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-3 gap-3 sm:gap-4">
                                            <div className="bg-primary/5 rounded-[24px] p-4 flex flex-col items-center justify-center border border-primary/10">
                                                <div className="text-[10px] sm:text-xs text-primary/70 font-black mb-1 uppercase tracking-widest">AVG</div>
                                                <div className="text-3xl sm:text-4xl font-black text-primary drop-shadow-sm leading-none">{avg.toFixed(3).replace(/^0/, '')}</div>
                                            </div>
                                            <div className="bg-muted/30 rounded-[24px] p-4 flex flex-col items-center justify-center border border-border/50">
                                                <div className="text-[10px] sm:text-xs text-muted-foreground font-black mb-1 uppercase tracking-widest">OBP</div>
                                                <div className="text-3xl sm:text-4xl font-black text-foreground leading-none">{obp.toFixed(3).replace(/^0/, '')}</div>
                                            </div>
                                            <div className="bg-muted/30 rounded-[24px] p-4 flex flex-col items-center justify-center border border-border/50">
                                                <div className="text-[10px] sm:text-xs text-muted-foreground font-black mb-1 uppercase tracking-widest">OPS</div>
                                                <div className="text-3xl sm:text-4xl font-black text-foreground leading-none">{ops.toFixed(3).replace(/^0/, '')}</div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex justify-between items-center bg-muted/20 px-5 py-3.5 rounded-[16px] border border-border/40">
                                                <span className="text-xs font-extrabold text-muted-foreground">試合(打席)</span><span className="font-black text-base">{batterStat.plateAppearances}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-muted/20 px-5 py-3.5 rounded-[16px] border border-border/40">
                                                <span className="text-xs font-extrabold text-muted-foreground">打数</span><span className="font-black text-base">{batterStat.atBats}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-muted/20 px-5 py-3.5 rounded-[16px] border border-border/40">
                                                <span className="text-xs font-extrabold text-muted-foreground">安打</span><span className="font-black text-base">{batterStat.hits}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-[#f97316]/5 px-5 py-3.5 rounded-[16px] border border-[#f97316]/20">
                                                <span className="text-xs font-extrabold text-[#f97316]">本塁打</span><span className="font-black text-base text-[#f97316] drop-shadow-sm">{batterStat.homeRuns}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-[#10b981]/5 px-5 py-3.5 rounded-[16px] border border-[#10b981]/20">
                                                <span className="text-xs font-extrabold text-[#10b981]">四死球</span><span className="font-black text-base text-[#10b981]">{batterStat.walks}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-[#ef4444]/5 px-5 py-3.5 rounded-[16px] border border-[#ef4444]/20">
                                                <span className="text-xs font-extrabold text-[#ef4444]">三振</span><span className="font-black text-base text-[#ef4444]">{batterStat.strikeouts}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* 究極UI: 投手成績 */}
                        <Card className="rounded-[32px] border-border/50 bg-card shadow-xs overflow-hidden transition-all duration-300 hover:shadow-md hover:border-blue-500/30">
                            <div className="bg-muted/30 p-5 sm:p-6 border-b border-border/50">
                                <h2 className="text-xl font-black tracking-tight flex items-center gap-2.5 text-foreground">
                                    <div className="p-2 bg-blue-500/10 rounded-xl text-blue-600"><Activity className="h-5 w-5" /></div>
                                    投手成績
                                </h2>
                            </div>
                            <CardContent className="p-5 sm:p-6">
                                {!pitcherStat ? (
                                    <div className="py-10 text-center text-muted-foreground font-bold bg-muted/20 rounded-[24px] border border-dashed border-border/60">登板記録がありません</div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                            <div className="bg-blue-500/5 rounded-[24px] p-4 flex flex-col items-center justify-center border border-blue-500/10">
                                                <div className="text-[10px] sm:text-xs text-blue-600/70 font-black mb-1 uppercase tracking-widest">Innings</div>
                                                <div className="text-3xl sm:text-4xl font-black text-blue-600 drop-shadow-sm leading-none">{formatInnings(pitcherStat.outs)}</div>
                                            </div>
                                            <div className="bg-red-500/5 rounded-[24px] p-4 flex flex-col items-center justify-center border border-red-500/10">
                                                <div className="text-[10px] sm:text-xs text-red-500/70 font-black mb-1 uppercase tracking-widest">Strikeouts</div>
                                                <div className="text-3xl sm:text-4xl font-black text-red-500 drop-shadow-sm leading-none">{pitcherStat.strikeouts}</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex justify-between items-center bg-muted/20 px-5 py-3.5 rounded-[16px] border border-border/40">
                                                <span className="text-xs font-extrabold text-muted-foreground">与四死球</span><span className="font-black text-base">{pitcherStat.walks}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-muted/20 px-5 py-3.5 rounded-[16px] border border-border/40">
                                                <span className="text-xs font-extrabold text-muted-foreground">被安打</span><span className="font-black text-base">{pitcherStat.hitsAllowed}</span>
                                            </div>
                                            <div className="col-span-2 flex justify-between items-center bg-muted/20 px-5 py-3.5 rounded-[16px] border border-border/40">
                                                <span className="text-xs font-extrabold text-muted-foreground">対打者数</span><span className="font-black text-base">{pitcherStat.battersFaced}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* 究極UI: スプレーチャート */}
                    <div>
                        <Card className="rounded-[32px] border-border/50 bg-card shadow-xs overflow-hidden h-full flex flex-col transition-all duration-300 hover:shadow-md hover:border-green-500/30">
                            <div className="bg-muted/30 p-5 sm:p-6 border-b border-border/50 shrink-0">
                                <h2 className="text-xl font-black tracking-tight flex items-center gap-2.5 text-foreground">
                                    <div className="p-2 bg-green-600/10 rounded-xl text-green-600"><Map className="h-5 w-5" /></div>
                                    スプレーチャート <span className="text-xs text-muted-foreground font-bold ml-1 tracking-wider">(打球方向)</span>
                                </h2>
                            </div>
                            <CardContent className="p-6 flex-1 flex flex-col justify-center">
                                {sprayData.length === 0 ? (
                                    <div className="py-20 text-center text-muted-foreground font-bold bg-muted/20 rounded-[24px] border border-dashed border-border/60">打球データがありません</div>
                                ) : (
                                    <>
                                        <div className="relative w-full max-w-[340px] aspect-square mx-auto drop-shadow-[0_10px_20px_rgba(0,0,0,0.1)] dark:drop-shadow-none">
                                            <svg viewBox="0 0 100 100" className="w-full h-full rounded-[24px] overflow-hidden bg-muted/10 border-[3px] border-border/40">
                                                <path d="M 50 90 L 15 20 Q 50 5 85 20 Z" fill="#15803d" stroke="#4ade80" strokeWidth="0.5" />
                                                <path d="M 50 90 L 68 54 Q 50 35 32 54 Z" fill="#a16207" />
                                                <line x1="50" y1="90" x2="15" y2="20" stroke="white" strokeWidth="0.5" />
                                                <line x1="50" y1="90" x2="85" y2="20" stroke="white" strokeWidth="0.5" />
                                                <polygon points="50,88 52,90 50,92 48,90" fill="white" />
                                                <polygon points="63,66 65,68 63,70 61,68" fill="white" />
                                                <polygon points="50,44 52,46 50,48 48,46" fill="white" />
                                                <polygon points="37,66 39,68 37,70 35,68" fill="white" />
                                            </svg>

                                            {sprayData.map((hit, i) => {
                                                const isOut = hit.result.includes('out') || hit.result.includes('double_play');
                                                const isHomeRun = hit.result === 'home_run';
                                                return (
                                                    <div
                                                        key={i}
                                                        className={cn(
                                                            "absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full border-[1.5px] border-white shadow-md transition-transform duration-200 hover:scale-[2] z-10 cursor-pointer",
                                                            isHomeRun ? "bg-orange-500" : isOut ? "bg-red-500" : "bg-blue-500"
                                                        )}
                                                        style={{ left: `${hit.hitX}%`, top: `${hit.hitY}%` }}
                                                        title={`${hit.result}`}
                                                    />
                                                );
                                            })}
                                        </div>
                                        <div className="flex justify-center gap-4 mt-6 text-xs font-bold text-muted-foreground">
                                            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-white" />安打</div>
                                            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 border border-white" />本塁打</div>
                                            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white" />アウト</div>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
}

// 💡 確実にSuspenseでラップし、エクスポートします
export default function PlayerDetailPage() {
    return (
        <Suspense fallback={
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
            </div>
        }>
            <PlayerDetailContent />
        </Suspense>
    );
}
