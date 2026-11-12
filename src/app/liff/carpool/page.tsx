// filepath: src/app/liff/carpool/page.tsx
"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { useLiff } from "@/components/liff/LiffProvider";
import { peekLiffApiCache } from "@/lib/liff/api-cache";
import {
  CarpoolConvoyLiveMap,
  type ConvoyCarItem,
} from "@/components/liff/CarpoolConvoyLiveMap";
import type { ConvoyAvailableEventOption } from "@/types/carpool-convoy";
import { Car, Clock, MapPin, AlertCircle, Fuel, Loader2, Sparkles, CalendarDays, Radio, X, Pencil, Plus } from "lucide-react";

const SimpleCarpoolEditorModal = dynamic(
  () => import("@/components/liff/SimpleCarpoolEditorModal").then((m) => m.SimpleCarpoolEditorModal),
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

interface CarAssignment {
  carpoolId?: string;
  carNumber: number;
  driverName: string;
  carModel: string;
  plate: string;
  capacity: number;
  passengers: { name: string; type: "player" | "adult" }[];
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
  const { currentTeam, profile } = useLiff();
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
  const [isLoading, setIsLoading] = useState<boolean>(() => !initialCachedCarpool);
  const [isTestConvoyMode, setIsTestConvoyMode] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorInitialEventId, setEditorInitialEventId] = useState<string | undefined>(undefined);

  useEffect(() => {
    setIsTestConvoyMode(false);
    setIsEditorOpen(false);
  }, [currentTeam?.id]);

  useEffect(() => {
    if (openEditorParam) {
      setEditorInitialEventId(eventIdParam || undefined);
      setIsEditorOpen(true);
    }
  }, [openEditorParam, eventIdParam]);

  const loadCarpool = useCallback(async (overrideEventId?: string, bypassCache?: boolean) => {
    try {
      const teamId = currentTeam?.id || "demo-team";
      const targetEvId = overrideEventId !== undefined ? overrideEventId : eventIdParam;
      const eventQuery = targetEvId
        ? `&eventId=${encodeURIComponent(targetEvId)}`
        : "";
      const url = `/api/liff/carpool?teamId=${encodeURIComponent(teamId)}${eventQuery}`;
      const syncCached = !bypassCache
        ? peekLiffApiCache<{ success: boolean; carpool?: CarpoolData }>(url)
        : null;
      if (syncCached) {
        setCarpoolInfo(syncCached.carpool ?? null);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }

      const res = await fetch(
        url,
        bypassCache ? { headers: { "x-iscore-bypass-cache": "1" } } : undefined
      );
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; carpool?: CarpoolData };
        if (data.carpool) {
          setCarpoolInfo(data.carpool);
        } else {
          setCarpoolInfo(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch carpool:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id, eventIdParam]);

  useEffect(() => {
    void loadCarpool();
  }, [loadCarpool]);

  const cars = carpoolInfo?.cars || [];
  const totalPassengers = cars.reduce(
    (acc, car) => acc + car.passengers.length,
    0
  );

  const effectiveEventId = carpoolInfo?.eventId || eventIdParam || "demo-event-carpool";
  const convoyCars: ConvoyCarItem[] = cars.map((car) => ({
    carpoolId: car.carpoolId || `car-${car.carNumber}`,
    carNumber: car.carNumber,
    driverName: car.driverName,
    carModel: car.carModel,
    plate: car.plate,
    capacity: car.capacity,
    passengers: car.passengers,
    isCargo: car.isCargo,
  }));
  const availableEvents = carpoolInfo?.availableEvents || [];

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="配車表 & 集合案内"
          subtitle={carpoolInfo?.date || "次回の配車情報"}
          icon={
            <span className="w-8 h-8 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black">
              <Car className="w-4 h-4" />
            </span>
          }
          showBack
          rightElement={
            <button
              type="button"
              onClick={() => {
                setEditorInitialEventId(carpoolInfo?.eventId || eventIdParam || undefined);
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
          }
          shareData={{
            title: `【配車表】${carpoolInfo?.date || ""} ${carpoolInfo?.eventTitle || ""}`,
            text: `集合: ${carpoolInfo?.gatherTime || ""} @ ${carpoolInfo?.gatherLocation || ""}\n乗車人数: 計${totalPassengers}名`,
          }}
        />

        {/* ローディング */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">配車表を読み込み中...</span>
          </div>
        ) : (!carpoolInfo || cars.length === 0) && !isTestConvoyMode ? (
          /* 空ステート ＋ 簡易配車作成 ＆ 隊列ライブマップ実機テスト起動カード */
          <div className="space-y-3">
            <EmptyState
              icon={Car}
              title="配車表はまだ作成されていません"
              description="下の「簡易配車を作成する」から、1号車〜N号車の運転手・乗車メンバーをすぐに登録して隊列ライブマップと連携できます"
            />

            {/* 🚗 簡易配車 作成カード（メインCTA） */}
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
                  予定を選んで（未登録ならその場で新規作成OK）、<strong className="text-foreground">各号車の運転手・定員・道具車・乗車メンバー（空席への自動セット対応）</strong>をスマホでサクッと作成できます。
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
                  配車データを登録する前でも、<strong className="text-foreground">Google Maps APIキーの設定・渋滞表示・スマホGPSでの位置共有・複数端末での同時追跡</strong>をお試しいただけます。
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

            <Link
              href="/liff/tools/carpool-generator"
              className="w-full h-10 px-4 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
            >
              <Sparkles className="w-4 h-4 shrink-0 text-teal-600" />
              <span>配車ジェネレーター（検討メモ）を見る</span>
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
                実際のチーム環境で <strong className="text-foreground">Googleマップ有効化（APIキー登録）</strong> や <strong className="text-foreground">位置共有ON・状況スタンプ</strong> を試せます。別スマホのメンバーと同時に開いて別々の号車を選べば、複数台の同時追跡もテストできます！
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
                <Car className={`w-3.5 h-3.5 shrink-0 ${direction === "outbound" ? "text-primary" : "text-muted-foreground"}`} />
                <span>行き便 (集合場所 ➔ 球場)</span>
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
                <Car className={`w-3.5 h-3.5 shrink-0 ${direction === "return" ? "text-primary" : "text-muted-foreground"}`} />
                <span>帰り便 (球場 ➔ 解散場所)</span>
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
                            `/liff/carpool?eventId=${encodeURIComponent(ev.eventId)}`
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

            {/* 集合概要カード（A-3 上帯ダークキャップ × 純白ボディ） */}
            <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-teal-500 text-slate-950 text-[11px] font-black">
                  🚗 配車情報
                </span>
                <span className="text-xs font-black text-slate-200 tabular-nums">
                  乗車 {totalPassengers} 名 / {carpoolInfo.cars.length} 台
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditorInitialEventId(carpoolInfo.eventId || eventIdParam || undefined);
                  setIsEditorOpen(true);
                }}
                className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 text-[11px] font-black flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Pencil className="w-3 h-3" />
                <span>配車を編集</span>
              </button>
            </div>

            <h2 className="text-base font-black text-white tracking-tight">
              {carpoolInfo.eventTitle}
            </h2>
          </div>

          <div className="p-4 pt-3 space-y-2.5 text-xs font-bold">
            {/* 集合場所案内コールアウト */}
            <div className="p-3 rounded-xl bg-muted border border-border border-l-4 border-l-primary space-y-2">
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] text-muted-foreground block font-bold">集合・出発時間</span>
                  <span className="text-foreground font-black text-sm tabular-nums">{carpoolInfo.gatherTime}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] text-muted-foreground block font-bold">集合場所 (出発地)</span>
                  <span className="text-foreground font-black">{carpoolInfo.gatherLocation}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] text-muted-foreground block font-bold">目的地 (球場)</span>
                  <span className="text-foreground font-black">{carpoolInfo.destination}</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 pt-1.5 border-t border-border">
              <Fuel className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-muted-foreground block font-bold">交通費精算の目安</span>
                <span className="text-foreground font-bold">{carpoolInfo.costShare}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 行き・帰りタブ切り替え */}
        <div className="flex gap-1 bg-muted p-1 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setDirection("outbound")}
            className={`flex-1 py-2 px-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${
              direction === "outbound"
                ? "bg-card text-foreground shadow-sm border border-border font-black"
                : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
            }`}
          >
            <Car className={`w-3.5 h-3.5 shrink-0 ${direction === "outbound" ? "text-primary" : "text-muted-foreground"}`} />
            <span>行き便 (集合場所 ➔ 球場)</span>
          </button>
          <button
            type="button"
            onClick={() => setDirection("return")}
            className={`flex-1 py-2 px-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${
              direction === "return"
                ? "bg-card text-foreground shadow-sm border border-border font-black"
                : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
            }`}
          >
            <Car className={`w-3.5 h-3.5 shrink-0 ${direction === "return" ? "text-primary" : "text-muted-foreground"}`} />
            <span>帰り便 (球場 ➔ 解散場所)</span>
          </button>
        </div>

        {/* 🗺️ 遠征・隊列ライブマップ（折りたたみ／展開対応・Google Maps JS API + 渋滞表示 + 同乗者発信） */}
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

        {/* 車両ごとの乗車割り当てカード */}
        <section className="space-y-3">
          <h3 className="text-xs font-black text-foreground px-1">
            車両ごとの乗車割り当て ({carpoolInfo.cars.length}台)
          </h3>

          {carpoolInfo.cars.map((car) => {
            const seatTotal = Math.max(car.capacity, car.passengers.length, 1);
            const isFull = car.passengers.length >= car.capacity;
            const remainSeats = Math.max(0, car.capacity - car.passengers.length);
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

                  <div className="flex items-center gap-1.5 shrink-0">
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
                        isFull
                          ? "bg-emerald-500 text-slate-950"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {isFull ? `満席 ${car.passengers.length}/${car.capacity}` : `残${remainSeats}席 (${car.passengers.length}/${car.capacity})`}
                    </span>
                  </div>
                </div>

                {/* 単色シートブロックゲージ ＆ 乗車メンバー一覧 */}
                <div className="p-4 pt-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black text-muted-foreground shrink-0">
                      座席状況
                    </span>
                    {seatTotal <= 10 ? (
                      <div className="flex items-center gap-1">
                        {Array.from({ length: seatTotal }).map((_, sIdx) => {
                          const occupied = sIdx < car.passengers.length;
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
                        })}
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
                                  (car.passengers.length /
                                    Math.max(1, seatTotal)) *
                                    100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-black tabular-nums text-foreground shrink-0">
                          {car.passengers.length}/{seatTotal}席
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-1 border-t border-border">
                    <span className="text-[10px] font-bold text-muted-foreground block">
                      同乗者一覧:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {car.passengers.map((p, idx) => (
                        <span
                          key={idx}
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
                  </div>
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

        <div className="h-8 w-full shrink-0 pointer-events-none select-none" aria-hidden="true" />
      </div>

      {/* 簡易配車エディタモーダル（createPortal + z-[9999]） */}
      {isEditorOpen && (
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
