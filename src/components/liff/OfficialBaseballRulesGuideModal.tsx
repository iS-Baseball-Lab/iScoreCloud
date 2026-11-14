// filepath: src/components/liff/OfficialBaseballRulesGuideModal.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileDown,
  HelpCircle,
  Loader2,
  Printer,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CASE_QA_ENTRIES,
  CHAPTER9_CATEGORIES,
  CHAPTER9_RULE_ENTRIES,
  GAME_RULE_ENTRIES,
  type BaseballRuleCaseQaEntry,
  type BaseballRuleGuideEntry,
  type Chapter9CategoryId,
  type RulesGuideTabId,
} from "@/lib/liff/baseball-rules-guide-data";
import {
  exportScorebookSvgElementsToPdfBlob,
  isPrintUnsupportedInAppBrowser,
  printScorebookSvgElements,
} from "@/components/liff/DigitalScorebookSheet";

const PDF_FONT_SANS =
  "'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', system-ui, -apple-system, sans-serif";

const A4_SVG_W = 900;
const A4_SVG_H = 1272; // A4縦比率 (1 : 1.414)

const QUICK_SEARCH_CHIPS: ReadonlyArray<string> = [
  "振り逃げ",
  "自責点",
  "タイムプレー",
  "野選",
  "インフィールドフライ",
  "勝投手",
  "セーブ",
  "規定打席",
];

export interface OfficialBaseballRulesGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: RulesGuideTabId;
  initialQuery?: string;
}

function wrapJapaneseText(text: string, maxCharsPerLine: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const lines: string[] = [];
  let buf = "";
  for (const ch of clean) {
    buf += ch;
    if (buf.length >= maxCharsPerLine) {
      lines.push(buf);
      buf = "";
    }
  }
  if (buf) lines.push(buf);
  return lines;
}

interface PrintableSheetCardItem {
  badge: string;
  title: string;
  lines: string[];
  note?: string;
  highlight?: boolean;
}

