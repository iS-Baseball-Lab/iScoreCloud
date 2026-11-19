// filepath: src/components/liff/SubLinksEditorSection.tsx
"use client";

import React, { useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createEmptySubLinkDraft,
  MAX_SUB_LINK_NOTE_LENGTH,
  MAX_SUB_LINK_TITLE_LENGTH,
  MAX_SUB_LINKS_PER_LINK,
  type TeamSubLinkDraft,
} from "@/lib/liff/team-links-schema";

interface SubLinksEditorSectionProps {
  drafts: TeamSubLinkDraft[];
  onChange: (next: TeamSubLinkDraft[]) => void;
  disabled?: boolean;
  /** 正の数値が更新された際、末尾のサブリンク名入力欄にフォーカスする */
  focusLatestSignal?: number;
}

export function SubLinksEditorSection({
  drafts,
  onChange,
  disabled = false,
  focusLatestSignal = 0,
}: SubLinksEditorSectionProps) {
  const lastTitleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (focusLatestSignal > 0 && lastTitleInputRef.current) {
      lastTitleInputRef.current.focus();
    }
  }, [focusLatestSignal]);

  const handleAddDraft = () => {
    if (disabled || drafts.length >= MAX_SUB_LINKS_PER_LINK) return;
    onChange([...drafts, createEmptySubLinkDraft()]);
  };

  const handleUpdateField = (
    id: string,
    field: "title" | "url" | "note",
    value: string
  ) => {
    onChange(
      drafts.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleMoveDraft = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= drafts.length) return;
    const next = [...drafts];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    onChange(next);
  };

  const handleRemoveDraft = (id: string) => {
    onChange(drafts.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-2.5 p-3 rounded-2xl bg-muted/35 border border-border">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <CornerDownRight className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-xs font-black text-foreground truncate">
            サブリンク（下層・個別ページ）
          </span>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-card border border-border text-[10px] font-black text-muted-foreground shrink-0">
          {drafts.length}/{MAX_SUB_LINKS_PER_LINK}件
        </span>
      </div>

      {drafts.length === 0 ? (
        <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
          メインのサイトに紐づく「大会トーナメント表」「空き状況照会」「競技規則」などの直リンクを複数登録できます。
        </p>
      ) : (
        <div className="space-y-2.5">
          {drafts.map((draft, index) => {
            const isFirst = index === 0;
            const isLast = index === drafts.length - 1;
            return (
              <div
                key={draft.id}
                className="p-3 rounded-xl border border-border bg-card shadow-2xs space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-[#0f172a] text-slate-50 text-[10px] font-black">
                      #{index + 1}
                    </span>
                    <span className="text-[11px] font-black text-foreground">
                      サブリンク項目
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {drafts.length > 1 && (
                      <>
                        <button
                          type="button"
                          disabled={disabled || isFirst}
                          onClick={() => handleMoveDraft(index, -1)}
                          className="p-1 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-35 transition-colors cursor-pointer"
                          title="上へ移動"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={disabled || isLast}
                          onClick={() => handleMoveDraft(index, 1)}
                          className="p-1 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-35 transition-colors cursor-pointer"
                          title="下へ移動"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleRemoveDraft(draft.id)}
                      className="p-1 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="このサブリンクを削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-muted-foreground block">
                    リンク名
                  </label>
                  <input
                    ref={isLast ? lastTitleInputRef : undefined}
                    type="text"
                    disabled={disabled}
                    maxLength={MAX_SUB_LINK_TITLE_LENGTH}
                    value={draft.title}
                    onChange={(e) =>
                      handleUpdateField(draft.id, "title", e.target.value)
                    }
                    placeholder="例: 春季大会 トーナメント表"
                    className="w-full px-2.5 py-2 rounded-xl bg-card border border-border text-xs text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-muted-foreground block">
                    URL（リンク先）
                  </label>
                  <input
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    disabled={disabled}
                    value={draft.url}
                    onChange={(e) =>
                      handleUpdateField(draft.id, "url", e.target.value)
                    }
                    placeholder="https://..."
                    className="w-full px-2.5 py-2 rounded-xl bg-card border border-border text-[11px] font-mono text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-muted-foreground block">
                    ひとことメモ（任意）
                  </label>
                  <input
                    type="text"
                    disabled={disabled}
                    maxLength={MAX_SUB_LINK_NOTE_LENGTH}
                    value={draft.note}
                    onChange={(e) =>
                      handleUpdateField(draft.id, "note", e.target.value)
                    }
                    placeholder="例: 毎週金曜更新・ログイン不要 など"
                    className="w-full px-2.5 py-2 rounded-xl bg-card border border-border text-xs text-foreground font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {drafts.length < MAX_SUB_LINKS_PER_LINK && (
        <button
          type="button"
          disabled={disabled}
          onClick={handleAddDraft}
          className="w-full py-2 px-3 rounded-xl border border-dashed border-amber-500/50 bg-card hover:bg-amber-500/10 text-amber-700 dark:text-amber-300 font-black text-xs flex items-center justify-center gap-1.5 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>サブリンクを追加</span>
        </button>
      )}
    </div>
  );
}
