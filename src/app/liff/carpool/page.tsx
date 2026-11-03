// filepath: src/app/liff/carpool/page.tsx
"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { useLiff } from "@/components/liff/LiffProvider";
import { Car, Clock, MapPin, AlertCircle, Fuel, Loader2, Sparkles } from "lucide-react";

interface CarAssignment {
  carNumber: number;
  driverName: string;
  carModel: string;
  plate: string;
  capacity: number;
  passengers: { name: string; type: "player" | "adult" }[];
  isCargo?: boolean;
}

interface CarpoolData {
  eventTitle: string;
  date: string;
  gatherTime: string;
  gatherLocation: string;
  destination: string;
  costShare: string;
  notes: string;
  cars: CarAssignment[];
}

function LiffCarpoolContent() {
  const { currentTeam } = useLiff();
  const searchParams = useSearchParams();
  const eventIdParam = searchParams.get("eventId") || "";
  const [direction, setDirection] = useState<"outbound" | "return">("outbound");
  const [carpoolInfo, setCarpoolInfo] = useState<CarpoolData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCarpool = useCallback(async () => {
    try {
      setIsLoading(true);
      const teamId = currentTeam?.id || "demo-team";
      const eventQuery = eventIdParam
        ? `&eventId=${encodeURIComponent(eventIdParam)}`
        : "";
      const res = await fetch(
        `/api/liff/carpool?teamId=${encodeURIComponent(teamId)}${eventQuery}`
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
    loadCarpool();
  }, [loadCarpool]);

  const cars = carpoolInfo?.cars || [];
  const totalPassengers = cars.reduce(
    (acc, car) => acc + car.passengers.length,
    0
  );

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
        ) : !carpoolInfo || cars.length === 0 ? (
          /* 空ステート */
          <div className="space-y-3">
            <EmptyState
              icon={Car}
              title="配車表はまだ作成されていません"
              description="出欠の車出し回答をもとに、遠征の配車割り当てを自動作成できます"
            />
            <Link
              href="/liff/tools/carpool-generator"
              className="w-full h-10 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>自動配車ジェネレーターを開く</span>
            </Link>
          </div>
        ) : (
          <>
            {/* 集合概要カード（A-3 上帯ダークキャップ × 純白ボディ） */}
            <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 space-y-1">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-teal-500 text-slate-950 text-[11px] font-black">
                🚗 配車情報
              </span>
              <span className="text-xs font-black text-slate-200 tabular-nums">
                乗車 {totalPassengers} 名 / {carpoolInfo.cars.length} 台
              </span>
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
                    <span className="text-[10px] font-black text-muted-foreground">
                      座席状況
                    </span>
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

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>
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