function renderA4GuideSheetPageSvg({
  svgRef,
  pageNumber,
  totalPages,
  pageTitle,
  pageSubtitle,
  leftColumnTitle,
  rightColumnTitle,
  leftItems,
  rightItems,
  footerNote,
}: {
  svgRef: React.RefObject<SVGSVGElement | null>;
  pageNumber: number;
  totalPages: number;
  pageTitle: string;
  pageSubtitle: string;
  leftColumnTitle: string;
  rightColumnTitle: string;
  leftItems: ReadonlyArray<PrintableSheetCardItem>;
  rightItems: ReadonlyArray<PrintableSheetCardItem>;
  footerNote: string;
}) {
  const padX = 26;
  const colGap = 16;
  const colW = (A4_SVG_W - padX * 2 - colGap) / 2; // 416
  const headerTopY = 22;
  const headerH = 58;
  const colHeaderY = headerTopY + headerH + 12;
  const colHeaderH = 26;
  const bodyStartY = colHeaderY + colHeaderH + 8;

  const renderColumnCards = (
    items: ReadonlyArray<PrintableSheetCardItem>,
    colX: number
  ) => {
    let cursorY = bodyStartY;
    return items.map((item, idx) => {
      const wrappedLines: string[] = [];
      for (const rawLine of item.lines) {
        const sub = wrapJapaneseText(rawLine, 35);
        wrappedLines.push(...sub);
      }
      const noteLines = item.note ? wrapJapaneseText(item.note, 35) : [];
      const cardH =
        24 + wrappedLines.length * 13.5 + (noteLines.length > 0 ? noteLines.length * 12.5 + 6 : 0) + 8;
      const y = cursorY;
      cursorY += cardH + 6;

      return (
        <g key={`p${pageNumber}-c${colX}-${idx}`}>
          <rect
            x={colX}
            y={y}
            width={colW}
            height={cardH}
            rx={6}
            fill={item.highlight ? "#fffbeb" : "#ffffff"}
            stroke={item.highlight ? "#d97706" : "#cbd5e1"}
            strokeWidth={item.highlight ? 1.3 : 1}
          />
          <rect
            x={colX + 8}
            y={y + 6}
            width={Math.max(58, item.badge.length * 8.2 + 12)}
            height={15}
            rx={4}
            fill={item.highlight ? "#b45309" : "#0f172a"}
          />
          <text
            x={colX + 14}
            y={y + 16.5}
            fontSize={8.8}
            fontWeight={900}
            fill="#ffffff"
          >
            {item.badge}
          </text>
          <text
            x={colX + 16 + Math.max(58, item.badge.length * 8.2 + 12)}
            y={y + 16.8}
            fontSize={9.8}
            fontWeight={900}
            fill="#0f172a"
          >
            {item.title.slice(0, 24)}
          </text>

          {wrappedLines.map((ln, lIdx) => (
            <text
              key={`ln-${lIdx}`}
              x={colX + 10}
              y={y + 33 + lIdx * 13.5}
              fontSize={8.8}
              fontWeight={700}
              fill="#1e293b"
            >
              {ln}
            </text>
          ))}

          {noteLines.map((nLn, nIdx) => (
            <text
              key={`nt-${nIdx}`}
              x={colX + 10}
              y={y + 36 + wrappedLines.length * 13.5 + nIdx * 12.5}
              fontSize={8.3}
              fontWeight={800}
              fill="#1d4ed8"
            >
              {nLn}
            </text>
          ))}
        </g>
      );
    });
  };

  const leftX = padX;
  const rightX = padX + colW + colGap;

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${A4_SVG_W} ${A4_SVG_H}`}
      width={A4_SVG_W}
      height={A4_SVG_H}
      style={{ fontFamily: PDF_FONT_SANS, backgroundColor: "#ffffff" }}
    >
      <rect x={0} y={0} width={A4_SVG_W} height={A4_SVG_H} fill="#ffffff" />

      {/* A-3 上部ダークヘッダー */}
      <rect
        x={padX}
        y={headerTopY}
        width={A4_SVG_W - padX * 2}
        height={headerH}
        rx={10}
        fill="#0f172a"
      />
      <rect
        x={padX}
        y={headerTopY + headerH - 4}
        width={A4_SVG_W - padX * 2}
        height={4}
        fill="#f59e0b"
      />
      <text
        x={padX + 18}
        y={headerTopY + 26}
        fontSize={16}
        fontWeight={900}
        fill="#ffffff"
      >
        {pageTitle}
      </text>
      <text
        x={padX + 18}
        y={headerTopY + 45}
        fontSize={10}
        fontWeight={700}
        fill="#cbd5e1"
      >
        {pageSubtitle}
      </text>
      <rect
        x={A4_SVG_W - padX - 96}
        y={headerTopY + 15}
        width={80}
        height={26}
        rx={6}
        fill="#1e293b"
        stroke="#475569"
        strokeWidth={1}
      />
      <text
        x={A4_SVG_W - padX - 56}
        y={headerTopY + 32}
        fontSize={11}
        fontWeight={900}
        textAnchor="middle"
        fill="#fbbf24"
      >
        {`${pageNumber} / ${totalPages} ページ`}
      </text>

      {/* 左右カラム見出し */}
      <rect
        x={leftX}
        y={colHeaderY}
        width={colW}
        height={colHeaderH}
        rx={6}
        fill="#f1f5f9"
        stroke="#94a3b8"
        strokeWidth={1}
      />
      <text
        x={leftX + 12}
        y={colHeaderY + 17}
        fontSize={10.5}
        fontWeight={900}
        fill="#0f172a"
      >
        {leftColumnTitle}
      </text>

      <rect
        x={rightX}
        y={colHeaderY}
        width={colW}
        height={colHeaderH}
        rx={6}
        fill="#f1f5f9"
        stroke="#94a3b8"
        strokeWidth={1}
      />
      <text
        x={rightX + 12}
        y={colHeaderY + 17}
        fontSize={10.5}
        fontWeight={900}
        fill="#0f172a"
      >
        {rightColumnTitle}
      </text>

      {/* 左右カード群 */}
      {renderColumnCards(leftItems, leftX)}
      {renderColumnCards(rightItems, rightX)}

      {/* 下部フッター */}
      <line
        x1={padX}
        y1={A4_SVG_H - 34}
        x2={A4_SVG_W - padX}
        y2={A4_SVG_H - 34}
        stroke="#cbd5e1"
        strokeWidth={1}
      />
      <text
        x={padX}
        y={A4_SVG_H - 17}
        fontSize={8.5}
        fontWeight={700}
        fill="#64748b"
      >
        {footerNote}
      </text>
      <text
        x={A4_SVG_W - padX}
        y={A4_SVG_H - 17}
        fontSize={8.5}
        fontWeight={900}
        textAnchor="end"
        fill="#475569"
      >
        iScoreCloud LINEミニアプリ 公式記録・判定リファレンス
      </text>
    </svg>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("PDFデータの読み込みに失敗しました"));
    reader.readAsDataURL(blob);
  });
}

function matchesRuleEntry(entry: BaseballRuleGuideEntry, qLower: string): boolean {
  if (!qLower) return true;
  if (entry.ruleNumber.toLowerCase().includes(qLower)) return true;
  if (entry.title.toLowerCase().includes(qLower)) return true;
  if (entry.summary.toLowerCase().includes(qLower)) return true;
  if (entry.scorebookNote.toLowerCase().includes(qLower)) return true;
  if (entry.keyPoints.some((p) => p.toLowerCase().includes(qLower))) return true;
  if (entry.keywords.some((k) => k.toLowerCase().includes(qLower))) return true;
  return false;
}

function matchesCaseQa(entry: BaseballRuleCaseQaEntry, qLower: string): boolean {
  if (!qLower) return true;
  if (entry.badge.toLowerCase().includes(qLower)) return true;
  if (entry.relatedRule.toLowerCase().includes(qLower)) return true;
  if (entry.question.toLowerCase().includes(qLower)) return true;
  if (entry.conclusion.toLowerCase().includes(qLower)) return true;
  if (entry.explanation.toLowerCase().includes(qLower)) return true;
  if (entry.scorebookNotation.toLowerCase().includes(qLower)) return true;
  if (entry.keywords.some((k) => k.toLowerCase().includes(qLower))) return true;
  return false;
}

export function OfficialBaseballRulesGuideModal({
  isOpen,
  onClose,
  initialTab = "chapter9",
  initialQuery = "",
}: OfficialBaseballRulesGuideModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<RulesGuideTabId>(initialTab);
  const [chapter9Cat, setChapter9Cat] = useState<Chapter9CategoryId>("all");
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({
    "r-9-05": true,
    "r-9-16": true,
    "r-9-17": true,
    "g-dts": true,
    "g-time-play": true,
    "qa-1": true,
  });
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const page1SvgRef = useRef<SVGSVGElement | null>(null);
  const page2SvgRef = useRef<SVGSVGElement | null>(null);
  const page3SvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (initialQuery) {
        setSearchQuery(initialQuery);
      }
    }
  }, [isOpen, initialTab, initialQuery]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const filteredChapter9 = useMemo(
    () =>
      CHAPTER9_RULE_ENTRIES.filter((entry) => {
        if (!isSearching && chapter9Cat !== "all" && entry.chapter9Category !== chapter9Cat) {
          return false;
        }
        return matchesRuleEntry(entry, normalizedQuery);
      }),
    [chapter9Cat, isSearching, normalizedQuery]
  );

  const filteredGameRules = useMemo(
    () => GAME_RULE_ENTRIES.filter((entry) => matchesRuleEntry(entry, normalizedQuery)),
    [normalizedQuery]
  );

  const filteredCaseQa = useMemo(
    () => CASE_QA_ENTRIES.filter((entry) => matchesCaseQa(entry, normalizedQuery)),
    [normalizedQuery]
  );

  const totalSearchHits =
    filteredChapter9.length + filteredGameRules.length + filteredCaseQa.length;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleSetAllExpandedInCurrentView = (expand: boolean) => {
    const targetIds: string[] =
      activeTab === "chapter9"
        ? filteredChapter9.map((e) => e.id)
        : activeTab === "game_rules"
        ? filteredGameRules.map((e) => e.id)
        : filteredCaseQa.map((e) => e.id);
    setExpandedIds((prev) => {
      const next = { ...prev };
      for (const id of targetIds) {
        next[id] = expand;
      }
      return next;
    });
  };

  // A4ベンチ携行用PDFシートのデータ構築（全3ページ）
  const printablePages = useMemo(() => {
    const p1Left: PrintableSheetCardItem[] = CHAPTER9_RULE_ENTRIES.slice(0, 8).map(
      (r) => ({
        badge: r.ruleNumber,
        title: r.title,
        lines: [r.summary, ...r.keyPoints.slice(0, 2).map((p) => `・${p}`)],
        highlight: r.isImportant,
      })
    );
    const p1Right: PrintableSheetCardItem[] = CHAPTER9_RULE_ENTRIES.slice(8, 15).map(
      (r) => ({
        badge: r.ruleNumber,
        title: r.title,
        lines: [r.summary, ...r.keyPoints.slice(0, 2).map((p) => `・${p}`)],
        highlight: r.isImportant,
      })
    );

    const p2Left: PrintableSheetCardItem[] = CHAPTER9_RULE_ENTRIES.slice(15, 19).map(
      (r) => ({
        badge: r.ruleNumber,
        title: r.title,
        lines: r.keyPoints.map((p) => `・${p}`),
        note: `▶ ${r.scorebookNote}`,
        highlight: r.isImportant,
      })
    );
    const p2Right: PrintableSheetCardItem[] = [
      ...CHAPTER9_RULE_ENTRIES.slice(19, 22).map((r) => ({
        badge: r.ruleNumber,
        title: r.title,
        lines: r.keyPoints.map((p) => `・${p}`),
        highlight: r.isImportant,
      })),
      {
        badge: "7回制 vs 9回制",
        title: "イニング規定別 早見比較表",
        lines: [
          "・先発勝利資格：9回制＝5回（短縮4回）／ 7回制＝4回（短縮3回）",
          "・防御率換算式：9回制＝自責×9÷IP ／ 7回制＝自責×7÷IP",
          "・規定打席：9回制＝試合×3.1 ／ 7回制＝試合×3.1×(7/9)［9.22(a)特例有］",
          "・タイブレーク配置走者：得点・残塁は算入、投手の自責点は常に『非自責』",
        ],
        highlight: true,
      },
    ];

    const p3Left: PrintableSheetCardItem[] = GAME_RULE_ENTRIES.slice(0, 6).map(
      (g) => ({
        badge: g.ruleNumber.split("/")[0]!.trim(),
        title: g.title,
        lines: g.keyPoints.slice(0, 2).map((p) => `・${p}`),
        highlight: g.isImportant,
      })
    );
    const p3Right: PrintableSheetCardItem[] = CASE_QA_ENTRIES.slice(0, 7).map(
      (q) => ({
        badge: `Q&A (${q.relatedRule})`,
        title: q.badge,
        lines: [`Q. ${q.question}`, `A. ${q.conclusion}`],
        note: `記入例: ${q.scorebookNotation}`,
      })
    );

    return { p1Left, p1Right, p2Left, p2Right, p3Left, p3Right };
  }, []);

  const collectSvgPages = (): SVGSVGElement[] =>
    [page1SvgRef.current, page2SvgRef.current, page3SvgRef.current].filter(
      (el): el is SVGSVGElement => Boolean(el)
    );

  const handleExportPdf = async () => {
    const svgs = collectSvgPages();
    if (svgs.length === 0 || isExportingPdf) return;
    try {
      setIsExportingPdf(true);
      const pdfBlob = await exportScorebookSvgElementsToPdfBlob(
        svgs,
        "portrait",
        2.35
      );
      const fileName = "公認野球規則_スコア判定ガイド_A4携行版.pdf";
      const pdfFile = new File([pdfBlob], fileName, {
        type: "application/pdf",
      });

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [pdfFile] })
      ) {
        try {
          await navigator.share({
            title: "公認野球規則・スコア判定ガイド（A4携行版）",
            files: [pdfFile],
          });
          toast.success("ベンチ携行用PDF（全3ページ）を出力しました");
          return;
        } catch (shareErr) {
          if (shareErr instanceof Error && shareErr.name === "AbortError") {
            return;
          }
        }
      }

      const dataUrl = await blobToDataUrl(pdfBlob);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("ベンチ携行用PDF（全3ページ）を保存しました");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "PDFファイルの出力に失敗しました";
      toast.error(msg);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintGuide = () => {
    const svgs = collectSvgPages();
    if (svgs.length === 0) return;
    if (isPrintUnsupportedInAppBrowser()) {
      void handleExportPdf();
      return;
    }
    const ok = printScorebookSvgElements(
      svgs,
      "公認野球規則・スコア判定ガイド（A4携行版）",
      "portrait"
    );
    if (!ok) {
      void handleExportPdf();
    }
  };

  if (!mounted || !isOpen) return null;

  const renderRuleEntryCard = (entry: BaseballRuleGuideEntry) => {
    const isExpanded = isSearching || Boolean(expandedIds[entry.id]);
    return (
      <div
        key={entry.id}
        className={cn(
          "rounded-2xl border bg-card shadow-2xs overflow-hidden transition-colors",
          entry.isImportant ? "border-amber-500/45" : "border-border"
        )}
      >
        <button
          type="button"
          onClick={() => toggleExpand(entry.id)}
          className="w-full px-3.5 py-3 text-left flex items-start justify-between gap-2.5 hover:bg-muted/40 transition-colors cursor-pointer"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-[#0f172a] text-amber-300 text-[10px] font-black font-mono shrink-0">
                {entry.ruleNumber}
              </span>
              {entry.isImportant && (
                <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-black shrink-0">
                  頻出・重要
                </span>
              )}
            </div>
            <h4 className="text-xs sm:text-sm font-black text-foreground leading-snug">
              {entry.title}
            </h4>
            <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
              {entry.summary}
            </p>
          </div>

          <span className="w-7 h-7 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0 mt-0.5">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </span>
        </button>

        {isExpanded && (
          <div className="px-3.5 pb-3.5 pt-2 border-t border-border bg-muted/20 space-y-2.5">
            <ul className="space-y-1.5">
              {entry.keyPoints.map((pt, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-xs font-bold text-foreground leading-relaxed"
                >
                  <span className="w-4 h-4 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>

            <div className="p-2.5 rounded-xl bg-primary/8 border border-primary/20 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="text-[11px] font-bold text-foreground leading-snug">
                <span className="font-black text-primary mr-1">
                  スコア処理・表記：
                </span>
                {entry.scorebookNote}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCaseQaCard = (qa: BaseballRuleCaseQaEntry) => {
    const isExpanded = isSearching || Boolean(expandedIds[qa.id]);
    return (
      <div
        key={qa.id}
        className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden"
      >
        <button
          type="button"
          onClick={() => toggleExpand(qa.id)}
          className="w-full px-3.5 py-3 text-left flex items-start justify-between gap-2.5 hover:bg-muted/40 transition-colors cursor-pointer"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-black">
                {qa.badge}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-black font-mono">
                {qa.relatedRule}
              </span>
            </div>
            <h4 className="text-xs sm:text-sm font-black text-foreground leading-snug">
              Q. {qa.question}
            </h4>
            <p className="text-xs font-black text-primary leading-snug">
              A. {qa.conclusion}
            </p>
          </div>

          <span className="w-7 h-7 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0 mt-0.5">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </span>
        </button>

        {isExpanded && (
          <div className="px-3.5 pb-3.5 pt-2.5 border-t border-border bg-muted/20 space-y-2">
            <p className="text-xs font-bold text-foreground leading-relaxed">
              {qa.explanation}
            </p>
            <div className="px-2.5 py-2 rounded-xl bg-card border border-border text-[11px] font-black text-foreground flex items-center gap-1.5 flex-wrap">
              <span className="px-1.5 py-0.5 rounded bg-[#0f172a] text-amber-300 text-[10px]">
                スコア記入例
              </span>
              <span>{qa.scorebookNotation}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="公認野球規則・スコア判定リファレンス"
      className="fixed inset-0 z-[10100] bg-slate-950/75 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xs overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* A-3 上帯ダークキャップ（ルール・資料系 border-amber-500） */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-white truncate">
                公認野球規則 ＆ スコア判定リファレンス
              </h3>
              <p className="text-[10px] font-bold text-slate-300 truncate">
                第9章（9.01〜9.22 全22条）・重要試合ルール・実例Q&A
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 検索バー ＋ タブ切替（固定ヘッダー） */}
        <div className="px-3.5 py-2.5 bg-[#eef2f6] dark:bg-muted/50 border-b border-border space-y-2 shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="条項番号や用語で検索（例: 9.16 / 振り逃げ / 自責点 / タイムプレー）"
              className="w-full h-9 pl-9 pr-8 rounded-xl bg-card border border-border text-xs font-bold text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="検索クリア"
                className="p-1 rounded-full text-muted-foreground hover:text-foreground absolute right-2 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!isSearching ? (
            <>
              {/* クイック検索チップ */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
                <span className="text-[10px] font-black text-muted-foreground shrink-0 mr-0.5">
                  よく引く項目:
                </span>
                {QUICK_SEARCH_CHIPS.map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => setSearchQuery(kw)}
                    className="px-2 py-0.5 rounded-lg bg-card hover:bg-muted border border-border text-[10px] font-black text-foreground shrink-0 cursor-pointer transition-colors"
                  >
                    {kw}
                  </button>
                ))}
              </div>

              {/* 3タブ切替 */}
              <div className="grid grid-cols-3 gap-1 bg-card p-1 rounded-xl border border-border">
                {(
                  [
                    {
                      id: "chapter9" as const,
                      label: "第9章 記録規則",
                      count: CHAPTER9_RULE_ENTRIES.length,
                      icon: Scale,
                    },
                    {
                      id: "game_rules" as const,
                      label: "試合ルール",
                      count: GAME_RULE_ENTRIES.length,
                      icon: Sparkles,
                    },
                    {
                      id: "case_qa" as const,
                      label: "実例 Q&A",
                      count: CASE_QA_ENTRIES.length,
                      icon: HelpCircle,
                    },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "py-1.5 px-2 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 transition-all cursor-pointer",
                        active
                          ? "bg-[#0f172a] text-white shadow-2xs"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          active ? "text-amber-400" : "text-muted-foreground"
                        )}
                      />
                      <span className="truncate">{tab.label}</span>
                      <span
                        className={cn(
                          "text-[9px] px-1 py-0.2 rounded font-mono shrink-0",
                          active
                            ? "bg-amber-500/25 text-amber-300"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between text-[11px] font-black text-foreground px-0.5">
              <span>
                「{searchQuery}」の検索結果：{totalSearchHits}件（全カテゴリ横断）
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-primary hover:underline cursor-pointer"
              >
                一覧に戻る
              </button>
            </div>
          )}
        </div>

        {/* メインスクロール領域 */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#eef2f6]/55 dark:bg-background">
          {isSearching ? (
            totalSearchHits === 0 ? (
              <div className="py-12 px-4 text-center rounded-2xl border border-border bg-card space-y-2">
                <p className="text-xs font-black text-foreground">
                  該当する規則・Q&Aが見つかりませんでした
                </p>
                <p className="text-[11px] font-bold text-muted-foreground">
                  「自責点」「振り逃げ」「9.16」「タイムプレー」「セーブ」などのキーワードでお試しください
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredChapter9.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black text-muted-foreground px-1">
                      第9章 記録に関する規則（{filteredChapter9.length}件）
                    </h4>
                    {filteredChapter9.map(renderRuleEntryCard)}
                  </div>
                )}
                {filteredGameRules.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black text-muted-foreground px-1">
                      重要試合ルール・7回制/タイブレーク（{filteredGameRules.length}件）
                    </h4>
                    {filteredGameRules.map(renderRuleEntryCard)}
                  </div>
                )}
                {filteredCaseQa.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black text-muted-foreground px-1">
                      現場で迷う実例 Q&A（{filteredCaseQa.length}件）
                    </h4>
                    {filteredCaseQa.map(renderCaseQaCard)}
                  </div>
                )}
              </div>
            )
          ) : activeTab === "chapter9" ? (
            <div className="space-y-2.5">
              {/* 第9章 サブカテゴリピル ＆ 全開閉ボタン */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
                  {CHAPTER9_CATEGORIES.map((cat) => {
                    const selected = chapter9Cat === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setChapter9Cat(cat.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-xl text-[11px] shrink-0 cursor-pointer transition-colors",
                          selected
                            ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40 font-black"
                            : "bg-card text-muted-foreground border border-border hover:text-foreground font-bold"
                        )}
                      >
                        {cat.shortLabel}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1 ml-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSetAllExpandedInCurrentView(true)}
                    className="px-2 py-1 rounded-lg bg-card hover:bg-muted border border-border text-[10px] font-black text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    すべて開く
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllExpandedInCurrentView(false)}
                    className="px-2 py-1 rounded-lg bg-card hover:bg-muted border border-border text-[10px] font-black text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    折りたたむ
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {filteredChapter9.map(renderRuleEntryCard)}
              </div>
            </div>
          ) : activeTab === "game_rules" ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[11px] font-black text-muted-foreground">
                  グラウンド・審判・ベンチで頻出する重要競技規則
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSetAllExpandedInCurrentView(true)}
                    className="px-2 py-1 rounded-lg bg-card hover:bg-muted border border-border text-[10px] font-black text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    すべて開く
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllExpandedInCurrentView(false)}
                    className="px-2 py-1 rounded-lg bg-card hover:bg-muted border border-border text-[10px] font-black text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    折りたたむ
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {filteredGameRules.map(renderRuleEntryCard)}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[11px] font-black text-muted-foreground">
                  実際の試合でよくあるケース別の判定とスコア記入法
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSetAllExpandedInCurrentView(true)}
                    className="px-2 py-1 rounded-lg bg-card hover:bg-muted border border-border text-[10px] font-black text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    すべて開く
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllExpandedInCurrentView(false)}
                    className="px-2 py-1 rounded-lg bg-card hover:bg-muted border border-border text-[10px] font-black text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    折りたたむ
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {filteredCaseQa.map(renderCaseQaCard)}
              </div>
            </div>
          )}
        </div>

        {/* 下部アクションバー：ベンチ携行用 A4 PDF保存・印刷（Safe Area対応） */}
        <div className="px-3.5 pt-2.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 bg-card border-t border-border space-y-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExportingPdf}
              onClick={() => void handleExportPdf()}
              className="flex-1 h-10 px-3 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-55 text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              {isExportingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>A4携行PDFを生成中...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 shrink-0" />
                  <span>ベンチ携行用 A4 PDF保存（全3枚）</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isExportingPdf}
              onClick={handlePrintGuide}
              className="h-10 px-3.5 rounded-xl bg-card hover:bg-muted border border-border text-xs font-black text-foreground flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shrink-0 disabled:opacity-55"
            >
              <Printer className="w-4 h-4 text-primary shrink-0" />
              <span>A4印刷</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-10 px-3 rounded-xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground active:scale-95 transition-all cursor-pointer shrink-0"
            >
              閉じる
            </button>
          </div>

          <p className="text-[10px] font-bold text-muted-foreground text-center flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
            <span>
              公認野球規則（第9章 9.01〜9.22・第5/6章・7回制/タイブレーク規定）に準拠した独自要約ガイドです
            </span>
          </p>
        </div>

        {/* 非表示：A4縦 PDF / 印刷生成用の3ページベクターシート */}
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: "-10000px",
            top: 0,
            width: `${A4_SVG_W}px`,
            pointerEvents: "none",
            opacity: 0,
          }}
        >
          {renderA4GuideSheetPageSvg({
            svgRef: page1SvgRef,
            pageNumber: 1,
            totalPages: 3,
            pageTitle: "公認野球規則 スコア・判定ガイド（第9章 9.01〜9.15）",
            pageSubtitle:
              "総則・三者均衡・打点・安打と野選・塁打・盗塁/重盗・犠打/犠飛・刺殺/捕殺・失策・暴投/捕逸・三振",
            leftColumnTitle: "9.01〜9.08：総則・打撃・打点・走塁記録",
            rightColumnTitle: "9.09〜9.15：守備・失策・暴投捕逸・三振記録",
            leftItems: printablePages.p1Left,
            rightItems: printablePages.p1Right,
            footerNote:
              "※公認野球規則の各条項に基づくiScoreCloud独自の要点整理シートです（ベンチ・スコアラー携行用）",
          })}
          {renderA4GuideSheetPageSvg({
            svgRef: page2SvgRef,
            pageNumber: 2,
            totalPages: 3,
            pageTitle: "公認野球規則 スコア・判定ガイド（第9章 9.16〜9.22）",
            pageSubtitle:
              "自責点・イニング再構成・勝敗投手・完投完封・セーブ/ホールド・連続安打・各種率計算式・規定打席特例",
            leftColumnTitle: "9.16〜9.19：自責点・勝敗・完投完封・セーブ/H",
            rightColumnTitle: "9.20〜9.22 ＆ 7回制/9回制規定比較",
            leftItems: printablePages.p2Left,
            rightItems: printablePages.p2Right,
            footerNote:
              "※自責点は失策・捕逸・タイブレーク配置走者を除いてイニングを再構成して判定します（規則 9.16）",
          })}
          {renderA4GuideSheetPageSvg({
            svgRef: page3SvgRef,
            pageNumber: 3,
            totalPages: 3,
            pageTitle: "ベンチ必携！重要試合ルール ＆ 現場で迷う実例Q&A",
            pageSubtitle:
              "振り逃げ・タイムプレー・インフィールドフライ・ボーク・妨害・アピール・よくあるスコア記入実例",
            leftColumnTitle: "第5章・第6章：現場で揉めやすい重要競技ルール",
            rightColumnTitle: "ケーススタディ Q&A（判定とスコアブック記入例）",
            leftItems: printablePages.p3Left,
            rightItems: printablePages.p3Right,
            footerNote:
              "※大会特別規則（学童ローカルルール・時間制限等）がある場合は大会要項を優先してください",
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
