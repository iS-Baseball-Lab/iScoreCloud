// src/components/features/matches/match-basic-form.tsx
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, Calendar, Clock, MapPin, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { TournamentSelector } from "./tournament-selector";

export function MatchBasicForm({ state, setState, tournaments, isNewTournament, setIsNewTournament }: any) {
    return (
        <div className="space-y-5">
            <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Opponent</label>
                <Input value={state.opponent} onChange={e => setState({...state, opponent: e.target.value})} className="h-11 rounded-2xl text-sm font-bold bg-background border-border/50" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground"><Calendar className="h-3 w-3 inline" /> Date</label>
                    <Input type="date" value={state.date} onChange={e => setState({...state, date: e.target.value})} className="h-11 rounded-2xl text-sm font-bold" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground"><Clock className="h-3 w-3 inline" /> Time</label>
                    <Input type="time" value={state.time} onChange={e => setState({...state, time: e.target.value})} className="h-11 rounded-2xl text-sm font-bold" /></div>
            </div>
            {/* ...他項目も同様に分割 */}
        </div>
    );
}
