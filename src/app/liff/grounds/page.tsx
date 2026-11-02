// filepath: src/app/liff/grounds/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
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

const CATEGORIES = [
  { id: "all", label: "すべて", icon: Building2 },
  { id: "home", label: "本拠地・ホーム", icon: Home },
  { id: "stadium", label: "球場・公営", icon: Trophy },
  { id: "school", label: "学校・地域", icon: School },
  { id: "indoor", label: "室内・練習場", icon: Dumbbell },
] as const;

export default function LiffGroundsPage() {
  const { currentTeam } = useLiff();
  const [venues, setVenues] = useState<VenueInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadGrounds = useCallback(async () => {
    try {
      setIsLoading(true);
      const teamId = currentTeam?.id || "demo-team";
      const res = await fetch(`/api/liff/grounds?teamId=${teamId}`);
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
    setFormSpikeRule("ポイントスパイクまたはトレーニングシューズ");
    setFormNotes("");
    setIsModalOpen(true);
  };

  // 編集モーダルを開く
  const handleOpenEdit = (venue: VenueInfo) => {
    setEditingVenue(venue);
    setFormName(venue.name);
    setFormShortName(venue.shortName || "");
    setFormCategory(venue.category || "stadium");
    setFormSurface(venue.surface || "土 (クレー)");
    setFormAddress(venue.address || "");
    setFormMapUrl(venue.mapUrl || "");
    setFormParkingInfo(venue.parkingInfo || "");
    setFormSpikeRule(venue.spikeRule || "");
    setFormNotes(venue.notes || "");
    setIsModalOpen(true);
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
        const data = await res.json() as { success: boolean; error?: string };
        if (!data.success) throw new Error(data.error || "更新に失敗しました");

        toast.success("球場・施設情報を更新しました");
      } else {
        // 新規登録
        const res = await fetch(`/api/liff/grounds`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json() as { success: boolean; error?: string };
        if (!data.success) throw new Error(data.error || "登録に失敗しました");

        toast.success("新しい球場・施設を登録しました");
      }

      setIsModalOpen(false);
      await loadGrounds();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "保存に失敗しました");
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
      const data = await res.json() as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error || "削除に失敗しました");

      toast.success("球場・施設を削除しました");
      setDeleteTarget(null);
      await loadGrounds();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "削除に失敗しました");
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
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black active:scale-95 shadow-xs transition-all"
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

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* ➕ 新規登録 / ✏️ 編集モーダル */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted && isModalOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 animate-in fade-in duration-200">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200"
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
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 overflow-y-auto space-y-3.5 text-xs">
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
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例: 川崎市等々力球場、多摩川緑地野球場"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-bold"
                />
              </div>

              {/* 略称 */}
              <div className="space-y-1">
                <label className="font-bold text-muted-foreground">
                  表示用の略称（任意）
                </label>
                <input
                  type="text"
                  value={formShortName}
                  onChange={(e) => setFormShortName(e.target.value)}
                  placeholder="例: 等々力球場、多摩川緑地"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-medium"
                />
              </div>

              {/* 2カラム: 分類 ＆ サーフェス */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="font-black text-foreground">施設分類</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-bold cursor-pointer"
                  >
                    <option value="stadium">🏆 球場・公営</option>
                    <option value="home">🏠 本拠地・ホーム</option>
                    <option value="school">🏫 学校・地域</option>
                    <option value="indoor">🏋️ 室内・練習場</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-black text-foreground">グラウンド状態</label>
                  <select
                    value={formSurface}
                    onChange={(e) => setFormSurface(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-bold cursor-pointer"
                  >
                    <option value="土 (クレー)">土 (クレー)</option>
                    <option value="人工芝">人工芝 (全面)</option>
                    <option value="天然芝">天然芝</option>
                    <option value="土 (内野) / 天然芝 (外野)">土 (内野) / 天然芝 (外野)</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
              </div>

              {/* 住所 */}
              <div className="space-y-1">
                <label className="font-black text-foreground">所在地・住所</label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="例: 神奈川県川崎市中原区等々力1-1"
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
                  placeholder="https://maps.google.com/?q=..."
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-medium"
                />
              </div>

              {/* 駐車場ルール */}
              <div className="space-y-1">
                <label className="font-black text-foreground flex items-center gap-1">
                  <Car className="w-3.5 h-3.5 text-primary" />
                  <span>駐車場ルール & 台数制限</span>
                </label>
                <input
                  type="text"
                  value={formParkingInfo}
                  onChange={(e) => setFormParkingInfo(e.target.value)}
                  placeholder="例: 東駐車場を利用（有料）。チーム枠4台まで。満車の恐れあり乗り合い推奨。"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border focus:ring-2 focus:ring-primary/40 focus:outline-hidden font-medium"
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

              {/* 送信ボタンバー */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted font-bold transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-black flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
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
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* 🗑️ 削除確認モーダル */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted && deleteTarget && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/60 animate-in fade-in duration-200">
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
