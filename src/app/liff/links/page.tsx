// filepath: src/app/liff/links/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  LiffDataLoadErrorCard,
  useLiffAutoRetryOnResume,
} from "@/components/liff/LiffDataLoadErrorCard";
import {
  LiffSelect,
  type LiffSelectOption,
} from "@/components/liff/LiffSelect";
import { SubLinksEditorSection } from "@/components/liff/SubLinksEditorSection";
import { useLiff, useLiffPermissions } from "@/components/liff/LiffProvider";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";
import {
  createEmptySubLinkDraft,
  normalizeHttpUrlInput,
  toSubLinkDrafts,
  validateAndNormalizeSubLinksInput,
  type TeamSubLinkDraft,
  type TeamSubLinkItem,
} from "@/lib/liff/team-links-schema";
import { sanitizeSafeExternalHref, validateSafeHttpUrl } from "@/lib/utils";
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
  CornerDownRight,
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
  subLinks?: TeamSubLinkItem[];
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

const CATEGORY_SHORT_LABELS: Record<string, string> = {
  league: "連盟・協会",
  tournament: "大会・速報",
  sns: "公式SNS・HP",
  grounds: "球場・施設予約",
  weather: "天気・暑さ指数",
  partner: "提携・ショップ",
  other: "その他・お役立ち",
};

