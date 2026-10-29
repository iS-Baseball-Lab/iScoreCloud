// filepath: src/components/liff/ScorebookPasteModal.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ClipboardPaste,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import { isInLineClient } from "@/lib/liff/liff-client";

export interface ScorebookPasteModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onCapture: (file: File) => void;
  onOpenExternalBrowser?: () => void;
}

export function ScorebookPasteModal({
  isOpen,
  title,
  onClose,
  onCapture,
  onOpenExternalBrowser,
}: ScorebookPasteModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isReadingClipboard, setIsReadingClipboard] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const editableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setNoticeMessage(null);
      setIsReadingClipboard(false);
      return;
    }
    const timer = window.setTimeout(() => {
      editableRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const finishWithFile = (file: File) => {
    if (editableRef.current) {
      editableRef.current.innerHTML = "";
    }
    onClose();
    window.setTimeout(() => {
      onCapture(file);
    }, 40);
  };

  const handleDirectClipboardRead = async () => {
    setNoticeMessage(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.read !== "function"
    ) {
      editableRef.current?.focus();
      setNoticeMessage(
        "下の点線枠を長押しして「貼り付け」（またはキーボード上のコピー画像候補をタップ）してください。"
      );
      return;
    }

    setIsReadingClipboard(true);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith("image/"));
        if (imgType) {
          const blob = await item.getType(imgType);
          const ext = imgType.includes("png") ? "png" : "jpg";
          const file = new File(
            [blob],
            `scorebook-paste-${Date.now()}.${ext}`,
            { type: imgType }
          );
          finishWithFile(file);
          return;
        }
      }
      setNoticeMessage(
        "クリップボードに画像が見つかりませんでした。Googleフォト等で「共有 ＞ 画像をコピー」してからお試しください。"
      );
    } catch {
      editableRef.current?.focus();
      setNoticeMessage(
        "LINE内ブラウザで直接読取が制限されているため、下の枠を長押しして「貼り付け」（またはキーボード上の画像候補をタップ）してください。"
      );
    } finally {
      setIsReadingClipboard(false);
    }
  };

  const handlePasteEvent = (e: React.ClipboardEvent<HTMLDivElement>) => {
    setNoticeMessage(null);
    const dt = e.clipboardData;
    if (!dt) return;

    if (dt.files && dt.files.length > 0) {
      for (let i = 0; i < dt.files.length; i++) {
        const f = dt.files[i];
        if (f && (f.type.startsWith("image/") || f.size > 1024)) {
          e.preventDefault();
          finishWithFile(f);
          return;
        }
      }
    }

    if (dt.items && dt.items.length > 0) {
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            finishWithFile(f);
            return;
          }
        }
      }
    }

    // テキストのみが貼り付けられた場合
    window.setTimeout(() => {
      if (editableRef.current && !editableRef.current.querySelector("img")) {
        editableRef.current.innerHTML = "";
        setNoticeMessage(
          "文字ではなく画像をコピーして貼り付けてください（Googleフォト等で写真を開き「共有 ＞ 画像をコピー」）。"
        );
      }
    }, 60);
  };

  // Android Gboardのキーボード上部クリップボード画像チップ（InputConnection.commitContent）で <img> が挿入された場合の自動抽出
  const handleEditableInput = async () => {
    const el = editableRef.current;
    if (!el) return;
    const imgEl = el.querySelector("img");
    if (!imgEl || !imgEl.src) return;

    const src = imgEl.src;
    el.innerHTML = "";
    setIsReadingClipboard(true);
    setNoticeMessage(null);
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      if (blob.size > 0) {
        const mime = blob.type || "image/png";
        const ext = mime.includes("png") ? "png" : "jpg";
        const file = new File(
          [blob],
          `scorebook-gboard-${Date.now()}.${ext}`,
          { type: mime }
        );
        finishWithFile(file);
        return;
      }
    } catch {
      setNoticeMessage(
        "貼り付け画像の展開に失敗しました。もう一度貼り付けるか「Chromeで開く」をお試しください。"
      );
    } finally {
      setIsReadingClipboard(false);
    }
  };

  if (!isOpen || !mounted || typeof document === "undefined") {
    return null;
  }

  const inLine = isInLineClient();

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-3xl bg-card border-2 border-border shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* ソリッドヘッダー */}
        <div className="px-4 py-3.5 bg-muted/60 border-b border-border flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <ClipboardPaste className="w-4 h-4" />
            </span>
            <h2 className="text-xs sm:text-sm font-black text-foreground truncate">
              {title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-black flex items-center gap-1 shrink-0 cursor-pointer active:scale-95 transition-all"
          >
            <X className="w-3.5 h-3.5" />
            <span>閉じる</span>
          </button>
        </div>

        {/* コンテンツ本体 */}
        <div className="p-4 space-y-3.5 overflow-y-auto">
          <div className="p-3 rounded-2xl bg-muted/55 border border-border space-y-1.5">
            <p className="text-xs font-black text-foreground">
              📱 LINE内ブラウザでフリーズせず写真を読み込む手順
            </p>
            <ol className="text-[11px] font-bold text-muted-foreground space-y-1 list-decimal list-inside leading-relaxed">
              <li>
                「Googleフォト」やアルバムでスコアブック写真を開き、
                <strong className="text-foreground font-black">
                  「共有 ＞ 画像をコピー」
                </strong>
                （またはスクリーンショット撮影）
              </li>
              <li>
                この画面に戻り、下のボタンまたは点線枠に
                <strong className="text-foreground font-black">
                  「貼り付け」
                </strong>
                するだけ！
              </li>
            </ol>
          </div>

          <button
            type="button"
            disabled={isReadingClipboard}
            onClick={() => void handleDirectClipboardRead()}
            className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-98 transition-all"
          >
            {isReadingClipboard ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>画像を読み込み中...</span>
              </>
            ) : (
              <>
                <ClipboardPaste className="w-4 h-4 shrink-0" />
                <span>コピーした画像をワンタップで読み込む</span>
              </>
            )}
          </button>

          {/* 長押し貼り付け ／ Gboard画像チップ貼り付け対応エリア */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-muted-foreground">
              または下の枠をタップ／長押しして「貼り付け」（キーボード上の画像候補タップも可）:
            </p>
            <div
              ref={editableRef}
              contentEditable
              suppressContentEditableWarning
              onPaste={handlePasteEvent}
              onInput={() => void handleEditableInput()}
              role="textbox"
              aria-label="画像貼り付けエリア"
              className="min-h-24 w-full rounded-2xl border-2 border-dashed border-indigo-500/55 bg-indigo-500/5 px-3 py-4 text-center flex items-center justify-center text-xs font-black text-indigo-700 dark:text-indigo-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-text"
            >
              ここをタップ／長押しして画像を「貼り付け」
            </div>
          </div>

          {noticeMessage && (
            <div className="p-3 rounded-2xl bg-amber-500/12 border border-amber-500/40 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold text-foreground leading-relaxed">
                {noticeMessage}
              </p>
            </div>
          )}

          {inLine && onOpenExternalBrowser && (
            <div className="pt-2 border-t border-border space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground text-center">
                通常のアルバム一覧から直接選びたい場合はChromeへ引き継げます
              </p>
              <button
                type="button"
                onClick={onOpenExternalBrowser}
                className="w-full py-2.5 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span>この試合のままChromeで開いてアルバム選択</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

