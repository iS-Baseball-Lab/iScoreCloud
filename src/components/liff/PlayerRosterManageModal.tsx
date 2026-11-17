// filepath: src/components/liff/PlayerRosterManageModal.tsx
"use client";

import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ClipboardList,
  Loader2,
  Plus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { LiffSelect, type LiffSelectOption } from "@/components/liff/LiffSelect";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import {
  DEFENSIVE_POSITION_OPTIONS,
  GRADE_AGE_PRESETS_ADULT,
  GRADE_AGE_PRESETS_YOUTH,
  normalizeCanonicalPositionCode,
} from "@/lib/liff/player-profile-schema";

export interface CreatedRosterPlayerSummary {
  id: string;
  name: string;
  nameKana: string | null;
  uniformNumber: string;
  nickname: string | null;
  primaryPosition: string | null;
  throws: "R" | "L" | null;
  bats: "R" | "L" | "S" | null;
  gradeOrAge: string | null;
  joinedAt: string | null;
}

interface PlayerRosterManageModalProps {
  isOpen: boolean;
  teamId: string;
  userId: string | null;
  userName: string | null;
  onClose: () => void;
  onCreated: (createdPlayers: CreatedRosterPlayerSummary[], keepOpen: boolean) => void;
}

interface ParsedBulkPlayerRow {
  lineNumber: number;
  name: string;
  uniformNumber: string;
  primaryPosition: string | null;
  throws: "R" | "L" | null;
  bats: "R" | "L" | "S" | null;
  gradeOrAge: string | null;
}

const POSITION_SELECT_OPTIONS: LiffSelectOption[] = [
  { value: "", label: "未設定（あとで設定）", group: "基本" },
  ...DEFENSIVE_POSITION_OPTIONS.map((opt) => ({
    value: opt.code,
    label: opt.fullLabel,
    group: opt.group,
    keywords: `${opt.code} ${opt.shortLabel} ${opt.fullLabel}`,
  })),
];

const GRADE_SELECT_OPTIONS: LiffSelectOption[] = [
  { value: "", label: "未設定", group: "基本" },
  ...GRADE_AGE_PRESETS_YOUTH.map((g) => ({
    value: g,
    label: g,
    group: "学童・中学・高校",
  })),
  ...GRADE_AGE_PRESETS_ADULT.map((g) => ({
    value: g,
    label: g,
    group: "大学・一般・草野球",
  })),
];

const ALL_GRADE_TOKENS = new Set<string>([
  ...GRADE_AGE_PRESETS_YOUTH,
  ...GRADE_AGE_PRESETS_ADULT,
]);

const SHORT_POSITION_TOKEN_MAP: Record<string, string> = {
  投: "P",
  捕: "C",
  一: "1B",
  二: "2B",
  三: "3B",
  遊: "SS",
  左: "LF",
  中: "CF",
  右: "RF",
  指: "DH",
};