export default function LiffLinksPage() {
  const { currentTeam, profile } = useLiff();
  const { canEditSchedule, canManageTeam, isDemoMode } = useLiffPermissions();
  const effectiveCanEdit = canEditSchedule || canManageTeam || isDemoMode;

  const initialCachedLinks = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    const tid =
      currentTeam?.id ||
      localStorage.getItem("iscore_selectedTeamId") ||
      "demo-team";
    return peekLiffApiCache<{ success: boolean; links?: LinkItem[] }>(
      `/api/liff/links?teamId=${tid}`
    );
  }, [currentTeam?.id]);

  const [links, setLinks] = useState<LinkItem[]>(
    () => initialCachedLinks?.links ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => !initialCachedLinks?.links
  );
  const [loadError, setLoadError] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedScope, setSelectedScope] = useState<
    "all" | "organization" | "team"
  >("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 新規登録モーダル用ステート
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("league");
  const [newScope, setNewScope] = useState<"organization" | "team">(
    "organization"
  );
  const [newIsImportant, setNewIsImportant] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState<string>("");
  const [newSubLinks, setNewSubLinks] = useState<TeamSubLinkDraft[]>([]);
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
  const [editScope, setEditScope] = useState<"organization" | "team">(
    "organization"
  );
  const [editIsImportant, setEditIsImportant] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState<string>("");
  const [editSubLinks, setEditSubLinks] = useState<TeamSubLinkDraft[]>([]);
  const [isEditUploadingImage, setIsEditUploadingImage] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // サブリンク専用クイック追加・編集モーダル用ステート
  const [subLinkTarget, setSubLinkTarget] = useState<LinkItem | null>(null);
  const [quickSubLinks, setQuickSubLinks] = useState<TeamSubLinkDraft[]>([]);
  const [quickFocusSignal, setQuickFocusSignal] = useState<number>(0);

  const linksCountRef = useRef(links.length);
  linksCountRef.current = links.length;

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadLinks = useCallback(async () => {
    const teamId = currentTeam?.id || "demo-team";
    const cached = peekLiffApiCache<{ success: boolean; links?: LinkItem[] }>(
      `/api/liff/links?teamId=${teamId}`
    );
    if (cached?.links) {
      setLinks(cached.links);
      setIsLoading(false);
      setLoadError(false);
    } else if (linksCountRef.current === 0) {
      setIsLoading(true);
    }

    try {
      const res = await fetch(`/api/liff/links?teamId=${teamId}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        success: boolean;
        links?: LinkItem[];
      };
      if (data.success && Array.isArray(data.links)) {
        setLinks(data.links);
        setLoadError(false);
      } else if (linksCountRef.current === 0 && !cached?.links) {
        setLoadError(true);
      }
    } catch (err) {
      console.error("Failed to fetch links:", err);
      if (linksCountRef.current === 0 && !cached?.links) {
        setLoadError(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id]);

  useEffect(() => {
    setLoadError(false);
    const tid = currentTeam?.id || "demo-team";
    const cached = peekLiffApiCache<{ success: boolean; links?: LinkItem[] }>(
      `/api/liff/links?teamId=${tid}`
    );
    if (cached?.links) {
      setLinks(cached.links);
      setIsLoading(false);
    } else {
      setLinks([]);
      setIsLoading(true);
    }
    loadLinks();
  }, [currentTeam?.id, loadLinks]);

  useLiffAutoRetryOnResume(loadError && links.length === 0, loadLinks);

  // URL コピー処理（メインリンク・サブリンク共通）
  const handleCopyTextUrl = (
    copyKey: string,
    targetUrl: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(targetUrl);
    setCopiedKey(copyKey);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === copyKey ? null : prev));
    }, 2000);
  };

  // 画像アップロードハンドラー
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    isEdit: boolean
  ) => {
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

      const data = (await res.json()) as {
        success: boolean;
        imageUrl?: string;
        error?: string;
      };
      if (!data.success || !data.imageUrl) {
        throw new Error(data.error || "画像のアップロードに失敗しました");
      }

      if (isEdit) {
        setEditImageUrl(data.imageUrl);
      } else {
        setNewImageUrl(data.imageUrl);
      }
    } catch (err: unknown) {
      console.error("Image upload failed:", err);
      setSubmitError(
        err instanceof Error ? err.message : "画像のアップロードに失敗しました"
      );
    } finally {
      if (isEdit) setIsEditUploadingImage(false);
      else setIsUploadingImage(false);
    }
  };

  // 編集モーダルを開く
  const openEditModal = (link: LinkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!effectiveCanEdit || (!isDemoMode && link.id.startsWith("demo-"))) {
      return;
    }
    setEditingLink(link);
    setEditTitle(link.title);
    setEditUrl(link.url);
    setEditDescription(link.description || "");
    setEditCategory(link.category);
    setEditScope(link.scope);
    setEditIsImportant(!!link.isImportant);
    setEditImageUrl(link.imageUrl || "");
    setEditSubLinks(toSubLinkDrafts(link.subLinks));
    setSubmitError(null);
  };

  // カードから直接サブリンク追加・編集モーダルを開く
  const openSubLinkQuickModal = (link: LinkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!effectiveCanEdit || (!isDemoMode && link.id.startsWith("demo-"))) {
      return;
    }
    const existingDrafts = toSubLinkDrafts(link.subLinks);
    const initialDrafts =
      existingDrafts.length < 15
        ? [...existingDrafts, createEmptySubLinkDraft()]
        : existingDrafts;
    setSubLinkTarget(link);
    setQuickSubLinks(initialDrafts);
    setSubmitError(null);
    setQuickFocusSignal((prev) => prev + 1);
  };

  const refreshCachesAfterMutation = useCallback(async () => {
    invalidateLiffApiCache("/api/liff/links");
    invalidateLiffApiCache("/api/liff/team-info");
    await loadLinks();
  }, [loadLinks]);

  // 新規登録処理
  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveCanEdit || !newTitle.trim() || !newUrl.trim()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const teamId = currentTeam?.id || "demo-team";

      const candidateUrl = normalizeHttpUrlInput(newUrl);
      const createUrlCheck = validateSafeHttpUrl(candidateUrl, {
        allowEmpty: false,
      });
      if (!createUrlCheck.ok || !createUrlCheck.url) {
        throw new Error(
          createUrlCheck.ok ? "URLを入力してください" : createUrlCheck.error
        );
      }

      const subLinksCheck = validateAndNormalizeSubLinksInput(newSubLinks);
      if (!subLinksCheck.ok) {
        throw new Error(subLinksCheck.error);
      }

      const finalUrl = createUrlCheck.url;

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
          subLinks: subLinksCheck.subLinks,
          userId: profile?.userId,
        }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "リンクの登録に失敗しました");
      }

      if (teamId === "demo-team") {
        const demoNewItem: LinkItem = {
          id: `demo-custom-${Date.now()}`,
          title: newTitle.trim(),
          url: finalUrl,
          description: newDescription.trim(),
          category: newCategory,
          categoryLabel: CATEGORY_SHORT_LABELS[newCategory] || "その他",
          scope: newScope,
          scopeLabel:
            newScope === "organization"
              ? "チーム全体"
              : currentTeam?.teamName || "編成",
          priority: 0,
          isImportant: newIsImportant,
          imageUrl: newImageUrl.trim() || null,
          subLinks: subLinksCheck.subLinks,
        };
        setLinks((prev) => [demoNewItem, ...prev]);
      } else {
        await refreshCachesAfterMutation();
      }

      setIsCreateModalOpen(false);
      setNewTitle("");
      setNewUrl("");
      setNewDescription("");
      setNewIsImportant(false);
      setNewImageUrl("");
      setNewSubLinks([]);
    } catch (err: unknown) {
      console.error("Error creating link:", err);
      setSubmitError(
        err instanceof Error ? err.message : "リンクの登録に失敗しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 更新処理
  const handleUpdateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !effectiveCanEdit ||
      !editingLink ||
      !editTitle.trim() ||
      !editUrl.trim()
    ) {
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const teamId = currentTeam?.id || "demo-team";

      const candidateUrl = normalizeHttpUrlInput(editUrl);
      const updateUrlCheck = validateSafeHttpUrl(candidateUrl, {
        allowEmpty: false,
      });
      if (!updateUrlCheck.ok || !updateUrlCheck.url) {
        throw new Error(
          updateUrlCheck.ok ? "URLを入力してください" : updateUrlCheck.error
        );
      }

      const subLinksCheck = validateAndNormalizeSubLinksInput(editSubLinks);
      if (!subLinksCheck.ok) {
        throw new Error(subLinksCheck.error);
      }

      const finalUrl = updateUrlCheck.url;

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
          subLinks: subLinksCheck.subLinks,
        }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "リンクの更新に失敗しました");
      }

      if (teamId === "demo-team" || editingLink.id.startsWith("demo-")) {
        setLinks((prev) =>
          prev.map((item) =>
            item.id === editingLink.id
              ? {
                  ...item,
                  title: editTitle.trim(),
                  url: finalUrl,
                  description: editDescription.trim(),
                  category: editCategory,
                  categoryLabel:
                    CATEGORY_SHORT_LABELS[editCategory] || "その他",
                  scope: editScope,
                  scopeLabel:
                    editScope === "organization"
                      ? "チーム全体"
                      : currentTeam?.teamName || "編成",
                  isImportant: editIsImportant,
                  imageUrl: editImageUrl.trim() || null,
                  subLinks: subLinksCheck.subLinks,
                }
              : item
          )
        );
      } else {
        await refreshCachesAfterMutation();
      }

      setEditingLink(null);
    } catch (err: unknown) {
      console.error("Error updating link:", err);
      setSubmitError(
        err instanceof Error ? err.message : "リンクの更新に失敗しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // サブリンク専用クイック保存処理
  const handleSaveQuickSubLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveCanEdit || !subLinkTarget) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const teamId = currentTeam?.id || "demo-team";

      const subLinksCheck = validateAndNormalizeSubLinksInput(quickSubLinks);
      if (!subLinksCheck.ok) {
        throw new Error(subLinksCheck.error);
      }

      const res = await fetch(`/api/liff/links/${subLinkTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          subLinks: subLinksCheck.subLinks,
        }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "サブリンクの保存に失敗しました");
      }

      if (teamId === "demo-team" || subLinkTarget.id.startsWith("demo-")) {
        setLinks((prev) =>
          prev.map((item) =>
            item.id === subLinkTarget.id
              ? { ...item, subLinks: subLinksCheck.subLinks }
              : item
          )
        );
      } else {
        await refreshCachesAfterMutation();
      }

      setSubLinkTarget(null);
    } catch (err: unknown) {
      console.error("Error saving sub-links:", err);
      setSubmitError(
        err instanceof Error ? err.message : "サブリンクの保存に失敗しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 削除処理
  const handleDeleteLink = async () => {
    if (!editingLink || !effectiveCanEdit) return;
    if (
      !confirm(
        `このリンク（${editingLink.title.slice(0, 20)}...）を削除してもよろしいですか？`
      )
    ) {
      return;
    }

    try {
      setIsDeleting(true);
      setSubmitError(null);
      const teamId = currentTeam?.id || "demo-team";

      const res = await fetch(
        `/api/liff/links/${encodeURIComponent(editingLink.id)}?teamId=${encodeURIComponent(teamId)}`,
        {
          method: "DELETE",
        }
      );

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "リンクの削除に失敗しました");
      }

      if (teamId === "demo-team" || editingLink.id.startsWith("demo-")) {
        setLinks((prev) => prev.filter((item) => item.id !== editingLink.id));
      } else {
        await refreshCachesAfterMutation();
      }

      setEditingLink(null);
    } catch (err: unknown) {
      console.error("Error deleting link:", err);
      setSubmitError(
        err instanceof Error ? err.message : "リンクの削除に失敗しました"
      );
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
        subIcon: <Play className="w-3.5 h-3.5 fill-current" />,
        iconBoxClass: "bg-[#FF0000]/12 text-[#FF0000]",
        buttonClass: "bg-[#FF0000] hover:bg-[#CC0000] text-white",
        buttonLabel: "YouTube",
      };
    }
    if (lowerUrl.includes("line.me")) {
      return {
        icon: <Share2 className="w-4 h-4" />,
        subIcon: <Share2 className="w-3.5 h-3.5" />,
        iconBoxClass: "bg-[#06C755]/12 text-[#06C755]",
        buttonClass: "bg-[#06C755] hover:bg-[#05b34c] text-white",
        buttonLabel: "LINE",
      };
    }
    if (lowerUrl.includes("instagram.com")) {
      return {
        icon: <InstagramIcon className="w-4 h-4" />,
        subIcon: <InstagramIcon className="w-3.5 h-3.5" />,
        iconBoxClass: "bg-[#E1306C]/12 text-[#E1306C]",
        buttonClass: "bg-[#E1306C] hover:bg-[#C1275C] text-white",
        buttonLabel: "Instagram",
      };
    }
    if (lowerUrl.includes("x.com/") || lowerUrl.includes("twitter.com/")) {
      return {
        icon: <Globe className="w-4 h-4" />,
        subIcon: <Globe className="w-3.5 h-3.5" />,
        iconBoxClass:
          "bg-slate-900/12 text-slate-900 dark:bg-slate-100/15 dark:text-slate-100",
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
        subIcon: <MapPin className="w-3.5 h-3.5" />,
        iconBoxClass: "bg-[#1A73E8]/12 text-[#1A73E8]",
        buttonClass: "bg-[#1A73E8] hover:bg-[#1557B0] text-white",
        buttonLabel: "Google Map",
      };
    }
    return {
      icon: getCategoryIcon(category),
      subIcon: <CornerDownRight className="w-3.5 h-3.5" />,
      iconBoxClass:
        category === "sns"
          ? "bg-[#E1306C]/12 text-[#E1306C]"
          : "bg-amber-500/12 text-amber-600 dark:text-amber-400",
      buttonClass: "bg-primary hover:bg-primary/90 text-primary-foreground",
      buttonLabel: "開く",
    };
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredLinks = links.filter((link) => {
    const matchesCategory =
      selectedCategory === "all" || link.category === selectedCategory;
    const matchesScope =
      selectedScope === "all" || link.scope === selectedScope;
    if (!normalizedQuery) {
      return matchesCategory && matchesScope;
    }

    const matchesMain =
      link.title.toLowerCase().includes(normalizedQuery) ||
      (link.description &&
        link.description.toLowerCase().includes(normalizedQuery)) ||
      link.url.toLowerCase().includes(normalizedQuery);

    const matchesSub = (link.subLinks ?? []).some(
      (sub) =>
        sub.title.toLowerCase().includes(normalizedQuery) ||
        (sub.note && sub.note.toLowerCase().includes(normalizedQuery)) ||
        sub.url.toLowerCase().includes(normalizedQuery)
    );

    return matchesCategory && matchesScope && (matchesMain || matchesSub);
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
              placeholder="サイト名・サブリンク名で検索..."
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

          {effectiveCanEdit && (
            <button
              type="button"
              onClick={() => {
                setNewSubLinks([]);
                setSubmitError(null);
                setIsCreateModalOpen(true);
              }}
              className="h-10 px-3.5 rounded-2xl bg-primary text-primary-foreground font-black text-xs shadow-xs hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
              title="新しい関連リンクを追加"
            >
              <Plus className="w-4 h-4" />
              <span>追加</span>
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
                  公式サイト・大会速報・下層サブリンクへ1タップでアクセス
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-[11px] font-black shrink-0">
              {filteredLinks.length}件
            </span>
          </div>

          <div className="p-4">
            {isLoading && links.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs font-bold">
                  関連リンクを読み込み中...
                </span>
              </div>
            ) : loadError && links.length === 0 ? (
              <LiffDataLoadErrorCard
                onRetry={loadLinks}
                isRetrying={isLoading}
              />
            ) : filteredLinks.length === 0 ? (
              <div className="p-8 rounded-2xl border border-border bg-muted/20 text-center space-y-2">
                <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto" />
                <p className="text-xs font-black text-foreground">
                  該当する関連リンクが見つかりませんでした
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {effectiveCanEdit
                    ? "検索条件を変更するか、新しいリンクを登録してください。"
                    : "検索条件やカテゴリを変更して再度ご確認ください。"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLinks.map((link) => {
                  const isOrg = link.scope === "organization";
                  const isImportant = !!link.isImportant;
                  const brandStyle = getLinkBrandStyle(link.url, link.category);
                  const subLinks = link.subLinks ?? [];
                  const canEditThisLink =
                    effectiveCanEdit &&
                    (isDemoMode || !link.id.startsWith("demo-"));
                  const mainCopyKey = `main:${link.id}`;

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
                              <span
                                className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${brandStyle.iconBoxClass}`}
                              >
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
                          {canEditThisLink && (
                            <button
                              type="button"
                              onClick={(e) => openEditModal(link, e)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all shrink-0 cursor-pointer"
                              title="リンクを編集"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
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
                              onClick={(e) =>
                                handleCopyTextUrl(mainCopyKey, link.url, e)
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-muted border border-border text-muted-foreground hover:text-foreground text-[11px] font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer"
                              title="URLをコピー"
                            >
                              {copiedKey === mainCopyKey ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-emerald-700 dark:text-emerald-400 font-black">
                                    コピー済
                                  </span>
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
                            href={sanitizeSafeExternalHref(link.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shrink-0 active:scale-95 transition-all shadow-xs cursor-pointer ${brandStyle.buttonClass}`}
                          >
                            <span>{brandStyle.buttonLabel}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      {/* ━━━ サブリンク常時コンパクト一覧（1タップ直接起動） ━━━ */}
                      {subLinks.length > 0 ? (
                        <div className="border-t border-border bg-muted/30 px-3.5 py-2.5 sm:px-4 sm:py-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <CornerDownRight className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span className="text-[11px] font-black text-foreground">
                                サブリンク
                              </span>
                              <span className="px-1.5 py-0.5 rounded-md bg-card border border-border text-[9.5px] font-black text-muted-foreground shrink-0">
                                {subLinks.length}件
                              </span>
                            </div>

                            {canEditThisLink && (
                              <button
                                type="button"
                                onClick={(e) => openSubLinkQuickModal(link, e)}
                                className="px-2 py-1 rounded-lg bg-card hover:bg-muted border border-border text-[10.5px] font-black text-primary flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                                title="サブリンクを追加・編集"
                              >
                                <Plus className="w-3 h-3" />
                                <span>追加・編集</span>
                              </button>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            {subLinks.map((sub) => {
                              const subBrand = getLinkBrandStyle(
                                sub.url,
                                link.category
                              );
                              const subCopyKey = `sub:${link.id}:${sub.id}`;

                              return (
                                <div
                                  key={sub.id}
                                  className="rounded-xl border border-border bg-card hover:border-primary/45 transition-colors flex items-center gap-1.5 p-1.5 pl-2.5 shadow-2xs"
                                >
                                  <a
                                    href={sanitizeSafeExternalHref(sub.url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2.5 min-w-0 flex-1 py-0.5 group cursor-pointer"
                                  >
                                    <span
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${subBrand.iconBoxClass}`}
                                    >
                                      {subBrand.subIcon}
                                    </span>

                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-black text-foreground group-hover:text-primary transition-colors leading-snug break-words">
                                        {sub.title}
                                      </p>
                                      {sub.note ? (
                                        <p className="text-[10.5px] font-bold text-muted-foreground leading-snug break-words mt-0.5">
                                          {sub.note}
                                        </p>
                                      ) : (
                                        <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                                          {sub.url.replace(/^https?:\/\//i, "")}
                                        </p>
                                      )}
                                    </div>

                                    <span
                                      className={`px-2.5 py-1 rounded-lg text-[10.5px] font-black flex items-center gap-1 shrink-0 active:scale-95 transition-transform ${subBrand.buttonClass}`}
                                    >
                                      <span>{subBrand.buttonLabel}</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </span>
                                  </a>

                                  <button
                                    type="button"
                                    onClick={(e) =>
                                      handleCopyTextUrl(subCopyKey, sub.url, e)
                                    }
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 cursor-pointer"
                                    title="サブリンクのURLをコピー"
                                  >
                                    {copiedKey === subCopyKey ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : canEditThisLink ? (
                        <div className="border-t border-dashed border-border bg-muted/20 px-3.5 py-2 flex items-center justify-between gap-2">
                          <span className="text-[10.5px] font-bold text-muted-foreground flex items-center gap-1 min-w-0 truncate">
                            <CornerDownRight className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="truncate">
                              大会日程・トーナメント表等のサブリンクを追加可能
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => openSubLinkQuickModal(link, e)}
                            className="px-2.5 py-1 rounded-lg bg-card hover:bg-muted border border-border text-[10.5px] font-black text-primary flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>サブリンク追加</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* ➕ 新規登録モーダル (ポータル描画) */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted &&
        isCreateModalOpen &&
        createPortal(
          <div
            onClick={() => !isSubmitting && setIsCreateModalOpen(false)}
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 animate-in fade-in duration-200"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xs overflow-hidden max-h-[88dvh] sm:max-h-[90dvh] flex flex-col"
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center font-black">
                    <Link2 className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-white">
                      関連リンクの登録
                    </h3>
                    <p className="text-[10px] text-slate-300 font-bold">
                      メインリンクと下層サブリンクをまとめて登録できます
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                onSubmit={handleCreateLink}
                className="flex flex-col flex-1 min-h-0 text-xs font-bold"
              >
                <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
                  {submitError && (
                    <div className="p-3 rounded-2xl bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

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
                      <span
                        className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm font-black ${
                          newIsImportant
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Flame className="w-4 h-4" />
                      </span>
                      <div>
                        <span className="font-black text-xs text-foreground block">
                          公式・推奨リンクに設定する
                        </span>
                        <span className="text-[10px] text-muted-foreground font-bold block">
                          一覧の上部に優先表示され、推奨バッジが付きます
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={newIsImportant}
                      onChange={(e) => setNewIsImportant(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded accent-primary"
                    />
                  </div>

                  {/* スコープ選択 */}
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground block">
                      公開範囲
                    </label>
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
                    <label className="text-muted-foreground block">
                      カテゴリ
                    </label>
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
                    <label className="text-muted-foreground block">
                      メインサイト名・リンク名
                    </label>
                    <input
                      type="text"
                      required
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="例: 〇〇市軟式野球連盟 公式サイト"
                      className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60"
                    />
                  </div>

                  {/* URL */}
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground block">
                      メインURL (リンク先)
                    </label>
                    <input
                      type="text"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      required
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60 font-mono text-[11px]"
                    />
                  </div>

                  {/* 説明文 */}
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground block">
                      概要・説明 (任意)
                    </label>
                    <textarea
                      rows={2}
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="リンク先の内容や用途について簡単に記載してください"
                      className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60 leading-relaxed"
                    />
                  </div>

                  {/* 🌿 サブリンク編集エリア */}
                  <SubLinksEditorSection
                    drafts={newSubLinks}
                    onChange={setNewSubLinks}
                    disabled={isSubmitting}
                  />

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
                          className="text-[10px] text-destructive hover:underline font-bold cursor-pointer"
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
                </div>

                <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-4 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground font-black text-xs transition-all cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isSubmitting || !newTitle.trim() || !newUrl.trim()
                    }
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
          </div>,
          document.body
        )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* ✏️ 編集・削除モーダル (ポータル描画) */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted &&
        editingLink &&
        createPortal(
          <div
            onClick={() =>
              !isSubmitting && !isDeleting && setEditingLink(null)
            }
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 animate-in fade-in duration-200"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xs overflow-hidden max-h-[88dvh] sm:max-h-[90dvh] flex flex-col"
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center font-black">
                    <Pencil className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-white">
                      関連リンクの編集
                    </h3>
                    <p className="text-[10px] text-slate-300 font-bold">
                      メインリンク・サブリンクの更新または削除
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingLink(null)}
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                onSubmit={handleUpdateLink}
                className="flex flex-col flex-1 min-h-0 text-xs font-bold"
              >
                <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
                  {submitError && (
                    <div className="p-3 rounded-2xl bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

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
                      <span
                        className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm font-black ${
                          editIsImportant
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Flame className="w-4 h-4" />
                      </span>
                      <div>
                        <span className="font-black text-xs text-foreground block">
                          公式・推奨リンクに設定する
                        </span>
                        <span className="text-[10px] text-muted-foreground font-bold block">
                          一覧の上部に優先表示され、推奨バッジが付きます
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={editIsImportant}
                      onChange={(e) => setEditIsImportant(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded accent-primary"
                    />
                  </div>

                  {/* スコープ選択 */}
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground block">
                      公開範囲
                    </label>
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
                    <label className="text-muted-foreground block">
                      カテゴリ
                    </label>
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
                    <label className="text-muted-foreground block">
                      メインサイト名・リンク名
                    </label>
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
                    <label className="text-muted-foreground block">
                      メインURL (リンク先)
                    </label>
                    <input
                      type="text"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      required
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 font-mono text-[11px]"
                    />
                  </div>

                  {/* 説明文 */}
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground block">
                      概要・説明 (任意)
                    </label>
                    <textarea
                      rows={2}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 leading-relaxed"
                    />
                  </div>

                  {/* 🌿 サブリンク編集エリア */}
                  <SubLinksEditorSection
                    drafts={editSubLinks}
                    onChange={setEditSubLinks}
                    disabled={isSubmitting || isDeleting}
                  />

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
                          className="text-[10px] text-destructive hover:underline font-bold cursor-pointer"
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
                </div>

                <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-4 border-t border-border bg-card flex items-center justify-between shrink-0">
                  <button
                    type="button"
                    onClick={handleDeleteLink}
                    disabled={isDeleting || isSubmitting}
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
                      disabled={
                        isSubmitting || !editTitle.trim() || !editUrl.trim()
                      }
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
          </div>,
          document.body
        )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* 🌿 サブリンク専用クイック追加・整理モーダル (ポータル描画) */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted &&
        subLinkTarget &&
        createPortal(
          <div
            onClick={() => !isSubmitting && setSubLinkTarget(null)}
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 animate-in fade-in duration-200"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xs overflow-hidden max-h-[88dvh] sm:max-h-[90dvh] flex flex-col"
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between shrink-0 gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center font-black shrink-0">
                    <CornerDownRight className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-white truncate">
                      サブリンクの登録・編集
                    </h3>
                    <p className="text-[10px] text-slate-300 font-bold truncate">
                      対象: {subLinkTarget.title}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSubLinkTarget(null)}
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-all shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                onSubmit={handleSaveQuickSubLinks}
                className="flex flex-col flex-1 min-h-0 text-xs font-bold"
              >
                <div className="p-4 sm:p-5 space-y-3 overflow-y-auto flex-1 min-h-0">
                  {submitError && (
                    <div className="p-3 rounded-2xl bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <SubLinksEditorSection
                    drafts={quickSubLinks}
                    onChange={setQuickSubLinks}
                    disabled={isSubmitting}
                    focusLatestSignal={quickFocusSignal}
                  />
                </div>

                <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-4 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSubLinkTarget(null)}
                    className="px-4 py-2.5 rounded-xl bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground font-black text-xs transition-all cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-xs hover:bg-primary/90 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>保存中...</span>
                      </>
                    ) : (
                      <span>サブリンクを保存</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
