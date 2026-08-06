// filepath: src/components/features/teams/team-member-card.tsx
"use client";

import React, { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShieldCheck, Loader2, UserCog, Trash2, Crown, Users, Clock, ChevronDown, HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLES } from "@/lib/roles";
import type { Role } from "@/lib/roles";

export interface TeamMember {
  memberId: string;
  userId: string;
  name: string;
  authProviders?: string[];
  avatarUrl: string | null;
  role: string;
  subRoles?: string[]; // 🌟 兼務（マルチロール）
  status: "active" | "pending";
  joinedAt: number | null;
  email?: string | null;
}

const ROLE_CONFIG: Record<string, { label: string; desc: string; color: string; bg: string; icon: React.ReactNode; }> = {
  [ROLES.ADMIN]: { label: "IT管理者", desc: "システム最高管理者", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", icon: <Crown className="h-3.5 w-3.5" /> },
  [ROLES.MANAGER]: { label: "監督/代表", desc: "全権限 — チーム設定・メンバー管理まで", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", icon: <Crown className="h-3.5 w-3.5" /> },
  [ROLES.COACH]: { label: "コーチ", desc: "スコア入力・選手管理・データ閲覧", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  [ROLES.SCORER]: { label: "スコアラー", desc: "スコア入力・データ閲覧", color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10 border-green-500/30", icon: <UserCog className="h-3.5 w-3.5" /> },
  [ROLES.STAFF]: { label: "スタッフ", desc: "データ閲覧・限定アクセス", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10 border-purple-500/30", icon: <Users className="h-3.5 w-3.5" /> },
  [ROLES.PARENT]: { label: "保護者", desc: "選手サポート・スケジュール・データ閲覧", color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10 border-rose-500/30", icon: <HeartHandshake className="h-3.5 w-3.5" /> },
  [ROLES.PLAYER]: { label: "選手", desc: "チームデータの閲覧のみ", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/10 border-sky-500/30", icon: <Users className="h-3.5 w-3.5" /> },
  [ROLES.VIEWER]: { label: "閲覧者", desc: "統計・試合結果の閲覧のみ", color: "text-muted-foreground", bg: "bg-muted/40 border-border/40", icon: <Users className="h-3.5 w-3.5" /> },
  [ROLES.PENDING]: { label: "承認待ち", desc: "参加申請中", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", icon: <Clock className="h-3.5 w-3.5" /> },
};

const SELECTABLE_ROLES: Role[] = [
  ROLES.MANAGER, 
  ROLES.COACH, 
  ROLES.SCORER, 
  ROLES.STAFF, 
  ROLES.PARENT, 
  ROLES.PLAYER, 
  ROLES.VIEWER,
  ROLES.ADMIN,
];

const SUB_ROLE_CANDIDATES = [
  { role: ROLES.SCORER, label: "スコアラー" },
  { role: ROLES.PARENT, label: "保護者" },
  { role: ROLES.COACH, label: "コーチ" },
  { role: ROLES.STAFF, label: "スタッフ" },
  { role: ROLES.ADMIN, label: "IT管理者" },
];

function getRoleConfig(role: string) { return ROLE_CONFIG[role] ?? { label: role, desc: "", color: "text-muted-foreground", bg: "bg-muted/40 border-border/40", icon: <Users className="h-3.5 w-3.5" /> }; }

function RoleBadge({ role }: { role: string }) {
  const cfg = getRoleConfig(role);
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider", cfg.bg, cfg.color)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function SubRoleBadge({ role }: { role: string }) {
  const cfg = getRoleConfig(role);
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border opacity-90", cfg.bg, cfg.color)}>
      {cfg.label}
    </span>
  );
}

function RoleSelector({ currentRole, currentSubRoles = [], memberId, myRole, onRoleChange, disabled }: {
  currentRole: string;
  currentSubRoles?: string[];
  memberId: string;
  myRole: string;
  onRoleChange: (memberId: string, newRole: string, newSubRoles?: string[]) => Promise<void>;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [selectedMainRole, setSelectedMainRole] = useState(currentRole);
  const [selectedSubRoles, setSelectedSubRoles] = useState<string[]>(currentSubRoles);

  const cfg = getRoleConfig(currentRole);
  const canChange = !disabled && (myRole === ROLES.MANAGER || myRole === "SYSTEM_ADMIN" || myRole === "admin");

  const toggleSubRole = (subRole: string) => {
    setSelectedSubRoles(prev => 
      prev.includes(subRole) ? prev.filter(r => r !== subRole) : [...prev, subRole]
    );
  };

  const handleSave = async () => {
    setIsChanging(true);
    setIsOpen(false);
    await onRoleChange(memberId, selectedMainRole, selectedSubRoles);
    setIsChanging(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => canChange && setIsOpen(!isOpen)}
          disabled={isChanging || !canChange}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider transition-all",
            cfg.bg, cfg.color, canChange && "hover:opacity-85 cursor-pointer shadow-sm", !canChange && "cursor-default opacity-90"
          )}
        >
          {isChanging ? <Loader2 className="h-3 w-3 animate-spin" /> : cfg.icon}
          {cfg.label}
          {canChange && <ChevronDown className={cn("h-3 w-3 transition-transform duration-150", isOpen && "rotate-180")} />}
        </button>

        {/* 🌟 サブバッジ（兼務タグ）の表示 */}
        {currentSubRoles.filter(r => r !== currentRole).map(sr => (
          <SubRoleBadge key={sr} role={sr} />
        ))}
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-7 z-40 w-64 rounded-[var(--radius-xl)] border border-border bg-card shadow-2xl p-3 animate-in fade-in slide-in-from-top-1 duration-150 space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider mb-1.5">メイン役割 (基本権限)</p>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
                {SELECTABLE_ROLES.map((r) => {
                  const rc = getRoleConfig(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelectedMainRole(r)}
                      className={cn(
                        "w-full flex items-start gap-2 px-2 py-1.5 rounded-xl text-left transition-colors",
                        r === selectedMainRole ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/70 border border-transparent"
                      )}
                    >
                      <span className={cn("mt-0.5 shrink-0", rc.color)}>{rc.icon}</span>
                      <div className="flex flex-col min-w-0">
                        <span className={cn("text-xs font-black tracking-wide", rc.color)}>{rc.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-border/60">
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider mb-1.5">兼務役割 (サブバッジ)</p>
              <div className="flex flex-wrap gap-1.5">
                {SUB_ROLE_CANDIDATES.map(item => {
                  const isChecked = selectedSubRoles.includes(item.role);
                  return (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => toggleSubRole(item.role)}
                      className={cn(
                        "text-[10px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer",
                        isChecked
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                      )}
                    >
                      {item.label} {isChecked && "✓"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 py-1.5 text-xs font-bold rounded-xl border border-border bg-muted/40 hover:bg-muted text-foreground"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 py-1.5 text-xs font-black rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                決定・保存
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const getProviderConfig = (provider: string) => {
  const p = provider.toLowerCase();
  if (p.includes("google")) return { label: "Google", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" };
  if (p.includes("line")) return { label: "LINE", color: "text-[#06C755]", bg: "bg-[#06C755]/10", border: "border-[#06C755]/20" };
  if (p.includes("microsoft") || p.includes("azure")) return { label: "Microsoft", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" };
  return { label: "Email Auth", color: "text-muted-foreground", bg: "bg-muted/50", border: "border-border" };
};

interface TeamMemberCardProps {
  member: TeamMember;
  myUserId: string;
  myRole: string;
  onRoleChange: (memberId: string, newRole: string, newSubRoles?: string[]) => Promise<void>;
  onRemove: (member: TeamMember) => void;
}

export function TeamMemberCard({ member, myUserId, myRole, onRoleChange, onRemove }: TeamMemberCardProps) {
  const isMe = member.userId === myUserId;
  const canManage = myRole === ROLES.MANAGER || myRole === "SYSTEM_ADMIN" || myRole === "admin";
  const isPending = member.status === "pending";

  return (
    <div className={cn(
      "group flex items-center gap-3 p-3.5 rounded-[var(--radius-xl)] border bg-card border-border shadow-sm transition-all hover:border-muted-foreground/20"
    )}>
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10 border border-border shadow-sm">
          <AvatarImage src={member.avatarUrl ?? ""} alt={member.name} className="object-cover" />
          <AvatarFallback className="bg-primary/10 text-primary font-black text-xs">
            {(member.name || "?").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {isPending && (
          <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-orange-500 border-2 border-background flex items-center justify-center shadow-sm">
            <Clock className="h-2 w-2 text-white" />
          </span>
        )}
        {isMe && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow-sm">
            <ShieldCheck className="h-2 w-2 text-primary-foreground" />
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-black truncate text-foreground tracking-tight">
            {member.name}
          </p>
          {isMe && <span className="text-[9px] font-black text-primary bg-primary/10 border border-primary/20 px-1 py-0.5 rounded-[var(--radius-sm)] uppercase tracking-wider">あなた</span>}
        </div>

        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {member.authProviders && member.authProviders.length > 0 ? (
            member.authProviders.map(p => {
              const cfg = getProviderConfig(p);
              return (
                <span key={p} className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md border", cfg.bg, cfg.color, cfg.border)}>
                  {cfg.label}
                </span>
              );
            })
          ) : (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md border bg-muted/30 text-muted-foreground border-border">
              Standard Auth
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {isPending && !canManage ? (
          <RoleBadge role={ROLES.PENDING} />
        ) : (
          <div className="flex items-center gap-2">
            {isPending && <span className="text-[10px] font-black text-orange-500 animate-pulse">未承認:</span>}
            <RoleSelector 
              currentRole={member.role} 
              currentSubRoles={member.subRoles}
              memberId={member.memberId} 
              myRole={myRole} 
              onRoleChange={onRoleChange} 
              disabled={isMe} 
            />
          </div>
        )}

        {canManage && !isMe && (
          <button
            onClick={() => onRemove(member)}
            className="h-8 w-8 rounded-[var(--radius-lg)] border border-border flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all shadow-sm active:scale-95 shrink-0 cursor-pointer"
            title={isPending ? "参加申請を拒否" : "チームから除名"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
