// filepath: src/app/liff/rules/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  AlertTriangle,
  ChevronDown,
  Search,
  Plus,
  X,
  Building2,
  Users2,
  Loader2,
  AlertCircle,
  BookmarkCheck,
  Pencil,
  Trash2,
  Car,
  ClipboardList,
  MapPin,
  ShieldCheck,
  Sun,
  CloudRain,
  HelpCircle,
  FileText,
  Trophy,
  Flame,
  Image as ImageIcon,
  Upload,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";

interface RuleItem {
  id: string;
  category: string;
  categoryLabel: string;
  title: string;
  content: string;
  scope: "organization" | "team";
  scopeLabel: string;
  priority?: number;
  isImportant?: boolean;
  imageUrl?: string | null;
}

export default function LiffRulesPage() {
  const { currentTeam, profile } = useLiff();
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedScope, setSelectedScope] = useState<"all" | "organization" | "team">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [previewImageModalUrl, setPreviewImageModalUrl] = useState<string | null>(null);

  // 新規登録モーダル用ステート
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("match");
  const [newScope, setNewScope] = useState<"organization" | "team">("team");
  const [newIsImportant, setNewIsImportant] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState<string>("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 編集モーダル用ステート
  const [editingRule, setEditingRule] = useState<RuleItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("match");
  const [editScope, setEditScope] = useState<"organization" | "team">("team");
  const [editIsImportant, setEditIsImportant] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState<string>("");
  const [isEditUploadingImage, setIsEditUploadingImage] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadRules = useCallback(async () => {
    try {
      setIsLoading(true);
      const teamId = currentTeam?.id || "demo-team";
      const res = await fetch(`/api/liff/rules?teamId=${teamId}`);
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; rules?: RuleItem[] };
        if (data.rules) {
          setRules(data.rules);
          if (data.rules.length > 0 && openIds.length === 0) {
            setOpenIds([data.rules[0].id]);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch rules:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // 画像アップロードハンドラー
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (isEdit) setIsEditUploadingImage(true);
      else setIsUploadingImage(true);
      setSubmitError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("teamId", currentTeam?.id || "general");

      const res = await fetch("/api/liff/rules/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as { success: boolean; imageUrl?: string; error?: string };
      if (!data.success || !data.imageUrl) {
        throw new Error(data.error || "画像のアップロードに失敗しました");
      }

      if (isEdit) {
        setEditImageUrl(data.imageUrl);
      } else {
        setNewImageUrl(data.imageUrl);
      }
    } catch (err: any) {
      console.error("Image upload failed:", err);
      setSubmitError(err.message || "画像のアップロードに失敗しました");
    } finally {
      if (isEdit) setIsEditUploadingImage(false);
      else setIsUploadingImage(false);
    }
  };

  // 編集モーダルを開く
  const openEditModal = (rule: RuleItem) => {
    setEditingRule(rule);
    setEditTitle(rule.title);
    setEditContent(rule.content);
    setEditCategory(rule.category);
    setEditScope(rule.scope);
    setEditIsImportant(!!rule.isImportant);
    setEditImageUrl(rule.imageUrl || "");
    setSubmitError(null);
  };

  // 新規登録処理
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const teamId = currentTeam?.id || "demo-team";

      const res = await fetch("/api/liff/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          title: newTitle.trim(),
          content: newContent.trim(),
          category: newCategory,
          scope: newScope,
          isImportant: newIsImportant,
          imageUrl: newImageUrl.trim() || null,
          userId: profile?.userId,
        }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "ルール & 注意事項の登録に失敗しました");
      }

      setIsCreateModalOpen(false);
      setNewTitle("");
      setNewContent("");
      setNewIsImportant(false);
      setNewImageUrl("");
      loadRules();
    } catch (err: any) {
      console.error("Error creating rule:", err);
      setSubmitError(err.message || "ルール & 注意事項の登録に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 更新処理
  const handleUpdateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule || !editTitle.trim() || !editContent.trim()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const teamId = currentTeam?.id || "demo-team";

      const res = await fetch(`/api/liff/rules/${editingRule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          title: editTitle.trim(),
          content: editContent.trim(),
          category: editCategory,
          scope: editScope,
          isImportant: editIsImportant,
          imageUrl: editImageUrl.trim() || null,
        }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "ルール & 注意事項の更新に失敗しました");
      }

      setEditingRule(null);
      loadRules();
    } catch (err: any) {
      console.error("Error updating rule:", err);
      setSubmitError(err.message || "ルール & 注意事項の更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 削除処理
  const handleDeleteRule = async () => {
    if (!editingRule) return;
    if (!confirm(`このルール & 注意事項（${editingRule.title.slice(0, 20)}...）を削除してもよろしいですか？`)) return;

    try {
      setIsDeleting(true);
      setSubmitError(null);

      const res = await fetch(`/api/liff/rules/${editingRule.id}`, {
        method: "DELETE",
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "ルール & 注意事項の削除に失敗しました");
      }

      setEditingRule(null);
      loadRules();
    } catch (err: any) {
      console.error("Error deleting rule:", err);
      setSubmitError(err.message || "ルール & 注意事項の削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  const categories = [
    { id: "all", label: "すべて", icon: BookmarkCheck },
    { id: "match", label: "試合・遠征", icon: Trophy },
    { id: "carpool", label: "配車・送迎", icon: Car },
    { id: "duty", label: "当番・保護者", icon: ClipboardList },
    { id: "venue", label: "グラウンド", icon: MapPin },
    { id: "equipment", label: "用具・規定", icon: ShieldCheck },
    { id: "safety", label: "熱中症・安全", icon: Sun },
    { id: "emergency", label: "雨天・緊急", icon: CloudRain },
    { id: "general", label: "その他", icon: FileText },
  ];

  const toggleAccordion = (id: string) => {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filteredRules = rules.filter((rule) => {
    const matchesCategory = selectedCategory === "all" || rule.category === selectedCategory;
    const matchesScope = selectedScope === "all" || rule.scope === selectedScope;
    const matchesSearch =
      rule.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesScope && matchesSearch;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader />

      <div className="p-4 space-y-5">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="ルール & 注意事項"
          subtitle="安全で円滑なチーム活動のためのガイドライン"
          icon={
            <span className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
              <AlertTriangle className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【ルール & 注意事項】${currentTeam?.name || "チーム"} 活動ガイドライン一覧`,
            text: `試合・遠征・配車マナー・当番・用具規定・熱中症対策などのルール & 注意事項はこちらから確認できます`,
          }}
        />

        {/* ➕ ルール & 注意事項を追加ボタン */}
        <button
          type="button"
          onClick={() => {
            setIsCreateModalOpen(true);
            setSubmitError(null);
          }}
          className="w-full py-3 px-4 rounded-2xl bg-primary text-primary-foreground font-black text-xs shadow-sm hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>新しいルール & 注意事項を追加する</span>
        </button>

        {/* 🏢 チーム全体 vs 👥 編成限定 スコープ切り替えタブ */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-4 px-4 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedScope("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer ${
              selectedScope === "all"
                ? "bg-foreground text-background shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            すべて ({rules.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("organization")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedScope === "organization"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>チーム全体</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("team")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedScope === "team"
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users2 className="w-3.5 h-3.5" />
            <span>{currentTeam?.teamName || "編成"}</span>
          </button>
        </div>

        {/* 🔍 検索バー */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="キーワードで検索 (例: 遠征、チャイルドシート、氷嚢...)"
            className="w-full pl-9.5 pr-4 py-2.5 rounded-2xl bg-card border border-border text-xs placeholder:text-muted-foreground/70 focus:outline-hidden focus:ring-2 focus:ring-primary/40 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 🏷️ カテゴリチップ一覧 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {categories.map((c) => {
            const Icon = c.icon;
            const isSelected = selectedCategory === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? "bg-primary/15 text-primary border border-primary/30 shadow-2xs"
                    : "bg-card border border-border/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>

        {/* 📋 ルール & 注意事項 アコーディオン一覧 */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">ルール & 注意事項を読み込み中...</span>
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="p-8 rounded-3xl bg-card border border-border text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-xs font-black text-foreground">
              該当するルール & 注意事項が見つかりませんでした
            </p>
            <p className="text-[11px] text-muted-foreground">
              検索条件を変更するか、新しいルール & 注意事項を登録してください。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRules.map((rule) => {
              const isOpen = openIds.includes(rule.id);
              const isOrg = rule.scope === "organization";
              const isImportant = !!rule.isImportant;

              return (
                <div
                  key={rule.id}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden bg-card ${
                    isImportant
                      ? isOpen
                        ? "border-rose-500/60 dark:border-rose-500/50 shadow-md ring-1 ring-rose-500/30"
                        : "border-rose-500/40 bg-gradient-to-r from-rose-500/5 via-card to-card hover:border-rose-500/60"
                      : isOpen
                      ? "border-amber-500/40 shadow-xs ring-1 ring-amber-500/20"
                      : "border-border/60 hover:border-amber-500/30"
                  }`}
                >
                  {/* ヘッダー・開閉トグル */}
                  <div
                    onClick={() => toggleAccordion(rule.id)}
                    className="p-3.5 sm:p-4 cursor-pointer select-none flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                        isImportant
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}>
                        {isImportant ? "🔥" : "⚠️"}
                      </span>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* 🔥 重要バッジ */}
                          {isImportant && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-500 text-white text-[9.5px] font-black shrink-0 shadow-2xs flex items-center gap-0.5">
                              <Flame className="w-3 h-3" />
                              <span>重要</span>
                            </span>
                          )}

                          {/* スコープバッジ */}
                          <span
                            className={`px-2 py-0.5 rounded-md text-[9.5px] font-black shrink-0 ${
                              isOrg
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                            }`}
                          >
                            {rule.scopeLabel}
                          </span>

                          {/* カテゴリバッジ */}
                          <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[9.5px] font-black shrink-0">
                            {rule.categoryLabel}
                          </span>

                          {/* 画像添付バッジ */}
                          {rule.imageUrl && (
                            <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9.5px] font-black shrink-0 flex items-center gap-0.5 border border-blue-500/20">
                              <ImageIcon className="w-2.5 h-2.5" />
                              <span>写真あり</span>
                            </span>
                          )}
                        </div>

                        <h3 className="text-xs sm:text-sm font-black text-foreground leading-snug">
                          {rule.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(rule);
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all"
                        title="編集"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      <div
                        className={`p-1.5 rounded-lg text-muted-foreground transition-transform duration-200 ${
                          isOpen
                            ? isImportant
                              ? "rotate-180 text-rose-600 dark:text-rose-400"
                              : "rotate-180 text-amber-600 dark:text-amber-400"
                            : ""
                        }`}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* 本文エリア */}
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-border/40 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="p-3.5 rounded-xl bg-muted/40 border border-border/40 space-y-2">
                        <p className="text-xs text-foreground/90 font-bold whitespace-pre-wrap leading-relaxed">
                          {rule.content}
                        </p>
                      </div>

                      {/* 📷 添付画像プレビュー表示 */}
                      {rule.imageUrl && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                              <span>参考画像・図解</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setPreviewImageModalUrl(rule.imageUrl || null)}
                              className="text-primary hover:underline flex items-center gap-0.5 text-[10px]"
                            >
                              <span>タップで拡大</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                          <div
                            onClick={() => setPreviewImageModalUrl(rule.imageUrl || null)}
                            className="relative overflow-hidden rounded-2xl border border-border bg-black/5 dark:bg-white/5 cursor-pointer group max-h-60 flex items-center justify-center"
                          >
                            <img
                              src={rule.imageUrl}
                              alt={rule.title}
                              className="w-full h-auto object-cover max-h-60 group-hover:scale-[1.02] transition-transform duration-200"
                              loading="lazy"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* 🖼️ 画像拡大モーダル */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted && previewImageModalUrl && createPortal(
        <div
          onClick={() => setPreviewImageModalUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="relative max-w-2xl max-h-[90vh] w-full flex flex-col items-center">
            <button
              type="button"
              onClick={() => setPreviewImageModalUrl(null)}
              className="absolute -top-10 right-0 p-1.5 rounded-full bg-white/20 text-white hover:bg-white/30"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewImageModalUrl}
              alt="拡大画像"
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl border border-white/20"
            />
          </div>
        </div>,
        document.body
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* ➕ 新規登録モーダル (ポータル描画) */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted && isCreateModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card border border-border rounded-3xl p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
                  <AlertTriangle className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-foreground">新しいルール & 注意事項の登録</h3>
                  <p className="text-[10px] text-muted-foreground font-bold">
                    チーム共通ルールや活動上の注意を共有
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitError && (
              <div className="p-3 rounded-2xl bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleCreateRule} className="space-y-4 text-xs font-bold">
              {/* 🔥 重要バッジ・フラグ選択 */}
              <div
                onClick={() => setNewIsImportant(!newIsImportant)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                  newIsImportant
                    ? "bg-rose-500/10 border-rose-500/40 text-rose-800 dark:text-rose-200 ring-1 ring-rose-500/30"
                    : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm font-black ${
                    newIsImportant ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    <Flame className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="font-black text-xs text-foreground block">重要ルールに設定する</span>
                    <span className="text-[10px] text-muted-foreground font-bold block">
                      一覧の上部に優先表示され、目立つ重要バッジが付きます
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={newIsImportant}
                  onChange={(e) => setNewIsImportant(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                />
              </div>

              {/* スコープ選択 */}
              <div className="space-y-1.5">
                <label className="text-muted-foreground">公開範囲</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewScope("team")}
                    className={`py-2 px-3 rounded-xl border text-xs font-black transition-all cursor-pointer ${
                      newScope === "team"
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-card border-border text-muted-foreground"
                    }`}
                  >
                    👥 {currentTeam?.teamName || "この編成"} のみ
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewScope("organization")}
                    className={`py-2 px-3 rounded-xl border text-xs font-black transition-all cursor-pointer ${
                      newScope === "organization"
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-card border-border text-muted-foreground"
                    }`}
                  >
                    🏢 チーム全体（共通）
                  </button>
                </div>
              </div>

              {/* カテゴリ選択 */}
              <div className="space-y-1.5">
                <label className="text-muted-foreground">カテゴリ</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                >
                  <option value="match">🏆 試合・遠征</option>
                  <option value="carpool">🚗 配車・送迎</option>
                  <option value="duty">📋 当番・保護者</option>
                  <option value="venue">🏟️ グラウンド・観戦</option>
                  <option value="equipment">⚾ 用具・ユニフォーム</option>
                  <option value="safety">☀️ 熱中症・安全管理</option>
                  <option value="emergency">🌧️ 雨天・緊急連絡</option>
                  <option value="general">💡 その他・心得</option>
                </select>
              </div>

              {/* タイトル */}
              <div className="space-y-1.5">
                <label className="text-muted-foreground">タイトル</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例: 配車時のチャイルドシート着用について"
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60"
                />
              </div>

              {/* 詳細内容 */}
              <div className="space-y-1.5">
                <label className="text-muted-foreground">詳細内容・箇条書き</label>
                <textarea
                  required
                  rows={5}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="ルールや注意事項の詳しい内容や遵守事項を記入してください（箇条書き推奨）"
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60 leading-relaxed"
                />
              </div>

              {/* 📷 画像添付エリア */}
              <div className="space-y-2 p-3 rounded-2xl bg-muted/40 border border-border/70">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-500" />
                    <span>参考画像・図解の添付 (任意)</span>
                  </span>
                  {newImageUrl && (
                    <button
                      type="button"
                      onClick={() => setNewImageUrl("")}
                      className="text-[10px] text-destructive hover:underline font-bold"
                    >
                      画像を削除
                    </button>
                  )}
                </div>

                {newImageUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-border bg-card max-h-40 flex items-center justify-center">
                    <img src={newImageUrl} alt="プレビュー" className="max-h-40 w-full object-cover" />
                  </div>
                ) : (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, false)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isUploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2.5 px-3 rounded-xl border border-dashed border-border hover:border-primary/50 bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      {isUploadingImage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          <span>アップロード中...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-primary" />
                          <span>写真・画像を選択または撮影</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-muted text-muted-foreground hover:text-foreground font-black text-xs transition-all"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTitle.trim() || !newContent.trim()}
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-sm hover:bg-primary/90 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>登録中...</span>
                    </>
                  ) : (
                    <span>登録する</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* ✏️ 編集・削除モーダル (ポータル描画) */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted && editingRule && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card border border-border rounded-3xl p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
                  <Pencil className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-foreground">ルール & 注意事項の編集</h3>
                  <p className="text-[10px] text-muted-foreground font-bold">内容の更新または削除</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitError && (
              <div className="p-3 rounded-2xl bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateRule} className="space-y-4 text-xs font-bold">
              {/* 🔥 重要バッジ・フラグ選択 */}
              <div
                onClick={() => setEditIsImportant(!editIsImportant)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                  editIsImportant
                    ? "bg-rose-500/10 border-rose-500/40 text-rose-800 dark:text-rose-200 ring-1 ring-rose-500/30"
                    : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm font-black ${
                    editIsImportant ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    <Flame className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="font-black text-xs text-foreground block">重要ルールに設定する</span>
                    <span className="text-[10px] text-muted-foreground font-bold block">
                      一覧の上部に優先表示され、目立つ重要バッジが付きます
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editIsImportant}
                  onChange={(e) => setEditIsImportant(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                />
              </div>

              {/* スコープ選択 */}
              <div className="space-y-1.5">
                <label className="text-muted-foreground">公開範囲</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditScope("team")}
                    className={`py-2 px-3 rounded-xl border text-xs font-black transition-all cursor-pointer ${
                      editScope === "team"
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-card border-border text-muted-foreground"
                    }`}
                  >
                    👥 {currentTeam?.teamName || "この編成"} のみ
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditScope("organization")}
                    className={`py-2 px-3 rounded-xl border text-xs font-black transition-all cursor-pointer ${
                      editScope === "organization"
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-card border-border text-muted-foreground"
                    }`}
                  >
                    🏢 チーム全体（共通）
                  </button>
                </div>
              </div>

              {/* カテゴリ選択 */}
              <div className="space-y-1.5">
                <label className="text-muted-foreground">カテゴリ</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                >
                  <option value="match">🏆 試合・遠征</option>
                  <option value="carpool">🚗 配車・送迎</option>
                  <option value="duty">📋 当番・保護者</option>
                  <option value="venue">🏟️ グラウンド・観戦</option>
                  <option value="equipment">⚾ 用具・ユニフォーム</option>
                  <option value="safety">☀️ 熱中症・安全管理</option>
                  <option value="emergency">🌧️ 雨天・緊急連絡</option>
                  <option value="general">💡 その他・心得</option>
                </select>
              </div>

              {/* タイトル */}
              <div className="space-y-1.5">
                <label className="text-muted-foreground">タイトル</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* 詳細内容 */}
              <div className="space-y-1.5">
                <label className="text-muted-foreground">詳細内容</label>
                <textarea
                  required
                  rows={5}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 leading-relaxed"
                />
              </div>

              {/* 📷 画像添付エリア */}
              <div className="space-y-2 p-3 rounded-2xl bg-muted/40 border border-border/70">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-500" />
                    <span>参考画像・図解の添付 (任意)</span>
                  </span>
                  {editImageUrl && (
                    <button
                      type="button"
                      onClick={() => setEditImageUrl("")}
                      className="text-[10px] text-destructive hover:underline font-bold"
                    >
                      画像を削除
                    </button>
                  )}
                </div>

                {editImageUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-border bg-card max-h-40 flex items-center justify-center">
                    <img src={editImageUrl} alt="プレビュー" className="max-h-40 w-full object-cover" />
                  </div>
                ) : (
                  <div>
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, true)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isEditUploadingImage}
                      onClick={() => editFileInputRef.current?.click()}
                      className="w-full py-2.5 px-3 rounded-xl border border-dashed border-border hover:border-primary/50 bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      {isEditUploadingImage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          <span>アップロード中...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-primary" />
                          <span>写真・画像を選択または撮影</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={handleDeleteRule}
                  disabled={isDeleting}
                  className="px-3 py-2 rounded-xl text-destructive hover:bg-destructive/10 font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>削除</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingRule(null)}
                    className="px-4 py-2.5 rounded-xl bg-muted text-muted-foreground hover:text-foreground font-black text-xs transition-all cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !editTitle.trim() || !editContent.trim()}
                    className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-sm hover:bg-primary/90 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>更新中...</span>
                      </>
                    ) : (
                      <span>保存する</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
