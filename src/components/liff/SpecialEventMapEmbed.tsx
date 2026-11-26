// filepath: src/components/liff/SpecialEventMapEmbed.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
} from "lucide-react";
import {
  buildGoogleMapsEmbedFromUrl,
  extractDirectionsTargetFromUrl,
  isGoogleMapsShortUrl,
  normalizeRawMapUrlInput,
} from "@/lib/google-maps";
import { cn } from "@/lib/utils";

const CLIENT_RESOLVED_EMBED_CACHE = new Map<string, string>();

function isGoogleMapsFamilyUrl(urlStr: string): boolean {
  if (!urlStr) return false;
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    if (host === "maps.app.goo.gl" || host === "goo.gl") return true;
    if (
      /^(?:(?:www|maps)\.)?google\.(?:com|co\.jp|[a-z]{2,3}(?:\.[a-z]{2})?)$/i.test(
        host
      )
    ) {
      return (
        host.startsWith("maps.") ||
        parsed.pathname.startsWith("/maps") ||
        /[?&](q|query|ll|cid|destination|daddr)=/i.test(parsed.search)
      );
    }
    return false;
  } catch {
    return false;
  }
}

export interface ResolvedSpecialEventMapInfo {
  hasVenueOrLink: boolean;
  hasMapEmbed: boolean;
  embedUrl: string;
  canToggleLayer: boolean;
  externalMapUrl: string;
  directionsUrl: string;
  externalSiteUrl: string;
}

