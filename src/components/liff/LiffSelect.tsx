// filepath: src/components/liff/LiffSelect.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type LiffSelectBadgeTone =
  | "primary"
  | "teal"
  | "amber"
  | "emerald"
  | "rose"
  | "slate";

export interface LiffSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeTone?: LiffSelectBadgeTone;
  icon?: React.ReactNode;
  group?: string;
  disabled?: boolean;
  keywords?: string;
}

export interface LiffSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<LiffSelectOption>;
  placeholder?: string;
  title?: string;
  subtitle?: string;
  accent?: "primary" | "teal" | "amber" | "slate";
  size?: "xs" | "sm" | "md" | "lg";
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  triggerTextClassName?: string;
  variant?: "default" | "dark";
  triggerPrefix?: React.ReactNode;
  displayValueOverride?: string;
  ariaLabel?: string;
}

const ACCENT_BORDER_CLASS: Record<NonNullable<LiffSelectProps["accent"]>, string> = {
  primary: "border-primary",
  teal: "border-teal-500",
  amber: "border-amber-500",
  slate: "border-slate-500",
};

const BADGE_TONE_CLASS: Record<LiffSelectBadgeTone, string> = {
  primary: "bg-primary/12 text-primary border-primary/30",
  teal: "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/30",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35",
  emerald: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  rose: "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30",
  slate: "bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/30",
};

const SIZE_TRIGGER_CLASS: Record<NonNullable<LiffSelectProps["size"]>, string> = {
  xs: "min-h-[28px] px-2 py-1 rounded-lg text-[11px] gap-1",
  sm: "min-h-[34px] px-2.5 py-1.5 rounded-xl text-xs gap-1.5",
  md: "min-h-[40px] px-3 py-2 rounded-xl text-xs gap-2",
  lg: "min-h-[46px] px-3.5 py-2.5 rounded-xl text-sm gap-2.5",
};

