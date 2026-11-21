// filepath: src/components/liff/SpecialEventModals.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Coins,
  Crown,
  Download,
  Edit3,
  ExternalLink,
  HelpCircle,
  Loader2,
  MapPin,
  PartyPopper,
  Plus,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Utensils,
  X,
  XCircle,
} from "lucide-react";
import {
  LiffSelect,
  type LiffSelectOption,
} from "@/components/liff/LiffSelect";
import {
  LiffLocationPicker,
  type LiffGroundItem,
} from "@/components/liff/LiffLocationPicker";
import { useLiff } from "@/components/liff/LiffProvider";
import { sharePlainTextViaLine, buildShareableLiffPageUrl } from "@/lib/liff/liff-client";
import {
  COMPANION_RELATION_PRESETS,
  DEFAULT_SPECIAL_EVENT_FEE_TIERS,
  SPECIAL_EVENT_CATEGORIES,
  SPECIAL_EVENT_TEMPLATES,
  SURVEY_QUESTION_PRESETS,
  buildSpecialEventAnnouncementLineText,
  buildSpecialEventCsvContent,
  buildSpecialEventSummaryLineText,
  buildSpecialEventTimeRangeLabel,
  formatDateKeyToJaLabel,
  getSpecialEventCategoryMeta,
  type HouseholdResponseView,
  type SpecialEventAttendanceStatus,
  type SpecialEventCandidateDate,
  type SpecialEventCategory,
  type SpecialEventCompanion,
  type SpecialEventDateVote,
  type SpecialEventDateVoteMark,
  type SpecialEventDetailItem,
  type SpecialEventFeeTier,
  type SpecialEventMemberAttendance,
  type SpecialEventMode,
  type SpecialEventQuestion,
  type SpecialEventQuestionType,
  type SpecialEventStatus,
  type SpecialEventSurveyAnswers,
} from "@/lib/liff/special-events-schema";
import { cn } from "@/lib/utils";

function makeLocalId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function getNextWeekendDateStrings(): [string, string] {
  const base = new Date();
  const day = base.getDay();
  const diffToSat = ((6 - day + 7) % 7) || 7;
  const sat1 = new Date(base);
  sat1.setDate(base.getDate() + diffToSat + 7);
  const sat2 = new Date(sat1);
  sat2.setDate(sat1.getDate() + 7);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  return [fmt(sat1), fmt(sat2)];
}

export interface UpsertSpecialEventPayload {
  title: string;
  category: SpecialEventCategory;
  mode: SpecialEventMode;
  status: SpecialEventStatus;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string;
  locationUrl: string;
  deadlineDate: string | null;
  description: string;
  allowCompanions: boolean;
  useFeeCalculation: boolean;
  feeTiers: SpecialEventFeeTier[];
  candidateDates: SpecialEventCandidateDate[];
  questions: SpecialEventQuestion[];
}

interface CreateOrEditSpecialEventModalProps {
  isOpen: boolean;
  editingEvent: SpecialEventDetailItem | null;
  grounds: LiffGroundItem[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: UpsertSpecialEventPayload) => Promise<void>;
  onDelete?: (eventId: string) => Promise<void>;
}

const CATEGORY_SELECT_OPTIONS: LiffSelectOption[] =
  SPECIAL_EVENT_CATEGORIES.map((cat) => ({
    value: cat.id,
    label: `${cat.icon} ${cat.label}`,
    badge: cat.shortLabel,
    badgeTone:
      cat.id === "party"
        ? "amber"
        : cat.id === "ceremony"
        ? "rose"
        : cat.id === "recreation"
        ? "teal"
        : "primary",
  }));

const STATUS_SELECT_OPTIONS: LiffSelectOption[] = [
  {
    value: "open",
    label: "🟢 回答受付中",
    sublabel: "メンバーが出欠・アンケートを回答・変更できます",
    badge: "受付中",
    badgeTone: "emerald",
  },
  {
    value: "closed",
    label: "🔒 受付締切済",
    sublabel: "一般回答をロック（幹事・指導者による代理修正や集金チェックは可能）",
    badge: "締切済",
    badgeTone: "amber",
  },
  {
    value: "archived",
    label: "📦 終了・アーカイブ",
    sublabel: "終了分タブへ移動し、ホームやカレンダーから非表示にします",
    badge: "終了",
    badgeTone: "slate",
  },
];

const QUESTION_TYPE_OPTIONS: LiffSelectOption[] = [
  {
    value: "single",
    label: "🔘 単一選択（1つだけ選ぶ）",
    sublabel: "コース選択・飲み放題区分・二次会出欠など",
  },
  {
    value: "multiple",
    label: "☑️ 複数選択（当てはまるもの全て）",
    sublabel: "係のお手伝い・持参可能な備品など",
  },
  {
    value: "text",
    label: "✏️ 自由記述（テキスト入力）",
    sublabel: "アレルギー詳細・要望メモなど",
  },
];

const TIER_TARGET_KIND_OPTIONS: LiffSelectOption[] = [
  { value: "adult", label: "大人（保護者・指導者）向け" },
  { value: "player", label: "選手（部員本人）向け" },
  { value: "companion", label: "兄弟・同伴家族向け" },
  { value: "any", label: "共通（全員選択可）" },
];