export function resolveSpecialEventMapInfo(params: {
  location?: string | null;
  locationUrl?: string | null;
  embedMapUrl?: string | null;
  layer?: "roadmap" | "satellite";
}): ResolvedSpecialEventMapInfo {
  const cleanLocation = (params.location || "").trim();
  const normalizedUrl = normalizeRawMapUrlInput(params.locationUrl);
  const layer = params.layer || "roadmap";

  const isGoogleUrl = isGoogleMapsFamilyUrl(normalizedUrl);
  const directEmbed =
    (params.embedMapUrl || "").trim() ||
    buildGoogleMapsEmbedFromUrl(normalizedUrl);

  const canToggleLayer =
    Boolean(directEmbed) &&
    directEmbed.includes("output=embed") &&
    !directEmbed.includes("/maps/embed?pb=");

  const embedUrl =
    canToggleLayer && layer === "satellite"
      ? `${directEmbed}&t=h`
      : directEmbed;

  const pinTarget = extractDirectionsTargetFromUrl(
    directEmbed || normalizedUrl
  );
  const navTarget = pinTarget || (directEmbed ? cleanLocation : "");

  let externalMapUrl = "";
  let externalSiteUrl = "";

  if (normalizedUrl) {
    if (isGoogleUrl || Boolean(directEmbed)) {
      if (normalizedUrl.includes("/maps/embed")) {
        externalMapUrl = navTarget
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              navTarget
            )}`
          : "https://maps.google.com";
      } else {
        externalMapUrl = normalizedUrl;
      }
    } else {
      externalSiteUrl = normalizedUrl;
    }
  }

  const directionsUrl = navTarget
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        navTarget
      )}`
    : "";

  return {
    hasVenueOrLink: Boolean(cleanLocation || normalizedUrl || directEmbed),
    hasMapEmbed: Boolean(embedUrl),
    embedUrl,
    canToggleLayer,
    externalMapUrl,
    directionsUrl,
    externalSiteUrl,
  };
}

interface SpecialEventLocationMapCardProps {
  location?: string | null;
  locationUrl?: string | null;
  embedMapUrl?: string | null;
  /** 初期描画から即座に iframe をマウントするか（個別指定カード・プレビュー用） */
  eager?: boolean;
  /** 回答モーダル内など、タップで地図を開閉するコンパクトモード */
  collapsible?: boolean;
  /** 作成・編集モーダル内のリアルタイム地図プレビュー用 */
  previewOnly?: boolean;
  locationLabel?: string;
  fallbackLocationText?: string;
  className?: string;
}

/**
 * 🗺️ 行事・アンケートの会場案内 ＆ Google Map 埋め込み表示カード（A-3 ソリッド規格）
 * - GoogleマップURL（短縮URL `maps.app.goo.gl`・通常URL・`<iframe>` コード対応）が設定されている場合は地図を直接表示
 * - `IntersectionObserver` ヒステリシス制御により画面外スクロール時は iframe をアンマウントして省電力化
 */
export function SpecialEventLocationMapCard({
  location,
  locationUrl,
  embedMapUrl,
  eager = false,
  collapsible = false,
  previewOnly = false,
  locationLabel = "会場・お店",
  fallbackLocationText = "未定・確認中",
  className,
}: SpecialEventLocationMapCardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldMountMap, setShouldMountMap] = useState<boolean>(
    eager || previewOnly
  );
  const [isExpanded, setIsExpanded] = useState<boolean>(!collapsible);
  const [layer, setLayer] = useState<"roadmap" | "satellite">("roadmap");
  const [dynamicEmbedUrl, setDynamicEmbedUrl] = useState<string>("");
  const [isResolvingShortUrl, setIsResolvingShortUrl] =
    useState<boolean>(false);

  const normalizedInputUrl = useMemo(
    () => normalizeRawMapUrlInput(locationUrl),
    [locationUrl]
  );

  // 短縮URL（maps.app.goo.gl 等）で embedMapUrl が未解決の場合はオンデマンド解決（キャッシュ付）
  useEffect(() => {
    if (!normalizedInputUrl) {
      setDynamicEmbedUrl("");
      setIsResolvingShortUrl(false);
      return;
    }
    if (embedMapUrl && embedMapUrl.trim()) {
      setDynamicEmbedUrl(embedMapUrl.trim());
      setIsResolvingShortUrl(false);
      return;
    }
    const localSync = buildGoogleMapsEmbedFromUrl(normalizedInputUrl);
    if (localSync) {
      setDynamicEmbedUrl(localSync);
      setIsResolvingShortUrl(false);
      return;
    }
    if (!isGoogleMapsShortUrl(normalizedInputUrl)) {
      setDynamicEmbedUrl("");
      setIsResolvingShortUrl(false);
      return;
    }

    const cached = CLIENT_RESOLVED_EMBED_CACHE.get(normalizedInputUrl);
    if (cached !== undefined) {
      setDynamicEmbedUrl(cached);
      setIsResolvingShortUrl(false);
      return;
    }

    let cancelled = false;
    setIsResolvingShortUrl(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/liff/special-events/resolve-map?url=${encodeURIComponent(
            normalizedInputUrl
          )}`
        );
        const json = (await res.json()) as {
          success?: boolean;
          embedMapUrl?: string;
        };
        if (cancelled) return;
        const resolved = (json.embedMapUrl || "").trim();
        CLIENT_RESOLVED_EMBED_CACHE.set(normalizedInputUrl, resolved);
        setDynamicEmbedUrl(resolved);
      } catch {
        if (!cancelled) setDynamicEmbedUrl("");
      } finally {
        if (!cancelled) setIsResolvingShortUrl(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [embedMapUrl, normalizedInputUrl]);

  const mapInfo = useMemo(
    () =>
      resolveSpecialEventMapInfo({
        location,
        locationUrl: normalizedInputUrl,
        embedMapUrl: embedMapUrl || dynamicEmbedUrl,
        layer,
      }),
    [dynamicEmbedUrl, embedMapUrl, layer, location, normalizedInputUrl]
  );

  const showMapFrame =
    (mapInfo.hasMapEmbed || isResolvingShortUrl) &&
    (previewOnly || !collapsible || isExpanded);

  // 省電力・メモリ保護（ヒステリシス付き IntersectionObserver）
  useEffect(() => {
    if (!showMapFrame) return;
    if (eager || previewOnly) {
      setShouldMountMap(true);
      return;
    }
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShouldMountMap(true);
      return;
    }
    const margin = shouldMountMap ? "850px 0px" : "300px 0px";
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (!shouldMountMap && entry.isIntersecting) {
          setShouldMountMap(true);
        } else if (shouldMountMap && !entry.isIntersecting) {
          setShouldMountMap(false);
        }
      },
      { rootMargin: margin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager, previewOnly, shouldMountMap, showMapFrame]);

  if (previewOnly) {
    if (!normalizedInputUrl) return null;
    if (!mapInfo.hasMapEmbed && !isResolvingShortUrl) {
      if (mapInfo.externalSiteUrl) {
        return (
          <div className="px-2.5 py-2 rounded-xl border border-border bg-muted/30 flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-muted-foreground">
              外部WebページURLとして案内ボタンを表示します（地図埋め込みはGoogleマップURLで有効）
            </span>
            <a
              href={mapInfo.externalSiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 rounded-lg bg-slate-800 text-white text-[10px] font-black inline-flex items-center gap-1 shrink-0"
            >
              <span>確認</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        );
      }
      return null;
    }

    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-card overflow-hidden shadow-2xs",
          className
        )}
      >
        <div className="px-3 py-1.5 bg-[#0f172a] text-slate-50 border-b-2 border-[#1A73E8] flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-black flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>案内ページに表示される地図プレビュー</span>
          </span>
          {mapInfo.externalMapUrl && (
            <a
              href={mapInfo.externalMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-0.5 rounded-md bg-[#1A73E8] hover:bg-[#1557B0] text-white text-[9.5px] font-black inline-flex items-center gap-0.5 shrink-0"
            >
              <span>Googleマップで確認</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
        <div
          ref={containerRef}
          className="relative w-full h-[175px] bg-muted/40 overflow-hidden"
        >
          {isResolvingShortUrl ? (
            <div className="w-full h-full flex items-center justify-center gap-1.5 text-muted-foreground text-xs font-bold">
              <Loader2 className="w-4 h-4 animate-spin text-[#1A73E8]" />
              <span>Googleマップの位置情報を取得中...</span>
            </div>
          ) : (
            <iframe
              src={mapInfo.embedUrl}
              title={`${location || "会場"} 地図プレビュー`}
              loading="eager"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              className="block w-full h-full border-0"
            />
          )}
          {!isResolvingShortUrl && mapInfo.canToggleLayer && (
            <div className="absolute top-2 right-2 z-10 inline-flex rounded-lg border border-slate-700 bg-[#0f172a] p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setLayer("roadmap")}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[9.5px] font-black transition-colors cursor-pointer",
                  layer === "roadmap"
                    ? "bg-teal-500 text-slate-950"
                    : "text-slate-200 hover:text-white"
                )}
              >
                地図
              </button>
              <button
                type="button"
                onClick={() => setLayer("satellite")}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[9.5px] font-black transition-colors cursor-pointer",
                  layer === "satellite"
                    ? "bg-teal-500 text-slate-950"
                    : "text-slate-200 hover:text-white"
                )}
              >
                航空写真
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card overflow-hidden",
        className
      )}
    >
      {/* 会場・お店情報ヘッダー行 */}
      <div className="p-2.5 sm:p-3 bg-muted/35 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-muted-foreground block">
              {locationLabel}
            </span>
            <span className="text-xs font-black text-foreground block break-words">
              {(location || "").trim() || fallbackLocationText}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {collapsible && mapInfo.hasMapEmbed && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground text-[10.5px] font-black inline-flex items-center gap-1 cursor-pointer"
            >
              <MapPin className="w-3 h-3 text-[#1A73E8] shrink-0" />
              <span>{isExpanded ? "地図を閉じる" : "地図を表示"}</span>
              {isExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}

          {mapInfo.directionsUrl && mapInfo.hasMapEmbed && (
            <a
              href={mapInfo.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground text-[10.5px] font-black inline-flex items-center gap-1"
            >
              <Navigation className="w-3 h-3 text-[#1A73E8] shrink-0" />
              <span>ルート案内</span>
            </a>
          )}

          {mapInfo.externalMapUrl && (
            <a
              href={mapInfo.externalMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-[10.5px] font-black inline-flex items-center gap-1"
            >
              <span>Googleマップ</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          )}

          {mapInfo.externalSiteUrl && (
            <a
              href={mapInfo.externalSiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-[10.5px] font-black inline-flex items-center gap-1"
            >
              <span>お店・会場URL</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          )}
        </div>
      </div>

      {/* 埋め込み Google Map */}
      {showMapFrame && (
        <div
          ref={containerRef}
          className="relative w-full h-[195px] sm:h-[230px] bg-muted/40 border-t border-border overflow-hidden"
        >
          {isResolvingShortUrl ? (
            <div className="w-full h-full flex items-center justify-center gap-1.5 text-muted-foreground text-[11px] font-bold">
              <Loader2 className="w-4 h-4 animate-spin text-[#1A73E8]" />
              <span>地図を読み込み中...</span>
            </div>
          ) : shouldMountMap ? (
            <iframe
              src={mapInfo.embedUrl}
              title={`${(location || "").trim() || "会場"} Google Map`}
              loading={eager ? "eager" : "lazy"}
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              className="block w-full h-full border-0"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center gap-1.5 text-muted-foreground text-[11px] font-bold">
              <MapPin className="w-4 h-4 text-[#1A73E8]" />
              <span>地図を読み込み中...</span>
            </div>
          )}

          {!isResolvingShortUrl && mapInfo.canToggleLayer && (
            <div className="absolute top-2.5 right-2.5 z-10 inline-flex rounded-lg border border-slate-700 bg-[#0f172a] p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setLayer("roadmap")}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-black transition-colors cursor-pointer",
                  layer === "roadmap"
                    ? "bg-teal-500 text-slate-950"
                    : "text-slate-200 hover:text-white"
                )}
              >
                地図
              </button>
              <button
                type="button"
                onClick={() => setLayer("satellite")}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-black transition-colors cursor-pointer",
                  layer === "satellite"
                    ? "bg-teal-500 text-slate-950"
                    : "text-slate-200 hover:text-white"
                )}
              >
                航空写真
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
