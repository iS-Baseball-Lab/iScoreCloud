// filepath: src/app/liff/related-teams/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  LiffDataLoadErrorCard,
  useLiffAutoRetryOnResume,
} from "@/components/liff/LiffDataLoadErrorCard";
import type { RelatedTeamFormPayload } from "@/components/liff/RelatedTeamsModals";
import { useLiff, useLiffPermissions } from "@/components/liff/LiffProvider";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
  warmupLiffEndpointForHref,
} from "@/lib/liff/api-cache";
import {
  getRelationShortLabel,
  sanitizeRelatedTeamItems,
  sanitizeUnregisteredOpponents,
  type AiDiscoveredTeamCandidate,
  type RelatedTeamItem,
  type RelatedTeamLinkKind,
  type RelatedTeamRelationType,
  type UnregisteredOpponentItem,
} from "@/lib/liff/related-teams-schema";
import { sanitizeSafeExternalHref } from "@/lib/utils";
import {
  BookmarkCheck,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  FileText,
  Globe,
  Handshake,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Users2,
  X,
} from "lucide-react";

const CreateOrEditRelatedTeamModal = dynamic(
  () =>
    import("@/components/liff/RelatedTeamsModals").then(
      (mod) => mod.CreateOrEditRelatedTeamModal
    ),
  { ssr: false }
);

const BulkAiDiscoverModal = dynamic(
  () =>
    import("@/components/liff/RelatedTeamsModals").then(
      (mod) => mod.BulkAiDiscoverModal
    ),
  { ssr: false }
);

const PastOpponentsImportModal = dynamic(
  () =>
    import("@/components/liff/RelatedTeamsModals").then(
      (mod) => mod.PastOpponentsImportModal
    ),
  { ssr: false }
);

const GroupAiEnrichModal = dynamic(
  () =>
    import("@/components/liff/RelatedTeamsModals").then(
      (mod) => mod.GroupAiEnrichModal
    ),
  { ssr: false }
);

const GroupBulkDeleteModal = dynamic(
  () =>
    import("@/components/liff/RelatedTeamsModals").then(
      (mod) => mod.GroupBulkDeleteModal
    ),
  { ssr: false }
);

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function XBrandIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.326-.043-1.557-.14-2.857-.14C11.928 2 10 3.657 10 6.7v2.8H7v4h3V22h4v-8.5z" />
    </svg>
  );
}

interface RelatedTeamsApiResponse {
  success: boolean;
  teams?: RelatedTeamItem[];
  unregisteredOpponents?: UnregisteredOpponentItem[];
  context?: {
    orgName?: string;
    squadName?: string;
    categoryLabel?: string;
    areaHint?: string;
    leagueSuggestions?: string[];
  };
  error?: string;
}

interface QuickBrandLinkEntry {
  key: string;
  kind: RelatedTeamLinkKind;
  label: string;
  href: string;
  buttonClass: string;
  icon: React.ReactNode;
}

const UNGROUPED_LEAGUE_KEY = "__ungrouped__";
const UNGROUPED_LEAGUE_LABEL = "所属連盟・グループ未設定";

function readStoredTeamIdFallback(): string {
  if (typeof window === "undefined") return "demo-team";
  try {
    return localStorage.getItem("iscore_selectedTeamId") || "demo-team";
  } catch {
    return "demo-team";
  }
}

function getBrandLinkButtonStyle(kind: RelatedTeamLinkKind): {
  buttonClass: string;
  icon: React.ReactNode;
} {
  switch (kind) {
    case "instagram":
      return {
        buttonClass: "bg-[#E1306C] hover:bg-[#C1275C] text-white",
        icon: <InstagramIcon className="w-3.5 h-3.5 shrink-0" />,
      };
    case "youtube":
      return {
        buttonClass: "bg-[#FF0000] hover:bg-[#D90000] text-white",
        icon: <Play className="w-3.5 h-3.5 fill-current shrink-0" />,
      };
    case "line":
      return {
        buttonClass: "bg-[#06C755] hover:bg-[#05b34c] text-white",
        icon: <MessageCircle className="w-3.5 h-3.5 shrink-0" />,
      };
    case "x":
      return {
        buttonClass: "bg-[#0f172a] hover:bg-slate-800 text-white",
        icon: <XBrandIcon className="w-3.5 h-3.5 shrink-0" />,
      };
    case "facebook":
      return {
        buttonClass: "bg-[#1877F2] hover:bg-[#166FE5] text-white",
        icon: <FacebookIcon className="w-3.5 h-3.5 shrink-0" />,
      };
    case "map":
      return {
        buttonClass: "bg-[#1A73E8] hover:bg-[#1557B0] text-white",
        icon: <MapPin className="w-3.5 h-3.5 shrink-0" />,
      };
    case "blog":
      return {
        buttonClass: "bg-slate-700 hover:bg-slate-800 text-white",
        icon: <FileText className="w-3.5 h-3.5 shrink-0" />,
      };
    case "official":
      return {
        buttonClass: "bg-primary hover:bg-primary/90 text-primary-foreground",
        icon: <Globe className="w-3.5 h-3.5 shrink-0" />,
      };
    default:
      return {
        buttonClass:
          "bg-card hover:bg-muted text-foreground border border-border",
        icon: <ExternalLink className="w-3.5 h-3.5 shrink-0 text-primary" />,
      };
  }
}

