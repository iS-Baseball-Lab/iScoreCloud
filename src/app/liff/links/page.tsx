// filepath: src/app/liff/links/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  LiffSelect,
  type LiffSelectOption,
} from "@/components/liff/LiffSelect";
import { useLiff } from "@/components/liff/LiffProvider";
import { peekLiffApiCache } from "@/lib/liff/api-cache";
import {
  Link2,
  ExternalLink,
  Search,
  Plus,
  X,
  Building2,
  Users2,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  Globe,
  Trophy,
  Sun,
  MapPin,
  ShoppingBag,
  Share2,
  Copy,
  Check,
  Flame,
  BookmarkCheck,
  Play,
  Upload,
  Image as ImageIcon,
} from "lucide-react";

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

interface LinkItem {
  id: string;
  category: string;
  categoryLabel: string;
  title: string;
  url: string;
  description?: string;
  scope: "organization" | "team";
  scopeLabel: string;
  priority?: number;
  isImportant?: boolean;
  imageUrl?: string | null;
}

const LINK_CATEGORY_OPTIONS: ReadonlyArray<LiffSelectOption> = [
  { value: "league", label: "🌐 連盟・協会公式サイト" },
  { value: "tournament", label: "🏆 大会速報・組み合わせ表" },
  { value: "weather", label: "☀️ 天気予報・雨雲レーダー・暑さ指数" },
  { value: "sns", label: "📱 チーム公式SNS (Instagram/YouTube/HP)" },
  { value: "grounds", label: "🏟️ 球場・施設予約ポータル" },
  { value: "partner", label: "🤝 提携ショップ・スポンサー" },
  { value: "other", label: "🔗 その他・お役立ちリンク" },
];

