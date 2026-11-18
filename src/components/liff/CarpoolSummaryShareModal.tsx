// filepath: src/components/liff/CarpoolSummaryShareModal.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { Liff } from "@line/liff";
import {
  Car,
  Check,
  Copy,
  Link2,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  Send,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { sharePlainTextViaLine } from "@/lib/liff/liff-client";

export interface CarpoolShareEquipmentItem {
  eventEquipmentId: string;
  equipmentId: string;
  name: string;
  quantity: number;
  isHeavy: boolean;
  status: "pending" | "loaded" | "returned";
}

export interface CarpoolSharePassengerItem {
  name: string;
  type: "player" | "adult";
}

export interface CarpoolShareCarItem {
  carpoolId?: string;
  carNumber: number;
  driverName: string;
  carModel: string;
  plate: string;
  capacity: number;
  isCargo?: boolean;
  isBus?: boolean;
  passengers: CarpoolSharePassengerItem[];
  hasReturnDiff?: boolean;
  returnPassengers?: CarpoolSharePassengerItem[];
  equipments?: CarpoolShareEquipmentItem[];
}

export interface CarpoolSummaryShareData {
  eventId?: string;
  eventTitle: string;
  date: string;
  gatherTime: string;
  gatherLocation: string;
  destination: string;
  costShare?: string;
  notes?: string;
  cars: CarpoolShareCarItem[];
}

export interface CarpoolSummaryShareModalProps {
  isOpen: boolean;
  carpool: CarpoolSummaryShareData | null;
  liff?: Liff | null;
  onClose: () => void;
}

interface UndoEditSnapshot {
  text: string;
  includeEquipments: boolean;
  includeReturnDiff: boolean;
  includeUrl: boolean;
}

function buildCarpoolPageUrl(eventId?: string): string {
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://iscorecloud.com";
  const cleanEventId = (eventId || "").trim();
  return cleanEventId
    ? `${origin}/liff/carpool?eventId=${encodeURIComponent(cleanEventId)}`
    : `${origin}/liff/carpool`;
}

function formatCarpoolSummaryText(params: {
  carpool: CarpoolSummaryShareData;
  includeEquipments: boolean;
  includeReturnDiff: boolean;
  includeUrl: boolean;
}): string {
  const { carpool, includeEquipments, includeReturnDiff, includeUrl } = params;
  const lines: string[] = [];

  lines.push(`🚗 【配車案内】${carpool.eventTitle}`);
  const dateTimeLine = [carpool.date, carpool.gatherTime]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  if (dateTimeLine) {
    lines.push(`📅 日時：${dateTimeLine}`);
  }
  if (carpool.gatherLocation.trim()) {
    lines.push(`📍 集合場所：${carpool.gatherLocation.trim()}`);
  }
  if (carpool.destination.trim()) {
    lines.push(`🏟️ 目的地：${carpool.destination.trim()}`);
  }
  const cleanCost = (carpool.costShare || "").trim();
  if (cleanCost) {
    lines.push(`💰 費用目安：${cleanCost}`);
  }

  for (const car of carpool.cars) {
    lines.push("");
    const tags: string[] = [];
    if (car.isCargo) tags.push("[道具車]");
    if (car.isBus) tags.push("[バス]");
    const tagSuffix = tags.length > 0 ? ` ${tags.join(" ")}` : "";
    lines.push(
      `■ ${car.carNumber}号車：${car.driverName}（${car.carModel} / 定員${car.capacity}名）${tagSuffix}`
    );

    if (car.capacity === 0 && car.passengers.length === 0 && car.isCargo) {
      lines.push("　乗車：荷物運搬専用（運転手のみ）");
    } else if (car.passengers.length > 0) {
      lines.push(
        `　乗車（${car.passengers.length}名）：${car.passengers
          .map((p) => p.name)
          .join("、")}`
      );
    } else {
      lines.push("　乗車：同乗者なし（運転手のみ）");
    }

    if (includeEquipments && car.equipments && car.equipments.length > 0) {
      const eqSummary = car.equipments
        .map((eq) => (eq.quantity > 1 ? `${eq.name}×${eq.quantity}` : eq.name))
        .join("、");
      lines.push(`　📦積載：${eqSummary}`);
    }

    if (includeReturnDiff && car.hasReturnDiff) {
      const returnList = car.returnPassengers ?? car.passengers;
      const outNames = car.passengers.map((p) => p.name);
      const retNames = returnList.map((p) => p.name);
      const added = retNames.filter((n) => !outNames.includes(n));
      const removed = outNames.filter((n) => !retNames.includes(n));

      if (returnList.length === 0) {
        lines.push("　※帰り便：同乗者なし（現地解散・別便移動）");
      } else {
        const diffNotes: string[] = [];
        if (added.length > 0) diffNotes.push(`＋${added.join("・")}`);
        if (removed.length > 0) diffNotes.push(`－${removed.join("・")}`);
        const diffSuffix =
          diffNotes.length > 0 ? `（${diffNotes.join(" / ")}）` : "";
        lines.push(
          `　※帰り便（${returnList.length}名）：${retNames.join("、")}${diffSuffix}`
        );
      }
    }
  }

  const cleanNotes = (carpool.notes || "").trim();
  if (cleanNotes) {
    lines.push("");
    lines.push("【連絡・注意事項】");
    lines.push(cleanNotes);
  }

  if (includeUrl) {
    lines.push("");
    lines.push("🔗 配車表・積載チェックはこちら：");
    lines.push(buildCarpoolPageUrl(carpool.eventId));
  }

  return lines.join("\n");
}

export function CarpoolSummaryShareModal({
  isOpen,
  carpool,
  liff,
  onClose,
}: CarpoolSummaryShareModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasAnyEquipments = useMemo(
    () =>
      Boolean(
        carpool?.cars.some((c) => c.equipments && c.equipments.length > 0)
      ),
    [carpool]
  );

  const totalEquipmentCount = useMemo(
    () =>
      (carpool?.cars || []).reduce(
        (sum, c) => sum + (c.equipments?.length || 0),
        0
      ),
    [carpool]
  );

  const hasAnyReturnDiff = useMemo(
    () => Boolean(carpool?.cars.some((c) => Boolean(c.hasReturnDiff))),
    [carpool]
  );

  const returnDiffCarCount = useMemo(
    () =>
      (carpool?.cars || []).filter((c) => Boolean(c.hasReturnDiff)).length,
    [carpool]
  );

  const [includeEquipments, setIncludeEquipments] = useState(true);
  const [includeReturnDiff, setIncludeReturnDiff] = useState(true);
  const [includeUrl, setIncludeUrl] = useState(true);
  const [text, setText] = useState("");
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoEditSnapshot | null>(
    null
  );
  const [isCopied, setIsCopied] = useState(false);
  const [isSharingLine, setIsSharingLine] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen || !carpool) {
      initializedKeyRef.current = null;
      return;
    }
    const sessionKey = `${carpool.eventId || ""}:${carpool.eventTitle}:${carpool.cars.length}`;
    if (initializedKeyRef.current === sessionKey) {
      return;
    }
    initializedKeyRef.current = sessionKey;

    const initEq = carpool.cars.some(
      (c) => c.equipments && c.equipments.length > 0
    );
    const initRet = carpool.cars.some((c) => Boolean(c.hasReturnDiff));
    const initUrl = true;
    const generated = formatCarpoolSummaryText({
      carpool,
      includeEquipments: initEq,
      includeReturnDiff: initRet,
      includeUrl: initUrl,
    });

    setIncludeEquipments(initEq);
    setIncludeReturnDiff(initRet);
    setIncludeUrl(initUrl);
    setText(generated);
    setIsManuallyEdited(false);
    setUndoSnapshot(null);
    setIsCopied(false);
    setIsSharingLine(false);
  }, [isOpen, carpool]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSharingLine) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSharingLine, onClose]);

  const currentAutoText = useMemo(() => {
    if (!carpool) return "";
    return formatCarpoolSummaryText({
      carpool,
      includeEquipments,
      includeReturnDiff,
      includeUrl,
    });
  }, [carpool, includeEquipments, includeReturnDiff, includeUrl]);

  const applyOptionUpdate = useCallback(
    (next: {
      eq: boolean;
      ret: boolean;
      url: boolean;
    }) => {
      if (!carpool) return;
      if (isManuallyEdited && text.trim()) {
        setUndoSnapshot({
          text,
          includeEquipments,
          includeReturnDiff,
          includeUrl,
        });
      } else {
        setUndoSnapshot(null);
      }
      setIncludeEquipments(next.eq);
      setIncludeReturnDiff(next.ret);
      setIncludeUrl(next.url);
      setIsManuallyEdited(false);
      setIsCopied(false);
      setText(
        formatCarpoolSummaryText({
          carpool,
          includeEquipments: next.eq,
          includeReturnDiff: next.ret,
          includeUrl: next.url,
        })
      );
    },
    [carpool, isManuallyEdited, text, includeEquipments, includeReturnDiff, includeUrl]
  );

  const handleResetToAuto = useCallback(() => {
    if (!carpool) return;
    setUndoSnapshot({
      text,
      includeEquipments,
      includeReturnDiff,
      includeUrl,
    });
    const nextEq = hasAnyEquipments;
    const nextRet = hasAnyReturnDiff;
    const nextUrl = true;
    const regenerated = formatCarpoolSummaryText({
      carpool,
      includeEquipments: nextEq,
      includeReturnDiff: nextRet,
      includeUrl: nextUrl,
    });
    setIncludeEquipments(nextEq);
    setIncludeReturnDiff(nextRet);
    setIncludeUrl(nextUrl);
    setText(regenerated);
    setIsManuallyEdited(false);
    setIsCopied(false);
    toast("自動生成文に戻しました");
  }, [
    carpool,
    text,
    includeEquipments,
    includeReturnDiff,
    includeUrl,
    hasAnyEquipments,
    hasAnyReturnDiff,
  ]);

  const handleRestoreEdited = useCallback(() => {
    if (!undoSnapshot) return;
    setText(undoSnapshot.text);
    setIncludeEquipments(undoSnapshot.includeEquipments);
    setIncludeReturnDiff(undoSnapshot.includeReturnDiff);
    setIncludeUrl(undoSnapshot.includeUrl);
    setIsManuallyEdited(true);
    setUndoSnapshot(null);
    setIsCopied(false);
    toast.success("編集内容を復元しました");
  }, [undoSnapshot]);

  const handleCopyClipboard = useCallback(async () => {
    const clean = text.trim();
    if (!clean) {
      toast.error("コピーする連絡文が空です");
      return;
    }

    let copied = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(clean);
        copied = true;
      }
    } catch {
      // fallback below
    }

    if (!copied && typeof document !== "undefined") {
      try {
        const ta = document.createElement("textarea");
        ta.value = clean;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        // ignore fallback error
      }
    }

    if (copied) {
      setIsCopied(true);
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = setTimeout(() => {
        setIsCopied(false);
      }, 2200);
      toast.success("配車案内文をクリップボードにコピーしました！");
    } else {
      toast.error("コピーに失敗しました");
    }
  }, [text]);

  const handleShareViaLine = useCallback(async () => {
    const clean = text.trim();
    if (!clean || isSharingLine) {
      if (!clean) toast.error("転送する連絡文が空です");
      return;
    }

    setIsSharingLine(true);
    try {
      const outcome = await sharePlainTextViaLine({
        text: clean,
        liff,
      });
      if (outcome === "shared") {
        toast.success("LINEへ配車案内文を送信しました！");
      }
    } finally {
      setIsSharingLine(false);
    }
  }, [text, isSharingLine, liff]);

  if (!mounted || !isOpen || !carpool || typeof document === "undefined") {
    return null;
  }

  const canResetToAuto = isManuallyEdited || text !== currentAutoText;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60"
      onClick={() => !isSharingLine && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="carpool-summary-share-title"
        className="w-full sm:max-w-lg max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* A-3 上帯ダークキャップ */}
        <div className="bg-[#0f172a] text-slate-50 border-b-2 border-teal-500 px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-teal-500 text-slate-950 flex items-center justify-center shrink-0">
              <Car className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="carpool-summary-share-title"
                className="text-sm font-black text-white truncate"
              >
                配車案内文の作成・LINE共有
              </h2>
              <p className="text-[11px] font-bold text-slate-300 truncate">
                {carpool.date} ・ {carpool.eventTitle}（{carpool.cars.length}台）
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSharingLine}
            onClick={onClose}
            aria-label="閉じる"
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* メインコンテンツ */}
        <div className="flex-1 min-h-0 flex flex-col p-3.5 sm:p-4 gap-3 overflow-y-auto bg-[#eef2f6] dark:bg-background">
          {/* ① 含める項目のワンタップ切替チップ */}
          <div className="rounded-xl border border-border bg-card p-2.5 space-y-2 shrink-0">
            <span className="block text-[11px] font-black text-muted-foreground">
              案内文に含める項目（タップで切替）
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  applyOptionUpdate({
                    eq: !includeEquipments,
                    ret: includeReturnDiff,
                    url: includeUrl,
                  })
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black border transition-colors cursor-pointer ${
                  includeEquipments
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-muted text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                <Package className="w-3.5 h-3.5 shrink-0" />
                <span>
                  📦 積載道具を含める
                  {totalEquipmentCount > 0 ? ` (${totalEquipmentCount}点)` : ""}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  applyOptionUpdate({
                    eq: includeEquipments,
                    ret: !includeReturnDiff,
                    url: includeUrl,
                  })
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black border transition-colors cursor-pointer ${
                  includeReturnDiff
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-muted text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span>
                  🔄 帰り便の変更を含める
                  {returnDiffCarCount > 0 ? ` (${returnDiffCarCount}台)` : ""}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  applyOptionUpdate({
                    eq: includeEquipments,
                    ret: includeReturnDiff,
                    url: !includeUrl,
                  })
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black border transition-colors cursor-pointer ${
                  includeUrl
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-muted text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                <Link2 className="w-3.5 h-3.5 shrink-0" />
                <span>🔗 配車表URLを含める</span>
              </button>
            </div>
          </div>

          {/* ② 編集可能な連絡文プレビュー ＋ 2段階アンドゥ付きリセット */}
          <div className="flex-1 min-h-[200px] rounded-xl border border-border bg-card p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="carpool-summary-share-textarea"
                  className="text-xs font-black text-foreground"
                >
                  送信テキスト（自由に追記・編集可能）
                </label>
                {isManuallyEdited && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[10px] font-black">
                    編集済
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                  {text.length.toLocaleString()}文字
                </span>

                {undoSnapshot ? (
                  <button
                    type="button"
                    onClick={handleRestoreEdited}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 border border-amber-500 text-[11px] font-black cursor-pointer transition-colors"
                  >
                    <Undo2 className="w-3 h-3 shrink-0" />
                    <span>元に戻す（編集内容を復元）</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canResetToAuto}
                    onClick={handleResetToAuto}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground border border-border text-[11px] font-black cursor-pointer disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <RotateCcw className="w-3 h-3 shrink-0" />
                    <span>自動生成文に戻す</span>
                  </button>
                )}
              </div>
            </div>

            <textarea
              id="carpool-summary-share-textarea"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setIsManuallyEdited(true);
                if (undoSnapshot) setUndoSnapshot(null);
                if (isCopied) setIsCopied(false);
              }}
              placeholder="配車案内テキストを入力してください..."
              style={{ WebkitOverflowScrolling: "touch" }}
              className="flex-1 min-h-[190px] sm:min-h-[230px] w-full p-3 text-xs leading-relaxed font-medium rounded-xl bg-muted/40 border border-border focus:outline-none focus:border-teal-600 text-foreground placeholder:text-muted-foreground resize-none select-text"
            />
          </div>
        </div>

        {/* Safe Area 対応フッター（コピー ＆ 公式LINE #06C755 転送） */}
        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => void handleCopyClipboard()}
            className="flex-1 h-11 px-3 rounded-xl border border-border bg-muted hover:bg-muted/80 text-foreground text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {isCopied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>コピー完了！</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 shrink-0" />
                <span>コピー</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={!text.trim() || isSharingLine}
            onClick={() => void handleShareViaLine()}
            className="flex-[1.3] h-11 px-4 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSharingLine ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>LINE起動中...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 shrink-0" />
                <span>LINEで転送</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
