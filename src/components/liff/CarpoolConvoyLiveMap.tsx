// filepath: src/components/liff/CarpoolConvoyLiveMap.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { LiffSelect } from "@/components/liff/LiffSelect";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import {
  Car,
  ChevronDown,
  ChevronUp,
  Crosshair,
  ExternalLink,
  KeyRound,
  Loader2,
  MapPin,
  Navigation,
  Radio,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  ConvoyDirection,
  ConvoySnapshotResponse,
  ConvoyVehicleLiveState,
  ConvoyVehicleStatus,
} from "@/types/carpool-convoy";

export interface ConvoyCarItem {
  carpoolId: string;
  carNumber: number;
  driverName: string;
  carModel: string;
  plate: string;
  capacity: number;
  passengers: { name: string; type: "player" | "adult" }[];
  isCargo?: boolean;
}

interface CarpoolConvoyLiveMapProps {
  teamId: string;
  eventId: string;
  direction: ConvoyDirection;
  destinationText: string;
  gatherLocationText: string;
  cars: ConvoyCarItem[];
  userId?: string | null;
  userName?: string | null;
}

// ==========================================
// 軽量 Google Maps JavaScript API 型定義（外部パッケージ不要・any完全排除）
// ==========================================
interface GoogleLatLngLiteral {
  lat: number;
  lng: number;
}

interface GoogleLatLngObj {
  lat(): number;
  lng(): number;
}

interface GoogleLatLngBoundsInstance {
  extend(point: GoogleLatLngLiteral): void;
  isEmpty(): boolean;
}

interface GoogleMapInstance {
  setCenter(latlng: GoogleLatLngLiteral): void;
  panTo(latlng: GoogleLatLngLiteral): void;
  setZoom(zoom: number): void;
  setMapTypeId(mapTypeId: "roadmap" | "hybrid"): void;
  fitBounds(bounds: GoogleLatLngBoundsInstance, padding?: number): void;
  addListener(eventName: string, handler: () => void): { remove(): void };
}

interface GoogleMarkerIconSpec {
  url: string;
  scaledSize: unknown;
  anchor: unknown;
}

interface GoogleMarkerInstance {
  setPosition(latlng: GoogleLatLngLiteral): void;
  setIcon(icon: GoogleMarkerIconSpec): void;
  setZIndex(zIndex: number): void;
  setMap(map: GoogleMapInstance | null): void;
  addListener(eventName: string, handler: () => void): { remove(): void };
}

interface GoogleTrafficLayerInstance {
  setMap(map: GoogleMapInstance | null): void;
}

interface GoogleGeocoderResultItem {
  geometry?: {
    location?: GoogleLatLngObj;
  };
}

interface GoogleMapsNamespace {
  Map: new (
    el: HTMLElement,
    opts: {
      center: GoogleLatLngLiteral;
      zoom: number;
      mapTypeId: "roadmap" | "hybrid";
      disableDefaultUI: boolean;
      zoomControl: boolean;
      clickableIcons: boolean;
      gestureHandling: "greedy" | "cooperative";
    }
  ) => GoogleMapInstance;
  Marker: new (opts: {
    position: GoogleLatLngLiteral;
    map: GoogleMapInstance;
    icon: GoogleMarkerIconSpec;
    zIndex?: number;
    title?: string;
  }) => GoogleMarkerInstance;
  TrafficLayer: new () => GoogleTrafficLayerInstance;
  LatLngBounds: new () => GoogleLatLngBoundsInstance;
  Size: new (width: number, height: number) => unknown;
  Point: new (x: number, y: number) => unknown;
  Geocoder: new () => {
    geocode(
      request: { address: string; region?: string },
      callback: (
        results: GoogleGeocoderResultItem[] | null,
        status: string
      ) => void
    ): void;
  };
}

interface WindowWithGoogleMaps extends Window {
  google?: {
    maps?: GoogleMapsNamespace;
  };
  gm_authFailure?: () => void;
}

// ==========================================
// Google Maps JS スクリプト単一ローダー
// ==========================================
let loadedScriptKey: string | null = null;
let googleMapsLoadPromise: Promise<GoogleMapsNamespace> | null = null;
const authFailureListeners = new Set<() => void>();

function loadGoogleMapsApi(apiKey: string): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("SSR"));
  }
  const win = window as WindowWithGoogleMaps;

  win.gm_authFailure = () => {
    authFailureListeners.forEach((fn) => fn());
  };

  if (win.google?.maps && loadedScriptKey === apiKey) {
    return Promise.resolve(win.google.maps);
  }

  if (googleMapsLoadPromise && loadedScriptKey === apiKey) {
    return googleMapsLoadPromise;
  }

  // 別キーに更新された場合は旧スクリプトタグを除去して再読込可能にする
  const existingScript = document.getElementById("iscore-google-maps-js");
  if (existingScript && loadedScriptKey && loadedScriptKey !== apiKey) {
    existingScript.remove();
    delete win.google;
    googleMapsLoadPromise = null;
  }

  loadedScriptKey = apiKey;
  googleMapsLoadPromise = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    if (win.google?.maps) {
      resolve(win.google.maps);
      return;
    }

    const script = document.createElement("script");
    script.id = "iscore-google-maps-js";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&language=ja&region=JP&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (win.google?.maps) {
        resolve(win.google.maps);
      } else {
        googleMapsLoadPromise = null;
        reject(new Error("Google Maps SDK initialized without maps object"));
      }
    };
    script.onerror = () => {
      googleMapsLoadPromise = null;
      reject(new Error("Failed to load Google Maps script"));
    };
    document.head.appendChild(script);
  });

  return googleMapsLoadPromise;
}

// ==========================================
// 距離計算・マーカーSVG生成ヘルパー
// ==========================================
const STALE_THRESHOLD_MS = 90_000; // 90秒以上更新がない場合は「最終通過地点」表示
const GEOCODE_CACHE_PREFIX = "iscore_convoy_geo_v1:";

function haversineDistanceKm(
  a: GoogleLatLngLiteral,
  b: GoogleLatLngLiteral
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function estimateRoadKmAndEta(
  from: GoogleLatLngLiteral,
  to: GoogleLatLngLiteral,
  status: ConvoyVehicleStatus
): { roadKm: number; etaMin: number } {
  const straightKm = haversineDistanceKm(from, to);
  const roadKm = Math.max(0.1, straightKm * 1.28);
  const minPerKm = status === "jam" ? 2.8 : status === "rest" ? 2.5 : 1.9;
  const etaMin = Math.max(1, Math.round(roadKm * minPerKm));
  return { roadKm, etaMin };
}

function formatUpdatedAgo(updatedAt: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - updatedAt) / 1000));
  if (diffSec < 8) return "たった今";
  if (diffSec < 60) return `${diffSec}秒前`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  return `${diffHour}時間前`;
}

interface StatusVisualTheme {
  pinFill: string;
  badgeBgClass: string;
  badgeTextClass: string;
  shortLabel: string;
}

