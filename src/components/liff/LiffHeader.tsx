// filepath: src/components/liff/LiffHeader.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ChevronDown,
  ChevronRight,
  Share2,
  Sun,
  Moon,
  Monitor,
  Check,
  User,
  Users,
  UserCircle,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { canManageCurrentTeam, useLiff } from "./LiffProvider";
import { warmupLiffEndpointForHref } from "@/lib/liff/api-cache";
import { shareLiffPageViaLine } from "@/lib/liff/liff-client";
import {
  handleLiffRootLinkClick,
  navigateToLiffRoot,
} from "@/lib/liff/navigation";
import { LIFF_WEBVIEW_RESUMED_EVENT } from "@/lib/liff/runtime-recovery";
import {
  LIFF_THEME_CHANGE_EVENT,
  syncLiffThemeClasses,
} from "@/lib/liff/theme-settings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { JoinTeamModal } from "./JoinTeamModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const APPEARANCES = [
  { id: "light", icon: Sun, label: "ライト" },
  { id: "dark", icon: Moon, label: "ダーク" },
  { id: "system", icon: Monitor, label: "端末連動" },
] as const;

type BrandLogoStage = "webp" | "png" | "fallback";

/**
 * 🛡️ 3段階フォールバック付きブランドロゴアイコン
 * - `.webp` -> `.png` -> インラインソリッドバッジの順にフォールバックし、通信瞬断や WebView GPU テクスチャ破棄でも絶対に空白化させない。
 * - `sticky` ヘッダー内での GPU レイヤー消失を防ぐため `img` 単体への `transform` トランジションを排除。
 */
function LiffBrandLogoMark({ compact = false }: { compact?: boolean }) {
  const [stage, setStage] = useState<BrandLogoStage>("webp");

  useEffect(() => {
    if (stage === "webp") return;
    const handleResume = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      setStage("webp");
    };
    window.addEventListener(LIFF_WEBVIEW_RESUMED_EVENT, handleResume);
    return () => {
      window.removeEventListener(LIFF_WEBVIEW_RESUMED_EVENT, handleResume);
    };
  }, [stage]);

  if (stage === "fallback") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "rounded-[22%] bg-[#0f172a] border-2 border-primary text-slate-50 shadow-xs flex items-center justify-center shrink-0 select-none",
          compact ? "h-7 w-7" : "h-9 w-9 sm:h-9.5 sm:w-9.5"
        )}
      >
        <span
          className={cn(
            "font-black italic tracking-tighter leading-none",
            compact ? "text-[10.5px]" : "text-[12px]"
          )}
        >
          i<span className="text-primary">S</span>
        </span>
      </span>
    );
  }

  return (
    <img
      src={stage === "webp" ? "/liff-logo.webp" : "/liff-logo.png"}
      alt="iScoreCloud LINEミニアプリ"
      width={compact ? 28 : 36}
      height={compact ? 28 : 36}
      decoding="sync"
      fetchPriority="high"
      onError={() => {
        setStage((prev) => (prev === "webp" ? "png" : "fallback"));
      }}
      className={cn(
        "rounded-[22%] shadow-xs object-contain shrink-0",
        compact ? "h-7 w-7" : "h-9 w-9 sm:h-9.5 sm:w-9.5"
      )}
    />
  );
}

interface LiffHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  compact?: boolean;
  shareData?: {
    title: string;
    text: string;
    url?: string;
  };
}

