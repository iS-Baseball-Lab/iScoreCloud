// filepath: src/app/(protected)/team/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Users, MapPin, Calendar, Shield, Trophy, Loader2, Camera, Settings, Crown, UserCircle, Info, ChevronRight, BarChart3 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";


interface Team {
  id: string;
  name: string;
  orgName?: string;
  description?: string;
  category?: string;
  homeGround?: string;
  managerName?: string;
  year: number | null;
  tier: string | null;
  teamType: string | null;
  myRole: string;
  isFounder: boolean | number; // 💡 SQLiteから 0/1 で返ってくる可能性を考慮
}

interface MatchStats {
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}

interface TeamStats {
  overall: MatchStats;
  official: MatchStats;
  practice: MatchStats;
  avgRuns: number;
  teamAvg: string;
  teamHR: string;
}

const initialMatchStats = { totalGames: 0, wins: 0, draws: 0, losses: 0, winRate: 0 };

const WinRateDonut = ({ stats, label, subLabel, size = "sm" }: { stats: MatchStats, label: string, subLabel: string, size?: "sm" | "lg" }) => {
  const radius = size === "lg" ? 54 : 36;
  const strokeWidth = size === "lg" ? 10 : 7;
  const viewBox = size === "lg" ? "0 0 120 120" : "0 0 88 88";
  const center = size === "lg" ? 60 : 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * stats.winRate) / 100;

  return (
    <div className="flex flex-col items-center group">
      <div className={cn("relative flex items-center justify-center", size === 'lg' ? 'w-36 h-36 sm:w-40 sm:h-40' : 'w-24 h-24 sm:w-28 sm:h-28')}>
        <svg className="w-full h-full -rotate-90 drop-shadow-sm" viewBox={viewBox}>
          <circle cx={center} cy={center} r={radius} className="stroke-border/50 fill-none" strokeWidth={strokeWidth} />
          <circle
            cx={center} cy={center} r={radius}
            className="stroke-primary fill-none transition-all duration-1000 ease-out"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-black tabular-nums tracking-tighter text-foreground", size === 'lg' ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl')}>
            {stats.winRate}<span className={cn("text-muted-foreground", size === 'lg' ? 'text-xl' : 'text-sm')}>%</span>
          </span>
          {size === 'lg' ? <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-60 -mt-1">Win Rate</span> : null}
        </div>
      </div>
      <div className="mt-3 text-center">
        <p className={cn("font-black text-foreground", size === 'lg' ? 'text-base' : 'text-sm')}>{label}</p>
        <p className="text-[10px] font-bold text-muted-foreground">{stats.wins}勝 {stats.losses}敗 {stats.draws > 0 ? `${stats.draws}分` : ''}</p>
      </div>
    </div>
  );
};

