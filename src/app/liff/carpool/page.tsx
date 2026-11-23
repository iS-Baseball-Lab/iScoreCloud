// filepath: src/app/liff/carpool/page.tsx
"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { LiffDataLoadErrorCard } from "@/components/liff/LiffDataLoadErrorCard";
import { useLiff, useLiffPermissions } from "@/components/liff/LiffProvider";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";
import {
  CarpoolConvoyLiveMap,
  type ConvoyCarItem,
} from "@/components/liff/CarpoolConvoyLiveMap";
import type { ConvoyAvailableEventOption } from "@/types/carpool-convoy";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Car,
  Check,
  Clock,
  Fuel,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";

const SimpleCarpoolEditorModal = dynamic(
  () =>
    import("@/components/liff/SimpleCarpoolEditorModal").then(
      (m) => m.SimpleCarpoolEditorModal
    ),
  { ssr: false }
);

const CarpoolSummaryShareModal = dynamic(
  () =>
    import("@/components/liff/CarpoolSummaryShareModal").then(
      (m) => m.CarpoolSummaryShareModal
    ),
  { ssr: false }
);

const TEST_CONVOY_CARS: ConvoyCarItem[] = [
  {
    carpoolId: "test-cp-1",
    carNumber: 1,
    driverName: "1号車（テスト）",
    carModel: "テスト車両1",
    plate: "テスト",
    capacity: 4,
    passengers: [],
    isCargo: true,
  },
  {
    carpoolId: "test-cp-2",
    carNumber: 2,
    driverName: "2号車（テスト）",
    carModel: "テスト車両2",
    plate: "テスト",
    capacity: 5,
    passengers: [],
  },
  {
    carpoolId: "test-cp-3",
    carNumber: 3,
    driverName: "3号車（テスト）",
    carModel: "テスト車両3",
    plate: "テスト",
    capacity: 5,
    passengers: [],
  },
  {
    carpoolId: "test-cp-4",
    carNumber: 4,
    driverName: "4号車（テスト）",
    carModel: "テスト車両4",
    plate: "テスト",
    capacity: 5,
    passengers: [],
  },
  {
    carpoolId: "test-cp-5",
    carNumber: 5,
    driverName: "5号車（テスト）",
    carModel: "テスト車両5",
    plate: "テスト",
    capacity: 4,
    passengers: [],
  },
];

interface CarEquipmentItem {
  eventEquipmentId: string;
  equipmentId: string;
  name: string;
  quantity: number;
  isHeavy: boolean;
  status: "pending" | "loaded" | "returned";
}

interface CarAssignment {
  carpoolId?: string;
  carNumber: number;
  driverName: string;
  carModel: string;
  plate: string;
  capacity: number;
  passengers: { name: string; type: "player" | "adult" }[];
  hasReturnDiff?: boolean;
  returnPassengers?: { name: string; type: "player" | "adult" }[];
  equipments?: CarEquipmentItem[];
  isCargo?: boolean;
  isBus?: boolean;
}

interface CarpoolData {
  eventId?: string;
  eventTitle: string;
  date: string;
  gatherTime: string;
  gatherLocation: string;
  destination: string;
  costShare: string;
  notes: string;
  availableEvents?: ConvoyAvailableEventOption[];
  cars: CarAssignment[];
}

