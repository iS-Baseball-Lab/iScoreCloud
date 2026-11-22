// filepath: src/components/liff/HubTopNewsTicker.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ChevronRight,
  List,
  Megaphone,
  Pencil,
  X,
} from "lucide-react";
import type { HubEventInputItem } from "@/components/liff/HubHeroSection";
import type { MatchCardData } from "@/components/liff/MatchScoreCard";
import { warmupLiffEndpointForHref } from "@/lib/liff/api-cache";
import {
  buildHubTickerFeed,
  formatShortMonthDay,
  type HubTickerBadgeVariant,
  type HubTickerConfig,
  type HubTickerResolvedItem,
  type HubTickerServerContext,
} from "@/lib/liff/hub-ticker";
import type { HubSpecialEventSummary } from "@/lib/liff/special-events-schema";
import { cn } from "@/lib/utils";

const HubTickerEditorModal = dynamic(
  () =>
    import("@/components/liff/HubTickerEditorModal").then(
      (m) => m.HubTickerEditorModal
    ),
  { ssr: false }
);

interface HubTopNewsTickerProps {
  teamId: string | null | undefined;
  isDemo: boolean;
  canManage: boolean;
  userName: string;
  practiceMatchLabel: string;
  config: HubTickerConfig;
  serverContext: HubTickerServerContext | null;
  events: HubEventInputItem[];
  specialEvents: HubSpecialEventSummary[];
  matches: MatchCardData[];
  onConfigSaved: (nextConfig: HubTickerConfig) => void;
}

const BADGE_VARIANT_STYLES: Record<HubTickerBadgeVariant, string> = {
  urgent: "bg-rose-600 text-white border-rose-500",
  live: "bg-rose-600 text-white border-rose-400",
  warning: "bg-amber-400 text-slate-950 border-amber-300",
  schedule: "bg-teal-400 text-slate-950 border-teal-300",
  result: "bg-emerald-400 text-slate-950 border-emerald-300",
  media: "bg-[#FF0000] text-white border-red-400",
  admin: "bg-amber-400 text-slate-950 border-amber-300",
  info: "bg-sky-400 text-slate-950 border-sky-300",
};

const LIST_CARD_BADGE_STYLES: Record<HubTickerBadgeVariant, string> = {
  urgent: "bg-rose-600 text-white border-rose-600",
  live: "bg-rose-600 text-white border-rose-600",
  warning: "bg-amber-500 text-slate-950 border-amber-500",
  schedule: "bg-teal-600 text-white border-teal-600",
  result: "bg-emerald-600 text-white border-emerald-600",
  media: "bg-[#FF0000] text-white border-[#FF0000]",
  admin: "bg-slate-800 text-amber-300 border-slate-700",
  info: "bg-sky-600 text-white border-sky-600",
};

const SHORT_HOLD_MS = 4800;
const LONG_INITIAL_HOLD_MS = 1400;
const LONG_END_HOLD_MS = 1600;

/**
 * ⚾ トップページ最上部「ハイブリッド流れるメッセージ（C案）」コンポーネント
 * - 短〜通常文: 4.8秒ピタッと静止（ProMotion 1Hz 省電力維持）➔ 0.28秒で次の案内へ縦スライド切替
 * - 1行を超える長文: 先頭で1.4秒静止 ➔ 読みやすい速度で末尾まで横スクロール ➔ 1.6秒静止後に次へ縦スライド切替
 * - 屋外視認性抜群のソリッド・スタジアムネイビー帯（グラデーション・ブラー完全不使用）
 */
