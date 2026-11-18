// filepath: src/components/liff/GoogleMapsSettingsSection.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Car,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Loader2,
  MapPin,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";

interface MapsKeySettingsResponse {
  success: boolean;
  isDemo?: boolean;
  canManageMapsKey?: boolean;
  googleMapsKeySource?: "env" | "org" | "none";
  googleMapsApiKey?: string | null;
  error?: string;
}

interface GoogleMapsSettingsSectionProps {
  teamId: string;
  isDemoTeam: boolean;
  canManageMapsKey: boolean;
}

export function GoogleMapsSettingsSection({
  teamId,
  isDemoTeam,
  canManageMapsKey,
}: GoogleMapsSettingsSectionProps) {
  const { profile } = useLiff();
  const safeTeamId = teamId || "demo-team";
  const endpointUrl = useMemo(
    () =>
      `/api/liff/carpool-convoy/maps-key?teamId=${encodeURIComponent(
        safeTeamId
      )}`,
    [safeTeamId]
  );

  const initialCached = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<MapsKeySettingsResponse>(endpointUrl);
  }, [endpointUrl]);

  const [keySource, setKeySource] = useState<"env" | "org" | "none">(
    initialCached?.googleMapsKeySource || "none"
  );
  const [savedOrgKey, setSavedOrgKey] = useState<string>(
    initialCached?.googleMapsKeySource === "org"
      ? initialCached?.googleMapsApiKey || ""
      : ""
  );
  const [serverCanManage, setServerCanManage] = useState<boolean | null>(
    typeof initialCached?.canManageMapsKey === "boolean"
      ? initialCached.canManageMapsKey
      : null
  );
  const [apiKeyInput, setApiKeyInput] = useState<string>(
    initialCached?.googleMapsKeySource === "org"
      ? initialCached?.googleMapsApiKey || ""
      : ""
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const effectiveCanEdit =
    serverCanManage !== null ? serverCanManage : canManageMapsKey;

  const loadMapsKeyStatus = useCallback(async () => {
    const syncHit = peekLiffApiCache<MapsKeySettingsResponse>(endpointUrl);
    if (syncHit?.success) {
      const nextSource = syncHit.googleMapsKeySource || "none";
      const nextKey =
        nextSource === "org" ? syncHit.googleMapsApiKey || "" : "";
      setKeySource(nextSource);
      setSavedOrgKey(nextKey);
      setApiKeyInput(nextKey);
      if (typeof syncHit.canManageMapsKey === "boolean") {
        setServerCanManage(syncHit.canManageMapsKey);
      }
    }

    try {
      const res = await fetch(endpointUrl);
      const json = (await res.json()) as MapsKeySettingsResponse;
      if (res.ok && json.success) {
        const nextSource = json.googleMapsKeySource || "none";
        const nextKey =
          nextSource === "org" ? json.googleMapsApiKey || "" : "";
        setKeySource(nextSource);
        setSavedOrgKey(nextKey);
        setApiKeyInput(nextKey);
        if (typeof json.canManageMapsKey === "boolean") {
          setServerCanManage(json.canManageMapsKey);
        }
      }
    } catch {
      // オフライン・通信エラー時は既存表示を維持
    }
  }, [endpointUrl]);

  useEffect(() => {
    setShowApiKey(false);
    setShowGuide(false);
    void loadMapsKeyStatus();
  }, [loadMapsKeyStatus]);

  const handleSaveApiKey = async (nextKeyRaw: string) => {
    if (!safeTeamId || safeTeamId === "demo-team" || isDemoTeam) {
      toast.error("体験デモモードではAPIキーを保存できません");
      return;
    }

    const trimmed = nextKeyRaw.trim();
    const uid =
      profile?.userId ||
      (typeof window !== "undefined"
        ? localStorage.getItem("iscore_user_id") ||
          localStorage.getItem("iscore_userId")
        : "") ||
      "";
    const uName =
      profile?.displayName ||
      (typeof window !== "undefined"
        ? localStorage.getItem("iscore_user_name")
        : "") ||
      "";

    setIsSaving(true);
    try {
      const res = await fetch("/api/liff/carpool-convoy/maps-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: safeTeamId,
          apiKey: trimmed,
          userId: uid || null,
          userName: uName || null,
        }),
      });
      const json = (await res.json()) as MapsKeySettingsResponse;
      if (!res.ok || !json.success) {
        toast.error(json.error || "APIキーの保存に失敗しました");
        return;
      }

      invalidateLiffApiCache("/api/liff/carpool-convoy");
      invalidateLiffApiCache("/api/liff/admin/dashboard");

      const nextSource = json.googleMapsKeySource || "none";
      const nextKey =
        nextSource === "org" ? json.googleMapsApiKey || trimmed : "";
      setKeySource(nextSource);
      setSavedOrgKey(nextKey);
      setApiKeyInput(nextKey);

      toast.success(
        trimmed
          ? "Google Maps APIキーを保存しました！隊列マップと球場AI検索に適用されます"
          : "Google Maps APIキー設定を解除しました"
      );
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
      {/* A-3 上帯ダークキャップ（Google Maps 公式ブランドカラー #1A73E8 ボーダー） */}
      <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-[#1A73E8] px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-xl bg-[#1A73E8] text-white flex items-center justify-center shrink-0 shadow-2xs">
            <MapPin className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-black text-white truncate">
              Google Maps 連携設定
            </h2>
            <p className="text-[10px] font-bold text-slate-300 truncate">
              隊列ライブマップ（渋滞・航空写真）＆ 球場AI検索
            </p>
          </div>
        </div>

        {keySource === "env" ? (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-emerald-500 text-slate-950 shrink-0">
            システム共通適用中
          </span>
        ) : keySource === "org" && Boolean(savedOrgKey) ? (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-[#1A73E8] text-white shrink-0">
            Googleマップ有効
          </span>
        ) : (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 shrink-0">
            未設定（レーダー）
          </span>
        )}
      </div>

      <div className="p-4 space-y-3 text-xs">
        {keySource === "env" ? (
          <div className="p-3 rounded-xl bg-muted border border-border space-y-1">
            <p className="font-black text-foreground">
              ✅ システム共通キー（GOOGLE_MAPS_API_KEY）で有効化済みです
            </p>
            <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
              クラブ個別のAPIキー登録は不要です。配車表の隊列ライブマップ（渋滞レイヤー・航空写真）と球場マスタのAI検索がそのまま利用できます。
            </p>
          </div>
        ) : effectiveCanEdit ? (
          <>
            <p className="font-bold text-muted-foreground leading-relaxed text-[11px]">
              クラブ共通の{" "}
              <strong className="text-foreground">Maps JavaScript API</strong>{" "}
              キー（
              <code className="px-1 rounded bg-muted text-foreground font-mono">
                AIza...
              </code>
              ）を登録すると、配車表の隊列マップでリアルタイム渋滞・航空写真が表示され、球場マスタのAI自動取得精度も向上します（未設定時は課金ゼロの隊列レーダーで動作）。
            </p>

            {/* 折りたたみ式の推奨設定ガイド */}
            <div className="rounded-xl border border-border bg-muted/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowGuide((v) => !v)}
                className="w-full px-3 py-2 flex items-center justify-between text-left text-[11px] font-black text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-[#1A73E8] shrink-0" />
                  <span>無料枠（月10,000回）で安全に使う推奨設定</span>
                </span>
                {showGuide ? (
                  <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
              </button>
              {showGuide && (
                <div className="px-3 pb-3 pt-1 border-t border-border space-y-1 text-[11px] font-bold text-muted-foreground">
                  <div>
                    1. Google Cloud Console で「Maps JavaScript API」と「Geocoding API」を有効化
                  </div>
                  <div>
                    2. HTTPリファラ制限に{" "}
                    <code className="px-1 rounded bg-card text-foreground font-mono">
                      https://iscorecloud.com/*
                    </code>{" "}
                    を設定
                  </div>
                  <div>
                    3. 1日300回の上限設定を入れておくと課金リスクをゼロにできます
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-black text-foreground">
                Maps JavaScript API キー
              </label>
              <div className="relative flex items-center">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  autoComplete="off"
                  className="w-full h-10 pl-3 pr-10 rounded-xl border border-border bg-background text-foreground text-xs font-mono font-bold"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  aria-label={
                    showApiKey ? "APIキーを隠す" : "APIキーを表示する"
                  }
                  className="absolute right-2 w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer"
                >
                  {showApiKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              {keySource === "org" && Boolean(savedOrgKey) && (
                <button
                  type="button"
                  disabled={isSaving || isDemoTeam}
                  onClick={() => void handleSaveApiKey("")}
                  className="h-10 px-3 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-black flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>解除</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSaving || isDemoTeam || !apiKeyInput.trim()}
                onClick={() => void handleSaveApiKey(apiKeyInput)}
                className="flex-1 h-10 px-4 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>保存中...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>APIキーを保存する</span>
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="p-3 rounded-xl bg-muted/50 border border-border text-[11px] font-bold text-muted-foreground leading-relaxed">
            {keySource === "org"
              ? "クラブ共通の Google Maps API キーが設定されています。配車表の隊列ライブマップで渋滞表示・航空写真が利用可能です。"
              : "現在は標準の隊列レーダー表示モードです（IT管理者・監督・指導者がAPIキーを設定すると渋滞・航空写真マップが有効になります）。"}
          </div>
        )}

        {/* 連携先ショートカット */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Link
            href="/liff/carpool"
            className="h-9 px-3 rounded-xl border border-border bg-muted/40 hover:bg-muted text-foreground text-[11px] font-black flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Car className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="truncate">隊列ライブマップ</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </Link>

          <Link
            href="/liff/grounds"
            className="h-9 px-3 rounded-xl border border-border bg-muted/40 hover:bg-muted text-foreground text-[11px] font-black flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-1.5 truncate">
              <MapPin className="w-3.5 h-3.5 text-[#1A73E8] shrink-0" />
              <span className="truncate">球場・施設マップ</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </Link>
        </div>
      </div>
    </section>
  );
}
