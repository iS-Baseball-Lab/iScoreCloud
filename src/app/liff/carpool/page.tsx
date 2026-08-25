// filepath: src/app/liff/carpool/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { Car, Clock, MapPin, Users, AlertCircle, ChevronRight, Fuel, Phone, Shield, Loader2 } from "lucide-react";

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

export default function LiffCarpoolPage() {
  const { currentTeam } = useLiff();
  const [direction, setDirection] = useState<"outbound" | "return">("outbound");
  const [carpoolInfo, setCarpoolInfo] = useState<CarpoolData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCarpool = useCallback(async () => {
    try {
      setIsLoading(true);
      const teamId = currentTeam?.id || "demo-team";
      const res = await fetch(`/api/liff/carpool?teamId=${teamId}`);
      if (res.ok) {
        const data = await res.json() as { success: boolean; carpool?: CarpoolData };
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
  }, [currentTeam?.id]);

  useEffect(() => {
    loadCarpool();
  }, [loadCarpool]);

  const cars = carpoolInfo?.cars || [];
  const totalPassengers = cars.reduce(
    (acc, car) => acc + car.passengers.length,
    0
  );

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader />

      <div className="p-4 space-y-5">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="配車表 & 集合案内"
          subtitle={carpoolInfo?.date || "次回の配車情報"}
          icon={
            <span className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black">
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
          <div className="flex flex-col items-center justify-center py-16 text-center bg-card border border-border rounded-3xl p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
              <Car className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-foreground">配車表はまだ作成されていません</h4>
              <p className="text-xs font-bold text-muted-foreground">
                管理者がWeb版から配車割り当てを行うと、ここに自動反映されます。
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* 集合概要カード */}
            <section className="bg-card border-2 border-primary/40 rounded-3xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-black">
              🚗 配車情報
            </span>
            <span className="text-xs font-bold text-muted-foreground">
              乗車 {totalPassengers} 名 / {carpoolInfo.cars.length} 台
            </span>
          </div>

          <h2 className="text-base font-black text-foreground tracking-tight">
            {carpoolInfo.eventTitle}
          </h2>

          <div className="space-y-2 text-xs font-bold pt-1">
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-muted-foreground block font-bold">集合・出発時間</span>
                <span className="text-foreground font-black text-sm">{carpoolInfo.gatherTime}</span>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-muted-foreground block font-bold">集合場所 (出発地)</span>
                <span className="text-foreground font-black">{carpoolInfo.gatherLocation}</span>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-muted-foreground block font-bold">目的地 (球場)</span>
                <span className="text-foreground font-black">{carpoolInfo.destination}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 pt-1 border-t border-border/50">
              <Fuel className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-muted-foreground block font-bold">交通費精算の目安</span>
                <span className="text-foreground font-bold">{carpoolInfo.costShare}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 行き・帰りタブ切り替え */}
        <div className="flex p-1 bg-muted/60 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setDirection("outbound")}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
              direction === "outbound"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            行き便 (集合場所 ➔ 球場)
          </button>
          <button
            type="button"
            onClick={() => setDirection("return")}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
              direction === "return"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            帰り便 (球場 ➔ 解散場所)
          </button>
        </div>

        {/* 車両ごとの乗車割り当てカード */}
        <section className="space-y-3">
          <h3 className="text-xs font-black text-foreground px-1">
            車両ごとの乗車割り当て ({carpoolInfo.cars.length}台)
          </h3>

          {carpoolInfo.cars.map((car) => (
            <div
              key={car.carNumber}
              className="bg-card border border-border rounded-2xl p-4 shadow-xs space-y-3 overflow-hidden"
            >
              {/* 車両ヘッダー */}
              <div className="flex items-center justify-between pb-2 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                    {car.carNumber}
                  </span>
                  <div>
                    <h4 className="text-sm font-black text-foreground tracking-tight">
                      {car.driverName}
                    </h4>
                    <span className="text-[11px] font-bold text-muted-foreground">
                      {car.carModel} ({car.plate})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {car.isCargo && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-black border border-amber-500/30">
                      📦 道具車
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-md bg-muted text-foreground text-xs font-black">
                    {car.passengers.length} / {car.capacity} 名
                  </span>
                </div>
              </div>

              {/* 乗車メンバー一覧 */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-muted-foreground block">
                  同乗者一覧:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {car.passengers.map((p, idx) => (
                    <span
                      key={idx}
                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
                        p.type === "player"
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-muted text-foreground border border-border"
                      }`}
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* 注意事項 */}
        {carpoolInfo?.notes && (
          <section className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
            <div className="flex items-center gap-1.5 font-black text-amber-700 dark:text-amber-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>配車・送迎時の注意事項</span>
            </div>
            <p className="font-medium whitespace-pre-line leading-relaxed text-[11px]">
              {carpoolInfo.notes}
            </p>
          </section>
        )}
          </>
        )}
      </div>
    </div>
  );
}
