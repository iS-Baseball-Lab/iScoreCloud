// filepath: src/app/liff/tools/news-generator/_components/FlickPadButton.tsx
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FlickSubOption<T = string> {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  /** ボタン本体に選択中ラベルとして表示する短縮名（省略時は label） */
  shortActiveLabel?: string;
  value: T;
  disabled?: boolean;
}

interface FlickPadButtonProps<T = string> {
  label: string;
  /** サブ選択肢が選ばれているときにボタン表面へ表示するラベル（例: 「左」→「左線」） */
  activeLabel?: string | null;
  isSelected?: boolean;
  disabled?: boolean;
  title?: string;
  popupTitle?: string;
  options?: ReadonlyArray<FlickSubOption<T>>;
  onShortTap: () => void;
  onSelectOption?: (option: FlickSubOption<T>) => void;
  contextKey: string;
  className?: string;
  leadingIcon?: React.ReactNode;
  hideFlickHintDot?: boolean;
}

const HOLD_DELAY_MS = 185;
const FLICK_OPEN_DIST_PX = 16;
const POPUP_MAX_WIDTH = 280;

export function FlickPadButton<T = string>({
  label,
  activeLabel,
  isSelected = false,
  disabled = false,
  title,
  popupTitle,
  options = [],
  onShortTap,
  onSelectOption,
  contextKey,
  className,
  leadingIcon,
  hideFlickHintDot = false,
}: FlickPadButtonProps<T>) {
  const [mounted, setMounted] = useState(false);
  const [popupMode, setPopupMode] = useState<"closed" | "dragging" | "pinned">(
    "closed"
  );
  const [hoveredOptionId, setHoveredOptionId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<{
    top: number;
    bottom: number;
    left: number;
    width: number;
  } | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const startCoordRef = useRef<{ x: number; y: number } | null>(null);
  const popupModeRef = useRef<"closed" | "dragging" | "pinned">("closed");
  const hoveredOptionIdRef = useRef<string | null>(null);
  const optionsRef = useRef<ReadonlyArray<FlickSubOption<T>>>(options);
  const onShortTapRef = useRef(onShortTap);
  const onSelectOptionRef = useRef(onSelectOption);

  optionsRef.current = options;
  onShortTapRef.current = onShortTap;
  onSelectOptionRef.current = onSelectOption;

  const hasSubOptions = options.length > 0 && Boolean(onSelectOption);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const closePopup = useCallback(() => {
    clearHoldTimer();
    activePointerIdRef.current = null;
    startCoordRef.current = null;
    popupModeRef.current = "closed";
    hoveredOptionIdRef.current = null;
    setPopupMode("closed");
    setHoveredOptionId(null);
  }, [clearHoldTimer]);

  // SKILL.md 規約5: コンテキスト切替時にポップアップを強制リセット
  useEffect(() => {
    closePopup();
  }, [contextKey, closePopup]);

  useEffect(() => {
    if (disabled && popupModeRef.current !== "closed") {
      closePopup();
    }
  }, [disabled, closePopup]);

  const openDraggingPopup = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAnchorRect({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
    });
    popupModeRef.current = "dragging";
    hoveredOptionIdRef.current = null;
    setPopupMode("dragging");
    setHoveredOptionId(null);

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // ignore vibration restriction
      }
    }
  }, []);

  const resolveOptionIdAtPoint = useCallback(
    (clientX: number, clientY: number): string | null => {
      if (typeof document === "undefined") return null;
      const target = document.elementFromPoint(clientX, clientY);
      if (!target) return null;
      const optEl = target.closest("[data-flick-opt-id]");
      if (!optEl) return null;
      const id = optEl.getAttribute("data-flick-opt-id");
      if (!id) return null;
      const matched = optionsRef.current.find((o) => o.id === id);
      if (!matched || matched.disabled) return null;
      return matched.id;
    },
    []
  );

  useEffect(() => {
    const handleWindowPointerMove = (ev: PointerEvent) => {
      if (
        activePointerIdRef.current === null ||
        ev.pointerId !== activePointerIdRef.current
      ) {
        return;
      }

      const start = startCoordRef.current;
      if (popupModeRef.current === "closed" && start && hasSubOptions) {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= FLICK_OPEN_DIST_PX) {
          clearHoldTimer();
          openDraggingPopup();
        }
      }

      if (popupModeRef.current === "dragging") {
        const nextHover = resolveOptionIdAtPoint(ev.clientX, ev.clientY);
        if (nextHover !== hoveredOptionIdRef.current) {
          hoveredOptionIdRef.current = nextHover;
          setHoveredOptionId(nextHover);
        }
      }
    };

    const handleWindowPointerUp = (ev: PointerEvent) => {
      if (
        activePointerIdRef.current === null ||
        ev.pointerId !== activePointerIdRef.current
      ) {
        return;
      }

      clearHoldTimer();
      activePointerIdRef.current = null;
      startCoordRef.current = null;

      if (popupModeRef.current === "closed") {
        // 短押し（通常タップ）として即座に実行
        onShortTapRef.current();
        return;
      }

      if (popupModeRef.current === "dragging") {
        const hitId =
          resolveOptionIdAtPoint(ev.clientX, ev.clientY) ??
          hoveredOptionIdRef.current;
        if (hitId) {
          const chosen = optionsRef.current.find(
            (o) => o.id === hitId && !o.disabled
          );
          closePopup();
          if (chosen && onSelectOptionRef.current) {
            onSelectOptionRef.current(chosen);
          }
          return;
        }

        // ボタン上で長押し後にそのまま指を離した場合は、ポップアップを開いたまま固定（タップ選択可能に）
        popupModeRef.current = "pinned";
        setPopupMode("pinned");
      }
    };

    const handleWindowPointerCancel = (ev: PointerEvent) => {
      if (
        activePointerIdRef.current !== null &&
        ev.pointerId === activePointerIdRef.current
      ) {
        closePopup();
      }
    };

    window.addEventListener("pointermove", handleWindowPointerMove, {
      passive: true,
    });
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
    };
  }, [
    hasSubOptions,
    clearHoldTimer,
    openDraggingPopup,
    resolveOptionIdAtPoint,
    closePopup,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    if (popupModeRef.current === "pinned") {
      closePopup();
      return;
    }

    if (!hasSubOptions) {
      return;
    }

    activePointerIdRef.current = e.pointerId;
    startCoordRef.current = { x: e.clientX, y: e.clientY };
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (activePointerIdRef.current === e.pointerId) {
        openDraggingPopup();
      }
    }, HOLD_DELAY_MS);
  };

  const handleFallbackClick = () => {
    if (disabled) return;
    // キーボード操作（Enter / Space）およびサブ選択肢なしボタン用
    if (!hasSubOptions) {
      onShortTap();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (hasSubOptions && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onShortTap();
    }
  };

  const displayLabel =
    isSelected && activeLabel && activeLabel.trim().length > 0
      ? activeLabel
      : label;

  // ポップアップ座標計算（原則は親指で隠れないボタン上方に表示し、画面上端付近のみ下方に表示）
  let popupStyle: React.CSSProperties | undefined;
  if (popupMode !== "closed" && anchorRect && typeof window !== "undefined") {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(
      options.length <= 2 ? 236 : POPUP_MAX_WIDTH,
      vw - 16
    );
    const centerX = anchorRect.left + anchorRect.width / 2;
    const clampedLeft = Math.max(
      8,
      Math.min(vw - width - 8, Math.round(centerX - width / 2))
    );
    const showBelow = anchorRect.top < 220;

    popupStyle = showBelow
      ? {
          position: "fixed",
          left: `${clampedLeft}px`,
          top: `${Math.min(vh - 120, Math.round(anchorRect.bottom + 8))}px`,
          width: `${width}px`,
        }
      : {
          position: "fixed",
          left: `${clampedLeft}px`,
          bottom: `${Math.max(8, Math.round(vh - anchorRect.top + 10))}px`,
          width: `${width}px`,
        };
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        title={title}
        onPointerDown={handlePointerDown}
        onClick={handleFallbackClick}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => {
          if (hasSubOptions) e.preventDefault();
        }}
        style={
          hasSubOptions
            ? {
                WebkitTouchCallout: "none",
                WebkitUserSelect: "none",
              }
            : undefined
        }
        className={cn(
          "relative select-none",
          hasSubOptions && "touch-none",
          popupMode !== "closed" && "ring-2 ring-sky-400 z-10",
          className
        )}
      >
        {leadingIcon}
        <span className="truncate">{displayLabel}</span>
        {hasSubOptions && !disabled && !hideFlickHintDot && (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-0.5 right-1 text-[7px] leading-none font-black",
              isSelected ? "text-current opacity-80" : "text-muted-foreground/70"
            )}
          >
            ••
          </span>
        )}
      </button>

      {mounted &&
        popupMode !== "closed" &&
        popupStyle &&
        createPortal(
          <div className="fixed inset-0 z-[10300] pointer-events-none">
            {/* Pinned時（指を離した後）は外側タップで閉じられる背景レイヤーを有効化 */}
            {popupMode === "pinned" && (
              <div
                className="fixed inset-0 bg-slate-950/35 pointer-events-auto"
                onClick={closePopup}
              />
            )}

            <div
              style={popupStyle}
              role="menu"
              aria-label={popupTitle || `${label}の詳細選択`}
              onClick={(e) => e.stopPropagation()}
              className="pointer-events-auto rounded-2xl border-2 border-slate-700 bg-card shadow-2xl overflow-hidden text-foreground animate-in fade-in zoom-in-95 duration-100"
            >
              {/* A-3 Dark Solid Header */}
              <div className="bg-[#0f172a] text-slate-50 border-b-[2px] border-primary px-3 py-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-white truncate">
                    {popupTitle || `「${label}」の詳細選択`}
                  </p>
                  <p className="text-[9px] font-bold text-sky-300 truncate">
                    {popupMode === "dragging"
                      ? "指をスライドして離すと確定"
                      : "項目をタップして選択"}
                  </p>
                </div>
                {popupMode === "pinned" && (
                  <button
                    type="button"
                    onClick={closePopup}
                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div
                className={cn(
                  "p-1.5 gap-1.5 bg-card",
                  options.length >= 4 ? "grid grid-cols-2" : "flex flex-col"
                )}
              >
                {options.map((opt) => {
                  const isHovered = hoveredOptionId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-flick-opt-id={opt.id}
                      disabled={opt.disabled}
                      onClick={() => {
                        if (opt.disabled) return;
                        closePopup();
                        onSelectOption?.(opt);
                      }}
                      className={cn(
                        "min-h-[40px] px-2.5 py-1.5 rounded-xl border text-left flex flex-col justify-center transition-all select-none cursor-pointer disabled:opacity-40",
                        isHovered
                          ? "bg-primary text-primary-foreground border-primary shadow-sm scale-[1.02]"
                          : "bg-muted/55 hover:bg-accent text-foreground border-border active:bg-primary active:text-primary-foreground"
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11.5px] font-black leading-tight truncate">
                          {opt.label}
                        </span>
                        {opt.badge && (
                          <span
                            className={cn(
                              "px-1 py-0.2 rounded text-[8.5px] font-black shrink-0",
                              isHovered
                                ? "bg-slate-950/25 text-white"
                                : "bg-slate-900 text-amber-300"
                            )}
                          >
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.sublabel && (
                        <span
                          className={cn(
                            "text-[9.5px] font-bold leading-tight truncate mt-0.5",
                            isHovered
                              ? "text-primary-foreground/85"
                              : "text-muted-foreground"
                          )}
                        >
                          {opt.sublabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
