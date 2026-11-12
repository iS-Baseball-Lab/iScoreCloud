// filepath: src/app/liff/admin/family/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Link2,
  Loader2,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import type {
  AdminFamilyRelationItem,
  AdminFamilyResponse,
} from "@/api/liff/admin-management";
import { AdminMgmtShell } from "@/components/liff/AdminMgmtShell";
import { useLiff } from "@/components/liff/LiffProvider";
import { LiffSelect } from "@/components/liff/LiffSelect";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";

export default function LiffAdminFamilyPage() {
  const { currentTeam, profile } = useLiff();
  const teamId = currentTeam?.id || "demo-team";
  const endpointUrl = `/api/liff/admin/mgmt/family?teamId=${encodeURIComponent(
    teamId
  )}`;

  const initialCached = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<AdminFamilyResponse>(endpointUrl);
  }, [endpointUrl]);

  const [data, setData] = useState<AdminFamilyResponse | null>(initialCached);
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState<"relations" | "duty">("relations");
  const [searchQuery, setSearchQuery] = useState("");

  // 親子・兄弟紐付け追加モーダル
  const [isRelationModalOpen, setIsRelationModalOpen] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState("");
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [isSavingRelation, setIsSavingRelation] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  // 当番班一括割当 state
  const [dutyDraft, setDutyDraft] = useState<Record<string, string>>({});
  const [customGroupInput, setCustomGroupInput] = useState("");
  const [extraDutyLabels, setExtraDutyLabels] = useState<string[]>([]);
  const [isSavingDuty, setIsSavingDuty] = useState(false);

  const syncDutyDraft = useCallback((res: AdminFamilyResponse) => {
    const next: Record<string, string> = {};
    for (const m of res.adultMembers || []) {
      next[m.memberId] = m.subLabel || "";
    }
    setDutyDraft(next);
  }, []);

  useEffect(() => {
    if (initialCached) {
      syncDutyDraft(initialCached);
    }
  }, [initialCached, syncDutyDraft]);

  const loadFamilyData = useCallback(
    async (bypassCache = false) => {
      if (bypassCache) {
        setIsRefreshing(true);
      } else {
        const syncHit = peekLiffApiCache<AdminFamilyResponse>(endpointUrl);
        if (syncHit) {
          setData(syncHit);
          syncDutyDraft(syncHit);
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
        const json = (await res.json()) as AdminFamilyResponse;
        if (res.ok && json.success) {
          setData(json);
          syncDutyDraft(json);
        } else if (json.error) {
          toast.error(json.error);
        }
      } catch {
        toast.error("家族・当番データの取得に失敗しました");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [endpointUrl, syncDutyDraft]
  );

  useEffect(() => {
    void loadFamilyData(false);
  }, [loadFamilyData]);

  // 選手ごとの紐付け保護者一覧
  const relationsByChildId = useMemo(() => {
    const map = new Map<string, AdminFamilyRelationItem[]>();
    for (const rel of data?.relations || []) {
      const list = map.get(rel.childId) || [];
      list.push(rel);
      map.set(rel.childId, list);
    }
    return map;
  }, [data?.relations]);

  const unlinkedPlayers = useMemo(() => {
    return (data?.players || []).filter(
      (p) =>
        p.conditionStatus !== "graduated" &&
        !(relationsByChildId.get(p.id)?.length)
    );
  }, [data?.players, relationsByChildId]);

  const openRelationModalForPlayer = (preselectPlayerId?: string) => {
    const firstParent = data?.adultMembers[0]?.memberId || "";
    setSelectedParentId(firstParent);
    setSelectedChildIds(preselectPlayerId ? [preselectPlayerId] : []);
    setIsRelationModalOpen(true);
  };

  const toggleChildSelection = (childId: string) => {
    setSelectedChildIds((prev) =>
      prev.includes(childId)
        ? prev.filter((id) => id !== childId)
        : [...prev, childId]
    );
  };

  const handleSaveRelations = async () => {
    if (!selectedParentId) {
      toast.error("紐付ける保護者・メンバーを選択してください");
      return;
    }
    if (selectedChildIds.length === 0) {
      toast.error("紐付ける選手を1名以上チェックしてください");
      return;
    }

    setIsSavingRelation(true);
    try {
      const res = await fetch("/api/liff/admin/mgmt/family/relation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId: profile?.userId || undefined,
          parentId: selectedParentId,
          childIds: selectedChildIds,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "紐付けに失敗しました");
        return;
      }

      setIsRelationModalOpen(false);
      invalidateLiffApiCache();
      await loadFamilyData(true);
      toast.success(json.message || "親子紐付けを保存しました！");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSavingRelation(false);
    }
  };

  const handleUnlinkRelation = async (relationId: string) => {
    setUnlinkingId(relationId);
    try {
      const qs = new URLSearchParams({ teamId });
      if (profile?.userId) qs.set("userId", profile.userId);
      const res = await fetch(
        `/api/liff/admin/mgmt/family/relation/${encodeURIComponent(
          relationId
        )}?${qs.toString()}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "解除に失敗しました");
        return;
      }

      invalidateLiffApiCache();
      await loadFamilyData(true);
      toast.success(json.message || "紐付けを解除しました");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setUnlinkingId(null);
    }
  };

  const allDutyLabels = useMemo(() => {
    const base = data?.presetDutyLabels || [
      "1班",
      "2班",
      "3班",
      "4班",
      "5班",
      "6班",
      "配車",
      "審判",
    ];
    return Array.from(new Set([...base, ...extraDutyLabels]));
  }, [data?.presetDutyLabels, extraDutyLabels]);

  const dutyGroupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of data?.adultMembers || []) {
      const label = (dutyDraft[m.memberId] || "").trim() || "未割当";
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return Array.from(counts.entries());
  }, [data?.adultMembers, dutyDraft]);

  const hasDutyChanges = useMemo(() => {
    for (const m of data?.adultMembers || []) {
      if ((dutyDraft[m.memberId] || "") !== (m.subLabel || "")) {
        return true;
      }
    }
    return false;
  }, [data?.adultMembers, dutyDraft]);

  const handleAddCustomDutyLabel = () => {
    const clean = customGroupInput.trim();
    if (!clean) return;
    if (!extraDutyLabels.includes(clean)) {
      setExtraDutyLabels((prev) => [...prev, clean]);
    }
    setCustomGroupInput("");
    toast.success(`班ラベル「${clean}」を選択肢に追加しました`);
  };

  const handleSaveDutyBatch = async () => {
    setIsSavingDuty(true);
    try {
      const assignments = (data?.adultMembers || []).map((m) => ({
        memberId: m.memberId,
        subLabel: (dutyDraft[m.memberId] || "").trim(),
      }));
      const res = await fetch("/api/liff/admin/mgmt/family/duty-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId: profile?.userId || undefined,
          assignments,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "当番班の保存に失敗しました");
        return;
      }

      invalidateLiffApiCache();
      await loadFamilyData(true);
      toast.success(json.message || "当番班の割当を一括保存しました！");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSavingDuty(false);
    }
  };

  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (data?.players || []).filter((p) => {
      if (!q) return true;
      const linkedNames = (relationsByChildId.get(p.id) || [])
        .map((r) => r.parentName)
        .join(" ");
      return `${p.uniformNumber} ${p.name} ${linkedNames}`
        .toLowerCase()
        .includes(q);
    });
  }, [data?.players, relationsByChildId, searchQuery]);

  const filteredAdults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (data?.adultMembers || []).filter((m) => {
      if (!q) return true;
      const curLabel = dutyDraft[m.memberId] || "";
      return `${m.name} ${curLabel}`.toLowerCase().includes(q);
    });
  }, [data?.adultMembers, dutyDraft, searchQuery]);

  const canManage = data ? data.canManage : true;

  return (
    <AdminMgmtShell
      title="家族・当番班管理"
      subtitle="親子・兄弟の紐付け確認・当番班の一括編成"
      icon={
        <span className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-black">
          <Users className="w-4 h-4" />
        </span>
      }
      isLoading={isLoading}
      hasData={Boolean(data)}
      canManage={canManage}
      isDemo={data?.isDemo}
      onRefresh={() => void loadFamilyData(true)}
      isRefreshing={isRefreshing}
    >
      {/* メインタブ */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-card border border-border shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab("relations")}
          className={`h-9 rounded-xl text-xs cursor-pointer transition-colors ${
            activeTab === "relations"
              ? "bg-[#0f172a] text-white font-black"
              : "text-muted-foreground font-bold hover:text-foreground"
          }`}
        >
          親子・兄弟紐付け ({data?.relations.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("duty")}
          className={`h-9 rounded-xl text-xs cursor-pointer transition-colors ${
            activeTab === "duty"
              ? "bg-[#0f172a] text-white font-black"
              : "text-muted-foreground font-bold hover:text-foreground"
          }`}
        >
          当番班の一括割当 ({data?.adultMembers.length || 0})
        </button>
      </div>

      {/* 共通検索 */}
      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            activeTab === "relations"
              ? "選手名・背番号・保護者名で検索..."
              : "保護者・メンバー名・班名で検索..."
          }
          className="w-full h-9 pl-9 pr-3 rounded-xl border border-border bg-card text-foreground text-xs font-bold"
        />
      </div>

      {activeTab === "relations" ? (
        <div className="space-y-3">
          {/* 未紐付け選手のアラートカード */}
          {unlinkedPlayers.length > 0 ? (
            <section className="rounded-2xl border border-amber-500/40 bg-card shadow-xs overflow-hidden">
              <div className="px-3.5 py-2 bg-[#0f172a] text-white border-b-[3px] border-amber-500 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-black">
                    保護者未紐付けの選手が {unlinkedPlayers.length}名 います
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openRelationModalForPlayer(unlinkedPlayers[0]?.id)}
                  className="px-2.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[11px] font-black cursor-pointer"
                >
                  ＋ 紐付ける
                </button>
              </div>
              <div className="p-3 space-y-2">
                <p className="text-[11px] font-bold text-muted-foreground">
                  親子紐付けを設定すると、保護者がLINEから家族全員分の出欠・車出しを一括回答できるようになります。
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unlinkedPlayers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openRelationModalForPlayer(p.id)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/12 border border-amber-500/35 text-amber-900 dark:text-amber-200 text-xs font-black inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>
                        {p.uniformNumber ? `#${p.uniformNumber} ` : ""}
                        {p.name}
                      </span>
                      <Plus className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <div className="px-3.5 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/12 text-emerald-800 dark:text-emerald-200 text-xs font-black flex items-center justify-between gap-2">
              <span>✓ 全在籍選手に保護者が紐付けされています</span>
              <button
                type="button"
                onClick={() => openRelationModalForPlayer()}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-black cursor-pointer"
              >
                ＋ 追加紐付け
              </button>
            </div>
          )}

          {/* 選手ごとの親子マップ一覧 */}
          <div className="space-y-2">
            {filteredPlayers.map((player) => {
              const rels = relationsByChildId.get(player.id) || [];
              return (
                <div
                  key={player.id}
                  className="p-3.5 rounded-2xl border border-border bg-card shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-2 py-0.5 rounded-md bg-[#0f172a] text-white text-xs font-black tabular-nums shrink-0">
                        {player.uniformNumber ? `#${player.uniformNumber}` : "—"}
                      </span>
                      <span className="text-xs sm:text-sm font-black text-foreground truncate">
                        {player.name}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => openRelationModalForPlayer(player.id)}
                      className="h-7 px-2.5 rounded-lg bg-muted hover:bg-muted/80 border border-border text-foreground text-[11px] font-black flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Link2 className="w-3 h-3 text-teal-600" />
                      <span>保護者を追加</span>
                    </button>
                  </div>

                  {rels.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {rels.map((r) => (
                        <span
                          key={r.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/12 border border-teal-500/30 text-teal-900 dark:text-teal-200 text-xs font-black"
                        >
                          <span>{r.parentName}</span>
                          {r.parentSubLabel && (
                            <span className="px-1.5 py-0.2 rounded bg-card text-[10px] font-bold text-muted-foreground border border-border">
                              {r.parentSubLabel}
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={unlinkingId === r.id}
                            onClick={() => void handleUnlinkRelation(r.id)}
                            title="紐付けを解除"
                            className="w-4 h-4 rounded-full hover:bg-rose-500 hover:text-white flex items-center justify-center cursor-pointer"
                          >
                            {unlinkingId === r.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <X className="w-3 h-3" />
                            )}
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      未設定（上の「保護者を追加」から父・母などを紐付けてください）
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 班ごとの人数集計サマリー ＆ カスタム班追加 */}
          <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
              <span className="text-xs font-black text-white">
                当番班の人数バランス ＆ 班ラベル追加
              </span>
              {hasDutyChanges && (
                <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black">
                  未保存の変更あり
                </span>
              )}
            </div>

            <div className="p-3.5 space-y-3 text-xs">
              <div className="flex flex-wrap gap-1.5">
                {dutyGroupCounts.map(([label, cnt]) => (
                  <span
                    key={label}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-black tabular-nums ${
                      label === "未割当"
                        ? "bg-muted text-muted-foreground border-border"
                        : "bg-teal-500/12 text-teal-800 dark:text-teal-200 border-teal-500/30"
                    }`}
                  >
                    {label}: {cnt}名
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customGroupInput}
                  onChange={(e) => setCustomGroupInput(e.target.value)}
                  placeholder="任意の班・係を追加（例: 7班 / アナウンス班）"
                  maxLength={14}
                  className="flex-1 h-9 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                />
                <button
                  type="button"
                  onClick={handleAddCustomDutyLabel}
                  className="h-9 px-3 rounded-xl bg-muted hover:bg-muted/80 border border-border text-foreground text-xs font-black shrink-0 cursor-pointer"
                >
                  ＋ 選択肢追加
                </button>
              </div>
            </div>
          </section>

          {/* 各メンバーのワンタップ班割当リスト */}
          <div className="space-y-2">
            {filteredAdults.map((m) => {
              const currentVal = dutyDraft[m.memberId] || "";
              return (
                <div
                  key={m.memberId}
                  className="p-3 rounded-2xl border border-border bg-card shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-black text-foreground">
                      {m.name}
                    </span>
                    <span className="text-[11px] font-black text-teal-700 dark:text-teal-400">
                      {currentVal || "未割当"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setDutyDraft((prev) => ({ ...prev, [m.memberId]: "" }))
                      }
                      className={`px-2.5 py-1 rounded-lg border text-[11px] shrink-0 cursor-pointer ${
                        !currentVal
                          ? "bg-[#0f172a] text-white border-[#0f172a] font-black"
                          : "bg-background text-muted-foreground border-border font-bold"
                      }`}
                    >
                      なし
                    </button>
                    {allDutyLabels.map((lbl) => (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() =>
                          setDutyDraft((prev) => ({
                            ...prev,
                            [m.memberId]: lbl,
                          }))
                        }
                        className={`px-2.5 py-1 rounded-lg border text-[11px] shrink-0 cursor-pointer ${
                          currentVal === lbl
                            ? "bg-teal-600 text-white border-teal-600 font-black"
                            : "bg-background text-foreground border-border font-bold hover:bg-muted"
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={isSavingDuty}
            onClick={() => void handleSaveDutyBatch()}
            className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
          >
            {isSavingDuty ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>当番班の割当を一括保存する</span>
          </button>
        </div>
      )}

      {/* ==================== モーダル: 親子・兄弟紐付け登録 ==================== */}
      {isRelationModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsRelationModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-teal-400" />
                  <h3 className="text-sm font-black text-white">
                    親子・兄弟の紐付け登録
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRelationModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3.5 overflow-y-auto text-xs">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-foreground">
                    1. 保護者（または指導者兼任の親）を選択
                  </label>
                  <LiffSelect
                    value={selectedParentId}
                    onChange={(val) => setSelectedParentId(val)}
                    options={(data?.adultMembers || []).map((m) => ({
                      value: m.memberId,
                      label: m.name,
                      badge: m.subLabel || undefined,
                      badgeTone: "teal" as const,
                    }))}
                    title="保護者を選択"
                    accent="teal"
                    size="md"
                    searchable={true}
                    className="w-full bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-foreground">
                    2. お子様（選手）を選択（兄弟は複数チェック可）
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-0.5">
                    {(data?.players || []).map((p) => {
                      const checked = selectedChildIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleChildSelection(p.id)}
                          className={`px-2.5 py-2 rounded-xl border text-left flex items-center justify-between gap-1 cursor-pointer transition-colors ${
                            checked
                              ? "bg-teal-600 text-white border-teal-600 font-black"
                              : "bg-background text-foreground border-border hover:bg-muted font-bold"
                          }`}
                        >
                          <span className="truncate">
                            {p.uniformNumber ? `#${p.uniformNumber} ` : ""}
                            {p.name}
                          </span>
                          {checked && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsRelationModalOpen(false)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSavingRelation}
                  onClick={() => void handleSaveRelations()}
                  className="h-10 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingRelation ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>紐付けを保存</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </AdminMgmtShell>
  );
}
