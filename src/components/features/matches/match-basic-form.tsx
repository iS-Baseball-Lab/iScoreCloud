// filepath: src/components/features/matches/match-basic-form.tsx
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, Calendar, Clock, MapPin, Trophy, Hash, Tent } from "lucide-react";
import { cn } from "@/lib/utils";
import { TournamentSelector } from "./tournament-selector";

interface MatchFormState {
  opponent: string;
  date: string;
  time: string;
  venue: string;
  matchType: 'official' | 'practice';
  tournamentName: string;
  battingOrder: 'first' | 'second';
  benchSide: '1B' | '3B';
  inningCount: 6 | 7 | 9;
}

interface Props {
  state: MatchFormState;
  setState: (state: MatchFormState) => void;
  tournaments: any[];
  isNewTournament: boolean;
  setIsNewTournament: (val: boolean) => void;
}

export function MatchBasicForm({ state, setState, tournaments, isNewTournament, setIsNewTournament }: Props) {
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
        <div className="col-span-2 space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground"><MapPin className="h-3 w-3 inline mr-1" /> Venue</label>
          <Input placeholder="球場名" value={state.venue} onChange={e => setState({...state, venue: e.target.value})} className="h-11 rounded-2xl text-sm font-bold bg-background" /></div>
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

      {/* ベンチ・先攻後攻 */}
      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Tent className="h-3.5 w-3.5" /> Bench</label>
          <div className="flex p-1 bg-muted rounded-2xl border border-border">
            <button type="button" onClick={() => setState({...state, benchSide: '1B'})} className={cn("flex-1 h-9 text-[10px] font-black rounded-xl", state.benchSide === '1B' ? "bg-blue-600 text-white" : "text-muted-foreground")}>1塁側</button>
            <button type="button" onClick={() => setState({...state, benchSide: '3B'})} className={cn("flex-1 h-9 text-[10px] font-black rounded-xl", state.benchSide === '3B' ? "bg-red-600 text-white" : "text-muted-foreground")}>3塁側</button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Order</label>
          <div className="flex p-1 bg-muted rounded-2xl border border-border">
            <button type="button" onClick={() => setState({...state, battingOrder: 'first'})} className={cn("flex-1 h-9 text-[10px] font-black rounded-xl", state.battingOrder === 'first' ? "bg-background text-foreground" : "text-muted-foreground")}>先攻</button>
            <button type="button" onClick={() => setState({...state, battingOrder: 'second'})} className={cn("flex-1 h-9 text-[10px] font-black rounded-xl", state.battingOrder === 'second' ? "bg-background text-foreground" : "text-muted-foreground")}>後攻</button>
          </div>
        </div>
      </div>
    </div>
  );
}
