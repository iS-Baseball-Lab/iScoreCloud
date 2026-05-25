// filepath: src/components/layout/team-switcher.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Membership } from "@/types/api";

interface TeamSwitcherProps {
  activeTeam: Membership;
  memberships: Membership[];
  onTeamSwitch: (teamId: string, orgId?: string) => void;
}

export function TeamSwitcher({ activeTeam, memberships, onTeamSwitch }: TeamSwitcherProps) {
  const router = useRouter();

  if (!activeTeam) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div
          className="flex items-center gap-1.5 sm:gap-2 pl-1 pr-1.5 sm:pr-2 py-1.5 rounded-full bg-primary/10 backdrop-blur-md border border-primary/50 text-foreground shadow-[0_4px_15px_-3px_rgba(var(--primary),0.2)] hover:bg-primary/20 hover:border-primary/70 transition-all cursor-pointer group flex-1 max-w-[180px] min-[400px]:max-w-[200px] sm:max-w-[280px] outline-none"
          title="チームを切り替える"
        >
          {/* 親コンテナの縮小を防ぐ shrink-0 は死守 */}
          <Avatar className="h-7 w-7 sm:h-9 sm:w-9 border border-primary/30 bg-background group-hover:bg-primary/10 transition-colors shrink-0">
            {/* 🔥 修正：文字の縦割れ・ズレを完全に防ぐソリッドな中央配置クラスを注入 */}
            <AvatarFallback className="w-full h-full flex items-center justify-center text-primary font-black text-[10px] sm:text-[11px] whitespace-nowrap leading-none tracking-tighter select-none bg-background">
              {(activeTeam.organizationName || activeTeam.teamName || "T").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col justify-center overflow-hidden flex-1">
            <span className="text-[11px] sm:text-sm font-black tracking-widest uppercase truncate leading-tight group-hover:text-primary transition-colors">
              {activeTeam.organizationName || activeTeam.teamName}
            </span>
            <span className="text-[9px] sm:text-[11px] font-bold text-muted-foreground uppercase truncate leading-none mt-0.5">
              {activeTeam.organizationName ? (
                <>{activeTeam.teamName} <span className="opacity-60">({activeTeam.roleLabel})</span></>
              ) : activeTeam.roleLabel}
            </span>
          </div>
          <ChevronDown className="h-3 w-3 sm:h-5 sm:w-5 text-primary/80 group-hover:text-primary ml-0.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 sm:w-72 rounded-xl border-border/50 bg-white/95 dark:bg-background/95 backdrop-blur-xl p-2 shadow-lg">
        <DropdownMenuLabel className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">所属チーム・編成の切り替え</DropdownMenuLabel>
        {memberships?.map((m) => {
          const isCurrent = m.teamId === activeTeam.teamId;
          return (
            <DropdownMenuItem key={m.teamId} onClick={() => onTeamSwitch(m.teamId, m.organizationId)} className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${isCurrent ? 'bg-primary/10 text-primary focus:bg-primary/15' : 'hover:bg-muted focus:bg-muted'}`}>
              <Avatar className={`h-8 w-8 border shrink-0 ${isCurrent ? 'border-primary/40 bg-primary/20' : 'border-border/50 bg-background'}`}>
                {/* 🔥 修正：リスト内の一覧アバターも同様に改行バグを完全封殺 */}
                <AvatarFallback className={`w-full h-full flex items-center justify-center font-black text-[10px] sm:text-[11px] whitespace-nowrap leading-none tracking-tighter select-none ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                  {(m.organizationName || m.teamName || "T").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 overflow-hidden">
                <span className="text-sm font-bold truncate leading-tight">{m.organizationName || m.teamName}</span>
                <span className="text-[10px] font-bold opacity-70 truncate mt-0.5">{m.organizationName ? `${m.teamName} (${m.roleLabel})` : m.roleLabel}</span>
              </div>
              {isCurrent && <Check className="h-4 w-4 text-primary shrink-0 self-center" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="bg-border/50 my-2" />
        <DropdownMenuItem onClick={() => router.push('/teams')} className="cursor-pointer gap-2 p-2.5 rounded-lg text-primary hover:text-primary focus:text-primary font-bold">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Plus className="h-4 w-4" /></div>
          チーム・編成を管理する
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