export function LiffSelect({
  value,
  onChange,
  options,
  placeholder = "選択してください",
  title = "項目を選択",
  subtitle,
  accent = "primary",
  size = "md",
  searchable,
  searchPlaceholder = "キーワードで絞り込み...",
  emptyText = "該当する選択肢がありません",
  disabled = false,
  className,
  triggerTextClassName,
  variant = "default",
  triggerPrefix,
  displayValueOverride,
  ariaLabel,
}: LiffSelectProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const timer = window.setTimeout(() => {
      selectedRowRef.current?.scrollIntoView({ block: "nearest" });
    }, 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value]
  );

  const showSearch = searchable ?? options.length >= 10;

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const hay = `${opt.label} ${opt.sublabel || ""} ${opt.badge || ""} ${opt.group || ""} ${opt.keywords || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  const groupedEntries = useMemo(() => {
    const groups: Array<{ groupName: string | null; items: LiffSelectOption[] }> = [];
    const indexByGroup = new Map<string | null, number>();

    for (const opt of filteredOptions) {
      const gKey = opt.group ?? null;
      const existingIdx = indexByGroup.get(gKey);
      if (existingIdx !== undefined) {
        groups[existingIdx].items.push(opt);
      } else {
        indexByGroup.set(gKey, groups.length);
        groups.push({ groupName: gKey, items: [opt] });
      }
    }
    return groups;
  }, [filteredOptions]);

  const handleSelect = (opt: LiffSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  };

  const triggerText =
    displayValueOverride !== undefined
      ? displayValueOverride
      : selectedOption
      ? selectedOption.label
      : placeholder;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel || title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
        className={cn(
          "inline-flex items-center justify-between border text-left font-black shadow-2xs transition-all cursor-pointer select-none",
          variant === "dark"
            ? "border-slate-700 bg-slate-800 text-white hover:bg-slate-700 hover:border-slate-600"
            : "border-border bg-card text-foreground hover:border-primary/45 hover:bg-muted/35 focus:border-primary",
          "active:scale-[0.99] focus:outline-hidden disabled:opacity-50 disabled:pointer-events-none",
          SIZE_TRIGGER_CLASS[size],
          className
        )}
      >
        <span className="flex items-center gap-1.5 min-w-0 flex-1">
          {triggerPrefix && <span className="shrink-0 flex items-center">{triggerPrefix}</span>}
          {selectedOption?.icon && displayValueOverride === undefined && (
            <span className="shrink-0 flex items-center">{selectedOption.icon}</span>
          )}
          <span
            className={cn(
              "truncate",
              !selectedOption && displayValueOverride === undefined
                ? variant === "dark"
                  ? "text-slate-300 font-bold"
                  : "text-muted-foreground font-bold"
                : variant === "dark"
                ? "text-white font-black"
                : "text-foreground font-black",
              triggerTextClassName
            )}
          >
            {triggerText}
          </span>
          {selectedOption?.badge && displayValueOverride === undefined && size !== "xs" && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-md text-[10px] font-black border shrink-0 leading-none",
                BADGE_TONE_CLASS[selectedOption.badgeTone || "slate"]
              )}
            >
              {selectedOption.badge}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "shrink-0 transition-transform",
            variant === "dark" ? "text-slate-300" : "text-muted-foreground",
            size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5",
            open && "rotate-180 text-primary"
          )}
        />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[10200] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[86dvh] flex flex-col animate-in slide-in-from-bottom-4 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* A-3 上帯ダークキャップ */}
              <div
                className={cn(
                  "bg-[#0f172a] text-slate-50 border-b-[3px] px-4 py-3 flex items-center justify-between gap-3 shrink-0",
                  ACCENT_BORDER_CLASS[accent]
                )}
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-white truncate">{title}</h3>
                  {subtitle && (
                    <p className="text-[10.5px] font-bold text-slate-300 truncate mt-0.5">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white flex items-center justify-center shrink-0 active:scale-95 transition-all cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 検索バー（選択肢が多い場合または明示指定時） */}
              {showSearch && (
                <div className="px-3.5 py-2.5 bg-muted/45 border-b border-border shrink-0">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border focus-within:border-primary">
                    <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={searchPlaceholder}
                      className="w-full bg-transparent text-xs font-bold text-foreground placeholder:text-muted-foreground focus:outline-hidden"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                        aria-label="検索クリア"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 選択肢リスト */}
              <div
                role="listbox"
                className="p-2.5 overflow-y-auto space-y-2 bg-[#eef2f6] dark:bg-slate-900/60 flex-1"
              >
                {groupedEntries.length === 0 ? (
                  <div className="py-8 px-4 text-center rounded-xl bg-card border border-border">
                    <p className="text-xs font-bold text-muted-foreground">{emptyText}</p>
                  </div>
                ) : (
                  groupedEntries.map((groupBlock, gIdx) => (
                    <div key={groupBlock.groupName ?? `__ungrouped_${gIdx}`} className="space-y-1.5">
                      {groupBlock.groupName && (
                        <div className="px-2.5 py-1 rounded-lg bg-[#0f172a] text-slate-100 text-[10.5px] font-black tracking-wide flex items-center justify-between">
                          <span>{groupBlock.groupName}</span>
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            {groupBlock.items.length}件
                          </span>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        {groupBlock.items.map((opt) => {
                          const isSelected = opt.value === value;
                          return (
                            <button
                              key={opt.value}
                              ref={isSelected ? selectedRowRef : undefined}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              disabled={opt.disabled}
                              onClick={() => handleSelect(opt)}
                              className={cn(
                                "w-full px-3 py-2.5 rounded-xl text-left transition-all flex items-center justify-between gap-2.5 cursor-pointer",
                                isSelected
                                  ? "bg-card border-2 border-primary shadow-xs"
                                  : "bg-card border border-border hover:border-primary/40 active:scale-[0.99]",
                                opt.disabled && "opacity-45 pointer-events-none"
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {opt.icon && (
                                    <span className="shrink-0 flex items-center">{opt.icon}</span>
                                  )}
                                  <span
                                    className={cn(
                                      "text-xs leading-snug break-words",
                                      isSelected
                                        ? "font-black text-primary"
                                        : "font-black text-foreground"
                                    )}
                                  >
                                    {opt.label}
                                  </span>
                                  {opt.badge && (
                                    <span
                                      className={cn(
                                        "px-1.5 py-0.5 rounded-md text-[10px] font-black border leading-none shrink-0",
                                        BADGE_TONE_CLASS[opt.badgeTone || "slate"]
                                      )}
                                    >
                                      {opt.badge}
                                    </span>
                                  )}
                                </div>
                                {opt.sublabel && (
                                  <p className="text-[10.5px] font-bold text-muted-foreground mt-0.5 leading-snug break-words">
                                    {opt.sublabel}
                                  </p>
                                )}
                              </div>

                              <span
                                className={cn(
                                  "w-5 h-5 rounded-full flex items-center justify-center shrink-0 border",
                                  isSelected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-border bg-muted/40 text-transparent"
                                )}
                              >
                                <Check className="w-3 h-3 stroke-[3]" />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* フッター（Safe Area 対応） */}
              <div className="px-4 py-2.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3 border-t border-border bg-card flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-muted-foreground hover:text-foreground active:scale-95 transition-all cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
