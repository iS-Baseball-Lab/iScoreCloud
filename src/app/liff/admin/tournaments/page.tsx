// filepath: src/app/liff/admin/tournaments/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Calendar,
  Check,
  Clock,
  Edit2,
  ExternalLink,
  Flame,
  Loader2,
  Plus,
  Search,
  Snowflake,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import type {
  AdminTournamentItem,
  AdminTournamentsResponse,
} from "@/api/liff/admin-management";
import { AdminMgmtShell } from "@/components/liff/AdminMgmtShell";
import { useLiff } from "@/components/liff/LiffProvider";
import { LiffSelect } from "@/components/liff/LiffSelect";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";

const TOURNAMENT_CATEGORIES = [
  { value: "gakudou", label: "学童（小学生）" },
  { value: "chugaku", label: "中学（軟式・硬式）" },
  { value: "koukou", label: "高校野球" },
  { value: "shakaijin", label: "一般・社会人・草野球" },
  { value: "league", label: "通年リーグ・交流戦" },
  { value: "other", label: "その他" },
] as const;

export default function LiffAdminTournamentsPage() {
  const { currentTeam, profile } = useLiff();
  const teamId = currentTeam?.id || "demo-team";
  const endpointUrl = `/api/liff/admin/mgmt/tournaments?teamId=${encodeURIComponent(
    teamId
  )}`;

  const initialCached = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<AdminTournamentsResponse>(endpointUrl);
  }, [endpointUrl]);

  const [data, setData] = useState<AdminTournamentsResponse | null>(
    initialCached
  );
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [seasonFilter, setSeasonFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // 追加・編集モーダル
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [category, setCategory] = useState("gakudou");
  const [organizer, setOrganizer] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [coldGameRule, setColdGameRule] = useState("");
  const [tiebreakerRule, setTiebreakerRule] = useState("");
  const [bracketUrl, setBracketUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // 削除確認モーダル
  const [deletingItem, setDeletingItem] = useState<AdminTournamentItem | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const loadTournaments = useCallback(
    async (bypassCache = false) => {
      if (bypassCache) {
        setIsRefreshing(true);
      } else {
        const syncHit = peekLiffApiCache<AdminTournamentsResponse>(endpointUrl);
        if (syncHit) {
          setData(syncHit);
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }
      }

      try {
        const res = await fetch(
          endpointUrl,
          bypassCache
            ? { headers: { "x-iscore-bypass-cache": "1" } }
            : undefined
        );
        const json = (await res.json()) as AdminTournamentsResponse;
        if (res.ok && json.success) {
          setData(json);
        } else if (json.error) {
          toast.error(json.error);
        }
      } catch {
        toast.error("大会データの取得に失敗しました");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [endpointUrl]
  );

  useEffect(() => {
    void loadTournaments(false);
  }, [loadTournaments]);

  const seasonOptions = useMemo(() => {
    const years = new Set<string>();
    for (const t of data?.tournaments || []) {
      if (t.season) years.add(t.season);
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [data?.tournaments]);

  const openCreateModal = () => {
    setEditingId(null);
    setName("");
    setSeason(String(new Date().getFullYear()));
    setCategory(data?.teamCategory || "gakudou");
    setOrganizer("");
    setStartDate("");
    setEndDate("");
    setTimeLimit("1時間30分（新しいイニングに入らない）");
    setColdGameRule("3回10点・5回7点差");
    setTiebreakerRule("無死一・二塁 継続打順");
    setBracketUrl("");
    setIsModalOpen(true);
  };

  const openEditModal = (item: AdminTournamentItem) => {
    setEditingId(item.id);
    setName(item.name);
    setSeason(item.season || String(new Date().getFullYear()));
    setCategory(item.category || "gakudou");
    setOrganizer(item.organizer || "");
    setStartDate(item.startDate || "");
    setEndDate(item.endDate || "");
    setTimeLimit(item.timeLimit || "");
    setColdGameRule(item.coldGameRule || "");
    setTiebreakerRule(item.tiebreakerRule || "");
    setBracketUrl(item.bracketUrl || "");
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("大会・リーグ戦名を入力してください");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/liff/admin/mgmt/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          teamId,
          userId: profile?.userId || undefined,
          name: name.trim(),
          season: season.trim(),
          category,
          organizer: organizer.trim(),
          startDate: startDate.trim(),
          endDate: endDate.trim(),
          timeLimit: timeLimit.trim(),
          coldGameRule: coldGameRule.trim(),
          tiebreakerRule: tiebreakerRule.trim(),
          bracketUrl: bracketUrl.trim(),
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "保存に失敗しました");
        return;
      }

      setIsModalOpen(false);
      invalidateLiffApiCache();
      await loadTournaments(true);
      toast.success(json.message || "大会マスタを保存しました！");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      const qs = new URLSearchParams({ teamId });
      if (profile?.userId) qs.set("userId", profile.userId);
      const res = await fetch(
        `/api/liff/admin/mgmt/tournaments/${encodeURIComponent(
          deletingItem.id
        )}?${qs.toString()}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "削除に失敗しました");
        return;
      }

      setDeletingItem(null);
      invalidateLiffApiCache();
      await loadTournaments(true);
      toast.success(json.message || "大会を削除しました");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (data?.tournaments || []).filter((t) => {
      if (seasonFilter !== "all" && t.season !== seasonFilter) return false;
      if (!q) return true;
      return `${t.name} ${t.organizer} ${t.season}`.toLowerCase().includes(q);
    });
  }, [data?.tournaments, seasonFilter, searchQuery]);

  const canManage = data ? data.canManage : true;

  return (
    <AdminMgmtShell
      title="大会・リーグ管理"
      subtitle="公式戦・交流リーグのマスタ・大会規定の事前設定"
      icon={
        <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center font-black">
          <Trophy className="w-4 h-4" />
        </span>
      }
      isLoading={isLoading}
      hasData={Boolean(data)}
      canManage={canManage}
      isDemo={data?.isDemo}
      onRefresh={() => void loadTournaments(true)}
      isRefreshing={isRefreshing}
      headerRight={
        <button
          type="button"
          onClick={openCreateModal}
          className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center gap-1 cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>大会登録</span>
        </button>
      }
    >
      {/* フィルタバー */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setSeasonFilter("all")}
            className={`h-8 px-3 rounded-xl border text-xs shrink-0 cursor-pointer ${
              seasonFilter === "all"
                ? "bg-[#0f172a] text-white border-[#0f172a] font-black"
                : "bg-card text-foreground border-border font-bold"
            }`}
          >
            全シーズン ({data?.tournaments.length || 0})
          </button>
          {seasonOptions.map((yr) => (
            <button
              key={yr}
              type="button"
              onClick={() => setSeasonFilter(yr)}
              className={`h-8 px-3 rounded-xl border text-xs shrink-0 tabular-nums cursor-pointer ${
                seasonFilter === yr
                  ? "bg-[#0f172a] text-white border-[#0f172a] font-black"
                  : "bg-card text-foreground border-border font-bold"
              }`}
            >
              {yr}年
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="大会名・主催団体で検索..."
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-border bg-card text-foreground text-xs font-bold"
          />
        </div>
      </div>

      {/* 大会カード一覧 */}
      {filteredItems.length === 0 ? (
        <div className="p-8 rounded-2xl border border-border bg-card text-center space-y-2">
          <p className="text-xs font-black text-foreground">
            登録されている大会・リーグ戦がありません
          </p>
          <p className="text-[11px] font-bold text-muted-foreground">
            大会名や時間制限・コールド・タイブレーク規定を登録しておくと、試合作成や戦績集計がスムーズになります。
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item) => (
            <section
              key={item.id}
              className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black tabular-nums shrink-0">
                    {item.season}
                  </span>
                  <h3 className="text-xs sm:text-sm font-black text-white truncate">
                    {item.name}
                  </h3>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px] font-black tabular-nums">
                    試合 {item.teamMatchCount}件
                  </span>
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={item.otherTeamMatchCount > 0}
                    onClick={() => setDeletingItem(item)}
                    title={
                      item.otherTeamMatchCount > 0
                        ? "他チームの試合でも参照されている共通大会のため削除できません"
                        : "大会を削除"
                    }
                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer disabled:opacity-35 disabled:pointer-events-none transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-3.5 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-muted-foreground">
                  <span>主催: {item.organizer || "未設定"}</span>
                  {(item.startDate || item.endDate) && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Calendar className="w-3 h-3 text-teal-600" />
                      {item.startDate || "—"} 〜 {item.endDate || "—"}
                    </span>
                  )}
                </div>

                {/* 大会規定チップ */}
                <div className="flex flex-wrap gap-1.5">
                  {item.timeLimit && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted border border-border text-[11px] font-bold text-foreground">
                      <Clock className="w-3 h-3 text-primary" />
                      {item.timeLimit}
                    </span>
                  )}
                  {item.coldGameRule && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted border border-border text-[11px] font-bold text-foreground">
                      <Snowflake className="w-3 h-3 text-sky-600" />
                      {item.coldGameRule}
                    </span>
                  )}
                  {item.tiebreakerRule && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted border border-border text-[11px] font-bold text-foreground">
                      <Flame className="w-3 h-3 text-amber-600" />
                      {item.tiebreakerRule}
                    </span>
                  )}
                </div>

                {item.bracketUrl && (
                  <div className="pt-1">
                    <a
                      href={item.bracketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-black text-primary hover:underline"
                    >
                      <span>大会トーナメント表・公式サイトを開く</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ==================== モーダル: 大会追加・編集 ==================== */}
      {isModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-black text-white">
                    {editingId ? "大会・リーグ情報の編集" : "新しい大会・リーグを登録"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto text-xs">
                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-foreground">
                    大会・リーグ戦名称（必須）
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例: 春季市民少年軟式野球大会"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>

                <div className="grid grid-cols-12 gap-2.5">
                  <div className="col-span-4 space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      開催年度
                    </label>
                    <input
                      type="text"
                      value={season}
                      onChange={(e) => setSeason(e.target.value)}
                      placeholder="2026"
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold tabular-nums"
                    />
                  </div>
                  <div className="col-span-8 space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      大会区分
                    </label>
                    <LiffSelect
                      value={category}
                      onChange={(val) => setCategory(val)}
                      options={TOURNAMENT_CATEGORIES}
                      title="大会区分を選択"
                      accent="amber"
                      size="md"
                      className="w-full bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    主催連盟・運営団体（任意）
                  </label>
                  <input
                    type="text"
                    value={organizer}
                    onChange={(e) => setOrganizer(e.target.value)}
                    placeholder="例: 市野球連盟学童部"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      開幕日（任意）
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full h-10 px-2.5 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      最終日（任意）
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full h-10 px-2.5 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    ⏱ 時間制限規定（任意）
                  </label>
                  <input
                    type="text"
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(e.target.value)}
                    placeholder="例: 6回または1時間30分（新しいイニングに入らない）"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    ❄️ コールドゲーム規定（任意）
                  </label>
                  <input
                    type="text"
                    value={coldGameRule}
                    onChange={(e) => setColdGameRule(e.target.value)}
                    placeholder="例: 3回10点・4回8点・5回7点差"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    🔥 タイブレーク規定（任意）
                  </label>
                  <input
                    type="text"
                    value={tiebreakerRule}
                    onChange={(e) => setTiebreakerRule(e.target.value)}
                    placeholder="例: 7回裏終了同点時 無死一・二塁 継続打順"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    公式トーナメント表・大会要項URL（任意）
                  </label>
                  <input
                    type="url"
                    value={bracketUrl}
                    onChange={(e) => setBracketUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void handleSave()}
                  className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>保存する</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ==================== モーダル: 削除確認 ==================== */}
      {deletingItem &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setDeletingItem(null)}
          >
            <div
              className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 flex items-center justify-between">
                <h3 className="text-sm font-black text-white">大会の削除確認</h3>
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-1.5 text-xs">
                <p className="font-black text-foreground">
                  「{deletingItem.name}」を削除しますか？
                </p>
                <p className="text-[11px] font-bold text-muted-foreground">
                  紐付いている自チームの試合データ自体は消えず、大会未設定の状態に切り替わります。
                </p>
              </div>
              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void handleDelete()}
                  className="h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>削除する</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </AdminMgmtShell>
  );
}