export default function TeamProfilePage() {
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [stats, setStats] = useState<TeamStats>({
    overall: initialMatchStats, official: initialMatchStats, practice: initialMatchStats,
    avgRuns: 0, teamAvg: ".000", teamHR: "0"
  });
  const [isLoading, setIsLoading] = useState(true);

  // ━━ チーム編集モーダルの状態 ━━
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormName, setEditFormName] = useState("");
  const [editFormManagerName, setEditFormManagerName] = useState("");
  const [editFormHomeGround, setEditFormHomeGround] = useState("");
  const [editFormYear, setEditFormYear] = useState<number>(2026);
  const [editFormTier, setEditFormTier] = useState("");
  const [editFormDescription, setEditFormDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openEditModal = () => {
    if (!team) return;
    setEditFormName(team.name || "");
    setEditFormManagerName(team.managerName || "");
    setEditFormHomeGround(team.homeGround || "");
    setEditFormYear(Number(team.year) || new Date().getFullYear());
    setEditFormTier(team.tier || "");
    setEditFormDescription(team.description || "");
    setIsEditModalOpen(true);
  };

  const handleEditTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!team) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editFormName.trim(),
          managerName: editFormManagerName.trim(),
          homeGround: editFormHomeGround.trim(),
          year: editFormYear,
          tier: editFormTier.trim(),
          description: editFormDescription.trim()
        })
      });
      if (!res.ok) throw new Error();
      toast.success("チーム情報を更新しました");
      setIsEditModalOpen(false);
      window.location.reload();
    } catch {
      toast.error("情報の更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchTeamData = async () => {
      try {
        const activeTeamId = localStorage.getItem("iscore_selectedTeamId");
        if (!activeTeamId) { setIsLoading(false); return; }

        const teamsResponse = await fetch("/api/teams", { cache: "no-store" });
        if (!teamsResponse.ok) throw new Error("取得失敗");
        const teamsData: Team[] = await teamsResponse.json();
        const currentTeam = teamsData.find(t => t.id === activeTeamId);

        if (currentTeam) {
          setTeam(currentTeam);

          const playersResponse = await fetch(`/api/teams/${activeTeamId}/players`, { cache: "no-store" });
          if (playersResponse.ok) {
            const playersData = (await playersResponse.json()) as { id: string }[];
            setMemberCount(playersData.length || 0);
          }

          const matchesRes = await fetch(`/api/teams/${activeTeamId}/all-matches`, { cache: "no-store" });
          let overall = { ...initialMatchStats }, official = { ...initialMatchStats }, practice = { ...initialMatchStats };
          let totalRuns = 0;

          if (matchesRes.ok) {
            const matchesData = await matchesRes.json() as { myScore: number; opponentScore: number; matchType: string }[];
            const calc = (matches: { myScore: number; opponentScore: number }[]) => {
              let w = 0, l = 0, d = 0;
              matches.forEach(m => {
                if (m.myScore > m.opponentScore) w++;
                else if (m.myScore < m.opponentScore) l++;
                else d++;
              });
              const t = matches.length;
              return { totalGames: t, wins: w, losses: l, draws: d, winRate: (w + l) > 0 ? Math.round((w / (w + l)) * 100) : 0 };
            };

            overall = calc(matchesData);
            official = calc(matchesData.filter(m => m.matchType === 'official'));
            practice = calc(matchesData.filter(m => m.matchType === 'practice'));
            totalRuns = matchesData.reduce((sum, m) => sum + m.myScore, 0);
          }

          const statsRes = await fetch(`/api/teams/${activeTeamId}/stats`, { cache: "no-store" });
          let teamAvg = ".000", teamHR = "0";
          if (statsRes.ok) {
            const statsData = await statsRes.json() as { atBats?: number; hits?: number; homeRuns?: number }[];
            let totalAB = 0, totalHits = 0, totalHR = 0;
            statsData.forEach(p => {
              totalAB += p.atBats || 0;
              totalHits += p.hits || 0;
              totalHR += p.homeRuns || 0;
            });
            teamAvg = totalAB > 0 ? (totalHits / totalAB).toFixed(3).replace(/^0+/, '') : ".000";
            teamHR = totalHR.toString();
          }

          setStats({
            overall, official, practice,
            avgRuns: overall.totalGames > 0 ? Number((totalRuns / overall.totalGames).toFixed(1)) : 0,
            teamAvg, teamHR
          });

        }
      } catch (error) {
        toast.error("データの読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    };
    fetchTeamData();
  }, []);

  if (isLoading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!team) return <div className="p-20 text-center text-muted-foreground">チームが選択されていません</div>;

  // 🌟 パラノイア級の確実な権限判定（絶対に boolean 型にする）
  const userRole = team.myRole ? String(team.myRole).toUpperCase() : "";
  const isFounder = team.isFounder === true || team.isFounder === 1;
  const canManage = (userRole === 'ADMIN' || userRole === 'MANAGER' || isFounder) === true;

  return (
    <div className="w-full animate-in fade-in duration-500 bg-transparent min-h-screen">

      <div className="relative w-full aspect-[21/9] lg:aspect-[4/1] bg-muted overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-cover bg-center opacity-80" style={{ backgroundImage: `url('/team-cover.webp')` }} />
        <div className="absolute inset-0 bg-black/20 dark:bg-black/50" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">

        <div className="relative -mt-16 sm:-mt-20 flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 mb-8 sm:mb-12">
          <div className="relative group shrink-0 self-start sm:self-auto">
            <Avatar className="h-28 w-28 sm:h-36 sm:w-36 border-4 border-background shadow-xl bg-white dark:bg-zinc-800">
              <AvatarFallback className="text-4xl sm:text-5xl font-black text-primary bg-primary/10">
                {(team.orgName || team.name || "T").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {/* 🌟 修正：完全な三項演算子でガード */}
            {canManage === true ? (
              <button className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 p-2.5 sm:p-3 bg-primary text-primary-foreground rounded-full shadow-lg hover:scale-110 active:scale-95 transition-transform border-2 border-background cursor-pointer">
                <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-col flex-1 pb-1">
            <h2 className="text-sm sm:text-base font-black text-primary mb-1">
              {team.orgName || "所属組織なし"}
            </h2>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground leading-tight mb-3">
              {team.name || "チーム名未設定"}
            </h1>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                <Trophy className="h-3.5 w-3.5" />
                {team.teamType === 'regular' ? '一般チーム' : team.teamType || "TEAM"}
              </span>
              
              {/* 🌟 修正：&&を排除し、完全な三項演算子でガード */}
              {(team.year !== null && team.year !== undefined && Number(team.year) > 0) ? (
                <span className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold bg-white/60 dark:bg-zinc-800/60 backdrop-blur-sm text-foreground border border-border/50 px-3 py-1 rounded-full shadow-sm">
                  <Calendar className="h-3.5 w-3.5" /> Est. {team.year}
                </span>
              ) : null}

              {/* 🌟 修正：&&を排除し、完全な三項演算子でガード */}
              {(team.tier !== null && team.tier !== undefined && String(team.tier) !== "0") ? (
                <span className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold bg-white/60 dark:bg-zinc-800/60 backdrop-blur-sm text-foreground border border-border/50 px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                  <Shield className="h-3.5 w-3.5" /> Tier: {team.tier}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-8">
            <Card className="p-0 gap-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-border/40 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-6 sm:p-10 flex flex-col items-center space-y-8">
                <div className="flex items-end justify-center gap-4 sm:gap-8 w-full">
                  <WinRateDonut stats={stats.official} label="公式戦" subLabel="Official" size="sm" />
                  <div className="-mb-4">
                    <WinRateDonut stats={stats.overall} label="総合勝率" subLabel="Overall" size="lg" />
                  </div>
                  <WinRateDonut stats={stats.practice} label="練習試合" subLabel="Practice" size="sm" />
                </div>

                <div className="grid grid-cols-3 w-full pt-6 border-t border-border/40">
                  <div className="text-center pt-2">
                    <p className="text-xl font-black text-foreground">{stats.avgRuns}</p>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Avg Runs</p>
                  </div>
                  <div className="text-center border-l border-border/40 pt-2">
                    <p className="text-xl font-black text-primary">{stats.teamAvg}</p>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Team AVG</p>
                  </div>
                  <div className="text-center border-l border-border/40 pt-2">
                    <p className="text-xl font-black text-foreground">{stats.teamHR}</p>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Team HR</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="p-8 rounded-3xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md border border-border/40 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                  <Info className="h-4 w-4" /> Club Identity
                </h3>
                {canManage === true ? (
                  <Button
                    onClick={openEditModal}
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[11px] font-black border border-border/60 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-lg gap-1 px-3"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    編集する
                  </Button>
                ) : null}
              </div>

              {team.description ? (
                <p className="text-lg font-bold text-foreground leading-relaxed italic border-l-4 border-primary pl-4">
                  「{team.description}」
                </p>
              ) : (
                <p className="text-sm font-medium text-muted-foreground italic border-l-4 border-muted pl-4">
                  チームのスローガンや紹介文が未設定です。
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-6 pt-4">
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Home Ground</span>
                  <p className="text-sm font-semibold flex items-center text-foreground">
                    <MapPin className="h-4 w-4 mr-1.5 text-primary" /> {team.homeGround || "未設定"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Manager</span>
                  <p className="text-sm font-semibold flex items-center text-foreground">
                    <UserCircle className="h-4 w-4 mr-1.5 text-primary" /> {team.managerName || "未設定"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="p-8 rounded-3xl bg-primary/5 dark:bg-primary/10 border border-primary/20 shadow-sm group backdrop-blur-md">
              <span className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block">Active Roster</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-5xl font-black text-primary">{memberCount}</span>
                <span className="text-sm font-bold text-primary/80">選手</span>
              </div>
            </div>

            <div className="space-y-3">
              <button onClick={() => router.push('/members')} className="flex items-center gap-5 p-6 rounded-2xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md border border-border/40 hover:border-primary/40 hover:bg-white/80 dark:hover:bg-zinc-800/80 transition-all group shadow-sm text-left w-full cursor-pointer">
                <div className="p-4 rounded-xl bg-muted dark:bg-zinc-800 group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                  <Users className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black uppercase tracking-widest text-foreground">名簿・メンバー管理</p>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase">Members & Roles</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary transition-all group-hover:translate-x-1" />
              </button>

              <button onClick={() => router.push('/matches')} className="flex items-center gap-5 p-6 rounded-2xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md border border-border/40 hover:border-primary/40 hover:bg-white/80 dark:hover:bg-zinc-800/80 transition-all group shadow-sm text-left w-full cursor-pointer">
                <div className="p-4 rounded-xl bg-muted dark:bg-zinc-800 group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black uppercase tracking-widest text-foreground">試合結果・スコア</p>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase">Match Results</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary transition-all group-hover:translate-x-1" />
              </button>
            </div>

          </div>
        </div>

      </div>

      {/* チーム情報編集ダイアログ */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">チームプロフィールの編集</DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">
              チームの基本情報やスローガンを修正します。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditTeam} className="space-y-4 pt-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">チーム名 (必須)</label>
              <Input value={editFormName} onChange={e => setEditFormName(e.target.value)} required className="h-11 rounded-xl" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">監督名</label>
                <Input value={editFormManagerName} onChange={e => setEditFormManagerName(e.target.value)} placeholder="未設定" className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">本拠地グラウンド</label>
                <Input value={editFormHomeGround} onChange={e => setEditFormHomeGround(e.target.value)} placeholder="未設定" className="h-11 rounded-xl" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">創設年度 (西暦)</label>
                <Input type="number" value={editFormYear} onChange={e => setEditFormYear(Number(e.target.value))} required className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Tier / 階層</label>
                <Input value={editFormTier} onChange={e => setEditFormTier(e.target.value)} placeholder="例: A, B, 1軍" className="h-11 rounded-xl" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">スローガン / チーム紹介文</label>
              <textarea 
                value={editFormDescription} 
                onChange={e => setEditFormDescription(e.target.value)} 
                placeholder="スローガンや紹介文を入力してください。"
                rows={3}
                className="w-full rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 text-base font-bold shadow-xs transition-all duration-300 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:bg-background resize-none"
              />
            </div>

            <div className="flex gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)} className="flex-1 h-12 rounded-xl font-black">キャンセル</Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 rounded-xl font-black">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存する"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
