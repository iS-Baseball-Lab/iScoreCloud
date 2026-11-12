// src/app/(protected)/teams/_components/org-list.tsx
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronRight, Settings, Swords, Search, Plus, ChevronDown } from "lucide-react";
import { RiTeamFill } from "react-icons/ri";
import { cn } from "@/lib/utils";
import { Organization, Opponent } from "@/types/teams";

interface OrgListProps {
  orgs: Organization[];
  isLoading: boolean;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  onSelectOrg: (org: Organization) => void;
  onOpenDetail: (e: React.MouseEvent, org: Organization) => void;
  onOpponentClick: (opponent: Opponent & { originalOrg?: Organization }) => void;
  onAddOrg: (isExternal: boolean) => void;
}

const CATEGORIES = [
  { id: 'all', label: 'すべて', icon: '🌍' },
  { id: 'gakudo', label: '学童野球', icon: '🧢' },
  { id: 'junior', label: '中学野球', icon: '⚾️' },
  { id: 'high', label: '高校野球', icon: '🏫' },
  { id: 'adult', label: '一般・草野球', icon: '🍺' },
  { id: 'other', label: 'その他', icon: '📝' },
];

export function OrgList({ orgs, isLoading, selectedCategory, onCategoryChange, onSelectOrg, onOpenDetail, onOpponentClick, onAddOrg }: OrgListProps) {

  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);

  const filteredOrgs = orgs.filter(org => {
    const matchCategory = selectedCategory === 'all' || org.category === selectedCategory;
    const matchSearch = org.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const myOrgs = filteredOrgs.filter(org => org.myRole !== 'OPPONENT_MANAGER');
  const opponentOrgs = filteredOrgs.filter(org => org.myRole === 'OPPONENT_MANAGER');

  const realOpponents = opponentOrgs.map(org => ({
    id: org.id, name: org.name, matchCount: 0, lastMatch: '-',
    wins: 0, losses: 0, draws: 0, recentMatches: [], originalOrg: org
  }));

  const displayedOpponents = realOpponents.slice(0, visibleCount);

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const getRoleDisplayName = (role: string) => {
    if (role === 'OWNER') return '代表';
    if (role === 'OPPONENT_MANAGER') return '対戦相手';
    return role;
  };

  return (
    <div className="animate-in slide-in-from-left-4 fade-in duration-300 pb-10">
      {/* 🔥 究極UI: カテゴリボタンのグラスモーフィズム化 */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        {CATEGORIES.map(c => {
          const isSelected = selectedCategory === c.id;
          return (
            <button
              key={c.id}
              onClick={() => {
                onCategoryChange(c.id);
                setVisibleCount(10);
              }}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-black transition-all duration-300 active:scale-95 shadow-sm border",
                isSelected ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" : "bg-background/50 backdrop-blur-sm text-muted-foreground border-border/50 hover:bg-background/80 hover:text-foreground"
              )}
            >
              <span>{c.icon}</span> {c.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2.5 drop-shadow-sm">
          <RiTeamFill className="h-6 w-6 text-primary" />
          所属チーム <span className="text-muted-foreground/50 text-base sm:text-lg">({myOrgs.length})</span>
        </h2>
        <Button variant="outline" size="sm" onClick={() => onAddOrg(false)} className="rounded-full font-bold h-9 bg-background/50 backdrop-blur-sm hover:bg-primary hover:text-primary-foreground transition-colors border-border/50 shadow-sm md:hidden">
          <Plus className="h-4 w-4 mr-1" /> 追加
        </Button>
      </div>

      {/* 🔥 究極UI: Empty stateのすりガラス */}
      {myOrgs.length === 0 ? (
        <div className="text-center py-24 bg-primary/5 backdrop-blur-sm rounded-[32px] border border-dashed border-primary/20 mt-6 shadow-sm">
          <div className="h-24 w-24 bg-background/50 rounded-full flex items-center justify-center mx-auto mb-6 border border-border/50 shadow-sm">
            <RiTeamFill className="h-12 w-12 text-primary/60" />
          </div>
          <h3 className="text-xl font-black text-primary/90 mb-2 tracking-tight">チームが登録されていません</h3>
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 mt-4">
          {myOrgs.map((org) => (
            // 🔥 究極UI: チームカードのすりガラスとホバーエフェクト
            <Card key={org.id} onClick={() => onSelectOrg(org)} className="group relative overflow-hidden rounded-[28px] border border-border/50 bg-card/40 backdrop-blur-xl shadow-md transition-all duration-500 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/40 hover:-translate-y-1 active:scale-[0.98] cursor-pointer flex flex-col">
              <div className="absolute top-0 right-0 pointer-events-none opacity-60">
                <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-bl-full -mr-16 -mt-16 transition-transform duration-700 group-hover:scale-125 group-active:scale-125" />
                <div className="absolute top-0 right-0 w-36 h-36 bg-primary/5 rounded-bl-full -mr-10 -mt-10 transition-transform duration-700 delay-75 group-hover:scale-125 group-active:scale-125 group-hover:bg-primary/10 group-active:bg-primary/10" />
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-bl-full -mr-4 -mt-4 transition-transform duration-700 delay-150 group-hover:scale-[1.3] group-active:scale-[1.3] group-hover:bg-primary/20 group-active:bg-primary/20" />
              </div>

              <CardContent className="p-6 sm:p-8 relative z-10 flex flex-col h-full pointer-events-none">
                <div className="flex justify-between items-start mb-6">
                  <div className="p-3.5 bg-background/50 backdrop-blur-sm rounded-[20px] text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-active:bg-primary/10 group-active:text-primary transition-colors duration-300 shadow-sm border border-border/50 group-hover:border-primary/20 group-active:border-primary/20">
                    <RiTeamFill className="h-7 w-7" />
                  </div>
                  <div className="flex items-center gap-2 pointer-events-auto">
                    <div className="inline-flex items-center rounded-full px-3 py-1.5 text-[10px] sm:text-xs font-black bg-primary/10 text-primary uppercase tracking-widest transition-colors duration-300 border border-primary/20 shadow-sm pointer-events-none">
                      {getRoleDisplayName(org.myRole)}
                    </div>
                    <Button variant="ghost" size="icon" onClick={(e) => onOpenDetail(e, org)} className="h-9 w-9 rounded-full transition-colors z-20 bg-background/50 backdrop-blur-sm text-muted-foreground hover:bg-primary hover:text-primary-foreground shadow-sm border border-border/50">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight mb-2 truncate group-hover:text-primary group-active:text-primary transition-colors duration-300 drop-shadow-sm mt-auto">
                  {org.name}
                </h3>
                <div className="flex items-center text-sm font-extrabold text-muted-foreground mt-4 group-hover:text-primary/80 group-active:text-primary/80 transition-colors duration-300">
                  編成一覧を開く <ChevronRight className="h-5 w-5 ml-1 transition-transform duration-300 group-hover:translate-x-1 group-active:translate-x-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-16 animate-in slide-in-from-bottom-8 fade-in duration-500 delay-150 fill-mode-both">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 pt-6 border-t border-border/50">
          <div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2.5 text-foreground/80 drop-shadow-sm">
              <Swords className="h-5 w-5 text-primary/70" />
              対戦相手・その他チーム <span className="text-muted-foreground/50 text-base sm:text-lg">({realOpponents.length})</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="チームを検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-full border border-border/50 bg-background/50 backdrop-blur-sm pl-9 pr-4 text-sm font-bold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-all"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => onAddOrg(true)} className="rounded-full font-bold h-10 bg-background/50 backdrop-blur-sm hover:bg-primary hover:text-primary-foreground transition-colors border-border/50 shadow-sm shrink-0">
              <Plus className="h-4 w-4 mr-1" /> 追加
            </Button>
          </div>
        </div>

        {displayedOpponents.length === 0 ? (
          <div className="text-center py-16 bg-muted/30 backdrop-blur-sm rounded-[32px] border border-dashed border-border/50 shadow-sm">
            <div className="h-16 w-16 bg-background/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-border/50 shadow-sm text-muted-foreground"><Swords className="h-8 w-8" /></div>
            <h3 className="text-base font-black text-foreground/80 mb-1 tracking-tight">対戦相手が見つかりません</h3>
          </div>
        ) : (
          // 🔥 究極UI: 対戦相手リストのグラスモーフィズム
          <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-[28px] overflow-hidden shadow-md">
            {displayedOpponents.map((opp, index) => (
              <div key={opp.id} onClick={() => onOpponentClick(opp)} className={cn("group flex items-center justify-between p-4 sm:px-6 hover:bg-primary/5 transition-colors cursor-pointer", index !== displayedOpponents.length - 1 && "border-b border-border/50")}>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-sm sm:text-base border border-primary/20 shrink-0 group-hover:scale-105 transition-transform">{opp.name.charAt(0)}</div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-base sm:text-lg text-foreground group-hover:text-primary transition-colors drop-shadow-sm">{opp.name}</span>
                    </div>
                  </div>
                </div>
                <div className="h-8 w-8 rounded-full bg-background/50 backdrop-blur-sm border border-border/50 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all shadow-sm"><ChevronRight className="h-4 w-4" /></div>
              </div>
            ))}

            {realOpponents.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(prev => prev + 10)}
                className="w-full py-4 text-sm font-black flex items-center justify-center gap-2 text-primary/70 hover:text-primary hover:bg-primary/10 transition-colors border-t border-border/50"
              >
                もっと見る ({realOpponents.length - visibleCount}件) <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}