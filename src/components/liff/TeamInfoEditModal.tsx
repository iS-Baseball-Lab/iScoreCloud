// filepath: src/components/liff/TeamInfoEditModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import {
  Award,
  Building2,
  Check,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { LiffSelect, type LiffSelectOption } from "@/components/liff/LiffSelect";
import {
  HONOR_RESULT_PRESETS,
  inferHonorBadgeTone,
  TEAM_CATEGORY_OPTIONS,
  type HonorBadgeTone,
  type OrganizationProfileDetails,
  type TeamHonorItem,
  type TeamInfoResponse,
  type TeamInfoUpdateRequest,
} from "@/lib/liff/team-profile-schema";
import { cn } from "@/lib/utils";

export type TeamInfoEditTab = "overview" | "structure" | "honors";

interface TeamInfoEditModalProps {
  isOpen: boolean;
  initialTab?: TeamInfoEditTab;
  teamId: string;
  info: TeamInfoResponse;
  onClose: () => void;
  onSaved: (updatedDraft: TeamInfoUpdateRequest) => void;
}

const BADGE_TONE_OPTIONS: readonly LiffSelectOption[] = [
  { value: "gold", label: "ゴールド（優勝・制覇）", badge: "金", badgeTone: "amber" },
  { value: "silver", label: "シルバー（準優勝）", badge: "銀", badgeTone: "slate" },
  { value: "bronze", label: "ブロンズ（第3位・ベスト4）", badge: "銅", badgeTone: "rose" },
  { value: "blue", label: "ブルー（上部大会出場・敢闘賞）", badge: "青", badgeTone: "primary" },
];