function buildRelatedTeamQuickLinks(
  team: RelatedTeamItem
): QuickBrandLinkEntry[] {
  const quickLinks: QuickBrandLinkEntry[] = [];
  const seenHrefKeys = new Set<string>();

  const safeWebsiteHref = sanitizeSafeExternalHref(team.websiteUrl || "", "");
  if (safeWebsiteHref) {
    seenHrefKeys.add(safeWebsiteHref.replace(/\/+$/, "").toLowerCase());
    const officialStyle = getBrandLinkButtonStyle("official");
    quickLinks.push({
      key: "website",
      kind: "official",
      label: "公式サイト",
      href: safeWebsiteHref,
      buttonClass: officialStyle.buttonClass,
      icon: officialStyle.icon,
    });
  }

  const rawLinks = Array.isArray(team.links) ? team.links : [];
  for (let idx = 0; idx < rawLinks.length; idx += 1) {
    const lk = rawLinks[idx];
    if (!lk) continue;
    const href = sanitizeSafeExternalHref(lk.url || "", "");
    if (!href) continue;
    const norm = href.replace(/\/+$/, "").toLowerCase();
    if (seenHrefKeys.has(norm)) continue;
    seenHrefKeys.add(norm);
    const style = getBrandLinkButtonStyle(lk.kind);
    quickLinks.push({
      key: lk.id || `sub-${idx}`,
      kind: lk.kind,
      label: lk.label || "リンク",
      href,
      buttonClass: style.buttonClass,
      icon: style.icon,
    });
  }

  return quickLinks;
}

interface RelatedTeamRowItemProps {
  team: RelatedTeamItem;
  isExpanded: boolean;
  effectiveCanEdit: boolean;
  currentTeamId?: string;
  onToggleExpand: (id: string) => void;
  onToggleFavorite: (target: RelatedTeamItem) => void;
  onOpenEdit: (target: RelatedTeamItem, autoRunAi: boolean) => void;
}