export function LiffHeader({ shareData, compact = false }: LiffHeaderProps) {
  const {
    liff,
    profile,
    isLoggedIn,
    login,
    teams,
    currentTeam,
    selectTeam,
    isDemo,
    refreshTeams,
    clearPendingJoinCode,
  } = useLiff();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  // 保存されているアクセントカラー & デザインスタイルを全LIFF画面で自動復元
  useEffect(() => {
    syncLiffThemeClasses();
    const handleSync = () => {
      syncLiffThemeClasses();
    };
    window.addEventListener(LIFF_THEME_CHANGE_EVENT, handleSync);
    return () => window.removeEventListener(LIFF_THEME_CHANGE_EVENT, handleSync);
  }, []);

  const handleShare = async () => {
    if (!shareData) return;
    const outcome = await shareLiffPageViaLine({
      title: shareData.title,
      text: shareData.text,
      url: shareData.url,
      pathname,
      teamId: currentTeam?.id || null,
      teamName: currentTeam?.orgName || currentTeam?.name || null,
      liff,
    });
    if (outcome === "shared") {
      toast.success("LINEでページを共有しました！");
    }
  };

  const orgDisplayName = currentTeam?.orgName || currentTeam?.name || "チーム";
  const teamDisplayName = isDemo
    ? "🌟 体験デモチーム"
    : currentTeam?.teamName || currentTeam?.shortName || "チームHUB";

  const displayName = profile?.displayName || "メンバー";
  const userInitial = displayName.slice(0, 1).toUpperCase();
  const visibleTeams = teams.filter((t) =>
    Boolean(t.id === "demo-team" || t.isDemo || t.isMember)
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full bg-card border-b border-border shadow-xs transition-colors duration-200",
        compact && "shrink-0"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between",
          compact
            ? "h-10.5 px-2.5 sm:px-3 gap-2"
            : "h-14 sm:h-16 px-3 sm:px-4 gap-2 sm:gap-3"
        )}
      >
        {/* 🌟 1. 左側: ロゴ & ブランド (iScoreCloud LINEミニアプリ) */}
        <Link
          href="/liff"
          onPointerDown={() => warmupLiffEndpointForHref("/liff", currentTeam?.id)}
          onClick={(e) => handleLiffRootLinkClick(e, router, pathname)}
          className={cn(
            "flex items-center shrink-0 group outline-hidden",
            compact ? "gap-1.5" : "gap-2"
          )}
          title="チームHUBトップへ"
        >
          <LiffBrandLogoMark compact={compact} />
          <div className="flex flex-col justify-center">
            <h1
              className={cn(
                "font-black italic tracking-tighter text-foreground leading-none group-hover:text-primary transition-colors",
                compact ? "text-[13.5px]" : "text-[15px] sm:text-lg"
              )}
            >
              iScore<span className="text-primary">Cloud</span>
            </h1>
            {!compact && (
              <span className="text-[9px] sm:text-[9.5px] font-bold text-muted-foreground tracking-tight leading-none mt-0.5 select-none">
                LINEミニアプリ
              </span>
            )}
          </div>
        </Link>

        {/* 🌟 2. 右側: TeamSwitcher & UserProfileMenu */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 justify-end flex-1">
          {/* チーム切り替えバッジ (TeamSwitcher) — modal={false} で Radix の body pointer-events ロック残留を防止 */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center rounded-full border text-left text-foreground shadow-xs hover:opacity-90 transition-colors cursor-pointer flex-1 min-w-0 max-w-[190px] min-[400px]:max-w-[225px] sm:max-w-[285px] outline-hidden select-none",
                  compact ? "gap-1.5 pl-1 pr-2 py-0.5" : "gap-2 pl-1 pr-2.5 py-1",
                  isDemo
                    ? "bg-amber-50 dark:bg-slate-900 border-amber-500"
                    : "bg-muted border-border"
                )}
                title={`${orgDisplayName} (${teamDisplayName})`}
              >
                <Avatar
                  className={cn(
                    "border border-border bg-card shrink-0",
                    compact ? "h-6.5 w-6.5" : "h-8 w-8 sm:h-8.5 sm:w-8.5"
                  )}
                >
                  {currentTeam?.logoImageUrl && (
                    <AvatarImage
                      src={currentTeam.logoImageUrl}
                      alt={orgDisplayName}
                      className="object-contain"
                    />
                  )}
                  <AvatarFallback
                    className={cn(
                      "w-full h-full flex items-center justify-center font-black select-none bg-card text-primary",
                      compact ? "text-[10px]" : "text-xs"
                    )}
                  >
                    {orgDisplayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col justify-center overflow-hidden min-w-0 flex-1">
                  <span
                    className={cn(
                      "font-black tracking-tight text-foreground truncate leading-tight",
                      compact ? "text-[11px]" : "text-[11.5px] sm:text-xs"
                    )}
                  >
                    {orgDisplayName}
                  </span>
                  {!compact && (
                    <span
                      className={`text-[9.5px] font-black uppercase truncate leading-none mt-0.5 ${
                        isDemo
                          ? "text-amber-600 dark:text-amber-400 font-black"
                          : "text-muted-foreground font-bold"
                      }`}
                    >
                      {teamDisplayName}
                    </span>
                  )}
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0 ml-0.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="z-[10050] w-64 rounded-2xl border border-border bg-card p-1.5 shadow-xl space-y-1"
            >
              <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                チーム切り替え
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {visibleTeams.map((t) => {
                const itemOrgLabel = t.orgName || t.name || "チーム";
                return (
                  <DropdownMenuItem
                    key={t.id}
                    onSelect={() => {
                      const isTeamChanged = currentTeam?.id !== t.id;
                      selectTeam(t.id);
                      if (isTeamChanged) {
                        requestAnimationFrame(() => {
                          navigateToLiffRoot(router, pathname);
                        });
                      }
                    }}
                    className={`flex items-center justify-between p-2 cursor-pointer rounded-xl font-black text-xs ${
                      currentTeam?.id === t.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-7 w-7 border border-border bg-card shrink-0">
                        {t.logoImageUrl && (
                          <AvatarImage
                            src={t.logoImageUrl}
                            alt={itemOrgLabel}
                            className="object-contain"
                          />
                        )}
                        <AvatarFallback className="text-[10px] font-black bg-card text-primary">
                          {itemOrgLabel.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{itemOrgLabel}</span>
                        <span className="text-[9px] text-muted-foreground font-medium">
                          {t.teamName}
                        </span>
                      </div>
                    </div>
                    {currentTeam?.id === t.id && (
                      <Check className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </DropdownMenuItem>
                );
              })}

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setIsJoinModalOpen(true)}
                className="flex items-center gap-2 p-2 cursor-pointer font-black text-xs text-primary hover:bg-primary/10 rounded-xl"
              >
                <Users className="w-4 h-4" />
                <span>招待コードでチームに参加</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 🌟 ユーザープロフィールメニュー（スリム化版） */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative flex items-center justify-center rounded-full ring-2 ring-primary/40 hover:ring-primary transition-colors p-0 outline-hidden shrink-0 active:scale-95 shadow-xs"
                aria-label="ユーザーメニュー"
              >
                <Avatar
                  className={cn(
                    "border border-border bg-card",
                    compact ? "h-7.5 w-7.5" : "h-9 w-9 sm:h-9.5 sm:w-9.5"
                  )}
                >
                  {profile?.pictureUrl && (
                    <AvatarImage src={profile.pictureUrl} alt={displayName} />
                  )}
                  <AvatarFallback
                    className={cn(
                      "bg-primary/20 text-primary font-black",
                      compact ? "text-xs" : "text-sm"
                    )}
                  >
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="z-[10050] w-68 sm:w-72 rounded-2xl border border-border bg-card p-2.5 shadow-2xl space-y-2"
            >
              {/* ユーザー情報ヘッダー */}
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted border border-border">
                <Avatar className="h-10 w-10 border border-border bg-card">
                  {profile?.pictureUrl && (
                    <AvatarImage src={profile.pictureUrl} alt={displayName} />
                  )}
                  <AvatarFallback className="bg-primary text-primary-foreground font-black text-sm">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs sm:text-sm font-black text-foreground truncate">
                    {displayName}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isLoggedIn ? "bg-[#06C755]" : "bg-amber-500"
                      }`}
                    />
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {isLoggedIn ? "LINEミニアプリ連携中" : "LINE未連携"}
                    </span>
                  </div>
                </div>
              </div>

              {!isLoggedIn && (
                <DropdownMenuItem
                  onClick={login}
                  className="flex items-center gap-2 p-2.5 cursor-pointer font-black text-xs text-white bg-[#06C755] hover:bg-[#05b34c] focus:bg-[#05b34c] focus:text-white rounded-xl"
                >
                  <User className="w-4 h-4" />
                  <span>LINEでログインして名前を表示</span>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator className="bg-border" />

              {/* 👤 マイプロフィール & ⚙️ 画面・メニュー設定（＋管理者のみチーム管理） */}
              <div className="space-y-1">
                <DropdownMenuItem asChild>
                  <Link
                    href="/liff/profile"
                    onPointerDown={() =>
                      warmupLiffEndpointForHref("/liff/profile", currentTeam?.id)
                    }
                    className="flex items-center justify-between p-2 cursor-pointer rounded-xl hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                        <UserCircle className="w-4.5 h-4.5" />
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black text-foreground">
                          マイプロフィール
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground truncate">
                          表示名・お子様紐付け・マイカー登録
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    href="/liff/settings"
                    className="flex items-center justify-between p-2 cursor-pointer rounded-xl hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                        <Settings className="w-4 h-4" />
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black text-foreground">
                          画面・メニュー設定
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground truncate">
                          ホーム・下部ナビ・外観カスタム
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                </DropdownMenuItem>

                {canManageCurrentTeam(currentTeam, isDemo) && (
                  <DropdownMenuItem asChild>
                    <Link
                      href="/liff/admin"
                      onPointerDown={() =>
                        warmupLiffEndpointForHref("/liff/admin", currentTeam?.id)
                      }
                      className="flex items-center justify-between p-2 cursor-pointer rounded-xl hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                          <ShieldCheck className="w-4 h-4" />
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black text-foreground">
                            チーム管理
                          </span>
                          <span className="text-[10px] font-bold text-muted-foreground truncate">
                            参加承認・編成・権限・車両マスタ
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </Link>
                  </DropdownMenuItem>
                )}
              </div>

              <DropdownMenuSeparator className="bg-border" />

              {/* 🌓 外観モード (クイック切替) */}
              <div className="pt-0.5">
                <p className="text-[10px] font-black text-muted-foreground mb-1.5 pl-1">
                  外観モード
                </p>
                <div className="flex gap-1 p-1 rounded-2xl bg-muted border border-border">
                  {APPEARANCES.map((a) => {
                    const Icon = a.icon;
                    const isActive = theme === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setTheme(a.id);
                        }}
                        className={cn(
                          "flex-1 flex flex-col items-center justify-center py-1.5 gap-1 rounded-xl border transition-all active:scale-95",
                          isActive
                            ? "bg-card border-border text-foreground font-black shadow-xs"
                            : "border-transparent text-muted-foreground hover:text-foreground font-bold"
                        )}
                      >
                        <Icon
                          className={cn("h-4 w-4", isActive && "text-primary")}
                        />
                        <span className="text-[10px] leading-tight">
                          {a.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LINEシェア */}
              {shareData && (
                <>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem
                    onClick={handleShare}
                    className="flex items-center gap-2 p-2 cursor-pointer font-bold text-xs rounded-xl"
                  >
                    <Share2 className="w-4 h-4 text-[#06C755]" />
                    <span>LINEでチームに共有</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 🌟 iScore シグネチャーのソリッドテーマライン */}
      <div className="h-[2px] w-full bg-primary" />

      {/* チーム参加申請モーダル */}
      <JoinTeamModal
        isOpen={isJoinModalOpen}
        onClose={() => {
          clearPendingJoinCode();
          setIsJoinModalOpen(false);
        }}
        onSuccess={({ status }) => {
          clearPendingJoinCode();
          void refreshTeams();
          if (status === "active") {
            setIsJoinModalOpen(false);
            navigateToLiffRoot(router, pathname);
          }
        }}
      />
    </header>
  );
}