function getStatusVisual(
  status: ConvoyVehicleStatus,
  isStale: boolean,
  staleAgoLabel: string
): StatusVisualTheme {
  if (isStale && status !== "arrived") {
    return {
      pinFill: "#64748b",
      badgeBgClass: "bg-slate-200 dark:bg-slate-700",
      badgeTextClass: "text-slate-800 dark:text-slate-100",
      shortLabel: `📡 ${staleAgoLabel}`,
    };
  }
  switch (status) {
    case "arrived":
      return {
        pinFill: "#059669",
        badgeBgClass: "bg-emerald-500/15 border border-emerald-500/30",
        badgeTextClass: "text-emerald-700 dark:text-emerald-300",
        shortLabel: "🏁 到着済",
      };
    case "jam":
      return {
        pinFill: "#d97706",
        badgeBgClass: "bg-amber-500/15 border border-amber-500/30",
        badgeTextClass: "text-amber-700 dark:text-amber-300",
        shortLabel: "🐢 渋滞中",
      };
    case "rest":
      return {
        pinFill: "#7c3aed",
        badgeBgClass: "bg-violet-500/15 border border-violet-500/30",
        badgeTextClass: "text-violet-700 dark:text-violet-300",
        shortLabel: "🏪 休憩中",
      };
    default:
      return {
        pinFill: "#2563eb",
        badgeBgClass: "bg-blue-500/15 border border-blue-500/30",
        badgeTextClass: "text-blue-700 dark:text-blue-300",
        shortLabel: "🚗 順調",
      };
  }
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildVehicleMarkerSvgDataUrl(opts: {
  carNumber: number;
  label: string;
  fill: string;
  isSelected: boolean;
  isMine: boolean;
}): string {
  const pillW = 92;
  const svgW = 104;
  const svgH = 66;
  const cx = svgW / 2;
  const cy = 46;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
    <rect x="${(svgW - pillW) / 2}" y="2" width="${pillW}" height="22" rx="6" fill="#ffffff" stroke="${opts.fill}" stroke-width="2"/>
    <text x="${cx}" y="17" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="900" fill="#0f172a">${escapeXml(
      opts.label
    )}</text>
    ${
      opts.isSelected
        ? `<circle cx="${cx}" cy="${cy}" r="18" fill="none" stroke="#0f172a" stroke-width="3"/>`
        : ""
    }
    ${
      opts.isMine
        ? `<circle cx="${cx}" cy="${cy}" r="15.5" fill="none" stroke="#14b8a6" stroke-width="3"/>`
        : ""
    }
    <circle cx="${cx}" cy="${cy}" r="13" fill="${opts.fill}" stroke="#ffffff" stroke-width="2.5"/>
    <text x="${cx}" y="${cy + 4.5}" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="900" fill="#ffffff">${
      opts.carNumber
    }</text>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildDestinationMarkerSvgDataUrl(title: string): string {
  const clipped = title.length > 9 ? `${title.slice(0, 9)}…` : title;
  const svgW = 128;
  const svgH = 66;
  const cx = svgW / 2;
  const cy = 46;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
    <rect x="4" y="2" width="${svgW - 8}" height="22" rx="6" fill="#0f172a"/>
    <text x="${cx}" y="17" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="900" fill="#ffffff">${escapeXml(
      clipped
    )}</text>
    <circle cx="${cx}" cy="${cy}" r="14" fill="#dc2626" stroke="#ffffff" stroke-width="3"/>
    <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="900" fill="#ffffff">🏁</text>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const STAMP_OPTIONS: Array<{
  status: ConvoyVehicleStatus;
  buttonLabel: string;
}> = [
  { status: "moving", buttonLabel: "🚗 順調" },
  { status: "jam", buttonLabel: "🐢 渋滞中" },
  { status: "rest", buttonLabel: "🏪 休憩" },
  { status: "arrived", buttonLabel: "🏁 到着！" },
];

export function CarpoolConvoyLiveMap({
  teamId,
  eventId,
  direction,
  destinationText,
  gatherLocationText,
  cars,
  userId,
  userName,
}: CarpoolConvoyLiveMapProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [snapshot, setSnapshot] = useState<ConvoySnapshotResponse | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // 自分が発信する号車ID（"" = 現地待機・発信しない）
  const [myCarpoolId, setMyCarpoolId] = useState<string>("");
  const hasInitializedMyCarRef = useRef(false);

  // 地図上で選択中の号車番号
  const [selectedCarNumber, setSelectedCarNumber] = useState<number>(1);

  // 自分の端末からのGPS発信状態（初期は必ずOFFで自宅プライバシー保護）
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [myDraftStatus, setMyDraftStatus] = useState<ConvoyVehicleStatus>("moving");
  const myDraftStatusRef = useRef<ConvoyVehicleStatus>("moving");
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);

  // Google Maps 制御ステート
  const [mapType, setMapType] = useState<"roadmap" | "hybrid">("roadmap");
  const [showTraffic, setShowTraffic] = useState(true);
  const [resolvedDestCoords, setResolvedDestCoords] =
    useState<GoogleLatLngLiteral | null>(null);
  const [googleSdkReady, setGoogleSdkReady] = useState(false);
  const [googleMapAuthFailed, setGoogleMapAuthFailed] = useState(false);

  // APIキー設定モーダル（IT管理者・監督・指導者向け）
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);

  const effectiveUserId = useMemo(() => {
    if (userId) return userId;
    if (typeof window === "undefined") return "";
    return (
      localStorage.getItem("iscore_user_id") ||
      localStorage.getItem("iscore_userId") ||
      ""
    );
  }, [userId]);

  const effectiveUserName = useMemo(() => {
    if (userName) return userName;
    if (typeof window === "undefined") return "";
    return localStorage.getItem("iscore_user_name") || "";
  }, [userName]);

  // Google Maps インスタンス参照
  const mapDomRef = useRef<HTMLDivElement | null>(null);
  const gmapsNsRef = useRef<GoogleMapsNamespace | null>(null);
  const mapInstanceRef = useRef<GoogleMapInstance | null>(null);
  const trafficLayerRef = useRef<GoogleTrafficLayerInstance | null>(null);
  const destMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const vehicleMarkersRef = useRef<Map<string, GoogleMarkerInstance>>(new Map());
  const userHasInteractedMapRef = useRef(false);
  const hasAutoFittedRef = useRef(false);

  // GPS watchPosition & WakeLock 参照
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastCoordsRef = useRef<{
    lat: number;
    lng: number;
    heading: number | null;
    speedKmh: number | null;
    accuracyM: number | null;
  } | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const isPollingInFlightRef = useRef(false);

  // イベント切替時に自動割当フラグをリセット
  useEffect(() => {
    hasInitializedMyCarRef.current = false;
    hasAutoFittedRef.current = false;
    userHasInteractedMapRef.current = false;
  }, [eventId, direction]);

  // ==========================================
  // 1. サーバーからの隊列スナップショット取得（5秒ポーリング）
  // ==========================================
  const fetchSnapshot = useCallback(async () => {
    if (!eventId || isPollingInFlightRef.current) return;
    isPollingInFlightRef.current = true;
    try {
      const qs = new URLSearchParams({
        teamId: teamId || "demo-team",
        eventId,
        direction,
      });
      if (effectiveUserId) qs.set("userId", effectiveUserId);
      if (effectiveUserName) qs.set("userName", effectiveUserName);

      const res = await fetch(`/api/liff/carpool-convoy?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as ConvoySnapshotResponse;
      if (!data.success) return;

      setSnapshot(data);

      if (!hasInitializedMyCarRef.current) {
        hasInitializedMyCarRef.current = true;
        if (
          data.myAssignedCarpoolId &&
          cars.some((c) => c.carpoolId === data.myAssignedCarpoolId)
        ) {
          setMyCarpoolId(data.myAssignedCarpoolId);
          const matchedCar = cars.find(
            (c) => c.carpoolId === data.myAssignedCarpoolId
          );
          if (matchedCar) {
            setSelectedCarNumber(matchedCar.carNumber);
          }
        } else if (cars[0]) {
          setMyCarpoolId(cars[0].carpoolId);
        }
      }
    } catch {
      // ネットワーク瞬断時は次回ポーリングで自動復帰
    } finally {
      isPollingInFlightRef.current = false;
      setIsInitialLoading(false);
    }
  }, [teamId, eventId, direction, effectiveUserId, effectiveUserName, cars]);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!isExpanded) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchSnapshot();
      }
    }, 5000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchSnapshot();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isExpanded, fetchSnapshot]);

  // 自分の選択号車の既存ステータスを同期
  useEffect(() => {
    if (!myCarpoolId || !snapshot?.states[myCarpoolId]) return;
    const st = snapshot.states[myCarpoolId];
    if (!isBroadcasting) {
      setMyDraftStatus(st.status);
      myDraftStatusRef.current = st.status;
    }
  }, [myCarpoolId, snapshot, isBroadcasting]);

  // ==========================================
  // 2. Wake Lock（画面スリープ防止）管理
  // ==========================================
  const acquireWakeLock = useCallback(async () => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator) || !navigator.wakeLock) {
      return;
    }
    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) return;
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setIsWakeLockActive(true);
    } catch {
      setIsWakeLockActive(false);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch {
      // ignore
    } finally {
      setIsWakeLockActive(false);
    }
  }, []);

  useEffect(() => {
    if (!isBroadcasting) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && isBroadcasting) {
        void acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isBroadcasting, acquireWakeLock]);

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== "undefined") {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      void releaseWakeLock();
    };
  }, [releaseWakeLock]);

  // ==========================================
  // 3. 位置情報・ステータス送信処理
  // ==========================================
  const pushLiveUpdate = useCallback(
    async (opts: {
      carpoolId: string;
      isSharing: boolean;
      status: ConvoyVehicleStatus;
      coords?: {
        lat: number;
        lng: number;
        heading: number | null;
        speedKmh: number | null;
        accuracyM: number | null;
      } | null;
      clearLocation?: boolean;
    }) => {
      if (!opts.carpoolId || !eventId) return;
      const senderLabel =
        snapshot?.myDisplayName || effectiveUserName || "乗車メンバー";

      try {
        const res = await fetch("/api/liff/carpool-convoy/location", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: teamId || "demo-team",
            eventId,
            carpoolId: opts.carpoolId,
            direction,
            isSharing: opts.isSharing,
            status: opts.status,
            latitude: opts.coords?.lat ?? null,
            longitude: opts.coords?.lng ?? null,
            heading: opts.coords?.heading ?? null,
            speedKmh: opts.coords?.speedKmh ?? null,
            accuracyM: opts.coords?.accuracyM ?? null,
            clearLocation: opts.clearLocation ?? false,
            userId: effectiveUserId || null,
            userName: senderLabel,
          }),
          keepalive: true,
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          success: boolean;
          state?: ConvoyVehicleLiveState;
          serverTime?: number;
        };
        if (json.success && json.state) {
          setSnapshot((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              serverTime: json.serverTime ?? Date.now(),
              states: {
                ...prev.states,
                [opts.carpoolId]: json.state as ConvoyVehicleLiveState,
              },
            };
          });
        }
      } catch {
        // 次回のwatchPosition更新時に自動再送
      }
    },
    [teamId, eventId, direction, snapshot?.myDisplayName, userId, userName]
  );

  const stopBroadcasting = useCallback(
    async (opts?: { wipePin?: boolean; finalStatus?: ConvoyVehicleStatus }) => {
      if (watchIdRef.current !== null && typeof navigator !== "undefined") {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      await releaseWakeLock();
      setIsBroadcasting(false);

      if (myCarpoolId) {
        const nextStatus = opts?.finalStatus ?? myDraftStatus;
        await pushLiveUpdate({
          carpoolId: myCarpoolId,
          isSharing: false,
          status: nextStatus,
          coords: opts?.wipePin ? null : lastCoordsRef.current,
          clearLocation: Boolean(opts?.wipePin),
        });
      }
    },
    [myCarpoolId, myDraftStatus, pushLiveUpdate, releaseWakeLock]
  );

  const startBroadcasting = useCallback(
    async (initialStatus?: ConvoyVehicleStatus) => {
      if (!myCarpoolId) {
        toast.error("発信する号車を選択してください");
        return;
      }
      const activeStatus: ConvoyVehicleStatus =
        initialStatus && initialStatus !== "arrived"
          ? initialStatus
          : myDraftStatus === "arrived"
          ? "moving"
          : myDraftStatus;

      setMyDraftStatus(activeStatus);
      myDraftStatusRef.current = activeStatus;
      setGpsErrorMsg(null);

      // デモチームの場合はGPS権限がなくても体験可能にする（対応端末では実測GPSも反映）
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        if (snapshot?.isDemo) {
          setIsBroadcasting(true);
          await pushLiveUpdate({
            carpoolId: myCarpoolId,
            isSharing: true,
            status: activeStatus,
            coords: {
              lat: 35.5345,
              lng: 139.7025,
              heading: 315,
              speedKmh: 36,
              accuracyM: 12,
            },
          });
          toast.success("位置共有を開始しました（デモモード）");
          return;
        }
        setGpsErrorMsg("お使いの端末ブラウザでは位置情報がサポートされていません");
        return;
      }

      setIsBroadcasting(true);
      lastSentAtRef.current = 0;
      void acquireWakeLock();

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setGpsErrorMsg(null);
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading:
              typeof pos.coords.heading === "number" &&
              Number.isFinite(pos.coords.heading)
                ? pos.coords.heading
                : null,
            speedKmh:
              typeof pos.coords.speed === "number" &&
              Number.isFinite(pos.coords.speed) &&
              pos.coords.speed >= 0
                ? Math.round(pos.coords.speed * 3.6)
                : null,
            accuracyM:
              typeof pos.coords.accuracy === "number" &&
              Number.isFinite(pos.coords.accuracy)
                ? Math.round(pos.coords.accuracy)
                : null,
          };
          lastCoordsRef.current = coords;

          const now = Date.now();
          if (now - lastSentAtRef.current >= 4800) {
            lastSentAtRef.current = now;
            void pushLiveUpdate({
              carpoolId: myCarpoolId,
              isSharing: true,
              status: myDraftStatusRef.current,
              coords,
            });
          }
        },
        (err) => {
          if (snapshot?.isDemo) {
            // デモ閲覧時に位置情報拒否されてもそのまま動作体験可能
            void pushLiveUpdate({
              carpoolId: myCarpoolId,
              isSharing: true,
              status: myDraftStatusRef.current,
              coords: {
                lat: 35.5345,
                lng: 139.7025,
                heading: 315,
                speedKmh: 35,
                accuracyM: 15,
              },
            });
            return;
          }
          if (err.code === err.PERMISSION_DENIED) {
            setGpsErrorMsg(
              "位置情報の許可がOFFになっています。スマホまたはLINEの位置情報設定を許可してください。"
            );
            void stopBroadcasting({ wipePin: true });
          } else {
            setGpsErrorMsg("GPS測位中です（屋外・窓際で精度が向上します）");
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 4000,
          timeout: 15000,
        }
      );

      const carObj = cars.find((c) => c.carpoolId === myCarpoolId);
      toast.success(
        `${carObj ? `${carObj.carNumber}号車` : "選択号車"}の位置共有をONにしました`
      );
    },
    [
      myCarpoolId,
      myDraftStatus,
      snapshot?.isDemo,
      acquireWakeLock,
      pushLiveUpdate,
      stopBroadcasting,
      cars,
    ]
  );

  const handleToggleSharing = useCallback(() => {
    if (isBroadcasting) {
      void stopBroadcasting({ wipePin: true });
      toast.info("位置共有をOFFにしました（地図から現在地ピンを消去）");
    } else {
      void startBroadcasting();
    }
  }, [isBroadcasting, stopBroadcasting, startBroadcasting]);

  const handleSelectStamp = useCallback(
    async (nextStatus: ConvoyVehicleStatus) => {
      if (!myCarpoolId) {
        toast.error("発信する号車を選択してください");
        return;
      }
      setMyDraftStatus(nextStatus);
      myDraftStatusRef.current = nextStatus;
      const carObj = cars.find((c) => c.carpoolId === myCarpoolId);
      const carLabel = carObj ? `${carObj.carNumber}号車` : "号車";

      if (nextStatus === "arrived") {
        const fallbackCoords =
          lastCoordsRef.current ||
          (resolvedDestCoords
            ? {
                lat: resolvedDestCoords.lat,
                lng: resolvedDestCoords.lng,
                heading: null,
                speedKmh: 0,
                accuracyM: null,
              }
            : null);
        if (watchIdRef.current !== null && typeof navigator !== "undefined") {
          navigator.geolocation?.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        await releaseWakeLock();
        setIsBroadcasting(false);
        await pushLiveUpdate({
          carpoolId: myCarpoolId,
          isSharing: false,
          status: "arrived",
          coords: fallbackCoords,
        });
        toast.success(
          `${carLabel}「🏁 到着！」を記録しました（GPS自動送信を完了）`
        );
        return;
      }

      lastSentAtRef.current = Date.now();
      if (!isBroadcasting) {
        // まだ共有ONでない場合はステータス更新と同時に共有を開始
        await startBroadcasting(nextStatus);
      } else {
        await pushLiveUpdate({
          carpoolId: myCarpoolId,
          isSharing: true,
          status: nextStatus,
          coords: lastCoordsRef.current,
        });
        const label =
          STAMP_OPTIONS.find((s) => s.status === nextStatus)?.buttonLabel ||
          nextStatus;
        toast.success(`${carLabel}の状況を「${label}」に更新しました`);
      }
    },
    [
      myCarpoolId,
      cars,
      resolvedDestCoords,
      releaseWakeLock,
      pushLiveUpdate,
      isBroadcasting,
      startBroadcasting,
    ]
  );

  // ==========================================
  // 4. Google Maps SDK 初期化 & 目的地座標解決
  // ==========================================
  const effectiveApiKey = useMemo(() => {
    const serverKey = snapshot?.googleMapsApiKey?.trim();
    if (serverKey) return serverKey;
    const envKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
    return envKey || null;
  }, [snapshot?.googleMapsApiKey]);

  // サーバー側で既に緯度経度が判明している場合は即時反映
  useEffect(() => {
    const lat = snapshot?.destination?.latitude;
    const lng = snapshot?.destination?.longitude;
    if (typeof lat === "number" && typeof lng === "number") {
      setResolvedDestCoords({ lat, lng });
    } else {
      setResolvedDestCoords(null);
    }
  }, [snapshot?.destination?.latitude, snapshot?.destination?.longitude, direction]);

  // Google Maps JS API ロード
  useEffect(() => {
    if (!effectiveApiKey || !isExpanded) {
      setGoogleSdkReady(false);
      return;
    }

    setGoogleMapAuthFailed(false);
    const onAuthFail = () => {
      setGoogleMapAuthFailed(true);
      setGoogleSdkReady(false);
    };
    authFailureListeners.add(onAuthFail);

    let cancelled = false;
    loadGoogleMapsApi(effectiveApiKey)
      .then((ns) => {
        if (cancelled) return;
        gmapsNsRef.current = ns;
        setGoogleSdkReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setGoogleMapAuthFailed(true);
          setGoogleSdkReady(false);
        }
      });

    return () => {
      cancelled = true;
      authFailureListeners.delete(onAuthFail);
    };
  }, [effectiveApiKey, isExpanded]);

  // サーバー側で緯度経度が未確定の場合、Google Maps Geocoder で1回のみ解決（localStorageキャッシュ）
  useEffect(() => {
    if (
      !googleSdkReady ||
      !gmapsNsRef.current ||
      resolvedDestCoords !== null
    ) {
      return;
    }
    const query = (
      snapshot?.destination?.directionsTarget ||
      snapshot?.destination?.address ||
      snapshot?.destination?.name ||
      destinationText
    ).trim();
    if (!query) return;

    const cacheKey = `${GEOCODE_CACHE_PREFIX}${query}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as GoogleLatLngLiteral;
        if (
          typeof parsed?.lat === "number" &&
          typeof parsed?.lng === "number"
        ) {
          setResolvedDestCoords(parsed);
          return;
        }
      }
    } catch {
      // ignore storage error
    }

    const geocoder = new gmapsNsRef.current.Geocoder();
    geocoder.geocode({ address: query, region: "JP" }, (results, status) => {
      if (status === "OK" && results && results[0]?.geometry?.location) {
        const loc = results[0].geometry.location;
        const coords = { lat: loc.lat(), lng: loc.lng() };
        setResolvedDestCoords(coords);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(coords));
        } catch {
          // ignore
        }
      }
    });
  }, [
    googleSdkReady,
    resolvedDestCoords,
    snapshot?.destination,
    destinationText,
  ]);

  // Google Map インスタンス生成
  useEffect(() => {
    if (
      !googleSdkReady ||
      googleMapAuthFailed ||
      !isExpanded ||
      !mapDomRef.current ||
      !gmapsNsRef.current
    ) {
      return;
    }

    if (!mapInstanceRef.current) {
      const gmaps = gmapsNsRef.current;
      const initialCenter = resolvedDestCoords || {
        lat: 35.5458,
        lng: 139.6895,
      };
      const map = new gmaps.Map(mapDomRef.current, {
        center: initialCenter,
        zoom: 13,
        mapTypeId: mapType,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: "greedy",
      });
      map.addListener("dragstart", () => {
        userHasInteractedMapRef.current = true;
      });
      mapInstanceRef.current = map;

      const traffic = new gmaps.TrafficLayer();
      traffic.setMap(showTraffic ? map : null);
      trafficLayerRef.current = traffic;
    }
  }, [
    googleSdkReady,
    googleMapAuthFailed,
    isExpanded,
    resolvedDestCoords,
    mapType,
    showTraffic,
  ]);

  // 折りたたんだ際に次回展開時再マウントできるよう参照整理
  useEffect(() => {
    if (!isExpanded) {
      destMarkerRef.current?.setMap(null);
      destMarkerRef.current = null;
      vehicleMarkersRef.current.forEach((m) => m.setMap(null));
      vehicleMarkersRef.current.clear();
      trafficLayerRef.current?.setMap(null);
      trafficLayerRef.current = null;
      mapInstanceRef.current = null;
    }
  }, [isExpanded]);

  // マップ種別 & 渋滞レイヤー切替反映
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setMapTypeId(mapType);
    }
  }, [mapType]);

  useEffect(() => {
    if (trafficLayerRef.current && mapInstanceRef.current) {
      trafficLayerRef.current.setMap(showTraffic ? mapInstanceRef.current : null);
    }
  }, [showTraffic]);

  // ==========================================
  // 5. 各号車の表示データ合成 & マーカー同期
  // ==========================================
  const nowRefMs = snapshot?.serverTime || Date.now();
  const activeTargetLabel =
    direction === "outbound"
      ? snapshot?.destination?.name || destinationText
      : snapshot?.destination?.name || gatherLocationText;

  const enrichedCars = useMemo(() => {
    return cars.map((car) => {
      const live = snapshot?.states[car.carpoolId] || null;
      const isStale = Boolean(
        live &&
          live.isSharing &&
          live.status !== "arrived" &&
          nowRefMs - live.updatedAt >= STALE_THRESHOLD_MS
      );
      const agoLabel = live ? formatUpdatedAgo(live.updatedAt, nowRefMs) : "未発信";
      const hasCoords = Boolean(
        live &&
          typeof live.latitude === "number" &&
          typeof live.longitude === "number"
      );

      let distanceInfo: { roadKm: number; etaMin: number } | null = null;
      if (
        hasCoords &&
        live &&
        live.status !== "arrived" &&
        resolvedDestCoords &&
        typeof live.latitude === "number" &&
        typeof live.longitude === "number"
      ) {
        distanceInfo = estimateRoadKmAndEta(
          { lat: live.latitude, lng: live.longitude },
          resolvedDestCoords,
          live.status
        );
      }

      const visual = live
        ? getStatusVisual(live.status, isStale, agoLabel)
        : {
            pinFill: "#94a3b8",
            badgeBgClass: "bg-muted border border-border",
            badgeTextClass: "text-muted-foreground",
            shortLabel: "待機中",
          };

      return {
        car,
        live,
        isStale,
        agoLabel,
        hasCoords,
        distanceInfo,
        visual,
      };
    });
  }, [cars, snapshot?.states, nowRefMs, resolvedDestCoords]);

  const fitAllPinsOnMap = useCallback(() => {
    const map = mapInstanceRef.current;
    const gmaps = gmapsNsRef.current;
    if (!map || !gmaps) return;

    const bounds = new gmaps.LatLngBounds();
    let pointCount = 0;

    if (resolvedDestCoords) {
      bounds.extend(resolvedDestCoords);
      pointCount += 1;
    }

    for (const item of enrichedCars) {
      if (
        item.hasCoords &&
        item.live &&
        typeof item.live.latitude === "number" &&
        typeof item.live.longitude === "number"
      ) {
        bounds.extend({ lat: item.live.latitude, lng: item.live.longitude });
        pointCount += 1;
      }
    }

    if (pointCount >= 2 && !bounds.isEmpty()) {
      map.fitBounds(bounds, 52);
    } else if (resolvedDestCoords) {
      map.setCenter(resolvedDestCoords);
      map.setZoom(14);
    }
  }, [resolvedDestCoords, enrichedCars]);

  // Google Maps マーカー差分更新（マップ再読込ゼロ）
  useEffect(() => {
    const map = mapInstanceRef.current;
    const gmaps = gmapsNsRef.current;
    if (!map || !gmaps || !googleSdkReady || googleMapAuthFailed) return;

    // 🏁 目的地マーカー更新
    if (resolvedDestCoords) {
      const destIcon: GoogleMarkerIconSpec = {
        url: buildDestinationMarkerSvgDataUrl(activeTargetLabel),
        scaledSize: new gmaps.Size(128, 66),
        anchor: new gmaps.Point(64, 46),
      };
      if (!destMarkerRef.current) {
        destMarkerRef.current = new gmaps.Marker({
          position: resolvedDestCoords,
          map,
          icon: destIcon,
          zIndex: 50,
          title: activeTargetLabel,
        });
      } else {
        destMarkerRef.current.setPosition(resolvedDestCoords);
        destMarkerRef.current.setIcon(destIcon);
      }
    }

    // ①〜N号車マーカー更新
    const activeIds = new Set<string>();
    enrichedCars.forEach((item, idx) => {
      if (
        !item.hasCoords ||
        !item.live ||
        typeof item.live.latitude !== "number" ||
        typeof item.live.longitude !== "number"
      ) {
        return;
      }
      activeIds.add(item.car.carpoolId);

      // 到着済みの車が目的地と完全同座標のとき重ならないよう微小オフセット
      const offsetLng =
        item.live.status === "arrived" ? (idx - 1) * 0.00035 : 0;
      const offsetLat = item.live.status === "arrived" ? -0.00035 : 0;
      const position = {
        lat: item.live.latitude + offsetLat,
        lng: item.live.longitude + offsetLng,
      };

      const isSelected = item.car.carNumber === selectedCarNumber;
      const isMine = item.car.carpoolId === myCarpoolId;
      const iconSpec: GoogleMarkerIconSpec = {
        url: buildVehicleMarkerSvgDataUrl({
          carNumber: item.car.carNumber,
          label: item.visual.shortLabel,
          fill: item.visual.pinFill,
          isSelected,
          isMine,
        }),
        scaledSize: new gmaps.Size(104, 66),
        anchor: new gmaps.Point(52, 46),
      };
      const zIdx = isSelected ? 200 : isMine ? 150 : 100 - item.car.carNumber;

      const existing = vehicleMarkersRef.current.get(item.car.carpoolId);
      if (!existing) {
        const marker = new gmaps.Marker({
          position,
          map,
          icon: iconSpec,
          zIndex: zIdx,
          title: `${item.car.carNumber}号車 (${item.car.driverName})`,
        });
        marker.addListener("click", () => {
          setSelectedCarNumber(item.car.carNumber);
        });
        vehicleMarkersRef.current.set(item.car.carpoolId, marker);
      } else {
        existing.setPosition(position);
        existing.setIcon(iconSpec);
        existing.setZIndex(zIdx);
      }
    });

    // 共有OFF等で座標が消えたマーカーを除去
    Array.from(vehicleMarkersRef.current.entries()).forEach(([cpId, mk]) => {
      if (!activeIds.has(cpId)) {
        mk.setMap(null);
        vehicleMarkersRef.current.delete(cpId);
      }
    });

    // 初回のみ全体が収まるよう自動ズーム
    if (!hasAutoFittedRef.current && !userHasInteractedMapRef.current) {
      if (resolvedDestCoords || activeIds.size > 0) {
        hasAutoFittedRef.current = true;
        fitAllPinsOnMap();
      }
    }
  }, [
    enrichedCars,
    resolvedDestCoords,
    activeTargetLabel,
    selectedCarNumber,
    myCarpoolId,
    googleSdkReady,
    googleMapAuthFailed,
    fitAllPinsOnMap,
  ]);

  const handleSelectCarAndFocus = useCallback(
    (carNumber: number) => {
      setSelectedCarNumber(carNumber);
      const found = enrichedCars.find((c) => c.car.carNumber === carNumber);
      if (
        found?.hasCoords &&
        found.live &&
        typeof found.live.latitude === "number" &&
        typeof found.live.longitude === "number" &&
        mapInstanceRef.current
      ) {
        userHasInteractedMapRef.current = true;
        mapInstanceRef.current.panTo({
          lat: found.live.latitude,
          lng: found.live.longitude,
        });
      }
    },
    [enrichedCars]
  );

  // ==========================================
  // 6. Googleマップ音声ナビ起動 & APIキー保存
  // ==========================================
  const handleOpenExternalNavigation = useCallback(() => {
    const target = (
      snapshot?.destination?.directionsTarget ||
      activeTargetLabel
    ).trim();
    if (!target) return;
    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      target
    )}&travelmode=driving`;
    window.open(navUrl, "_blank", "noopener,noreferrer");
  }, [snapshot?.destination?.directionsTarget, activeTargetLabel]);

  const handleSaveApiKey = useCallback(async () => {
    setIsSavingKey(true);
    try {
      const res = await fetch("/api/liff/carpool-convoy/maps-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          apiKey: apiKeyInput.trim(),
          userId: effectiveUserId || null,
          userName: effectiveUserName || null,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        googleMapsApiKey?: string | null;
        googleMapsKeySource?: "env" | "org" | "none";
        error?: string;
      };
      if (!res.ok || !data.success) {
        toast.error(data.error || "APIキーの保存に失敗しました");
        return;
      }

      invalidateLiffApiCache("/api/liff/carpool-convoy");
      invalidateLiffApiCache("/api/liff/admin/dashboard");

      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              googleMapsApiKey: data.googleMapsApiKey ?? null,
              googleMapsKeySource: data.googleMapsKeySource ?? "none",
            }
          : prev
      );
      setIsKeyModalOpen(false);
      hasAutoFittedRef.current = false;
      toast.success(
        apiKeyInput.trim()
          ? "Google Maps APIキーを保存しました！地図を切り替えます"
          : "APIキー設定を解除しました"
      );
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSavingKey(false);
    }
  }, [teamId, apiKeyInput, effectiveUserId, effectiveUserName]);

  // サマリー集計
  const sharingCount = enrichedCars.filter(
    (c) => c.live?.isSharing && c.live.status !== "arrived"
  ).length;
  const arrivedCount = enrichedCars.filter(
    (c) => c.live?.status === "arrived"
  ).length;

  const selectedItem =
    enrichedCars.find((c) => c.car.carNumber === selectedCarNumber) ||
    enrichedCars[0] ||
    null;

  const useRealGoogleMap = Boolean(effectiveApiKey && !googleMapAuthFailed);

  return (
    <>
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        {/* A-3 上帯ダークキャップ（タップで折りたたみ／展開） */}
        <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
          >
            <span className="px-2 py-0.5 rounded bg-teal-500 text-slate-950 text-[11px] font-black shrink-0">
              🗺️ 隊列マップ
            </span>
            <span className="text-xs font-black text-white truncate tabular-nums">
              {sharingCount > 0 || arrivedCount > 0
                ? `${cars.length}台中 ${sharingCount}台移動中・${arrivedCount}台到着`
                : `${cars.length}台の現在地・状況共有`}
            </span>
            {isBroadcasting && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 text-[10px] font-black shrink-0">
                発信中
              </span>
            )}
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {snapshot?.canConfigureMapsKey &&
              snapshot.googleMapsKeySource !== "env" && (
                <button
                  type="button"
                  onClick={() => {
                    setApiKeyInput(snapshot.googleMapsApiKey || "");
                    setIsKeyModalOpen(true);
                  }}
                  title="Google Maps APIキー設定"
                  className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-teal-400" />
                  <span className="hidden sm:inline">キー設定</span>
                </button>
              )}

            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-[11px] font-black flex items-center gap-1 cursor-pointer"
            >
              <span>{isExpanded ? "閉じる" : "地図を開く"}</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="divide-y divide-border">
            {/* ==================== 1. マップ表示領域 ==================== */}
            <div className="relative h-[300px] sm:h-[340px] w-full bg-[#e8ecef] select-none">
              {useRealGoogleMap ? (
                <>
                  <div ref={mapDomRef} className="w-full h-full" />
                  {!googleSdkReady && (
                    <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <span className="text-xs font-bold">
                        Google マップを読み込み中...
                      </span>
                    </div>
                  )}

                  {/* 左上オーバーレイ：地図/航空写真 ＋ 渋滞表示 ＋ 全体表示 */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-1.5 pointer-events-none">
                    <div className="flex items-center gap-1.5 pointer-events-auto">
                      <div className="inline-flex rounded-xl border border-[#cbd5e1] bg-white shadow-xs overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setMapType("roadmap")}
                          className={`px-2.5 py-1.5 text-xs cursor-pointer ${
                            mapType === "roadmap"
                              ? "bg-[#0f172a] text-white font-black"
                              : "bg-white text-[#334155] font-bold"
                          }`}
                        >
                          地図
                        </button>
                        <button
                          type="button"
                          onClick={() => setMapType("hybrid")}
                          className={`px-2.5 py-1.5 text-xs cursor-pointer ${
                            mapType === "hybrid"
                              ? "bg-[#0f172a] text-white font-black"
                              : "bg-white text-[#334155] font-bold"
                          }`}
                        >
                          航空写真
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowTraffic((v) => !v)}
                        className={`px-2.5 py-1.5 rounded-xl border text-xs shadow-xs cursor-pointer ${
                          showTraffic
                            ? "border-[#dc2626] bg-[#fef2f2] text-[#b91c1c] font-black"
                            : "border-[#cbd5e1] bg-white text-[#475569] font-bold"
                        }`}
                      >
                        🚦 渋滞 {showTraffic ? "ON" : "OFF"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        userHasInteractedMapRef.current = false;
                        fitAllPinsOnMap();
                      }}
                      className="pointer-events-auto px-2.5 py-1.5 rounded-xl border border-[#cbd5e1] bg-white text-[#0f172a] text-xs font-black shadow-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Crosshair className="w-3.5 h-3.5 text-[#1A73E8]" />
                      <span>全体</span>
                    </button>
                  </div>
                </>
              ) : (
                /* APIキー未設定時・認証エラー時でも止まらないソリッド隊列レーダーマップ */
                <div className="w-full h-full relative bg-[#eef2f6]">
                  <svg
                    viewBox="0 0 520 300"
                    className="w-full h-full block"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect x="0" y="0" width="520" height="300" fill="#e8ecef" />
                    <polygon points="365,0 520,0 520,165 395,145" fill="#d1fae5" />
                    <path
                      d="M 350,0 C 372,85 405,155 520,210 L 520,175 C 425,130 398,75 378,0 Z"
                      fill="#bae6fd"
                    />
                    <g stroke="#ffffff" strokeWidth="5" fill="none">
                      <path d="M 0,72 L 385,72" />
                      <path d="M 120,0 L 120,300" />
                      <path d="M 255,0 L 255,300" />
                      <path d="M 0,242 L 450,242" />
                    </g>

                    {/* ルートガイドライン */}
                    <path
                      d="M 52,248 C 130,235 175,180 255,158 C 330,138 375,105 450,62"
                      stroke="#cbd5e1"
                      strokeWidth="12"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <path
                      d="M 52,248 C 130,235 175,180 255,158 C 330,138 375,105 450,62"
                      stroke="#fde68a"
                      strokeWidth="8"
                      strokeLinecap="round"
                      fill="none"
                    />

                    {/* 出発地 */}
                    <g transform="translate(52, 248)">
                      <circle
                        cx="0"
                        cy="0"
                        r="7"
                        fill="#475569"
                        stroke="#ffffff"
                        strokeWidth="2.5"
                      />
                      <rect
                        x="-32"
                        y="10"
                        width="64"
                        height="20"
                        rx="5"
                        fill="#ffffff"
                        stroke="#94a3b8"
                      />
                      <text
                        x="0"
                        y="24"
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="800"
                        fill="#1e293b"
                      >
                        出発地
                      </text>
                    </g>

                    {/* 🏁 目的地 */}
                    <g transform="translate(450, 62)">
                      <circle
                        cx="0"
                        cy="0"
                        r="14"
                        fill="#dc2626"
                        stroke="#ffffff"
                        strokeWidth="3"
                      />
                      <text
                        x="0"
                        y="5"
                        textAnchor="middle"
                        fontSize="13"
                        fontWeight="900"
                        fill="#ffffff"
                      >
                        🏁
                      </text>
                      <rect
                        x="-90"
                        y="-34"
                        width="130"
                        height="20"
                        rx="5"
                        fill="#0f172a"
                      />
                      <text
                        x="-25"
                        y="-20"
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="900"
                        fill="#ffffff"
                      >
                        {activeTargetLabel.slice(0, 9)}
                      </text>
                    </g>

                    {/* レーダー上の各号車ピン */}
                    {enrichedCars.map((item, idx) => {
                      if (!item.live || (!item.live.isSharing && item.live.status !== "arrived")) {
                        return null;
                      }
                      const progress =
                        item.live.status === "arrived"
                          ? 0.94
                          : item.distanceInfo
                          ? Math.max(
                              0.14,
                              Math.min(0.88, 1 - item.distanceInfo.roadKm / 18)
                            )
                          : Math.min(0.84, 0.25 + idx * 0.18);

                      const x = Math.round(52 + (450 - 52) * progress);
                      const y = Math.round(
                        248 +
                          (62 - 248) * progress -
                          Math.sin(progress * Math.PI) * 22 +
                          (idx % 2 === 0 ? -6 : 8)
                      );
                      const isSelected = item.car.carNumber === selectedCarNumber;
                      const isMine = item.car.carpoolId === myCarpoolId;

                      return (
                        <g
                          key={item.car.carpoolId}
                          transform={`translate(${x}, ${y})`}
                          className="cursor-pointer"
                          onClick={() => setSelectedCarNumber(item.car.carNumber)}
                        >
                          {isSelected && (
                            <circle
                              cx="0"
                              cy="0"
                              r="20"
                              fill="none"
                              stroke="#0f172a"
                              strokeWidth="3"
                            />
                          )}
                          {isMine && (
                            <circle
                              cx="0"
                              cy="0"
                              r="16.5"
                              fill="none"
                              stroke="#14b8a6"
                              strokeWidth="3"
                            />
                          )}
                          <circle
                            cx="0"
                            cy="0"
                            r="13"
                            fill={item.visual.pinFill}
                            stroke="#ffffff"
                            strokeWidth="2.5"
                          />
                          <text
                            x="0"
                            y="4.5"
                            textAnchor="middle"
                            fontSize="12"
                            fontWeight="900"
                            fill="#ffffff"
                          >
                            {item.car.carNumber}
                          </text>
                          <g transform="translate(0, -25)">
                            <rect
                              x="-42"
                              y="-10"
                              width="84"
                              height="19"
                              rx="5"
                              fill="#ffffff"
                              stroke={item.visual.pinFill}
                              strokeWidth="2"
                            />
                            <text
                              x="0"
                              y="3"
                              textAnchor="middle"
                              fontSize="11"
                              fontWeight="900"
                              fill="#0f172a"
                            >
                              {item.visual.shortLabel}
                            </text>
                          </g>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Googleマップ切替案内ピル */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-xl bg-[#0f172a] text-white text-[11px] font-black shadow-xs">
                      {googleMapAuthFailed
                        ? "⚠️ APIキー制限を確認してください（レーダー表示中）"
                        : "📡 隊列レーダー表示中"}
                    </span>
                    {snapshot?.canConfigureMapsKey && (
                      <button
                        type="button"
                        onClick={() => {
                          setApiKeyInput(snapshot.googleMapsApiKey || "");
                          setIsKeyModalOpen(true);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-[11px] font-black shadow-xs flex items-center gap-1 cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Googleマップを有効化</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* マップ下部：選択中の号車ミニ情報オーバーレイ */}
              {selectedItem && !isInitialLoading && (
                <div className="absolute bottom-2.5 left-2.5 right-2.5 sm:left-auto sm:w-80 rounded-xl border-2 border-[#0f172a] bg-white text-[#0f172a] px-3 py-2 shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-5 h-5 rounded-md text-white text-xs font-black flex items-center justify-center shrink-0 tabular-nums"
                        style={{ backgroundColor: selectedItem.visual.pinFill }}
                      >
                        {selectedItem.car.carNumber}
                      </span>
                      <span className="text-xs font-black truncate">
                        {selectedItem.car.driverName}
                        {selectedItem.car.isCargo ? " 📦" : ""}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-[#0f172a] text-[11px] font-black shrink-0">
                      {selectedItem.visual.shortLabel}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-bold text-slate-600">
                    <span className="truncate">
                      {selectedItem.live?.status === "arrived"
                        ? `${activeTargetLabel}に到着済`
                        : selectedItem.distanceInfo
                        ? `残り約 ${selectedItem.distanceInfo.roadKm.toFixed(
                            1
                          )}km（目安${selectedItem.distanceInfo.etaMin}分）`
                        : selectedItem.live?.isSharing
                        ? "現在地を共有中"
                        : "位置共有はまだ開始されていません"}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {selectedItem.live
                        ? `更新: ${selectedItem.agoLabel}`
                        : "未発信"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ==================== 2. 自分の号車：位置発信スイッチ ＆ ワンタップ状況スタンプ ==================== */}
            <div className="p-3.5 bg-muted/40 space-y-3">
              {/* 発信号車セレクター ＋ 位置共有ON/OFFスイッチ */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs font-black text-foreground shrink-0">
                    自分の号車:
                  </span>
                  <LiffSelect
                    value={myCarpoolId}
                    disabled={isBroadcasting}
                    onChange={(nextId) => {
                      setMyCarpoolId(nextId);
                      const c = cars.find((item) => item.carpoolId === nextId);
                      if (c) setSelectedCarNumber(c.carNumber);
                    }}
                    options={[
                      ...cars.map((car) => ({
                        value: car.carpoolId,
                        label: `${car.carNumber}号車: ${car.driverName}`,
                        badge: car.isCargo ? "道具車" : undefined,
                        badgeTone: "amber" as const,
                        sublabel: car.carModel
                          ? `${car.carModel}（乗車 ${car.passengers.length}/${car.capacity}名）`
                          : `乗車 ${car.passengers.length}/${car.capacity}名`,
                      })),
                      {
                        value: "",
                        label: "現地待機・乗車なし（閲覧のみ）",
                        sublabel:
                          "現在地の発信は行わず、隊列マップの閲覧のみ行います",
                      },
                    ]}
                    title="自分の号車を選択"
                    subtitle="運転手・同乗者のどちらからでも号車の位置を共有できます"
                    ariaLabel="自分の号車を選択"
                    accent="teal"
                    size="sm"
                    searchable={false}
                    className="min-w-0 flex-1 h-9"
                  />
                </div>

                {myCarpoolId && (
                  <button
                    type="button"
                    onClick={handleToggleSharing}
                    className={`h-9 px-3.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer shrink-0 ${
                      isBroadcasting
                        ? "bg-teal-600 hover:bg-teal-700 text-white"
                        : "bg-[#0f172a] hover:bg-slate-800 text-white"
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>{isBroadcasting ? "位置共有 ON" : "位置共有を開始"}</span>
                  </button>
                )}
              </div>

              {/* 補足ステータス案内（同乗者発信・スリープ防止・プライバシー保護） */}
              {myCarpoolId ? (
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold text-muted-foreground">
                  <span>
                    💡 運転手だけでなく
                    <strong className="text-foreground">助手席・同乗者のスマホ</strong>
                    からも発信できます
                  </span>
                  {isBroadcasting ? (
                    <span className="text-teal-600 dark:text-teal-400 font-black">
                      {isWakeLockActive
                        ? "● 画面スリープ防止中"
                        : "● 5秒おきに現在地を送信中"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      OFF時は位置送信されません
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs font-bold text-muted-foreground">
                  自分の位置は送信せず、向かってくる各号車の状況と残り距離をリアルタイム確認できます。
                </p>
              )}

              {gpsErrorMsg && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-bold">
                  {gpsErrorMsg}
                </div>
              )}

              {/* ワンタップ状況スタンプ（4種） */}
              {myCarpoolId && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-muted-foreground">
                      ワンタップ状況スタンプ（文字入力不要）
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {STAMP_OPTIONS.map((st) => {
                      const currentLiveStatus =
                        snapshot?.states[myCarpoolId]?.status;
                      const isActive =
                        (isBroadcasting || currentLiveStatus === "arrived") &&
                        (currentLiveStatus || myDraftStatus) === st.status;
                      return (
                        <button
                          key={st.status}
                          type="button"
                          onClick={() => void handleSelectStamp(st.status)}
                          className={`h-9 px-1.5 rounded-xl border text-xs font-black transition-all active:scale-95 cursor-pointer ${
                            isActive
                              ? "bg-[#0f172a] text-white border-[#0f172a] shadow-2xs"
                              : "bg-card text-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {st.buttonLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Googleマップ音声カーナビ起動ボタン（公式ブランドカラー #1A73E8 単色ソリッド） */}
              <button
                type="button"
                onClick={handleOpenExternalNavigation}
                className="w-full h-10 px-4 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-black flex items-center justify-center gap-2 shadow-2xs active:scale-98 transition-all cursor-pointer"
              >
                <Navigation className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  Googleマップで「{activeTargetLabel}」へ音声ナビ起動
                </span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>

            {/* ==================== 3. 1号車〜N号車 隊列ステータス一覧 ==================== */}
            <div className="p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>各号車の現在状況（タップで地図フォーカス）</span>
                </h4>
                <span className="text-[11px] font-bold text-muted-foreground">
                  5秒自動更新
                </span>
              </div>

              <div className="space-y-1.5">
                {enrichedCars.map((item) => {
                  const isSelected = item.car.carNumber === selectedCarNumber;
                  const isMine = item.car.carpoolId === myCarpoolId;
                  return (
                    <button
                      key={item.car.carpoolId}
                      type="button"
                      onClick={() => handleSelectCarAndFocus(item.car.carNumber)}
                      className={`w-full text-left rounded-xl border p-2.5 transition-colors cursor-pointer ${
                        isSelected
                          ? "border-2 border-primary bg-primary/[0.04]"
                          : "border-border bg-card hover:bg-muted/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0 tabular-nums"
                            style={{ backgroundColor: item.visual.pinFill }}
                          >
                            {item.car.carNumber}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black text-foreground truncate">
                                {item.car.driverName}
                              </span>
                              {item.car.isCargo && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black">
                                  📦 道具車
                                </span>
                              )}
                              {isMine && (
                                <span className="px-1.5 py-0.5 rounded bg-teal-500 text-slate-950 text-[10px] font-black">
                                  選択中
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-bold text-muted-foreground truncate">
                              {item.live?.senderName
                                ? `発信: ${item.live.senderName}（${item.agoLabel}）`
                                : `${item.car.carModel} ・ 未発信`}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-black ${item.visual.badgeBgClass} ${item.visual.badgeTextClass}`}
                          >
                            {item.visual.shortLabel}
                          </span>
                          {item.distanceInfo && (
                            <div className="text-[11px] font-black text-foreground tabular-nums mt-0.5">
                              あと {item.distanceInfo.roadKm.toFixed(1)}km
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {snapshot?.destination?.parkingInfo &&
                direction === "outbound" && (
                  <div className="mt-2 p-2.5 rounded-xl bg-muted border border-border flex items-start gap-2 text-xs">
                    <MapPin className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-black text-foreground block">
                        現地駐車ルール（球場マスタ自動連携）
                      </span>
                      <span className="text-muted-foreground font-bold text-[11px]">
                        {snapshot.destination.parkingInfo}
                      </span>
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}
      </section>

      {/* ==================== 管理者向け：Google Maps APIキー設定モーダル（Portal + z-[9999]） ==================== */}
      {isKeyModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsKeyModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-teal-400" />
                  <h3 className="text-sm font-black text-white">
                    Google Maps APIキー設定
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsKeyModalOpen(false)}
                  className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto text-xs">
                <p className="font-bold text-muted-foreground leading-relaxed">
                  Google Cloud Console で発行した{" "}
                  <strong className="text-foreground">
                    Maps JavaScript API
                  </strong>{" "}
                  のキー（<code className="px-1 rounded bg-muted">AIza...</code>
                  ）を登録すると、チーム全員の隊列マップがリアルタイム渋滞情報・航空写真対応の本物のGoogleマップに切り替わります。
                </p>

                <div className="p-3 rounded-xl bg-muted border border-border space-y-1.5 text-[11px] font-bold text-muted-foreground">
                  <div className="text-foreground font-black">
                    🔒 無料枠（月10,000回）で安全に使う推奨設定
                  </div>
                  <div>
                    1. Google Cloud で「Maps JavaScript API」と「Geocoding API」を有効化
                  </div>
                  <div>
                    2. アプリケーションの制限（HTTPリファラ）に{" "}
                    <code className="px-1 rounded bg-card text-foreground">
                      https://iscorecloud.com/*
                    </code>{" "}
                    を設定
                  </div>
                  <div>
                    3. クォータ上限を1日300回（月9,000回）に設定すれば課金リスクを完全にゼロにできます
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-foreground">
                    Maps JavaScript API キー
                  </label>
                  <input
                    type="text"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-muted/40 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsKeyModalOpen(false)}
                  className="h-10 px-4 rounded-xl border border-border bg-card text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSavingKey}
                  onClick={() => void handleSaveApiKey()}
                  className="h-10 px-4 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingKey && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>保存する</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
