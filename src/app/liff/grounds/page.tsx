// filepath: src/app/liff/grounds/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { MapPin, Navigation, Car, AlertTriangle, Info, Check, ExternalLink, Loader2 } from "lucide-react";

interface VenueInfo {
  id: string;
  name: string;
  shortName: string;
  address: string;
  mapUrl: string;
  surface: string;
  spikeRule: string;
  parkingInfo: string;
  notes: string;
}

export default function LiffGroundsPage() {
  const { currentTeam } = useLiff();
  const [venues, setVenues] = useState<VenueInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  const loadGrounds = useCallback(async () => {
    try {
      setIsLoading(true);
      const teamId = currentTeam?.id || "demo-team";
      const res = await fetch(`/api/liff/grounds?teamId=${teamId}`);
      if (res.ok) {
        const data = await res.json() as { success: boolean; venues?: VenueInfo[] };
        if (data.venues && data.venues.length > 0) {
          setVenues(data.venues);
          setSelectedId(data.venues[0].id);
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

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader />

      <div className="p-4 space-y-5">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="駐車場 & 球場案内"
          subtitle="グラウンド情報・アクセス・駐車場ルール"
          icon={
            <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
              <MapPin className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【球場・駐車場案内】チーム利用グラウンド一覧`,
            text: `球場アクセス・駐車場ルール・スパイク指定の確認用です`,
          }}
        />
        {/* 球場選択リスト */}
        <div className="space-y-4">
          {venues.map((venue) => (
            <div
              key={venue.id}
              className="bg-card border border-border rounded-3xl p-4 shadow-xs space-y-3"
            >
              {/* 球場タイトル & ナビ起動ボタン */}
              <div className="flex items-start justify-between gap-2 pb-2 border-b border-border/60">
                <div>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black">
                    {venue.surface}
                  </span>
                  <h3 className="text-sm font-black text-foreground mt-1">
                    {venue.name}
                  </h3>
                  <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {venue.address}
                  </span>
                </div>

                <a
                  href={venue.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black shrink-0 active:scale-95 shadow-xs transition-all"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Map</span>
                </a>
              </div>

              {/* 駐車場情報 */}
              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-1 text-xs">
                <div className="flex items-center gap-1.5 font-black text-blue-700 dark:text-blue-400 text-[11px]">
                  <Car className="w-3.5 h-3.5 shrink-0" />
                  <span>駐車場ルール & 台数</span>
                </div>
                <p className="text-foreground font-medium text-[11px] leading-relaxed">
                  {venue.parkingInfo}
                </p>
              </div>

              {/* スパイク・施設注意事項 */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="text-[11px]">{venue.spikeRule}</span>
                </div>

                <div className="flex items-start gap-1.5 text-muted-foreground font-medium">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="text-[11px]">{venue.notes}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