function LiffCarpoolContent() {
  const { currentTeam, profile, liff, isDemo } = useLiff();
  const { canEditCarpool, canManageTeam, canManagePlayers, isDemoMode } =
    useLiffPermissions();
  const effectiveCanEditCarpool =
    canEditCarpool || canManageTeam || isDemoMode;
  const canRunTestConvoy =
    canEditCarpool || canManagePlayers || canManageTeam || isDemoMode;
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventIdParam = searchParams.get("eventId") || "";
  const openEditorParam = searchParams.get("openEditor") === "1";

  const initialCachedCarpool = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    const tid =
      currentTeam?.id ||
      localStorage.getItem("iscore_selectedTeamId") ||
      "demo-team";
    const evQ = eventIdParam ? `&eventId=${encodeURIComponent(eventIdParam)}` : "";
    return peekLiffApiCache<{ success: boolean; carpool?: CarpoolData }>(
      `/api/liff/carpool?teamId=${encodeURIComponent(tid)}${evQ}`
    );
  }, [currentTeam?.id, eventIdParam]);

  const [direction, setDirection] = useState<"outbound" | "return">("outbound");
  const [carpoolInfo, setCarpoolInfo] = useState<CarpoolData | null>(
    () => initialCachedCarpool?.carpool ?? null
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => !initialCachedCarpool
  );
  const [loadError, setLoadError] = useState<boolean>(false);
  const [isTestConvoyMode, setIsTestConvoyMode] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [updatingEquipIds, setUpdatingEquipIds] = useState<
    Record<string, boolean>
  >({});
  const [editorInitialEventId, setEditorInitialEventId] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    setIsTestConvoyMode(false);
    setIsEditorOpen(false);
    setIsShareModalOpen(false);
  }, [currentTeam?.id]);

  useEffect(() => {
    if (openEditorParam && effectiveCanEditCarpool) {
      setEditorInitialEventId(eventIdParam || undefined);
      setIsEditorOpen(true);
    }
  }, [openEditorParam, eventIdParam, effectiveCanEditCarpool]);

  const loadCarpool = useCallback(
    async (overrideEventId?: string, bypassCache?: boolean) => {
      try {
        const teamId = currentTeam?.id || "demo-team";
        const targetEvId =
          overrideEventId !== undefined ? overrideEventId : eventIdParam;
        const eventQuery = targetEvId
          ? `&eventId=${encodeURIComponent(targetEvId)}`
          : "";
        const url = `/api/liff/carpool?teamId=${encodeURIComponent(
          teamId
        )}${eventQuery}`;
        const syncCached = !bypassCache
          ? peekLiffApiCache<{ success: boolean; carpool?: CarpoolData }>(url)
          : null;
        if (syncCached && syncCached.success !== false) {
          setCarpoolInfo(syncCached.carpool ?? null);
          setLoadError(false);
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }

        const res = await fetch(
          url,
          bypassCache ? { headers: { "x-iscore-bypass-cache": "1" } } : undefined
        );
        if (!res.ok) {
          setLoadError(true);
          return;
        }
        const data = (await res.json()) as {
          success: boolean;
          carpool?: CarpoolData;
        };
        if (data.success === false) {
          setLoadError(true);
          return;
        }
        setLoadError(false);
        if (data.carpool) {
          setCarpoolInfo(data.carpool);
        } else {
          setCarpoolInfo(null);
        }
      } catch (err) {
        setLoadError(true);
        console.error("Failed to fetch carpool:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [currentTeam?.id, eventIdParam]
  );

  useEffect(() => {
    void loadCarpool();
  }, [loadCarpool]);

  const getCarActivePassengers = useCallback(
    (car: CarAssignment) =>
      direction === "return"
        ? car.returnPassengers ?? car.passengers
        : car.passengers,
    [direction]
  );

  const handleToggleEquipmentStatus = useCallback(
    async (car: CarAssignment, eqItem: CarEquipmentItem) => {
      const teamId = currentTeam?.id || "demo-team";
      const targetEventId =
        carpoolInfo?.eventId || eventIdParam || "demo-event-carpool";
      const lockKey = `${car.carNumber}:${eqItem.equipmentId}`;
      if (updatingEquipIds[lockKey]) return;

      const prevStatus = eqItem.status;
      const nextStatus: "pending" | "loaded" | "returned" =
        direction === "outbound"
          ? prevStatus === "loaded" || prevStatus === "returned"
            ? "pending"
            : "loaded"
          : prevStatus === "returned"
          ? "loaded"
          : "returned";

      // 即時オプティミスティック更新
      setCarpoolInfo((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cars: prev.cars.map((c) => {
            if (c.carNumber !== car.carNumber) return c;
            return {
              ...c,
              equipments: (c.equipments || []).map((eq) =>
                eq.equipmentId === eqItem.equipmentId
                  ? { ...eq, status: nextStatus }
                  : eq
              ),
            };
          }),
        };
      });

      if (isDemo || isDemoMode || teamId === "demo-team") {
        toast.success(
          nextStatus === "loaded"
            ? `「${eqItem.name}」を積載済にしました`
            : nextStatus === "returned"
            ? `「${eqItem.name}」を返却・回収済にしました`
            : `「${eqItem.name}」を未積載に戻しました`
        );
        return;
      }

      setUpdatingEquipIds((prev) => ({ ...prev, [lockKey]: true }));
      try {
        const res = await fetch("/api/liff/carpool-simple/equipment-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId,
            eventId: targetEventId,
            equipmentId: eqItem.equipmentId,
            eventEquipmentId: eqItem.eventEquipmentId,
            carpoolId: car.carpoolId || null,
            status: nextStatus,
          }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          error?: string;
        };
        if (!res.ok || !json.success) {
          throw new Error(json.error || "道具ステータスの更新に失敗しました");
        }
        invalidateLiffApiCache("/api/liff/carpool");
      } catch (err) {
        // エラー時は元のステータスへロールバック
        setCarpoolInfo((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            cars: prev.cars.map((c) => {
              if (c.carNumber !== car.carNumber) return c;
              return {
                ...c,
                equipments: (c.equipments || []).map((eq) =>
                  eq.equipmentId === eqItem.equipmentId
                    ? { ...eq, status: prevStatus }
                    : eq
                ),
              };
            }),
          };
        });
        toast.error(
          err instanceof Error ? err.message : "道具ステータスの更新に失敗しました"
        );
      } finally {
        setUpdatingEquipIds((prev) => {
          const next = { ...prev };
          delete next[lockKey];
          return next;
        });
      }
    },
    [
      currentTeam?.id,
      carpoolInfo?.eventId,
      eventIdParam,
      updatingEquipIds,
      direction,
      isDemo,
      isDemoMode,
    ]
  );

  const cars = carpoolInfo?.cars || [];
  const totalPassengers = cars.reduce(
    (acc, car) => acc + getCarActivePassengers(car).length,
    0
  );
  const returnDiffCarCount = cars.filter((car) =>
    Boolean(car.hasReturnDiff)
  ).length;

  const effectiveEventId =
    carpoolInfo?.eventId || eventIdParam || "demo-event-carpool";
  const convoyCars: ConvoyCarItem[] = cars.map((car) => ({
    carpoolId: car.carpoolId || `car-${car.carNumber}`,
    carNumber: car.carNumber,
    driverName: car.driverName,
    carModel: car.carModel,
    plate: car.plate,
    capacity: car.capacity,
    passengers: getCarActivePassengers(car),
    isCargo: car.isCargo,
  }));
  const availableEvents = carpoolInfo?.availableEvents || [];

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="配車・送迎"
          subtitle={carpoolInfo?.date || "号車割・集合案内・遠征ライブマップ"}
          icon={
            <span className="w-8 h-8 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black">
              <Car className="w-4 h-4" />
            </span>
          }
          showBack
          rightElement={
            effectiveCanEditCarpool ? (
              <button
                type="button"
                onClick={() => {
                  setEditorInitialEventId(
                    carpoolInfo?.eventId || eventIdParam || undefined
                  );
                  setIsEditorOpen(true);
                }}
                className="h-9 px-3 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center gap-1 shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                {cars.length > 0 ? (
                  <>
                    <Pencil className="w-3.5 h-3.5 shrink-0" />
                    <span>簡易配車</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>配車作成</span>
                  </>
                )}
              </button>
            ) : undefined
          }
          shareData={{
            title: `【配車表】${carpoolInfo?.date || ""} ${
              carpoolInfo?.eventTitle || ""
            }`,
            text: `集合: ${carpoolInfo?.gatherTime || ""} @ ${
              carpoolInfo?.gatherLocation || ""
            }\n乗車人数: 計${totalPassengers}名`,
          }}
        />

        {/* ローディング */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">配車表を読み込み中...</span>
          </div>
        ) : !carpoolInfo && loadError && !isTestConvoyMode ? (
          <LiffDataLoadErrorCard
            title="配車データを読み込めませんでした"
            onRetry={() => void loadCarpool(undefined, true)}
            isRetrying={isLoading}
          />
        ) : (!carpoolInfo || cars.length === 0) && !isTestConvoyMode ? (
          /* 空ステート ＋ 簡易配車作成 ＆ 隊列ライブマップ実機テスト起動カード */
          <div className="space-y-3">
            <EmptyState
              icon={Car}
              title="配車表はまだ作成されていません"
              description={
                effectiveCanEditCarpool
                  ? "下の「簡易配車を作成する」から、1号車〜N号車の運転手・乗車メンバー・積載道具をすぐに登録して隊列ライブマップと連携できます"
                  : "配車係・指導者が配車表を作成すると、ここに号車割と隊列ライブマップが表示されます"
              }
            />

            {/* 🚗 簡易配車 作成カード（メインCTA） */}
            {effectiveCanEditCarpool && (
              <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded bg-teal-500 text-slate-950 text-[11px] font-black">
                    🚗 かんたん登録
                  </span>
                  <span className="text-xs font-black text-slate-200">
                    1号車〜N号車 簡易配車エディタ
                  </span>
                </div>
                <div className="p-4 space-y-3 text-xs">
                  <p className="font-bold text-muted-foreground leading-relaxed">
                    予定を選んで（未登録ならその場で新規作成OK）、
                    <strong className="text-foreground">
                      各号車の運転手・定員・積載道具・行き帰り乗車メンバー
                    </strong>
                    をスマホでサクッと作成できます。
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditorInitialEventId(eventIdParam || undefined);
                      setIsEditorOpen(true);
                    }}
                    className="w-full h-10 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>簡易配車を作成する（1号車〜登録）</span>
                  </button>
                </div>
              </section>
            )}

            {canRunTestConvoy && (
              <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-slate-500 flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-950 text-[11px] font-black">
                    🧪 実機テスト対応
                  </span>
                  <span className="text-xs font-black text-slate-200">
                    1号車〜5号車 テスト隊列
                  </span>
                </div>
                <div className="p-4 space-y-3 text-xs">
                  <p className="font-bold text-muted-foreground leading-relaxed">
                    配車データを登録する前でも、
                    <strong className="text-foreground">
                      Google Maps APIキーの設定・渋滞表示・スマホGPSでの位置共有・複数端末での同時追跡
                    </strong>
                    をお試しいただけます。
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsTestConvoyMode(true)}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-muted hover:bg-muted/80 text-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Radio className="w-4 h-4 shrink-0 text-teal-600" />
                    <span>1〜5号車のテスト隊列でライブマップを試す</span>
                  </button>
                </div>
              </section>
            )}

            <Link
              href="/liff/tools/carpool-generator"
              className="w-full h-10 px-4 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
            >
              <Sparkles className="w-4 h-4 shrink-0 text-teal-600" />
              <span>配車作成・運用ガイドを見る</span>
            </Link>
          </div>
        ) : isTestConvoyMode ? (
          /* 🧪 1〜5号車 テスト隊列モード */
          <div className="space-y-3.5">
            <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[11px] font-black shrink-0">
                    🧪 テスト隊列モード
                  </span>
                  <span className="text-xs font-black text-white truncate">
                    1号車〜5号車 位置共有テスト
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTestConvoyMode(false)}
                  className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-black flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>終了</span>
                </button>
              </div>
              <div className="p-3.5 text-xs font-bold text-muted-foreground leading-relaxed">
                実際のチーム環境で{" "}
                <strong className="text-foreground">
                  Googleマップ有効化（APIキー登録）
                </strong>{" "}
                や{" "}
                <strong className="text-foreground">
                  位置共有ON・状況スタンプ
                </strong>{" "}
                を試せます。別スマホのメンバーと同時に開いて別々の号車を選べば、複数台の同時追跡もテストできます！
              </div>
            </section>

            <div className="flex gap-1 bg-muted p-1 rounded-2xl border border-border">
              <button
                type="button"
                onClick={() => setDirection("outbound")}
                className={`flex-1 py-2 px-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  direction === "outbound"
                    ? "bg-card text-foreground shadow-sm border border-border font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                }`}
              >
                <Car
                  className={`w-3.5 h-3.5 shrink-0 ${
                    direction === "outbound"
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                />
                <span>行き便 (集合場所 ➔ 目的地)</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection("return")}
                className={`flex-1 py-2 px-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  direction === "return"
                    ? "bg-card text-foreground shadow-sm border border-border font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                }`}
              >
                <Car
                  className={`w-3.5 h-3.5 shrink-0 ${
                    direction === "return"
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                />
                <span>帰り便 (目的地 ➔ 解散場所)</span>
              </button>
            </div>

            <CarpoolConvoyLiveMap
              teamId={currentTeam?.id || "demo-team"}
              eventId="convoy-test"
              direction={direction}
              destinationText={carpoolInfo?.destination || "目的地グラウンド"}
              gatherLocationText={carpoolInfo?.gatherLocation || "集合場所"}
              cars={TEST_CONVOY_CARS}
              userId={profile?.userId}
              userName={profile?.displayName}
            />
          </div>
        ) : !carpoolInfo ? null : (
          <>
            {/* 複数の配車登録済みイベントがある場合のワンタップ切替バー */}
            {availableEvents.length > 1 && (
              <div className="rounded-2xl border border-border bg-card p-2.5 shadow-2xs space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-black text-muted-foreground px-1">
                  <CalendarDays className="w-3.5 h-3.5 text-teal-600" />
                  <span>表示する遠征・配車予定を切り替え</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {availableEvents.map((ev) => {
                    const active = ev.eventId === effectiveEventId;
                    return (
                      <button
                        key={ev.eventId}
                        type="button"
                        onClick={() =>
                          router.replace(
                            `/liff/carpool?eventId=${encodeURIComponent(
                              ev.eventId
                            )}`
                          )
                        }
                        className={`px-3 py-1.5 rounded-xl border text-xs shrink-0 transition-colors cursor-pointer ${
                          active
                            ? "bg-[#0f172a] text-white border-[#0f172a] font-black"
                            : "bg-muted text-foreground border-border font-bold hover:bg-muted/80"
                        }`}
                      >
                        {ev.dateLabel} {ev.title} ({ev.carCount}台)
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 集合・経路概要カード（A-3 上帯ダークキャップ × 純白ボディ） */}
            <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-teal-500 text-slate-950 text-[11px] font-black">
                      🚗 {direction === "outbound" ? "行き便" : "帰り便"}
                    </span>
                    <span className="text-xs font-black text-slate-200 tabular-nums">
                      乗車 {totalPassengers} 名 / {carpoolInfo.cars.length} 台
                    </span>
                    {returnDiffCarCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-amber-400/40 text-[10px] font-black">
                        🔄 帰り変更 {returnDiffCarCount}台
                      </span>
                    )}
                  </div>

                  {effectiveCanEditCarpool && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditorInitialEventId(
                          carpoolInfo.eventId || eventIdParam || undefined
                        );
                        setIsEditorOpen(true);
                      }}
                      className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 text-[11px] font-black flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>配車を編集</span>
                    </button>
                  )}
                </div>

                <h2 className="text-base font-black text-white tracking-tight">
                  {carpoolInfo.eventTitle}
                </h2>
              </div>

              <div className="p-4 pt-3 space-y-2.5 text-xs font-bold">
                {/* 行き／帰り連動の進行ルートコールアウト */}
                <div
                  className={`p-3 rounded-xl bg-muted border border-border border-l-4 space-y-2 ${
                    direction === "outbound"
                      ? "border-l-teal-600"
                      : "border-l-amber-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/80">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-black ${
                        direction === "outbound"
                          ? "bg-teal-600 text-white"
                          : "bg-amber-500 text-slate-950"
                      }`}
                    >
                      <span>
                        {direction === "outbound"
                          ? "集合場所 ➔ 目的地"
                          : "目的地 ➔ 解散・集合場所"}
                      </span>
                    </span>
                    <span className="text-[10.5px] font-bold text-muted-foreground">
                      {direction === "outbound" ? "往路ルート" : "復路ルート"}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] text-muted-foreground block font-bold">
                        {direction === "outbound"
                          ? "集合・出発時間"
                          : "集合・出発時間（往路基準）"}
                      </span>
                      <span className="text-foreground font-black text-sm tabular-nums">
                        {carpoolInfo.gatherTime}
                      </span>
                    </div>
                  </div>

                  {direction === "outbound" ? (
                    <>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] text-teal-700 dark:text-teal-300 block font-black">
                            出発：集合場所
                          </span>
                          <span className="text-foreground font-black">
                            {carpoolInfo.gatherLocation}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 pl-1 text-[11px] font-black text-teal-700 dark:text-teal-300">
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        <span>移動（行き便）</span>
                      </div>

                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] text-primary block font-black">
                            到着：目的地（球場）
                          </span>
                          <span className="text-foreground font-black">
                            {carpoolInfo.destination}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] text-amber-800 dark:text-amber-300 block font-black">
                            出発：目的地（球場）
                          </span>
                          <span className="text-foreground font-black">
                            {carpoolInfo.destination}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 pl-1 text-[11px] font-black text-amber-700 dark:text-amber-300">
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        <span>帰路（帰り便）</span>
                      </div>

                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] text-teal-700 dark:text-teal-300 block font-black">
                            到着：解散・集合場所
                          </span>
                          <span className="text-foreground font-black">
                            {carpoolInfo.gatherLocation}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-start gap-2 pt-1.5 border-t border-border">
                  <Fuel className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-bold">
                      交通費精算の目安
                    </span>
                    <span className="text-foreground font-bold">
                      {carpoolInfo.costShare}
                    </span>
                  </div>
                </div>

                {/* 公式LINEカラー #06C755 の配車共有ボタン */}
                <div className="pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsShareModalOpen(true)}
                    className="w-full h-10 px-4 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 shrink-0" />
                    <span>LINEで配車共有（案内文作成・転送）</span>
                  </button>
                </div>
              </div>
            </section>

            {/* 行き便・帰り便 切り替えバー */}
            <div className="flex gap-1 bg-muted p-1 rounded-2xl border border-border">
              <button
                type="button"
                onClick={() => setDirection("outbound")}
                className={`flex-1 py-2 px-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  direction === "outbound"
                    ? "bg-card text-foreground shadow-sm border border-border font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                }`}
              >
                <Car
                  className={`w-3.5 h-3.5 shrink-0 ${
                    direction === "outbound"
                      ? "text-teal-600"
                      : "text-muted-foreground"
                  }`}
                />
                <span>行き便 (集合場所 ➔ 目的地)</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection("return")}
                className={`flex-1 py-2 px-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  direction === "return"
                    ? "bg-card text-foreground shadow-sm border border-border font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                }`}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 ${
                    direction === "return"
                      ? "text-amber-600"
                      : "text-muted-foreground"
                  }`}
                />
                <span>帰り便 (目的地 ➔ 解散場所)</span>
                {returnDiffCarCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black shrink-0 tabular-nums">
                    変更{returnDiffCarCount}
                  </span>
                )}
              </button>
            </div>

            {/* 🗺️ 遠征・隊列ライブマップ（行き/帰り方向 ＆ アクティブ乗車メンバー連動） */}
            <CarpoolConvoyLiveMap
              teamId={currentTeam?.id || "demo-team"}
              eventId={effectiveEventId}
              direction={direction}
              destinationText={carpoolInfo.destination}
              gatherLocationText={carpoolInfo.gatherLocation}
              cars={convoyCars}
              userId={profile?.userId}
              userName={profile?.displayName}
            />

            {/* 車両ごとの乗車割り当て ＆ 積載道具チェックカード */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2 px-1">
                <h3 className="text-xs font-black text-foreground">
                  車両ごとの乗車割り当て・積載（
                  {direction === "outbound" ? "行き便" : "帰り便"} /{" "}
                  {carpoolInfo.cars.length}台・計{totalPassengers}名）
                </h3>
                {direction === "return" && returnDiffCarCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[10.5px] font-black shrink-0">
                    🔄 {returnDiffCarCount}台で行き便から変更
                  </span>
                )}
              </div>

              {carpoolInfo.cars.map((car) => {
                const activePassengers = getCarActivePassengers(car);
                const isZeroSeatCargoOnly =
                  car.capacity === 0 && activePassengers.length === 0;
                const seatTotal = Math.max(
                  car.capacity,
                  activePassengers.length,
                  1
                );
                const isFull =
                  !isZeroSeatCargoOnly &&
                  activePassengers.length >= car.capacity;
                const remainSeats = Math.max(
                  0,
                  car.capacity - activePassengers.length
                );

                const eqList = car.equipments || [];
                const eqDoneCount = eqList.filter((eq) =>
                  direction === "outbound"
                    ? eq.status === "loaded" || eq.status === "returned"
                    : eq.status === "returned"
                ).length;
                const isAllEqDone =
                  eqList.length > 0 && eqDoneCount === eqList.length;

                return (
                  <div
                    key={car.carNumber}
                    className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
                  >
                    {/* 車両ヘッダー（A-3 上帯ダークキャップ） */}
                    <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-primary text-primary-foreground font-black text-xs flex items-center justify-center shrink-0 tabular-nums">
                          {car.carNumber}
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-sm font-black text-white tracking-tight truncate">
                            {car.driverName}
                          </h4>
                          <span className="text-[11px] font-bold text-slate-300 truncate block">
                            {car.carModel} ({car.plate})
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                        {car.hasReturnDiff && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black ${
                              direction === "return"
                                ? "bg-amber-400 text-slate-950"
                                : "bg-slate-800 text-amber-300 border border-amber-400/40"
                            }`}
                          >
                            🔄 帰り便変更あり
                          </span>
                        )}
                        {(car.isBus || car.capacity >= 11) && (
                          <span className="px-2 py-0.5 rounded bg-teal-400 text-slate-950 text-[10px] font-black">
                            🚌 バス
                          </span>
                        )}
                        {car.isCargo && (
                          <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black">
                            📦 道具車
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-black tabular-nums ${
                            isZeroSeatCargoOnly
                              ? "bg-slate-800 text-amber-300 border border-amber-400/40"
                              : isFull
                              ? "bg-emerald-500 text-slate-950"
                              : "bg-primary text-primary-foreground"
                          }`}
                        >
                          {isZeroSeatCargoOnly
                            ? "荷物専用 (0席)"
                            : isFull
                            ? `満席 ${activePassengers.length}/${car.capacity}`
                            : `残${remainSeats}席 (${activePassengers.length}/${car.capacity})`}
                        </span>
                      </div>
                    </div>

                    {/* 単色シートブロックゲージ ＆ 乗車メンバー一覧 ＆ 積載道具チェック */}
                    <div className="p-4 pt-3 space-y-3">
                      {isZeroSeatCargoOnly ? (
                        <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-black text-amber-900 dark:text-amber-300">
                          📦 道具・荷物運搬専用（運転手のみ乗車）
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black text-muted-foreground shrink-0">
                              座席状況（
                              {direction === "outbound" ? "行き便" : "帰り便"}）
                            </span>
                            {seatTotal <= 10 ? (
                              <div className="flex items-center gap-1">
                                {Array.from({ length: seatTotal }).map(
                                  (_, sIdx) => {
                                    const occupied =
                                      sIdx < activePassengers.length;
                                    return (
                                      <span
                                        key={sIdx}
                                        className={`w-5 h-2.5 rounded-xs ${
                                          occupied
                                            ? isFull
                                              ? "bg-emerald-600"
                                              : "bg-primary"
                                            : "bg-muted border border-border"
                                        }`}
                                      />
                                    );
                                  }
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-1 max-w-[220px]">
                                <div className="h-2.5 flex-1 rounded-full bg-muted border border-border overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      isFull ? "bg-emerald-600" : "bg-teal-600"
                                    }`}
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        Math.round(
                                          (activePassengers.length /
                                            Math.max(1, seatTotal)) *
                                            100
                                        )
                                      )}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-[11px] font-black tabular-nums text-foreground shrink-0">
                                  {activePassengers.length}/{seatTotal}席
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="space-y-1.5 pt-1 border-t border-border">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold text-muted-foreground">
                                {direction === "outbound"
                                  ? "行き便の同乗者一覧:"
                                  : "帰り便の同乗者一覧:"}
                              </span>
                              {direction === "return" && car.hasReturnDiff && (
                                <span className="text-[10px] font-black text-amber-700 dark:text-amber-300">
                                  ※行き便（{car.passengers.length}名）から個別変更
                                </span>
                              )}
                            </div>

                            {activePassengers.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {activePassengers.map((p, idx) => (
                                  <span
                                    key={`${p.name}-${idx}`}
                                    className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black ${
                                      p.type === "player"
                                        ? "bg-primary/12 text-primary border border-primary/30"
                                        : "bg-muted text-foreground border border-border"
                                    }`}
                                  >
                                    {p.name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] font-bold text-muted-foreground">
                                同乗者なし（運転手のみ）
                              </span>
                            )}
                          </div>
                        </>
                      )}

                      {/* 📦 積載道具・積み忘れ防止チェック */}
                      {eqList.length > 0 && (
                        <div className="pt-2.5 border-t border-border space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-black text-foreground flex items-center gap-1">
                              <Package className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span>📦 積載道具・積み忘れ防止チェック</span>
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10.5px] font-black tabular-nums shrink-0 ${
                                isAllEqDone
                                  ? "bg-emerald-600 text-white"
                                  : "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35"
                              }`}
                            >
                              {direction === "outbound"
                                ? `積載 ${eqDoneCount}/${eqList.length} 完了`
                                : `回収 ${eqDoneCount}/${eqList.length} 完了`}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {eqList.map((eqItem) => {
                              const lockKey = `${car.carNumber}:${eqItem.equipmentId}`;
                              const isSavingEq = Boolean(
                                updatingEquipIds[lockKey]
                              );
                              const isChecked =
                                direction === "outbound"
                                  ? eqItem.status === "loaded" ||
                                    eqItem.status === "returned"
                                  : eqItem.status === "returned";

                              return (
                                <button
                                  key={
                                    eqItem.eventEquipmentId || eqItem.equipmentId
                                  }
                                  type="button"
                                  disabled={isSavingEq}
                                  onClick={() =>
                                    void handleToggleEquipmentStatus(car, eqItem)
                                  }
                                  className={`w-full px-3 py-2 rounded-xl border text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer active:scale-[0.99] ${
                                    isChecked
                                      ? direction === "outbound"
                                        ? "bg-emerald-500/[0.10] border-emerald-600/45 text-foreground"
                                        : "bg-teal-500/[0.10] border-teal-600/45 text-foreground"
                                      : "bg-muted/55 hover:bg-muted border-border text-foreground"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                                        isChecked
                                          ? direction === "outbound"
                                            ? "bg-emerald-600 border-emerald-600 text-white"
                                            : "bg-teal-600 border-teal-600 text-white"
                                          : "bg-card border-slate-400 dark:border-slate-600 text-transparent"
                                      }`}
                                    >
                                      {isSavingEq ? (
                                        <Loader2 className="w-3 h-3 animate-spin text-foreground" />
                                      ) : (
                                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                                      )}
                                    </span>
                                    <span className="font-black truncate">
                                      {eqItem.name}
                                      {eqItem.quantity > 1
                                        ? ` ×${eqItem.quantity}`
                                        : ""}
                                    </span>
                                    {eqItem.isHeavy && (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9.5px] font-black shrink-0">
                                        重量
                                      </span>
                                    )}
                                  </div>

                                  <span
                                    className={`px-2 py-0.5 rounded text-[10.5px] font-black shrink-0 ${
                                      isChecked
                                        ? direction === "outbound"
                                          ? "bg-emerald-600 text-white"
                                          : "bg-teal-600 text-white"
                                        : "bg-card text-muted-foreground border border-border"
                                    }`}
                                  >
                                    {direction === "outbound"
                                      ? isChecked
                                        ? "積載済 ✓"
                                        : "未積載"
                                      : isChecked
                                      ? "返却・回収済 ✓"
                                      : "未回収"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>

            {/* 注意事項 */}
            {carpoolInfo?.notes && (
              <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden p-4 text-xs text-foreground">
                <div className="p-3 rounded-xl bg-amber-500/[0.06] dark:bg-amber-500/[0.10] border border-amber-500/20 border-l-4 border-l-amber-500 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-black text-amber-700 dark:text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>配車・送迎時の注意事項</span>
                  </div>
                  <p className="font-medium text-muted-foreground whitespace-pre-line leading-relaxed text-[11px]">
                    {carpoolInfo.notes}
                  </p>
                </div>
              </section>
            )}
          </>
        )}

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

      {/* 簡易配車エディタモーダル（createPortal + z-[9999]） */}
      {effectiveCanEditCarpool && isEditorOpen && (
        <SimpleCarpoolEditorModal
          isOpen={isEditorOpen}
          teamId={currentTeam?.id || "demo-team"}
          initialEventId={editorInitialEventId}
          onClose={() => {
            setIsEditorOpen(false);
            if (openEditorParam) {
              const cleanUrl = eventIdParam
                ? `/liff/carpool?eventId=${encodeURIComponent(eventIdParam)}`
                : "/liff/carpool";
              router.replace(cleanUrl);
            }
          }}
          onSaved={(savedEventId) => {
            setIsEditorOpen(false);
            setIsTestConvoyMode(false);
            const nextUrl = savedEventId
              ? `/liff/carpool?eventId=${encodeURIComponent(savedEventId)}`
              : "/liff/carpool";
            router.replace(nextUrl);
            void loadCarpool(savedEventId || "", true);
          }}
        />
      )}

      {/* 配車LINE共有モーダル（createPortal + z-[9999]） */}
      {isShareModalOpen && carpoolInfo && (
        <CarpoolSummaryShareModal
          isOpen={isShareModalOpen}
          carpool={carpoolInfo}
          liff={liff}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}
    </div>
  );
}

export default function LiffCarpoolPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1">
          <LiffHeader />
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">配車表を読み込み中...</span>
          </div>
        </div>
      }
    >
      <LiffCarpoolContent />
    </Suspense>
  );
}