function toHalfWidthDigits(input: string): string {
  return input.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

function parseThrowsBatsToken(
  token: string
): { throws: "R" | "L"; bats: "R" | "L" | "S" } | null {
  const cleaned = token.trim();
  const matchJp = cleaned.match(/^(右|左)投(右|左|両)打?$/);
  if (matchJp) {
    return {
      throws: matchJp[1] === "左" ? "L" : "R",
      bats: matchJp[2] === "左" ? "L" : matchJp[2] === "両" ? "S" : "R",
    };
  }
  const matchEn = cleaned.toUpperCase().match(/^([RL])[\/\-]([RLS])$/);
  if (matchEn) {
    return {
      throws: matchEn[1] as "R" | "L",
      bats: matchEn[2] as "R" | "L" | "S",
    };
  }
  return null;
}

function parseBulkRosterText(rawText: string): ParsedBulkPlayerRow[] {
  const lines = rawText.split(/\r?\n/);
  const results: ParsedBulkPlayerRow[] = [];

  lines.forEach((rawLine, index) => {
    const normalizedLine = toHalfWidthDigits(rawLine)
      .replace(/^[・•\-*]\s*/, "")
      .trim();
    if (!normalizedLine) return;

    // CSV / TSV 形式かスペース区切りかを判定
    const isDelimited = normalizedLine.includes("\t") || normalizedLine.includes(",");
    const rawTokens = isDelimited
      ? normalizedLine.split(/[\t,]+/).map((t) => t.trim()).filter(Boolean)
      : normalizedLine.split(/[\s　]+/).map((t) => t.trim()).filter(Boolean);

    if (rawTokens.length === 0) return;

    // ヘッダー行の自動スキップ
    const headerCheck = rawTokens.join("");
    if (
      index === 0 &&
      (headerCheck.includes("背番号") || headerCheck.includes("氏名") || headerCheck.includes("選手名")) &&
      !/\d/.test(rawTokens[0])
    ) {
      return;
    }

    let uniformNumber = "";
    let primaryPosition: string | null = null;
    let throwsVal: "R" | "L" | null = null;
    let batsVal: "R" | "L" | "S" | null = null;
    let gradeOrAge: string | null = null;
    const nameParts: string[] = [];

    rawTokens.forEach((tok, tokIdx) => {
      const numCandidate = tok
        .replace(/^(?:背番号|背番|No\.?|#|＃)/i, "")
        .replace(/番$/, "")
        .trim();

      if (
        tokIdx === 0 &&
        /^\d{1,3}$/.test(numCandidate) &&
        rawTokens.length >= 2
      ) {
        uniformNumber = numCandidate;
        return;
      }

      if (tokIdx >= 1 && !primaryPosition) {
        const canonical =
          normalizeCanonicalPositionCode(tok) || SHORT_POSITION_TOKEN_MAP[tok] || null;
        if (canonical && (nameParts.length > 0 || isDelimited)) {
          primaryPosition = canonical;
          return;
        }
      }

      if (tokIdx >= 1 && !throwsVal && !batsVal) {
        const tb = parseThrowsBatsToken(tok);
        if (tb && nameParts.length > 0) {
          throwsVal = tb.throws;
          batsVal = tb.bats;
          return;
        }
      }

      if (tokIdx >= 1 && !gradeOrAge && ALL_GRADE_TOKENS.has(tok) && nameParts.length > 0) {
        gradeOrAge = tok;
        return;
      }

      nameParts.push(tok);
    });

    const joinedName = nameParts.join(" ").trim();
    if (!joinedName) return;

    results.push({
      lineNumber: index + 1,
      name: joinedName.slice(0, 50),
      uniformNumber: uniformNumber.slice(0, 8),
      primaryPosition,
      throws: throwsVal,
      bats: batsVal,
      gradeOrAge,
    });
  });

  return results;
}

function getPositionShortLabel(code: string | null): string {
  if (!code) return "未設定";
  const found = DEFENSIVE_POSITION_OPTIONS.find((o) => o.code === code);
  return found ? found.shortLabel : code;
}

export function PlayerRosterManageModal({
  isOpen,
  teamId,
  userId,
  userName,
  onClose,
  onCreated,
}: PlayerRosterManageModalProps) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // 1名ずつ登録フォーム
  const [name, setName] = useState<string>("");
  const [nameKana, setNameKana] = useState<string>("");
  const [uniformNumber, setUniformNumber] = useState<string>("");
  const [nickname, setNickname] = useState<string>("");
  const [primaryPosition, setPrimaryPosition] = useState<string>("");
  const [gradeOrAge, setGradeOrAge] = useState<string>("");
  const [throwsVal, setThrowsVal] = useState<"R" | "L" | "">("");
  const [batsVal, setBatsVal] = useState<"R" | "L" | "S" | "">("");
  const [joinedAt, setJoinedAt] = useState<string>("");

  // 一括テキスト登録フォーム
  const [bulkText, setBulkText] = useState<string>("");

  const parsedBulkRows = useMemo(() => parseBulkRosterText(bulkText), [bulkText]);

  if (!isOpen || typeof document === "undefined") return null;

  const resetSingleForm = () => {
    setName("");
    setNameKana("");
    setUniformNumber("");
    setNickname("");
    setPrimaryPosition("");
    setThrowsVal("");
    setBatsVal("");
  };

  const handleSingleSubmit = async (keepOpen: boolean) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("選手の氏名を入力してください");
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanNum = toHalfWidthDigits(uniformNumber).replace(/^[#＃]/, "").trim();
      const reqItem = {
        name: trimmedName,
        nameKana: nameKana.trim() || null,
        uniformNumber: cleanNum,
        nickname: nickname.trim() || null,
        primaryPosition: primaryPosition || null,
        throws: throwsVal || null,
        bats: batsVal || null,
        gradeOrAge: gradeOrAge || null,
        joinedAt: joinedAt || null,
      };

      const res = await fetch("/api/liff/players/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId,
          userName,
          players: [reqItem],
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        createdPlayers?: Array<{ id: string; name: string; uniformNumber: string }>;
      };

      if (!res.ok || !data.success) {
        toast.error(data.error || "選手の登録に失敗しました");
        return;
      }

      invalidateLiffApiCache("/api/liff/");
      const fallbackPrefix = teamId === "demo-team" ? "demo-local" : "local";
      const createdId = data.createdPlayers?.[0]?.id || `${fallbackPrefix}-${Date.now()}`;
      const summary: CreatedRosterPlayerSummary = {
        id: createdId,
        name: reqItem.name,
        nameKana: reqItem.nameKana,
        uniformNumber: reqItem.uniformNumber,
        nickname: reqItem.nickname,
        primaryPosition: reqItem.primaryPosition,
        throws: reqItem.throws,
        bats: reqItem.bats,
        gradeOrAge: reqItem.gradeOrAge,
        joinedAt: reqItem.joinedAt,
      };

      toast.success(
        `「${reqItem.uniformNumber ? `#${reqItem.uniformNumber} ` : ""}${reqItem.name}」を選手名鑑に登録しました！`
      );
      resetSingleForm();
      onCreated([summary], keepOpen);
      if (!keepOpen) {
        onClose();
      }
    } catch (err) {
      console.error("Failed to create player:", err);
      toast.error("通信エラーにより登録できませんでした");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkSubmit = async () => {
    if (parsedBulkRows.length === 0) {
      toast.error("登録する選手データを1行以上入力してください");
      return;
    }
    if (parsedBulkRows.length > 60) {
      toast.error("一度に一括登録できるのは最大60名までです（分割して登録してください）");
      return;
    }

    setIsSubmitting(true);
    try {
      const payloadItems = parsedBulkRows.map((row) => ({
        name: row.name,
        nameKana: null,
        uniformNumber: row.uniformNumber,
        nickname: null,
        primaryPosition: row.primaryPosition,
        throws: row.throws,
        bats: row.bats,
        gradeOrAge: row.gradeOrAge,
        joinedAt: null,
      }));

      const res = await fetch("/api/liff/players/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId,
          userName,
          players: payloadItems,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        createdCount?: number;
        createdPlayers?: Array<{ id: string; name: string; uniformNumber: string }>;
      };

      if (!res.ok || !data.success) {
        toast.error(data.error || "一括登録に失敗しました");
        return;
      }

      invalidateLiffApiCache("/api/liff/");
      const fallbackBulkPrefix = teamId === "demo-team" ? "demo-local-bulk" : "local-bulk";
      const summaries: CreatedRosterPlayerSummary[] = parsedBulkRows.map((row, idx) => ({
        id: data.createdPlayers?.[idx]?.id || `${fallbackBulkPrefix}-${Date.now()}-${idx}`,
        name: row.name,
        nameKana: null,
        uniformNumber: row.uniformNumber,
        nickname: null,
        primaryPosition: row.primaryPosition,
        throws: row.throws,
        bats: row.bats,
        gradeOrAge: row.gradeOrAge,
        joinedAt: null,
      }));

      toast.success(`${summaries.length}名の選手を一括登録しました！`);
      setBulkText("");
      onCreated(summaries, false);
      onClose();
    } catch (err) {
      console.error("Failed to bulk create players:", err);
      toast.error("通信エラーにより一括登録できませんでした");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-950/65 p-0 sm:p-4 animate-in fade-in duration-150">
      <div
        className="absolute inset-0"
        onClick={() => !isSubmitting && onClose()}
      />

      <div className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* A-3 上帯ダークキャップ */}
        <div className="px-4 py-3.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 text-primary flex items-center justify-center shrink-0">
              <UserPlus className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">
                在籍選手の追加登録
              </h3>
              <p className="text-[10.5px] font-bold text-slate-300 truncate">
                1名ずつの詳細登録・名簿テキストからの一括登録に対応
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* モード切替タブ */}
        <div className="px-4 pt-3 pb-2 bg-muted/40 border-b border-border shrink-0">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted border border-border">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === "single"
                  ? "bg-card text-foreground shadow-2xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserPlus className={`w-3.5 h-3.5 ${mode === "single" ? "text-primary" : ""}`} />
              <span>1名ずつ登録</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("bulk")}
              className={`py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === "bulk"
                  ? "bg-card text-foreground shadow-2xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ClipboardList className={`w-3.5 h-3.5 ${mode === "bulk" ? "text-primary" : ""}`} />
              <span>テキスト一括登録</span>
            </button>
          </div>
        </div>

        {/* ボディ */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          {mode === "single" ? (
            <div className="space-y-3.5">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2 space-y-1">
                  <label className="text-[11px] font-black text-foreground flex items-center gap-1">
                    <span>選手氏名</span>
                    <span className="px-1.5 py-0.2 rounded bg-rose-500/12 text-rose-600 dark:text-rose-400 text-[9.5px] font-black">
                      必須
                    </span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例: 山田 太郎"
                    className="w-full h-10 px-3 rounded-xl bg-card border border-border text-sm font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    背番号
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={uniformNumber}
                    onChange={(e) => setUniformNumber(e.target.value)}
                    placeholder="例: 10"
                    className="w-full h-10 px-3 rounded-xl bg-card border border-border text-sm font-black tabular-nums text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-muted-foreground block">
                    ふりがな（任意）
                  </label>
                  <input
                    type="text"
                    value={nameKana}
                    onChange={(e) => setNameKana(e.target.value)}
                    placeholder="例: ヤマダ タロウ"
                    className="w-full h-10 px-3 rounded-xl bg-card border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-muted-foreground block">
                    コール名・呼称（任意）
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="例: タロウ"
                    className="w-full h-10 px-3 rounded-xl bg-card border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    メイン守備位置
                  </label>
                  <LiffSelect
                    value={primaryPosition}
                    onChange={setPrimaryPosition}
                    options={POSITION_SELECT_OPTIONS}
                    title="メイン守備位置を選択"
                    placeholder="未設定"
                    size="md"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    学年・年代
                  </label>
                  <LiffSelect
                    value={gradeOrAge}
                    onChange={setGradeOrAge}
                    options={GRADE_SELECT_OPTIONS}
                    title="学年・年代を選択"
                    placeholder="未設定"
                    size="md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-muted-foreground block">
                    投球（右投 / 左投）
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { code: "R", label: "右投" },
                        { code: "L", label: "左投" },
                      ] as const
                    ).map((opt) => {
                      const active = throwsVal === opt.code;
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() => setThrowsVal(active ? "" : opt.code)}
                          className={`h-9 rounded-xl border text-xs font-black transition-all cursor-pointer ${
                            active
                              ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                              : "bg-card text-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-muted-foreground block">
                    打席（右 / 左 / 両）
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { code: "R", label: "右打" },
                        { code: "L", label: "左打" },
                        { code: "S", label: "両打" },
                      ] as const
                    ).map((opt) => {
                      const active = batsVal === opt.code;
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() => setBatsVal(active ? "" : opt.code)}
                          className={`h-9 rounded-xl border text-xs font-black transition-all cursor-pointer ${
                            active
                              ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                              : "bg-card text-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-1 pt-1 border-t border-border">
                <label className="text-[11px] font-black text-muted-foreground block">
                  途中入団日（任意・入団前の過去試合から自動除外）
                </label>
                <input
                  type="date"
                  value={joinedAt}
                  onChange={(e) => setJoinedAt(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-card border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="rounded-xl bg-muted/60 border border-border p-3 space-y-1">
                <p className="text-xs font-black text-foreground">
                  1行に1名ずつ貼り付けるだけで一括登録できます
                </p>
                <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                  LINEの名簿やExcel・スプレッドシートからのコピー＆ペーストに対応しています。「背番号 氏名 守備位置 学年」の順で自動認識します（背番号なし・氏名のみでもOK）。
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-foreground">
                    選手リスト入力（最大60名）
                  </label>
                  {bulkText && (
                    <button
                      type="button"
                      onClick={() => setBulkText("")}
                      className="text-[11px] font-black text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      クリア
                    </button>
                  )}
                </div>
                <textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`10 山田 太郎 遊 小6\n1 佐藤 健太 投 右投左打 小6\n2 鈴木 一郎 捕 小5\n高橋 大輔`}
                  className="w-full p-3 rounded-xl bg-card border border-border text-xs font-bold text-foreground leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-primary/40 resize-y"
                />
              </div>

              {/* リアルタイム解析プレビュー */}
              <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
                <div className="px-3 py-2 bg-[#0f172a] text-slate-50 border-b-[2px] border-teal-500 flex items-center justify-between">
                  <span className="text-[11px] font-black flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-teal-400" />
                    <span>認識プレビュー</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 text-[10.5px] font-black tabular-nums">
                    {parsedBulkRows.length}名
                  </span>
                </div>

                {parsedBulkRows.length === 0 ? (
                  <div className="p-4 text-center text-[11px] font-bold text-muted-foreground">
                    上の入力欄に名簿テキストを入力すると、ここに登録プレビューが表示されます
                  </div>
                ) : (
                  <div className="max-h-44 overflow-y-auto divide-y divide-border bg-card">
                    {parsedBulkRows.map((row, idx) => (
                      <div
                        key={`preview-${row.lineNumber}-${idx}`}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-9 text-center px-1.5 py-0.5 rounded-md bg-muted border border-border font-black tabular-nums text-[11px] shrink-0">
                            {row.uniformNumber ? `#${row.uniformNumber}` : "#-"}
                          </span>
                          <span className="font-black text-foreground truncate">
                            {row.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {row.primaryPosition && (
                            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-black">
                              {getPositionShortLabel(row.primaryPosition)}
                            </span>
                          )}
                          {row.throws && row.bats && (
                            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-bold">
                              {row.throws === "L" ? "左" : "右"}投
                              {row.bats === "L" ? "左" : row.bats === "S" ? "両" : "右"}打
                            </span>
                          )}
                          {row.gradeOrAge && (
                            <span className="px-1.5 py-0.5 rounded bg-muted text-foreground text-[10px] font-black">
                              {row.gradeOrAge}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* フッター（Safe Area対応） */}
        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-4 bg-card border-t border-border shrink-0">
          {mode === "single" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting || !name.trim()}
                onClick={() => void handleSingleSubmit(true)}
                className="flex-1 h-11 px-3 rounded-xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5 text-primary" />
                )}
                <span>登録して続けて追加</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting || !name.trim()}
                onClick={() => void handleSingleSubmit(false)}
                className="flex-1 h-11 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>登録して完了</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="h-11 px-4 rounded-xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground active:scale-95 transition-all cursor-pointer"
              >
                キャンセル
              </button>

              <button
                type="button"
                disabled={isSubmitting || parsedBulkRows.length === 0}
                onClick={() => void handleBulkSubmit()}
                className="flex-1 h-11 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{parsedBulkRows.length}名を一括登録する</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
