// filepath: src/app/liff/admin/equipments/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Check,
  Edit2,
  Loader2,
  Minus,
  Package,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  AdminEquipmentItem,
  AdminEquipmentsResponse,
} from "@/api/liff/admin-management";
import { AdminMgmtShell } from "@/components/liff/AdminMgmtShell";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";

interface EquipmentPreset {
  name: string;
  quantity: number;
  isHeavy: boolean;
  description: string;
}

const EQUIPMENT_PRESETS: ReadonlyArray<EquipmentPreset> = [
  {
    name: "キャッチャー防具一式",
    quantity: 2,
    isHeavy: true,
    description: "マスク・プロテクター・レガース・ヘルメット",
  },
  {
    name: "バットケース（共用バット）",
    quantity: 1,
    isHeavy: true,
    description: "チーム共用バット一式",
  },
  {
    name: "ヘルメットバッグ",
    quantity: 1,
    isHeavy: true,
    description: "打者・走者用ヘルメット一式",
  },
  {
    name: "試合球・練習球ケース",
    quantity: 2,
    isHeavy: true,
    description: "公認球ダース・練習球かご",
  },
  {
    name: "タープテント・重りセット",
    quantity: 2,
    isHeavy: true,
    description: "ベンチ日除け用テント（道具車積載推奨）",
  },
  {
    name: "ラインカー・石灰袋",
    quantity: 1,
    isHeavy: true,
    description: "グラウンド設営用",
  },
  {
    name: "ウォータージャグ・クーラー",
    quantity: 2,
    isHeavy: true,
    description: "夏場・遠征用大型ジャグ",
  },
  {
    name: "救急バッグ・アイシング一式",
    quantity: 1,
    isHeavy: false,
    description: "救急セット・コールドスプレー・経口補水液",
  },
  {
    name: "BSOインジケーター・得点盤",
    quantity: 1,
    isHeavy: false,
    description: "練習試合用携帯スコアボード・審判用具",
  },
];

