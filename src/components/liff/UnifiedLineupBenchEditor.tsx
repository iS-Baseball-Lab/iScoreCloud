// filepath: src/components/liff/UnifiedLineupBenchEditor.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  FolderOpen,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Swords,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  UserStar,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/layout/EmptyState";
import { LiffSelect } from "@/components/liff/LiffSelect";
import {
  LINEUP_POSITIONS,
  formatLineupShareText,
  formatPlayerJoinedShortDate,
  isDemoTeamId,
  isPlayerJoinedAfterMatch,
  resolvePlayerMatchAttendanceStatus,
  type LineupPlayer,
  type LineupTemplateItem,
  type MatchRosterFilterContext,
  type MyLineupSlot,
  type OpponentBenchPlayer,
  type OpponentLineupSlot,
  type PlayerMatchAttendanceMap,
  type PlayerMatchAttendanceStatus,
} from "@/lib/liff/demo-lineup";
import {
  PLAYER_CONDITION_META,
  formatConditionPeriodRange,
  normalizePlayerConditionStatus,
} from "@/lib/liff/player-condition";
import {
  evaluatePreMatchWorkloadWarning,
  type PitchLimitSpec,
} from "@/lib/liff/pitch-workload";
import { splitLoadedMyLineupSlots } from "@/lib/liff/live-report-v2";

interface SaveTemplateApiResponse {
  success?: boolean;
  id?: string;
  error?: string;
}

export interface UnifiedLineupBenchEditorProps {
  teamId: string;
  isDemoTeam?: boolean;
  canEdit: boolean;
  canSaveTeamTemplate?: boolean;
  linkageMode: "match" | "free";
  showLinkageBanner?: boolean;
  opponentDisplayName?: string;
  dateLabel?: string;
  matchRosterCtx: MatchRosterFilterContext;
  pitchLimitSpec: PitchLimitSpec;
  teamPlayers: ReadonlyArray<LineupPlayer>;
  myLineup: ReadonlyArray<MyLineupSlot>;
  dhStarterPitcher: MyLineupSlot | null;
  opponentLineup: ReadonlyArray<OpponentLineupSlot>;
  opponentBench: ReadonlyArray<OpponentBenchPlayer>;
  attendance: PlayerMatchAttendanceMap;
  scheduleAbsents?: ReadonlyArray<string>;
  templates: ReadonlyArray<LineupTemplateItem>;
  onChangeTemplates: (next: LineupTemplateItem[]) => void;
  inGameSubstitutionsByOrder?: ReadonlyMap<number, ReadonlyArray<string>>;
  onReloadFromMatch?: () => void;
  hasSavedMatchLineup?: boolean;
  onChangeState: (patch: {
    myLineup?: MyLineupSlot[];
    dhStarterPitcher?: MyLineupSlot | null;
    opponentLineup?: OpponentLineupSlot[];
    opponentBench?: OpponentBenchPlayer[];
    myAttendance?: PlayerMatchAttendanceMap;
  }) => void;
  activeContextKey?: string;
  showCopyShareButton?: boolean;
  primarySaveButton?: {
    label: string;
    savingLabel?: string;
    isSaving: boolean;
    onSave: () => void;
  };
}

