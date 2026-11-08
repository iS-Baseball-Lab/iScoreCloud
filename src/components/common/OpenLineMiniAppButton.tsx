// filepath: src/components/common/OpenLineMiniAppButton.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiLine } from "react-icons/si";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  Monitor,
  QrCode,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  buildLineMiniAppTargets,
  detectIsMobileBrowser,
  getCachedLineMiniAppConfig,
  persistWebToLiffHandoff,
  resolveLineMiniAppConfig,
  type LineMiniAppConfig,
} from "@/lib/line-miniapp";

export interface OpenLineMiniAppButtonProps {
  variant?: "header" | "hero" | "banner" | "menu-item";
  teamId?: string | null;
  teamName?: string | null;
  userId?: string | null;
  userName?: string | null;
  avatarUrl?: string | null;
  subPath?: string;
  showQrTrigger?: boolean;
  compact?: boolean;
  className?: string;
  onAfterClick?: () => void;
}

export function OpenLineMiniAppButton({
  variant = "header",
  teamId,
  teamName,
  userId,
  userName,
  avatarUrl,
  subPath,
  showQrTrigger = false,
  compact = false,
  className,
  onAfterClick,
}: OpenLineMiniAppButtonProps) {
  const router = useRouter();
  const [config, setConfig] = useState<LineMiniAppConfig>(() =>
    getCachedLineMiniAppConfig()
  );
  const [isMobile, setIsMobile] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [qrLoadFailed, setQrLoadFailed] = useState(false);

  useEffect(() => {
    setIsMobile(detectIsMobileBrowser());
    let active = true;
    void resolveLineMiniAppConfig().then((resolved) => {
      if (active) setConfig(resolved);
    });
    return () => {
      active = false;
    };
  }, []);

  const resolvedTeamId = useMemo(() => {
    if (teamId) return teamId;
    if (typeof window !== "undefined") {
      return localStorage.getItem("iscore_selectedTeamId");
    }
    return null;
  }, [teamId]);

  const resolvedTeamName = useMemo(() => {
    if (teamName) return teamName;
    if (typeof window !== "undefined") {
      return localStorage.getItem("iscore_selectedTeamName");
    }
    return null;
  }, [teamName]);

  const targets = useMemo(
    () =>
      buildLineMiniAppTargets({
        config,
        teamId: resolvedTeamId,
        subPath,
      }),
    [config, resolvedTeamId, subPath]
  );

  const handlePrefetch = useCallback(() => {
    router.prefetch(targets.internalHref);
  }, [router, targets.internalHref]);

  const handlePrepareHandoff = useCallback(() => {
    persistWebToLiffHandoff({
      teamId: resolvedTeamId,
      teamName: resolvedTeamName,
      userId,
      userName,
      avatarUrl,
    });
    onAfterClick?.();
  }, [
    avatarUrl,
    onAfterClick,
    resolvedTeamId,
    resolvedTeamName,
    userId,
    userName,
  ]);

  const handleOpenInBrowser = useCallback(() => {
    handlePrepareHandoff();
    setIsQrOpen(false);
    router.push(targets.internalHref);
  }, [handlePrepareHandoff, router, targets.internalHref]);

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(targets.qrTargetUrl);
      setIsCopied(true);
      toast.success("LINEミニアプリのURLをコピーしました！");
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("URLのコピーに失敗しました");
    }
  }, [targets.qrTargetUrl]);

  // スマホ閲覧かつ LIFF ID / ミニアプリURL 設定済みならネイティブ LINE Universal Link を優先
  const shouldUseExternalUniversalLink = Boolean(
    isMobile && targets.externalLineUrl
  );

  const qrImageSrc = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(
      targets.qrTargetUrl
    )}`;
  }, [targets.qrTargetUrl]);

  const qrModal =
    isQrOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setIsQrOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* A-3 上帯ダークキャップ × 公式LINEグリーン下線 */}
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-[#06C755] px-4 py-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src="/liff-logo.webp"
                    alt="iScoreCloud LINEミニアプリ"
                    className="w-9 h-9 rounded-[22%] bg-slate-900 border border-slate-700 object-contain shrink-0 shadow-xs"
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm font-black tracking-tight truncate">
                      iScoreCloud for LINEミニアプリ
                    </h3>
                    <p className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">
                      OPEN IN LINE MINI APP
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQrOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors shrink-0"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-4">
                {resolvedTeamName && (
                  <div className="rounded-xl border border-border bg-muted px-3 py-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-muted-foreground shrink-0">
                      引き継ぎチーム
                    </span>
                    <span className="font-black text-foreground truncate">
                      {resolvedTeamName}
                    </span>
                  </div>
                )}

                {/* スマホ読み取り用 QR コード枠 */}
                <div className="rounded-2xl border border-border bg-[#eef2f6] dark:bg-slate-900 p-4 flex flex-col items-center text-center space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                    <Smartphone className="w-4 h-4 text-[#06C755]" />
                    <span>スマホのカメラ / LINE QRリーダーで読み取り</span>
                  </div>

                  {!qrLoadFailed ? (
                    <div className="rounded-xl border-2 border-slate-300 bg-white p-2 shadow-xs">
                      <img
                        src={qrImageSrc}
                        alt="LINEミニアプリ起動用QRコード"
                        width={184}
                        height={184}
                        className="w-44 h-44 object-contain"
                        onError={() => setQrLoadFailed(true)}
                      />
                    </div>
                  ) : (
                    <div className="w-full rounded-xl border border-border bg-card p-3 text-xs font-bold text-muted-foreground break-all">
                      {targets.qrTargetUrl}
                    </div>
                  )}

                  <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                    {targets.externalLineUrl
                      ? "スマホで読み取るとLINEアプリ内のミニアプリが直接起動します。"
                      : "LINEアプリの「友だち追加 ＞ QRコード」から読み取ると、LINE内でミニアプリが開きます。"}
                  </p>
                </div>

                {/* アクションボタン群 */}
                <div className="space-y-2.5">
                  {targets.externalLineUrl ? (
                    <a
                      href={targets.externalLineUrl}
                      onClick={() => {
                        handlePrepareHandoff();
                        setIsQrOpen(false);
                      }}
                      className="w-full h-12 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-sm flex items-center justify-center gap-2 shadow-xs transition-colors"
                    >
                      <SiLine className="w-5 h-5" />
                      <span>LINEアプリで起動する</span>
                      <ArrowUpRight className="w-4 h-4" />
                    </a>
                  ) : isMobile ? (
                    <a
                      href={targets.lineQrScannerUrl}
                      onClick={handlePrepareHandoff}
                      className="w-full h-11 rounded-xl border border-[#06C755] bg-card hover:bg-muted text-[#06C755] font-black text-xs flex items-center justify-center gap-2 transition-colors"
                    >
                      <SiLine className="w-4 h-4" />
                      <span>LINEアプリを起動する</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleOpenInBrowser}
                    className={cn(
                      "w-full h-12 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-colors shadow-xs",
                      targets.externalLineUrl
                        ? "border border-border bg-card hover:bg-muted text-foreground"
                        : "bg-[#06C755] hover:bg-[#05b34c] text-white"
                    )}
                  >
                    <Monitor className="w-4 h-4" />
                    <span>このままミニアプリ画面を開く</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="w-full h-10 rounded-xl border border-border bg-muted hover:bg-muted/80 text-foreground font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#06C755]" />
                        <span>URLをコピーしました</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>ミニアプリURLをコピー</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  if (variant === "banner") {
    return (
      <>
        <div
          className={cn(
            "rounded-2xl border border-border bg-card shadow-xs overflow-hidden",
            className
          )}
        >
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-[#06C755] px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-[#06C755] text-white flex items-center justify-center shrink-0">
                <SiLine className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-black tracking-tight truncate">
                    LINEミニアプリ版で開く
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[#06C755] text-white text-[9px] font-black tracking-wider uppercase shrink-0">
                    推奨
                  </span>
                </div>
                {!compact && (
                  <p className="text-[10px] font-bold text-slate-300 truncate mt-0.5">
                    清書スコアブック・出欠一覧表・配車隊列マップ・AI球場取得に完全対応
                  </p>
                )}
              </div>
            </div>

            {compact && (
              <div className="flex items-center gap-1.5 shrink-0">
                {shouldUseExternalUniversalLink && targets.externalLineUrl ? (
                  <a
                    href={targets.externalLineUrl}
                    onClick={handlePrepareHandoff}
                    className="h-9 px-3.5 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <SiLine className="w-3.5 h-3.5" />
                    <span>ミニアプリ起動</span>
                  </a>
                ) : (
                  <Link
                    href={targets.internalHref}
                    onPointerDown={handlePrefetch}
                    onClick={handlePrepareHandoff}
                    className="h-9 px-3.5 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <SiLine className="w-3.5 h-3.5" />
                    <span>ミニアプリを開く</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setIsQrOpen(true)}
                  className="h-9 w-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 flex items-center justify-center transition-colors"
                  title="スマホ用QRコード・URLを表示"
                  aria-label="スマホ用QRコード・URLを表示"
                >
                  <QrCode className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {!compact && (
            <div className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                現在ログイン中のアカウント・選択チームを引き継いだまま、スマホ現場向けのLINEミニアプリ画面へ切り替えられます。
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {shouldUseExternalUniversalLink && targets.externalLineUrl ? (
                  <a
                    href={targets.externalLineUrl}
                    onClick={handlePrepareHandoff}
                    className="flex-1 sm:flex-initial h-11 px-4 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-xs"
                  >
                    <SiLine className="w-4 h-4" />
                    <span>LINEミニアプリを開く</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </a>
                ) : (
                  <Link
                    href={targets.internalHref}
                    onPointerDown={handlePrefetch}
                    onClick={handlePrepareHandoff}
                    className="flex-1 sm:flex-initial h-11 px-4 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-xs"
                  >
                    <SiLine className="w-4 h-4" />
                    <span>LINEミニアプリを開く</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => setIsQrOpen(true)}
                  className="h-11 px-3 rounded-xl border border-border bg-muted hover:bg-muted/80 text-foreground font-black text-xs flex items-center justify-center gap-1.5 transition-colors shrink-0"
                  title="スマホ読み取り用QRコードとURLを表示"
                >
                  <QrCode className="w-4 h-4 text-[#06C755]" />
                  <span>QR</span>
                </button>
              </div>
            </div>
          )}
        </div>
        {qrModal}
      </>
    );
  }

  if (variant === "menu-item") {
    return (
      <>
        <div className={cn("flex items-center gap-1.5", className)}>
          {shouldUseExternalUniversalLink && targets.externalLineUrl ? (
            <a
              href={targets.externalLineUrl}
              onClick={handlePrepareHandoff}
              className="flex-1 h-11 px-3 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-sm flex items-center justify-between transition-colors shadow-xs"
            >
              <span className="flex items-center gap-2.5">
                <SiLine className="w-4 h-4" />
                <span>LINEミニアプリを開く</span>
              </span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          ) : (
            <Link
              href={targets.internalHref}
              onPointerDown={handlePrefetch}
              onClick={handlePrepareHandoff}
              className="flex-1 h-11 px-3 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-sm flex items-center justify-between transition-colors shadow-xs"
            >
              <span className="flex items-center gap-2.5">
                <SiLine className="w-4 h-4" />
                <span>LINEミニアプリを開く</span>
              </span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsQrOpen(true);
            }}
            className="h-11 w-11 rounded-xl border border-border bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center transition-colors shrink-0"
            title="スマホ用QRコードを表示"
            aria-label="スマホ用QRコードを表示"
          >
            <QrCode className="w-4 h-4 text-[#06C755]" />
          </button>
        </div>
        {qrModal}
      </>
    );
  }

  if (variant === "hero") {
    return (
      <>
        <div className={cn("inline-flex items-center gap-2", className)}>
          {shouldUseExternalUniversalLink && targets.externalLineUrl ? (
            <a
              href={targets.externalLineUrl}
              onClick={handlePrepareHandoff}
              className="h-14 px-7 rounded-2xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-base flex items-center justify-center gap-2.5 shadow-md active:scale-[0.98] transition-all"
            >
              <SiLine className="w-5 h-5" />
              <span>LINEミニアプリを開く</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          ) : (
            <Link
              href={targets.internalHref}
              onPointerDown={handlePrefetch}
              onClick={handlePrepareHandoff}
              className="h-14 px-7 rounded-2xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-base flex items-center justify-center gap-2.5 shadow-md active:scale-[0.98] transition-all"
            >
              <SiLine className="w-5 h-5" />
              <span>LINEミニアプリを開く</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}

          {showQrTrigger && (
            <button
              type="button"
              onClick={() => setIsQrOpen(true)}
              className="h-14 w-14 rounded-2xl border border-border bg-card hover:bg-muted text-foreground flex items-center justify-center shadow-sm active:scale-[0.98] transition-all shrink-0"
              title="スマホ読み取り用QRコード"
              aria-label="スマホ読み取り用QRコード"
            >
              <QrCode className="w-5 h-5 text-[#06C755]" />
            </button>
          )}
        </div>
        {qrModal}
      </>
    );
  }

  // variant === "header"
  return (
    <>
      <div className={cn("inline-flex items-center gap-1", className)}>
        {shouldUseExternalUniversalLink && targets.externalLineUrl ? (
          <a
            href={targets.externalLineUrl}
            onClick={handlePrepareHandoff}
            className="h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-full bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-[11px] sm:text-xs flex items-center gap-1.5 shadow-xs active:scale-95 transition-all shrink-0"
            title="LINEミニアプリを起動"
          >
            <SiLine className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="sm:hidden">ミニアプリ</span>
            <span className="hidden sm:inline">LINEミニアプリ</span>
          </a>
        ) : (
          <Link
            href={targets.internalHref}
            onPointerDown={handlePrefetch}
            onClick={handlePrepareHandoff}
            className="h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-full bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-[11px] sm:text-xs flex items-center gap-1.5 shadow-xs active:scale-95 transition-all shrink-0"
            title="LINEミニアプリを開く"
          >
            <SiLine className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="sm:hidden">ミニアプリ</span>
            <span className="hidden sm:inline">LINEミニアプリ</span>
          </Link>
        )}

        {showQrTrigger && (
          <button
            type="button"
            onClick={() => setIsQrOpen(true)}
            className="hidden md:flex h-9 sm:h-10 w-9 sm:w-10 rounded-full border border-border bg-card hover:bg-muted text-foreground items-center justify-center shadow-xs active:scale-95 transition-all shrink-0"
            title="スマホのLINEで開く（QRコード）"
            aria-label="スマホのLINEで開く（QRコード）"
          >
            <QrCode className="w-4 h-4 text-[#06C755]" />
          </button>
        )}
      </div>
      {qrModal}
    </>
  );
}