export default function LiffAdminEquipmentsPage() {
  const { currentTeam, profile } = useLiff();
  const teamId = currentTeam?.id || "demo-team";
  const endpointUrl = `/api/liff/admin/mgmt/equipments?teamId=${encodeURIComponent(
    teamId
  )}`;

  const initialCached = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<AdminEquipmentsResponse>(endpointUrl);
  }, [endpointUrl]);

  const [data, setData] = useState<AdminEquipmentsResponse | null>(
    initialCached
  );
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 追加・編集モーダル
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isHeavy, setIsHeavy] = useState(true);
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // 削除確認モーダル
  const [deletingItem, setDeletingItem] = useState<AdminEquipmentItem | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const loadEquipments = useCallback(
    async (bypassCache = false) => {
      if (bypassCache) {
        setIsRefreshing(true);
      } else {
        const syncHit = peekLiffApiCache<AdminEquipmentsResponse>(endpointUrl);
        if (syncHit) {
          setData(syncHit);
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }
      }

      try {
        const res = await fetch(
          endpointUrl,
          bypassCache
            ? { headers: { "x-iscore-bypass-cache": "1" } }
            : undefined
        );
        const json = (await res.json()) as AdminEquipmentsResponse;
        if (res.ok && json.success) {
          setData(json);
        } else if (json.error) {
          toast.error(json.error);
        }
      } catch {
        toast.error("道具データの取得に失敗しました");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [endpointUrl]
  );

  useEffect(() => {
    void loadEquipments(false);
  }, [loadEquipments]);

  const openCreateModal = (preset?: EquipmentPreset) => {
    setEditingId(null);
    setName(preset?.name || "");
    setQuantity(preset?.quantity || 1);
    setIsHeavy(preset ? preset.isHeavy : true);
    setDescription(preset?.description || "");
    setIsModalOpen(true);
  };

  const openEditModal = (item: AdminEquipmentItem) => {
    setEditingId(item.id);
    setName(item.name);
    setQuantity(item.quantity || 1);
    setIsHeavy(item.isHeavy);
    setDescription(item.description || "");
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("道具・備品名を入力してください");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/liff/admin/mgmt/equipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          teamId,
          userId: profile?.userId || undefined,
          name: name.trim(),
          quantity,
          isHeavy,
          description: description.trim(),
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "保存に失敗しました");
        return;
      }

      setIsModalOpen(false);
      invalidateLiffApiCache();
      await loadEquipments(true);
      toast.success(json.message || "道具マスタを保存しました！");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      const qs = new URLSearchParams({ teamId });
      if (profile?.userId) qs.set("userId", profile.userId);
      const res = await fetch(
        `/api/liff/admin/mgmt/equipments/${encodeURIComponent(
          deletingItem.id
        )}?${qs.toString()}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "削除に失敗しました");
        return;
      }

      setDeletingItem(null);
      invalidateLiffApiCache();
      await loadEquipments(true);
      toast.success(json.message || "道具を削除しました");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsDeleting(false);
    }
  };

  const items = data?.equipments || [];
  const totalCount = items.reduce((acc, i) => acc + i.quantity, 0);
  const heavyCount = items.filter((i) => i.isHeavy).length;

  const existingNameSet = useMemo(
    () => new Set(items.map((i) => i.name)),
    [items]
  );

  const availablePresets = useMemo(
    () => EQUIPMENT_PRESETS.filter((p) => !existingNameSet.has(p.name)),
    [existingNameSet]
  );

  const canManage = data ? data.canManage : true;

  return (
    <AdminMgmtShell
      title="道具・備品管理"
      subtitle="チーム共用備品・道具車積載アイテムの台帳管理"
      icon={
        <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center font-black">
          <Package className="w-4 h-4" />
        </span>
      }
      isLoading={isLoading}
      hasData={Boolean(data)}
      canManage={canManage}
      isDemo={data?.isDemo}
      onRefresh={() => void loadEquipments(true)}
      isRefreshing={isRefreshing}
      headerRight={
        <button
          type="button"
          onClick={() => openCreateModal()}
          className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center gap-1 cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>備品追加</span>
        </button>
      }
    >
      {/* サマリー ＆ ワンタップ定番プリセット */}
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-black text-white">
              備品台帳サマリー（{items.length}品目・計{totalCount}点）
            </h2>
          </div>
          <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black">
            📦 道具車推奨 {heavyCount}品目
          </span>
        </div>

        {availablePresets.length > 0 && (
          <div className="p-3.5 space-y-2">
            <div className="flex items-center gap-1 text-[11px] font-black text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>野球チームの定番備品をワンタップで追加:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availablePresets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => openCreateModal(preset)}
                  className="px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 border border-border text-foreground text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3 text-amber-600" />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 登録備品カードリスト */}
      {items.length === 0 ? (
        <div className="p-8 rounded-2xl border border-border bg-card text-center space-y-2">
          <p className="text-xs font-black text-foreground">
            登録されている道具・備品がありません
          </p>
          <p className="text-[11px] font-bold text-muted-foreground">
            上の定番備品チップをタップするか、「備品追加」から登録してください。
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-3.5 rounded-2xl border border-border bg-card shadow-2xs flex items-center justify-between gap-2.5"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {item.isHeavy ? (
                    <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black">
                      📦 道具車推奨
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border text-[10px] font-bold">
                      手荷物可
                    </span>
                  )}
                  <span className="text-xs sm:text-sm font-black text-foreground">
                    {item.name}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#0f172a] text-white text-[11px] font-black tabular-nums">
                    × {item.quantity}
                  </span>
                </div>
                {item.description && (
                  <p className="text-[11px] font-bold text-muted-foreground">
                    {item.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => openEditModal(item)}
                  className="h-8 w-8 rounded-xl border border-border bg-background hover:bg-muted text-foreground flex items-center justify-center cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingItem(item)}
                  className="h-8 w-8 rounded-xl border border-border bg-background hover:bg-rose-600 text-muted-foreground hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==================== モーダル: 備品追加・編集 ==================== */}
      {isModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-black text-white">
                    {editingId ? "備品情報の編集" : "チーム道具・備品の登録"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3.5 overflow-y-auto text-xs">
                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-foreground">
                    備品・道具名（必須）
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例: キャッチャー防具一式 / タープテント"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-foreground">
                    保有数量
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-10 h-10 rounded-xl border border-border bg-muted text-foreground flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={999}
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(
                          Math.min(
                            999,
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        )
                      }
                      className="w-24 h-10 px-3 rounded-xl border border-border bg-background text-center text-sm font-black tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(999, q + 1))}
                      className="w-10 h-10 rounded-xl border border-border bg-muted text-foreground flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-muted-foreground">
                      セット / 個
                    </span>
                  </div>
                </div>

                <label className="p-3 rounded-xl border border-border bg-muted/60 flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isHeavy}
                    onChange={(e) => setIsHeavy(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-amber-500"
                  />
                  <span className="space-y-0.5">
                    <span className="block text-xs font-black text-foreground">
                      📦 大型・重量物（道具車・バスへの積載推奨）
                    </span>
                    <span className="block text-[11px] font-bold text-muted-foreground">
                      遠征配車時に普通車ではなく道具車やハイエース・バスへ優先積載する目印になります
                    </span>
                  </span>
                </label>

                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    保管場所・管理担当者メモ（任意）
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="例: 体育倉庫 棚2段目 / 6年用具係保管"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void handleSave()}
                  className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>保存する</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ==================== モーダル: 削除確認 ==================== */}
      {deletingItem &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setDeletingItem(null)}
          >
            <div
              className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 flex items-center justify-between">
                <h3 className="text-sm font-black text-white">備品の削除確認</h3>
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 text-xs">
                <p className="font-black text-foreground">
                  「{deletingItem.name}」を備品台帳から削除しますか？
                </p>
              </div>
              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void handleDelete()}
                  className="h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>削除する</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </AdminMgmtShell>
  );
}
