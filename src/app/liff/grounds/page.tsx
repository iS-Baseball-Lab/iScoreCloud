// filepath: src/app/liff/grounds/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  LiffSelect,
  type LiffSelectOption,
} from "@/components/liff/LiffSelect";
import { useLiff } from "@/components/liff/LiffProvider";
import { invalidateLiffApiCache, peekLiffApiCache } from "@/lib/liff/api-cache";
import type {
  GroundAiLookupResult,
  GroundVenueCategory,
} from "@/api/liff/grounds-ai";
import {
  MapPin,
  Navigation,
  Car,
  AlertTriangle,
  Info,
  ExternalLink,
  Loader2,
  Building2,
  Home,
  Trophy,
  School,
  Dumbbell,
  Search,
  X,
  Copy,
  Check,
  Compass,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

interface VenueInfo {
  id: string;
  name: string;
  shortName: string;
  category?: string;
  categoryLabel?: string;
  address: string;
  mapUrl: string;
  surface: string;
  spikeRule: string;
  parkingInfo: string;
  notes: string;
}

const VENUE_CATEGORY_OPTIONS: ReadonlyArray<LiffSelectOption> = [
  { value: "stadium", label: "🏆 球場・公営" },
  { value: "home", label: "🏠 本拠地・ホーム" },
  { value: "school", label: "🏫 学校・地域" },
  { value: "indoor", label: "🏋️ 室内・練習場" },
];

const VENUE_SURFACE_OPTIONS: ReadonlyArray<LiffSelectOption> = [
  { value: "土 (クレー)", label: "土 (クレー)" },
  { value: "人工芝", label: "人工芝 (全面)" },
  { value: "天然芝", label: "天然芝" },
  { value: "土 (内野) / 天然芝 (外野)", label: "土 (内野) / 天然芝 (外野)" },
  { value: "その他", label: "その他" },
];

const CATEGORIES = [
  { id: "all", label: "すべて", icon: Building2 },
  { id: "home", label: "本拠地・ホーム", icon: Home },
  { id: "stadium", label: "球場・公営", icon: Trophy },
  { id: "school", label: "学校・地域", icon: School },
  { id: "indoor", label: "室内・練習場", icon: Dumbbell },
] as const;

type AiFieldKey =
  | "name"
  | "shortName"
  | "category"
  | "surface"
  | "address"
  | "mapUrl"
  | "parkingInfo"
  | "spikeRule"
  | "notes";

const AI_FIELD_LABELS: Record<AiFieldKey, string> = {
  name: "施設・球場名",
  shortName: "表示用の略称",
  category: "施設分類",
  surface: "グラウンド状態",
  address: "所在地・住所",
  mapUrl: "Google Map URL",
  parkingInfo: "駐車場ルール & 台数制限",
  spikeRule: "スパイク規定",
  notes: "施設設備・諸注意メモ",
};

const AI_FIELD_ORDER: ReadonlyArray<AiFieldKey> = [
  "name",
  "shortName",
  "category",
  "surface",
  "address",
  "mapUrl",
  "parkingInfo",
  "spikeRule",
  "notes",
];

const PLACEHOLDER_ADDRESS_TEXT = "住所未登録";
const PLACEHOLDER_PARKING_TEXTS = new Set([
  "駐車場ルールは管理者にお問い合わせください",
  "駐車場ルールは管理者にお問い合わせください。",
]);
const DEFAULT_SPIKE_RULE_TEXT = "ポイントスパイクまたはトレーニングシューズ";

function stripPostalPrefix(addr: string): string {
  return addr
    .trim()
    .replace(/^〒?\s*[0-9０-９]{3}[-ー－―‐−]?[0-9０-９]{4}\s*/, "")
    .trim();
}

function isPostalCodeOnlyUpgrade(curAddr: string, aiAddr: string): boolean {
  const curTrimmed = curAddr.trim();
  const aiTrimmed = aiAddr.trim();
  if (!curTrimmed || !aiTrimmed) return false;
  const curHasPostal = /^〒?\s*[0-9０-９]{3}[-ー－―‐−]?[0-9０-９]{4}/.test(curTrimmed);
  const aiHasPostal = /^〒\d{3}-\d{4}\s+/.test(aiTrimmed);
  if (curHasPostal || !aiHasPostal) return false;
  return stripPostalPrefix(curTrimmed) === stripPostalPrefix(aiTrimmed);
}

function getCategoryOptionLabel(cat: GroundVenueCategory | string): string {
  const found = VENUE_CATEGORY_OPTIONS.find((opt) => opt.value === cat);
  return found ? found.label : cat;
}

export default function LiffGroundsPage() {
  const { currentTeam } = useLiff();
  const initialCachedGrounds = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    const tid =
      currentTeam?.id ||
      localStorage.getItem("iscore_selectedTeamId") ||
      "demo-team";
    return peekLiffApiCache<{ success: boolean; venues?: VenueInfo[] }>(
      `/api/liff/grounds?teamId=${tid}`
    );
  }, [currentTeam?.id]);

  const [venues, setVenues] = useState<VenueInfo[]>(
    () => initialCachedGrounds?.venues ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => !initialCachedGrounds?.venues
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // モーダル管理ステート
  const [mounted, setMounted] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<VenueInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VenueInfo | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // フォーム用ステート
  const [formName, setFormName] = useState("");
  const [formShortName, setFormShortName] = useState("");
  const [formCategory, setFormCategory] = useState<string>("stadium");
  const [formSurface, setFormSurface] = useState<string>("土 (クレー)");
  const [formAddress, setFormAddress] = useState("");
  const [formMapUrl, setFormMapUrl] = useState("");
  const [formParkingInfo, setFormParkingInfo] = useState("");
  const [formSpikeRule, setFormSpikeRule] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // AI自動取得・反映チェックリスト用ステート
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [isAiQueryManuallyEdited, setIsAiQueryManuallyEdited] = useState(false);
  const [aiAreaHint, setAiAreaHint] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiCandidate, setAiCandidate] = useState<GroundAiLookupResult | null>(
    null
  );
  const [aiCheckedFields, setAiCheckedFields] = useState<
    Record<AiFieldKey, boolean>
  >({
    name: false,
    shortName: false,
    category: false,
    surface: false,
    address: false,
    mapUrl: false,
    parkingInfo: false,
    spikeRule: false,
    notes: false,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadGrounds = useCallback(async () => {
    try {
      const teamId = currentTeam?.id || "demo-team";
      const url = `/api/liff/grounds?teamId=${teamId}`;
      const cached = peekLiffApiCache<{ success: boolean; venues?: VenueInfo[] }>(url);
      if (cached?.venues) {
        setVenues(cached.venues);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; venues?: VenueInfo[] };
        if (data.venues && data.venues.length > 0) {
          setVenues(data.venues);
        }
      }
    } catch (err) {
      console.error("Failed to fetch grounds:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id]);

  useEffect(() => {
    loadGrounds();
  }, [loadGrounds]);

  const getCurrentFieldValue = useCallback(
    (key: AiFieldKey): string => {
      switch (key) {
        case "name":
          return formName.trim();
        case "shortName":
          return formShortName.trim();
        case "category":
          return formCategory;
        case "surface":
          return formSurface.trim();
        case "address":
          return formAddress.trim();
        case "mapUrl":
          return formMapUrl.trim();
        case "parkingInfo":
          return formParkingInfo.trim();
        case "spikeRule":
          return formSpikeRule.trim();
        case "notes":
          return formNotes.trim();
      }
    },
    [
      formAddress,
      formCategory,
      formMapUrl,
      formName,
      formNotes,
      formParkingInfo,
      formShortName,
      formSpikeRule,
      formSurface,
    ]
  );

  const isFieldEmptyOrDefault = useCallback(
    (key: AiFieldKey): boolean => {
      const cur = getCurrentFieldValue(key);
      if (!cur) return true;
      switch (key) {
        case "name":
          return false;
        case "shortName":
          return cur === formName.trim();
        case "category":
          return !editingVenue;
        case "surface":
          return cur === "土 (クレー)";
        case "address":
          return cur === PLACEHOLDER_ADDRESS_TEXT;
        case "mapUrl":
          return cur.startsWith("https://maps.google.com/?q=");
        case "parkingInfo":
          return PLACEHOLDER_PARKING_TEXTS.has(cur);
        case "spikeRule":
          return cur === DEFAULT_SPIKE_RULE_TEXT;
        case "notes":
          return false;
      }
    },
    [editingVenue, formName, getCurrentFieldValue]
  );

  const buildInitialAiChecks = useCallback(
    (
      candidate: GroundAiLookupResult,
      mode: "safe_empty_only" | "all_available"
    ): Record<AiFieldKey, boolean> => {
      const next: Record<AiFieldKey, boolean> = {
        name: false,
        shortName: false,
        category: false,
        surface: false,
        address: false,
        mapUrl: false,
        parkingInfo: false,
        spikeRule: false,
        notes: false,
      };
      for (const key of AI_FIELD_ORDER) {
        const aiVal = candidate[key]?.trim() || "";
        if (!aiVal) {
          next[key] = false;
          continue;
        }
        const curVal = getCurrentFieldValue(key);
        if (aiVal === curVal) {
          next[key] = false;
          continue;
        }
        if (mode === "all_available") {
          next[key] = true;
        } else if (
          key === "address" &&
          isPostalCodeOnlyUpgrade(curVal, aiVal)
        ) {
          next[key] = true;
        } else {
          next[key] = isFieldEmptyOrDefault(key);
        }
      }
      return next;
    },
    [getCurrentFieldValue, isFieldEmptyOrDefault]
  );

  // 新規登録モーダルを開く
  const handleOpenCreate = () => {
    setEditingVenue(null);
    setFormName("");
    setFormShortName("");
    setFormCategory("stadium");
    setFormSurface("土 (クレー)");
    setFormAddress("");
    setFormMapUrl("");
    setFormParkingInfo("");
    setFormSpikeRule(DEFAULT_SPIKE_RULE_TEXT);
    setFormNotes("");
    setAiSearchQuery("");
    setIsAiQueryManuallyEdited(false);
    setAiAreaHint("");
    setAiCandidate(null);
    setIsModalOpen(true);
  };

  // 編集モーダルを開く
  const handleOpenEdit = (venue: VenueInfo) => {
    setEditingVenue(venue);
    const cleanAddr =
      venue.address && venue.address !== PLACEHOLDER_ADDRESS_TEXT
        ? venue.address
        : "";
    const cleanParking =
      venue.parkingInfo && !PLACEHOLDER_PARKING_TEXTS.has(venue.parkingInfo)
        ? venue.parkingInfo
        : "";
    setFormName(venue.name);
    setFormShortName(venue.shortName || "");
    setFormCategory(venue.category || "stadium");
    setFormSurface(venue.surface || "土 (クレー)");
    setFormAddress(cleanAddr);
    setFormMapUrl(venue.mapUrl || "");
    setFormParkingInfo(cleanParking);
    setFormSpikeRule(venue.spikeRule || "");
    setFormNotes(venue.notes || "");
    setAiSearchQuery(venue.name);
    setIsAiQueryManuallyEdited(false);
    setAiAreaHint("");
    setAiCandidate(null);
    setIsModalOpen(true);
  };

  // ✨ AIによる施設情報の自動検索・プレビュー生成（同名・近隣候補からの1タップ再検索にも対応）
  const handleAiLookup = async (
    overrideName?: string,
    overrideAreaHint?: string
  ) => {
    const targetName = (
      overrideName ?? (aiSearchQuery.trim() || formName.trim())
    ).trim();
    const resolvedAreaHint = (overrideAreaHint ?? aiAreaHint).trim();
    if (!targetName) {
      toast.error("検索する「施設・球場名」を入力してからAI取得を押してください");
      return;
    }

    if (overrideName !== undefined) {
      setAiSearchQuery(overrideName);
      setIsAiQueryManuallyEdited(true);
    } else if (!aiSearchQuery.trim()) {
      setAiSearchQuery(targetName);
    }
    if (!formName.trim()) {
      setFormName(targetName);
    }
    if (overrideAreaHint !== undefined) {
      setAiAreaHint(overrideAreaHint);
    }

    try {
      setIsAiLoading(true);
      const isSwitchingAlternative = overrideName !== undefined;
      const res = await fetch("/api/liff/grounds/ai-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: targetName,
          areaHint: resolvedAreaHint || undefined,
          currentCategory: formCategory,
          currentAddress: isSwitchingAlternative
            ? undefined
            : formAddress.trim() || undefined,
          currentShortName: isSwitchingAlternative
            ? undefined
            : formShortName.trim() || undefined,
          teamId: currentTeam?.id || "demo-team",
        }),
      });

      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        candidate?: GroundAiLookupResult;
      };

      if (!res.ok || !data.success || !data.candidate) {
        throw new Error(data.error || "施設情報の取得に失敗しました");
      }

      setAiCandidate(data.candidate);
      setAiCheckedFields(
        buildInitialAiChecks(
          data.candidate,
          editingVenue ? "safe_empty_only" : "all_available"
        )
      );
      toast.success("AIで施設情報を取得しました。反映する項目を確認してください");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "施設情報のAI取得に失敗しました";
      toast.error(msg);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleToggleAiField = (key: AiFieldKey) => {
    setAiCheckedFields((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelectAiMode = (mode: "safe_empty_only" | "all_available") => {
    if (!aiCandidate) return;
    setAiCheckedFields(buildInitialAiChecks(aiCandidate, mode));
  };

  const handleApplyAiCandidate = () => {
    if (!aiCandidate) return;
    let appliedCount = 0;

    if (aiCheckedFields.name && aiCandidate.name) {
      setFormName(aiCandidate.name);
      if (!isAiQueryManuallyEdited) {
        setAiSearchQuery(aiCandidate.name);
      }
      appliedCount += 1;
    }
    if (aiCheckedFields.shortName && aiCandidate.shortName) {
      setFormShortName(aiCandidate.shortName);
      appliedCount += 1;
    }
    if (aiCheckedFields.category && aiCandidate.category) {
      setFormCategory(aiCandidate.category);
      appliedCount += 1;
    }
    if (aiCheckedFields.surface && aiCandidate.surface) {
      setFormSurface(aiCandidate.surface);
      appliedCount += 1;
    }
    if (aiCheckedFields.address && aiCandidate.address) {
      setFormAddress(aiCandidate.address);
      appliedCount += 1;
    }
    if (aiCheckedFields.mapUrl && aiCandidate.mapUrl) {
      setFormMapUrl(aiCandidate.mapUrl);
      appliedCount += 1;
    }
    if (aiCheckedFields.parkingInfo && aiCandidate.parkingInfo) {
      setFormParkingInfo(aiCandidate.parkingInfo);
      appliedCount += 1;
    }
    if (aiCheckedFields.spikeRule && aiCandidate.spikeRule) {
      setFormSpikeRule(aiCandidate.spikeRule);
      appliedCount += 1;
    }
    if (aiCheckedFields.notes && aiCandidate.notes) {
      setFormNotes(aiCandidate.notes);
      appliedCount += 1;
    }

    setAiCandidate(null);
    if (appliedCount > 0) {
      toast.success(
        `${appliedCount}項目をフォームにセットしました。内容を確認して保存してください`
      );
    } else {
      toast.info("反映する項目が選択されていませんでした");
    }
  };

  // 登録・更新の実行
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error("球場・施設名を入力してください");
      return;
    }

    try {
      setIsSubmitting(true);
      const teamId = currentTeam?.id || "demo-team";
      const payload = {
        name: formName.trim(),
        shortName: formShortName.trim() || formName.trim(),
        category: formCategory,
        surface: formSurface.trim(),
        address: formAddress.trim(),
        mapUrl: formMapUrl.trim() || undefined,
        parkingInfo: formParkingInfo.trim(),
        spikeRule: formSpikeRule.trim(),
        notes: formNotes.trim(),
        teamId,
      };

      if (editingVenue) {
        // 編集・更新
        const res = await fetch(`/api/liff/grounds/${editingVenue.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as { success: boolean; error?: string };
        if (!data.success) throw new Error(data.error || "更新に失敗しました");

        toast.success("球場・施設情報を更新しました");
      } else {
        // 新規登録
        const res = await fetch(`/api/liff/grounds`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as { success: boolean; error?: string };
        if (!data.success) throw new Error(data.error || "登録に失敗しました");

        toast.success("新しい球場・施設を登録しました");
      }

      invalidateLiffApiCache();
      setIsModalOpen(false);
      setAiCandidate(null);
      await loadGrounds();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 削除の実行
  const handleDeleteVenue = async () => {
    if (!deleteTarget) return;

    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/liff/grounds/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error || "削除に失敗しました");

      invalidateLiffApiCache();
      toast.success("球場・施設を削除しました");
      setDeleteTarget(null);
      await loadGrounds();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 住所のクリップボードコピー
  const handleCopyAddress = (id: string, address: string) => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedId(id);
    toast.success("住所をコピーしました");
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2000);
  };

  // 各カテゴリの件数集計
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: venues.length };
    venues.forEach((v) => {
      const cat = v.category || "stadium";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [venues]);

  // フィルタリング処理
  const filteredVenues = useMemo(() => {
    return venues.filter((venue) => {
      if (selectedCategory !== "all") {
        const venueCat = venue.category || "stadium";
        if (venueCat !== selectedCategory) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const target = `${venue.name} ${venue.shortName} ${venue.address} ${venue.surface} ${venue.parkingInfo} ${venue.notes}`.toLowerCase();
        if (!target.includes(q)) return false;
      }
      return true;
    });
  }, [venues, selectedCategory, searchQuery]);

  // カテゴリごとのバッジスタイル取得
  const getCategoryBadgeStyle = (category?: string) => {
    switch (category) {
      case "home":
        return {
          icon: Home,
          label: "本拠地・ホーム",
          className: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
        };
      case "stadium":
        return {
          icon: Trophy,
          label: "球場・公営",
          className: "bg-amber-500/20 text-amber-300 border-amber-400/30",
        };
      case "school":
        return {
          icon: School,
          label: "学校・地域",
          className: "bg-teal-500/20 text-teal-300 border-teal-400/30",
        };
      case "indoor":
        return {
          icon: Dumbbell,
          label: "室内・練習場",
          className: "bg-indigo-500/20 text-indigo-300 border-indigo-400/30",
        };
      default:
        return {
          icon: Building2,
          label: "球場・施設",
          className: "bg-teal-500/20 text-teal-300 border-teal-400/30",
        };
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="球場 & 施設"
          subtitle="グラウンド情報・アクセス・駐車場ルール"
          icon={
            <span className="w-8 h-8 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black">
              <MapPin className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【球場 & 施設】チーム利用グラウンド・施設一覧`,
            text: `球場アクセス・駐車場ルール・スパイク指定の確認用です`,
          }}
        />

        {/* 🔍 検索バー ＆ ➕ 登録ボタン (1行レイアウト) */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="球場名・住所・ルールで検索..."
              className="w-full pl-9.5 pr-8 py-2.5 rounded-2xl border border-border bg-card shadow-xs text-xs placeholder:text-muted-foreground/70 focus:outline-hidden focus:ring-2 focus:ring-primary/40 transition-all"
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
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-black shrink-0 hover:bg-primary/90 transition-all active:scale-95 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>追加</span>
          </button>
        </div>

        {/* 🏷️ 分類（カテゴリ）タブフィルター */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] || 0;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                    : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted font-bold"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 🏟️ 球場 & 施設一覧 */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">球場・施設情報を読み込み中...</span>
          </div>
        ) : filteredVenues.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/12 flex items-center justify-center mx-auto text-teal-600 dark:text-teal-400">
              <MapPin className="w-6 h-6" />
            </div>
            <p className="text-sm font-black text-foreground">
              該当する球場・施設がありません
            </p>
            <p className="text-xs text-muted-foreground">
              条件を変更するか、新しい球場・施設を登録してください。
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              {(selectedCategory !== "all" || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory("all");
                    setSearchQuery("");
                  }}
                  className="px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black transition-colors"
                >
                  すべて表示
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenCreate}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black transition-all active:scale-95 shadow-xs"
              >
                ＋ 新規登録
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredVenues.map((venue) => {
              const catBadge = getCategoryBadgeStyle(venue.category);
              const CatIcon = catBadge.icon;
              const isCopied = copiedId === venue.id;

              return (
                <div
                  key={venue.id}
                  className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden transition-all"
                >
                  {/* ヘッダー: A-3 上帯ダークキャップ（分類バッジ・編集/削除ボタン） */}
                  <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-start justify-between gap-2">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      {/* バッジ群（分類 & サーフェス） */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black border flex items-center gap-1 ${catBadge.className}`}
                        >
                          <CatIcon className="w-3 h-3" />
                          <span>{venue.categoryLabel || catBadge.label}</span>
                        </span>

                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black">
                          {venue.surface}
                        </span>
                      </div>

                      {/* 球場名 */}
                      <h3 className="text-sm sm:text-base font-black text-white leading-snug">
                        {venue.name}
                      </h3>

                      {/* 住所 ＆ コピーボタン */}
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-300">
                        <MapPin className="w-3 h-3 shrink-0 text-teal-400" />
                        <span className="truncate">{venue.address || "住所未登録"}</span>
                        {venue.address && (
                          <button
                            type="button"
                            onClick={() => handleCopyAddress(venue.id, venue.address)}
                            className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0 cursor-pointer"
                            title="住所をコピー"
                          >
                            {isCopied ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 管理ボタン群（編集 ＆ 削除） */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(venue)}
                        className="p-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-all cursor-pointer"
                        title="球場情報を編集"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(venue)}
                        className="p-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-rose-500/20 hover:border-rose-400/40 text-slate-300 hover:text-rose-300 transition-all cursor-pointer"
                        title="球場情報を削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 pt-3 space-y-3">
                    {/* 🅿️ 駐車場情報 */}
                    <div className="p-3 rounded-xl bg-muted border border-border border-l-4 border-l-primary space-y-1 text-xs">
                      <div className="flex items-center gap-1.5 font-black text-primary text-[11px]">
                        <Car className="w-3.5 h-3.5 shrink-0" />
                        <span>駐車場ルール & 台数</span>
                      </div>
                      <p className="text-foreground font-medium text-[11px] leading-relaxed">
                        {venue.parkingInfo || "駐車場ルールは管理者にお問い合わせください。"}
                      </p>
                    </div>

                    {/* ⚠️ スパイク規定 & ℹ️ 諸注意 */}
                    <div className="space-y-1.5 text-xs pt-0.5">
                      {venue.spikeRule && (
                        <div className="flex items-start gap-1.5 text-foreground font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                          <span className="text-[11px] leading-relaxed">{venue.spikeRule}</span>
                        </div>
                      )}

                      {venue.notes && (
                        <div className="flex items-start gap-1.5 text-muted-foreground font-medium">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" />
                          <span className="text-[11px] leading-relaxed">{venue.notes}</span>
                        </div>
                      )}
                    </div>

                    {/* 🗺️ ナビ・地図起動フッターバー */}
                    <div className="pt-2 border-t border-border flex items-center justify-end gap-2">
                      <a
                        href={venue.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#1A73E8] text-white hover:bg-[#1557B0] text-xs font-black active:scale-95 shadow-xs transition-all"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Google Map</span>
                      </a>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                          venue.address || venue.name
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary/12 text-primary border border-primary/25 hover:bg-primary/18 text-xs font-black active:scale-95 transition-all"
                        title="ナビ案内を開始"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span>ルート案内</span>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* ➕ 新規登録 / ✏️ 編集モーダル */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted && isModalOpen && createPortal(
        <div
          onClick={() => {
            if (!isSubmitting && !isAiLoading) {
              setIsModalOpen(false);
              setAiCandidate(null);
            }
          }}
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
          >
            <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center font-black shrink-0">
                  <MapPin className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-white">
                    {editingVenue ? "球場・施設情報の編集" : "新しい球場・施設の登録"}
                  </h3>
                  <p className="text-[10px] text-slate-300 font-bold">
                    メンバー全員が閲覧・アクセスできます
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setAiCandidate(null);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              id="liff-grounds-edit-form"
              onSubmit={handleSubmitForm}
              className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5 text-xs"
            >
              {/* 施設名 */}
              <div className="space-y-1">
                <label className="font-black text-foreground flex items-center gap-1">
                  <span>施設・球場名</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setFormName(nextVal);
                    if (!isAiQueryManuallyEdited) {
                      setAiSearchQuery(nextVal);
                    }
                  }}
                  placeholder="例: 〇〇市民球場、〇〇緑地野球場"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-bold"
                />
              </div>

              {/* ✨ Item 1: AI施設情報取得バー（施設名クエリ＋1タップ取得） */}
              <div className="rounded-2xl border border-border bg-muted/50 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-foreground">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span>AIで公式情報・Googleマップから自動取得</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-teal-600 text-white text-[9.5px] font-black shrink-0">
                    Web ＋ Map連携
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={aiSearchQuery}
                    onChange={(e) => {
                      setAiSearchQuery(e.target.value);
                      setIsAiQueryManuallyEdited(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!isAiLoading && (aiSearchQuery.trim() || formName.trim())) {
                          void handleAiLookup();
                        }
                      }
                    }}
                    placeholder="検索する施設名（例: 〇〇市民球場、〇〇市 〇〇緑地野球場）"
                    className="flex-1 px-3 py-2 rounded-xl bg-card border border-border text-[11px] font-bold placeholder:font-medium placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-teal-500/40 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAiLookup()}
                    disabled={isAiLoading || (!aiSearchQuery.trim() && !formName.trim())}
                    className="h-9 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isAiLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        <span>公式・Map調査中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>AIで施設情報を取得</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[10px] font-bold text-muted-foreground leading-snug">
                  施設名（必要なら自治体名も追記可）から公式案内・Googleマップを検証し、郵便番号付き住所・専用駐車場・スパイク規定を抽出します。
                </p>
              </div>

              {/* 🛡️ Item 2: AI取得結果プレビュー ＆ 上書き保護チェックリスト */}
              {aiCandidate && (() => {
                const availableKeys = AI_FIELD_ORDER.filter(
                  (key) => Boolean(aiCandidate[key] && aiCandidate[key].trim() !== "")
                );
                const missingKeys = AI_FIELD_ORDER.filter(
                  (key) =>
                    key !== "mapUrl" &&
                    (!aiCandidate[key] || aiCandidate[key].trim() === "")
                );
                const selectedCount = availableKeys.filter(
                  (key) => aiCheckedFields[key]
                ).length;
                const verifiedSet = new Set(aiCandidate.verifiedFields || []);

                return (
                  <div className="rounded-2xl border-2 border-teal-600 bg-card shadow-sm overflow-hidden animate-in fade-in duration-150">
                    {/* A-3 上帯ダークキャップ */}
                    <div className="bg-[#0f172a] text-slate-50 border-b-2 border-teal-500 px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
                        <span className="text-xs font-black text-white truncate">
                          AI取得結果の確認・選択反映
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-black shrink-0 ${
                            aiCandidate.confidence === "high"
                              ? "bg-teal-500 text-slate-950"
                              : aiCandidate.confidence === "medium"
                              ? "bg-amber-400 text-slate-950"
                              : "bg-slate-700 text-slate-200"
                          }`}
                        >
                          {aiCandidate.confidence === "high"
                            ? "確度: 高"
                            : aiCandidate.confidence === "medium"
                            ? "確度: 中"
                            : "要確認"}
                        </span>
                        {aiCandidate.mapsVerified && (
                          <span className="px-1.5 py-0.5 rounded bg-[#1A73E8] text-white text-[9.5px] font-black shrink-0">
                            Map地点確認済
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setAiCandidate(null)}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
                        title="プレビューを閉じる"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-3 space-y-2.5">
                      {aiCandidate.summaryNote && (
                        <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/30 text-[10.5px] font-bold text-foreground leading-snug">
                          💡 {aiCandidate.summaryNote}
                        </div>
                      )}

                      {/* 🔍 同名・近隣の別施設候補がある場合のワンタップ切替サジェスト */}
                      {aiCandidate.alternatives && aiCandidate.alternatives.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-muted/60 border border-border space-y-1.5">
                          <span className="text-[10px] font-black text-foreground block">
                            🔍 同名・近隣の別施設をお探しですか？（タップで再取得）
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {aiCandidate.alternatives.map((alt) => (
                              <button
                                key={`${alt.name}-${alt.area}`}
                                type="button"
                                disabled={isAiLoading}
                                onClick={() => void handleAiLookup(alt.name, alt.area)}
                                className="px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-teal-500/10 hover:border-teal-500/40 text-left text-[10px] font-black text-foreground transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <span>{alt.name}</span>
                                {alt.area && (
                                  <span className="text-muted-foreground font-bold ml-1">
                                    （{alt.area}
                                    {alt.note ? `・${alt.note}` : ""}）
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {editingVenue && (
                        <p className="text-[10.5px] font-bold text-muted-foreground leading-snug">
                          既存のチーム独自ルールを守るため、初期状態では「空欄・初期値」の項目のみチェックしています。
                        </p>
                      )}

                      {/* クイック選択切替バー */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSelectAiMode("safe_empty_only")}
                          className="flex-1 py-1.5 px-2.5 rounded-xl border border-border bg-muted/60 hover:bg-muted text-foreground text-[10.5px] font-black transition-colors cursor-pointer"
                        >
                          空欄・初期値のみ選択
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectAiMode("all_available")}
                          className="flex-1 py-1.5 px-2.5 rounded-xl border border-border bg-muted/60 hover:bg-muted text-foreground text-[10.5px] font-black transition-colors cursor-pointer"
                        >
                          すべて選択
                        </button>
                      </div>

                      {/* 項目別チェックリスト */}
                      <div className="rounded-xl border border-border divide-y divide-border overflow-hidden bg-card">
                        {availableKeys.map((key) => {
                          const isChecked = aiCheckedFields[key];
                          const rawAiValue = aiCandidate[key];
                          const displayAiValue =
                            key === "category"
                              ? getCategoryOptionLabel(rawAiValue)
                              : rawAiValue;
                          const curValue = getCurrentFieldValue(key);
                          const displayCurValue =
                            key === "category"
                              ? getCategoryOptionLabel(curValue)
                              : curValue;
                          const isSameAsCurrent = rawAiValue.trim() === curValue;
                          const isPostalUpgradeOnly =
                            key === "address" &&
                            isPostalCodeOnlyUpgrade(curValue, rawAiValue);
                          const hasCustomExisting =
                            Boolean(editingVenue) &&
                            !isFieldEmptyOrDefault(key) &&
                            !isSameAsCurrent &&
                            !isPostalUpgradeOnly;
                          const isFieldVerified = verifiedSet.has(key);

                          return (
                            <label
                              key={key}
                              className={`px-3 py-2 flex items-start gap-2.5 cursor-pointer transition-colors ${
                                isChecked ? "bg-teal-500/[0.07]" : "bg-card hover:bg-muted/40"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleAiField(key)}
                                className="mt-0.5 w-4 h-4 rounded accent-teal-600 shrink-0 cursor-pointer"
                              />
                              <div className="flex-1 min-w-0 space-y-0.5">
                                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] font-black text-foreground">
                                      {AI_FIELD_LABELS[key]}
                                    </span>
                                    {isFieldVerified && (
                                      <span className="px-1.5 py-0.2 rounded bg-teal-600/12 text-teal-700 dark:text-teal-300 border border-teal-600/25 text-[9px] font-black">
                                        公式・Map確認
                                      </span>
                                    )}
                                  </div>
                                  {isSameAsCurrent ? (
                                    <span className="px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border text-[9.5px] font-bold">
                                      現在と同じ
                                    </span>
                                  ) : isPostalUpgradeOnly ? (
                                    <span className="px-1.5 py-0.2 rounded bg-teal-600 text-white text-[9.5px] font-black">
                                      郵便番号を補完
                                    </span>
                                  ) : hasCustomExisting ? (
                                    isChecked ? (
                                      <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-[9.5px] font-black">
                                        既存値を上書き
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-100 text-[9.5px] font-black">
                                        既存入力を保護中
                                      </span>
                                    )
                                  ) : null}
                                </div>

                                <p className="text-[11px] font-bold text-foreground break-all leading-snug">
                                  {displayAiValue}
                                </p>

                                {hasCustomExisting && displayCurValue && (
                                  <p className="text-[10px] font-medium text-muted-foreground break-all leading-snug">
                                    現在: {displayCurValue}
                                  </p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      {missingKeys.length > 0 && (
                        <p className="text-[10px] font-bold text-muted-foreground leading-snug">
                          ※公式情報で確認できなかった項目（未変更）:{" "}
                          {missingKeys.map((k) => AI_FIELD_LABELS[k]).join("・")}
                        </p>
                      )}

                      {/* 参照元Web・Googleマップリンク */}
                      {aiCandidate.sources.length > 0 && (
                        <div className="space-y-1 pt-0.5">
                          <span className="text-[10px] font-black text-muted-foreground block">
                            参照元（タップで公式ページ・地図を確認）
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {aiCandidate.sources.map((src) => {
                              const badgeClass =
                                src.kind === "maps"
                                  ? "border-[#1A73E8]/35 bg-[#1A73E8]/10 text-[#1A73E8] hover:bg-[#1A73E8]/15"
                                  : src.kind === "official"
                                  ? "border-teal-600/30 bg-teal-600/10 text-teal-700 dark:text-teal-300 hover:bg-teal-600/15"
                                  : "border-border bg-muted/50 text-primary hover:bg-muted";
                              const prefixLabel =
                                src.kind === "official" ? "🏛️ 公式: " : "";
                              return (
                                <a
                                  key={src.url}
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold max-w-full truncate transition-colors ${badgeClass}`}
                                >
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                  <span className="truncate">
                                    {prefixLabel}
                                    {src.title}
                                  </span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 反映実行フッター */}
                      <div className="pt-2 border-t border-border flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setAiCandidate(null)}
                          className="px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-[11px] font-bold cursor-pointer"
                        >
                          閉じる
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyAiCandidate}
                          disabled={selectedCount === 0}
                          className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-black flex items-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>選択した{selectedCount}項目をフォームにセット</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 略称 */}
              <div className="space-y-1">
                <label className="font-bold text-muted-foreground">
                  表示用の略称（任意）
                </label>
                <input
                  type="text"
                  value={formShortName}
                  onChange={(e) => setFormShortName(e.target.value)}
                  placeholder="例: 市民球場、〇〇緑地"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-medium"
                />
              </div>

              {/* 2カラム: 分類 ＆ サーフェス */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="font-black text-foreground">施設分類</label>
                  <LiffSelect
                    value={formCategory}
                    onChange={setFormCategory}
                    options={VENUE_CATEGORY_OPTIONS}
                    title="施設分類を選択"
                    accent="teal"
                    searchable={false}
                    className="w-full rounded-2xl bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-black text-foreground">グラウンド状態</label>
                  <LiffSelect
                    value={formSurface}
                    onChange={setFormSurface}
                    options={VENUE_SURFACE_OPTIONS}
                    title="グラウンド状態を選択"
                    accent="teal"
                    searchable={false}
                    className="w-full rounded-2xl bg-background"
                  />
                </div>
              </div>

              {/* 住所 */}
              <div className="space-y-1">
                <label className="font-black text-foreground">所在地・住所</label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="例: 〒000-0000 〇〇県〇〇市〇〇町1-1"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-medium"
                />
              </div>

              {/* Google Map URL */}
              <div className="space-y-1">
                <label className="font-bold text-muted-foreground flex items-center justify-between">
                  <span>Google Map URL（任意）</span>
                  <span className="text-[10px] text-muted-foreground/70">空欄時は住所から自動作成</span>
                </label>
                <input
                  type="url"
                  value={formMapUrl}
                  onChange={(e) => setFormMapUrl(e.target.value)}
                  placeholder="https://www.google.com/maps/search/?api=1&query=..."
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-medium"
                />
              </div>

              {/* 駐車場ルール */}
              <div className="space-y-1">
                <label className="font-black text-foreground flex items-center gap-1">
                  <Car className="w-3.5 h-3.5 text-primary" />
                  <span>駐車場ルール & 台数制限</span>
                </label>
                <textarea
                  rows={2}
                  value={formParkingInfo}
                  onChange={(e) => setFormParkingInfo(e.target.value)}
                  placeholder="例: 東駐車場を利用（有料）。チーム枠4台まで。満車の恐れあり乗り合い推奨。"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-medium resize-none"
                />
              </div>

              {/* スパイク規定 */}
              <div className="space-y-1">
                <label className="font-black text-foreground flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>スパイク規定</span>
                </label>
                <input
                  type="text"
                  value={formSpikeRule}
                  onChange={(e) => setFormSpikeRule(e.target.value)}
                  placeholder="例: ⚠️ 金具スパイク禁止 (ポイントのみ)、ポイントまたはトレシュー"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-medium"
                />
              </div>

              {/* メモ・諸注意 */}
              <div className="space-y-1">
                <label className="font-bold text-muted-foreground flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>施設設備・諸注意メモ</span>
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="例: 水道・自販機あり。更衣室あり。敷地内完全禁煙。ゴミは必ず持ち帰り。"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-medium resize-none"
                />
              </div>
            </form>

            {/* 送信ボタンバー（モバイル下部シート Safe Area 完全対応） */}
            <div className="px-4 sm:px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setAiCandidate(null);
                }}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-bold transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="submit"
                form="liff-grounds-edit-form"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>保存中...</span>
                  </>
                ) : (
                  <span>{editingVenue ? "更新する" : "登録する"}</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* 🗑️ 削除確認モーダル */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted && deleteTarget && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 animate-in fade-in duration-200">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-xl overflow-hidden animate-in zoom-in-95 duration-200"
          >
            <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-400/30 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-white">
                    球場・施設の削除
                  </h3>
                  <p className="text-[10px] text-slate-300 font-bold">
                    この操作は取り消せません。
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setDeleteTarget(null)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 rounded-2xl bg-muted border border-border text-xs font-bold text-foreground">
                {deleteTarget.name}
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                この球場・施設を一覧から削除してもよろしいですか？
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-bold transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleDeleteVenue}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>削除中...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>削除する</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
