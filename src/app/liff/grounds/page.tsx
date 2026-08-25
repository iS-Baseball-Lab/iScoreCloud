// filepath: src/app/liff/grounds/page.tsx
"use client";

import React, { useState } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { MapPin, Navigation, Car, AlertTriangle, Info, Check, ExternalLink } from "lucide-react";

interface VenueInfo {
  id: string;
  name: string;
  shortName: string;
  address: string;
  mapUrl: string;
  surface: string; // "dirt" | "turf" | "grass"
  spikeRule: string;
  parkingInfo: string;
  notes: string;
}

export default function LiffGroundsPage() {
  const [selectedId, setSelectedId] = useState<string>("venue-1");

  const venues: VenueInfo[] = [
    {
      id: "venue-1",
      name: "多摩川緑地野球場 (多摩川緑地広場)",
      shortName: "多摩川緑地 (1面・2面)",
      address: "神奈川県川崎市高津区二子地先",
      mapUrl: "https://maps.google.com/?q=多摩川緑地野球場",
      surface: "土 (内野) / 天然芝 (外野)",
      spikeRule: "金具スパイク可 / ポイント推奨",
      parkingInfo: "第1駐車場（土日祝は1台500円）。チーム枠4台まで。河川敷道路は徐行厳守。",
      notes: "水道あり・簡易トイレあり。自販機は土手上にあり。雨天後はグラウンド水はけ注意。",
    },
    {
      id: "venue-2",
      name: "川崎市等々力球場",
      shortName: "等々力球場",
      address: "神奈川県川崎市中原区等々力1-1",
      mapUrl: "https://maps.google.com/?q=等々力球場",
      surface: "人工芝 (全面)",
      spikeRule: "⚠️ 金具スパイク禁止 (ポイント・アップシューズのみ)",
      parkingInfo: "等々力緑地公園 東駐車場を利用（有料）。満車の可能性が高いため乗り合い必須。",
      notes: "屋根付きスタンドあり。更衣室・シャワー完備。敷地内全面禁煙。",
    },
    {
      id: "venue-3",
      name: "川崎市立桜本小学校 グラウンド",
      shortName: "桜本小 (ホーム)",
      address: "神奈川県川崎市川崎区桜本1-10-1",
      mapUrl: "https://maps.google.com/?q=川崎市立桜本小学校",
      surface: "土 (クレー)",
      spikeRule: "ポイントスパイクまたはトレーニングシューズ",
      parkingInfo: "正門から入り体育館裏へ（事前登録車のみ3台まで駐車可）。近隣コインPあり。",
      notes: "学校敷地内です。近隣住宅へのボール飛び出し防止ネットの確認必須。ゴミは全て持ち帰り。",
    },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader
        title="駐車場 & 球場案内"
        subtitle="グラウンド情報・アクセス"
        showBack
        shareData={{
          title: `【球場・駐車場案内】チーム利用グラウンド一覧`,
          text: `球場アクセス・駐車場ルール・スパイク指定の確認用です`,
        }}
      />

      <div className="p-4 space-y-5">
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