export function TeamInfoEditModal({
  isOpen,
  initialTab = "overview",
  teamId,
  info,
  onClose,
  onSaved,
}: TeamInfoEditModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TeamInfoEditTab>(initialTab);
  const [isSaving, setIsSaving] = useState(false);

  // タブ1: 基本・方針
  const [orgName, setOrgName] = useState("");
  const [orgShortName, setOrgShortName] = useState("");
  const [category, setCategory] = useState("gakudou");
  const [foundedYearText, setFoundedYearText] = useState("");
  const [slogan, setSlogan] = useState("");
  const [description, setDescription] = useState("");
  const [philosophy, setPhilosophy] = useState("");
  const [activityArea, setActivityArea] = useState("");
  const [activityDays, setActivityDays] = useState("");

  // タブ2: 体制・拠点・連盟
  const [representativeName, setRepresentativeName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [captainId, setCaptainId] = useState("__none__");
  const [homeGround, setHomeGround] = useState("");
  const [affiliatedLeagues, setAffiliatedLeagues] = useState<string[]>([]);
  const [leagueInput, setLeagueInput] = useState("");

  // タブ3: 主な戦績・入賞歴
  const [honors, setHonors] = useState<TeamHonorItem[]>([]);
  const [newHonorYear, setNewHonorYear] = useState(
    String(new Date().getFullYear())
  );
  const [newHonorTournament, setNewHonorTournament] = useState("");
  const [newHonorResult, setNewHonorResult] = useState("優勝");
  const [newHonorTone, setNewHonorTone] = useState<HonorBadgeTone>("gold");
  const [newHonorSquad, setNewHonorSquad] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setOrgName(info.organization.name || "");
    setOrgShortName(info.organization.shortName || "");
    setCategory(info.organization.category || "other");
    setFoundedYearText(
      info.organization.foundedYear
        ? String(info.organization.foundedYear)
        : ""
    );
    setSlogan(info.organization.profile.slogan || "");
    setDescription(info.organization.description || "");
    setPhilosophy(info.organization.profile.philosophy || "");
    setActivityArea(info.organization.profile.activityArea || "");
    setActivityDays(info.organization.profile.activityDays || "");

    setRepresentativeName(
      info.organization.profile.representativeName || ""
    );
    setManagerName(info.currentSquad.managerName || "");
    setCaptainId(info.currentSquad.captainId || "__none__");
    setHomeGround(info.currentSquad.homeGround || "");
    setAffiliatedLeagues([...info.organization.profile.affiliatedLeagues]);
    setLeagueInput("");

    setHonors(info.organization.profile.honors.map((h) => ({ ...h })));
    setNewHonorYear(String(info.currentSquad.year || new Date().getFullYear()));
    setNewHonorTournament("");
    setNewHonorResult("優勝");
    setNewHonorTone("gold");
    setNewHonorSquad("");
  }, [info, initialTab, isOpen]);

  const categorySelectOptions = useMemo<LiffSelectOption[]>(
    () =>
      TEAM_CATEGORY_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    []
  );

  const captainSelectOptions = useMemo<LiffSelectOption[]>(() => {
    const base: LiffSelectOption[] = [
      { value: "__none__", label: "未設定（主将なし）" },
    ];
    for (const p of info.playerOptions) {
      const numLabel = p.uniformNumber ? `#${p.uniformNumber} ` : "背番号なし ";
      base.push({
        value: p.id,
        label: `${numLabel}${p.name}`,
      });
    }
    return base;
  }, [info.playerOptions]);

  const handleAddLeague = () => {
    const cleaned = leagueInput.trim();
    if (!cleaned) return;
    if (affiliatedLeagues.includes(cleaned)) {
      setLeagueInput("");
      return;
    }
    if (affiliatedLeagues.length >= 12) {
      toast.error("加盟連盟は最大12件まで登録できます");
      return;
    }
    setAffiliatedLeagues((prev) => [...prev, cleaned]);
    setLeagueInput("");
  };

  const handleRemoveLeague = (target: string) => {
    setAffiliatedLeagues((prev) => prev.filter((item) => item !== target));
  };

  const handleAddHonor = () => {
    const tournament = newHonorTournament.trim();
    const result = newHonorResult.trim();
    if (!tournament) {
      toast.error("大会名を入力してください");
      return;
    }
    if (!result) {
      toast.error("成績（優勝・準優勝など）を入力してください");
      return;
    }
    const yearClean =
      newHonorYear.trim() || String(new Date().getFullYear());
    const item: TeamHonorItem = {
      id: `honor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      year: yearClean,
      tournament,
      result,
      badgeTone: newHonorTone,
      squadLabel: newHonorSquad.trim(),
    };
    setHonors((prev) => {
      const next = [item, ...prev];
      next.sort((a, b) => {
        const ya = Number.parseInt(a.year, 10) || 0;
        const yb = Number.parseInt(b.year, 10) || 0;
        return yb - ya;
      });
      return next;
    });
    setNewHonorTournament("");
    toast.success("戦績リストに追加しました（「保存する」で確定します）");
  };

  const handleRemoveHonor = (id: string) => {
    setHonors((prev) => prev.filter((h) => h.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedOrgName = orgName.trim();
    if (!trimmedOrgName) {
      toast.error("チーム名を入力してください");
      setActiveTab("overview");
      return;
    }

    let parsedYear: number | null = null;
    if (foundedYearText.trim()) {
      const yr = Number.parseInt(foundedYearText.trim(), 10);
      if (Number.isNaN(yr) || yr < 1900 || yr > 2100) {
        toast.error("創設年は1900〜2100の西暦で入力してください");
        setActiveTab("overview");
        return;
      }
      parsedYear = yr;
    }

    // 未追加のまま入力欄に残っている加盟連盟があれば自動取り込み
    const finalLeagues = [...affiliatedLeagues];
    const pendingLeague = leagueInput.trim();
    if (
      pendingLeague &&
      !finalLeagues.includes(pendingLeague) &&
      finalLeagues.length < 12
    ) {
      finalLeagues.push(pendingLeague);
    }

    // 未追加のまま入力欄に残っている戦績があれば自動取り込み
    const finalHonors = [...honors];
    if (newHonorTournament.trim() && newHonorResult.trim()) {
      finalHonors.unshift({
        id: `honor_${Date.now()}`,
        year: newHonorYear.trim() || String(new Date().getFullYear()),
        tournament: newHonorTournament.trim(),
        result: newHonorResult.trim(),
        badgeTone: newHonorTone,
        squadLabel: newHonorSquad.trim(),
      });
      finalHonors.sort((a, b) => {
        const ya = Number.parseInt(a.year, 10) || 0;
        const yb = Number.parseInt(b.year, 10) || 0;
        return yb - ya;
      });
    }

    const nextProfile: OrganizationProfileDetails = {
      slogan: slogan.trim(),
      philosophy: philosophy.trim(),
      activityArea: activityArea.trim(),
      activityDays: activityDays.trim(),
      representativeName: representativeName.trim(),
      affiliatedLeagues: finalLeagues,
      honors: finalHonors,
    };

    const payload: TeamInfoUpdateRequest = {
      teamId,
      orgName: trimmedOrgName,
      orgShortName: orgShortName.trim() || trimmedOrgName.slice(0, 8),
      category,
      foundedYear: parsedYear,
      description: description.trim(),
      managerName: managerName.trim(),
      captainId: captainId === "__none__" ? null : captainId,
      homeGround: homeGround.trim(),
      profile: nextProfile,
    };

    setIsSaving(true);
    try {
      const res = await fetch("/api/liff/team-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        success?: boolean;
        isDemo?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "保存に失敗しました");
      }
      if (json.isDemo) {
        toast.success("体験デモ表示に反映しました（DB保存は行われません）");
      } else {
        toast.success("チーム情報を保存しました");
      }
      onSaved(payload);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "チーム情報の保存に失敗しました";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => {
        if (!isSaving) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-xl overflow-hidden flex flex-col"
      >
        {/* A-3 上帯ダークキャップ */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black tracking-tight truncate">
                チーム情報の編集
              </h2>
              <p className="text-[10.5px] font-bold text-slate-300 truncate">
                クラブ概要・体制・加盟連盟・主な戦績
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="閉じる"
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3タブ切替 */}
        <div className="px-3.5 pt-3 pb-2 bg-muted/60 border-b border-border shrink-0">
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-muted border border-border">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={cn(
                "py-1.5 px-2 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 transition-colors cursor-pointer",
                activeTab === "overview"
                  ? "bg-card text-primary shadow-2xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span>基本・方針</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("structure")}
              className={cn(
                "py-1.5 px-2 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 transition-colors cursor-pointer",
                activeTab === "structure"
                  ? "bg-card text-primary shadow-2xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>体制・連盟</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("honors")}
              className={cn(
                "py-1.5 px-2 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 transition-colors cursor-pointer",
                activeTab === "honors"
                  ? "bg-card text-primary shadow-2xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>戦績({honors.length})</span>
            </button>
          </div>
        </div>

        {/* スクロールボディ */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          {activeTab === "overview" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] font-black text-foreground">
                    チーム名（クラブ名）<span className="text-rose-500 ml-0.5">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="例: 〇〇ベースボールクラブ"
                    maxLength={60}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground">
                    スコア略称
                  </label>
                  <input
                    type="text"
                    value={orgShortName}
                    onChange={(e) => setOrgShortName(e.target.value)}
                    placeholder="例: 〇〇BC"
                    maxLength={20}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] font-black text-foreground">
                    競技区分・カテゴリ
                  </label>
                  <LiffSelect
                    value={category}
                    onChange={setCategory}
                    options={categorySelectOptions}
                    title="競技区分を選択"
                    accent="primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground">
                    創設年（西暦）
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={foundedYearText}
                    onChange={(e) => setFoundedYearText(e.target.value)}
                    placeholder="例: 2015"
                    min={1900}
                    max={2100}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground">
                  チームスローガン・合言葉
                </label>
                <input
                  type="text"
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  placeholder="例: 笑顔で全力疾走・仲間とつなぐ一球"
                  maxLength={80}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground">
                    主な活動エリア
                  </label>
                  <input
                    type="text"
                    value={activityArea}
                    onChange={(e) => setActivityArea(e.target.value)}
                    placeholder="例: 〇〇市・〇〇川緑地周辺"
                    maxLength={80}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground">
                    活動曜日・時間帯の目安
                  </label>
                  <input
                    type="text"
                    value={activityDays}
                    onChange={(e) => setActivityDays(e.target.value)}
                    placeholder="例: 土・日・祝 8:30〜16:30"
                    maxLength={100}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground">
                  チーム紹介文
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="チームの雰囲気や対象学年・構成などの紹介を入力"
                  maxLength={800}
                  className="w-full p-3 rounded-xl border border-border bg-background text-xs leading-relaxed font-medium text-foreground focus:outline-hidden focus:border-primary resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground">
                  指導方針・チーム理念
                </label>
                <textarea
                  rows={3}
                  value={philosophy}
                  onChange={(e) => setPhilosophy(e.target.value)}
                  placeholder="挨拶・礼儀・育成方針・試合でのモットーなどを入力"
                  maxLength={800}
                  className="w-full p-3 rounded-xl border border-border bg-background text-xs leading-relaxed font-medium text-foreground focus:outline-hidden focus:border-primary resize-none"
                />
              </div>
            </>
          )}

          {activeTab === "structure" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground">
                    クラブ代表者名（任意）
                  </label>
                  <input
                    type="text"
                    value={representativeName}
                    onChange={(e) => setRepresentativeName(e.target.value)}
                    placeholder="例: 山田 太郎"
                    maxLength={40}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground">
                    監督名（現在選択中の編成）
                  </label>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    placeholder="例: 山田 太郎"
                    maxLength={40}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground">
                  主将（キャプテン）
                </label>
                <LiffSelect
                  value={captainId}
                  onChange={setCaptainId}
                  options={captainSelectOptions}
                  title="主将を選択"
                  searchable={captainSelectOptions.length > 8}
                  searchPlaceholder="背番号・選手名で検索"
                  accent="primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground">
                  主な活動拠点（ホームグラウンド名）
                </label>
                <input
                  type="text"
                  value={homeGround}
                  onChange={(e) => setHomeGround(e.target.value)}
                  placeholder="例: 〇〇緑地 軟式野球場"
                  maxLength={80}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground focus:outline-hidden focus:border-primary"
                />
                <p className="text-[10.5px] font-medium text-muted-foreground">
                  ※詳細な地図・駐車台数・スパイク規定は「球場・施設マップ」と自動連携します
                </p>
              </div>

              <div className="space-y-2 pt-1 border-t border-border">
                <label className="text-[11px] font-black text-foreground block">
                  加盟連盟・所属リーグ
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={leagueInput}
                    onChange={(e) => setLeagueInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddLeague();
                      }
                    }}
                    placeholder="例: 〇〇区少年野球連盟"
                    maxLength={60}
                    className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={handleAddLeague}
                    className="h-10 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center gap-1 shrink-0 active:scale-95 transition-transform cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>追加</span>
                  </button>
                </div>

                {affiliatedLeagues.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {affiliatedLeagues.map((lg) => (
                      <span
                        key={lg}
                        className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-muted border border-border text-xs font-bold text-foreground"
                      >
                        <span>{lg}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveLeague(lg)}
                          aria-label={`${lg}を削除`}
                          className="w-4 h-4 rounded-full hover:bg-rose-500/15 text-muted-foreground hover:text-rose-600 flex items-center justify-center cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] font-medium text-muted-foreground">
                    所属している連盟やリーグ名を追加できます
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-muted/60 p-3 space-y-2">
                <p className="text-[11px] font-black text-foreground">
                  連携マスタの個別編集ショートカット
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {info.canManage && (
                    <Link
                      href="/liff/admin"
                      onClick={onClose}
                      className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-[11px] font-bold text-foreground hover:border-primary/50 inline-flex items-center gap-1"
                    >
                      <span>メンバー・役職管理</span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </Link>
                  )}
                  <Link
                    href="/liff/grounds"
                    onClick={onClose}
                    className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-[11px] font-bold text-foreground hover:border-teal-500/50 inline-flex items-center gap-1"
                  >
                    <MapPin className="w-3 h-3 text-teal-600" />
                    <span>球場・施設マップ</span>
                  </Link>
                  <Link
                    href="/liff/links"
                    onClick={onClose}
                    className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-[11px] font-bold text-foreground hover:border-amber-500/50 inline-flex items-center gap-1"
                  >
                    <span>関連リンク・SNS</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </Link>
                </div>
              </div>
            </>
          )}

          {activeTab === "honors" && (
            <>
              <div className="rounded-xl border border-border bg-muted/50 p-3.5 space-y-3">
                <p className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-500" />
                  <span>新しい戦績・入賞歴を追加</span>
                </p>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-black text-muted-foreground">
                      年度
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={newHonorYear}
                      onChange={(e) => setNewHonorYear(e.target.value)}
                      placeholder="2026"
                      maxLength={8}
                      className="w-full h-9 px-2.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10.5px] font-black text-muted-foreground">
                      対象編成（任意）
                    </label>
                    <input
                      type="text"
                      value={newHonorSquad}
                      onChange={(e) => setNewHonorSquad(e.target.value)}
                      placeholder="例: Aチーム / ジュニア"
                      maxLength={24}
                      className="w-full h-9 px-2.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-black text-muted-foreground">
                    大会名
                  </label>
                  <input
                    type="text"
                    value={newHonorTournament}
                    onChange={(e) => setNewHonorTournament(e.target.value)}
                    placeholder="例: 春季区民少年野球大会"
                    maxLength={80}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-card text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10.5px] font-black text-muted-foreground block">
                    成績・タイトル（タップで選択 または 自由入力）
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {HONOR_RESULT_PRESETS.map((preset) => {
                      const selected = newHonorResult === preset.label;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setNewHonorResult(preset.label);
                            setNewHonorTone(preset.tone);
                          }}
                          className={cn(
                            "px-2.5 py-1 rounded-lg border text-[11px] font-black transition-colors cursor-pointer",
                            selected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card text-foreground border-border hover:bg-muted"
                          )}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <input
                      type="text"
                      value={newHonorResult}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewHonorResult(val);
                        setNewHonorTone(inferHonorBadgeTone(val));
                      }}
                      placeholder="例: 優勝 / ベスト4"
                      maxLength={40}
                      className="w-full h-9 px-3 rounded-xl border border-border bg-card text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                    />
                    <LiffSelect
                      value={newHonorTone}
                      onChange={(v) => setNewHonorTone(v as HonorBadgeTone)}
                      options={BADGE_TONE_OPTIONS}
                      title="バッジ色を選択"
                      size="sm"
                      accent="amber"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddHonor}
                  className="w-full h-9 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>この戦績をリストに追加</span>
                </button>
              </div>

              {/* 登録済みリスト */}
              <div className="space-y-2">
                <p className="text-[11px] font-black text-muted-foreground">
                  登録済みの戦績（{honors.length}件）
                </p>
                {honors.length === 0 ? (
                  <p className="text-xs font-medium text-muted-foreground py-4 text-center border border-dashed border-border rounded-xl">
                    まだ戦績が登録されていません
                  </p>
                ) : (
                  <div className="space-y-2">
                    {honors.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-border bg-background"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-black font-mono text-foreground">
                              {h.year}年
                            </span>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-black border",
                                h.badgeTone === "gold" &&
                                  "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35",
                                h.badgeTone === "silver" &&
                                  "bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-500/35",
                                h.badgeTone === "bronze" &&
                                  "bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/35",
                                h.badgeTone === "blue" &&
                                  "bg-primary/12 text-primary border-primary/30"
                              )}
                            >
                              {h.result}
                            </span>
                            {h.squadLabel && (
                              <span className="text-[10px] font-bold text-muted-foreground">
                                ({h.squadLabel})
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-black text-foreground truncate">
                            {h.tournament}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveHonor(h.id)}
                          aria-label={`${h.tournament}を削除`}
                          className="w-8 h-8 rounded-lg hover:bg-rose-500/12 text-muted-foreground hover:text-rose-600 flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* フッター（Safe Area 確保） */}
        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 h-11 rounded-xl border border-border bg-muted hover:bg-muted/80 text-foreground text-xs font-black transition-colors cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex-[1.6] h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>保存中...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>チーム情報を保存</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