function RelatedTeamRowItem({
  team,
  isExpanded,
  effectiveCanEdit,
  currentTeamId,
  onToggleExpand,
  onToggleFavorite,
  onOpenEdit,
}: RelatedTeamRowItemProps) {
  const quickLinks = useMemo(() => buildRelatedTeamQuickLinks(team), [team]);
  const hasAnyLink = quickLinks.length > 0;
  const stats = team.matchStats;
  const hasMatchRecord = Boolean(
    stats && (stats.totalFinished > 0 || stats.scheduledCount > 0)
  );

  return (
    <article
      className={team.isFavorite ? "border-l-[3px] border-l-amber-500" : ""}
    >
      {/* コンパクト一覧行（通常表示） */}
      <div
        className={`px-3.5 py-2.5 sm:px-4 flex items-center gap-2 transition-colors ${
          isExpanded ? "bg-muted/30" : "hover:bg-muted/30"
        }`}
      >
        {/* 左〜中央: タップでアコーディオン開閉 */}
        <button
          type="button"
          onClick={() => onToggleExpand(team.id)}
          aria-expanded={isExpanded}
          className="flex-1 min-w-0 text-left cursor-pointer"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {team.isFavorite && (
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
            )}
            <h3 className="text-[13px] sm:text-sm font-black text-foreground truncate leading-snug">
              {team.name}
            </h3>
            {team.shortName && team.shortName !== team.name && (
              <span className="hidden sm:inline text-[11px] font-bold text-muted-foreground shrink-0">
                ({team.shortName})
              </span>
            )}
          </div>

          {(team.area || hasMatchRecord) && (
            <div className="flex items-center gap-2.5 text-[11px] font-bold text-muted-foreground truncate mt-0.5">
              {team.area && (
                <span className="inline-flex items-center gap-0.5 truncate">
                  <MapPin className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="truncate">{team.area}</span>
                </span>
              )}
              {hasMatchRecord && stats && (
                <span className="inline-flex items-center gap-0.5 text-foreground/85 shrink-0">
                  <Trophy className="w-3 h-3 text-amber-500 shrink-0" />
                  <span>
                    {stats.totalFinished > 0
                      ? `${stats.wins}勝${stats.losses}敗${
                          stats.draws > 0 ? `${stats.draws}分` : ""
                        }`
                      : `予定${stats.scheduledCount}`}
                  </span>
                </span>
              )}
            </div>
          )}
        </button>

        {/* 右側: 1タップ外部リンク小アイコン（最大3件）＋ アコーディオン開閉シェブロン */}
        <div className="flex items-center gap-1 shrink-0">
          {quickLinks.slice(0, 3).map((ql) => (
            <a
              key={ql.key}
              href={ql.href}
              target="_blank"
              rel="noopener noreferrer"
              title={ql.label}
              aria-label={`${team.name}の${ql.label}を開く`}
              className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-2xs active:scale-95 transition-transform ${ql.buttonClass}`}
            >
              {ql.icon}
            </a>
          ))}

          {quickLinks.length > 3 && (
            <button
              type="button"
              onClick={() => onToggleExpand(team.id)}
              className="h-7 px-1.5 rounded-lg bg-muted text-muted-foreground border border-border text-[10px] font-black hover:text-foreground transition-colors cursor-pointer"
              title={`他${quickLinks.length - 3}件のリンクを表示`}
            >
              +{quickLinks.length - 3}
            </button>
          )}

          <button
            type="button"
            onClick={() => onToggleExpand(team.id)}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? `${team.name}の詳細を閉じる`
                : `${team.name}の詳細を開く`
            }
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                isExpanded ? "rotate-180 text-primary" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* アコーディオン詳細パネル（タップ展開時のみ表示） */}
      {isExpanded && (
        <div className="px-3.5 pb-3.5 pt-2.5 sm:px-4 bg-muted/20 border-t border-border/60 space-y-2.5">
          {/* 属性バッジ ＆ 地域・拠点フル表示 */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-black">
                {team.relationLabel}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-card text-muted-foreground border border-border text-[10px] font-bold">
                {team.scopeLabel}
              </span>
              {team.shortName && (
                <span className="px-2 py-0.5 rounded-md bg-card text-muted-foreground border border-border text-[10px] font-bold">
                  略称: {team.shortName}
                </span>
              )}
            </div>

            {(team.area || team.homeGround) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-muted-foreground">
                {team.area && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span>地域: {team.area}</span>
                  </span>
                )}
                {team.homeGround && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span>拠点: {team.homeGround}</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 試合記録との自動連携・通算対戦成績バー */}
          {hasMatchRecord && stats && (
            <div className="rounded-xl bg-card border border-border px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1 font-black text-foreground">
                  <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  {stats.totalFinished > 0 ? (
                    <span>
                      通算 {stats.totalFinished}戦 {stats.wins}勝{stats.losses}
                      敗{stats.draws > 0 ? `${stats.draws}分` : ""}
                    </span>
                  ) : (
                    <span>対戦予定あり</span>
                  )}
                </span>
                {stats.lastMatchDate && (
                  <span className="text-[11px] font-bold text-muted-foreground">
                    直近 {stats.lastMatchDate}
                    {stats.lastScoreSummary ? ` (${stats.lastScoreSummary})` : ""}
                  </span>
                )}
                {stats.scheduledCount > 0 && stats.totalFinished > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-primary/12 text-primary text-[10px] font-black">
                    予定+{stats.scheduledCount}
                  </span>
                )}
              </div>

              <Link
                href="/liff/matches"
                onPointerDown={() =>
                  warmupLiffEndpointForHref("/liff/matches", currentTeamId)
                }
                className="inline-flex items-center gap-0.5 text-[11px] font-black text-primary hover:underline shrink-0"
              >
                <span>試合記録</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {/* チーム紹介・メモ */}
          {team.description && (
            <p className="text-xs text-foreground/85 bg-card border border-border/80 rounded-xl px-3 py-2 leading-relaxed whitespace-pre-wrap">
              {team.description}
            </p>
          )}

          {/* 公式サイト ＆ SNSブランドリンクボタン群（ラベル付きフル表示） */}
          {hasAnyLink ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {quickLinks.map((ql) => (
                <a
                  key={ql.key}
                  href={ql.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black shadow-2xs active:scale-95 transition-all ${ql.buttonClass}`}
                >
                  {ql.icon}
                  <span className="truncate max-w-[160px]">{ql.label}</span>
                  <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
                </a>
              ))}
            </div>
          ) : effectiveCanEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenEdit(team, true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0f172a] text-amber-300 border border-slate-700 hover:bg-slate-800 active:scale-95 text-[11px] font-black transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>AIで公式HP・SNSを自動検索</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenEdit(team, false)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-dashed border-border bg-card hover:border-primary/40 hover:text-primary text-[11px] font-bold text-muted-foreground transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>手動でリンク追加</span>
              </button>
            </div>
          ) : (
            !team.description &&
            !team.area &&
            !team.homeGround &&
            !hasMatchRecord && (
              <p className="text-[11px] font-bold text-muted-foreground">
                公式HP・SNSリンクや詳細メモは未登録です
              </p>
            )
          )}

          {/* 管理者アクションバー（注目ピン留め・AI再検索・編集） */}
          {effectiveCanEdit && (
            <div className="pt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => onToggleFavorite(team)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                    team.isFavorite
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 font-black"
                      : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Star
                    className={`w-3.5 h-3.5 shrink-0 ${
                      team.isFavorite ? "text-amber-500 fill-amber-500" : ""
                    }`}
                  />
                  <span>
                    {team.isFavorite ? "注目ピン留め中" : "注目にピン留め"}
                  </span>
                </button>

                {hasAnyLink && (
                  <button
                    type="button"
                    onClick={() => onOpenEdit(team, true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0f172a] text-amber-300 border border-slate-700 hover:bg-slate-800 text-[11px] font-black transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 shrink-0" />
                    <span>AI再検索</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => onOpenEdit(team, false)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-card text-foreground hover:bg-muted text-[11px] font-black transition-colors cursor-pointer"
              >
                <Pencil className="w-3 h-3 shrink-0" />
                <span>編集</span>
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function LiffRelatedTeamsPage() {
  const { currentTeam } = useLiff();
  const { canManagePlayers, canManageTeam, isDemoMode } = useLiffPermissions();
  const effectiveCanEdit = canManagePlayers || canManageTeam || isDemoMode;

  const activeTeamId = currentTeam?.id || readStoredTeamIdFallback();

  const initialCached = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<RelatedTeamsApiResponse>(
      `/api/liff/related-teams?teamId=${encodeURIComponent(activeTeamId)}`
    );
  }, [activeTeamId]);

  const [teams, setTeams] = useState<RelatedTeamItem[]>(() =>
    sanitizeRelatedTeamItems(initialCached?.teams)
  );
  const [unregisteredOpponents, setUnregisteredOpponents] = useState<
    UnregisteredOpponentItem[]
  >(() => sanitizeUnregisteredOpponents(initialCached?.unregisteredOpponents));
  const [categoryLabel, setCategoryLabel] = useState<string>(() =>
    typeof initialCached?.context?.categoryLabel === "string"
      ? initialCached.context.categoryLabel
      : ""
  );

  const [isLoading, setIsLoading] = useState<boolean>(
    () => !Array.isArray(initialCached?.teams)
  );
  const [loadError, setLoadError] = useState<boolean>(false);

  const teamsCountRef = useRef<number>(teams.length);
  teamsCountRef.current = teams.length;

  // フィルター＆検索＆アコーディオン開閉ステート
  const [selectedScope, setSelectedScope] = useState<
    "all" | "organization" | "team" | "favorite"
  >("all");
  const [selectedLeague, setSelectedLeague] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(
    () => new Set()
  );
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
    () => new Set()
  );

  // モーダル制御ステート
  const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<RelatedTeamItem | null>(null);
  const [autoRunAiLookupOnEdit, setAutoRunAiLookupOnEdit] = useState(false);
  const [isAiDiscoverOpen, setIsAiDiscoverOpen] = useState(false);
  const [isImportOpponentsOpen, setIsImportOpponentsOpen] = useState(false);
  const [enrichingGroup, setEnrichingGroup] = useState<{
    key: string;
    title: string;
    items: RelatedTeamItem[];
  } | null>(null);
  const [bulkDeletingGroup, setBulkDeletingGroup] = useState<{
    key: string;
    title: string;
    items: RelatedTeamItem[];
  } | null>(null);

  const squadLabel = currentTeam?.teamName || "編成";

  useEffect(() => {
    setExpandedTeamIds(new Set());
    setCollapsedGroupKeys(new Set());
  }, [activeTeamId]);

  const toggleTeamExpanded = useCallback((id: string) => {
    setExpandedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleGroupCollapsed = useCallback((groupKey: string) => {
    setCollapsedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const handleOpenEditModal = useCallback(
    (target: RelatedTeamItem, autoRunAi: boolean) => {
      setEditingTeam(target);
      setAutoRunAiLookupOnEdit(autoRunAi);
      setIsCreateEditOpen(true);
    },
    []
  );

  const loadRelatedTeams = useCallback(async () => {
    const tid = activeTeamId || "demo-team";
    const cacheUrl = `/api/liff/related-teams?teamId=${encodeURIComponent(tid)}`;
    const cached = peekLiffApiCache<RelatedTeamsApiResponse>(cacheUrl);
    const hasCachedArray = Array.isArray(cached?.teams);

    if (hasCachedArray) {
      setTeams(sanitizeRelatedTeamItems(cached?.teams));
      setUnregisteredOpponents(
        sanitizeUnregisteredOpponents(cached?.unregisteredOpponents)
      );
      setCategoryLabel(
        typeof cached?.context?.categoryLabel === "string"
          ? cached.context.categoryLabel
          : ""
      );
      setIsLoading(false);
      setLoadError(false);
    } else if (teamsCountRef.current === 0) {
      setIsLoading(true);
    }

    try {
      const res = await fetch(cacheUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as RelatedTeamsApiResponse;
      if (!data.success) {
        throw new Error(data.error || "取得失敗");
      }
      setTeams(sanitizeRelatedTeamItems(data.teams));
      setUnregisteredOpponents(
        sanitizeUnregisteredOpponents(data.unregisteredOpponents)
      );
      setCategoryLabel(
        typeof data.context?.categoryLabel === "string"
          ? data.context.categoryLabel
          : ""
      );
      setLoadError(false);
    } catch (err) {
      console.error("[LiffRelatedTeamsPage] load error:", err);
      if (teamsCountRef.current === 0 && !hasCachedArray) {
        setLoadError(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeTeamId]);

  useEffect(() => {
    void loadRelatedTeams();
  }, [loadRelatedTeams]);

  useLiffAutoRetryOnResume(loadError, loadRelatedTeams);

  const refreshAfterMutation = useCallback(async () => {
    invalidateLiffApiCache("/api/liff/related-teams");
    await loadRelatedTeams();
  }, [loadRelatedTeams]);

  // 連盟・グループ候補リスト（登録済み関連チームの連盟・グループ名のみ）
  const mergedLeagueSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const t of teams) {
      const lg = (t.leagueName || "").trim();
      if (lg) set.add(lg);
    }
    return Array.from(set);
  }, [teams]);

  // フィルターチップ用の連盟別件数集計
  const leagueFilterTabs = useMemo(() => {
    const counts = new Map<string, number>();
    let ungroupedCount = 0;
    for (const t of teams) {
      if (selectedScope === "organization" && t.scope !== "organization") {
        continue;
      }
      if (selectedScope === "team" && t.scope !== "team") {
        continue;
      }
      if (selectedScope === "favorite" && !t.isFavorite) {
        continue;
      }
      const lg = (t.leagueName || "").trim();
      if (lg) {
        counts.set(lg, (counts.get(lg) || 0) + 1);
      } else {
        ungroupedCount += 1;
      }
    }

    const tabs: Array<{ key: string; label: string; count: number }> = [];
    for (const [lg, count] of Array.from(counts.entries())) {
      tabs.push({ key: lg, label: lg, count });
    }
    tabs.sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "ja")
    );
    if (ungroupedCount > 0) {
      tabs.push({
        key: UNGROUPED_LEAGUE_KEY,
        label: "未分類",
        count: ungroupedCount,
      });
    }
    return tabs;
  }, [teams, selectedScope]);

  // 検索・スコープ・連盟によるフィルタリング
  const filteredTeams = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teams.filter((t) => {
      if (selectedScope === "organization" && t.scope !== "organization") {
        return false;
      }
      if (selectedScope === "team" && t.scope !== "team") {
        return false;
      }
      if (selectedScope === "favorite" && !t.isFavorite) {
        return false;
      }

      if (selectedLeague !== "all") {
        const lg = (t.leagueName || "").trim();
        if (selectedLeague === UNGROUPED_LEAGUE_KEY) {
          if (lg !== "") return false;
        } else if (lg !== selectedLeague) {
          return false;
        }
      }

      if (!q) return true;

      const safeLinks = Array.isArray(t.links) ? t.links : [];
      const haystack = [
        t.name || "",
        t.shortName || "",
        t.leagueName || "",
        t.area || "",
        t.homeGround || "",
        t.description || "",
        ...safeLinks.map((l) => l?.label || ""),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [teams, selectedScope, selectedLeague, searchQuery]);

  // 連盟・団体ごとのグループ化（グループ内は注目ピン留め優先）
  const groupedSections = useMemo(() => {
    const map = new Map<string, RelatedTeamItem[]>();
    for (const t of filteredTeams) {
      const key = (t.leagueName || "").trim() || UNGROUPED_LEAGUE_KEY;
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push(t);
    }

    const entries = Array.from(map.entries()).map(([key, items]) => ({
      key,
      title: key === UNGROUPED_LEAGUE_KEY ? UNGROUPED_LEAGUE_LABEL : key,
      items: [...items].sort(
        (a, b) => Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite))
      ),
    }));

    entries.sort((a, b) => {
      if (a.key === UNGROUPED_LEAGUE_KEY) return 1;
      if (b.key === UNGROUPED_LEAGUE_KEY) return -1;
      return (
        b.items.length - a.items.length || a.title.localeCompare(b.title, "ja")
      );
    });

    return entries;
  }, [filteredTeams]);

  const hasActiveSearch = searchQuery.trim().length > 0;
  const forceGroupOpen = hasActiveSearch || selectedLeague !== "all";

  const anyVisibleExpanded = useMemo(
    () => filteredTeams.some((t) => expandedTeamIds.has(t.id)),
    [filteredTeams, expandedTeamIds]
  );

  const allVisibleGroupsCollapsed = useMemo(
    () =>
      !forceGroupOpen &&
      groupedSections.length > 0 &&
      groupedSections.every((sec) => collapsedGroupKeys.has(sec.key)),
    [forceGroupOpen, groupedSections, collapsedGroupKeys]
  );

  const handleToggleAllTeamDetails = useCallback(() => {
    if (anyVisibleExpanded) {
      setExpandedTeamIds(new Set());
    } else {
      setCollapsedGroupKeys(new Set());
      setExpandedTeamIds(new Set(filteredTeams.map((t) => t.id)));
    }
  }, [anyVisibleExpanded, filteredTeams]);

  const handleToggleAllGroups = useCallback(() => {
    if (allVisibleGroupsCollapsed) {
      setCollapsedGroupKeys(new Set());
    } else {
      setCollapsedGroupKeys(new Set(groupedSections.map((sec) => sec.key)));
    }
  }, [allVisibleGroupsCollapsed, groupedSections]);

  // 新規・編集保存ハンドラ
  const handleSaveTeam = async (payload: RelatedTeamFormPayload) => {
    const tid = activeTeamId || "demo-team";

    if (editingTeam) {
      const res = await fetch(
        `/api/liff/related-teams/${encodeURIComponent(editingTeam.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: tid,
            ...payload,
          }),
        }
      );
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "関連チームの更新に失敗しました");
      }

      if (tid === "demo-team" || editingTeam.id.startsWith("demo-")) {
        setTeams((prev) =>
          prev.map((item) =>
            item.id === editingTeam.id
              ? {
                  ...item,
                  ...payload,
                  relationLabel: getRelationShortLabel(payload.relationType),
                  scopeLabel:
                    payload.scope === "organization" ? "チーム全体" : squadLabel,
                }
              : item
          )
        );
      } else {
        await refreshAfterMutation();
      }
      toast.success(`「${payload.name}」を更新しました`);
    } else {
      const res = await fetch("/api/liff/related-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: tid,
          ...payload,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        id?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "関連チームの登録に失敗しました");
      }

      if (tid === "demo-team") {
        const demoItem: RelatedTeamItem = {
          id: data.id || `demo-rt-${Date.now()}`,
          name: payload.name,
          shortName: payload.shortName,
          leagueName: payload.leagueName,
          relationType: payload.relationType,
          relationLabel: getRelationShortLabel(payload.relationType),
          teamCategory: categoryLabel,
          area: payload.area,
          homeGround: payload.homeGround,
          websiteUrl: payload.websiteUrl,
          links: payload.links,
          description: payload.description,
          scope: payload.scope,
          scopeLabel:
            payload.scope === "organization" ? "チーム全体" : squadLabel,
          isFavorite: payload.isFavorite,
          priority: 0,
          matchStats: null,
        };
        setTeams((prev) => [demoItem, ...prev]);
      } else {
        await refreshAfterMutation();
      }
      toast.success(`「${payload.name}」を追加しました`);
    }
  };

  // 削除ハンドラ
  const handleDeleteTeam = async (target: RelatedTeamItem) => {
    const tid = activeTeamId || "demo-team";
    const res = await fetch(
      `/api/liff/related-teams/${encodeURIComponent(target.id)}?teamId=${encodeURIComponent(tid)}`,
      { method: "DELETE" }
    );
    const data = (await res.json()) as { success: boolean; error?: string };
    if (!res.ok || !data.success) {
      throw new Error(data.error || "削除に失敗しました");
    }

    if (tid === "demo-team" || target.id.startsWith("demo-")) {
      setTeams((prev) => prev.filter((item) => item.id !== target.id));
    } else {
      await refreshAfterMutation();
    }
    toast.success(`「${target.name}」を削除しました`);
  };

  // グループ単位（またはグループ内の選択チーム）一括削除ハンドラ
  const handleBulkDeleteTeams = async (selectedIds: string[]) => {
    const tid = activeTeamId || "demo-team";
    const res = await fetch("/api/liff/related-teams/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: tid,
        ids: selectedIds,
      }),
    });
    const data = (await res.json()) as {
      success: boolean;
      deletedCount?: number;
      error?: string;
    };
    if (!res.ok || !data.success) {
      throw new Error(data.error || "一括削除に失敗しました");
    }

    const idSet = new Set(selectedIds);
    if (
      bulkDeletingGroup &&
      selectedLeague === bulkDeletingGroup.key &&
      selectedIds.length >= bulkDeletingGroup.items.length
    ) {
      setSelectedLeague("all");
    }

    if (
      tid === "demo-team" ||
      selectedIds.every((id) => id.startsWith("demo-"))
    ) {
      setTeams((prev) => prev.filter((item) => !idSet.has(item.id)));
    } else {
      await refreshAfterMutation();
    }

    toast.success(
      `${data.deletedCount ?? selectedIds.length}チームを一括削除しました`
    );
  };

  // お気に入りピン留めの1タップ切替
  const handleToggleFavorite = useCallback(
    async (target: RelatedTeamItem) => {
      if (!effectiveCanEdit) return;
      const tid = activeTeamId || "demo-team";
      const nextFav = !target.isFavorite;

      // 楽観的UI反映
      setTeams((prev) =>
        prev.map((item) =>
          item.id === target.id ? { ...item, isFavorite: nextFav } : item
        )
      );

      if (tid === "demo-team" || target.id.startsWith("demo-")) {
        return;
      }

      try {
        const res = await fetch(
          `/api/liff/related-teams/${encodeURIComponent(target.id)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              teamId: tid,
              isFavorite: nextFav,
            }),
          }
        );
        if (!res.ok) {
          throw new Error("更新失敗");
        }
        invalidateLiffApiCache("/api/liff/related-teams");
      } catch {
        // ロールバック
        setTeams((prev) =>
          prev.map((item) =>
            item.id === target.id
              ? { ...item, isFavorite: target.isFavorite }
              : item
          )
        );
        toast.error("ピン留め状態の更新に失敗しました");
      }
    },
    [effectiveCanEdit, activeTeamId]
  );

  // AI一括収集からの一括登録＆既存チームリンク反映ハンドラ
  const handleBulkRegisterFromAi = async (params: {
    scope: "organization" | "team";
    defaultLeagueName: string;
    defaultRelationType: RelatedTeamRelationType;
    items: AiDiscoveredTeamCandidate[];
  }) => {
    const tid = activeTeamId || "demo-team";
    const res = await fetch("/api/liff/related-teams/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: tid,
        scope: params.scope,
        defaultLeagueName: params.defaultLeagueName,
        defaultRelationType: params.defaultRelationType,
        items: params.items.map((c) => ({
          name: c.name,
          shortName: c.shortName,
          leagueName: c.leagueName,
          relationType: c.relationType,
          area: c.area,
          homeGround: c.homeGround,
          websiteUrl: c.websiteUrl,
          links: c.links,
          description: c.description,
        })),
      }),
    });
    const data = (await res.json()) as {
      success: boolean;
      createdCount?: number;
      updatedCount?: number;
      skippedCount?: number;
      error?: string;
    };
    if (!res.ok || !data.success) {
      throw new Error(data.error || "一括登録に失敗しました");
    }

    await refreshAfterMutation();
    const created = data.createdCount ?? 0;
    const updated = data.updatedCount ?? 0;
    if (created > 0 && updated > 0) {
      toast.success(
        `${created}チームを新規登録、${updated}チームの公式HP・SNSを反映しました！`
      );
    } else if (updated > 0) {
      toast.success(`${updated}チームの公式HP・SNSリンクを反映しました！`);
    } else {
      toast.success(
        `${created > 0 ? created : params.items.length}チームを一括登録しました！`
      );
    }
  };

  // 過去の試合記録からの一括取込ハンドラ
  const handleImportPastOpponents = async (params: {
    scope: "organization" | "team";
    leagueName: string;
    relationType: RelatedTeamRelationType;
    selectedNames: string[];
  }) => {
    const tid = activeTeamId || "demo-team";
    const res = await fetch("/api/liff/related-teams/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: tid,
        scope: params.scope,
        defaultLeagueName: params.leagueName,
        defaultRelationType: params.relationType,
        items: params.selectedNames.map((opponentName) => ({
          name: opponentName,
          leagueName: params.leagueName,
          relationType: params.relationType,
        })),
      }),
    });
    const data = (await res.json()) as {
      success: boolean;
      createdCount?: number;
      error?: string;
    };
    if (!res.ok || !data.success) {
      throw new Error(data.error || "対戦相手の取り込みに失敗しました");
    }

    if (tid === "demo-team") {
      const selectedSet = new Set(params.selectedNames);
      const importedItems: RelatedTeamItem[] = params.selectedNames.map(
        (opponentName, idx) => {
          const oppStat = unregisteredOpponents.find(
            (u) => u.opponentName === opponentName
          );
          return {
            id: `demo-rt-imp-${Date.now()}-${idx}`,
            name: opponentName,
            shortName: "",
            leagueName: params.leagueName,
            relationType: params.relationType,
            relationLabel: getRelationShortLabel(params.relationType),
            teamCategory: categoryLabel,
            area: "",
            homeGround: "",
            websiteUrl: "",
            links: [],
            description: "",
            scope: params.scope,
            scopeLabel:
              params.scope === "organization" ? "チーム全体" : squadLabel,
            isFavorite: false,
            priority: 0,
            matchStats: oppStat
              ? {
                  totalFinished: oppStat.totalFinished,
                  wins: oppStat.wins,
                  losses: oppStat.losses,
                  draws: oppStat.draws,
                  scheduledCount: oppStat.scheduledCount,
                  lastMatchDate: oppStat.lastMatchDate,
                  lastScoreSummary: null,
                }
              : null,
          };
        }
      );
      setTeams((prev) => [...importedItems, ...prev]);
      setUnregisteredOpponents((prev) =>
        prev.filter((u) => !selectedSet.has(u.opponentName))
      );
    } else {
      await refreshAfterMutation();
    }

    toast.success(
      `${data.createdCount ?? params.selectedNames.length}チームを関連チームに取り込みました！`
    );
  };

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="関連チーム"
          subtitle="所属連盟・対戦チームの公式HP・SNS・通算戦績"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <Handshake className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【関連チーム一覧】${currentTeam?.name || "チーム"} 公式ポータル`,
            text: "所属連盟の加盟チームや対戦相手の公式サイト・SNS・通算対戦成績を確認できます",
          }}
        />

        {/* スコープ＆注目フィルタータブ */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-4 px-4 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedScope("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs shrink-0 transition-all cursor-pointer ${
              selectedScope === "all"
                ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
            }`}
          >
            すべて ({teams.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("favorite")}
            className={`px-3 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1 cursor-pointer ${
              selectedScope === "favorite"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-black shadow-2xs"
                : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
            }`}
          >
            <Star
              className={`w-3.5 h-3.5 ${
                selectedScope === "favorite"
                  ? "fill-amber-500 text-amber-500"
                  : ""
              }`}
            />
            <span>注目</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("organization")}
            className={`px-3.5 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedScope === "organization"
                ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>チーム全体</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("team")}
            className={`px-3.5 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedScope === "team"
                ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
            }`}
          >
            <Users2 className="w-3.5 h-3.5" />
            <span>{squadLabel}</span>
          </button>
        </div>

        {/* 検索バー ＆ AI収集・追加アクションボタン */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="チーム名・連盟・地域・拠点で検索..."
              className="w-full pl-9.5 pr-8 py-2.5 rounded-2xl bg-card border border-border text-xs placeholder:text-muted-foreground/70 focus:outline-hidden focus:ring-2 focus:ring-primary/40 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="検索条件をクリア"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {effectiveCanEdit && (
            <>
              <button
                type="button"
                onClick={() => setIsAiDiscoverOpen(true)}
                className="h-10 px-3 rounded-2xl bg-[#0f172a] text-amber-300 border border-slate-700 font-black text-xs shadow-xs hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                title="AIで所属連盟・大会からチームを一括収集"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI収集</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingTeam(null);
                  setAutoRunAiLookupOnEdit(false);
                  setIsCreateEditOpen(true);
                }}
                className="h-10 px-3.5 rounded-2xl bg-primary text-primary-foreground font-black text-xs shadow-xs hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                title="関連チームを手動追加"
              >
                <Plus className="w-4 h-4" />
                <span>追加</span>
              </button>
            </>
          )}
        </div>

        {/* 試合記録にある未登録の対戦相手サジェストバナー */}
        {effectiveCanEdit && unregisteredOpponents.length > 0 && (
          <div className="p-3 rounded-2xl border border-primary/30 bg-primary/5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground truncate">
                  未登録の対戦相手が {unregisteredOpponents.length} チームあります
                </p>
                <p className="text-[10px] font-bold text-muted-foreground truncate">
                  過去の試合スコア記録からワンタップで関連チームへ登録できます
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsImportOpponentsOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-black shrink-0 hover:bg-primary/90 active:scale-95 transition-all cursor-pointer"
            >
              一括取込
            </button>
          </div>
        )}

        {/* 所属連盟・グループ別フィルターチップ */}
        {leagueFilterTabs.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedLeague("all")}
              className={`px-3 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedLeague === "all"
                  ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                  : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
              }`}
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>全グループ</span>
            </button>
            {leagueFilterTabs.map((tab) => {
              const isSelected = selectedLeague === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSelectedLeague(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                      : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
                  }`}
                >
                  <span className="truncate max-w-[180px]">{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      isSelected
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* コンテンツ領域 */}
        {isLoading && teams.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">関連チームを読み込み中...</span>
          </div>
        ) : loadError && teams.length === 0 ? (
          <LiffDataLoadErrorCard
            onRetry={loadRelatedTeams}
            isRetrying={isLoading}
          />
        ) : filteredTeams.length === 0 ? (
          <div className="p-8 rounded-2xl border border-border bg-card text-center space-y-3">
            <span className="w-12 h-12 rounded-2xl bg-primary/12 text-primary flex items-center justify-center mx-auto">
              <Handshake className="w-6 h-6" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-black text-foreground">
                {teams.length === 0
                  ? "関連チームがまだ登録されていません"
                  : "条件に一致する関連チームが見つかりませんでした"}
              </p>
              <p className="text-xs text-muted-foreground">
                {teams.length === 0
                  ? "所属連盟名からAIで加盟チームを一括収集するか、対戦相手を追加して公式HP・SNSをまとめましょう。"
                  : "検索ワードや連盟フィルターを変更して再度ご確認ください。"}
              </p>
            </div>

            {effectiveCanEdit && teams.length === 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAiDiscoverOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-[#0f172a] text-amber-300 border border-slate-700 text-xs font-black flex items-center gap-1.5 hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>AIで連盟チームを一括収集</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTeam(null);
                    setAutoRunAiLookupOnEdit(false);
                    setIsCreateEditOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center gap-1.5 hover:bg-primary/90 active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>手動でチームを追加</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* 件数サマリー ＆ 一括開閉ユーティリティバー */}
            <div className="flex items-center justify-between gap-2 px-0.5">
              <p className="text-[11px] font-bold text-muted-foreground truncate">
                {groupedSections.length}グループ・計{filteredTeams.length}チーム
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                {!forceGroupOpen && groupedSections.length > 1 && (
                  <button
                    type="button"
                    onClick={handleToggleAllGroups}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card border border-border hover:bg-muted text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    {allVisibleGroupsCollapsed ? (
                      <>
                        <ChevronsUpDown className="w-3.5 h-3.5 shrink-0" />
                        <span>グループ展開</span>
                      </>
                    ) : (
                      <>
                        <ChevronsDownUp className="w-3.5 h-3.5 shrink-0" />
                        <span>グループ折畳</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleToggleAllTeamDetails}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card border border-border hover:bg-muted text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {anyVisibleExpanded ? (
                    <>
                      <ChevronsDownUp className="w-3.5 h-3.5 shrink-0" />
                      <span>詳細を閉じる</span>
                    </>
                  ) : (
                    <>
                      <ChevronsUpDown className="w-3.5 h-3.5 shrink-0" />
                      <span>詳細を開く</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {groupedSections.map((section) => {
              const isGroupCollapsed =
                !forceGroupOpen && collapsedGroupKeys.has(section.key);

              return (
                <section
                  key={section.key}
                  className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
                >
                  {/* A-3 Dark Solid Header Cap per League / Organization */}
                  <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapsed(section.key)}
                      aria-expanded={!isGroupCollapsed}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer py-0.5"
                    >
                      <ChevronDown
                        className={`w-4 h-4 text-sky-300 shrink-0 transition-transform duration-200 ${
                          isGroupCollapsed ? "-rotate-90" : ""
                        }`}
                      />
                      <h2 className="text-xs sm:text-sm font-black text-white truncate">
                        {section.title}
                      </h2>
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black shrink-0">
                        {section.items.length}
                      </span>
                    </button>

                    {effectiveCanEdit && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setEnrichingGroup({
                              key: section.key,
                              title: section.title,
                              items: section.items,
                            })
                          }
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/40 text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                          title={`「${section.title}」の公式HP・SNSをAIで一括補完`}
                        >
                          <Sparkles className="w-3 h-3 shrink-0" />
                          <span>AI補完</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBulkDeletingGroup({
                              key: section.key,
                              title: section.title,
                              items: section.items,
                            })
                          }
                          className="p-1.5 sm:px-2 sm:py-1 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-300 border border-rose-500/40 text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                          title={`「${section.title}」のチームを一括削除`}
                          aria-label={`「${section.title}」のチームを一括削除`}
                        >
                          <Trash2 className="w-3 h-3 shrink-0" />
                          <span className="hidden sm:inline">一括削除</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {!isGroupCollapsed && (
                    <div className="divide-y divide-border">
                      {section.items.map((team) => {
                        const isExpanded =
                          expandedTeamIds.has(team.id) ||
                          (hasActiveSearch && filteredTeams.length === 1);

                        return (
                          <RelatedTeamRowItem
                            key={team.id}
                            team={team}
                            isExpanded={isExpanded}
                            effectiveCanEdit={effectiveCanEdit}
                            currentTeamId={currentTeam?.id}
                            onToggleExpand={toggleTeamExpanded}
                            onToggleFavorite={(target) => {
                              void handleToggleFavorite(target);
                            }}
                            onOpenEdit={handleOpenEditModal}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

      {/* 個別チーム追加・編集モーダル（オープン時のみ遅延マウント） */}
      {isCreateEditOpen && (
        <CreateOrEditRelatedTeamModal
          isOpen={isCreateEditOpen}
          editingTeam={editingTeam}
          autoRunAiLookup={autoRunAiLookupOnEdit}
          teamId={activeTeamId}
          squadName={squadLabel}
          isDemoMode={isDemoMode}
          defaultCategoryHint={categoryLabel}
          leagueSuggestions={mergedLeagueSuggestions}
          onClose={() => {
            setIsCreateEditOpen(false);
            setEditingTeam(null);
            setAutoRunAiLookupOnEdit(false);
          }}
          onSave={handleSaveTeam}
          onDelete={handleDeleteTeam}
        />
      )}

      {/* AI一括チーム収集モーダル（オープン時のみ遅延マウント） */}
      {isAiDiscoverOpen && (
        <BulkAiDiscoverModal
          isOpen={isAiDiscoverOpen}
          teamId={activeTeamId}
          squadName={squadLabel}
          isDemoMode={isDemoMode}
          defaultCategoryHint={categoryLabel}
          onClose={() => setIsAiDiscoverOpen(false)}
          onBulkRegister={handleBulkRegisterFromAi}
        />
      )}

      {/* 過去の試合相手一括取込モーダル（オープン時のみ遅延マウント） */}
      {isImportOpponentsOpen && (
        <PastOpponentsImportModal
          isOpen={isImportOpponentsOpen}
          opponents={unregisteredOpponents}
          squadName={squadLabel}
          leagueSuggestions={mergedLeagueSuggestions}
          onClose={() => setIsImportOpponentsOpen(false)}
          onImport={handleImportPastOpponents}
        />
      )}

      {/* グループ単位での公式HP・SNS AI一括補完モーダル（オープン時のみ遅延マウント） */}
      {enrichingGroup && (
        <GroupAiEnrichModal
          isOpen={true}
          groupTitle={enrichingGroup.title}
          teamsInGroup={enrichingGroup.items}
          teamId={activeTeamId}
          isDemoMode={isDemoMode}
          defaultCategoryHint={categoryLabel}
          onClose={() => setEnrichingGroup(null)}
          onCompleted={async ({ updatedCount }) => {
            await refreshAfterMutation();
            toast.success(
              `${updatedCount}チームの公式HP・SNSリンクを自動保存しました！`
            );
          }}
        />
      )}

      {/* グループ単位一括削除モーダル（オープン時のみ遅延マウント） */}
      {bulkDeletingGroup && (
        <GroupBulkDeleteModal
          isOpen={true}
          groupTitle={bulkDeletingGroup.title}
          teamsInGroup={bulkDeletingGroup.items}
          onClose={() => setBulkDeletingGroup(null)}
          onConfirmDelete={handleBulkDeleteTeams}
        />
      )}
    </div>
  );
}
