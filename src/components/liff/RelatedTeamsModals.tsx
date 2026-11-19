// filepath: src/components/liff/RelatedTeamsModals.tsx
"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  LiffSelect,
  type LiffSelectOption,
} from "@/components/liff/LiffSelect";
import { normalizeHttpUrlInput } from "@/lib/liff/team-links-schema";
import {
  MAX_LINKS_PER_RELATED_TEAM,
  MAX_RELATED_TEAM_AREA_LENGTH,
  MAX_RELATED_TEAM_DESC_LENGTH,
  MAX_RELATED_TEAM_GROUND_LENGTH,
  MAX_RELATED_TEAM_LEAGUE_LENGTH,
  MAX_RELATED_TEAM_LINK_LABEL_LENGTH,
  MAX_RELATED_TEAM_NAME_LENGTH,
  MAX_RELATED_TEAM_SHORT_NAME_LENGTH,
  RELATED_TEAM_LINK_KIND_OPTIONS,
  RELATED_TEAM_RELATION_OPTIONS,
  createEmptyRelatedTeamLinkDraft,
  getRelatedTeamLinkKindDefaultLabel,
  inferRelatedTeamLinkKind,
  toRelatedTeamLinkDrafts,
  validateAndNormalizeRelatedTeamLinks,
  type AiDiscoveredTeamCandidate,
  type RelatedTeamAiLookupResult,
  type RelatedTeamAiSourceLink,
  type RelatedTeamItem,
  type RelatedTeamLinkDraft,
  type RelatedTeamLinkItem,
  type RelatedTeamLinkKind,
  type RelatedTeamRelationType,
  type UnregisteredOpponentItem,
} from "@/lib/liff/related-teams-schema";
import { sanitizeSafeExternalHref, validateSafeHttpUrl } from "@/lib/utils";
import {
  AlertCircle,
  Building2,
  Check,
  ExternalLink,
  Globe,
  Handshake,
  Loader2,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Users2,
  X,
} from "lucide-react";

const RELATION_SELECT_OPTIONS: ReadonlyArray<LiffSelectOption> =
  RELATED_TEAM_RELATION_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));

const LINK_KIND_SELECT_OPTIONS: ReadonlyArray<LiffSelectOption> =
  RELATED_TEAM_LINK_KIND_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));

const QUICK_ADD_LINK_KINDS: ReadonlyArray<{
  kind: RelatedTeamLinkKind;
  chipLabel: string;
}> = [
  { kind: "instagram", chipLabel: "＋ Instagram" },
  { kind: "youtube", chipLabel: "＋ YouTube" },
  { kind: "x", chipLabel: "＋ X" },
  { kind: "blog", chipLabel: "＋ 紹介・ブログ" },
  { kind: "line", chipLabel: "＋ LINE公式" },
  { kind: "map", chipLabel: "＋ 拠点マップ" },
];

export interface RelatedTeamFormPayload {
  name: string;
  shortName: string;
  leagueName: string;
  relationType: RelatedTeamRelationType;
  area: string;
  homeGround: string;
  websiteUrl: string;
  links: RelatedTeamLinkItem[];
  description: string;
  scope: "organization" | "team";
  isFavorite: boolean;
}

interface CreateOrEditRelatedTeamModalProps {
  isOpen: boolean;
  editingTeam: RelatedTeamItem | null;
  teamId: string;
  squadName: string;
  isDemoMode: boolean;
  defaultCategoryHint: string;
  leagueSuggestions: ReadonlyArray<string>;
  onClose: () => void;
  onSave: (payload: RelatedTeamFormPayload) => Promise<void>;
  onDelete?: (target: RelatedTeamItem) => Promise<void>;
}