export function CreateOrEditSpecialEventModal({
  isOpen,
  editingEvent,
  grounds,
  isSaving,
  onClose,
  onSave,
  onDelete,
}: CreateOrEditSpecialEventModalProps) {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<SpecialEventCategory>("party");
  const [mode, setMode] = useState<SpecialEventMode>("rsvp");
  const [status, setStatus] = useState<SpecialEventStatus>("open");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:30");
  const [location, setLocation] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [description, setDescription] = useState("");
  const [allowCompanions, setAllowCompanions] = useState(true);
  const [useFeeCalculation, setUseFeeCalculation] = useState(true);
  const [feeTiers, setFeeTiers] = useState<SpecialEventFeeTier[]>(() =>
    DEFAULT_SPECIAL_EVENT_FEE_TIERS.map((t) => ({ ...t }))
  );
  const [candidateDates, setCandidateDates] = useState<
    SpecialEventCandidateDate[]
  >([]);
  const [questions, setQuestions] = useState<SpecialEventQuestion[]>([]);
  const [newOptionDrafts, setNewOptionDrafts] = useState<Record<string, string>>(
    {}
  );
  const [confirmDeleteChecked, setConfirmDeleteChecked] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmDeleteChecked(false);
    setNewOptionDrafts({});

    if (editingEvent) {
      setTitle(editingEvent.title);
      setCategory(editingEvent.category);
      setMode(editingEvent.mode);
      setStatus(editingEvent.status);
      setEventDate(editingEvent.eventDate || "");
      setStartTime(editingEvent.startTime || "18:00");
      setEndTime(editingEvent.endTime || "20:30");
      setLocation(editingEvent.location || "");
      setLocationUrl(editingEvent.locationUrl || "");
      setDeadlineDate(editingEvent.deadlineDate || "");
      setDescription(editingEvent.description || "");
      setAllowCompanions(editingEvent.allowCompanions);
      setUseFeeCalculation(editingEvent.useFeeCalculation);
      setFeeTiers(
        editingEvent.feeTiers.length > 0
          ? editingEvent.feeTiers.map((t) => ({ ...t }))
          : DEFAULT_SPECIAL_EVENT_FEE_TIERS.map((t) => ({ ...t }))
      );
      setCandidateDates(
        editingEvent.candidateDates.map((c) => ({ ...c }))
      );
      setQuestions(
        editingEvent.questions.map((q) => ({
          ...q,
          options: [...q.options],
        }))
      );
    } else {
      const tpl = SPECIAL_EVENT_TEMPLATES[0];
      const [sat1, sat2] = getNextWeekendDateStrings();
      setTitle("");
      setCategory(tpl.category);
      setMode(tpl.mode);
      setStatus("open");
      setEventDate(sat1);
      setStartTime(tpl.startTime);
      setEndTime(tpl.endTime);
      setLocation("");
      setLocationUrl("");
      setDeadlineDate("");
      setDescription("");
      setAllowCompanions(tpl.allowCompanions);
      setUseFeeCalculation(tpl.useFeeCalculation);
      setFeeTiers(tpl.feeTiers.map((t) => ({ ...t })));
      setCandidateDates([
        {
          id: makeLocalId("cand"),
          dateStr: sat1,
          startTime: "18:00",
          endTime: "20:30",
          note: "第1候補",
        },
        {
          id: makeLocalId("cand"),
          dateStr: sat2,
          startTime: "18:00",
          endTime: "20:30",
          note: "第2候補",
        },
      ]);
      setQuestions(
        tpl.questions.map((q) => ({
          ...q,
          id: makeLocalId("q"),
          options: [...q.options],
        }))
      );
    }
  }, [editingEvent, isOpen]);

  if (!mounted || !isOpen) return null;

  const applyTemplate = (tplId: string) => {
    const tpl = SPECIAL_EVENT_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    if (!title.trim()) {
      setTitle(tpl.titlePlaceholder);
    }
    setCategory(tpl.category);
    setMode(tpl.mode);
    setStartTime(tpl.startTime);
    setEndTime(tpl.endTime);
    setAllowCompanions(tpl.allowCompanions);
    setUseFeeCalculation(tpl.useFeeCalculation);
    setFeeTiers(tpl.feeTiers.map((t) => ({ ...t })));
    setQuestions(
      tpl.questions.map((q) => ({
        ...q,
        id: makeLocalId("q"),
        options: [...q.options],
      }))
    );
    if (tpl.mode === "date_poll" && candidateDates.length === 0) {
      const [sat1, sat2] = getNextWeekendDateStrings();
      setCandidateDates([
        {
          id: makeLocalId("cand"),
          dateStr: sat1,
          startTime: tpl.startTime,
          endTime: tpl.endTime,
          note: "第1候補",
        },
        {
          id: makeLocalId("cand"),
          dateStr: sat2,
          startTime: tpl.startTime,
          endTime: tpl.endTime,
          note: "第2候補",
        },
      ]);
    }
    toast.success(`「${tpl.label}」のひな形をセットしました！`);
  };

  const handleAddPresetQuestion = (presetId: string) => {
    const preset = SURVEY_QUESTION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setQuestions((prev) => [
      ...prev,
      {
        id: makeLocalId("q"),
        title: preset.question.title,
        type: preset.question.type,
        options: [...preset.question.options],
        required: preset.question.required,
        placeholder: preset.question.placeholder,
      },
    ]);
    toast.success("アンケート項目を追加しました");
  };

  const handleAddCustomQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: makeLocalId("q"),
        title: "",
        type: "single",
        options: ["はい", "いいえ"],
        required: false,
      },
    ]);
  };

  const handleMoveQuestion = (idx: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, moved);
      return copy;
    });
  };

  const handleSubmit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error("イベント名（例：2026年 忘年会）を入力してください");
      return;
    }
    if (mode === "date_poll") {
      const validCands = candidateDates.filter((c) =>
        /^\d{4}-\d{2}-\d{2}$/.test(c.dateStr)
      );
      if (validCands.length === 0) {
        toast.error("候補日を1つ以上設定してください");
        return;
      }
    }
    for (const q of questions) {
      if (!q.title.trim()) {
        toast.error("未入力のアンケート質問文があります（不要な枠は削除してください）");
        return;
      }
      if ((q.type === "single" || q.type === "multiple") && q.options.length === 0) {
        toast.error(`「${q.title}」の選択肢を1つ以上追加してください`);
        return;
      }
    }

    await onSave({
      title: cleanTitle,
      category,
      mode,
      status,
      eventDate: mode === "rsvp" && eventDate ? eventDate : null,
      startTime: startTime || null,
      endTime: endTime || null,
      location: location.trim(),
      locationUrl: locationUrl.trim(),
      deadlineDate: deadlineDate || null,
      description: description.trim(),
      allowCompanions,
      useFeeCalculation,
      feeTiers,
      candidateDates,
      questions,
    });
  };

  const handleConfirmDelete = async () => {
    if (!editingEvent || !onDelete || !confirmDeleteChecked) return;
    setIsDeleting(true);
    try {
      await onDelete(editingEvent.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col">
        {/* A-3 Dark Cap Header */}
        <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-xl bg-teal-500 text-slate-950 flex items-center justify-center shrink-0">
              <PartyPopper className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-white truncate">
                {editingEvent ? "行事・アンケートを編集" : "行事・アンケートを新規作成"}
              </h2>
              <p className="text-[10px] font-bold text-slate-300 truncate">
                通常の練習出欠とは別枠で家族・兄弟同伴やアンケートを集計
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-5 bg-card">
          {/* 1. ひな形ワンタップ反映（新規作成時） */}
          {!editingEvent && (
            <div className="rounded-2xl border border-border bg-muted/40 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span className="text-[11px] font-black text-foreground">
                  かんたん初期セット（タップで自動入力）
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {SPECIAL_EVENT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl.id)}
                    className="p-2 rounded-xl border border-border bg-card hover:border-teal-500/50 text-left transition-all active:scale-[0.98] cursor-pointer shadow-2xs"
                  >
                    <p className="text-[11px] font-black text-foreground truncate">
                      {tpl.label}
                    </p>
                    <p className="text-[9.5px] font-bold text-muted-foreground line-clamp-1 mt-0.5">
                      {tpl.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. 募集モード切替 */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-foreground block">
              募集タイプ
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-muted border border-border">
              <button
                type="button"
                onClick={() => setMode("rsvp")}
                className={cn(
                  "py-2 px-2.5 rounded-xl text-xs transition-all cursor-pointer flex flex-col items-center gap-0.5",
                  mode === "rsvp"
                    ? "bg-card text-foreground font-black border border-teal-500 shadow-xs"
                    : "text-muted-foreground font-bold border border-transparent"
                )}
              >
                <span>📅 開催日確定・本出欠</span>
                <span className="text-[9.5px] opacity-80">
                  家族・兄弟人数・会費集計
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("date_poll")}
                className={cn(
                  "py-2 px-2.5 rounded-xl text-xs transition-all cursor-pointer flex flex-col items-center gap-0.5",
                  mode === "date_poll"
                    ? "bg-card text-foreground font-black border border-amber-500 shadow-xs"
                    : "text-muted-foreground font-bold border border-transparent"
                )}
              >
                <span>🗳️ 候補日アンケート</span>
                <span className="text-[9.5px] opacity-80">
                  日程調整（後で本出欠へ切替可）
                </span>
              </button>
            </div>
          </div>

          {/* 3. 基本情報 */}
          <div className="space-y-3 rounded-2xl border border-border bg-muted/25 p-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground block">
                  カテゴリ
                </label>
                <LiffSelect
                  value={category}
                  onChange={(v) => setCategory(v as SpecialEventCategory)}
                  options={CATEGORY_SELECT_OPTIONS}
                  title="イベント種別を選択"
                  accent="teal"
                  size="sm"
                />
              </div>
              {editingEvent && (
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    受付ステータス
                  </label>
                  <LiffSelect
                    value={status}
                    onChange={(v) => setStatus(v as SpecialEventStatus)}
                    options={STATUS_SELECT_OPTIONS}
                    title="受付ステータスを選択"
                    accent="teal"
                    size="sm"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-black text-foreground block">
                イベント・アンケート名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：2026年 チーム忘年会・納会"
                className="w-full h-10 px-3 rounded-xl border border-border bg-card text-xs font-bold text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            {mode === "rsvp" ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3 sm:col-span-1 space-y-1">
                    <label className="text-[11px] font-black text-foreground block">
                      開催日（カレンダー連動）
                    </label>
                    <input
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="w-full h-10 px-2.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground"
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2 grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-foreground block">
                        開始時間
                      </label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full h-10 px-2.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-foreground block">
                        終了時間
                      </label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full h-10 px-2.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* 候補日リスト設定 */
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-foreground">
                    候補日リスト（◯ / △ / × で投票）
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setCandidateDates((prev) => [
                        ...prev,
                        {
                          id: makeLocalId("cand"),
                          dateStr: eventDate || getNextWeekendDateStrings()[0],
                          startTime: startTime || "18:00",
                          endTime: endTime || "20:30",
                          note: "",
                        },
                      ])
                    }
                    className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[10.5px] font-black inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>候補日を追加</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {candidateDates.map((cand, idx) => (
                    <div
                      key={cand.id}
                      className="p-2.5 rounded-xl border border-border bg-card space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[10px] font-black">
                          候補 {idx + 1}
                        </span>
                        {candidateDates.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setCandidateDates((prev) =>
                                prev.filter((c) => c.id !== cand.id)
                              )
                            }
                            className="p-1 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-500/10 cursor-pointer"
                            aria-label="候補日を削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <input
                          type="date"
                          value={cand.dateStr}
                          onChange={(e) =>
                            setCandidateDates((prev) =>
                              prev.map((c) =>
                                c.id === cand.id
                                  ? { ...c, dateStr: e.target.value }
                                  : c
                              )
                            )
                          }
                          className="h-9 px-2 rounded-lg border border-border bg-card text-[11px] font-bold"
                        />
                        <input
                          type="time"
                          value={cand.startTime}
                          onChange={(e) =>
                            setCandidateDates((prev) =>
                              prev.map((c) =>
                                c.id === cand.id
                                  ? { ...c, startTime: e.target.value }
                                  : c
                              )
                            )
                          }
                          className="h-9 px-2 rounded-lg border border-border bg-card text-[11px] font-bold"
                        />
                        <input
                          type="time"
                          value={cand.endTime}
                          onChange={(e) =>
                            setCandidateDates((prev) =>
                              prev.map((c) =>
                                c.id === cand.id
                                  ? { ...c, endTime: e.target.value }
                                  : c
                              )
                            )
                          }
                          className="h-9 px-2 rounded-lg border border-border bg-card text-[11px] font-bold"
                        />
                      </div>
                      <input
                        type="text"
                        value={cand.note}
                        onChange={(e) =>
                          setCandidateDates((prev) =>
                            prev.map((c) =>
                              c.id === cand.id
                                ? { ...c, note: e.target.value }
                                : c
                            )
                          )
                        }
                        placeholder="補足メモ（任意：土曜夜・昼の部など）"
                        className="w-full h-8 px-2.5 rounded-lg border border-border bg-muted/30 text-[11px] font-bold"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 会場・お店選択（自由入力＋施設マスタ両対応） */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-foreground block">
                会場・お店の名前
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="例：海鮮ダイニング 〇〇 駅前店 / 〇〇公民館"
                className="w-full h-10 px-3 rounded-xl border border-border bg-card text-xs font-bold text-foreground focus:outline-none focus:border-primary"
              />
              {grounds.length > 0 && (
                <LiffLocationPicker
                  value={location}
                  onChange={(val) => setLocation(val)}
                  grounds={grounds}
                  title="登録施設から選ぶ（または上欄に直接お店名を入力）"
                  placeholder="登録グラウンド・施設から選ぶ場合はこちら"
                  size="sm"
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground block">
                  お店・地図URL（任意）
                </label>
                <input
                  type="url"
                  value={locationUrl}
                  onChange={(e) => setLocationUrl(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="w-full h-9 px-2.5 rounded-xl border border-border bg-card text-[11px] font-bold text-foreground"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground block">
                  回答期限日（任意）
                </label>
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-xl border border-border bg-card text-[11px] font-bold text-foreground"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-black text-foreground block">
                ご案内・持ち物・連絡事項（任意）
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="集合時間、会費の集金方法、ビンゴ景品や服装の案内など"
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground resize-none focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* 4. 家族・兄弟同伴 ＆ 区分別会費設定 */}
          <div className="rounded-2xl border border-border overflow-hidden bg-card">
            <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-2 border-teal-500 flex items-center justify-between">
              <span className="text-xs font-black flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-teal-400" />
                <span>兄弟・同伴家族 ＆ 会費区分設定</span>
              </span>
            </div>
            <div className="p-3.5 space-y-3">
              <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border bg-muted/30 cursor-pointer">
                <div>
                  <p className="text-xs font-black text-foreground">
                    👨‍👩‍👧‍👦 兄弟・その他の同伴家族の追加を受け付ける
                  </p>
                  <p className="text-[10px] font-bold text-muted-foreground">
                    名簿外の兄弟・姉妹・幼児・祖父母を区分＋お名前で追加できます
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={allowCompanions}
                  onChange={(e) => setAllowCompanions(e.target.checked)}
                  className="w-4 h-4 accent-teal-600 shrink-0"
                />
              </label>

              <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border bg-muted/30 cursor-pointer">
                <div>
                  <p className="text-xs font-black text-foreground">
                    💰 世帯ごとの会費を自動計算する
                  </p>
                  <p className="text-[10px] font-bold text-muted-foreground">
                    OFFにすると人数区分（大人・小学生・幼児等）のみを集計します
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={useFeeCalculation}
                  onChange={(e) => setUseFeeCalculation(e.target.checked)}
                  className="w-4 h-4 accent-teal-600 shrink-0"
                />
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-foreground">
                    参加区分・単価リスト（お店予約の内訳にも使用）
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFeeTiers((prev) => [
                        ...prev,
                        {
                          id: makeLocalId("tier"),
                          label: "追加区分",
                          amount: 1000,
                          targetKind: "companion",
                          enabled: true,
                        },
                      ])
                    }
                    className="px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 border border-border text-[10px] font-black text-foreground inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>区分追加</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {feeTiers.map((tier) => (
                    <div
                      key={tier.id}
                      className={cn(
                        "p-2.5 rounded-xl border space-y-2 transition-opacity",
                        tier.enabled
                          ? "border-border bg-card"
                          : "border-border/60 bg-muted/30 opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={tier.enabled}
                          onChange={(e) =>
                            setFeeTiers((prev) =>
                              prev.map((t) =>
                                t.id === tier.id
                                  ? { ...t, enabled: e.target.checked }
                                  : t
                              )
                            )
                          }
                          className="w-4 h-4 accent-teal-600 shrink-0"
                        />
                        <input
                          type="text"
                          value={tier.label}
                          onChange={(e) =>
                            setFeeTiers((prev) =>
                              prev.map((t) =>
                                t.id === tier.id
                                  ? { ...t, label: e.target.value }
                                  : t
                              )
                            )
                          }
                          className="flex-1 min-w-0 h-8 px-2 rounded-lg border border-border bg-card text-[11px] font-black text-foreground"
                        />
                        {useFeeCalculation && (
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="number"
                              min={0}
                              step={100}
                              value={tier.amount}
                              onChange={(e) =>
                                setFeeTiers((prev) =>
                                  prev.map((t) =>
                                    t.id === tier.id
                                      ? {
                                          ...t,
                                          amount: Math.max(
                                            0,
                                            Number(e.target.value) || 0
                                          ),
                                        }
                                      : t
                                  )
                                )
                              }
                              className="w-20 h-8 px-2 rounded-lg border border-border bg-card text-right text-[11px] font-black tabular-nums"
                            />
                            <span className="text-[10px] font-black text-muted-foreground">
                              円
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 pl-6">
                        <LiffSelect
                          value={tier.targetKind}
                          onChange={(v) =>
                            setFeeTiers((prev) =>
                              prev.map((t) =>
                                t.id === tier.id
                                  ? {
                                      ...t,
                                      targetKind:
                                        v as SpecialEventFeeTier["targetKind"],
                                    }
                                  : t
                              )
                            )
                          }
                          options={TIER_TARGET_KIND_OPTIONS}
                          title="対象種別"
                          size="xs"
                          className="flex-1"
                        />
                        {tier.id !== "adult" && tier.id !== "player" && (
                          <button
                            type="button"
                            onClick={() =>
                              setFeeTiers((prev) =>
                                prev.filter((t) => t.id !== tier.id)
                              )
                            }
                            className="p-1 rounded-lg text-muted-foreground hover:text-red-600 cursor-pointer"
                            aria-label="区分を削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 5. カスタムアンケート項目 */}
          <div className="rounded-2xl border border-border overflow-hidden bg-card">
            <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-2 border-amber-500 flex items-center justify-between">
              <span className="text-xs font-black flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5 text-amber-400" />
                <span>アンケート設問（任意・複数追加OK）</span>
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-800 text-amber-300">
                {questions.length}問
              </span>
            </div>

            <div className="p-3.5 space-y-3">
              {/* 定番プリセットチップ */}
              <div className="space-y-1.5">
                <span className="text-[10.5px] font-black text-muted-foreground block">
                  ワンタップでよく使う質問を追加:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SURVEY_QUESTION_PRESETS.map((pr) => (
                    <button
                      key={pr.id}
                      type="button"
                      onClick={() => handleAddPresetQuestion(pr.id)}
                      className="px-2.5 py-1 rounded-full border border-border bg-muted/40 hover:bg-muted text-[10.5px] font-black text-foreground active:scale-95 transition-all cursor-pointer"
                    >
                      ＋ {pr.chipLabel}
                    </button>
                  ))}
                </div>
              </div>

              {questions.length > 0 && (
                <div className="space-y-2.5">
                  {questions.map((q, qIdx) => (
                    <div
                      key={q.id}
                      className="p-3 rounded-xl border border-border bg-muted/20 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-[#0f172a] text-white text-[10px] font-black">
                          Q{qIdx + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <label className="inline-flex items-center gap-1 text-[10px] font-black text-foreground mr-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={(e) =>
                                setQuestions((prev) =>
                                  prev.map((item) =>
                                    item.id === q.id
                                      ? { ...item, required: e.target.checked }
                                      : item
                                  )
                                )
                              }
                              className="w-3.5 h-3.5 accent-primary"
                            />
                            <span>出席時は必須</span>
                          </label>
                          <button
                            type="button"
                            disabled={qIdx === 0}
                            onClick={() => handleMoveQuestion(qIdx, -1)}
                            className="p-1 rounded-lg border border-border bg-card disabled:opacity-35 cursor-pointer"
                            aria-label="上へ"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={qIdx === questions.length - 1}
                            onClick={() => handleMoveQuestion(qIdx, 1)}
                            className="p-1 rounded-lg border border-border bg-card disabled:opacity-35 cursor-pointer"
                            aria-label="下へ"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setQuestions((prev) =>
                                prev.filter((item) => item.id !== q.id)
                              )
                            }
                            className="p-1 rounded-lg text-muted-foreground hover:text-red-600 cursor-pointer"
                            aria-label="質問を削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={q.title}
                        onChange={(e) =>
                          setQuestions((prev) =>
                            prev.map((item) =>
                              item.id === q.id
                                ? { ...item, title: e.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="質問文を入力（例：ご希望のお食事コース）"
                        className="w-full h-9 px-2.5 rounded-xl border border-border bg-card text-xs font-black text-foreground"
                      />

                      <LiffSelect
                        value={q.type}
                        onChange={(val) => {
                          const nextType = val as SpecialEventQuestionType;
                          setQuestions((prev) =>
                            prev.map((item) =>
                              item.id === q.id
                                ? {
                                    ...item,
                                    type: nextType,
                                    options:
                                      nextType === "text"
                                        ? []
                                        : item.options.length > 0
                                        ? item.options
                                        : ["選択肢1", "選択肢2"],
                                  }
                                : item
                            )
                          );
                        }}
                        options={QUESTION_TYPE_OPTIONS}
                        title="回答形式を選択"
                        accent="amber"
                        size="sm"
                      />

                      {q.type === "text" ? (
                        <input
                          type="text"
                          value={q.placeholder || ""}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((item) =>
                                item.id === q.id
                                  ? { ...item, placeholder: e.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="入力欄のヒント文（任意）"
                          className="w-full h-8 px-2.5 rounded-lg border border-border bg-card text-[11px] font-bold"
                        />
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap gap-1.5">
                            {q.options.map((opt, optIdx) => (
                              <span
                                key={`${q.id}_opt_${optIdx}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-card text-[11px] font-bold text-foreground"
                              >
                                <span>{opt}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setQuestions((prev) =>
                                      prev.map((item) =>
                                        item.id === q.id
                                          ? {
                                              ...item,
                                              options: item.options.filter(
                                                (_, i) => i !== optIdx
                                              ),
                                            }
                                          : item
                                      )
                                    )
                                  }
                                  className="text-muted-foreground hover:text-red-600 cursor-pointer"
                                  aria-label="選択肢を削除"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={newOptionDrafts[q.id] || ""}
                              onChange={(e) =>
                                setNewOptionDrafts((prev) => ({
                                  ...prev,
                                  [q.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const draft = (
                                    newOptionDrafts[q.id] || ""
                                  ).trim();
                                  if (!draft) return;
                                  setQuestions((prev) =>
                                    prev.map((item) =>
                                      item.id === q.id &&
                                      !item.options.includes(draft)
                                        ? {
                                            ...item,
                                            options: [...item.options, draft],
                                          }
                                        : item
                                    )
                                  );
                                  setNewOptionDrafts((prev) => ({
                                    ...prev,
                                    [q.id]: "",
                                  }));
                                }
                              }}
                              placeholder="新しい選択肢を入力して追加"
                              className="flex-1 h-8 px-2.5 rounded-lg border border-border bg-card text-[11px] font-bold"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const draft = (
                                  newOptionDrafts[q.id] || ""
                                ).trim();
                                if (!draft) return;
                                setQuestions((prev) =>
                                  prev.map((item) =>
                                    item.id === q.id &&
                                    !item.options.includes(draft)
                                      ? {
                                          ...item,
                                          options: [...item.options, draft],
                                        }
                                      : item
                                  )
                                );
                                setNewOptionDrafts((prev) => ({
                                  ...prev,
                                  [q.id]: "",
                                }));
                              }}
                              className="h-8 px-2.5 rounded-lg bg-slate-800 text-white text-[10.5px] font-black shrink-0 cursor-pointer"
                            >
                              追加
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={handleAddCustomQuestion}
                className="w-full py-2 rounded-xl border border-dashed border-border hover:border-amber-500/50 bg-muted/20 hover:bg-muted/40 text-xs font-black text-foreground flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-amber-600" />
                <span>自由な質問枠を追加する</span>
              </button>
            </div>
          </div>

          {/* 6. 削除セクション（編集時かつ権限ありのみ） */}
          {editingEvent && editingEvent.canDelete && onDelete && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-red-600 dark:text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>このイベント・全回答データの削除</span>
              </div>
              <label className="flex items-center gap-2 text-[11px] font-bold text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmDeleteChecked}
                  onChange={(e) => setConfirmDeleteChecked(e.target.checked)}
                  className="w-4 h-4 accent-red-600"
                />
                <span>登録済みの出欠・アンケート回答も含めて削除することに同意する</span>
              </label>
              <button
                type="button"
                disabled={!confirmDeleteChecked || isDeleting}
                onClick={() => void handleConfirmDelete()}
                className="w-full py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>このイベントを完全に削除する</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-11 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-foreground cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSubmit()}
            className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{editingEvent ? "変更を保存する" : "イベントを公開する"}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// 2. 家族出欠 ＆ 兄弟・同伴家族追加 ＆ アンケート回答モーダル
// ============================================================================
export interface SubmitHouseholdResponsePayload {
  householdKey: string;
  householdLabel: string;
  memberEntries: SpecialEventMemberAttendance[];
  companions: SpecialEventCompanion[];
  dateVotes: SpecialEventDateVote[];
  surveyAnswers: SpecialEventSurveyAnswers;
  comment: string;
}

interface RespondSpecialEventModalProps {
  isOpen: boolean;
  event: SpecialEventDetailItem | null;
  initialHouseholdKey: string | null;
  myHouseholdKey: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: SubmitHouseholdResponsePayload) => Promise<void>;
}

const RESPONSE_COMMENT_CHIPS = [
  "家族で参加します！",
  "遅れて合流します",
  "途中で早退します",
  "車で行きます",
  "残念ながら欠席します",
] as const;

export function RespondSpecialEventModal({
  isOpen,
  event,
  initialHouseholdKey,
  myHouseholdKey,
  isSubmitting,
  onClose,
  onSubmit,
}: RespondSpecialEventModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedHouseholdKey, setSelectedHouseholdKey] = useState<string>("");
  const [memberEntries, setMemberEntries] = useState<
    SpecialEventMemberAttendance[]
  >([]);
  const [companions, setCompanions] = useState<SpecialEventCompanion[]>([]);
  const [dateVotes, setDateVotes] = useState<SpecialEventDateVote[]>([]);
  const [surveyAnswers, setSurveyAnswers] = useState<SpecialEventSurveyAnswers>(
    {}
  );
  const [comment, setComment] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadHouseholdIntoDraft = (
    ev: SpecialEventDetailItem,
    hhKey: string
  ) => {
    const found =
      ev.households.find((h) => h.householdKey === hhKey) ||
      ev.myHouseholdResponse ||
      ev.households[0];
    if (!found) return;

    setSelectedHouseholdKey(found.householdKey);
    setMemberEntries(found.memberEntries.map((m) => ({ ...m })));
    setCompanions(found.companions.map((c) => ({ ...c })));

    if (ev.mode === "date_poll") {
      const voteMap = new Map(found.dateVotes.map((v) => [v.candidateId, v]));
      const defaultHeadcount = Math.max(1, found.memberEntries.length);
      setDateVotes(
        ev.candidateDates.map((cand) => {
          const existing = voteMap.get(cand.id);
          return (
            existing || {
              candidateId: cand.id,
              vote: "ok" as SpecialEventDateVoteMark,
              headcountHint: defaultHeadcount,
            }
          );
        })
      );
    } else {
      setDateVotes(found.dateVotes.map((v) => ({ ...v })));
    }

    const clonedAnswers: SpecialEventSurveyAnswers = {};
    for (const [k, v] of Object.entries(found.surveyAnswers)) {
      clonedAnswers[k] = Array.isArray(v) ? [...v] : v;
    }
    setSurveyAnswers(clonedAnswers);
    setComment(found.comment || "");
  };

  useEffect(() => {
    if (!isOpen || !event) return;
    const startKey =
      initialHouseholdKey ||
      myHouseholdKey ||
      event.myHouseholdResponse?.householdKey ||
      event.households[0]?.householdKey ||
      "";
    loadHouseholdIntoDraft(event, startKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, event?.id, initialHouseholdKey, myHouseholdKey]);

  const activeTiers = useMemo(
    () => (event ? event.feeTiers.filter((t) => t.enabled) : []),
    [event]
  );

  const companionTierOptions = useMemo<LiffSelectOption[]>(() => {
    if (!event) return [];
    const list = activeTiers.length > 0 ? activeTiers : event.feeTiers;
    return list.map((t) => ({
      value: t.id,
      label: t.label,
      badge: event.useFeeCalculation
        ? t.amount === 0
          ? "無料"
          : `${t.amount.toLocaleString()}円`
        : undefined,
      badgeTone: t.targetKind === "companion" ? "teal" : "slate",
    }));
  }, [activeTiers, event]);

  const householdSelectOptions = useMemo<LiffSelectOption[]>(() => {
    if (!event) return [];
    return event.households.map((hh) => {
      const isMine = hh.householdKey === myHouseholdKey;
      return {
        value: hh.householdKey,
        label: isMine ? `🏠 ${hh.householdLabel}（ご自身）` : hh.householdLabel,
        sublabel: hh.memberEntries.map((m) => m.name).join("・"),
        badge: hh.hasResponded
          ? hh.overallState === "attending"
            ? `出席 ${hh.totalHeadcount}名`
            : hh.overallState === "absent"
            ? "欠席"
            : "回答済"
          : hh.isAllOnLeave
          ? "休部中"
          : "未回答",
        badgeTone: hh.hasResponded
          ? hh.overallState === "attending"
            ? "emerald"
            : "slate"
          : "amber",
      };
    });
  }, [event, myHouseholdKey]);

  const liveCalculation = useMemo(() => {
    if (!event) {
      return {
        presentMembers: 0,
        effectiveCompanions: 0,
        totalHeadcount: 0,
        totalFee: 0,
        allMembersAbsent: false,
      };
    }
    const tierPriceMap = new Map(event.feeTiers.map((t) => [t.id, t.amount]));
    const presentList = memberEntries.filter((m) => m.status === "present");
    const allMembersAbsent =
      memberEntries.length > 0 &&
      memberEntries.every((m) => m.status === "absent");
    const effectiveComps = !allMembersAbsent ? companions : [];

    let totalFee = 0;
    if (event.mode === "rsvp" && event.useFeeCalculation) {
      for (const m of presentList) {
        totalFee += tierPriceMap.get(m.feeTierId) || 0;
      }
      for (const c of effectiveComps) {
        totalFee += tierPriceMap.get(c.feeTierId) || 0;
      }
    }

    return {
      presentMembers: presentList.length,
      effectiveCompanions: effectiveComps.length,
      totalHeadcount: presentList.length + effectiveComps.length,
      totalFee,
      allMembersAbsent,
    };
  }, [companions, event, memberEntries]);

  if (!mounted || !isOpen || !event) return null;

  const currentHousehold = event.households.find(
    (h) => h.householdKey === selectedHouseholdKey
  );

  const handleAddCompanion = (preferredTierId?: string) => {
    const defaultCompanionTier =
      preferredTierId ||
      activeTiers.find((t) => t.targetKind === "companion")?.id ||
      activeTiers[0]?.id ||
      "elementary";

    // 全員未定のまま同伴家族を追加した場合は先頭メンバーを出席にして迷いを防止
    setCompanions((prev) => [
      ...prev,
      {
        id: makeLocalId("comp"),
        name: "",
        relationLabel: "弟",
        feeTierId: defaultCompanionTier,
        dietaryNote: "",
      },
    ]);
  };

  const handleSaveResponse = async () => {
    if (!selectedHouseholdKey) return;

    if (event.mode === "rsvp") {
      const hasAnyDecision =
        memberEntries.some(
          (m) => m.status === "present" || m.status === "absent"
        ) || companions.length > 0;
      if (!hasAnyDecision) {
        toast.error("メンバーの「出席」または「欠席」を選択してください");
        return;
      }
    }

    const isAttendingContext =
      event.mode === "date_poll"
        ? dateVotes.some((v) => v.vote === "ok" || v.vote === "maybe")
        : liveCalculation.totalHeadcount > 0;

    if (isAttendingContext) {
      for (const q of event.questions) {
        if (!q.required) continue;
        const ans = surveyAnswers[q.id];
        const isEmpty =
          ans == null ||
          (typeof ans === "string" && !ans.trim()) ||
          (Array.isArray(ans) && ans.length === 0);
        if (isEmpty) {
          toast.error(`必須アンケート「${q.title}」をご回答ください`);
          return;
        }
      }
    }

    await onSubmit({
      householdKey: selectedHouseholdKey,
      householdLabel: currentHousehold?.householdLabel || "ご家族",
      memberEntries,
      companions: liveCalculation.allMembersAbsent ? [] : companions,
      dateVotes,
      surveyAnswers,
      comment: comment.trim(),
    });
  };

  const roleIcon = (roleGroup: SpecialEventMemberAttendance["roleGroup"]) => {
    if (roleGroup === "player") return "⚾";
    if (roleGroup === "mother") return "👩";
    if (roleGroup === "father") return "👨";
    return "🧢";
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col">
        {/* A-3 Dark Cap */}
        <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <span className="text-[10px] font-black text-teal-300 block truncate">
              {getSpecialEventCategoryMeta(event.category).icon} {event.title}
            </span>
            <h2 className="text-sm font-black text-white truncate">
              {event.mode === "date_poll"
                ? "候補日・アンケートを回答"
                : "家族の出欠・兄弟同伴・アンケート回答"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4 bg-card">
          {/* 1. 回答対象の世帯セレクタ（代理入力にも対応） */}
          {householdSelectOptions.length > 1 && (
            <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-foreground">
                  回答するご家庭・メンバー
                </span>
                {selectedHouseholdKey !== myHouseholdKey && myHouseholdKey && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[9.5px] font-black">
                    代理入力モード
                  </span>
                )}
              </div>
              <LiffSelect
                value={selectedHouseholdKey}
                onChange={(nextKey) => loadHouseholdIntoDraft(event, nextKey)}
                options={householdSelectOptions}
                title="回答する世帯・メンバーを選択"
                searchable={householdSelectOptions.length >= 6}
                accent="teal"
                size="sm"
              />
            </div>
          )}

          {/* 2A. 候補日アンケートモード */}
          {event.mode === "date_poll" && (
            <div className="rounded-2xl border border-border overflow-hidden bg-card">
              <div className="px-3.5 py-2 bg-[#0f172a] text-slate-50 border-b-2 border-amber-500 flex items-center justify-between">
                <span className="text-xs font-black">
                  🗳️ 各候補日のご都合を選択してください
                </span>
              </div>
              <div className="p-3 space-y-2.5">
                {event.candidateDates.map((cand) => {
                  const vObj = dateVotes.find((v) => v.candidateId === cand.id);
                  const currentVote = vObj?.vote || "ok";
                  const currentHint =
                    vObj?.headcountHint ?? Math.max(1, memberEntries.length);

                  const setVote = (nextVote: SpecialEventDateVoteMark) => {
                    setDateVotes((prev) => {
                      const exists = prev.some(
                        (item) => item.candidateId === cand.id
                      );
                      if (!exists) {
                        return [
                          ...prev,
                          {
                            candidateId: cand.id,
                            vote: nextVote,
                            headcountHint: currentHint,
                          },
                        ];
                      }
                      return prev.map((item) =>
                        item.candidateId === cand.id
                          ? { ...item, vote: nextVote }
                          : item
                      );
                    });
                  };

                  const setHint = (delta: number) => {
                    const nextVal = Math.max(
                      1,
                      Math.min(15, currentHint + delta)
                    );
                    setDateVotes((prev) =>
                      prev.map((item) =>
                        item.candidateId === cand.id
                          ? { ...item, headcountHint: nextVal }
                          : item
                      )
                    );
                  };

                  return (
                    <div
                      key={cand.id}
                      className="p-3 rounded-xl border border-border bg-muted/20 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-xs font-black text-foreground">
                            {formatDateKeyToJaLabel(cand.dateStr) || cand.dateStr}
                          </span>
                          <span className="ml-2 text-[11px] font-bold text-muted-foreground tabular-nums">
                            {buildSpecialEventTimeRangeLabel(
                              cand.startTime,
                              cand.endTime
                            )}
                          </span>
                        </div>
                        {cand.note && (
                          <span className="px-2 py-0.5 rounded-md bg-card border border-border text-[10px] font-bold text-muted-foreground">
                            {cand.note}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            {
                              id: "ok" as const,
                              label: "◯ 参加可",
                              activeClass:
                                "bg-emerald-600 text-white border-emerald-600",
                            },
                            {
                              id: "maybe" as const,
                              label: "△ 調整可",
                              activeClass:
                                "bg-amber-500 text-white border-amber-500",
                            },
                            {
                              id: "ng" as const,
                              label: "× 不可",
                              activeClass:
                                "bg-slate-600 text-white border-slate-600",
                            },
                          ] as const
                        ).map((btn) => (
                          <button
                            key={btn.id}
                            type="button"
                            onClick={() => setVote(btn.id)}
                            className={cn(
                              "h-9 rounded-xl border text-xs font-black transition-all active:scale-95 cursor-pointer",
                              currentVote === btn.id
                                ? btn.activeClass
                                : "bg-card text-foreground border-border hover:bg-muted"
                            )}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>

                      {currentVote !== "ng" && (
                        <div className="flex items-center justify-between pt-1 text-[11px]">
                          <span className="font-bold text-muted-foreground">
                            参加予定人数（兄弟・家族含む目安）
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setHint(-1)}
                              className="w-7 h-7 rounded-lg border border-border bg-card font-black text-foreground cursor-pointer"
                            >
                              −
                            </button>
                            <span className="w-10 text-center font-black text-foreground tabular-nums">
                              {currentHint}名
                            </span>
                            <button
                              type="button"
                              onClick={() => setHint(1)}
                              className="w-7 h-7 rounded-lg border border-border bg-card font-black text-foreground cursor-pointer"
                            >
                              ＋
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2B. 本出欠モード：登録メンバーごとの出欠 */}
          {event.mode === "rsvp" && (
            <div className="rounded-2xl border border-border overflow-hidden bg-card">
              <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-2 border-teal-500 flex items-center justify-between gap-2">
                <span className="text-xs font-black">
                  👨‍👩‍👧 登録メンバーの出欠
                </span>
                {memberEntries.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setMemberEntries((prev) =>
                          prev.map((m) => ({ ...m, status: "present" }))
                        )
                      }
                      className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black cursor-pointer"
                    >
                      全員出席
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMemberEntries((prev) =>
                          prev.map((m) => ({ ...m, status: "absent" }))
                        )
                      }
                      className="px-2 py-0.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-[10px] font-black cursor-pointer"
                    >
                      全員欠席
                    </button>
                  </div>
                )}
              </div>

              <div className="p-3 space-y-2.5">
                {memberEntries.map((member) => {
                  const key = `${member.entityType}:${member.entityId}`;
                  const setStatus = (st: SpecialEventAttendanceStatus) => {
                    setMemberEntries((prev) =>
                      prev.map((m) =>
                        `${m.entityType}:${m.entityId}` === key
                          ? { ...m, status: st }
                          : m
                      )
                    );
                  };

                  return (
                    <div
                      key={key}
                      className="p-2.5 rounded-xl border border-border bg-muted/20 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                          <span>{roleIcon(member.roleGroup)}</span>
                          <span>{member.name}</span>
                        </span>
                        <div className="flex items-center gap-1">
                          {(
                            [
                              {
                                id: "present" as const,
                                label: "出席",
                                active:
                                  "bg-emerald-600 text-white border-emerald-600",
                              },
                              {
                                id: "absent" as const,
                                label: "欠席",
                                active:
                                  "bg-slate-600 text-white border-slate-600",
                              },
                              {
                                id: "pending" as const,
                                label: "未定",
                                active:
                                  "bg-amber-500 text-white border-amber-500",
                              },
                            ] as const
                          ).map((btn) => (
                            <button
                              key={btn.id}
                              type="button"
                              onClick={() => setStatus(btn.id)}
                              className={cn(
                                "px-3 py-1.5 rounded-xl border text-[11px] font-black transition-all active:scale-95 cursor-pointer",
                                member.status === btn.id
                                  ? btn.active
                                  : "bg-card text-foreground border-border hover:bg-muted"
                              )}
                            >
                              {btn.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {member.status === "present" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 border-t border-border/60">
                          <LiffSelect
                            value={member.feeTierId}
                            onChange={(val) =>
                              setMemberEntries((prev) =>
                                prev.map((m) =>
                                  `${m.entityType}:${m.entityId}` === key
                                    ? { ...m, feeTierId: val }
                                    : m
                                )
                              )
                            }
                            options={companionTierOptions}
                            title={`${member.name} の参加区分`}
                            size="xs"
                          />
                          <input
                            type="text"
                            value={member.note || ""}
                            onChange={(e) =>
                              setMemberEntries((prev) =>
                                prev.map((m) =>
                                  `${m.entityType}:${m.entityId}` === key
                                    ? { ...m, note: e.target.value }
                                    : m
                                )
                              )
                            }
                            placeholder="個別メモ（任意：19時合流など）"
                            className="h-7 px-2 rounded-lg border border-border bg-card text-[11px] font-bold"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. 兄弟・その他の同伴家族セクション */}
          {event.mode === "rsvp" && event.allowCompanions && (
            <div className="rounded-2xl border border-border overflow-hidden bg-card">
              <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-2 border-teal-500 flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-black block">
                    🧒 兄弟・その他の同伴家族（名簿外）
                  </span>
                  <span className="text-[9.5px] font-bold text-slate-300 block">
                    ご兄弟・姉妹・幼児・祖父母など1名ずつ区分を選んで追加できます
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 text-[10px] font-black shrink-0">
                  同伴 {companions.length}名
                </span>
              </div>

              <div className="p-3 space-y-2.5">
                {liveCalculation.allMembersAbsent && companions.length > 0 && (
                  <div className="p-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    ※ 登録メンバー全員が「欠席」のため、保存時に同伴家族はリセットされます。同伴家族と参加される保護者・選手のいずれかを「出席」にしてください。
                  </div>
                )}

                {companions.map((comp, idx) => (
                  <div
                    key={comp.id}
                    className="p-3 rounded-xl border border-teal-500/35 bg-teal-500/5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-teal-600 text-white text-[10px] font-black">
                        同伴ご家族 #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCompanions((prev) =>
                            prev.filter((c) => c.id !== comp.id)
                          )
                        }
                        className="p-1 rounded-lg text-muted-foreground hover:text-red-600 cursor-pointer"
                        aria-label="同伴家族を削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* 続柄チップ */}
                    <div className="flex flex-wrap gap-1">
                      {COMPANION_RELATION_PRESETS.map((rel) => (
                        <button
                          key={rel}
                          type="button"
                          onClick={() =>
                            setCompanions((prev) =>
                              prev.map((c) =>
                                c.id === comp.id
                                  ? { ...c, relationLabel: rel }
                                  : c
                              )
                            )
                          }
                          className={cn(
                            "px-2 py-0.5 rounded-md border text-[10px] font-black cursor-pointer",
                            comp.relationLabel === rel
                              ? "bg-teal-600 text-white border-teal-600"
                              : "bg-card text-foreground border-border hover:bg-muted"
                          )}
                        >
                          {rel}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-muted-foreground block">
                          年齢・料理区分（会費連動）
                        </label>
                        <LiffSelect
                          value={comp.feeTierId}
                          onChange={(val) =>
                            setCompanions((prev) =>
                              prev.map((c) =>
                                c.id === comp.id ? { ...c, feeTierId: val } : c
                              )
                            )
                          }
                          options={companionTierOptions}
                          title="同伴家族の区分を選択"
                          accent="teal"
                          size="sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-muted-foreground block">
                          お名前（任意・席次や確認用）
                        </label>
                        <input
                          type="text"
                          value={comp.name}
                          onChange={(e) =>
                            setCompanions((prev) =>
                              prev.map((c) =>
                                c.id === comp.id
                                  ? { ...c, name: e.target.value }
                                  : c
                              )
                            )
                          }
                          placeholder="例：次郎 / 花子（空欄でもOK）"
                          className="w-full h-8.5 px-2.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground"
                        />
                      </div>
                    </div>

                    <input
                      type="text"
                      value={comp.dietaryNote || ""}
                      onChange={(e) =>
                        setCompanions((prev) =>
                          prev.map((c) =>
                            c.id === comp.id
                              ? { ...c, dietaryNote: e.target.value }
                              : c
                          )
                        )
                      }
                      placeholder="食事・アレルギー・座席の配慮メモ（任意：子どもイス希望など）"
                      className="w-full h-8 px-2.5 rounded-lg border border-border bg-card text-[11px] font-bold text-foreground"
                    />
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => handleAddCompanion()}
                  className="w-full py-2.5 rounded-xl border-2 border-dashed border-teal-500/45 bg-teal-500/5 hover:bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>＋ 兄弟・その他の同伴家族を1名追加</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. アンケート項目 */}
          {event.questions.length > 0 && (
            <div className="rounded-2xl border border-border overflow-hidden bg-card">
              <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-2 border-amber-500 flex items-center justify-between">
                <span className="text-xs font-black">
                  📋 アンケート（{event.questions.length}問）
                </span>
                {liveCalculation.allMembersAbsent && event.mode === "rsvp" && (
                  <span className="text-[10px] font-bold text-slate-300">
                    欠席時は回答省略可
                  </span>
                )}
              </div>

              <div className="p-3.5 space-y-4">
                {event.questions.map((q, qIdx) => {
                  const ans = surveyAnswers[q.id];

                  return (
                    <div key={q.id} className="space-y-2">
                      <div className="flex items-start gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-black shrink-0 mt-0.5">
                          Q{qIdx + 1}
                        </span>
                        <p className="text-xs font-black text-foreground leading-snug">
                          {q.title}
                          {q.required && (
                            <span className="ml-1.5 px-1.5 py-0.2 rounded bg-red-500/12 text-red-600 dark:text-red-400 text-[9.5px] font-black">
                              必須
                            </span>
                          )}
                        </p>
                      </div>

                      {q.type === "single" && (
                        <div className="grid grid-cols-1 gap-1.5">
                          {q.options.map((opt) => {
                            const selected = ans === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() =>
                                  setSurveyAnswers((prev) => ({
                                    ...prev,
                                    [q.id]: selected ? "" : opt,
                                  }))
                                }
                                className={cn(
                                  "p-2.5 rounded-xl border text-left text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer",
                                  selected
                                    ? "border-2 border-primary bg-primary/10 text-foreground font-black"
                                    : "border-border bg-card hover:bg-muted/50 text-foreground"
                                )}
                              >
                                <span>{opt}</span>
                                {selected && (
                                  <Check className="w-4 h-4 text-primary shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {q.type === "multiple" && (
                        <div className="grid grid-cols-1 gap-1.5">
                          {q.options.map((opt) => {
                            const currentArr = Array.isArray(ans) ? ans : [];
                            const checked = currentArr.includes(opt);
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => {
                                  const nextArr = checked
                                    ? currentArr.filter((x) => x !== opt)
                                    : [...currentArr, opt];
                                  setSurveyAnswers((prev) => ({
                                    ...prev,
                                    [q.id]: nextArr,
                                  }));
                                }}
                                className={cn(
                                  "p-2.5 rounded-xl border text-left text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer",
                                  checked
                                    ? "border-2 border-primary bg-primary/10 text-foreground font-black"
                                    : "border-border bg-card hover:bg-muted/50 text-foreground"
                                )}
                              >
                                <span>{opt}</span>
                                {checked && (
                                  <Check className="w-4 h-4 text-primary shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {q.type === "text" && (
                        <textarea
                          rows={2}
                          value={typeof ans === "string" ? ans : ""}
                          onChange={(e) =>
                            setSurveyAnswers((prev) => ({
                              ...prev,
                              [q.id]: e.target.value,
                            }))
                          }
                          placeholder={
                            q.placeholder || "こちらに入力してください"
                          }
                          className="w-full p-2.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground resize-none focus:outline-none focus:border-primary"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. 幹事への連絡メモ */}
          <div className="rounded-2xl border border-border bg-muted/25 p-3.5 space-y-2">
            <label className="text-xs font-black text-foreground block">
              💬 幹事へのひとこと・連絡メモ（任意）
            </label>
            <div className="flex flex-wrap gap-1.5">
              {RESPONSE_COMMENT_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() =>
                    setComment((prev) =>
                      prev.trim() ? `${prev.trim()} / ${chip}` : chip
                    )
                  }
                  className="px-2 py-0.5 rounded-full border border-border bg-card hover:bg-muted text-[10px] font-bold text-foreground cursor-pointer"
                >
                  ＋ {chip}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="遅刻・早退の予定やメッセージなど"
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground resize-none focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Sticky Live Summary & Save Footer */}
        <div className="px-4 pt-2.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card space-y-2 shrink-0">
          {event.mode === "rsvp" && (
            <div className="px-3 py-2 rounded-xl bg-[#0f172a] text-slate-50 flex items-center justify-between gap-2 text-xs">
              <div className="font-black">
                <span>参加人数: </span>
                <span className="text-teal-300 text-sm tabular-nums">
                  {liveCalculation.totalHeadcount}名
                </span>
                {liveCalculation.effectiveCompanions > 0 && (
                  <span className="text-[10px] font-bold text-slate-300 ml-1">
                    （登録{liveCalculation.presentMembers}＋同伴
                    {liveCalculation.effectiveCompanions}）
                  </span>
                )}
              </div>
              {event.useFeeCalculation && (
                <div className="font-black tabular-nums">
                  <span className="text-[10px] text-slate-300 mr-1">
                    世帯会費:
                  </span>
                  <span className="text-amber-300 text-sm">
                    {liveCalculation.totalFee.toLocaleString()}円
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-11 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-foreground cursor-pointer"
            >
              閉じる
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleSaveResponse()}
              className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>回答を保存する</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// 3. 幹事・全体向け：回答一覧 ＆ 集金チェック ＆ お店予約内訳 ＆ LINE共有/CSVモーダル
// ============================================================================
interface SpecialEventResponsesSummaryModalProps {
  isOpen: boolean;
  event: SpecialEventDetailItem | null;
  teamName: string;
  canEditResponses: boolean;
  onClose: () => void;
  onProxyEditHousehold: (householdKey: string) => void;
  onToggleFeePaid: (householdKey: string, nextPaid: boolean) => Promise<void>;
}

export function SpecialEventResponsesSummaryModal({
  isOpen,
  event,
  teamName,
  canEditResponses,
  onClose,
  onProxyEditHousehold,
  onToggleFeePaid,
}: SpecialEventResponsesSummaryModalProps) {
  const { liff, currentTeam } = useLiff();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "households" | "breakdown" | "share"
  >("households");
  const [hhFilter, setHhFilter] = useState<
    "all" | "attending" | "absent" | "unanswered"
  >("all");
  const [shareTemplateKind, setShareTemplateKind] = useState<
    "announce" | "summary"
  >("announce");
  const [includeUnansweredInText, setIncludeUnansweredInText] = useState(false);
  const [includeDetailsInSummary, setIncludeDetailsInSummary] = useState(true);
  const [shareTextDraft, setShareTextDraft] = useState("");
  const [isEditedManually, setIsEditedManually] = useState(false);
  const [isSendingLine, setIsSendingLine] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const generatedShareText = useMemo(() => {
    if (!event) return "";
    const pageUrl = buildShareableLiffPageUrl({
      pathname: `/liff/events?id=${encodeURIComponent(event.id)}`,
      teamId: currentTeam?.id || event.teamId,
    });
    if (shareTemplateKind === "announce") {
      return buildSpecialEventAnnouncementLineText({
        event,
        teamName,
        pageUrl,
        includeUnansweredList: includeUnansweredInText,
      });
    }
    return buildSpecialEventSummaryLineText({
      event,
      teamName,
      includeHouseholdDetails: includeDetailsInSummary,
    });
  }, [
    currentTeam?.id,
    event,
    includeDetailsInSummary,
    includeUnansweredInText,
    shareTemplateKind,
    teamName,
  ]);

  useEffect(() => {
    if (!isEditedManually) {
      setShareTextDraft(generatedShareText);
    }
  }, [generatedShareText, isEditedManually]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab("households");
    setHhFilter("all");
    setIsEditedManually(false);
  }, [isOpen, event?.id]);

  if (!mounted || !isOpen || !event) return null;

  const tierLabelById = new Map(event.feeTiers.map((t) => [t.id, t.label]));
  const questionTitleById = new Map(event.questions.map((q) => [q.id, q.title]));

  const filteredHouseholds = event.households.filter((hh) => {
    if (hhFilter === "attending") return hh.overallState === "attending";
    if (hhFilter === "absent") return hh.overallState === "absent";
    if (hhFilter === "unanswered") return !hh.hasResponded && !hh.isAllOnLeave;
    return true;
  });

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareTextDraft);
      toast.success("LINE連絡文をコピーしました！");
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  const handleSendViaLine = async () => {
    if (!shareTextDraft.trim() || isSendingLine) return;
    setIsSendingLine(true);
    try {
      const outcome = await sharePlainTextViaLine({
        text: shareTextDraft,
        liff,
      });
      if (outcome === "shared") {
        toast.success("LINEで送信しました！");
      }
    } finally {
      setIsSendingLine(false);
    }
  };

  const handleDownloadCsv = () => {
    const csv = buildSpecialEventCsvContent(event);
    const bom = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTitle = event.title.replace(/[\\/:*?"<>|]/g, "_");
    a.href = url;
    a.download = `${safeTitle}_出欠・集金一覧.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast.success("CSVファイルをダウンロードしました！");
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col">
        {/* A-3 Dark Cap */}
        <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <span className="text-[10px] font-black text-teal-300 block truncate">
              📊 幹事・集計ダッシュボード
            </span>
            <h2 className="text-sm font-black text-white truncate">
              {event.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3タブバー */}
        <div className="px-3 py-2 bg-muted/60 border-b border-border grid grid-cols-3 gap-1 shrink-0">
          {(
            [
              { id: "households" as const, label: "世帯一覧・集金" },
              { id: "breakdown" as const, label: "予約内訳・集計" },
              { id: "share" as const, label: "LINE共有・CSV" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "py-1.5 px-2 rounded-xl text-[11px] transition-all cursor-pointer",
                activeTab === tab.id
                  ? "bg-card text-foreground font-black border border-border shadow-xs"
                  : "text-muted-foreground font-bold hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3.5 bg-card">
          {activeTab === "households" && (
            <>
              {/* フィルタピル */}
              <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-muted border border-border">
                {(
                  [
                    {
                      id: "all" as const,
                      label: `全員(${event.households.length})`,
                    },
                    {
                      id: "attending" as const,
                      label: `出席(${event.summary.attendingHouseholdCount})`,
                    },
                    {
                      id: "absent" as const,
                      label: `欠席(${event.summary.absentHouseholdCount})`,
                    },
                    {
                      id: "unanswered" as const,
                      label: `未回答(${event.summary.unansweredHouseholdCount})`,
                    },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setHhFilter(f.id)}
                    className={cn(
                      "py-1.5 rounded-lg text-[10.5px] transition-all cursor-pointer",
                      hhFilter === f.id
                        ? "bg-card text-foreground font-black shadow-2xs border border-border"
                        : "text-muted-foreground font-bold"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* 世帯カード一覧 */}
              <div className="space-y-2.5">
                {filteredHouseholds.map((hh) => {
                  const presentNames = hh.memberEntries.filter(
                    (m) => m.status === "present"
                  );
                  const answeredEntries = Object.entries(hh.surveyAnswers);

                  return (
                    <div
                      key={hh.householdKey}
                      className="rounded-2xl border border-border bg-card p-3 space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-black text-foreground truncate">
                            {hh.householdLabel}
                          </span>
                          {!hh.hasResponded ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[10px] font-black shrink-0">
                              {hh.isAllOnLeave ? "⏸ 休部中" : "未回答"}
                            </span>
                          ) : hh.overallState === "attending" ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-black shrink-0">
                              {event.mode === "date_poll"
                                ? "回答済"
                                : `出席 計${hh.totalHeadcount}名`}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-500/12 text-slate-700 dark:text-slate-300 border border-slate-500/30 text-[10px] font-black shrink-0">
                              欠席
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {event.mode === "rsvp" &&
                            event.useFeeCalculation &&
                            hh.overallState === "attending" &&
                            hh.totalFeeAmount > 0 && (
                              <button
                                type="button"
                                disabled={
                                  !canEditResponses ||
                                  togglingKey === hh.householdKey
                                }
                                onClick={async () => {
                                  setTogglingKey(hh.householdKey);
                                  try {
                                    await onToggleFeePaid(
                                      hh.householdKey,
                                      !hh.feePaid
                                    );
                                  } finally {
                                    setTogglingKey(null);
                                  }
                                }}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg border text-[10px] font-black inline-flex items-center gap-1 transition-all cursor-pointer",
                                  hh.feePaid
                                    ? "bg-emerald-600 text-white border-emerald-600"
                                    : "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/25"
                                )}
                                title="タップで集金済/未集金を切り替え"
                              >
                                <Coins className="w-3 h-3" />
                                <span>
                                  {hh.totalFeeAmount.toLocaleString()}円{" "}
                                  {hh.feePaid ? "済" : "未集金"}
                                </span>
                              </button>
                            )}

                          {canEditResponses && (
                            <button
                              type="button"
                              onClick={() =>
                                onProxyEditHousehold(hh.householdKey)
                              }
                              className="px-2 py-1 rounded-lg border border-border bg-muted/40 hover:bg-muted text-[10px] font-black text-foreground inline-flex items-center gap-0.5 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>{hh.hasResponded ? "修正" : "代理入力"}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {event.mode === "rsvp" &&
                        hh.overallState === "attending" && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {presentNames.map((m) => (
                              <span
                                key={`${m.entityType}:${m.entityId}`}
                                className="px-2 py-0.5 rounded-md bg-muted border border-border text-[10.5px] font-bold text-foreground"
                              >
                                {m.name}
                                {m.note ? `（${m.note}）` : ""}
                              </span>
                            ))}
                            {hh.companions.map((c) => (
                              <span
                                key={c.id}
                                className="px-2 py-0.5 rounded-md bg-teal-500/12 text-teal-800 dark:text-teal-200 border border-teal-500/30 text-[10.5px] font-black"
                              >
                                ＋{c.relationLabel}
                                {c.name ? `: ${c.name}` : ""}
                                {" ["}
                                {tierLabelById.get(c.feeTierId) || "同伴"}
                                {"]"}
                                {c.dietaryNote ? ` ⚠️${c.dietaryNote}` : ""}
                              </span>
                            ))}
                          </div>
                        )}

                      {event.mode === "date_poll" && hh.dateVotes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {event.candidateDates.map((cand) => {
                            const v = hh.dateVotes.find(
                              (x) => x.candidateId === cand.id
                            );
                            if (!v) return null;
                            const mark =
                              v.vote === "ok"
                                ? "◯"
                                : v.vote === "maybe"
                                ? "△"
                                : "×";
                            return (
                              <span
                                key={cand.id}
                                className={cn(
                                  "px-2 py-0.5 rounded-md border text-[10px] font-black",
                                  v.vote === "ok"
                                    ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                    : v.vote === "maybe"
                                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35"
                                    : "bg-muted text-muted-foreground border-border"
                                )}
                              >
                                {formatDateKeyToJaLabel(cand.dateStr)} {mark}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {answeredEntries.length > 0 &&
                        hh.overallState !== "absent" && (
                          <div className="pt-1 border-t border-border/60 space-y-0.5 text-[10.5px]">
                            {answeredEntries.map(([qId, val]) => {
                              const qTitle = questionTitleById.get(qId);
                              if (!qTitle) return null;
                              const valStr = Array.isArray(val)
                                ? val.join(" / ")
                                : val;
                              if (!valStr) return null;
                              return (
                                <p
                                  key={qId}
                                  className="text-muted-foreground font-bold"
                                >
                                  <span className="text-foreground font-black">
                                    {qTitle}:{" "}
                                  </span>
                                  <span>{valStr}</span>
                                </p>
                              );
                            })}
                          </div>
                        )}

                      {hh.comment && (
                        <p className="text-[11px] font-bold text-foreground bg-muted/40 px-2.5 py-1.5 rounded-lg border border-border/60">
                          💬 {hh.comment}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === "breakdown" && (
            <div className="space-y-4">
              {/* 1. お店予約・会計サマリー */}
              {event.mode === "rsvp" && (
                <div className="rounded-2xl border border-border overflow-hidden bg-card">
                  <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-2 border-teal-500 flex items-center justify-between">
                    <span className="text-xs font-black">
                      🍽️ 会場予約用・区分別の人数内訳
                    </span>
                    <span className="text-xs font-black text-teal-300 tabular-nums">
                      総計 {event.summary.totalHeadcount}名
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {event.summary.tierTotals.map((t) => (
                      <div
                        key={t.tierId}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-black text-foreground truncate">
                            {t.label}
                          </p>
                          {t.companionCount > 0 && t.memberCount > 0 && (
                            <p className="text-[10px] font-bold text-muted-foreground">
                              登録 {t.memberCount}名 ＋ 同伴 {t.companionCount}名
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <span className="text-sm font-black text-foreground">
                            {t.totalCount}名
                          </span>
                          {event.useFeeCalculation && (
                            <span className="block text-[10px] font-bold text-muted-foreground">
                              @{t.unitAmount.toLocaleString()}円 ＝{" "}
                              {t.subtotalAmount.toLocaleString()}円
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {event.useFeeCalculation && (
                    <div className="p-3.5 bg-muted/35 border-t border-border space-y-2">
                      <div className="flex items-center justify-between text-xs font-black">
                        <span className="text-foreground">会費 集金進捗</span>
                        <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {event.summary.paidFeeTotal.toLocaleString()}円 /{" "}
                          {event.summary.expectedFeeTotal.toLocaleString()}円
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-muted border border-border overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 transition-all"
                          style={{
                            width: `${
                              event.summary.expectedFeeTotal > 0
                                ? Math.min(
                                    100,
                                    Math.round(
                                      (event.summary.paidFeeTotal /
                                        event.summary.expectedFeeTotal) *
                                        100
                                    )
                                  )
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2. アレルギー・個別配慮メモまとめ */}
              {event.summary.dietaryNotes.length > 0 && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3.5 space-y-2">
                  <h4 className="text-xs font-black text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>個別メモ・アレルギー・配慮事項まとめ</span>
                  </h4>
                  <div className="space-y-1.5">
                    {event.summary.dietaryNotes.map((dn, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-xl bg-card border border-border text-[11px] font-bold text-foreground"
                      >
                        <span className="font-black">
                          {dn.householdLabel}（{dn.personLabel}）:{" "}
                        </span>
                        <span>{dn.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. アンケート設問ごとの集計 */}
              {event.summary.questionSummaries.map((qs, idx) => (
                <div
                  key={qs.questionId}
                  className="rounded-2xl border border-border overflow-hidden bg-card"
                >
                  <div className="px-3.5 py-2 bg-muted/50 border-b border-border flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-[#0f172a] text-white text-[10px] font-black">
                      Q{idx + 1}
                    </span>
                    <span className="text-xs font-black text-foreground">
                      {qs.title}
                    </span>
                  </div>
                  <div className="p-3.5 space-y-2.5">
                    {qs.type === "text" ? (
                      qs.textAnswers.length === 0 ? (
                        <p className="text-xs font-bold text-muted-foreground">
                          まだ記述回答はありません
                        </p>
                      ) : (
                        qs.textAnswers.map((ta, tIdx) => (
                          <div
                            key={tIdx}
                            className="p-2.5 rounded-xl bg-muted/30 border border-border text-xs"
                          >
                            <span className="font-black text-foreground">
                              {ta.householdLabel}:{" "}
                            </span>
                            <span className="font-bold text-foreground/90">
                              {ta.text}
                            </span>
                          </div>
                        ))
                      )
                    ) : (
                      qs.optionCounts.map((oc) => (
                        <div key={oc.option} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-foreground">
                              {oc.option}
                            </span>
                            <span className="font-black text-primary tabular-nums">
                              {oc.count}件
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden border border-border/60">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${
                                  event.summary.respondedHouseholdCount > 0
                                    ? Math.min(
                                        100,
                                        Math.round(
                                          (oc.count /
                                            event.summary
                                              .respondedHouseholdCount) *
                                            100
                                        )
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                          {oc.householdLabels.length > 0 && (
                            <p className="text-[10px] font-bold text-muted-foreground">
                              {oc.householdLabels.join("、")}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "share" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted border border-border">
                <button
                  type="button"
                  onClick={() => {
                    setShareTemplateKind("announce");
                    setIsEditedManually(false);
                  }}
                  className={cn(
                    "py-2 rounded-lg text-[11px] cursor-pointer",
                    shareTemplateKind === "announce"
                      ? "bg-card text-foreground font-black border border-border shadow-2xs"
                      : "text-muted-foreground font-bold"
                  )}
                >
                  📢 募集・リマインド文
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShareTemplateKind("summary");
                    setIsEditedManually(false);
                  }}
                  className={cn(
                    "py-2 rounded-lg text-[11px] cursor-pointer",
                    shareTemplateKind === "summary"
                      ? "bg-card text-foreground font-black border border-border shadow-2xs"
                      : "text-muted-foreground font-bold"
                  )}
                >
                  📊 幹事・集計サマリー文
                </button>
              </div>

              {shareTemplateKind === "announce" ? (
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-muted/30 text-xs font-bold cursor-pointer">
                  <span>未回答の世帯名をリマインド記載する</span>
                  <input
                    type="checkbox"
                    checked={includeUnansweredInText}
                    onChange={(e) => {
                      setIncludeUnansweredInText(e.target.checked);
                      setIsEditedManually(false);
                    }}
                    className="w-4 h-4 accent-primary"
                  />
                </label>
              ) : (
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-muted/30 text-xs font-bold cursor-pointer">
                  <span>出席世帯ごとのメンバー・同伴内訳を含める</span>
                  <input
                    type="checkbox"
                    checked={includeDetailsInSummary}
                    onChange={(e) => {
                      setIncludeDetailsInSummary(e.target.checked);
                      setIsEditedManually(false);
                    }}
                    className="w-4 h-4 accent-primary"
                  />
                </label>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-foreground">
                    送信テキスト（自由に編集できます）
                  </span>
                  {isEditedManually && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditedManually(false);
                        setShareTextDraft(generatedShareText);
                      }}
                      className="text-[10.5px] font-black text-primary inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>初期文面に戻す</span>
                    </button>
                  )}
                </div>
                <textarea
                  rows={10}
                  value={shareTextDraft}
                  onChange={(e) => {
                    setShareTextDraft(e.target.value);
                    setIsEditedManually(true);
                  }}
                  className="w-full p-3 rounded-xl border border-border bg-muted/20 text-xs font-bold text-foreground leading-relaxed focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyText()}
                  className="h-10 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-foreground flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ClipboardCopy className="w-3.5 h-3.5" />
                  <span>文面をコピー</span>
                </button>
                <button
                  type="button"
                  disabled={isSendingLine}
                  onClick={() => void handleSendViaLine()}
                  className="h-10 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {isSendingLine ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>LINEで転送</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleDownloadCsv}
                className="w-full h-10 rounded-xl border border-border bg-muted/40 hover:bg-muted text-xs font-black text-foreground flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-teal-600" />
                <span>出欠・同伴・集金一覧をCSVダウンロード</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pt-2.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-10 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-foreground cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// 4. 候補日アンケート ➔ 開催日決定＆本出欠モード切替モーダル
// ============================================================================
interface FinalizeCandidateDateModalProps {
  isOpen: boolean;
  event: SpecialEventDetailItem | null;
  isSaving: boolean;
  onClose: () => void;
  onFinalize: (params: {
    eventDate: string;
    startTime: string;
    endTime: string;
    location: string;
    deadlineDate: string | null;
  }) => Promise<void>;
}

export function FinalizeCandidateDateModal({
  isOpen,
  event,
  isSaving,
  onClose,
  onFinalize,
}: FinalizeCandidateDateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedCandId, setSelectedCandId] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:30");
  const [location, setLocation] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !event) return;
    const topCand =
      event.summary.candidateSummaries.find((c) => c.isTopCandidate) ||
      event.summary.candidateSummaries[0];
    if (topCand) {
      setSelectedCandId(topCand.id);
      setStartTime(topCand.startTime || event.startTime || "18:00");
      setEndTime(topCand.endTime || event.endTime || "20:30");
    }
    setLocation(event.location || "");
    setDeadlineDate(event.deadlineDate || "");
  }, [event, isOpen]);

  if (!mounted || !isOpen || !event) return null;

  const candOptions: LiffSelectOption[] =
    event.summary.candidateSummaries.map((cs) => ({
      value: cs.id,
      label: `${cs.dateLabel} ${buildSpecialEventTimeRangeLabel(
        cs.startTime,
        cs.endTime
      )}`,
      sublabel: `◯ ${cs.okCount}世帯 / △ ${cs.maybeCount}世帯 / 予定計 約${cs.estimatedHeadcount}名`,
      badge: cs.isTopCandidate ? "👑 最多候補" : undefined,
      badgeTone: cs.isTopCandidate ? "amber" : "slate",
    }));

  const selectedCand = event.summary.candidateSummaries.find(
    (c) => c.id === selectedCandId
  );

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Crown className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-sm font-black text-white truncate">
              開催日を決定して本出欠へ切替
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3.5 bg-card">
          <p className="text-xs font-bold text-muted-foreground leading-relaxed">
            決定した候補日を選ぶと、チームカレンダーに自動反映され、家族・兄弟同伴の本出欠＆会費計算モードに切り替わります。
          </p>

          <div className="space-y-1">
            <label className="text-xs font-black text-foreground block">
              決定する開催日
            </label>
            <LiffSelect
              value={selectedCandId}
              onChange={(val) => {
                setSelectedCandId(val);
                const found = event.summary.candidateSummaries.find(
                  (c) => c.id === val
                );
                if (found) {
                  if (found.startTime) setStartTime(found.startTime);
                  if (found.endTime) setEndTime(found.endTime);
                }
              }}
              options={candOptions}
              title="決定する開催日を選択"
              accent="amber"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-black text-foreground block">
                開始時間
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-10 px-2.5 rounded-xl border border-border bg-card text-xs font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-black text-foreground block">
                終了時間
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full h-10 px-2.5 rounded-xl border border-border bg-card text-xs font-bold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-black text-foreground block">
              会場・お店名（決まっていれば入力）
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="例：居酒屋 〇〇 駅前店"
              className="w-full h-10 px-3 rounded-xl border border-border bg-card text-xs font-bold"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-black text-foreground block">
              本出欠の回答期限日（任意）
            </label>
            <input
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              className="w-full h-10 px-2.5 rounded-xl border border-border bg-card text-xs font-bold"
            />
          </div>
        </div>

        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-11 rounded-xl border border-border bg-card text-xs font-black text-foreground cursor-pointer"
          >
            戻る
          </button>
          <button
            type="button"
            disabled={!selectedCand || isSaving}
            onClick={() => {
              if (!selectedCand) return;
              void onFinalize({
                eventDate: selectedCand.dateStr,
                startTime,
                endTime,
                location: location.trim(),
                deadlineDate: deadlineDate || null,
              });
            }}
            className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>この日に決定して本出欠を開始</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