export default function LiffLinksPage() {
  const { currentTeam, profile } = useLiff();
  const initialCachedLinks = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    const tid =
      currentTeam?.id || localStorage.getItem("iscore_selectedTeamId") || "demo-team";
    return peekLiffApiCache<{ success: boolean; links?: LinkItem[] }>(
      `/api/liff/links?teamId=${tid}`
    );
  }, [currentTeam?.id]);

  const [links, setLinks] = useState<LinkItem[]>(() => initialCachedLinks?.links ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(() => !initialCachedLinks);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedScope, setSelectedScope] = useState<"all" | "organization" | "team">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 新規登録モーダル用ステート
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("league");
  const [newScope, setNewScope] = useState<"organization" | "team">("organization");
  const [newIsImportant, setNewIsImportant] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState<string>("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 編集モーダル用ステート
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("league");
  const [editScope, setEditScope] = useState<"organization" | "team">("organization");
  const [editIsImportant, setEditIsImportant] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState<string>("");
  const [isEditUploadingImage, setIsEditUploadingImage] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadLinks = useCallback(async () => {
    try {
      const teamId = currentTeam?.id || "demo-team";
      const cached = peekLiffApiCache<{ success: boolean; links?: LinkItem[] }>(
        `/api/liff/links?teamId=${teamId}`
      );
      if (cached?.links) {
        setLinks(cached.links);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
      const res = await fetch(`/api/liff/links?teamId=${teamId}`);
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; links?: LinkItem[] };
        if (data.links) {
          setLinks(data.links);
        }
      }
    } catch (err) {
      console.error("Failed to fetch links:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  // URL コピー処理
  const handleCopyUrl = (link: LinkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(link.url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

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

      const res = await fetch("/api/liff/links/upload", {
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
  const openEditModal = (link: LinkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLink(link);
    setEditTitle(link.title);
    setEditUrl(link.url);
    setEditDescription(link.description || "");
    setEditCategory(link.category);
    setEditScope(link.scope);
    setEditIsImportant(!!link.isImportant);
    setEditImageUrl(link.imageUrl || "");
    setSubmitError(null);
  };

  // 新規登録処理
  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newUrl.trim()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const teamId = currentTeam?.id || "demo-team";

      let finalUrl = newUrl.trim();
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = `https://${finalUrl}`;
      }

      const res = await fetch("/api/liff/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          title: newTitle.trim(),
          url: finalUrl,
          description: newDescription.trim() || null,
          category: newCategory,
          scope: newScope,
          isImportant: newIsImportant,
          imageUrl: newImageUrl.trim() || null,
          userId: profile?.userId,
        }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "リンクの登録に失敗しました");
      }

      setIsCreateModalOpen(false);
      setNewTitle("");
      setNewUrl("");
      setNewDescription("");
      setNewIsImportant(false);
      setNewImageUrl("");
      loadLinks();
    } catch (err: any) {
      console.error("Error creating link:", err);
      setSubmitError(err.message || "リンクの登録に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 更新処理
  const handleUpdateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLink || !editTitle.trim() || !editUrl.trim()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const teamId = currentTeam?.id || "demo-team";

      let finalUrl = editUrl.trim();
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = `https://${finalUrl}`;
      }

      const res = await fetch(`/api/liff/links/${editingLink.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          title: editTitle.trim(),
          url: finalUrl,
          description: editDescription.trim() || null,
          category: editCategory,
          scope: editScope,
          isImportant: editIsImportant,
          imageUrl: editImageUrl.trim() || null,
        }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "リンクの更新に失敗しました");
      }

      setEditingLink(null);
      loadLinks();
    } catch (err: any) {
      console.error("Error updating link:", err);
      setSubmitError(err.message || "リンクの更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 削除処理
  const handleDeleteLink = async () => {
    if (!editingLink) return;
    if (!confirm(`このリンク（${editingLink.title.slice(0, 20)}...）を削除してもよろしいですか？`)) return;

    try {
      setIsDeleting(true);
      setSubmitError(null);

      const res = await fetch(`/api/liff/links/${editingLink.id}`, {
        method: "DELETE",
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "リンクの削除に失敗しました");
      }

      setEditingLink(null);
      loadLinks();
    } catch (err: any) {
      console.error("Error deleting link:", err);
      setSubmitError(err.message || "リンクの削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  const categories: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "all", label: "すべて", icon: BookmarkCheck },
    { id: "league", label: "連盟・協会", icon: Globe },
    { id: "tournament", label: "大会・速報", icon: Trophy },
    { id: "weather", label: "天気・暑さ", icon: Sun },
    { id: "sns", label: "公式SNS", icon: InstagramIcon },
    { id: "grounds", label: "施設予約", icon: MapPin },
    { id: "partner", label: "提携店", icon: ShoppingBag },
    { id: "other", label: "その他", icon: Link2 },
  ];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "league":
        return <Globe className="w-4 h-4" />;
      case "tournament":
        return <Trophy className="w-4 h-4" />;
      case "weather":
        return <Sun className="w-4 h-4" />;
      case "sns":
        return <InstagramIcon className="w-4 h-4" />;
      case "grounds":
        return <MapPin className="w-4 h-4" />;
      case "partner":
        return <ShoppingBag className="w-4 h-4" />;
      default:
        return <Link2 className="w-4 h-4" />;
    }
  };

  // 外部サービスの公式ブランドカラー判定（単色ソリッド・グラデーション不使用）
  const getLinkBrandStyle = (url: string, category: string) => {
    const lowerUrl = (url || "").toLowerCase();
    if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) {
      return {
        icon: <Play className="w-4 h-4 fill-current" />,
        iconBoxClass: "bg-[#FF0000]/12 text-[#FF0000]",
        buttonClass: "bg-[#FF0000] hover:bg-[#CC0000] text-white",
        buttonLabel: "YouTube",
      };
    }
    if (lowerUrl.includes("line.me")) {
      return {
        icon: <Share2 className="w-4 h-4" />,
        iconBoxClass: "bg-[#06C755]/12 text-[#06C755]",
        buttonClass: "bg-[#06C755] hover:bg-[#05b34c] text-white",
        buttonLabel: "LINE",
      };
    }
    if (lowerUrl.includes("instagram.com")) {
      return {
        icon: <InstagramIcon className="w-4 h-4" />,
        iconBoxClass: "bg-[#E1306C]/12 text-[#E1306C]",
        buttonClass: "bg-[#E1306C] hover:bg-[#C1275C] text-white",
        buttonLabel: "Instagram",
      };
    }
    if (lowerUrl.includes("x.com/") || lowerUrl.includes("twitter.com/")) {
      return {
        icon: <Globe className="w-4 h-4" />,
        iconBoxClass: "bg-slate-900/12 text-slate-900 dark:bg-slate-100/15 dark:text-slate-100",
        buttonClass: "bg-[#0f172a] hover:bg-slate-800 text-white",
        buttonLabel: "Xを開く",
      };
    }
    if (
      lowerUrl.includes("google.com/maps") ||
      lowerUrl.includes("maps.google") ||
      lowerUrl.includes("maps.app.goo.gl") ||
      lowerUrl.includes("goo.gl/maps")
    ) {
      return {
        icon: <MapPin className="w-4 h-4" />,
        iconBoxClass: "bg-[#1A73E8]/12 text-[#1A73E8]",
        buttonClass: "bg-[#1A73E8] hover:bg-[#1557B0] text-white",
        buttonLabel: "Google Map",
      };
    }
    return {
      icon: getCategoryIcon(category),
      iconBoxClass:
        category === "sns"
          ? "bg-[#E1306C]/12 text-[#E1306C]"
          : "bg-amber-500/12 text-amber-600 dark:text-amber-400",
      buttonClass: "bg-primary hover:bg-primary/90 text-primary-foreground",
      buttonLabel: "開く",
    };
  };

  const filteredLinks = links.filter((link) => {
    const matchesCategory = selectedCategory === "all" || link.category === selectedCategory;
    const matchesScope = selectedScope === "all" || link.scope === selectedScope;
    const matchesSearch =
      link.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (link.description && link.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      link.url.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesScope && matchesSearch;
  });

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="関連リンク集"
          subtitle="連盟・大会速報・施設予約・公式SNS"
          icon={
            <span className="w-8 h-8 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
              <Link2 className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【関連リンク集】${currentTeam?.name || "チーム"} 公式ポータル`,
            text: `連盟公式サイト、大会速報、雨雲レーダー、球場予約などのリンク一覧はこちらから確認できます`,
          }}
        />

        {/* 🏢 チーム全体 vs 👥 編成限定 スコープ切り替えタブ */}
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
            すべて ({links.length})
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
            <span>{currentTeam?.teamName || "編成"}</span>
          </button>
        </div>

        {/* 🔍 検索バー ＆ ➕ 追加ボタン (1行レイアウト) */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="サイト名やキーワードで検索..."
              className="w-full pl-9.5 pr-8 py-2.5 rounded-2xl bg-card border border-border text-xs placeholder:text-muted-foreground/70 focus:outline-hidden focus:ring-2 focus:ring-primary/40 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setIsCreateModalOpen(true);
              setSubmitError(null);
            }}
            className="h-10 px-3.5 rounded-2xl bg-primary text-primary-foreground font-black text-xs shadow-xs hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
            title="新しい関連リンクを追加"
          >
            <Plus className="w-4 h-4" />
            <span>追加</span>
          </button>
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
                className={`px-3 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                    : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>

        {/* 📋 リンク一覧セクションカード (A-3 Dark Solid Header Cap) */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center shrink-0">
                <Link2 className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-black text-white truncate">
                  {selectedCategory === "all"
                    ? "関連リンク一覧"
                    : `${categories.find((c) => c.id === selectedCategory)?.label || ""} のリンク`}
                </h2>
                <p className="text-[10px] font-bold text-slate-300 truncate">
                  公式サイト・大会速報・予約ポータルへ直接アクセス
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-[11px] font-black shrink-0">
              {filteredLinks.length}件
            </span>
          </div>

          <div className="p-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs font-bold">関連リンクを読み込み中...</span>
              </div>
            ) : filteredLinks.length === 0 ? (
              <div className="p-8 rounded-2xl border border-border bg-muted/20 text-center space-y-2">
                <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto" />
                <p className="text-xs font-black text-foreground">
                  該当する関連リンクが見つかりませんでした
                </p>
                <p className="text-[11px] text-muted-foreground">
                  検索条件を変更するか、新しいリンクを登録してください。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLinks.map((link) => {
                  const isOrg = link.scope === "organization";
                  const isImportant = !!link.isImportant;
                  const brandStyle = getLinkBrandStyle(link.url, link.category);

                  return (
                    <div
                      key={link.id}
                      className={`rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 transition-all duration-200 overflow-hidden ${
                        isImportant ? "border-l-4 border-l-amber-500" : ""
                      }`}
                    >
                      <div className="p-3.5 sm:p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            {link.imageUrl ? (
                              <div className="w-10 h-10 rounded-xl overflow-hidden border border-border bg-muted/35 shrink-0 flex items-center justify-center">
                                <img
                                  src={link.imageUrl}
                                  alt={link.title}
                                  loading="lazy"
                                  decoding="async"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${brandStyle.iconBoxClass}`}>
                                {brandStyle.icon}
                              </span>
                            )}

                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* 🔥 おすすめ/公式ピン留めバッジ */}
                                {isImportant && (
                                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[9.5px] font-black shrink-0 flex items-center gap-0.5">
                                    <Flame className="w-3 h-3" />
                                    <span>公式・推奨</span>
                                  </span>
                                )}

                                {/* スコープバッジ */}
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[9.5px] font-black shrink-0 ${
                                    isOrg
                                      ? "bg-primary/10 text-primary border border-primary/25"
                                      : "bg-muted text-muted-foreground border border-border"
                                  }`}
                                >
                                  {link.scopeLabel}
                                </span>

                                {/* カテゴリバッジ */}
                                <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[9.5px] font-black shrink-0">
                                  {link.categoryLabel}
                                </span>
                              </div>

                              <h3 className="text-xs sm:text-sm font-black text-foreground leading-snug">
                                {link.title}
                              </h3>
                            </div>
                          </div>

                          {/* 編集ボタン */}
                          <button
                            type="button"
                            onClick={(e) => openEditModal(link, e)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all shrink-0"
                            title="編集"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* 説明文 */}
                        {link.description && (
                          <p className="text-xs text-foreground/80 font-bold whitespace-pre-wrap leading-relaxed">
                            {link.description}
                          </p>
                        )}

                        {/* URL ＆ アクションボタン群 */}
                        <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={(e) => handleCopyUrl(link, e)}
                              className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-muted border border-border text-muted-foreground hover:text-foreground text-[11px] font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer"
                              title="URLをコピー"
                            >
                              {copiedId === link.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-emerald-700 dark:text-emerald-400 font-black">コピー済</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>URLコピー</span>
                                </>
                              )}
                            </button>
                            <span className="text-[10px] text-muted-foreground truncate font-mono">
                              {link.url.replace(/^https?:\/\//i, "")}
                            </span>
                          </div>

                          {/* 🌐 サイトを開くリンクボタン（外部サービスは公式ソリッドブランドカラー） */}
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shrink-0 active:scale-95 transition-all shadow-xs cursor-pointer ${brandStyle.buttonClass}`}
                          >
                            <span>{brandStyle.buttonLabel}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* ➕ 新規登録モーダル (ポータル描画) */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted && isCreateModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 animate-in fade-in duration-200">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xs overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center font-black">
                  <Link2 className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-white">関連リンクの登録</h3>
                  <p className="text-[10px] text-slate-300 font-bold">
                    連盟・大会速報・施設予約・公式SNS
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {submitError && (
                <div className="p-3 rounded-2xl bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleCreateLink} className="space-y-4 text-xs font-bold">
                {/* ⭐ 公式・推奨ピン留め選択 */}
                <div
                  onClick={() => setNewIsImportant(!newIsImportant)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                    newIsImportant
                      ? "bg-amber-500/12 border-amber-500/40 text-amber-700 dark:text-amber-300"
                      : "bg-muted/35 border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm font-black ${
                      newIsImportant ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"
                    }`}>
                      <Flame className="w-4 h-4" />
                    </span>
                    <div>
                      <span className="font-black text-xs text-foreground block">公式・推奨リンクに設定する</span>
                      <span className="text-[10px] text-muted-foreground font-bold block">
                        一覧の上部に優先表示され、推奨バッジが付きます
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={newIsImportant}
                    onChange={(e) => setNewIsImportant(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                </div>

                {/* スコープ選択 */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground">公開範囲</label>
                  <div className="grid grid-cols-2 gap-1 bg-muted/80 dark:bg-muted/50 p-1 rounded-2xl border border-border">
                    <button
                      type="button"
                      onClick={() => setNewScope("organization")}
                      className={`py-2 px-3 rounded-xl text-xs transition-all cursor-pointer ${
                        newScope === "organization"
                          ? "bg-card text-foreground shadow-sm border border-border font-black"
                          : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                      }`}
                    >
                      🏢 チーム全体（共通）
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewScope("team")}
                      className={`py-2 px-3 rounded-xl text-xs transition-all cursor-pointer ${
                        newScope === "team"
                          ? "bg-card text-foreground shadow-sm border border-border font-black"
                          : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                      }`}
                    >
                      👥 {currentTeam?.teamName || "この編成"} のみ
                    </button>
                  </div>
                </div>

                {/* カテゴリ選択 */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground">カテゴリ</label>
                  <LiffSelect
                    value={newCategory}
                    onChange={setNewCategory}
                    options={LINK_CATEGORY_OPTIONS}
                    title="リンクカテゴリを選択"
                    accent="amber"
                    searchable={false}
                    className="w-full"
                  />
                </div>

                {/* タイトル */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground">サイト名・リンク名</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="例: 全日本軟式野球連盟 (JSBB)"
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60"
                  />
                </div>

                {/* URL */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground">URL (リンク先)</label>
                  <input
                    type="url"
                    required
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60 font-mono text-[11px]"
                  />
                </div>

                {/* 説明文 */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground">概要・説明 (任意)</label>
                  <textarea
                    rows={3}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="リンク先の内容や用途について簡単に記載してください"
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60 leading-relaxed"
                  />
                </div>

                {/* 📷 ロゴ・画像添付エリア */}
                <div className="space-y-2 p-3 rounded-2xl bg-muted/35 border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-primary" />
                      <span>ロゴ・サムネイル画像 (任意)</span>
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
                    <div className="relative rounded-xl overflow-hidden border border-border bg-card max-h-32 flex items-center justify-center">
                      <img
                        src={newImageUrl}
                        alt="プレビュー"
                        loading="lazy"
                        decoding="async"
                        className="max-h-32 w-full object-contain"
                      />
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
                        className="w-full py-2.5 px-3 rounded-xl border border-dashed border-border hover:border-primary/40 bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        {isUploadingImage ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <span>アップロード中...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 text-primary" />
                            <span>ロゴ画像を選択</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground font-black text-xs transition-all cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newTitle.trim() || !newUrl.trim()}
                    className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-xs hover:bg-primary/90 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
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
          </div>
        </div>,
        document.body
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* ✏️ 編集・削除モーダル (ポータル描画) */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted && editingLink && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 animate-in fade-in duration-200">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xs overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center font-black">
                  <Pencil className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-white">関連リンクの編集</h3>
                  <p className="text-[10px] text-slate-300 font-bold">リンク情報の更新または削除</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingLink(null)}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {submitError && (
                <div className="p-3 rounded-2xl bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleUpdateLink} className="space-y-4 text-xs font-bold">
                {/* ⭐ 公式・推奨ピン留め選択 */}
                <div
                  onClick={() => setEditIsImportant(!editIsImportant)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                    editIsImportant
                      ? "bg-amber-500/12 border-amber-500/40 text-amber-700 dark:text-amber-300"
                      : "bg-muted/35 border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm font-black ${
                      editIsImportant ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"
                    }`}>
                      <Flame className="w-4 h-4" />
                    </span>
                    <div>
                      <span className="font-black text-xs text-foreground block">公式・推奨リンクに設定する</span>
                      <span className="text-[10px] text-muted-foreground font-bold block">
                        一覧の上部に優先表示され、推奨バッジが付きます
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={editIsImportant}
                    onChange={(e) => setEditIsImportant(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                </div>

                {/* スコープ選択 */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground">公開範囲</label>
                  <div className="grid grid-cols-2 gap-1 bg-muted/80 dark:bg-muted/50 p-1 rounded-2xl border border-border">
                    <button
                      type="button"
                      onClick={() => setEditScope("organization")}
                      className={`py-2 px-3 rounded-xl text-xs transition-all cursor-pointer ${
                        editScope === "organization"
                          ? "bg-card text-foreground shadow-sm border border-border font-black"
                          : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                      }`}
                    >
                      🏢 チーム全体（共通）
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditScope("team")}
                      className={`py-2 px-3 rounded-xl text-xs transition-all cursor-pointer ${
                        editScope === "team"
                          ? "bg-card text-foreground shadow-sm border border-border font-black"
                          : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                      }`}
                    >
                      👥 {currentTeam?.teamName || "この編成"} のみ
                    </button>
                  </div>
                </div>

                {/* カテゴリ選択 */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground">カテゴリ</label>
                  <LiffSelect
                    value={editCategory}
                    onChange={setEditCategory}
                    options={LINK_CATEGORY_OPTIONS}
                    title="リンクカテゴリを選択"
                    accent="amber"
                    searchable={false}
                    className="w-full"
                  />
                </div>

                {/* タイトル */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground">サイト名・リンク名</label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                {/* URL */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground">URL (リンク先)</label>
                  <input
                    type="url"
                    required
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 font-mono text-[11px]"
                  />
                </div>

                {/* 説明文 */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground">概要・説明 (任意)</label>
                  <textarea
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 leading-relaxed"
                  />
                </div>

                {/* 📷 ロゴ・画像添付エリア */}
                <div className="space-y-2 p-3 rounded-2xl bg-muted/35 border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-primary" />
                      <span>ロゴ・サムネイル画像 (任意)</span>
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
                    <div className="relative rounded-xl overflow-hidden border border-border bg-card max-h-32 flex items-center justify-center">
                      <img
                        src={editImageUrl}
                        alt="プレビュー"
                        loading="lazy"
                        decoding="async"
                        className="max-h-32 w-full object-contain"
                      />
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
                        className="w-full py-2.5 px-3 rounded-xl border border-dashed border-border hover:border-primary/40 bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        {isEditUploadingImage ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <span>アップロード中...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 text-primary" />
                            <span>ロゴ画像を選択</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={handleDeleteLink}
                    disabled={isDeleting}
                    className="px-3 py-2 rounded-xl border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>削除</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingLink(null)}
                      className="px-4 py-2.5 rounded-xl bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground font-black text-xs transition-all cursor-pointer"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !editTitle.trim() || !editUrl.trim()}
                      className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-xs hover:bg-primary/90 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
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
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