export function CreateOrEditRelatedTeamModal({
  isOpen,
  editingTeam,
  teamId,
  squadName,
  isDemoMode,
  defaultCategoryHint,
  leagueSuggestions,
  onClose,
  onSave,
  onDelete,
}: CreateOrEditRelatedTeamModalProps) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [relationType, setRelationType] =
    useState<RelatedTeamRelationType>("league_member");
  const [area, setArea] = useState("");
  const [homeGround, setHomeGround] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [linkDrafts, setLinkDrafts] = useState<RelatedTeamLinkDraft[]>([]);
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"organization" | "team">("organization");
  const [isFavorite, setIsFavorite] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 個別AI自動検索ステート
  const [isAiLookingUp, setIsAiLookingUp] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<{
    grounded: boolean;
    candidate: RelatedTeamAiLookupResult;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setSubmitError(null);
    setAiError(null);
    setAiPreview(null);

    if (editingTeam) {
      setName(editingTeam.name);
      setShortName(editingTeam.shortName || "");
      setLeagueName(editingTeam.leagueName || "");
      setRelationType(editingTeam.relationType || "league_member");
      setArea(editingTeam.area || "");
      setHomeGround(editingTeam.homeGround || "");
      setWebsiteUrl(editingTeam.websiteUrl || "");
      setLinkDrafts(toRelatedTeamLinkDrafts(editingTeam.links));
      setDescription(editingTeam.description || "");
      setScope(editingTeam.scope || "organization");
      setIsFavorite(Boolean(editingTeam.isFavorite));
    } else {
      setName("");
      setShortName("");
      setLeagueName("");
      setRelationType("league_member");
      setArea("");
      setHomeGround("");
      setWebsiteUrl("");
      setLinkDrafts([]);
      setDescription("");
      setScope("organization");
      setIsFavorite(false);
    }
  }, [isOpen, editingTeam]);

  if (!mounted || !isOpen) return null;

  const handleQuickAddLink = (kind: RelatedTeamLinkKind) => {
    if (linkDrafts.length >= MAX_LINKS_PER_RELATED_TEAM) return;
    setLinkDrafts((prev) => [...prev, createEmptyRelatedTeamLinkDraft(kind)]);
  };

  const handleUpdateLinkDraft = (
    id: string,
    patch: Partial<RelatedTeamLinkDraft>
  ) => {
    setLinkDrafts((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, ...patch };
        if (patch.kind && patch.kind !== row.kind) {
          const prevDefault = getRelatedTeamLinkKindDefaultLabel(row.kind);
          if (!row.label || row.label === prevDefault) {
            updated.label = getRelatedTeamLinkKindDefaultLabel(patch.kind);
          }
        }
        if (patch.url !== undefined && patch.url.trim()) {
          const inferred = inferRelatedTeamLinkKind(patch.url, updated.label);
          if (inferred !== "other" && updated.kind === "other") {
            updated.kind = inferred;
            if (
              !updated.label ||
              updated.label === getRelatedTeamLinkKindDefaultLabel("other")
            ) {
              updated.label = getRelatedTeamLinkKindDefaultLabel(inferred);
            }
          }
        }
        return updated;
      })
    );
  };

  const handleRemoveLinkDraft = (id: string) => {
    setLinkDrafts((prev) => prev.filter((row) => row.id !== id));
  };

  const handleRunSingleAiLookup = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setAiError("先にチーム名を入力してからAI自動検索を押してください");
      return;
    }
    if (isDemoMode || teamId === "demo-team") {
      setAiError(
        "デモモードではAI自動検索を実行できません。チームを作成・参加してご利用ください"
      );
      return;
    }

    setIsAiLookingUp(true);
    setAiError(null);
    setAiPreview(null);

    try {
      const res = await fetch("/api/liff/related-teams/ai-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          name: trimmedName,
          leagueHint: leagueName.trim() || undefined,
          areaHint: area.trim() || undefined,
          categoryHint: defaultCategoryHint || undefined,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        grounded?: boolean;
        candidate?: RelatedTeamAiLookupResult;
        error?: string;
      };
      if (!res.ok || !data.success || !data.candidate) {
        throw new Error(data.error || "AI検索に失敗しました");
      }
      setAiPreview({
        grounded: Boolean(data.grounded),
        candidate: data.candidate,
      });
    } catch (err: unknown) {
      setAiError(
        err instanceof Error ? err.message : "AI検索中にエラーが発生しました"
      );
    } finally {
      setIsAiLookingUp(false);
    }
  };

  const handleApplyAiPreview = () => {
    if (!aiPreview) return;
    const cand = aiPreview.candidate;
    if (cand.name) setName(cand.name);
    if (cand.shortName && !shortName.trim()) setShortName(cand.shortName);
    if (cand.leagueName && !leagueName.trim()) setLeagueName(cand.leagueName);
    if (cand.area) setArea(cand.area);
    if (cand.homeGround) setHomeGround(cand.homeGround);
    if (cand.description && !description.trim()) {
      setDescription(cand.description);
    }
    if (cand.websiteUrl) {
      setWebsiteUrl(cand.websiteUrl);
    }
    if (cand.links.length > 0) {
      setLinkDrafts((prev) => {
        const existingUrls = new Set(
          prev.map((p) => p.url.trim().toLowerCase()).filter(Boolean)
        );
        const merged = [...prev];
        for (const lk of cand.links) {
          if (merged.length >= MAX_LINKS_PER_RELATED_TEAM) break;
          if (!existingUrls.has(lk.url.toLowerCase())) {
            existingUrls.add(lk.url.toLowerCase());
            merged.push({
              id: lk.id,
              kind: lk.kind,
              label: lk.label,
              url: lk.url,
            });
          }
        }
        return merged;
      });
    }
    setAiPreview(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setSubmitError("チーム名を入力してください");
      return;
    }

    const normalizedWebInput = normalizeHttpUrlInput(websiteUrl);
    const webCheck = validateSafeHttpUrl(normalizedWebInput, {
      allowEmpty: true,
    });
    if (!webCheck.ok) {
      setSubmitError(`公式サイトURL: ${webCheck.error}`);
      return;
    }

    const linksCheck = validateAndNormalizeRelatedTeamLinks(linkDrafts);
    if (!linksCheck.ok) {
      setSubmitError(linksCheck.error);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSave({
        name: cleanName,
        shortName: shortName.trim(),
        leagueName: leagueName.trim(),
        relationType,
        area: area.trim(),
        homeGround: homeGround.trim(),
        websiteUrl: webCheck.url || "",
        links: linksCheck.links,
        description: description.trim(),
        scope,
        isFavorite,
      });
      onClose();
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "保存に失敗しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!editingTeam || !onDelete) return;
    if (
      !confirm(
        `関連チーム「${editingTeam.name}」を削除してもよろしいですか？（試合記録自体は削除されません）`
      )
    ) {
      return;
    }
    setIsDeleting(true);
    setSubmitError(null);
    try {
      await onDelete(editingTeam);
      onClose();
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "削除に失敗しました"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => {
        if (!isSubmitting && !isDeleting) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92dvh] bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* A-3 Dark Solid Header Cap */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-primary/20 text-sky-300 border border-sky-400/30 flex items-center justify-center shrink-0">
              <Handshake className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-white truncate">
                {editingTeam ? "関連チームを編集" : "関連チームを追加"}
              </h2>
              <p className="text-[10px] font-bold text-slate-300 truncate">
                所属連盟・拠点・公式HP・SNSリンクを登録
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isDeleting}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => void handleFormSubmit(e)}
          className="flex-1 overflow-y-auto p-4 space-y-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]"
        >
          {submitError && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* チーム名 ＆ 個別AI自動補完 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-black text-foreground">
                チーム名 <span className="text-destructive">*</span>
              </label>
              <button
                type="button"
                disabled={isAiLookingUp || !name.trim()}
                onClick={() => void handleRunSingleAiLookup()}
                className="px-2.5 py-1 rounded-lg bg-[#0f172a] text-amber-300 border border-slate-700 text-[11px] font-black flex items-center gap-1 hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isAiLookingUp ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>AI調査中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    <span>AIでHP・SNS・拠点を自動検索</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                required
                maxLength={MAX_RELATED_TEAM_NAME_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 〇〇ベアーズ"
                className="sm:col-span-2 w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40"
              />
              <input
                type="text"
                maxLength={MAX_RELATED_TEAM_SHORT_NAME_LENGTH}
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="略称 (任意)"
                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {aiError && (
              <p className="text-[11px] font-bold text-destructive flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{aiError}</span>
              </p>
            )}

            {aiPreview && (
              <div className="p-3 rounded-2xl border border-primary/35 bg-primary/5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-xs font-black text-foreground truncate">
                      AI調査結果: {aiPreview.candidate.name}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-black shrink-0">
                    {aiPreview.grounded ? "Web検索検証済" : "AI推論"}
                  </span>
                </div>

                {aiPreview.candidate.summaryNote && (
                  <p className="text-[11px] text-muted-foreground font-bold">
                    {aiPreview.candidate.summaryNote}
                  </p>
                )}

                <div className="text-[11px] space-y-1 text-foreground">
                  {aiPreview.candidate.leagueName && (
                    <p>
                      <span className="font-black text-muted-foreground">連盟: </span>
                      {aiPreview.candidate.leagueName}
                    </p>
                  )}
                  {(aiPreview.candidate.area || aiPreview.candidate.homeGround) && (
                    <p>
                      <span className="font-black text-muted-foreground">地域・拠点: </span>
                      {[aiPreview.candidate.area, aiPreview.candidate.homeGround]
                        .filter(Boolean)
                        .join(" / ")}
                    </p>
                  )}
                  {aiPreview.candidate.websiteUrl && (
                    <p className="truncate">
                      <span className="font-black text-muted-foreground">公式HP: </span>
                      {aiPreview.candidate.websiteUrl}
                    </p>
                  )}
                  {aiPreview.candidate.links.length > 0 && (
                    <p>
                      <span className="font-black text-muted-foreground">検出SNS等: </span>
                      {aiPreview.candidate.links.map((l) => l.label).join("・")}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAiPreview(null)}
                    className="px-2.5 py-1.5 rounded-lg border border-border bg-card text-[11px] font-bold text-muted-foreground cursor-pointer"
                  >
                    閉じる
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyAiPreview}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-black flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>フォームに反映する</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 所属連盟・団体名 */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-foreground">
              所属連盟・団体・グループ名
            </label>
            <input
              type="text"
              maxLength={MAX_RELATED_TEAM_LEAGUE_LENGTH}
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              placeholder="例: 〇〇市学童軟式野球連盟 / 練習試合・交流"
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
            {leagueSuggestions.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5 pb-0.5 scrollbar-none">
                {leagueSuggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setLeagueName(sug)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border shrink-0 transition-all cursor-pointer ${
                      leagueName === sug
                        ? "bg-primary/15 text-primary border-primary/40 font-black"
                        : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                    }`}
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 関係区分 ＆ 共有範囲 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-foreground">
                関係区分
              </label>
              <LiffSelect
                value={relationType}
                onChange={(val) =>
                  setRelationType(val as RelatedTeamRelationType)
                }
                options={RELATION_SELECT_OPTIONS}
                title="関係区分を選択"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black text-foreground">
                共有範囲
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setScope("organization")}
                  className={`py-2.5 px-2.5 rounded-xl border text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    scope === "organization"
                      ? "bg-primary/12 text-primary border-primary/40 font-black"
                      : "bg-background text-muted-foreground border-border font-bold"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">チーム全体</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScope("team")}
                  className={`py-2.5 px-2.5 rounded-xl border text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    scope === "team"
                      ? "bg-primary/12 text-primary border-primary/40 font-black"
                      : "bg-background text-muted-foreground border-border font-bold"
                  }`}
                >
                  <Users2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{squadName}限定</span>
                </button>
              </div>
            </div>
          </div>

          {/* 活動地域 ＆ 主な拠点グラウンド */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-foreground">
                活動地域・市区町村
              </label>
              <input
                type="text"
                maxLength={MAX_RELATED_TEAM_AREA_LENGTH}
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="例: 〇〇県〇〇市〇〇区"
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black text-foreground">
                主な活動拠点・グラウンド
              </label>
              <input
                type="text"
                maxLength={MAX_RELATED_TEAM_GROUND_LENGTH}
                value={homeGround}
                onChange={(e) => setHomeGround(e.target.value)}
                placeholder="例: 〇〇緑地少年野球場 / 〇〇小学校"
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          {/* 公式サイトURL */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-foreground flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-primary" />
              <span>公式サイト・代表ページURL（任意）</span>
            </label>
            <input
              type="text"
              inputMode="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* SNS・サブリンク一覧 */}
          <div className="space-y-2.5 p-3 rounded-2xl border border-border bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black text-foreground">
                  公式SNS・関連リンク ({linkDrafts.length}/{MAX_LINKS_PER_RELATED_TEAM})
                </p>
                <p className="text-[10px] font-bold text-muted-foreground">
                  Instagram・YouTube・X・募集ブログ・拠点マップ等を複数登録可能
                </p>
              </div>
            </div>

            {/* 1タップ追加チップ */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ADD_LINK_KINDS.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  disabled={linkDrafts.length >= MAX_LINKS_PER_RELATED_TEAM}
                  onClick={() => handleQuickAddLink(item.kind)}
                  className="px-2.5 py-1 rounded-lg bg-card border border-border text-[11px] font-black text-foreground hover:border-primary/40 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                >
                  {item.chipLabel}
                </button>
              ))}
            </div>

            {linkDrafts.length > 0 && (
              <div className="space-y-2 pt-1">
                {linkDrafts.map((draft, idx) => (
                  <div
                    key={draft.id}
                    className="p-2.5 rounded-xl border border-border bg-card space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-muted-foreground shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="w-40 shrink-0">
                        <LiffSelect
                          value={draft.kind}
                          onChange={(val) =>
                            handleUpdateLinkDraft(draft.id, {
                              kind: val as RelatedTeamLinkKind,
                            })
                          }
                          options={LINK_KIND_SELECT_OPTIONS}
                          title="リンク種別を選択"
                          size="sm"
                        />
                      </div>
                      <input
                        type="text"
                        maxLength={MAX_RELATED_TEAM_LINK_LABEL_LENGTH}
                        value={draft.label}
                        onChange={(e) =>
                          handleUpdateLinkDraft(draft.id, {
                            label: e.target.value,
                          })
                        }
                        placeholder="表示名 (例: Instagram)"
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveLinkDraft(draft.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer shrink-0"
                        aria-label="リンク行を削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      inputMode="url"
                      value={draft.url}
                      onChange={(e) =>
                        handleUpdateLinkDraft(draft.id, {
                          url: e.target.value,
                        })
                      }
                      placeholder="https://www.instagram.com/..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* チーム紹介・交流メモ */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-foreground">
              チーム特徴・交流メモ（任意）
            </label>
            <textarea
              rows={2}
              maxLength={MAX_RELATED_TEAM_DESC_LENGTH}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例: 毎年春・秋に定期練習試合を実施。駐車場は河川敷北口を利用。"
              className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          {/* 注目ピン留め */}
          <label className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-muted/20 cursor-pointer">
            <input
              type="checkbox"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
              className="w-4 h-4 rounded accent-amber-500"
            />
            <Star
              className={`w-4 h-4 shrink-0 ${
                isFavorite
                  ? "text-amber-500 fill-amber-500"
                  : "text-muted-foreground"
              }`}
            />
            <span className="text-xs font-black text-foreground">
              よく交流・対戦する注目チームとして上部ピン留めする
            </span>
          </label>

          {/* フッターアクション */}
          <div className="flex items-center justify-between gap-2 pt-2">
            {editingTeam && onDelete ? (
              <button
                type="button"
                disabled={isDeleting || isSubmitting}
                onClick={() => void handleConfirmDelete()}
                className="px-3.5 py-2.5 rounded-xl border border-destructive/35 bg-destructive/10 text-destructive text-xs font-black flex items-center gap-1.5 hover:bg-destructive/15 disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>削除</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting || isDeleting}
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-border bg-card text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isDeleting}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-xs hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{editingTeam ? "変更を保存" : "登録する"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

interface BulkAiDiscoverModalProps {
  isOpen: boolean;
  teamId: string;
  squadName: string;
  isDemoMode: boolean;
  defaultCategoryHint: string;
  onClose: () => void;
  onBulkRegister: (params: {
    scope: "organization" | "team";
    defaultLeagueName: string;
    defaultRelationType: RelatedTeamRelationType;
    items: AiDiscoveredTeamCandidate[];
  }) => Promise<void>;
}

export function BulkAiDiscoverModal({
  isOpen,
  teamId,
  squadName,
  isDemoMode,
  defaultCategoryHint,
  onClose,
  onBulkRegister,
}: BulkAiDiscoverModalProps) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [areaHint, setAreaHint] = useState("");
  const [scope, setScope] = useState<"organization" | "team">("organization");
  const [relationType, setRelationType] =
    useState<RelatedTeamRelationType>("league_member");
  const [overrideLeagueName, setOverrideLeagueName] = useState("");

  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [discoverResult, setDiscoverResult] = useState<{
    grounded: boolean;
    sourcePageFetched: boolean;
    leagueTitle: string;
    summaryNote: string;
    candidates: AiDiscoveredTeamCandidate[];
    sources: RelatedTeamAiSourceLink[];
  } | null>(null);
  const [selectedTempIds, setSelectedTempIds] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setQuery("");
    setSourceUrl("");
    setAreaHint("");
    setDiscoverResult(null);
    setSelectedTempIds(new Set());
    setOverrideLeagueName("");
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  const handleRunDiscover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() && !sourceUrl.trim()) {
      setErrorMsg(
        "調査する「連盟・団体・大会名」または「加盟チーム一覧URL」を入力してください"
      );
      return;
    }
    if (isDemoMode || teamId === "demo-team") {
      setErrorMsg(
        "デモモードではAI一括収集を実行できません。チームを作成・参加してからご利用ください"
      );
      return;
    }

    setIsSearching(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/liff/related-teams/ai-discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          query: query.trim(),
          sourceUrl: sourceUrl.trim() || undefined,
          areaHint: areaHint.trim() || undefined,
          categoryHint: defaultCategoryHint || undefined,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        grounded?: boolean;
        sourcePageFetched?: boolean;
        leagueTitle?: string;
        summaryNote?: string;
        candidates?: AiDiscoveredTeamCandidate[];
        sources?: RelatedTeamAiSourceLink[];
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "AIチーム収集に失敗しました");
      }

      const cands = data.candidates || [];
      setDiscoverResult({
        grounded: Boolean(data.grounded),
        sourcePageFetched: Boolean(data.sourcePageFetched),
        leagueTitle: data.leagueTitle || query.trim(),
        summaryNote: data.summaryNote || "",
        candidates: cands,
        sources: data.sources || [],
      });
      setOverrideLeagueName(data.leagueTitle || query.trim());

      // 未登録のチームを初期選択状態にする
      const initialSet = new Set<string>();
      for (const c of cands) {
        if (!c.alreadyRegistered) {
          initialSet.add(c.tempId);
        }
      }
      setSelectedTempIds(initialSet);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "AI調査中にエラーが発生しました"
      );
    } finally {
      setIsSearching(false);
    }
  };

  const toggleCandidate = (tempId: string) => {
    setSelectedTempIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) {
        next.delete(tempId);
      } else {
        next.add(tempId);
      }
      return next;
    });
  };

  const handleSelectAllUnregistered = () => {
    if (!discoverResult) return;
    const next = new Set<string>();
    for (const c of discoverResult.candidates) {
      if (!c.alreadyRegistered) next.add(c.tempId);
    }
    setSelectedTempIds(next);
  };

  const handleBulkSave = async () => {
    if (!discoverResult) return;
    const chosen = discoverResult.candidates.filter((c) =>
      selectedTempIds.has(c.tempId)
    );
    if (chosen.length === 0) {
      setErrorMsg("登録するチームを1つ以上チェックしてください");
      return;
    }

    const effectiveLeague = overrideLeagueName.trim();
    const mappedItems = chosen.map((c) => ({
      ...c,
      leagueName: effectiveLeague || c.leagueName,
      relationType,
    }));

    setIsSaving(true);
    setErrorMsg(null);
    try {
      await onBulkRegister({
        scope,
        defaultLeagueName: effectiveLeague,
        defaultRelationType: relationType,
        items: mappedItems,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "一括登録に失敗しました"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => {
        if (!isSearching && !isSaving) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-xl max-h-[92dvh] bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* A-3 Dark Solid Header Cap */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-white truncate">
                関連チームのAI一括収集
              </h2>
              <p className="text-[10px] font-bold text-slate-300 truncate">
                所属連盟名や連盟HPのURLから加盟チーム・公式SNSを自動調査
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSearching || isSaving}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 調査条件フォーム */}
          <form
            onSubmit={(e) => void handleRunDiscover(e)}
            className="p-3.5 rounded-2xl border border-border bg-muted/20 space-y-3"
          >
            <div className="space-y-1.5">
              <label className="text-xs font-black text-foreground">
                連盟・協会・大会名 または 地域キーワード
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="例: 〇〇市学童軟式野球連盟 / 〇〇区少年野球連盟"
                className="w-full px-3.5 py-2.5 rounded-xl bg-card border border-border text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-black text-muted-foreground">
                  連盟の加盟チーム一覧URL（任意・高精度）
                </label>
                <input
                  type="text"
                  inputMode="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://... (連盟HPのチーム一覧ページ等)"
                  className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-black text-muted-foreground">
                  地域ヒント（任意）
                </label>
                <input
                  type="text"
                  value={areaHint}
                  onChange={(e) => setAreaHint(e.target.value)}
                  placeholder="例: 〇〇県〇〇市"
                  className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSearching || isSaving}
              className="w-full py-2.5 px-4 rounded-xl bg-[#0f172a] text-amber-300 border border-slate-700 font-black text-xs hover:bg-slate-800 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Web検索で加盟チームと公式SNSを調査中...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>AIで関連チームを自動調査する</span>
                </>
              )}
            </button>
          </form>

          {/* 調査結果プレビュー＆チェックリスト */}
          {discoverResult && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-primary/12 text-primary text-[10px] font-black">
                    検出 {discoverResult.candidates.length}チーム
                  </span>
                  {discoverResult.sourcePageFetched && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                      指定URL直接解析
                    </span>
                  )}
                  {discoverResult.grounded && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-black">
                      Web検索検証済
                    </span>
                  )}
                </div>

                {discoverResult.candidates.length > 0 && (
                  <div className="flex items-center gap-2 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={handleSelectAllUnregistered}
                      className="text-primary hover:underline cursor-pointer"
                    >
                      未登録を全選択
                    </button>
                    <span className="text-border">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedTempIds(new Set())}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      全解除
                    </button>
                  </div>
                )}
              </div>

              {discoverResult.summaryNote && (
                <p className="text-[11px] font-bold text-muted-foreground px-1">
                  {discoverResult.summaryNote}
                </p>
              )}

              {discoverResult.candidates.length === 0 ? (
                <div className="p-6 rounded-2xl border border-border bg-muted/20 text-center space-y-1.5">
                  <p className="text-xs font-black text-foreground">
                    実在が確認できるチームが見つかりませんでした
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    正式な連盟名を入力するか、連盟公式サイトの加盟チーム一覧ページURLを貼り付けて再度お試しください。
                  </p>
                </div>
              ) : (
                <>
                  {/* 一括登録時のグループ名・共有範囲設定 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-2xl border border-border bg-muted/15">
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-foreground">
                        登録する所属連盟・グループ名
                      </label>
                      <input
                        type="text"
                        value={overrideLeagueName}
                        onChange={(e) => setOverrideLeagueName(e.target.value)}
                        placeholder="例: 〇〇市学童軟式野球連盟"
                        className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-foreground">
                        共有範囲
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setScope("organization")}
                          className={`py-2 px-2 rounded-xl border text-[11px] flex items-center justify-center gap-1 cursor-pointer ${
                            scope === "organization"
                              ? "bg-primary/12 text-primary border-primary/40 font-black"
                              : "bg-card text-muted-foreground border-border font-bold"
                          }`}
                        >
                          <Building2 className="w-3 h-3" />
                          <span>チーム全体</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setScope("team")}
                          className={`py-2 px-2 rounded-xl border text-[11px] flex items-center justify-center gap-1 cursor-pointer ${
                            scope === "team"
                              ? "bg-primary/12 text-primary border-primary/40 font-black"
                              : "bg-card text-muted-foreground border-border font-bold"
                          }`}
                        >
                          <Users2 className="w-3 h-3" />
                          <span className="truncate">{squadName}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 候補リスト */}
                  <div className="space-y-2 max-h-[38dvh] overflow-y-auto pr-0.5">
                    {discoverResult.candidates.map((cand) => {
                      const isChecked = selectedTempIds.has(cand.tempId);
                      const linkCount =
                        (cand.websiteUrl ? 1 : 0) + cand.links.length;
                      return (
                        <label
                          key={cand.tempId}
                          className={`flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                            cand.alreadyRegistered
                              ? "border-border bg-muted/30 opacity-70"
                              : isChecked
                                ? "border-primary/50 bg-primary/5 shadow-2xs"
                                : "border-border bg-card hover:border-primary/30"
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={cand.alreadyRegistered}
                            checked={isChecked}
                            onChange={() => toggleCandidate(cand.tempId)}
                            className="mt-1 w-4 h-4 rounded accent-primary shrink-0"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black text-foreground">
                                {cand.name}
                              </span>
                              {cand.alreadyRegistered && (
                                <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border text-[10px] font-black">
                                  登録済
                                </span>
                              )}
                              {linkCount > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                                  HP/SNS {linkCount}件
                                </span>
                              )}
                            </div>

                            {(cand.area || cand.homeGround) && (
                              <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  {[cand.area, cand.homeGround]
                                    .filter(Boolean)
                                    .join(" ・ ")}
                                </span>
                              </p>
                            )}

                            {cand.description && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2">
                                {cand.description}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {/* 情報源リンク */}
                  {discoverResult.sources.length > 0 && (
                    <div className="pt-1 space-y-1">
                      <p className="text-[10px] font-black text-muted-foreground">
                        参照元Webページ:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {discoverResult.sources.slice(0, 4).map((src) => {
                          const safeHref = sanitizeSafeExternalHref(src.url);
                          if (!safeHref) return null;
                          return (
                            <a
                              key={src.url}
                              href={safeHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[10px] font-bold text-muted-foreground hover:text-foreground border border-border max-w-[220px]"
                            >
                              <span className="truncate">{src.title}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 一括保存ボタン */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={onClose}
                      className="px-4 py-2.5 rounded-xl border border-border bg-card text-xs font-bold text-muted-foreground cursor-pointer"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      disabled={isSaving || selectedTempIds.size === 0}
                      onClick={() => void handleBulkSave()}
                      className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-xs hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      <span>
                        選択した {selectedTempIds.size} チームを一括登録
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

interface PastOpponentsImportModalProps {
  isOpen: boolean;
  opponents: ReadonlyArray<UnregisteredOpponentItem>;
  squadName: string;
  leagueSuggestions: ReadonlyArray<string>;
  onClose: () => void;
  onImport: (params: {
    scope: "organization" | "team";
    leagueName: string;
    relationType: RelatedTeamRelationType;
    selectedNames: string[];
  }) => Promise<void>;
}

export function PastOpponentsImportModal({
  isOpen,
  opponents,
  squadName,
  leagueSuggestions,
  onClose,
  onImport,
}: PastOpponentsImportModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [leagueName, setLeagueName] = useState("");
  const [relationType, setRelationType] =
    useState<RelatedTeamRelationType>("practice_partner");
  const [scope, setScope] = useState<"organization" | "team">("organization");
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSelectedNames(new Set(opponents.map((o) => o.opponentName)));
    setLeagueName("");
  }, [isOpen, opponents]);

  if (!mounted || !isOpen) return null;

  const toggleName = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleConfirmImport = async () => {
    const names = Array.from(selectedNames);
    if (names.length === 0) {
      setErrorMsg("取り込む対戦チームを1つ以上選択してください");
      return;
    }
    setIsImporting(true);
    setErrorMsg(null);
    try {
      await onImport({
        scope,
        leagueName: leagueName.trim(),
        relationType,
        selectedNames: names,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "対戦相手の取り込みに失敗しました"
      );
    } finally {
      setIsImporting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => {
        if (!isImporting) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-lg max-h-[90dvh] bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-primary/20 text-sky-300 border border-sky-400/30 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-white truncate">
                試合記録から対戦チームを一括取込
              </h2>
              <p className="text-[10px] font-bold text-slate-300 truncate">
                登録後は各カードからAI検索でHP・SNSも補完できます
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-2.5 p-3 rounded-2xl border border-border bg-muted/20">
            <div className="space-y-1">
              <label className="text-xs font-black text-foreground">
                割り当てる連盟・グループ名（任意）
              </label>
              <input
                type="text"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                placeholder="例: 〇〇市学童軟式野球連盟 / 練習試合・交流"
                className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold"
              />
              {leagueSuggestions.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5 scrollbar-none">
                  {leagueSuggestions.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setLeagueName(sug)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border shrink-0 cursor-pointer ${
                        leagueName === sug
                          ? "bg-primary/15 text-primary border-primary/40 font-black"
                          : "bg-card text-muted-foreground border-border"
                      }`}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground">
                  関係区分
                </label>
                <LiffSelect
                  value={relationType}
                  onChange={(val) =>
                    setRelationType(val as RelatedTeamRelationType)
                  }
                  options={RELATION_SELECT_OPTIONS}
                  title="関係区分を選択"
                  size="sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground">
                  共有範囲
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setScope("organization")}
                    className={`py-2 px-2 rounded-xl border text-[11px] flex items-center justify-center gap-1 cursor-pointer ${
                      scope === "organization"
                        ? "bg-primary/12 text-primary border-primary/40 font-black"
                        : "bg-card text-muted-foreground border-border font-bold"
                    }`}
                  >
                    <Building2 className="w-3 h-3" />
                    <span>全体</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("team")}
                    className={`py-2 px-2 rounded-xl border text-[11px] flex items-center justify-center gap-1 cursor-pointer ${
                      scope === "team"
                        ? "bg-primary/12 text-primary border-primary/40 font-black"
                        : "bg-card text-muted-foreground border-border font-bold"
                    }`}
                  >
                    <Users2 className="w-3 h-3" />
                    <span className="truncate">{squadName}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 max-h-[42dvh] overflow-y-auto pr-0.5">
            {opponents.map((opp) => {
              const checked = selectedNames.has(opp.opponentName);
              return (
                <label
                  key={opp.opponentName}
                  className={`flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                    checked
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleName(opp.opponentName)}
                      className="w-4 h-4 rounded accent-primary shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-black text-foreground truncate">
                        {opp.opponentName}
                      </p>
                      <p className="text-[10px] font-bold text-muted-foreground">
                        {opp.totalFinished > 0
                          ? `通算 ${opp.totalFinished}戦 ${opp.wins}勝${opp.losses}敗${opp.draws > 0 ? `${opp.draws}分` : ""}`
                          : `予定 ${opp.scheduledCount}試合`}
                        {opp.lastMatchDate ? ` ・ 直近 ${opp.lastMatchDate}` : ""}
                      </p>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              disabled={isImporting}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-border bg-card text-xs font-bold text-muted-foreground cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={isImporting || selectedNames.size === 0}
              onClick={() => void handleConfirmImport()}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-xs hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{selectedNames.size} チームを取り込む</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
