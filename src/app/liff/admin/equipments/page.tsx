// filepath: src/app/liff/admin/equipments/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Car,
  Check,
  Copy,
  Edit2,
  Layers,
  Loader2,
  Minus,
  Package,
  Plus,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import type {
  AdminEquipmentItem,
  AdminEquipmentsResponse,
} from "@/api/liff/admin-management";
import { AdminMgmtShell } from "@/components/liff/AdminMgmtShell";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  LiffSelect,
  type LiffSelectOption,
} from "@/components/liff/LiffSelect";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";
import {
  EQUIPMENT_SET_CATEGORIES,
  EQUIPMENT_SET_STARTER_TEMPLATES,
  getEquipmentSetCategoryMeta,
  inferEquipmentSetCategoryFromName,
  matchEquipmentIdsForStarterTemplate,
  type EquipmentSetCategory,
  type EquipmentSetItem,
  type EquipmentStarterTemplate,
} from "@/lib/liff/equipment-sets-schema";

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
    name: "硬式試合球・ロジンケース",
    quantity: 1,
    isHeavy: true,
    description: "硬式公認球ダース・ロジンバッグ・審判ブラシ",
  },
  {
    name: "団旗・プラカード一式",
    quantity: 1,
    isHeavy: false,
    description: "公式戦・開会式用のチーム団旗・ポール・プラカード",
  },
  {
    name: "BSOインジケーター・得点盤",
    quantity: 1,
    isHeavy: false,
    description: "OP戦・練習試合用携帯スコアボード・審判用具",
  },
  {
    name: "タープテント・重りセット",
    quantity: 2,
    isHeavy: true,
    description: "ベンチ日除け用テント（道具車積載推奨）",
  },
  {
    name: "ウォータージャグ・クーラー",
    quantity: 2,
    isHeavy: true,
    description: "夏場・遠征用大型ジャグ",
  },
  {
    name: "ラインカー・石灰袋",
    quantity: 1,
    isHeavy: true,
    description: "グラウンド設営用",
  },
  {
    name: "救急バッグ・アイシング一式",
    quantity: 1,
    isHeavy: false,
    description: "救急セット・コールドスプレー・経口補水液",
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

  // 備品追加・編集モーダル
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isHeavy, setIsHeavy] = useState(true);
  const [description, setDescription] = useState("");
  const [defaultCarId, setDefaultCarId] = useState<string>("__none__");
  const [defaultMemberId, setDefaultMemberId] = useState<string>("__none__");
  const [isSaving, setIsSaving] = useState(false);

  // 備品削除確認モーダル
  const [deletingItem, setDeletingItem] = useState<AdminEquipmentItem | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // 道具セット追加・編集モーダル
  const [isSetModalOpen, setIsSetModalOpen] = useState(false);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [setTitle, setSetTitle] = useState("");
  const [setCategory, setSetCategory] =
    useState<EquipmentSetCategory>("official");
  const [setNote, setSetNote] = useState("");
  const [setEquipmentIds, setSetEquipmentIds] = useState<string[]>([]);
  const [isSavingSet, setIsSavingSet] = useState(false);

  // 道具セット削除確認モーダル
  const [deletingSet, setDeletingSet] = useState<EquipmentSetItem | null>(null);
  const [isDeletingSet, setIsDeletingSet] = useState(false);

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

  const items = useMemo(() => data?.equipments || [], [data?.equipments]);
  const equipmentSets = useMemo(
    () => data?.equipmentSets || [],
    [data?.equipmentSets]
  );
  const carOptions = useMemo(() => data?.carOptions || [], [data?.carOptions]);
  const memberOptions = useMemo(
    () => data?.memberOptions || [],
    [data?.memberOptions]
  );

  const itemById = useMemo(() => {
    const map = new Map<string, AdminEquipmentItem>();
    for (const i of items) {
      map.set(i.id, i);
    }
    return map;
  }, [items]);

  const setNamesByEquipmentId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of equipmentSets) {
      for (const eqId of s.equipmentIds) {
        const list = map.get(eqId) || [];
        list.push(s.name);
        map.set(eqId, list);
      }
    }
    return map;
  }, [equipmentSets]);

  const carSelectOptions = useMemo<LiffSelectOption[]>(
    () => [
      {
        value: "__none__",
        label: "指定なし（都度配車で選択）",
        sublabel: "特定の車両を固定せず、配車作成時に割り当てます",
      },
      ...carOptions.map((c) => ({
        value: c.id,
        label: `${c.isCargo ? "📦 " : c.isBus ? "🚌 " : "🚗 "}${c.label}`,
        sublabel: c.sublabel,
        badge: c.isCargo ? "道具車" : c.isShared ? "共有車" : undefined,
        badgeTone: (c.isCargo ? "amber" : "teal") as "amber" | "teal",
      })),
    ],
    [carOptions]
  );

  const memberSelectOptions = useMemo<LiffSelectOption[]>(
    () => [
      {
        value: "__none__",
        label: "指定なし",
        sublabel: "特定の保管担当者を固定しません",
      },
      ...memberOptions.map((m) => ({
        value: m.id,
        label: m.name,
        badge: m.roleLabel,
        badgeTone: (m.roleLabel === "指導者" ? "teal" : "slate") as
          | "teal"
          | "slate",
      })),
    ],
    [memberOptions]
  );

  // ==========================================
  // 備品マスタ CRUD
  // ==========================================
  const openCreateModal = (preset?: EquipmentPreset) => {
    setEditingId(null);
    setName(preset?.name || "");
    setQuantity(preset?.quantity || 1);
    setIsHeavy(preset ? preset.isHeavy : true);
    setDescription(preset?.description || "");
    setDefaultCarId("__none__");
    setDefaultMemberId("__none__");
    setIsModalOpen(true);
  };

  const openEditModal = (item: AdminEquipmentItem) => {
    setEditingId(item.id);
    setName(item.name);
    setQuantity(item.quantity || 1);
    setIsHeavy(item.isHeavy);
    setDescription(item.description || "");
    setDefaultCarId(item.defaultCarId || "__none__");
    setDefaultMemberId(item.defaultMemberId || "__none__");
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("道具・備品名を入力してください");
      return;
    }

    setIsSaving(true);
    try {
      const resolvedCarId =
        defaultCarId && defaultCarId !== "__none__" ? defaultCarId : null;
      const resolvedMemberId =
        defaultMemberId && defaultMemberId !== "__none__"
          ? defaultMemberId
          : null;

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
          defaultCarId: resolvedCarId,
          defaultMemberId: resolvedMemberId,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        id?: string;
        isDemo?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "保存に失敗しました");
        return;
      }

      setIsModalOpen(false);
      invalidateLiffApiCache();

      if (json.isDemo) {
        const carLabel =
          carOptions.find((c) => c.id === resolvedCarId)?.label || null;
        const memName =
          memberOptions.find((m) => m.id === resolvedMemberId)?.name || null;
        setData((prev) => {
          if (!prev) return prev;
          const nextItem: AdminEquipmentItem = {
            id: editingId || `demo-eq-${Date.now()}`,
            teamId: "demo-team",
            name: name.trim(),
            description: description.trim(),
            isHeavy,
            quantity,
            defaultCarId: resolvedCarId,
            defaultCarLabel: carLabel,
            defaultMemberId: resolvedMemberId,
            defaultMemberName: memName,
          };
          const nextList = editingId
            ? prev.equipments.map((e) => (e.id === editingId ? nextItem : e))
            : [nextItem, ...prev.equipments];
          return { ...prev, equipments: nextList };
        });
      } else {
        await loadEquipments(true);
      }

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
      const targetId = deletingItem.id;
      const qs = new URLSearchParams({ teamId });
      if (profile?.userId) qs.set("userId", profile.userId);
      const res = await fetch(
        `/api/liff/admin/mgmt/equipments/${encodeURIComponent(
          targetId
        )}?${qs.toString()}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as {
        success: boolean;
        isDemo?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "削除に失敗しました");
        return;
      }

      setDeletingItem(null);
      invalidateLiffApiCache();

      if (json.isDemo) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            equipments: prev.equipments.filter((e) => e.id !== targetId),
            equipmentSets: (prev.equipmentSets || []).map((s) => ({
              ...s,
              equipmentIds: s.equipmentIds.filter((id) => id !== targetId),
            })),
          };
        });
      } else {
        await loadEquipments(true);
      }
      toast.success(json.message || "道具を削除しました");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsDeleting(false);
    }
  };

  // ==========================================
  // 道具セット CRUD
  // ==========================================
  const openCreateSetModal = (template?: EquipmentStarterTemplate) => {
    setEditingSetId(null);
    if (template) {
      setSetTitle(template.name);
      setSetCategory(template.category);
      setSetNote(template.description);
      const matchedIds = matchEquipmentIdsForStarterTemplate(template, items);
      setSetEquipmentIds(
        matchedIds.length > 0 ? matchedIds : items.map((i) => i.id)
      );
    } else {
      setSetTitle("");
      setSetCategory("official");
      setSetNote("");
      setSetEquipmentIds([]);
    }
    setIsSetModalOpen(true);
  };

  const openEditSetModal = (setObj: EquipmentSetItem) => {
    setEditingSetId(setObj.id);
    setSetTitle(setObj.name);
    setSetCategory(setObj.category);
    setSetNote(setObj.description || "");
    setSetEquipmentIds([...setObj.equipmentIds]);
    setIsSetModalOpen(true);
  };

  const openDuplicateSetModal = (setObj: EquipmentSetItem) => {
    setEditingSetId(null);
    setSetTitle(`${setObj.name}（コピー）`);
    setSetCategory(setObj.category);
    setSetNote(setObj.description || "");
    setSetEquipmentIds([...setObj.equipmentIds]);
    setIsSetModalOpen(true);
  };

  const toggleEquipmentInSetDraft = (eqId: string) => {
    setSetEquipmentIds((prev) =>
      prev.includes(eqId) ? prev.filter((id) => id !== eqId) : [...prev, eqId]
    );
  };

  const handleSaveSet = async () => {
    const cleanName = setTitle.trim();
    if (!cleanName) {
      toast.error("セット名（例: 公式戦セット・OP戦セット）を入力してください");
      return;
    }
    if (items.length > 0 && setEquipmentIds.length === 0) {
      toast.error("セットに含める道具を1つ以上選択してください");
      return;
    }

    setIsSavingSet(true);
    try {
      const res = await fetch("/api/liff/admin/mgmt/equipments/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId: profile?.userId || undefined,
          set: {
            id: editingSetId,
            name: cleanName,
            category: setCategory,
            description: setNote.trim(),
            equipmentIds: setEquipmentIds,
          },
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        isDemo?: boolean;
        equipmentSets?: EquipmentSetItem[];
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "セットの保存に失敗しました");
        return;
      }

      setIsSetModalOpen(false);
      invalidateLiffApiCache();

      if (json.isDemo) {
        const nextSet: EquipmentSetItem = {
          id: editingSetId || `demo-set-${Date.now()}`,
          name: cleanName,
          category: setCategory,
          description: setNote.trim(),
          equipmentIds: [...setEquipmentIds],
        };
        setData((prev) => {
          if (!prev) return prev;
          const prevSets = prev.equipmentSets || [];
          const nextSets = editingSetId
            ? prevSets.map((s) => (s.id === editingSetId ? nextSet : s))
            : [...prevSets, nextSet];
          return { ...prev, equipmentSets: nextSets };
        });
      } else if (json.equipmentSets) {
        setData((prev) =>
          prev ? { ...prev, equipmentSets: json.equipmentSets } : prev
        );
      } else {
        await loadEquipments(true);
      }

      toast.success(
        editingSetId
          ? `「${cleanName}」を更新しました！`
          : `「${cleanName}」を作成しました！配車画面で1タップ呼出できます`
      );
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSavingSet(false);
    }
  };

  const handleDeleteSet = async () => {
    if (!deletingSet) return;
    setIsDeletingSet(true);
    try {
      const targetSetId = deletingSet.id;
      const qs = new URLSearchParams({ teamId });
      if (profile?.userId) qs.set("userId", profile.userId);
      const res = await fetch(
        `/api/liff/admin/mgmt/equipments/sets/${encodeURIComponent(
          targetSetId
        )}?${qs.toString()}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as {
        success: boolean;
        isDemo?: boolean;
        equipmentSets?: EquipmentSetItem[];
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "セットの削除に失敗しました");
        return;
      }

      setDeletingSet(null);
      invalidateLiffApiCache();

      if (json.isDemo) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                equipmentSets: (prev.equipmentSets || []).filter(
                  (s) => s.id !== targetSetId
                ),
              }
            : prev
        );
      } else if (json.equipmentSets) {
        setData((prev) =>
          prev ? { ...prev, equipmentSets: json.equipmentSets } : prev
        );
      } else {
        await loadEquipments(true);
      }

      toast.success("道具セットを削除しました");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsDeletingSet(false);
    }
  };

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

  const existingSetNameSet = useMemo(
    () => new Set(equipmentSets.map((s) => s.name)),
    [equipmentSets]
  );

  const availableStarterSetTemplates = useMemo(
    () =>
      EQUIPMENT_SET_STARTER_TEMPLATES.filter(
        (t) => !existingSetNameSet.has(t.name)
      ),
    [existingSetNameSet]
  );

  const canManage = data ? data.canManage : true;

  return (
    <AdminMgmtShell
      title="道具・備品管理"
      subtitle="道具セット一括割当・共用備品・常設車両の台帳管理"
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
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openCreateSetModal()}
            className="h-9 px-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <Layers className="w-3.5 h-3.5 text-teal-600" />
            <span>セット作成</span>
          </button>
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center gap-1 cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>備品追加</span>
          </button>
        </div>
      }
    >
      {/* ==================== 1. 道具セット管理（公式戦・硬式戦・OP戦など） ==================== */}
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-teal-400 shrink-0" />
            <h2 className="text-sm font-black text-white truncate">
              道具セット（{equipmentSets.length}種類）
            </h2>
          </div>
          <button
            type="button"
            onClick={() => openCreateSetModal()}
            className="px-2.5 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-[11px] font-black inline-flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>新規セット</span>
          </button>
        </div>

        <div className="p-3.5 space-y-3">
          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
            公式戦・硬式戦・OP戦（練習試合）・夏場遠征などのセットを作っておくと、
            <strong className="text-foreground">
              配車作成画面で1タップ一括割当・複数号車へのおまかせ自動配分
            </strong>
            が使えます。
          </p>

          {/* ワンタップ定番セットひな形 */}
          {availableStarterSetTemplates.length > 0 && (
            <div className="p-2.5 rounded-xl bg-muted/55 border border-border space-y-1.5">
              <div className="flex items-center gap-1 text-[11px] font-black text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>ひな形から1タップでセットを作成:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableStarterSetTemplates.map((tpl) => {
                  const catMeta = getEquipmentSetCategoryMeta(tpl.category);
                  return (
                    <button
                      key={tpl.key}
                      type="button"
                      onClick={() => openCreateSetModal(tpl)}
                      className="px-2.5 py-1 rounded-lg bg-card hover:bg-muted border border-border text-foreground text-xs font-black inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3 text-teal-600 shrink-0" />
                      <span>{catMeta.shortBadge.split(" ")[0]}</span>
                      <span>{tpl.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 登録済みセット一覧 */}
          {equipmentSets.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-border bg-muted/25 text-center space-y-1.5">
              <p className="text-xs font-black text-foreground">
                まだ道具セットが作成されていません
              </p>
              <p className="text-[11px] font-bold text-muted-foreground">
                上の「公式戦セット」「硬式戦セット」「OP戦セット」等のチップをタップするとすぐ作成できます。
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {equipmentSets.map((setObj) => {
                const catMeta = getEquipmentSetCategoryMeta(setObj.category);
                const resolvedEquipments = setObj.equipmentIds
                  .map((id) => itemById.get(id))
                  .filter((v): v is AdminEquipmentItem => Boolean(v));
                const heavyInSet = resolvedEquipments.filter(
                  (e) => e.isHeavy
                ).length;

                return (
                  <div
                    key={setObj.id}
                    className="p-3 rounded-xl border border-border bg-background space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black ${catMeta.badgeClass}`}
                          >
                            {catMeta.shortBadge}
                          </span>
                          <span className="text-xs sm:text-sm font-black text-foreground">
                            {setObj.name}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#0f172a] text-white text-[10.5px] font-black tabular-nums">
                            {resolvedEquipments.length}品目
                            {heavyInSet > 0 ? `（重量${heavyInSet}）` : ""}
                          </span>
                        </div>
                        {setObj.description && (
                          <p className="text-[11px] font-bold text-muted-foreground">
                            {setObj.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openDuplicateSetModal(setObj)}
                          title="コピーして別セットを作成"
                          className="h-8 w-8 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditSetModal(setObj)}
                          title="セットを編集"
                          className="h-8 w-8 rounded-xl border border-border bg-card hover:bg-muted text-foreground flex items-center justify-center cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingSet(setObj)}
                          title="セットを削除"
                          className="h-8 w-8 rounded-xl border border-border bg-card hover:bg-rose-600 text-muted-foreground hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* セット内の道具チップ */}
                    {resolvedEquipments.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {resolvedEquipments.map((eq) => (
                          <span
                            key={`${setObj.id}-${eq.id}`}
                            className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold border ${
                              eq.isHeavy
                                ? "bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/35"
                                : "bg-card text-foreground border-border"
                            }`}
                          >
                            {eq.isHeavy ? "📦 " : ""}
                            {eq.name}
                            {eq.quantity > 1 ? ` ×${eq.quantity}` : ""}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10.5px] font-bold text-amber-700 dark:text-amber-300">
                        ※ 含まれる道具が未選択です。「編集」から道具にチェックを入れてください。
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ==================== 2. 備品台帳サマリー ＆ ワンタップ定番プリセット ==================== */}
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-black text-white">
              備品台帳マスタ（{items.length}品目・計{totalCount}点）
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

      {/* ==================== 3. 登録備品カードリスト ==================== */}
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
          {items.map((item) => {
            const linkedSets = setNamesByEquipmentId.get(item.id) || [];
            return (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl border border-border bg-card shadow-2xs flex items-center justify-between gap-2.5"
              >
                <div className="space-y-1.5 min-w-0">
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

                  {/* いつもの積載車両・保管担当・所属セットバッジ */}
                  {(item.defaultCarLabel ||
                    item.defaultMemberName ||
                    linkedSets.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {item.defaultCarLabel && (
                        <span className="px-2 py-0.5 rounded-md bg-teal-500/12 text-teal-800 dark:text-teal-300 border border-teal-500/30 text-[10.5px] font-black inline-flex items-center gap-1">
                          <Car className="w-3 h-3 shrink-0" />
                          <span>常設: {item.defaultCarLabel}</span>
                        </span>
                      )}
                      {item.defaultMemberName && (
                        <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/25 text-[10.5px] font-black inline-flex items-center gap-1">
                          <UserCheck className="w-3 h-3 shrink-0" />
                          <span>担当: {item.defaultMemberName}</span>
                        </span>
                      )}
                      {linkedSets.map((sName) => (
                        <span
                          key={`${item.id}-set-${sName}`}
                          className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border text-[10px] font-bold"
                        >
                          📋 {sName}
                        </span>
                      ))}
                    </div>
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
            );
          })}
        </div>
      )}

      {/* ==================== モーダル1: 備品追加・編集 ==================== */}
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
                      おまかせ配分時に普通車ではなく道具車やハイエース・バスへ優先積載されます
                    </span>
                  </span>
                </label>

                {/* いつもの積載車両（自動初期セット連動） */}
                {carOptions.length > 0 && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-foreground">
                      🚗 いつもの積載車両（任意・配車時に自動セット）
                    </label>
                    <LiffSelect
                      value={defaultCarId}
                      onChange={(val) => setDefaultCarId(val)}
                      options={carSelectOptions}
                      title="いつもの積載車両を選択"
                      accent="teal"
                      searchable={carOptions.length >= 6}
                      className="w-full bg-background"
                    />
                  </div>
                )}

                {/* 普段の保管・持出担当（自動初期セット連動） */}
                {memberOptions.length > 0 && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-foreground">
                      👤 普段の保管・持出担当（任意・運転手一致で自動セット）
                    </label>
                    <LiffSelect
                      value={defaultMemberId}
                      onChange={(val) => setDefaultMemberId(val)}
                      options={memberSelectOptions}
                      title="普段の保管・持出担当を選択"
                      accent="primary"
                      searchable={memberOptions.length >= 6}
                      className="w-full bg-background"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    保管場所・補足メモ（任意）
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="例: 体育倉庫 棚2段目 / 用具係保管"
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

      {/* ==================== モーダル2: 道具セット作成・編集 ==================== */}
      {isSetModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsSetModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-400" />
                  <h3 className="text-sm font-black text-white">
                    {editingSetId
                      ? "道具セットの編集"
                      : "道具セットの作成（1タップ割当用）"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSetModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3.5 overflow-y-auto text-xs">
                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-foreground">
                    セット名（必須）
                  </label>
                  <input
                    type="text"
                    value={setTitle}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSetTitle(val);
                      if (!editingSetId && val.trim()) {
                        setSetCategory(inferEquipmentSetCategoryFromName(val));
                      }
                    }}
                    placeholder="例: 公式戦セット / 硬式戦セット / OP戦セット"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-black"
                  />
                </div>

                {/* 用途区分（配車画面での自動おすすめ判定に使用） */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-foreground">
                    セットの用途区分（予定に応じたおすすめ表示に連動）
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {EQUIPMENT_SET_CATEGORIES.map((cat) => {
                      const active = setCategory === cat.value;
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setSetCategory(cat.value)}
                          className={`h-9 px-2.5 rounded-xl border text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                            active
                              ? "bg-[#0f172a] text-white border-[#0f172a] font-black"
                              : "bg-background hover:bg-muted text-foreground border-border font-bold"
                          }`}
                        >
                          <span>{cat.shortBadge}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    ひとことメモ（任意）
                  </label>
                  <input
                    type="text"
                    value={setNote}
                    onChange={(e) => setSetNote(e.target.value)}
                    placeholder="例: 大会本部提出用の公認球・団旗を含む"
                    className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>

                {/* セットに含める道具チェックリスト */}
                <div className="space-y-2 pt-1 border-t border-border">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-black text-foreground">
                      セットに含める道具（{setEquipmentIds.length}/
                      {items.length}品目を選択中）
                    </span>
                    {items.length > 0 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSetEquipmentIds(items.map((i) => i.id))
                          }
                          className="px-2 py-0.5 rounded-md border border-border bg-muted hover:bg-muted/80 text-[10.5px] font-black text-foreground cursor-pointer"
                        >
                          全選択
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSetEquipmentIds(
                              items.filter((i) => i.isHeavy).map((i) => i.id)
                            )
                          }
                          className="px-2 py-0.5 rounded-md border border-border bg-muted hover:bg-muted/80 text-[10.5px] font-black text-foreground cursor-pointer"
                        >
                          重量物のみ
                        </button>
                        {setEquipmentIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSetEquipmentIds([])}
                            className="px-2 py-0.5 rounded-md border border-border bg-card hover:bg-muted text-[10.5px] font-bold text-muted-foreground cursor-pointer"
                          >
                            クリア
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {items.length === 0 ? (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35 space-y-2">
                      <p className="text-xs font-black text-foreground">
                        まだ備品台帳に道具が登録されていません
                      </p>
                      <p className="text-[11px] font-bold text-muted-foreground">
                        先に備品台帳へ道具（防具・バット・テント等）を追加してからセットに含めてください（空セットのまま先に保存することも可能です）。
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto pr-0.5">
                      {items.map((eq) => {
                        const checked = setEquipmentIds.includes(eq.id);
                        return (
                          <button
                            key={`set-pick-${eq.id}`}
                            type="button"
                            onClick={() => toggleEquipmentInSetDraft(eq.id)}
                            className={`px-3 py-2 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                              checked
                                ? "bg-teal-600 text-white border-teal-600 font-black"
                                : "bg-background hover:bg-muted text-foreground border-border font-bold"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="truncate">
                                {eq.name}
                                {eq.quantity > 1 ? ` ×${eq.quantity}` : ""}
                              </span>
                              {eq.isHeavy && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 ${
                                    checked
                                      ? "bg-slate-950 text-amber-300"
                                      : "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                                  }`}
                                >
                                  📦 重量
                                </span>
                              )}
                            </div>
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                                checked
                                  ? "bg-white text-teal-700 border-white"
                                  : "bg-card border-border"
                              }`}
                            >
                              {checked && <Check className="w-3.5 h-3.5" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSetModalOpen(false)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSavingSet}
                  onClick={() => void handleSaveSet()}
                  className="h-10 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingSet ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>セットを保存</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ==================== モーダル3: 備品削除確認 ==================== */}
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
              <div className="p-4 text-xs space-y-1.5">
                <p className="font-black text-foreground">
                  「{deletingItem.name}」を備品台帳から削除しますか？
                </p>
                <p className="text-[11px] font-bold text-muted-foreground">
                  ※ 登録済みの道具セットからも自動的に除外されます。
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
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>削除する</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ==================== モーダル4: 道具セット削除確認 ==================== */}
      {deletingSet &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setDeletingSet(null)}
          >
            <div
              className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 flex items-center justify-between">
                <h3 className="text-sm font-black text-white">
                  道具セットの削除確認
                </h3>
                <button
                  type="button"
                  onClick={() => setDeletingSet(null)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 text-xs space-y-1.5">
                <p className="font-black text-foreground">
                  「{deletingSet.name}」を削除しますか？
                </p>
                <p className="text-[11px] font-bold text-muted-foreground">
                  ※ セットの定義のみ削除され、個別の備品マスタや作成済みの配車データは消えません。
                </p>
              </div>
              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingSet(null)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isDeletingSet}
                  onClick={() => void handleDeleteSet()}
                  className="h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeletingSet ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
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