export function UnifiedLineupBenchEditor({
  teamId,
  isDemoTeam = false,
  canEdit,
  canSaveTeamTemplate = true,
  linkageMode,
  showLinkageBanner = false,
  opponentDisplayName = "対戦相手",
  dateLabel = "",
  matchRosterCtx,
  pitchLimitSpec,
  teamPlayers,
  myLineup,
  dhStarterPitcher,
  opponentLineup,
  opponentBench,
  attendance,
  scheduleAbsents = [],
  templates,
  onChangeTemplates,
  inGameSubstitutionsByOrder,
  onReloadFromMatch,
  hasSavedMatchLineup = false,
  onChangeState,
  activeContextKey = "",
  showCopyShareButton = true,
  primarySaveButton,
}: UnifiedLineupBenchEditorProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"myTeam" | "opponent">("myTeam");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const [activeSelectionIndex, setActiveSelectionIndex] = useState<number | null>(
    null
  );
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [tempSelectedPlayer, setTempSelectedPlayer] =
    useState<LineupPlayer | null>(null);
  const [modalStep, setModalStep] = useState<"player" | "position">("player");
  const [guestManualName, setGuestManualName] = useState("");
  const [guestManualUniform, setGuestManualUniform] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // SKILL.md 規約5: 対象試合切替・モード切替・閲覧モード降格時にモーダルを安全リセット
  useEffect(() => {
    setActiveSelectionIndex(null);
    setTempSelectedPlayer(null);
    setIsTemplateModalOpen(false);
    setSelectedTemplateId("");
    setGuestManualName("");
    setGuestManualUniform("");
  }, [activeContextKey, canEdit, teamId]);

  useEffect(() => {
    if (!mounted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveSelectionIndex(null);
        setTempSelectedPlayer(null);
        setIsTemplateModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted]);

  const effectiveAttendance = useMemo<PlayerMatchAttendanceMap>(() => {
    const resolved: PlayerMatchAttendanceMap = { ...attendance };
    for (const p of teamPlayers) {
      const baseStatus = resolvePlayerMatchAttendanceStatus(
        p,
        attendance,
        matchRosterCtx
      );
      if (
        linkageMode === "match" &&
        scheduleAbsents.includes(p.id) &&
        baseStatus !== "excluded"
      ) {
        resolved[p.id] = "absent";
      } else {
        resolved[p.id] = baseStatus;
      }
    }
    return resolved;
  }, [attendance, teamPlayers, matchRosterCtx, linkageMode, scheduleAbsents]);

  const activeDhStarterPitcher = useMemo<MyLineupSlot | null>(() => {
    if (!dhStarterPitcher) return null;
    const hasIdentity = Boolean(
      dhStarterPitcher.playerId || dhStarterPitcher.name.trim()
    );
    if (!hasIdentity) return null;
    const hasDhInOrder = myLineup.some((s) => s.position === "DH");
    const hasPitcherInOrder = myLineup.some(
      (s) => Boolean(s.playerId || s.name.trim()) && s.position === "1"
    );
    const isSamePlayerInOrder = Boolean(
      dhStarterPitcher.playerId &&
        myLineup.some((s) => s.playerId === dhStarterPitcher.playerId)
    );
    if (!hasDhInOrder || hasPitcherInOrder || isSamePlayerInOrder) {
      return null;
    }
    return {
      ...dhStarterPitcher,
      order: 0,
      position: "1",
    };
  }, [dhStarterPitcher, myLineup]);

  const getDisabledPositions = (
    lineup: ReadonlyArray<{ position: string }>,
    currentIndex: number
  ): string[] =>
    lineup
      .filter((_, i) => i !== currentIndex)
      .map((p) => p.position)
      .filter((pos) => Boolean(pos) && pos !== "DH");

  const getDisabledPlayers = (
    lineup: ReadonlyArray<MyLineupSlot>,
    currentIndex: number
  ): string[] => {
    const ids = lineup
      .filter((_, i) => i !== currentIndex)
      .map((p) => p.playerId)
      .filter(Boolean);
    if (
      activeDhStarterPitcher?.playerId &&
      !ids.includes(activeDhStarterPitcher.playerId)
    ) {
      ids.push(activeDhStarterPitcher.playerId);
    }
    return ids;
  };

  const handleAddBatter = (type: "myTeam" | "opponent") => {
    if (!canEdit) return;
    if (type === "myTeam") {
      const next: MyLineupSlot[] = [
        ...myLineup,
        {
          order: myLineup.length + 1,
          position: "",
          playerId: "",
          name: "",
          uniformNumber: "",
        },
      ];
      onChangeState({ myLineup: next });
      toast.success("打撃スタメン枠を追加しました");
    } else {
      const next: OpponentLineupSlot[] = [
        ...opponentLineup,
        {
          order: opponentLineup.length + 1,
          position: "",
          name: "",
          uniformNumber: "",
        },
      ];
      onChangeState({ opponentLineup: next });
      toast.success("相手チームの打撃枠を追加しました");
    }
  };

  const handleRemoveBatter = (
    type: "myTeam" | "opponent",
    targetIndex: number
  ) => {
    if (!canEdit) return;
    if (type === "myTeam") {
      if (myLineup.length <= 9) return;
      const filtered = myLineup
        .filter((_, i) => i !== targetIndex)
        .map((p, idx) => ({ ...p, order: idx + 1 }));
      onChangeState({ myLineup: filtered });
      toast.success("打撃スタメン枠を削除しました");
    } else {
      if (opponentLineup.length <= 9) return;
      const filtered = opponentLineup
        .filter((_, i) => i !== targetIndex)
        .map((p, idx) => ({ ...p, order: idx + 1 }));
      onChangeState({ opponentLineup: filtered });
      toast.success("相手チームの打撃枠を削除しました");
    }
  };

  const handleSaveTemplate = async () => {
    const trimmed = templateName.trim();
    if (!trimmed) {
      toast.error("テンプレート名を入力してください");
      return;
    }

    const serializedTemplateLineup: MyLineupSlot[] = activeDhStarterPitcher
      ? [...myLineup, activeDhStarterPitcher]
      : [...myLineup];

    const useLocalOnly =
      isDemoTeam || isDemoTeamId(teamId) || !canSaveTeamTemplate;

    try {
      if (useLocalOnly) {
        const storageKey =
          isDemoTeam || isDemoTeamId(teamId)
            ? "iscore_demo_lineup_templates"
            : `iscore_personal_lineup_templates_${teamId}`;
        const newTpl: LineupTemplateItem = {
          id: `local-tpl-${Date.now()}`,
          name: trimmed,
          lineupData: serializedTemplateLineup,
        };
        const nextTemplates = [newTpl, ...templates];
        onChangeTemplates(nextTemplates);
        if (typeof window !== "undefined") {
          localStorage.setItem(storageKey, JSON.stringify(nextTemplates));
        }
        toast.success(`テンプレート「${trimmed}」を保存しました`);
        setIsTemplateModalOpen(false);
        setTemplateName("");
        return;
      }

      const res = await fetch(
        `/api/teams/${encodeURIComponent(teamId)}/lineup-templates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmed,
            lineupData: serializedTemplateLineup,
          }),
        }
      );

      const result = (await res.json()) as SaveTemplateApiResponse;
      if (!res.ok || result.error) {
        throw new Error(result.error || "保存に失敗しました");
      }

      toast.success(`テンプレート「${trimmed}」を保存しました`);
      setIsTemplateModalOpen(false);
      setTemplateName("");

      const templatesRes = await fetch(
        `/api/teams/${encodeURIComponent(teamId)}/lineup-templates`,
        { cache: "no-store" }
      );
      if (templatesRes.ok) {
        const templatesData =
          (await templatesRes.json()) as LineupTemplateItem[];
        onChangeTemplates(Array.isArray(templatesData) ? templatesData : []);
      }
    } catch (error) {
      console.error(error);
      toast.error("テンプレートの保存に失敗しました");
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId || !canEdit) return;

    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    try {
      const rawLineupData =
        typeof template.lineupData === "string"
          ? (JSON.parse(template.lineupData) as MyLineupSlot[])
          : template.lineupData;

      if (Array.isArray(rawLineupData)) {
        let skippedUnavailableCount = 0;
        const restored = rawLineupData.map((item) => {
          const player = teamPlayers.find((p) => p.id === item.playerId);
          if (item.playerId) {
            const cond = player
              ? normalizePlayerConditionStatus(player.conditionStatus)
              : "on_leave";
            const isAbsentOrExcluded =
              effectiveAttendance[item.playerId] === "absent" ||
              effectiveAttendance[item.playerId] === "excluded";
            if (
              !player ||
              cond === "rehab" ||
              cond === "on_leave" ||
              isAbsentOrExcluded
            ) {
              skippedUnavailableCount += 1;
              return {
                order: item.order,
                position: "",
                playerId: "",
                name: "",
                uniformNumber: "",
              };
            }
          }
          return {
            order: item.order,
            position: item.position || "",
            playerId: item.playerId || "",
            name: player ? player.name : item.name || "",
            uniformNumber: player
              ? player.uniformNumber || ""
              : item.uniformNumber || "",
          };
        });

        const splitTpl = splitLoadedMyLineupSlots(restored);
        onChangeState({
          myLineup: splitTpl.battingSlots,
          dhStarterPitcher: splitTpl.dhPitcher,
        });
        if (skippedUnavailableCount > 0) {
          toast.info(
            `テンプレート「${template.name}」を適用しました（欠席・休部・調整中の${skippedUnavailableCount}名は空欄にしました）`
          );
        } else {
          toast.success(`テンプレート「${template.name}」を適用しました`);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("テンプレートの読み込みに失敗しました");
    }
  };

  const handleFillDummyOpponent = () => {
    if (!canEdit) return;
    const next = opponentLineup.map((p, i) => ({
      ...p,
      position: i < 9 ? String(i + 1) : "DH",
      name: `相手打者 ${i + 1}`,
    }));
    onChangeState({ opponentLineup: next });
    toast.success("相手スタメンを一括生成しました");
  };

  const handleAddOpponentBench = (count = 1) => {
    if (!canEdit) return;
    const baseTs = Date.now();
    const added: OpponentBenchPlayer[] = Array.from(
      { length: count },
      (_, idx) => ({
        id: `opp-bench-${baseTs}-${idx}`,
        uniformNumber: "",
        name: "",
        position: "",
      })
    );
    onChangeState({ opponentBench: [...opponentBench, ...added] });
  };

  const handleRemoveOpponentBench = (targetIndex: number) => {
    if (!canEdit) return;
    onChangeState({
      opponentBench: opponentBench.filter((_, idx) => idx !== targetIndex),
    });
  };

  const setPlayerAttendanceStatus = (
    playerId: string,
    status: PlayerMatchAttendanceStatus
  ) => {
    if (!canEdit) return;
    onChangeState({
      myAttendance: {
        ...effectiveAttendance,
        [playerId]: status,
      },
    });
  };

  const renderPlayerWorkloadBadges = useCallback(
    (p: LineupPlayer | null | undefined) => {
      if (!p) return null;
      const yPitches = p.yesterdayPitches ?? 0;
      const wPitches = p.last7DaysPitches ?? 0;
      if (yPitches <= 0 && wPitches <= 0) return null;

      const evalWarn = evaluatePreMatchWorkloadWarning({
        yesterdayPitches: yPitches,
        last7DaysPitches: wPitches,
        dailyLimit: pitchLimitSpec.limit,
      });

      return (
        <>
          {yPitches > 0 && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[9.5px] font-black leading-none tabular-nums shrink-0",
                evalWarn.severity === "high"
                  ? "bg-red-600 text-white"
                  : "bg-amber-100 text-amber-950 border border-amber-400 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700"
              )}
            >
              ⚾ 前日{yPitches}球
            </span>
          )}
          {wPitches > 0 && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[9.5px] font-black leading-none tabular-nums shrink-0 border",
                wPitches >= 140
                  ? "bg-red-50 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800"
                  : wPitches >= 100
                    ? "bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"
                    : "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
              )}
            >
              7日計{wPitches}球
            </span>
          )}
        </>
      );
    },
    [pitchLimitSpec.limit]
  );

  const assignedPitcherWarnings = useMemo(() => {
    const entries: Array<{
      key: string;
      orderLabel: string;
      playerName: string;
      uniformNumber: string | null;
      warning: ReturnType<typeof evaluatePreMatchWorkloadWarning>;
    }> = [];

    const checkSlot = (slot: MyLineupSlot, label: string) => {
      if (!slot.playerId) return;
      const tp = teamPlayers.find((p) => p.id === slot.playerId);
      if (!tp) return;
      const warning = evaluatePreMatchWorkloadWarning({
        yesterdayPitches: tp.yesterdayPitches,
        last7DaysPitches: tp.last7DaysPitches,
        dailyLimit: pitchLimitSpec.limit,
      });
      if (warning.severity !== "none") {
        entries.push({
          key: `${label}-${tp.id}`,
          orderLabel: label,
          playerName: tp.name,
          uniformNumber: tp.uniformNumber ?? null,
          warning,
        });
      }
    };

    myLineup.forEach((slot, idx) => {
      if (slot.position === "1") {
        checkSlot(slot, `${idx + 1}番・投`);
      }
    });

    if (activeDhStarterPitcher) {
      checkSlot(activeDhStarterPitcher, "先発投手(DH)");
    }

    return entries;
  }, [myLineup, activeDhStarterPitcher, teamPlayers, pitchLimitSpec.limit]);

  const filledStarterCount = useMemo(() => {
    const batterCount = myLineup.filter((p) =>
      Boolean(p.playerId || p.name.trim())
    ).length;
    const dhExtra = activeDhStarterPitcher ? 1 : 0;
    return batterCount + dhExtra;
  }, [myLineup, activeDhStarterPitcher]);

  const startingPlayerIds = useMemo(() => {
    const ids = myLineup.map((p) => p.playerId).filter(Boolean);
    if (
      activeDhStarterPitcher?.playerId &&
      !ids.includes(activeDhStarterPitcher.playerId)
    ) {
      ids.push(activeDhStarterPitcher.playerId);
    }
    return ids;
  }, [myLineup, activeDhStarterPitcher]);

  const remainingPlayers = useMemo(() => {
    const filtered = teamPlayers.filter(
      (p) => !startingPlayerIds.includes(p.id)
    );
    return [...filtered].sort((a, b) => {
      const aPreJoined = isPlayerJoinedAfterMatch(a, matchRosterCtx) ? 1 : 0;
      const bPreJoined = isPlayerJoinedAfterMatch(b, matchRosterCtx) ? 1 : 0;
      return aPreJoined - bPreJoined;
    });
  }, [teamPlayers, startingPlayerIds, matchRosterCtx]);

  const benchCount = useMemo(
    () =>
      remainingPlayers.filter(
        (p) => (effectiveAttendance[p.id] ?? "bench") === "bench"
      ).length,
    [remainingPlayers, effectiveAttendance]
  );
  const absentCount = useMemo(
    () =>
      remainingPlayers.filter((p) => effectiveAttendance[p.id] === "absent")
        .length,
    [remainingPlayers, effectiveAttendance]
  );
  const excludedCount = useMemo(
    () =>
      remainingPlayers.filter((p) => effectiveAttendance[p.id] === "excluded")
        .length,
    [remainingPlayers, effectiveAttendance]
  );
  const filledOpponentBenchCount = useMemo(
    () =>
      opponentBench.filter((b) =>
        Boolean(
          (b.name && b.name.trim()) ||
            (b.uniformNumber && b.uniformNumber.trim())
        )
      ).length,
    [opponentBench]
  );

  const shareSummaryText = useMemo(() => {
    return formatLineupShareText(
      opponentDisplayName || "対戦相手",
      dateLabel || "",
      [...myLineup],
      remainingPlayers,
      effectiveAttendance,
      [...teamPlayers]
    );
  }, [
    opponentDisplayName,
    dateLabel,
    myLineup,
    remainingPlayers,
    effectiveAttendance,
    teamPlayers,
  ]);

  const handleCopyLineupText = async () => {
    try {
      await navigator.clipboard.writeText(shareSummaryText);
      setIsCopied(true);
      toast.success(
        "出場メンバー表をコピーしました！LINEに貼り付けて共有できます"
      );
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  return (
    <div className="space-y-3.5">
      {/* モード連動・データ分離ステータスバナー（LINE速報内など showLinkageBanner 時） */}
      {showLinkageBanner && (
        <div
          className={cn(
            "rounded-2xl border p-3 flex items-center justify-between gap-2 flex-wrap shadow-xs",
            linkageMode === "free"
              ? "border-amber-400/60 bg-amber-50/70 dark:bg-amber-950/30"
              : "border-primary/35 bg-primary/8"
          )}
        >
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={cn(
                  "px-2 py-0.5 rounded-md text-[10px] font-black",
                  linkageMode === "free"
                    ? "bg-amber-400 text-slate-950"
                    : "bg-[#0f172a] text-white"
                )}
              >
                {linkageMode === "free"
                  ? "フリー速報（試合非連動）"
                  : "試合スタメン双方向連動"}
              </span>
              <span className="text-xs font-black text-foreground">
                {linkageMode === "free"
                  ? "データは個人フリー速報内のみに保持されます"
                  : "試合のスタメン・ベンチ設定と自動同期します"}
              </span>
            </div>
            <p className="text-[10.5px] font-bold text-muted-foreground leading-snug">
              {linkageMode === "free"
                ? "守備重複防止・体調/球数チェック・テンプレなど同一の入力制御を利用でき、試合データには紐付けされません。"
                : canEdit
                  ? "ここで設定した打順・DH投手・控え・欠席・相手打順は、試合のスタメン設定にもそのまま保存されます。"
                  : "現在は閲覧モードのため参照専用です（メンバー表テキストのコピーは利用できます）。"}
            </p>
          </div>
          {canEdit &&
            linkageMode === "match" &&
            hasSavedMatchLineup &&
            onReloadFromMatch && (
              <button
                type="button"
                onClick={onReloadFromMatch}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-card border border-border hover:bg-muted text-[11px] font-black text-primary shrink-0 cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>試合側から再読込</span>
              </button>
            )}
        </div>
      )}

      {/* 🔀 自チーム / 相手チーム タブ切り替え */}
      <div className="flex gap-1 bg-muted p-1 rounded-2xl border border-border">
        <button
          type="button"
          onClick={() => setActiveTab("myTeam")}
          className={cn(
            "flex-1 py-2.5 text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
            activeTab === "myTeam"
              ? "bg-card text-foreground shadow-sm border border-border font-black"
              : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
          )}
        >
          <Shield
            className={cn(
              "w-4 h-4",
              activeTab === "myTeam" ? "text-primary" : "text-muted-foreground"
            )}
          />
          <span>自チーム</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("opponent")}
          className={cn(
            "flex-1 py-2.5 text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
            activeTab === "opponent"
              ? "bg-card text-foreground shadow-sm border border-border font-black"
              : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
          )}
        >
          <Swords
            className={cn(
              "w-4 h-4",
              activeTab === "opponent"
                ? "text-primary"
                : "text-muted-foreground"
            )}
          />
          <span>相手チーム</span>
        </button>
      </div>

      {/* テンプレート読込・保存 / 相手一括生成 */}
      {canEdit && (
        <div className="flex justify-between items-center">
          {activeTab === "myTeam" ? (
            <div className="flex gap-2 w-full">
              <LiffSelect
                value={selectedTemplateId}
                onChange={handleLoadTemplate}
                options={[
                  {
                    value: "",
                    label: "テンプレート読込",
                    sublabel: "選択状態をクリアします",
                  },
                  ...templates.map((t) => ({
                    value: t.id,
                    label: t.name,
                  })),
                ]}
                placeholder="テンプレート読込"
                title="オーダーテンプレート読込"
                subtitle="保存済みのスタメン構成を呼び出します"
                triggerPrefix={
                  <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                }
                searchable={templates.length >= 8}
                className="flex-1 min-w-0 h-11 rounded-2xl px-3.5 shadow-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTemplateModalOpen(true)}
                className="h-11 rounded-2xl border border-primary/25 bg-primary/10 hover:bg-primary/15 text-primary font-black px-4 text-xs shadow-xs shrink-0"
              >
                <Save className="w-4 h-4 mr-1.5" />
                テンプレ保存
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={handleFillDummyOpponent}
              variant="outline"
              className="w-full h-11 rounded-2xl border border-primary/25 bg-primary/10 hover:bg-primary/15 text-primary font-black text-xs shadow-xs"
            >
              <Wand2 className="w-4 h-4 mr-1.5" />
              相手スタメンを一括生成
            </Button>
          )}
        </div>
      )}

      {/* 🛡️ 肩肘保護・投球負荷アラートバナー（先発投手） */}
      {activeTab === "myTeam" && assignedPitcherWarnings.length > 0 && (
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div
            className={cn(
              "bg-[#0f172a] text-slate-50 border-b-[3px] px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap",
              assignedPitcherWarnings.some((w) => w.warning.severity === "high")
                ? "border-red-500"
                : "border-amber-500"
            )}
          >
            <h3 className="text-xs font-black text-white flex items-center gap-1.5">
              <AlertTriangle
                className={cn(
                  "w-4 h-4 shrink-0",
                  assignedPitcherWarnings.some(
                    (w) => w.warning.severity === "high"
                  )
                    ? "text-red-400"
                    : "text-amber-400"
                )}
              />
              <span>肩肘保護・投球負荷アラート（先発投手）</span>
            </h3>
            <span className="text-[10.5px] font-black bg-slate-800 text-slate-100 border border-slate-700 px-2 py-0.5 rounded-full tabular-nums">
              基準: {pitchLimitSpec.ruleLabel}
            </span>
          </div>
          <div className="p-3 space-y-2 bg-card">
            {assignedPitcherWarnings.map((item) => {
              const isHigh = item.warning.severity === "high";
              return (
                <div
                  key={item.key}
                  className={cn(
                    "p-2.5 rounded-xl border border-l-4 space-y-1",
                    isHigh
                      ? "bg-red-50 border-red-300 border-l-red-600 text-red-950 dark:bg-red-950 dark:border-red-800 dark:border-l-red-500 dark:text-red-100"
                      : "bg-amber-50 border-amber-300 border-l-amber-500 text-amber-950 dark:bg-amber-950 dark:border-amber-800 dark:border-l-amber-500 dark:text-amber-100"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-black">
                      {item.orderLabel}：
                      {item.uniformNumber ? `#${item.uniformNumber} ` : ""}
                      {item.playerName}
                    </span>
                    {item.warning.shortBadge && (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-black tabular-nums",
                          isHigh
                            ? "bg-red-600 text-white"
                            : "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100"
                        )}
                      >
                        {item.warning.shortBadge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-bold leading-snug">
                    {item.warning.message}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ⚾ 【セクション1】スターティングメンバー */}
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
          <h3 className="text-xs font-black text-white flex items-center gap-1.5">
            <UserStar className="w-4 h-4 text-amber-400" />
            <span>スターティングメンバー</span>
          </h3>
          {activeTab === "myTeam" ? (
            <span className="text-[11px] font-black bg-slate-800 text-slate-100 border border-slate-700 px-2.5 py-0.5 rounded-full tabular-nums">
              スタメン: {filledStarterCount} / {myLineup.length}人
            </span>
          ) : (
            <span className="text-[11px] font-black bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-0.5 rounded-full tabular-nums">
              {opponentLineup.length}人制
            </span>
          )}
        </div>

        <div className="p-3 space-y-2.5 bg-card">
          <div className="space-y-2">
            {(activeTab === "myTeam" ? myLineup : opponentLineup).map(
              (player, index) => {
                const disabledPos = getDisabledPositions(
                  activeTab === "myTeam" ? myLineup : opponentLineup,
                  index
                );
                const mySlot = activeTab === "myTeam" ? myLineup[index] : null;
                const hasMyIdentity = Boolean(
                  mySlot && (mySlot.playerId || mySlot.name.trim())
                );
                const isCompleted =
                  activeTab === "myTeam"
                    ? Boolean(player.position && hasMyIdentity)
                    : Boolean(player.position && player.name.trim());

                const posDef = LINEUP_POSITIONS.find(
                  (p) => p.id === player.position
                );
                const matchedMyStarterPlayer =
                  mySlot?.playerId
                    ? teamPlayers.find((tp) => tp.id === mySlot.playerId) ||
                      null
                    : null;
                const starterCondStatus = normalizePlayerConditionStatus(
                  matchedMyStarterPlayer?.conditionStatus
                );
                const starterCondMeta = PLAYER_CONDITION_META[starterCondStatus];
                const subTrail =
                  activeTab === "myTeam"
                    ? inGameSubstitutionsByOrder?.get(index + 1)
                    : undefined;

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-2xl bg-card shadow-xs transition-all",
                      starterCondStatus === "restricted"
                        ? "border border-amber-500/50 bg-amber-500/[0.04]"
                        : starterCondStatus === "rehab"
                          ? "border border-rose-500/45 bg-rose-500/[0.04]"
                          : isCompleted
                            ? "border border-border"
                            : "border border-dashed border-border"
                    )}
                  >
                    <div
                      className={cn(
                        "w-7 text-center font-black italic flex items-center justify-center text-xs shrink-0",
                        isCompleted ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {index + 1}
                    </div>

                    {activeTab === "myTeam" && mySlot ? (
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => {
                          if (!canEdit) return;
                          setActiveSelectionIndex(index);
                          setPlayerSearchQuery("");
                          setGuestManualName(
                            !mySlot.playerId && mySlot.name
                              ? mySlot.name
                              : ""
                          );
                          setGuestManualUniform(
                            !mySlot.playerId && mySlot.uniformNumber
                              ? mySlot.uniformNumber
                              : ""
                          );
                          if (mySlot.playerId || mySlot.name.trim()) {
                            setTempSelectedPlayer(
                              matchedMyStarterPlayer || {
                                id: mySlot.playerId || "",
                                name: mySlot.name,
                                uniformNumber: mySlot.uniformNumber || null,
                              }
                            );
                            setModalStep("position");
                          } else {
                            setTempSelectedPlayer(null);
                            setModalStep("player");
                          }
                        }}
                        className={cn(
                          "flex-1 min-h-11 py-1.5 px-2.5 bg-transparent border-none font-bold text-sm rounded-xl focus:outline-none transition-colors flex items-center justify-between min-w-0",
                          canEdit
                            ? "hover:bg-muted/40 active:bg-muted/60 cursor-pointer"
                            : "cursor-default"
                        )}
                      >
                        <div className="flex items-center gap-2 overflow-hidden mr-2 min-w-0">
                          {posDef ? (
                            <span
                              className={cn(
                                "px-2 py-1 rounded-lg text-white font-black text-[10px] shrink-0",
                                posDef.color
                              )}
                            >
                              {posDef.label}
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-lg bg-muted text-muted-foreground font-black text-[10px] shrink-0 border border-border">
                              守備未設定
                            </span>
                          )}

                          <div className="min-w-0 text-left">
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              <span
                                className={cn(
                                  "truncate text-left text-xs sm:text-sm",
                                  hasMyIdentity
                                    ? "font-black text-foreground"
                                    : "font-bold text-muted-foreground"
                                )}
                              >
                                {hasMyIdentity
                                  ? `${
                                      mySlot.uniformNumber
                                        ? `#${mySlot.uniformNumber} `
                                        : ""
                                    }${mySlot.name}`
                                  : canEdit
                                    ? "タップして選手・守備を選択..."
                                    : "未登録"}
                              </span>
                              {(starterCondStatus === "restricted" ||
                                starterCondStatus === "rehab") && (
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[9.5px] font-black leading-none shrink-0",
                                    starterCondMeta.solidBadgeClass
                                  )}
                                >
                                  {starterCondMeta.compactBadgeText}
                                </span>
                              )}
                              {renderPlayerWorkloadBadges(
                                matchedMyStarterPlayer
                              )}
                            </div>
                            {subTrail && subTrail.length > 0 && (
                              <span className="text-[10px] font-bold text-primary block truncate mt-0.5">
                                途中出場: → {subTrail.join(" → ")}
                              </span>
                            )}
                            {(starterCondStatus === "restricted" ||
                              starterCondStatus === "rehab") &&
                              matchedMyStarterPlayer?.conditionNote && (
                                <span className="text-[9.5px] font-bold text-muted-foreground flex items-center gap-1 truncate mt-0.5">
                                  <Lock className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate">
                                    {matchedMyStarterPlayer.conditionNote}
                                  </span>
                                </span>
                              )}
                          </div>
                        </div>
                        {canEdit && (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                      </button>
                    ) : (
                      <>
                        <LiffSelect
                          value={player.position}
                          disabled={!canEdit}
                          onChange={(val) => {
                            const list = [...opponentLineup];
                            list[index] = { ...list[index], position: val };
                            onChangeState({ opponentLineup: list });
                          }}
                          options={[
                            {
                              value: "",
                              label: "守備未設定（クリア）",
                            },
                            ...LINEUP_POSITIONS.map((p) => {
                              const isTaken = disabledPos.includes(p.id);
                              return {
                                value: p.id,
                                label: p.label,
                                disabled: isTaken,
                                badge: isTaken ? "他打順で使用中" : undefined,
                                badgeTone: "slate" as const,
                              };
                            }),
                          ]}
                          displayValueOverride={posDef ? posDef.label : "守備"}
                          title={`相手 ${index + 1}番の守備位置`}
                          searchable={false}
                          className={cn(
                            "w-20 h-11 rounded-xl px-2.5 shrink-0",
                            posDef
                              ? posDef.id === "1"
                                ? "bg-red-500 hover:bg-red-600 border-red-600 text-white [&>svg]:text-white/90"
                                : posDef.id === "2"
                                  ? "bg-blue-500 hover:bg-blue-600 border-blue-600 text-white [&>svg]:text-white/90"
                                  : posDef.id === "3"
                                    ? "bg-orange-500 hover:bg-orange-600 border-orange-600 text-white [&>svg]:text-white/90"
                                    : posDef.id === "4"
                                      ? "bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white [&>svg]:text-white/90"
                                      : posDef.id === "5"
                                        ? "bg-amber-500 hover:bg-amber-600 border-amber-600 text-white [&>svg]:text-white/90"
                                        : posDef.id === "6"
                                          ? "bg-purple-500 hover:bg-purple-600 border-purple-600 text-white [&>svg]:text-white/90"
                                          : posDef.id === "7"
                                            ? "bg-lime-500 hover:bg-lime-600 border-lime-600 text-white [&>svg]:text-white/90"
                                            : posDef.id === "8"
                                              ? "bg-teal-500 hover:bg-teal-600 border-teal-600 text-white [&>svg]:text-white/90"
                                              : posDef.id === "9"
                                                ? "bg-cyan-500 hover:bg-cyan-600 border-cyan-600 text-white [&>svg]:text-white/90"
                                                : "bg-zinc-500 hover:bg-zinc-600 border-zinc-600 text-white [&>svg]:text-white/90"
                              : "bg-muted hover:bg-muted/80 text-foreground border-border"
                          )}
                          triggerTextClassName={
                            posDef
                              ? "text-white font-black text-center flex-1"
                              : "text-foreground font-black text-center flex-1"
                          }
                        />

                        <Input
                          placeholder="背番"
                          maxLength={4}
                          disabled={!canEdit}
                          className="w-14 h-11 px-1.5 rounded-xl bg-muted/45 border border-border text-center font-mono tabular-nums font-black text-xs focus-visible:ring-1 shrink-0"
                          value={player.uniformNumber || ""}
                          onChange={(e) => {
                            const list = [...opponentLineup];
                            list[index] = {
                              ...list[index],
                              uniformNumber: e.target.value.replace(/^#/, ""),
                            };
                            onChangeState({ opponentLineup: list });
                          }}
                        />

                        <Input
                          placeholder="相手選手名"
                          disabled={!canEdit}
                          className={cn(
                            "flex-1 h-11 border-none bg-transparent font-bold text-base sm:text-sm focus-visible:ring-0 min-w-0",
                            isCompleted
                              ? "text-foreground"
                              : "text-muted-foreground"
                          )}
                          value={player.name}
                          onChange={(e) => {
                            const list = [...opponentLineup];
                            list[index] = {
                              ...list[index],
                              name: e.target.value,
                            };
                            onChangeState({ opponentLineup: list });
                          }}
                        />
                      </>
                    )}

                    {canEdit && index >= 9 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBatter(activeTab, index)}
                        className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 active:scale-95 transition-all shrink-0 cursor-pointer"
                        title="この打順枠を削除"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}

                    {isCompleted && (
                      <div className="w-6 flex justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>

          {/* DH制・先発投手（打順外・守備専任）の保持・選択表示 */}
          {activeTab === "myTeam" &&
            (Boolean(activeDhStarterPitcher) ||
              (canEdit &&
                myLineup.some((s) => s.position === "DH") &&
                !myLineup.some(
                  (s) =>
                    Boolean(s.playerId || s.name.trim()) && s.position === "1"
                ))) && (
              <div className="p-2.5 rounded-2xl border border-border bg-muted/45 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="px-2 py-1 rounded-lg bg-red-500 text-white font-black text-[10px] shrink-0">
                      先発投手(DH)
                    </span>
                    {activeDhStarterPitcher ? (
                      <>
                        <span className="text-xs sm:text-sm font-black text-foreground truncate">
                          {activeDhStarterPitcher.uniformNumber
                            ? `#${activeDhStarterPitcher.uniformNumber} `
                            : ""}
                          {activeDhStarterPitcher.name}
                        </span>
                        {renderPlayerWorkloadBadges(
                          teamPlayers.find(
                            (tp) => tp.id === activeDhStarterPitcher.playerId
                          ) || null
                        )}
                      </>
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground">
                        DH制の先発投手（打席なし）を選択
                      </span>
                    )}
                  </div>
                  {canEdit && activeDhStarterPitcher && (
                    <button
                      type="button"
                      onClick={() => onChangeState({ dhStarterPitcher: null })}
                      className="px-2 py-1 rounded-lg border border-border bg-card hover:bg-muted text-[10px] font-black text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                    >
                      解除
                    </button>
                  )}
                </div>

                {canEdit && (
                  <LiffSelect
                    value={activeDhStarterPitcher?.playerId || ""}
                    onChange={(val: string) => {
                      if (!val) {
                        onChangeState({ dhStarterPitcher: null });
                        return;
                      }
                      const p = teamPlayers.find((tp) => tp.id === val);
                      if (!p) return;
                      onChangeState({
                        dhStarterPitcher: {
                          order: 0,
                          playerId: p.id,
                          name: p.name,
                          uniformNumber: p.uniformNumber || "",
                          position: "1",
                        },
                      });
                    }}
                    title="DH制・先発投手を選択"
                    placeholder="先発投手（打席なし）を選択..."
                    options={[
                      { value: "", label: "未設定（打順内で投手を指定）" },
                      ...teamPlayers
                        .filter(
                          (tp) =>
                            !myLineup.some((slot) => slot.playerId === tp.id) &&
                            effectiveAttendance[tp.id] !== "absent" &&
                            effectiveAttendance[tp.id] !== "excluded" &&
                            normalizePlayerConditionStatus(
                              tp.conditionStatus
                            ) !== "rehab"
                        )
                        .map((tp) => {
                          const pw = evaluatePreMatchWorkloadWarning({
                            yesterdayPitches: tp.yesterdayPitches,
                            last7DaysPitches: tp.last7DaysPitches,
                            dailyLimit: pitchLimitSpec.limit,
                          });
                          return {
                            value: tp.id,
                            label: `${
                              tp.uniformNumber ? `#${tp.uniformNumber} ` : ""
                            }${tp.name}`,
                            badge: pw.shortBadge || undefined,
                            badgeTone:
                              pw.severity === "high"
                                ? ("rose" as const)
                                : pw.severity === "caution"
                                  ? ("amber" as const)
                                  : undefined,
                          };
                        }),
                    ]}
                  />
                )}
              </div>
            )}

          {/* EDH（全員打撃）対応: 打順追加ボタン */}
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleAddBatter(activeTab)}
              className="w-full h-11 rounded-2xl border border-dashed border-primary/35 bg-card text-primary font-black text-xs flex items-center justify-center gap-1.5 hover:bg-primary/5 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>打順（バッター）を追加（全員打撃対応）</span>
            </Button>
          )}
        </div>
      </section>

      {/* 👥 【セクション2】ベンチ（控え）・欠席メンバー */}
      {activeTab === "myTeam" ? (
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-xs font-black text-white flex items-center gap-1.5">
              <Users className="w-4 h-4 text-sky-400" />
              <span>ベンチ（控え）・欠席メンバー</span>
            </h3>
            <div className="flex gap-1.5 flex-wrap">
              <span className="text-[10px] font-black bg-primary text-primary-foreground px-2 py-0.5 rounded-full tabular-nums">
                控え: {benchCount}人
              </span>
              <span className="text-[10px] font-black bg-slate-800 text-slate-200 border border-slate-700 px-2 py-0.5 rounded-full tabular-nums">
                欠席: {absentCount}人
              </span>
              {excludedCount > 0 && (
                <span className="text-[10px] font-black bg-slate-900 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full tabular-nums">
                  対象外: {excludedCount}人
                </span>
              )}
            </div>
          </div>

          <div className="p-3 bg-card space-y-2">
            {excludedCount > 0 && (
              <div className="px-3 py-2 rounded-xl bg-muted/50 border border-border text-[10.5px] font-bold text-muted-foreground leading-relaxed">
                基準日より後に入団・追加された選手は自動的に「対象外」となります（体験参加等で当日ベンチ入りしていた場合は「控え」へ切替可能です）。
              </div>
            )}

            {teamPlayers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="選手がまだ登録されていません"
                description="スタメン枠をタップすると名簿外の選手名も手入力して守備位置を設定できます。チーム選手名簿が登録されると控え・欠席の振り分けも行えます"
              />
            ) : remainingPlayers.length === 0 ? (
              <div className="text-center py-6 bg-card rounded-2xl border border-border shadow-xs">
                <p className="text-xs font-black text-muted-foreground">
                  全選手がスタメンに登録されています
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                {remainingPlayers.map((player) => {
                  const status = effectiveAttendance[player.id] || "bench";
                  const isAbsent = status === "absent";
                  const isExcluded = status === "excluded";
                  const isJoinedAfter = isPlayerJoinedAfterMatch(
                    player,
                    matchRosterCtx
                  );
                  const joinedShort = formatPlayerJoinedShortDate(
                    player.joinedAt
                  );
                  const isLockedBySchedule =
                    linkageMode === "match" &&
                    scheduleAbsents.includes(player.id);
                  const condStatus = normalizePlayerConditionStatus(
                    player.conditionStatus
                  );
                  const condMeta = PLAYER_CONDITION_META[condStatus];

                  return (
                    <div
                      key={player.id}
                      className={cn(
                        "flex items-center justify-between p-2.5 pl-3 rounded-2xl border border-border shadow-xs transition-all gap-2",
                        isExcluded
                          ? "bg-muted/50 opacity-80"
                          : isAbsent
                            ? "bg-muted/35"
                            : "bg-card"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={cn(
                            "text-xs font-black min-w-[24px] text-center px-1 py-0.5 rounded-md shrink-0 tabular-nums",
                            isExcluded || isAbsent
                              ? "bg-muted text-muted-foreground"
                              : "bg-primary/10 text-primary"
                          )}
                        >
                          {player.uniformNumber
                            ? `#${player.uniformNumber}`
                            : "-"}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={cn(
                                "text-xs sm:text-sm font-black block truncate",
                                isAbsent
                                  ? "text-muted-foreground line-through"
                                  : isExcluded
                                    ? "text-muted-foreground"
                                    : "text-foreground"
                              )}
                            >
                              {player.name}
                            </span>
                            {isJoinedAfter && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[9.5px] font-black shrink-0">
                                入団前{joinedShort ? ` (${joinedShort}〜)` : ""}
                              </span>
                            )}
                            {condStatus !== "active" && (
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[9.5px] font-black shrink-0",
                                  condMeta.solidBadgeClass
                                )}
                              >
                                {condMeta.compactBadgeText}
                              </span>
                            )}
                            {renderPlayerWorkloadBadges(player)}
                          </div>
                          {player.conditionNote && (
                            <span className="text-[9.5px] font-bold text-muted-foreground flex items-center gap-1 truncate mt-0.5">
                              <Lock className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">
                                {player.conditionNote}
                              </span>
                            </span>
                          )}
                          {isLockedBySchedule && (
                            <span className="text-[9.5px] font-bold text-muted-foreground block">
                              ※出欠表で欠席登録済
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 控え / 欠席 / 対象外 3セグメントトグル */}
                      <div className="flex gap-0.5 bg-muted p-1 rounded-2xl w-[178px] sm:w-[196px] shrink-0 border border-border">
                        <button
                          type="button"
                          onClick={() => {
                            if (!canEdit) return;
                            if (isLockedBySchedule) {
                              toast.error(
                                "出欠管理で欠席登録されているため、控えに変更できません。"
                              );
                              return;
                            }
                            setPlayerAttendanceStatus(player.id, "bench");
                          }}
                          disabled={!canEdit || isLockedBySchedule}
                          className={cn(
                            "flex-1 flex items-center justify-center py-1.5 px-1 rounded-xl text-[10.5px] sm:text-[11px] transition-all",
                            status === "bench"
                              ? "bg-card text-foreground shadow-sm border border-border font-black"
                              : "text-muted-foreground hover:text-foreground font-bold border border-transparent",
                            !canEdit
                              ? "cursor-default"
                              : isLockedBySchedule
                                ? "opacity-45 cursor-not-allowed"
                                : "cursor-pointer"
                          )}
                        >
                          <UserCheck
                            className={cn(
                              "w-3 h-3 mr-0.5 shrink-0",
                              status === "bench"
                                ? "text-primary"
                                : "text-muted-foreground"
                            )}
                          />
                          控え
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            if (!canEdit) return;
                            setPlayerAttendanceStatus(player.id, "absent");
                          }}
                          className={cn(
                            "flex-1 flex items-center justify-center py-1.5 px-1 rounded-xl text-[10.5px] sm:text-[11px] transition-all",
                            canEdit ? "cursor-pointer" : "cursor-default",
                            status === "absent"
                              ? "bg-card text-foreground shadow-sm border border-border font-black"
                              : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                          )}
                        >
                          <UserMinus
                            className={cn(
                              "w-3 h-3 mr-0.5 shrink-0",
                              status === "absent"
                                ? "text-primary"
                                : "text-muted-foreground"
                            )}
                          />
                          欠席
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            if (!canEdit) return;
                            setPlayerAttendanceStatus(player.id, "excluded");
                          }}
                          title="入団前・ベンチ外・未帯同として除外"
                          className={cn(
                            "flex-1 flex items-center justify-center py-1.5 px-1 rounded-xl text-[10.5px] sm:text-[11px] transition-all",
                            canEdit ? "cursor-pointer" : "cursor-default",
                            status === "excluded"
                              ? "bg-card text-foreground shadow-sm border border-border font-black"
                              : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                          )}
                        >
                          <Ban
                            className={cn(
                              "w-3 h-3 mr-0.5 shrink-0",
                              status === "excluded"
                                ? "text-amber-600"
                                : "text-muted-foreground"
                            )}
                          />
                          対象外
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-xs font-black text-white flex items-center gap-1.5">
              <Users className="w-4 h-4 text-sky-400" />
              <span>相手ベンチ（控え）メンバー</span>
            </h3>
            <span className="text-[10px] font-black bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full tabular-nums">
              控え: {filledOpponentBenchCount}人
            </span>
          </div>

          <div className="p-3 space-y-2.5 bg-card">
            {opponentBench.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/35 p-4 text-center space-y-1.5">
                <p className="text-xs font-black text-foreground">
                  相手チームの控えメンバーはまだ登録されていません
                </p>
                <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                  メンバー表交換で受け取った相手の控え選手（背番号・氏名・ポジション）を登録しておくと、交代入力やスコア清書でもそのまま活用できます
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {opponentBench.map((benchPlayer, bIdx) => {
                  const posDef = LINEUP_POSITIONS.find(
                    (p) => p.id === (benchPlayer.position || "")
                  );
                  const hasInput = Boolean(
                    (benchPlayer.name && benchPlayer.name.trim()) ||
                      (benchPlayer.uniformNumber &&
                        benchPlayer.uniformNumber.trim())
                  );

                  return (
                    <div
                      key={benchPlayer.id || `opp-bench-${bIdx}`}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-2xl bg-card shadow-xs transition-all",
                        hasInput
                          ? "border border-border"
                          : "border border-dashed border-border"
                      )}
                    >
                      <div className="w-7 text-center font-black text-[10px] text-muted-foreground shrink-0">
                        控{bIdx + 1}
                      </div>

                      <LiffSelect
                        value={benchPlayer.position || ""}
                        disabled={!canEdit}
                        onChange={(val) => {
                          const next = [...opponentBench];
                          next[bIdx] = { ...next[bIdx], position: val };
                          onChangeState({ opponentBench: next });
                        }}
                        options={[
                          {
                            value: "",
                            label: "控え（守備指定なし）",
                          },
                          ...LINEUP_POSITIONS.map((p) => ({
                            value: p.id,
                            label: p.label,
                          })),
                        ]}
                        displayValueOverride={posDef ? posDef.label : "控え"}
                        title={`相手控え ${bIdx + 1}人目のポジション（任意）`}
                        searchable={false}
                        className={cn(
                          "w-20 h-11 rounded-xl px-2.5 shrink-0",
                          posDef
                            ? posDef.id === "1"
                              ? "bg-red-500 hover:bg-red-600 border-red-600 text-white [&>svg]:text-white/90"
                              : posDef.id === "2"
                                ? "bg-blue-500 hover:bg-blue-600 border-blue-600 text-white [&>svg]:text-white/90"
                                : posDef.id === "3"
                                  ? "bg-orange-500 hover:bg-orange-600 border-orange-600 text-white [&>svg]:text-white/90"
                                  : posDef.id === "4"
                                    ? "bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white [&>svg]:text-white/90"
                                    : posDef.id === "5"
                                      ? "bg-amber-500 hover:bg-amber-600 border-amber-600 text-white [&>svg]:text-white/90"
                                      : posDef.id === "6"
                                        ? "bg-purple-500 hover:bg-purple-600 border-purple-600 text-white [&>svg]:text-white/90"
                                        : posDef.id === "7"
                                          ? "bg-lime-500 hover:bg-lime-600 border-lime-600 text-white [&>svg]:text-white/90"
                                          : posDef.id === "8"
                                            ? "bg-teal-500 hover:bg-teal-600 border-teal-600 text-white [&>svg]:text-white/90"
                                            : posDef.id === "9"
                                              ? "bg-cyan-500 hover:bg-cyan-600 border-cyan-600 text-white [&>svg]:text-white/90"
                                              : "bg-zinc-500 hover:bg-zinc-600 border-zinc-600 text-white [&>svg]:text-white/90"
                            : "bg-muted hover:bg-muted/80 text-foreground border-border"
                        )}
                        triggerTextClassName={
                          posDef
                            ? "text-white font-black text-center flex-1"
                            : "text-muted-foreground font-black text-center flex-1"
                        }
                      />

                      <Input
                        placeholder="背番"
                        maxLength={4}
                        disabled={!canEdit}
                        className="w-14 h-11 px-1.5 rounded-xl bg-muted/45 border border-border text-center font-mono tabular-nums font-black text-xs focus-visible:ring-1 shrink-0"
                        value={benchPlayer.uniformNumber || ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/^#/, "");
                          const next = [...opponentBench];
                          next[bIdx] = { ...next[bIdx], uniformNumber: val };
                          onChangeState({ opponentBench: next });
                        }}
                      />

                      <Input
                        placeholder="相手控え選手名"
                        disabled={!canEdit}
                        className={cn(
                          "flex-1 h-11 border-none bg-transparent font-bold text-base sm:text-sm focus-visible:ring-0 min-w-0",
                          hasInput ? "text-foreground" : "text-muted-foreground"
                        )}
                        value={benchPlayer.name}
                        onChange={(e) => {
                          const next = [...opponentBench];
                          next[bIdx] = { ...next[bIdx], name: e.target.value };
                          onChangeState({ opponentBench: next });
                        }}
                      />

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOpponentBench(bIdx)}
                          className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 active:scale-95 transition-all shrink-0 cursor-pointer"
                          title="この控え枠を削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {canEdit && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddOpponentBench(1)}
                  className="flex-1 h-11 rounded-2xl border border-dashed border-primary/35 bg-card text-primary font-black text-xs flex items-center justify-center gap-1.5 hover:bg-primary/5 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>控え選手を追加</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddOpponentBench(5)}
                  className="h-11 px-3.5 rounded-2xl border border-border bg-muted/50 hover:bg-muted text-foreground font-black text-xs flex items-center justify-center gap-1 active:scale-[0.98] transition-all cursor-pointer shadow-xs shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 text-primary" />
                  <span>5枠追加</span>
                </Button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 💾 保存 & LINE連絡用メンバー表コピー アクション */}
      {(primarySaveButton || showCopyShareButton) && (
        <div className="pt-2 space-y-2.5">
          {primarySaveButton && canEdit && (
            <Button
              type="button"
              onClick={primarySaveButton.onSave}
              disabled={primarySaveButton.isSaving}
              className="w-full h-14 rounded-2xl text-base font-black tracking-wide shadow-md shadow-primary/25 active:scale-[0.98] transition-all gap-2"
            >
              {primarySaveButton.isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{primarySaveButton.savingLabel || "保存中..."}</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>{primarySaveButton.label}</span>
                </>
              )}
            </Button>
          )}

          {showCopyShareButton && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCopyLineupText()}
              className="w-full h-11 rounded-2xl border-border hover:border-[#06C755]/40 bg-card font-black text-xs text-foreground hover:bg-muted gap-1.5 shadow-xs"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4 text-[#06C755]" />
                  <span>メンバー表をコピーしました！</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[#06C755]" />
                  <span>LINE連絡用メンバー表テキストをコピー</span>
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* 📁 テンプレート保存モーダル (Portal z-[9999]) */}
      {mounted &&
        isTemplateModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/65 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setIsTemplateModalOpen(false)}
          >
            <div
              className="bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-white">
                    テンプレート保存
                  </h3>
                  <p className="text-[11px] font-bold text-slate-300 mt-0.5">
                    現在のスタメンを基本オーダーとして保存します
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-5 space-y-4 bg-card">
                <Input
                  placeholder="例：Aチーム 基本オーダー"
                  className="h-12 rounded-2xl bg-muted/50 border-border font-bold text-base sm:text-sm"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />

                <div className="flex gap-2.5 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsTemplateModalOpen(false)}
                    className="flex-1 h-12 rounded-2xl border-border font-black"
                  >
                    キャンセル
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleSaveTemplate()}
                    className="flex-1 h-12 rounded-2xl font-black shadow-xs"
                  >
                    保存する
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ⚾ 選手・守備位置 2ステップ選択モーダル（Portal z-[9999]） */}
      {mounted &&
        activeSelectionIndex !== null &&
        myLineup[activeSelectionIndex] &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/65 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => {
              setActiveSelectionIndex(null);
              setTempSelectedPlayer(null);
            }}
          >
            <div
              className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col max-h-[88dvh] text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              {/* A-3 ダークソリッドキャップ */}
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-white">
                    {modalStep === "player" ? "選手を選択" : "守備位置を選択"}
                  </h3>
                  <p className="text-[11px] text-slate-300 font-bold mt-0.5 truncate">
                    {activeSelectionIndex + 1}番打者
                    {modalStep === "position" && tempSelectedPlayer
                      ? ` : ${
                          tempSelectedPlayer.uniformNumber
                            ? `#${tempSelectedPlayer.uniformNumber} `
                            : ""
                        }${tempSelectedPlayer.name}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSelectionIndex(null);
                    setTempSelectedPlayer(null);
                  }}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 sm:p-5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-5 flex flex-col flex-1 overflow-hidden bg-card">
                {modalStep === "player" ? (
                  <>
                    {teamPlayers.length > 0 && (
                      <div className="mb-3 relative shrink-0">
                        <Input
                          placeholder="選手名または背番号で検索..."
                          value={playerSearchQuery}
                          onChange={(e) => setPlayerSearchQuery(e.target.value)}
                          className="h-11 rounded-xl bg-muted/50 border-border font-bold pl-3.5 pr-12 text-base sm:text-sm"
                        />
                        {playerSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setPlayerSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            クリア
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 min-h-[220px]">
                      {/* 選択解除ボタン */}
                      <button
                        type="button"
                        onClick={() => {
                          const list = [...myLineup];
                          list[activeSelectionIndex] = {
                            ...list[activeSelectionIndex],
                            playerId: "",
                            name: "",
                            uniformNumber: "",
                            position: "",
                          };
                          onChangeState({ myLineup: list });
                          setActiveSelectionIndex(null);
                          setTempSelectedPlayer(null);
                          toast.success(
                            `${activeSelectionIndex + 1}番の選択を解除しました`
                          );
                        }}
                        className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all cursor-pointer"
                      >
                        選択をクリアする（空欄にする）
                      </button>

                      {(() => {
                        const query = playerSearchQuery.trim().toLowerCase();
                        const filtered = teamPlayers.filter((p) => {
                          const nameMatch = p.name
                            .toLowerCase()
                            .includes(query);
                          const numMatch = p.uniformNumber
                            ? p.uniformNumber.includes(query)
                            : false;
                          return nameMatch || numMatch;
                        });

                        if (teamPlayers.length > 0 && filtered.length === 0) {
                          return (
                            <div className="text-center py-8">
                              <p className="text-xs font-bold text-muted-foreground">
                                一致する名簿選手が見つかりません
                              </p>
                            </div>
                          );
                        }

                        const disabledPlayers = getDisabledPlayers(
                          myLineup,
                          activeSelectionIndex
                        );

                        return filtered.map((p) => {
                          const isAlreadySelected = disabledPlayers.includes(
                            p.id
                          );
                          const isAbsent = effectiveAttendance[p.id] === "absent";
                          const isExcluded =
                            effectiveAttendance[p.id] === "excluded";
                          const condStatus = normalizePlayerConditionStatus(
                            p.conditionStatus
                          );
                          const condMeta = PLAYER_CONDITION_META[condStatus];
                          const isRehab = condStatus === "rehab";
                          const isDisabled =
                            isAlreadySelected ||
                            isAbsent ||
                            isExcluded ||
                            isRehab;
                          const assignedOrder = myLineup.find(
                            (item, idx) =>
                              idx !== activeSelectionIndex &&
                              item.playerId === p.id
                          )?.order;

                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => {
                                setTempSelectedPlayer(p);
                                setModalStep("position");
                              }}
                              className={cn(
                                "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left cursor-pointer",
                                myLineup[activeSelectionIndex].playerId === p.id
                                  ? "bg-primary/10 border-primary text-primary"
                                  : "bg-card hover:bg-muted/40 border-border",
                                isDisabled &&
                                  "opacity-55 cursor-not-allowed bg-muted/35 hover:bg-muted/35"
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span className="text-xs font-black min-w-[26px] text-primary shrink-0 tabular-nums">
                                    {p.uniformNumber
                                      ? `#${p.uniformNumber}`
                                      : "-"}
                                  </span>
                                  <span className="text-sm font-black text-foreground truncate">
                                    {p.name}
                                  </span>
                                  {renderPlayerWorkloadBadges(p)}
                                </div>
                                {p.conditionNote && (
                                  <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 truncate mt-0.5 pl-[34px]">
                                    <Lock className="w-2.5 h-2.5 shrink-0" />
                                    <span className="truncate">
                                      {p.conditionNote}
                                    </span>
                                  </p>
                                )}
                              </div>

                              <div className="flex gap-1.5 items-center shrink-0 ml-2">
                                {isAlreadySelected && (
                                  <span className="text-[10px] font-black bg-muted text-muted-foreground px-2 py-0.5 rounded-md">
                                    {assignedOrder
                                      ? `選択中 (${assignedOrder}番)`
                                      : "選択中 (先発P)"}
                                  </span>
                                )}
                                {isAbsent && (
                                  <span className="text-[10px] font-black bg-muted text-muted-foreground px-2 py-0.5 rounded-md">
                                    欠席
                                  </span>
                                )}
                                {!isAlreadySelected &&
                                  !isAbsent &&
                                  isExcluded && (
                                    <span className="text-[10px] font-black bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 px-2 py-0.5 rounded-md">
                                      対象外
                                    </span>
                                  )}
                                {!isAlreadySelected &&
                                  !isAbsent &&
                                  !isExcluded &&
                                  isRehab && (
                                    <span
                                      className={cn(
                                        "text-[10px] font-black px-2 py-0.5 rounded-md",
                                        condMeta.solidBadgeClass
                                      )}
                                    >
                                      🩹 調整中（出場不可）
                                    </span>
                                  )}
                                {!isAlreadySelected &&
                                  !isAbsent &&
                                  !isExcluded &&
                                  !isRehab && (
                                    <>
                                      {condStatus === "restricted" && (
                                        <span
                                          className={cn(
                                            "text-[10px] font-black px-2 py-0.5 rounded-md",
                                            condMeta.solidBadgeClass
                                          )}
                                        >
                                          {condMeta.compactBadgeText}
                                        </span>
                                      )}
                                      <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                                        起用可能
                                      </span>
                                    </>
                                  )}
                              </div>
                            </button>
                          );
                        });
                      })()}

                      {/* 助っ人・名簿未登録選手の手入力（守備位置重複制御はそのまま適用） */}
                      <div className="mt-2 pt-2.5 border-t border-border space-y-2">
                        <span className="block text-[11px] font-black text-muted-foreground">
                          名簿外の選手・助っ人を手入力して設定
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Input
                            placeholder="背番"
                            maxLength={4}
                            value={guestManualUniform}
                            onChange={(e) =>
                              setGuestManualUniform(
                                e.target.value.replace(/^#/, "")
                              )
                            }
                            className="w-16 h-10 px-2 rounded-xl bg-muted/45 border-border text-center font-mono font-black text-base sm:text-xs shrink-0"
                          />
                          <Input
                            placeholder="選手名を入力..."
                            value={guestManualName}
                            onChange={(e) => setGuestManualName(e.target.value)}
                            className="flex-1 h-10 rounded-xl bg-muted/45 border-border font-bold text-base sm:text-xs"
                          />
                          <Button
                            type="button"
                            disabled={!guestManualName.trim()}
                            onClick={() => {
                              const cleanName = guestManualName.trim();
                              if (!cleanName) return;
                              setTempSelectedPlayer({
                                id: "",
                                name: cleanName,
                                uniformNumber:
                                  guestManualUniform.trim() || null,
                              });
                              setModalStep("position");
                            }}
                            className="h-10 px-3 rounded-xl font-black text-xs shrink-0"
                          >
                            守備選択へ
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col flex-1 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setModalStep("player")}
                      className="text-xs text-primary font-black flex items-center gap-1 hover:underline mb-3 self-start cursor-pointer shrink-0"
                    >
                      ← 選手選択に戻る
                    </button>

                    {tempSelectedPlayer &&
                      (() => {
                        const preWarn = evaluatePreMatchWorkloadWarning({
                          yesterdayPitches: tempSelectedPlayer.yesterdayPitches,
                          last7DaysPitches: tempSelectedPlayer.last7DaysPitches,
                          dailyLimit: pitchLimitSpec.limit,
                        });
                        if (preWarn.severity === "none") return null;
                        return (
                          <div
                            className={cn(
                              "mb-3 p-2.5 rounded-xl border border-l-4 space-y-1 shrink-0",
                              preWarn.severity === "high"
                                ? "bg-red-50 border-red-300 border-l-red-600 text-red-950 dark:bg-red-950 dark:border-red-800 dark:border-l-red-500 dark:text-red-100"
                                : "bg-amber-50 border-amber-300 border-l-amber-500 text-amber-950 dark:bg-amber-950 dark:border-amber-800 dark:border-l-amber-500 dark:text-amber-100"
                            )}
                          >
                            <div className="flex items-center justify-between gap-1.5 flex-wrap text-[11px] font-black">
                              <span className="inline-flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>肩肘保護アラート（投 (1) 起用注意）</span>
                              </span>
                              {preWarn.shortBadge && (
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[10px] font-black tabular-nums",
                                    preWarn.severity === "high"
                                      ? "bg-red-600 text-white"
                                      : "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100"
                                  )}
                                >
                                  {preWarn.shortBadge}
                                </span>
                              )}
                            </div>
                            <p className="text-[10.5px] font-bold leading-snug">
                              {preWarn.message}
                            </p>
                          </div>
                        );
                      })()}

                    {tempSelectedPlayer &&
                      normalizePlayerConditionStatus(
                        tempSelectedPlayer.conditionStatus
                      ) === "restricted" && (
                        <div className="mb-3 p-2.5 rounded-xl bg-amber-500/12 border border-amber-500/35 border-l-4 border-l-amber-500 space-y-0.5 shrink-0">
                          <div className="flex items-center justify-between gap-1.5 flex-wrap text-[11px] font-black text-amber-800 dark:text-amber-300">
                            <span>⚠️ 一部プレー制限ありの選手です</span>
                            {tempSelectedPlayer.activeConditionPeriod && (
                              <span className="px-1.5 py-0.5 rounded bg-card border border-border text-[10px] font-black text-foreground tabular-nums">
                                {formatConditionPeriodRange(
                                  tempSelectedPlayer.activeConditionPeriod
                                    .startDate,
                                  tempSelectedPlayer.activeConditionPeriod
                                    .endDate,
                                  { compact: true }
                                )}
                              </span>
                            )}
                          </div>
                          <p className="text-[10.5px] font-bold text-foreground leading-snug">
                            {tempSelectedPlayer.conditionNote
                              ? `共有メモ: ${tempSelectedPlayer.conditionNote}`
                              : "投球や守備負荷に制限がないか確認して守備位置を選択してください。"}
                          </p>
                        </div>
                      )}

                    <p className="text-xs text-muted-foreground font-bold mb-3 shrink-0">
                      {tempSelectedPlayer?.name} 選手の守備位置を選択してください
                    </p>

                    <div className="grid grid-cols-2 gap-2.5 flex-1 overflow-y-auto pr-0.5">
                      {(() => {
                        const disabledPos = getDisabledPositions(
                          myLineup,
                          activeSelectionIndex
                        );

                        return LINEUP_POSITIONS.map((pos) => {
                          const isPosDisabled = disabledPos.includes(pos.id);
                          const isCurrentPos =
                            myLineup[activeSelectionIndex].position === pos.id;

                          return (
                            <button
                              key={pos.id}
                              type="button"
                              disabled={isPosDisabled}
                              onClick={() => {
                                if (!tempSelectedPlayer) return;
                                const list = [...myLineup];
                                list[activeSelectionIndex] = {
                                  ...list[activeSelectionIndex],
                                  playerId: tempSelectedPlayer.id || "",
                                  name: tempSelectedPlayer.name,
                                  uniformNumber:
                                    tempSelectedPlayer.uniformNumber || "",
                                  position: pos.id,
                                };
                                onChangeState({ myLineup: list });
                                setActiveSelectionIndex(null);
                                setTempSelectedPlayer(null);
                                setGuestManualName("");
                                setGuestManualUniform("");
                                toast.success(
                                  `${activeSelectionIndex + 1}番に ${
                                    tempSelectedPlayer.name
                                  } (${pos.label}) を設定しました`
                                );
                              }}
                              className={cn(
                                "h-12 rounded-2xl font-black text-xs text-white transition-all flex items-center justify-center shadow-xs relative cursor-pointer active:scale-95",
                                pos.color,
                                isCurrentPos && "ring-4 ring-primary/40",
                                isPosDisabled &&
                                  "opacity-35 cursor-not-allowed bg-muted text-muted-foreground shadow-none"
                              )}
                            >
                              <span>{pos.label}</span>
                              {isPosDisabled && (
                                <span className="absolute bottom-1 right-2 text-[9px] opacity-80">
                                  選択済
                                </span>
                              )}
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