export function HubTopNewsTicker({
  teamId,
  isDemo,
  canManage,
  userName,
  practiceMatchLabel,
  config,
  serverContext,
  events,
  specialEvents,
  matches,
  onConfigSaved,
}: HubTopNewsTickerProps) {
  const [mounted, setMounted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panOffsetPx, setPanOffsetPx] = useState(0);
  const [panDurationMs, setPanDurationMs] = useState(0);
  const [viewportWidthHint, setViewportWidthHint] = useState(0);

  const [isPageVisible, setIsPageVisible] = useState(true);
  const [isInViewport, setIsInViewport] = useState(true);
  const [isTouchPaused, setIsTouchPaused] = useState(false);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<HubTickerResolvedItem | null>(
    null
  );

  const rootRef = useRef<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const singlePassCountRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipedDuringTouchRef = useRef<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const items = useMemo(
    () =>
      buildHubTickerFeed({
        config,
        events,
        specialEvents,
        matches,
        serverContext,
        canManage,
        isDemo,
        practiceMatchLabel,
        userName,
      }),
    [
      canManage,
      config,
      events,
      isDemo,
      matches,
      practiceMatchLabel,
      serverContext,
      specialEvents,
      userName,
    ]
  );

  const safeIndex = items.length > 0 ? activeIndex % items.length : 0;
  const activeItem = items[safeIndex] || null;

  // チーム切替時は先頭アイテムへリセット
  useEffect(() => {
    setActiveIndex(0);
    setPanOffsetPx(0);
    setPanDurationMs(0);
    singlePassCountRef.current = 0;
  }, [teamId]);

  // ページ可視状態の監視（バックグラウンド時はタイマー完全停止）
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVis = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };
    handleVis();
    document.addEventListener("visibilitychange", handleVis);
    return () => document.removeEventListener("visibilitychange", handleVis);
  }, []);

  // 画面外スクロール時のタイマー自動休止（モバイル省電力規約準拠）
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsInViewport(entry.isIntersecting);
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [config.enabled]);

  // ビューポート横幅変化の検知（画面回転・リサイズ時の長文折返し再計算）
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width || 0);
      setViewportWidthHint((prev) => (prev === w ? prev : w));
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [config.enabled]);

  const advanceNext = useCallback(() => {
    if (items.length <= 1) return;
    setPanDurationMs(0);
    setPanOffsetPx(0);
    setActiveIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  const advancePrev = useCallback(() => {
    if (items.length <= 1) return;
    setPanDurationMs(0);
    setPanOffsetPx(0);
    setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  // C案ハイブリッド制御（通常は静止➔縦切替 ／ 1行からはみ出る長文のみ横スクロール➔縦切替）
  useEffect(() => {
    setPanDurationMs(0);
    setPanOffsetPx(0);

    if (
      !config.enabled ||
      !activeItem ||
      !isPageVisible ||
      !isInViewport ||
      isTouchPaused ||
      isEditorOpen ||
      isListOpen ||
      detailItem !== null
    ) {
      return;
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const vpEl = viewportRef.current;
    const txtEl = textRef.current;
    const overflowPx =
      vpEl && txtEl && !prefersReducedMotion
        ? Math.ceil(txtEl.scrollWidth - vpEl.clientWidth)
        : 0;

    let panStartTimer: ReturnType<typeof setTimeout> | null = null;
    let nextStepTimer: ReturnType<typeof setTimeout> | null = null;

    if (overflowPx > 6) {
      // 1行に収まらない長文: 先頭で1.4秒静止 ➔ ゆっくり横スクロール ➔ 末尾で1.6秒静止 ➔ 次の項目へ
      if (items.length === 1 && singlePassCountRef.current >= 2) {
        return;
      }
      const scrollMs = Math.min(
        9500,
        Math.max(2400, Math.round(overflowPx * 38))
      );

      panStartTimer = setTimeout(() => {
        setPanDurationMs(scrollMs);
        setPanOffsetPx(overflowPx + 10);
      }, LONG_INITIAL_HOLD_MS);

      nextStepTimer = setTimeout(() => {
        if (items.length > 1) {
          setPanDurationMs(0);
          setPanOffsetPx(0);
          setActiveIndex((prev) => (prev + 1) % items.length);
        } else {
          singlePassCountRef.current += 1;
          setPanDurationMs(0);
          setPanOffsetPx(0);
        }
      }, LONG_INITIAL_HOLD_MS + scrollMs + LONG_END_HOLD_MS);
    } else if (items.length > 1) {
      // 1行に収まる通常文: 4.8秒ピタッと静止した後に次の項目へ縦切替
      nextStepTimer = setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % items.length);
      }, SHORT_HOLD_MS);
    }

    return () => {
      if (panStartTimer) clearTimeout(panStartTimer);
      if (nextStepTimer) clearTimeout(nextStepTimer);
    };
  }, [
    activeItem,
    config.enabled,
    detailItem,
    isEditorOpen,
    isInViewport,
    isListOpen,
    isPageVisible,
    isTouchPaused,
    items.length,
    safeIndex,
    viewportWidthHint,
  ]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    swipedDuringTouchRef.current = false;
    setIsTouchPaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    const end = e.changedTouches[0];
    touchStartRef.current = null;
    setIsTouchPaused(false);
    if (!start || !end || items.length <= 1) return;

    const dx = end.clientX - start.clientX;
    const dy = end.clientY - start.clientY;
    if (Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      swipedDuringTouchRef.current = true;
      if (dx < 0) {
        advanceNext();
      } else {
        advancePrev();
      }
    }
  };

  // OFF 設定時: 一般メンバーには完全非表示、監督・管理者には再開できるコンパクトバーを表示
  if (!config.enabled) {
    if (!canManage) return null;
    return (
      <>
        <section
          ref={rootRef}
          aria-label="チーム案内ティッカー（非表示中）"
          className="w-full bg-[#0f172a] text-slate-300 border-b border-slate-800 px-3 py-1.5 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-1.5 min-w-0 text-[11px] font-bold truncate">
            <Megaphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">
              トップ最上部の流れるメッセージは現在OFFです（管理者のみ表示）
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsEditorOpen(true)}
            className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 text-[10.5px] font-black inline-flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <Pencil className="w-3 h-3" />
            <span>再開・編集</span>
          </button>
        </section>

        {isEditorOpen && (
          <HubTickerEditorModal
            isOpen={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            teamId={teamId}
            isDemo={isDemo}
            initialConfig={config}
            userName={userName}
            onSaved={onConfigSaved}
          />
        )}
      </>
    );
  }

  if (!activeItem) return null;

  const isUrgentAccent =
    activeItem.badgeVariant === "urgent" || activeItem.badgeVariant === "live";

  const tickerTextStage = (
    <div
      key={`${activeItem.id}:${safeIndex}`}
      className="flex items-center gap-2 min-w-0 flex-1 animate-liff-ticker-up"
    >
      {/* 左: 高視認ソリッド種別バッジ */}
      <span
        className={cn(
          "px-1.5 py-0.5 rounded-md border text-[10px] font-black leading-none tracking-tight shrink-0 select-none",
          BADGE_VARIANT_STYLES[activeItem.badgeVariant]
        )}
      >
        {activeItem.badgeText}
      </span>

      {/* 中央: 1行ビューポート（長文時のみ自動でスムーズ横スクロール） */}
      <div
        ref={viewportRef}
        className="flex-1 min-w-0 overflow-hidden flex items-center"
      >
        <span
          ref={textRef}
          style={{
            transform:
              panOffsetPx > 0
                ? `translate3d(-${panOffsetPx}px, 0, 0)`
                : "translate3d(0, 0, 0)",
            transition:
              panDurationMs > 0
                ? `transform ${panDurationMs}ms linear`
                : "none",
          }}
          className="inline-block whitespace-nowrap text-xs font-black text-white leading-snug tracking-tight will-change-transform"
        >
          {activeItem.text}
        </span>
      </div>

      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white shrink-0" />
    </div>
  );

  return (
    <>
      <section
        ref={rootRef}
        aria-label="チームの状況・お知らせ"
        onMouseEnter={() => setIsTouchPaused(true)}
        onMouseLeave={() => setIsTouchPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => setIsTouchPaused(false)}
        className={cn(
          "w-full bg-[#0f172a] text-slate-50 border-b border-slate-800 px-2.5 sm:px-3.5 py-1.5 flex items-center gap-1.5 select-none",
          isUrgentAccent && "border-l-[4px] border-l-rose-500"
        )}
      >
        {/* メッセージ本体（リンク遷移 または 全文ポップアップ） */}
        {activeItem.href ? (
          <Link
            href={activeItem.href}
            onPointerDown={() =>
              warmupLiffEndpointForHref(activeItem.href, teamId || undefined)
            }
            onClick={(e) => {
              if (swipedDuringTouchRef.current) {
                e.preventDefault();
                swipedDuringTouchRef.current = false;
              }
            }}
            className="flex items-center min-w-0 flex-1 py-0.5 group outline-hidden cursor-pointer"
          >
            {tickerTextStage}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (swipedDuringTouchRef.current) {
                swipedDuringTouchRef.current = false;
                return;
              }
              setDetailItem(activeItem);
            }}
            className="flex items-center min-w-0 flex-1 py-0.5 text-left group outline-hidden cursor-pointer"
          >
            {tickerTextStage}
          </button>
        )}

        {/* 右端アクション: 一覧ピル（複数件ある時）＆ 管理者専用「✏️ 編集」ボタン */}
        <div className="flex items-center gap-1 shrink-0">
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => setIsListOpen(true)}
              aria-label="流れている案内を一覧表示"
              title="現在の案内・チーム状況をすべて見る"
              className="h-6 px-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-black tabular-nums inline-flex items-center gap-1 cursor-pointer active:scale-95 transition-transform"
            >
              <List className="w-3 h-3 text-slate-400" />
              <span>
                {safeIndex + 1}/{items.length}
              </span>
            </button>
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => setIsEditorOpen(true)}
              aria-label="トップ案内メッセージを編集"
              className="h-6 px-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 hover:text-amber-200 text-[10px] font-black inline-flex items-center gap-1 cursor-pointer active:scale-95 transition-transform"
            >
              <Pencil className="w-2.5 h-2.5" />
              <span>編集</span>
            </button>
          )}
        </div>
      </section>

      {/* 📋 全メッセージ一覧ボトムシート（見逃した案内を1タップで確認） */}
      {mounted &&
        isListOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/70 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-liff-backdrop-in"
            onClick={() => setIsListOpen(false)}
          >
            <div
              className="w-full max-w-lg max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col animate-liff-sheet-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Megaphone className="w-4 h-4 text-amber-400 shrink-0" />
                  <h3 className="text-sm font-black text-white truncate">
                    現在のチーム状況・案内一覧（{items.length}件）
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsListOpen(false);
                        setIsEditorOpen(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>編集</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsListOpen(false)}
                    className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                    aria-label="閉じる"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border bg-card">
                {items.map((item) => {
                  const inner = (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded-md border text-[10px] font-black leading-none shrink-0",
                            LIST_CARD_BADGE_STYLES[item.badgeVariant]
                          )}
                        >
                          {item.badgeText}
                        </span>
                        {item.metaText && (
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {item.metaText}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-xs font-black text-foreground leading-relaxed">
                          {item.manualItem ? item.manualItem.text : item.text}
                        </p>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
                    </>
                  );

                  if (item.href) {
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        onPointerDown={() =>
                          warmupLiffEndpointForHref(
                            item.href,
                            teamId || undefined
                          )
                        }
                        onClick={() => setIsListOpen(false)}
                        className="block px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors"
                      >
                        {inner}
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setIsListOpen(false);
                        setDetailItem(item);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors cursor-pointer"
                    >
                      {inner}
                    </button>
                  );
                })}
              </div>

              <div className="px-4 pt-2.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3 border-t border-border bg-muted/40 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsListOpen(false)}
                  className="w-full h-9 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-foreground cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 📣 リンクなし手動連絡の全文詳細モーダル */}
      {mounted &&
        detailItem &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/70 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-liff-backdrop-in"
            onClick={() => setDetailItem(null)}
          >
            <div
              className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col animate-liff-sheet-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-md border text-[11px] font-black",
                    BADGE_VARIANT_STYLES[detailItem.badgeVariant]
                  )}
                >
                  {detailItem.badgeText}
                </span>
                <button
                  type="button"
                  onClick={() => setDetailItem(null)}
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 bg-card">
                <p className="text-sm font-black text-foreground whitespace-pre-wrap leading-relaxed">
                  {detailItem.manualItem?.text || detailItem.text}
                </p>

                {detailItem.manualItem && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted-foreground pt-1 border-t border-border">
                    {detailItem.manualItem.updatedBy && (
                      <span>発信: {detailItem.manualItem.updatedBy}</span>
                    )}
                    {detailItem.manualItem.expiresAt && (
                      <span>
                        ・掲示期限:{" "}
                        {formatShortMonthDay(detailItem.manualItem.expiresAt)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="px-4 pt-2.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-muted/40 flex items-center gap-2">
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailItem(null);
                      setIsEditorOpen(true);
                    }}
                    className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-primary inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>編集する</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDetailItem(null)}
                  className="flex-1 h-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black cursor-pointer"
                >
                  確認しました
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ✏️ 監督・管理者向け 10秒クイック編集モーダル */}
      {isEditorOpen && (
        <HubTickerEditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          teamId={teamId}
          isDemo={isDemo}
          initialConfig={config}
          userName={userName}
          onSaved={onConfigSaved}
        />
      )}
    </>
  );
}
