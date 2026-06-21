import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, Calendar, Clock, MapPin, Trophy, Hash, Tent } from "lucide-react";
import { cn } from "@/lib/utils";
import { TournamentSelector } from "./tournament-selector";

export interface MatchFormState {
  opponent: string;
  date: string;
  time: string;
  venue: string;
  venueId?: string | null; // 🌟 追加：球場ID
  matchType: 'official' | 'practice';
  tournamentName: string;
  battingOrder: 'first' | 'second' | 'unknown'; // 先攻後攻も未定があるかもしれないので拡張可能ですが、今回はベンチに集中します
  benchSide: '1B' | '3B' | 'unknown'; // 🌟 'unknown' を追加
  inningCount: 6 | 7 | 9;
}

interface Props {
  state: MatchFormState;
  setState: (state: MatchFormState) => void;
  tournaments: any[]; // ※ゆくゆくはTournament型を定義してimport推奨
  isNewTournament: boolean;
  setIsNewTournament: (val: boolean) => void;
}

export function MatchBasicForm({ state, setState, tournaments, isNewTournament, setIsNewTournament }: Props) {
  const [venues, setVenues] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    fetch("/api/venues")
      .then((res) => res.json())
      .then((data: any) => {
        if (data.success && Array.isArray(data.data)) {
          setVenues(data.data);
        }
      })
      .catch((err) => console.error("Failed to fetch venues", err));
  }, []);

  const suggestions = React.useMemo(() => {
    const query = state.venue.trim().toLowerCase();
    if (!query) {
      return venues.slice(0, 5); // 登録済みの球場を最大5件表示
    }
    return venues.filter(
      (v) =>
        v.name.toLowerCase().includes(query) ||
        (v.shortName && v.shortName.toLowerCase().includes(query)) ||
        (v.address && v.address.toLowerCase().includes(query))
    );
  }, [venues, state.venue]);

  const handleVenueChange = (val: string) => {
    const exactMatch = venues.find(
      (v) => v.name.toLowerCase() === val.trim().toLowerCase() || (v.shortName && v.shortName.toLowerCase() === val.trim().toLowerCase())
    );
    setState({
      ...state,
      venue: val,
      venueId: exactMatch ? exactMatch.id : null,
    });
  };

  const selectSuggestion = (v: any) => {
    setState({
      ...state,
      venue: v.name,
      venueId: v.id,
    });
    setShowSuggestions(false);
  };

  return (
    <div className="space-y-5">
      {/* 相手チーム */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Opponent</label>
        <Input placeholder="相手チーム名" value={state.opponent} onChange={e => setState({...state, opponent: e.target.value})} className="h-11 rounded-2xl text-sm font-bold bg-background border-border" />
      </div>

      {/* 日時・場所 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground"><Calendar className="h-3 w-3 inline mr-1" /> Date</label>
          <Input type="date" value={state.date} onChange={e => setState({...state, date: e.target.value})} className="h-11 rounded-2xl text-sm font-bold bg-background" /></div>
        <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" /> Time</label>
          <Input type="time" value={state.time} onChange={e => setState({...state, time: e.target.value})} className="h-11 rounded-2xl text-sm font-bold bg-background" /></div>
        <div className="col-span-2 space-y-1.5 relative"><label className="text-[10px] font-black uppercase text-muted-foreground"><MapPin className="h-3 w-3 inline mr-1" /> Venue</label>
          <Input 
            placeholder="球場名 (入力するとサジェストされます)" 
            value={state.venue} 
            onChange={e => handleVenueChange(e.target.value)} 
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              // delay to allow onMouseDown to execute
              setTimeout(() => setShowSuggestions(false), 200);
            }}
            className="h-11 rounded-2xl text-sm font-bold bg-background border-border" 
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-[100%] left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto bg-card border border-border rounded-2xl shadow-lg divide-y divide-border/40">
              {suggestions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onMouseDown={() => selectSuggestion(v)}
                  className="w-full px-4 py-3 text-left hover:bg-muted/80 active:bg-muted flex flex-col gap-0.5 transition-colors"
                >
                  <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    {v.name}
                    {v.shortName && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                        {v.shortName}
                      </span>
                    )}
                  </span>
                  {v.address && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {v.address}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 試合設定：タイプ・イニング */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" /> Type</label>
          <div className="flex gap-1.5">
            <Button type="button" variant={state.matchType === 'official' ? 'default' : 'outline'} onClick={() => setState({...state, matchType: 'official'})} className={cn("flex-1 h-11 rounded-2xl text-[10px] font-bold", state.matchType === 'official' && "bg-amber-600 hover:bg-amber-700")}>公式</Button>
            <Button type="button" variant={state.matchType === 'practice' ? 'default' : 'outline'} onClick={() => setState({...state, matchType: 'practice'})} className={cn("flex-1 h-11 rounded-2xl text-[10px] font-bold", state.matchType === 'practice' && "bg-emerald-600 hover:bg-emerald-700")}>練習</Button>
          </div>
        </div>
        <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" /> Innings</label>
          <div className="flex gap-1.5">
            {[6, 7, 9].map(num => (
              <Button type="button" key={num} variant={state.inningCount === num ? 'default' : 'outline'} onClick={() => setState({...state, inningCount: num as 6 | 7 | 9})} className={cn("flex-1 h-11 rounded-2xl text-[10px] font-bold", state.inningCount === num && "bg-primary")}>{num}回</Button>
            ))}
          </div>
        </div>
      </div>

      {/* 大会セレクター */}
      {state.matchType === 'official' && (
        <div className="space-y-2 animate-in fade-in">
          <label className="text-[10px] font-black uppercase text-amber-600 flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" /> Tournament</label>
          <TournamentSelector tournaments={tournaments} value={state.tournamentName} isNew={isNewTournament} onSelect={(name, createNew) => { setState({...state, tournamentName: name}); setIsNewTournament(createNew); }} />
          {isNewTournament && <Input autoFocus value={state.tournamentName} onChange={e => setState({...state, tournamentName: e.target.value})} className="h-11 rounded-2xl text-sm font-bold bg-amber-500/10 border-amber-500" />}
        </div>
      )}

      {/* 🌟 ベンチ・先攻後攻 */}
      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Tent className="h-3.5 w-3.5" /> Bench</label>
          <div className="flex p-1 bg-muted rounded-2xl border border-border">
            <button type="button" onClick={() => setState({...state, benchSide: '1B'})} className={cn("flex-1 h-9 text-[10px] font-black rounded-xl transition-colors", state.benchSide === '1B' ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}>1塁側</button>
            <button type="button" onClick={() => setState({...state, benchSide: 'unknown'})} className={cn("flex-1 h-9 text-[10px] font-black rounded-xl transition-colors", state.benchSide === 'unknown' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>未定</button>
            <button type="button" onClick={() => setState({...state, benchSide: '3B'})} className={cn("flex-1 h-9 text-[10px] font-black rounded-xl transition-colors", state.benchSide === '3B' ? "bg-red-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}>3塁側</button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Order</label>
          <div className="flex p-1 bg-muted rounded-2xl border border-border">
            <button type="button" onClick={() => setState({...state, battingOrder: 'first'})} className={cn("flex-1 h-9 text-[10px] font-black rounded-xl transition-colors", state.battingOrder === 'first' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>先攻</button>
            <button type="button" onClick={() => setState({...state, battingOrder: 'second'})} className={cn("flex-1 h-9 text-[10px] font-black rounded-xl transition-colors", state.battingOrder === 'second' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>後攻</button>
          </div>
        </div>
      </div>
    </div>
  );
}
