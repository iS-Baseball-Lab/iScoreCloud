// filepath: src/app/liff/admin/cars/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import {
  Bus,
  Car,
  Check,
  Edit2,
  ExternalLink,
  Fuel,
  Loader2,
  Minus,
  Package,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type {
  AdminCarItem,
  AdminCarType,
  AdminCarsResponse,
} from "@/api/liff/admin-management";
import { AdminMgmtShell } from "@/components/liff/AdminMgmtShell";
import { useLiff } from "@/components/liff/LiffProvider";
import { LiffSelect } from "@/components/liff/LiffSelect";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
  warmupLiffEndpointForHref,
} from "@/lib/liff/api-cache";

const COLOR_PRESETS = [
  { label: "ホワイト", code: "#f8fafc" },
  { label: "ブラック", code: "#0f172a" },
  { label: "シルバー", code: "#94a3b8" },
  { label: "ネイビー", code: "#1e3a8a" },
  { label: "ブルー", code: "#2563eb" },
  { label: "レッド", code: "#dc2626" },
  { label: "グリーン", code: "#0d9488" },
  { label: "ベージュ", code: "#d6d3d1" },
] as const;

const BUS_CAPACITY_PRESETS = [14, 18, 22, 24, 28, 45, 55] as const;

export default function LiffAdminCarsPage() {
  const { currentTeam, profile } = useLiff();
  const teamId = currentTeam?.id || "demo-team";
  const endpointUrl = `/api/liff/admin/mgmt/cars?teamId=${encodeURIComponent(
    teamId
  )}`;

  const initialCached = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<AdminCarsResponse>(endpointUrl);
  }, [endpointUrl]);

  const [data, setData] = useState<AdminCarsResponse | null>(initialCached);
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // フィルタ ＆ 検索
  const [filterType, setFilterType] = useState<"all" | AdminCarType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // 追加・編集モーダル state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCarId, setEditingCarId] = useState<string | null>(null);
  const [carType, setCarType] = useState<AdminCarType>("normal");
  const [carName, setCarName] = useState("");
  const [ownerId, setOwnerId] = useState("__shared__");
  const [ownerId2, setOwnerId2] = useState("__none__");
  const [capacity, setCapacity] = useState(6);
  const [numberPlate, setNumberPlate] = useState("");
  const [colorLabel, setColorLabel] = useState("ホワイト");
  const [colorCode, setColorCode] = useState("#f8fafc");
  const [fuelEfficiency, setFuelEfficiency] = useState("12");
  const [isSaving, setIsSaving] = useState(false);

  // 削除確認モーダル
  const [deletingCar, setDeletingCar] = useState<AdminCarItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCars = useCallback(
    async (bypassCache = false) => {
      if (bypassCache) {
        setIsRefreshing(true);
      } else {
        const syncHit = peekLiffApiCache<AdminCarsResponse>(endpointUrl);
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
        const json = (await res.json()) as AdminCarsResponse;
        if (res.ok && json.success) {
          setData(json);
        } else if (json.error) {
          toast.error(json.error);
        }
      } catch {
        toast.error("車両データの取得に失敗しました");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [endpointUrl]
  );

  useEffect(() => {
    void loadCars(false);
  }, [loadCars]);

  const openCreateModal = (presetType: AdminCarType = "normal") => {
    setEditingCarId(null);
    setCarType(presetType);
    setCarName(presetType === "bus" ? "チーム マイクロバス" : "");
    setOwnerId(
      presetType === "bus"
        ? "__shared__"
        : data?.adultMembers[0]?.memberId || "__shared__"
    );
    setOwnerId2("__none__");
    setCapacity(presetType === "bus" ? 22 : presetType === "cargo" ? 4 : 6);
    setNumberPlate("");
    setColorLabel("ホワイト");
    setColorCode("#f8fafc");
    setFuelEfficiency(presetType === "bus" ? "8" : "12");
    setIsModalOpen(true);
  };

  const openEditModal = (car: AdminCarItem) => {
    setEditingCarId(car.id);
    setCarType(car.carType);
    setCarName(car.name);
    setOwnerId(car.ownerId || "__shared__");
    setOwnerId2(car.ownerId2 || "__none__");
    setCapacity(car.capacity);
    setNumberPlate(car.numberPlate || "");
    setColorLabel(car.color || "");
    setColorCode(car.colorCode || "#f8fafc");
    setFuelEfficiency(String(car.fuelEfficiency || 10));
    setIsModalOpen(true);
  };

  const handleChangeCarTypeInModal = (nextType: AdminCarType) => {
    setCarType(nextType);
    if (nextType === "bus") {
      if (capacity <= 8) setCapacity(22);
      if (!editingCarId) setOwnerId("__shared__");
    } else if (capacity >= 15) {
      setCapacity(nextType === "cargo" ? 4 : 6);
    }
  };

  const handleSaveCar = async () => {
    if (!carName.trim()) {
      toast.error(
        carType === "bus"
          ? "バス名称（例: マイクロバス 1号車）を入力してください"
          : "車両名（例: セレナ・ハイエース等）を入力してください"
      );
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/liff/admin/mgmt/cars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingCarId,
          teamId,
          userId: profile?.userId || undefined,
          ownerId: ownerId === "__shared__" ? null : ownerId,
          ownerId2:
            ownerId === "__shared__" || ownerId2 === "__none__"
              ? null
              : ownerId2,
          name: carName.trim(),
          color: colorLabel.trim() || null,
          colorCode: colorCode || null,
          numberPlate: numberPlate.trim() || null,
          capacity,
          fuelEfficiency: Number(fuelEfficiency) || 10,
          carType,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "車両の保存に失敗しました");
        return;
      }

      setIsModalOpen(false);
      invalidateLiffApiCache();
      await loadCars(true);
      toast.success(json.message || "車両を保存しました！");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCar = async () => {
    if (!deletingCar) return;
    setIsDeleting(true);
    try {
      const qs = new URLSearchParams({ teamId });
      if (profile?.userId) qs.set("userId", profile.userId);
      const res = await fetch(
        `/api/liff/admin/mgmt/cars/${encodeURIComponent(
          deletingCar.id
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

      setDeletingCar(null);
      invalidateLiffApiCache();
      await loadCars(true);
      toast.success(json.message || "車両を削除しました");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCars = useMemo(() => {
    const list = data?.cars || [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((c) => {
      if (filterType !== "all" && c.carType !== filterType) return false;
      if (!q) return true;
      const hay = `${c.name} ${c.ownerName || "チーム共有車両"} ${
        c.ownerName2 || ""
      } ${c.numberPlate || ""} ${c.color || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data?.cars, filterType, searchQuery]);

  const summary = data?.summary || {
    totalCars: 0,
    busCount: 0,
    cargoCount: 0,
    normalCount: 0,
    totalCapacity: 0,
  };

  const canManage = data ? data.canManage : true;

  return (
    <AdminMgmtShell
      title="車両・バス管理"
      subtitle="マイクロバス・道具車・保護者車両の一元管理"
      icon={
        <span className="w-8 h-8 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black">
          <Bus className="w-4 h-4" />
        </span>
      }
      isLoading={isLoading}
      hasData={Boolean(data)}
      canManage={canManage}
      isDemo={data?.isDemo}
      onRefresh={() => void loadCars(true)}
      isRefreshing={isRefreshing}
      headerRight={
        <Link
          href="/liff/carpool"
          onPointerDown={() => warmupLiffEndpointForHref("/liff/carpool")}
          className="h-9 px-3 rounded-xl bg-card border border-border hover:bg-muted text-foreground text-xs font-black flex items-center gap-1 shadow-xs"
        >
          <span>配車表へ</span>
          <ExternalLink className="w-3.5 h-3.5 text-teal-600" />
        </Link>
      }
    >
      {/* ==================== 1. 車両サマリー ＆ クイック登録ボタン ==================== */}
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bus className="w-4 h-4 text-teal-400 shrink-0" />
            <h2 className="text-sm font-black text-white">
              チーム保有・登録車両サマリー
            </h2>
          </div>
          <span className="px-2 py-0.5 rounded bg-teal-500 text-slate-950 text-[11px] font-black tabular-nums">
            総座席数 {summary.totalCapacity}席
          </span>
        </div>

        <div className="p-3.5 space-y-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-muted/70 border border-border">
              <span className="block text-[10px] font-black text-muted-foreground">
                登録合計
              </span>
              <span className="text-base font-black text-foreground tabular-nums">
                {summary.totalCars}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground ml-0.5">
                台
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30">
              <span className="block text-[10px] font-black text-teal-700 dark:text-teal-300">
                🚌 バス
              </span>
              <span className="text-base font-black text-teal-700 dark:text-teal-300 tabular-nums">
                {summary.busCount}
              </span>
              <span className="text-[10px] font-bold text-teal-700/80 dark:text-teal-300/80 ml-0.5">
                台
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/12 border border-amber-500/30">
              <span className="block text-[10px] font-black text-amber-800 dark:text-amber-300">
                📦 道具車
              </span>
              <span className="text-base font-black text-amber-800 dark:text-amber-300 tabular-nums">
                {summary.cargoCount}
              </span>
              <span className="text-[10px] font-bold text-amber-800/80 dark:text-amber-300/80 ml-0.5">
                台
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-muted/70 border border-border">
              <span className="block text-[10px] font-black text-muted-foreground">
                🚗 普通車
              </span>
              <span className="text-base font-black text-foreground tabular-nums">
                {summary.normalCount}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground ml-0.5">
                台
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openCreateModal("bus")}
              className="h-10 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs"
            >
              <Bus className="w-4 h-4 shrink-0" />
              <span>＋ マイクロ・バス登録</span>
            </button>
            <button
              type="button"
              onClick={() => openCreateModal("normal")}
              className="h-10 px-3 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 text-teal-400 shrink-0" />
              <span>＋ 道具車・保護者車両</span>
            </button>
          </div>
        </div>
      </section>

      {/* ==================== 2. 区分フィルタ ＆ 検索 ==================== */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {[
            { key: "all" as const, label: `すべて (${summary.totalCars})` },
            { key: "bus" as const, label: `🚌 バス (${summary.busCount})` },
            {
              key: "cargo" as const,
              label: `📦 道具車 (${summary.cargoCount})`,
            },
            {
              key: "normal" as const,
              label: `🚗 普通車 (${summary.normalCount})`,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterType(tab.key)}
              className={`h-8 px-3 rounded-xl border text-xs shrink-0 cursor-pointer transition-colors ${
                filterType === tab.key
                  ? "bg-[#0f172a] text-white border-[#0f172a] font-black"
                  : "bg-card text-foreground border-border font-bold hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="車両名・所有者名・ナンバーで検索..."
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-border bg-card text-foreground text-xs font-bold"
          />
        </div>
      </div>

      {/* ==================== 3. 車両カード一覧 ==================== */}
      {filteredCars.length === 0 ? (
        <div className="p-8 rounded-2xl border border-border bg-card text-center space-y-2">
          <p className="text-xs font-black text-foreground">
            該当する車両がまだ登録されていません
          </p>
          <p className="text-[11px] font-bold text-muted-foreground">
            チームのマイクロバスや道具車・保護者車両を登録しておくと、遠征の配車作成でワンタップ選択できるようになります。
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredCars.map((car) => {
            const isBus = car.carType === "bus";
            const isCargo = car.carType === "cargo";
            const accentBorder = isBus
              ? "border-teal-500"
              : isCargo
              ? "border-amber-500"
              : "border-primary";

            return (
              <section
                key={car.id}
                className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
              >
                <div
                  className={`px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] ${accentBorder} flex items-center justify-between gap-2`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${
                        isBus
                          ? "bg-teal-400 text-slate-950"
                          : isCargo
                          ? "bg-amber-400 text-slate-950"
                          : "bg-slate-700 text-slate-100"
                      }`}
                    >
                      {isBus
                        ? "🚌 バス・共有"
                        : isCargo
                        ? "📦 道具車"
                        : "🚗 普通車"}
                    </span>
                    <h3 className="text-xs sm:text-sm font-black text-white truncate">
                      {car.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-100 text-xs font-black tabular-nums">
                      定員 {car.capacity}席
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditModal(car)}
                      title="車両を編集"
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingCar(car)}
                      title="車両を削除"
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted border border-border font-black text-foreground">
                      <Users className="w-3.5 h-3.5 text-teal-600" />
                      <span>
                        {car.ownerName
                          ? car.ownerName2
                            ? `${car.ownerName} / ${car.ownerName2}`
                            : car.ownerName
                          : "🚌 チーム共有車両（運転手自由割当）"}
                      </span>
                    </span>
                    {car.color && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-background border border-border text-[11px] font-bold text-foreground">
                        {car.colorCode && (
                          <span
                            className="w-3 h-3 rounded-full border border-slate-400 shrink-0"
                            style={{ backgroundColor: car.colorCode }}
                          />
                        )}
                        <span>{car.color}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground tabular-nums">
                    {car.numberPlate && (
                      <span className="px-2 py-0.5 rounded bg-muted border border-border text-foreground font-black">
                        {car.numberPlate}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-0.5">
                      <Fuel className="w-3 h-3" />
                      {car.fuelEfficiency}km/L
                    </span>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ==================== モーダル: 車両追加・編集 ==================== */}
      {isModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  {carType === "bus" ? (
                    <Bus className="w-4 h-4 text-teal-400" />
                  ) : (
                    <Car className="w-4 h-4 text-teal-400" />
                  )}
                  <h3 className="text-sm font-black text-white">
                    {editingCarId ? "車両・バス情報の編集" : "新しい車両・バスを登録"}
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
                {/* 車両区分セレクター */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-foreground">
                    車両区分
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        type: "bus" as const,
                        label: "マイクロ・バス",
                        sub: "大型・チーム共有",
                        icon: Bus,
                        activeCls:
                          "bg-teal-600 text-white border-teal-600 font-black",
                      },
                      {
                        type: "cargo" as const,
                        label: "道具車",
                        sub: "防具・テント積載",
                        icon: Package,
                        activeCls:
                          "bg-amber-500 text-slate-950 border-amber-500 font-black",
                      },
                      {
                        type: "normal" as const,
                        label: "普通車・ミニバン",
                        sub: "選手送迎メイン",
                        icon: Car,
                        activeCls:
                          "bg-[#0f172a] text-white border-[#0f172a] font-black",
                      },
                    ].map((opt) => {
                      const Icon = opt.icon;
                      const isSel = carType === opt.type;
                      return (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => handleChangeCarTypeInModal(opt.type)}
                          className={`p-2.5 rounded-xl border text-left space-y-0.5 cursor-pointer transition-colors ${
                            isSel
                              ? opt.activeCls
                              : "bg-background text-foreground border-border hover:bg-muted font-bold"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-xs font-black truncate">
                              {opt.label}
                            </span>
                          </div>
                          <span
                            className={`block text-[10px] truncate ${
                              isSel ? "opacity-90" : "text-muted-foreground"
                            }`}
                          >
                            {opt.sub}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 車両名 */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-foreground">
                    車両・バス名称（必須）
                  </label>
                  <input
                    type="text"
                    value={carName}
                    onChange={(e) => setCarName(e.target.value)}
                    placeholder={
                      carType === "bus"
                        ? "例: チーム1号マイクロバス（コースター）"
                        : carType === "cargo"
                        ? "例: ハイエース（道具車）"
                        : "例: セレナ / アルファード"
                    }
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>

                {/* 所有者・メイン運転者 */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    所有者・メイン運転手（マイクロバス等は「チーム共有車両」を選択）
                  </label>
                  <LiffSelect
                    value={ownerId}
                    onChange={(val) => {
                      setOwnerId(val);
                      if (val === "__shared__") setOwnerId2("__none__");
                    }}
                    options={[
                      {
                        value: "__shared__",
                        label: "🚌 チーム共有車両（特定の所有者なし）",
                        sublabel:
                          "配車作成時にどの指導者・スタッフ・運転手にも割り当てられます",
                        badge: "共有車・バス推奨",
                        badgeTone: "teal" as const,
                        group: "チーム共有",
                      },
                      ...(data?.adultMembers || []).map((m) => ({
                        value: m.memberId,
                        label: m.name,
                        badge:
                          m.memberType === "staff" ? "指導者・スタッフ" : "保護者",
                        badgeTone: (m.memberType === "staff"
                          ? "primary"
                          : "slate") as "primary" | "slate",
                        group: "登録メンバー",
                      })),
                    ]}
                    title="所有者・メイン運転手を選択"
                    accent="teal"
                    size="md"
                    searchable={true}
                    className="w-full bg-background"
                  />
                </div>

                {/* 第2運転者（夫婦共有） */}
                {ownerId !== "__shared__" && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      第2運転手（任意・ご夫婦で1台の車を共有する場合）
                    </label>
                    <LiffSelect
                      value={ownerId2}
                      onChange={(val) => setOwnerId2(val)}
                      options={[
                        { value: "__none__", label: "設定なし（1名のみ）" },
                        ...(data?.adultMembers || [])
                          .filter((m) => m.memberId !== ownerId)
                          .map((m) => ({
                            value: m.memberId,
                            label: m.name,
                          })),
                      ]}
                      title="第2運転手を選択"
                      accent="slate"
                      size="md"
                      searchable={true}
                      className="w-full bg-background"
                    />
                  </div>
                )}

                {/* 乗車定員（運転手除く） */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-foreground">
                    乗車定員（運転手を除く同乗可能人数: 1〜60席）
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCapacity((p) => Math.max(1, p - 1))}
                      className="w-10 h-10 rounded-xl border border-border bg-muted text-foreground flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={60}
                      value={capacity}
                      onChange={(e) =>
                        setCapacity(
                          Math.min(
                            60,
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        )
                      }
                      className="w-24 h-10 px-3 rounded-xl border border-border bg-background text-center text-sm font-black tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setCapacity((p) => Math.min(60, p + 1))}
                      className="w-10 h-10 rounded-xl border border-border bg-muted text-foreground flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-muted-foreground">
                      席（選手・同乗者枠）
                    </span>
                  </div>

                  {carType === "bus" && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[11px] font-bold text-muted-foreground">
                        ワンタップ定員:
                      </span>
                      {BUS_CAPACITY_PRESETS.map((cap) => (
                        <button
                          key={cap}
                          type="button"
                          onClick={() => setCapacity(cap)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-black tabular-nums cursor-pointer ${
                            capacity === cap
                              ? "bg-teal-600 text-white border-teal-600"
                              : "bg-muted text-foreground border-border"
                          }`}
                        >
                          {cap}席
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* ナンバー ＆ 燃費 */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      ナンバー（任意・下4桁等）
                    </label>
                    <input
                      type="text"
                      value={numberPlate}
                      onChange={(e) => setNumberPlate(e.target.value)}
                      placeholder="例: ・・18 / 品川 200 あ 12-34"
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      実燃費目安（ガソリン精算用 km/L）
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={50}
                      step="0.5"
                      value={fuelEfficiency}
                      onChange={(e) => setFuelEfficiency(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold tabular-nums"
                    />
                  </div>
                </div>

                {/* 車体カラー */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    車体カラー（集合時の目印）
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_PRESETS.map((preset) => {
                      const active = colorLabel === preset.label;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setColorLabel(preset.label);
                            setColorCode(preset.code);
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] inline-flex items-center gap-1.5 cursor-pointer ${
                            active
                              ? "bg-[#0f172a] text-white border-[#0f172a] font-black"
                              : "bg-background text-foreground border-border font-bold"
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full border border-slate-400 shrink-0"
                            style={{ backgroundColor: preset.code }}
                          />
                          <span>{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
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
                  onClick={() => void handleSaveCar()}
                  className="h-10 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
      {deletingCar &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setDeletingCar(null)}
          >
            <div
              className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 flex items-center justify-between">
                <h3 className="text-sm font-black text-white">車両の削除確認</h3>
                <button
                  type="button"
                  onClick={() => setDeletingCar(null)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-1.5 text-xs">
                <p className="font-black text-foreground">
                  「{deletingCar.name}」を登録車両から削除しますか？
                </p>
                <p className="text-[11px] font-bold text-muted-foreground">
                  過去の予定の配車記録は保持されます。
                </p>
              </div>
              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingCar(null)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void handleDeleteCar()}
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
