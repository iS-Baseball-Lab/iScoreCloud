// filepath: src/components/liff/PlayerProfileEditModal.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Check,
  Loader2,
  Camera,
  Sparkles,
  Flame,
  Shield,
  Music,
  Wrench,
  Heart,
  Ruler,
  Lock,
  Crown,
  Volume2,
  GraduationCap,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LiffSelect, type LiffSelectOption } from "@/components/liff/LiffSelect";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import {
  DEFENSIVE_POSITION_OPTIONS,
  EMPTY_PLAYER_PROFILE_DETAILS,
  FAVORITE_PRO_TEAM_PRESETS,
  GRADE_AGE_PRESETS_ADULT,
  GRADE_AGE_PRESETS_YOUTH,
  MAX_PLAY_STYLE_TAGS,
  PLAY_STYLE_TAGS,
  formatUnixTimestampToDateInput,
  normalizeCanonicalPositionCode,
  parsePlayerProfileDetails,
  saveDemoPlayerProfileOverride,
  type PlayStyleTagId,
  type PlayerProfileDetails,
} from "@/lib/liff/player-profile-schema";

export interface EditableDirectoryPlayer {
  id: string;
  name: string;
  nameKana: string | null;
  uniformNumber: string;
  nickname?: string | null;
  primaryPosition: string | null;
  subPositions: string[];
  registeredPrimaryPosition?: string | null;
  registeredSubPositions?: string[];
  throws: string | null;
  bats: string | null;
  height: number | null;
  weight: number | null;
  editableWeight?: number | null;
  profileImageUrl: string | null;
  notes: string | null;
  profileDetails?: PlayerProfileDetails;
  isCaptain: boolean;
  joinedAt?: number | null;
  isSelf?: boolean;
  isLinkedChild?: boolean;
}

export interface SavedPlayerProfilePayload {
  playerId: string;
  captainId?: string | null;
  updated: {
    name?: string;
    nameKana: string | null;
    uniformNumber?: string;
    nickname: string | null;
    registeredPrimaryPosition: string | null;
    registeredSubPositions: string[];
    throws: string | null;
    bats: string | null;
    height: number | null;
    weight: number | null;
    editableWeight: number | null;
    notes: string | null;
    profileDetails: PlayerProfileDetails;
    isCaptain?: boolean;
    joinedAt?: number | null;
  };
}

interface PlayerProfileEditModalProps {
  isOpen: boolean;
  teamId: string;
  isDemo: boolean;
  canManagePlayers: boolean;
  userId?: string | null;
  userName?: string | null;
  player: EditableDirectoryPlayer | null;
  onClose: () => void;
  onOpenPhotoCapture: (playerId: string, kind?: "portrait" | "action") => void;
  onSaved: (payload: SavedPlayerProfilePayload) => void;
}

const SEASON_GOAL_EXAMPLES: readonly string[] = [
  "打率3割＆全試合フル出場！",
  "エラーゼロで投手を助ける！",
  "チャンスで1本打てる勝負強い打者になる",
  "四死球ゼロ＆テンポの良い投球で勝たせる",
  "大きな声でチーム一番のムードメーカーになる！",
] as const;

const CUSTOM_TEAM_VALUE = "__custom__";

function cleanUniform(raw: string | null | undefined): string {
  if (!raw) return "--";
  const trimmed = raw.trim().replace(/^#/, "");
  return trimmed || "--";
}

export function PlayerProfileEditModal({
  isOpen,
  teamId,
  isDemo,
  canManagePlayers,
  userId,
  userName,
  player,
  onClose,
  onOpenPhotoCapture,
  onSaved,
}: PlayerProfileEditModalProps) {
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // 指導者・管理者限定項目
  const [officialName, setOfficialName] = useState<string>("");
  const [uniformNumber, setUniformNumber] = useState<string>("");
  const [isCaptain, setIsCaptain] = useState<boolean>(false);
  const [joinedDateStr, setJoinedDateStr] = useState<string>("");

  // 基本プロフィール
  const [nameKana, setNameKana] = useState<string>("");
  const [nickname, setNickname] = useState<string>("");
  const [agePresetTab, setAgePresetTab] = useState<"youth" | "adult">("adult");
  const [gradeOrAge, setGradeOrAge] = useState<string>("");
  const [baseballHistory, setBaseballHistory] = useState<string>("");

  // ポジション・投打
  const [throwsHand, setThrowsHand] = useState<string>("");
  const [batsHand, setBatsHand] = useState<string>("");
  const [primaryPos, setPrimaryPos] = useState<string>("");
  const [subPosList, setSubPosList] = useState<string[]>([]);

  // 目標・プレースタイル・紹介コメント
  const [seasonGoal, setSeasonGoal] = useState<string>("");
  const [playStyleTags, setPlayStyleTags] = useState<PlayStyleTagId[]>([]);
  const [notes, setNotes] = useState<string>("");

  // プロ名鑑トーク枠
  const [admiredPlayer, setAdmiredPlayer] = useState<string>("");
  const [favoriteTeamSelect, setFavoriteTeamSelect] = useState<string>("");
  const [favoriteTeamCustom, setFavoriteTeamCustom] = useState<string>("");
  const [gloveGear, setGloveGear] = useState<string>("");
  const [batGear, setBatGear] = useState<string>("");
  const [walkUpSong, setWalkUpSong] = useState<string>("");

  // フィジカル・自己ベスト
  const [heightStr, setHeightStr] = useState<string>("");
  const [weightStr, setWeightStr] = useState<string>("");
  const [hideWeight, setHideWeight] = useState<boolean>(false);
  const [maxVelocityStr, setMaxVelocityStr] = useState<string>("");
  const [dash50mStr, setDash50mStr] = useState<string>("");
  const [longTossStr, setLongTossStr] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !player) return;

    const details = player.profileDetails
      ? parsePlayerProfileDetails(player.profileDetails)
      : { ...EMPTY_PLAYER_PROFILE_DETAILS, playStyleTags: [] };

    setOfficialName(player.name || "");
    setUniformNumber(player.uniformNumber?.replace(/^#/, "") || "");
    setIsCaptain(Boolean(player.isCaptain));
    setJoinedDateStr(formatUnixTimestampToDateInput(player.joinedAt));

    setNameKana(player.nameKana || "");
    setNickname(player.nickname || "");

    const initialGrade = details.gradeOrAge || "";
    setGradeOrAge(initialGrade);
    if (
      GRADE_AGE_PRESETS_YOUTH.includes(initialGrade) ||
      player.isLinkedChild
    ) {
      setAgePresetTab("youth");
    } else {
      setAgePresetTab("adult");
    }
    setBaseballHistory(details.baseballHistory || "");

    setThrowsHand(
      player.throws === "R" || player.throws === "L" ? player.throws : ""
    );
    setBatsHand(
      player.bats === "R" || player.bats === "L" || player.bats === "B"
        ? player.bats
        : ""
    );

    const regPrim =
      normalizeCanonicalPositionCode(
        player.registeredPrimaryPosition ?? player.primaryPosition
      ) || "";
    setPrimaryPos(regPrim);

    const rawRegSubs =
      player.registeredSubPositions !== undefined
        ? player.registeredSubPositions
        : player.subPositions || [];
    const normalizedSubs = Array.from(
      new Set(
        rawRegSubs
          .map((sp) => normalizeCanonicalPositionCode(sp))
          .filter((c): c is NonNullable<typeof c> => Boolean(c && c !== regPrim))
      )
    );
    setSubPosList(normalizedSubs);

    setSeasonGoal(details.seasonGoal || "");
    setPlayStyleTags(details.playStyleTags || []);
    setNotes(player.notes || "");

    setAdmiredPlayer(details.admiredPlayer || "");
    const savedFavTeam = details.favoriteTeam || "";
    const isPresetFav = FAVORITE_PRO_TEAM_PRESETS.some(
      (item) => item.value === savedFavTeam
    );
    if (!savedFavTeam) {
      setFavoriteTeamSelect("");
      setFavoriteTeamCustom("");
    } else if (isPresetFav) {
      setFavoriteTeamSelect(savedFavTeam);
      setFavoriteTeamCustom("");
    } else {
      setFavoriteTeamSelect(CUSTOM_TEAM_VALUE);
      setFavoriteTeamCustom(savedFavTeam);
    }

    setGloveGear(details.gloveGear || "");
    setBatGear(details.batGear || "");
    setWalkUpSong(details.walkUpSong || "");

    setHeightStr(player.height ? String(player.height) : "");
    const rawEditableWeight =
      player.editableWeight !== undefined ? player.editableWeight : player.weight;
    setWeightStr(rawEditableWeight ? String(rawEditableWeight) : "");
    setHideWeight(Boolean(details.hideWeight));

    setMaxVelocityStr(
      details.maxVelocityKmh ? String(details.maxVelocityKmh) : ""
    );
    setDash50mStr(details.dash50mSec || "");
    setLongTossStr(details.longTossM ? String(details.longTossM) : "");
  }, [isOpen, player]);

  const favoriteTeamOptions = useMemo<LiffSelectOption[]>(() => {
    return [
      { value: "", label: "未選択（表示しない）", group: "基本" },
      ...FAVORITE_PRO_TEAM_PRESETS.map((t) => ({
        value: t.value,
        label: t.label,
        group: t.group,
      })),
      {
        value: CUSTOM_TEAM_VALUE,
        label: "その他（自由入力）",
        subLabel: "独立リーグ・MLB球団名などを自由に入力",
        group: "その他",
      },
    ];
  }, []);

  if (!isOpen || !player || typeof document === "undefined") return null;

  const numStr = cleanUniform(uniformNumber || player.uniformNumber);
  const initial = (officialName || player.name).replace(/\s+/g, "").slice(0, 1) || "選";

  const togglePlayStyleTag = (tagId: PlayStyleTagId) => {
    setPlayStyleTags((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      }
      if (prev.length >= MAX_PLAY_STYLE_TAGS) {
        toast.info(`得意プレータグは最大${MAX_PLAY_STYLE_TAGS}つまで選択できます`);
        return prev;
      }
      return [...prev, tagId];
    });
  };

  const toggleSubPosition = (code: string) => {
    if (code === primaryPos) {
      toast.info("メイン守備位置と同じポジションはサブに含められません");
      return;
    }
    setSubPosList((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      }
      if (prev.length >= 5) {
        toast.info("サブ・希望ポジションは最大5つまで選択できます");
        return prev;
      }
      return [...prev, code];
    });
  };

  const handleSelectPrimaryPos = (code: string) => {
    const nextCode = primaryPos === code ? "" : code;
    setPrimaryPos(nextCode);
    if (nextCode) {
      setSubPosList((prev) => prev.filter((c) => c !== nextCode));
    }
  };

  const handleSave = async () => {
    if (canManagePlayers && !officialName.trim()) {
      toast.error("正式登録名を入力してください");
      return;
    }

    setIsSaving(true);
    try {
      const resolvedFavoriteTeam =
        favoriteTeamSelect === CUSTOM_TEAM_VALUE
          ? favoriteTeamCustom.trim() || null
          : favoriteTeamSelect.trim() || null;

      const draftDetails: Partial<PlayerProfileDetails> = {
        seasonGoal: seasonGoal.trim() || null,
        playStyleTags,
        gradeOrAge: gradeOrAge.trim() || null,
        baseballHistory: baseballHistory.trim() || null,
        admiredPlayer: admiredPlayer.trim() || null,
        favoriteTeam: resolvedFavoriteTeam,
        gloveGear: gloveGear.trim() || null,
        batGear: batGear.trim() || null,
        walkUpSong: walkUpSong.trim() || null,
        maxVelocityKmh: maxVelocityStr.trim() ? Number(maxVelocityStr.trim()) : null,
        dash50mSec: dash50mStr.trim() || null,
        longTossM: longTossStr.trim() ? Number(longTossStr.trim()) : null,
        hideWeight,
      };

      const res = await fetch(
        `/api/liff/players/${encodeURIComponent(player.id)}/profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId,
            userId: userId || null,
            userName: userName || null,
            ...(canManagePlayers
              ? {
                  name: officialName.trim(),
                  uniformNumber: uniformNumber.trim().replace(/^#/, "") || player.uniformNumber,
                  isCaptain,
                  joinedAt: joinedDateStr.trim() || null,
                }
              : {}),
            nameKana: nameKana.trim() || null,
            nickname: nickname.trim() || null,
            registeredPrimaryPosition: primaryPos || null,
            registeredSubPositions: subPosList,
            throws: throwsHand || null,
            bats: batsHand || null,
            height: heightStr.trim() ? Number(heightStr.trim()) : null,
            weight: weightStr.trim() ? Number(weightStr.trim()) : null,
            notes: notes.trim() || null,
            profileDetails: draftDetails,
          }),
        }
      );

      const json = (await res.json()) as {
        success?: boolean;
        isDemo?: boolean;
        playerId?: string;
        captainId?: string | null;
        cleanedPastMatchesCount?: number;
        updated?: SavedPlayerProfilePayload["updated"];
        error?: string;
      };

      if (!res.ok || !json.success || !json.updated) {
        toast.error(json.error || "プロフィールの保存に失敗しました");
        return;
      }

      const resolvedUpdated: SavedPlayerProfilePayload["updated"] =
        isDemo || json.isDemo || teamId === "demo-team"
          ? {
              ...json.updated,
              profileDetails: {
                ...json.updated.profileDetails,
                actionImageUrl:
                  player.profileDetails?.actionImageUrl ??
                  json.updated.profileDetails.actionImageUrl ??
                  null,
              },
            }
          : json.updated;

      if (isDemo || json.isDemo || teamId === "demo-team") {
        saveDemoPlayerProfileOverride(player.id, {
          name: resolvedUpdated.name,
          nameKana: resolvedUpdated.nameKana,
          uniformNumber: resolvedUpdated.uniformNumber,
          nickname: resolvedUpdated.nickname,
          registeredPrimaryPosition: resolvedUpdated.registeredPrimaryPosition,
          registeredSubPositions: resolvedUpdated.registeredSubPositions,
          throws: resolvedUpdated.throws,
          bats: resolvedUpdated.bats,
          height: resolvedUpdated.height,
          weight: resolvedUpdated.weight,
          editableWeight: resolvedUpdated.editableWeight,
          notes: resolvedUpdated.notes,
          isCaptain: resolvedUpdated.isCaptain,
          joinedAt: resolvedUpdated.joinedAt,
          profileImageUrl: player.profileImageUrl,
          profileDetails: resolvedUpdated.profileDetails,
        });
      }

      invalidateLiffApiCache();

      onSaved({
        playerId: player.id,
        captainId: json.captainId,
        updated: resolvedUpdated,
      });

      if (json.cleanedPastMatchesCount && json.cleanedPastMatchesCount > 0) {
        toast.success(
          `${json.updated.name || player.name} 選手の名鑑を保存しました（入団前の過去試合 ${json.cleanedPastMatchesCount}件を控え対象外に更新）`
        );
      } else {
        toast.success(`${json.updated.name || player.name} 選手の名鑑プロフィールを保存しました！`);
      }
      onClose();
    } catch (err) {
      console.error("Failed to save player profile:", err);
      toast.error("通信エラーにより保存できませんでした");
    } finally {
      setIsSaving(false);
    }
  };

  const editorRoleBadge = player.isSelf
    ? "本人プロフィール編集"
    : player.isLinkedChild
    ? "お子様プロフィール編集"
    : "指導者・管理者編集";

  const activeGradePresets =
    agePresetTab === "youth" ? GRADE_AGE_PRESETS_YOUTH : GRADE_AGE_PRESETS_ADULT;

  return createPortal(
    <div className="fixed inset-0 z-[10020] flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={() => !isSaving && onClose()} />

      <div className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* ━━━ A-3 上帯ダークキャップ ━━━ */}
        <div className="px-4 py-3.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => onOpenPhotoCapture(player.id, "portrait")}
              className="relative shrink-0 cursor-pointer active:scale-95 transition-transform"
              title="正面写真を撮影・変更"
            >
              <Avatar className="h-12 w-12 border-2 border-slate-700">
                {player.profileImageUrl && (
                  <AvatarImage
                    src={player.profileImageUrl}
                    alt={player.name}
                    className="object-cover"
                  />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground font-black text-base">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground border border-[#0f172a] flex items-center justify-center">
                <Camera className="w-3 h-3" />
              </span>
            </button>

            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10.5px] font-black tabular-nums">
                  #{numStr}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-teal-300 text-[10px] font-black">
                  {editorRoleBadge}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-black text-white truncate">
                {officialName || player.name} の選手名鑑入力
              </h3>
            </div>
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ━━━ スクロール入力ボディ ━━━ */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 bg-muted/35">
          {/* 写真設定（丸枠の正面写真 ＆ カード背景のプレー写真）＋ 案内バナー */}
          <div className="p-3 rounded-2xl bg-card border border-border space-y-2.5 shadow-2xs">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onOpenPhotoCapture(player.id, "portrait")}
                className="px-2.5 py-2 rounded-xl bg-[#0f172a] text-white hover:bg-slate-800 border border-slate-700 text-[11px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="truncate">正面写真（丸枠）</span>
                {player.profileImageUrl && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-slate-950 text-[9px] font-black shrink-0">
                    済
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => onOpenPhotoCapture(player.id, "action")}
                className="px-2.5 py-2 rounded-xl bg-[#0f172a] text-white hover:bg-slate-800 border border-slate-700 text-[11px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="truncate">背景プレー写真</span>
                {player.profileDetails?.actionImageUrl && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-slate-950 text-[9px] font-black shrink-0">
                    済
                  </span>
                )}
              </button>
            </div>

            <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
              書きたい項目だけの入力でOK！未入力の枠は名鑑上で自動的に非表示になります。
            </p>
          </div>

          {/* 🔒 公式登録項目（指導者・管理者のみ編集可 / 一般選手にはロック案内） */}
          {canManagePlayers ? (
            <section className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
              <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-2 border-amber-500 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-black text-white">
                    公式名簿の登録項目
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[9.5px] font-black">
                  指導者・管理者限定
                </span>
              </div>
              <div className="p-3.5 space-y-3">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[11px] font-black text-foreground block">
                      正式選手名（スコアブック表記）<span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={40}
                      value={officialName}
                      onChange={(e) => setOfficialName(e.target.value)}
                      placeholder="例: 山田 翔太"
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-foreground block">
                      背番号
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={uniformNumber}
                      onChange={(e) => setUniformNumber(e.target.value)}
                      placeholder="10"
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-black tabular-nums text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                {/* 入団日（途中入団選手の過去試合控え混入防止） */}
                <div className="p-2.5 rounded-xl bg-muted/40 border border-border space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>入団日（過去試合の控え対象制御）</span>
                    </label>
                    {joinedDateStr && (
                      <button
                        type="button"
                        onClick={() => setJoinedDateStr("")}
                        className="px-2 py-0.5 rounded-md bg-card hover:bg-muted border border-border text-[10px] font-bold text-muted-foreground transition-colors cursor-pointer"
                      >
                        未設定に戻す
                      </button>
                    )}
                  </div>
                  <input
                    type="date"
                    value={joinedDateStr}
                    onChange={(e) => setJoinedDateStr(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-black tabular-nums text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                  <p className="text-[10px] font-bold text-muted-foreground leading-snug">
                    入団日を設定すると、その日より前の過去試合では「控え（ベンチ入り）」から自動で除外されます（体験参加した試合のみ個別で「控え」に変更も可能です）。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCaptain((prev) => !prev)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs flex items-center justify-between transition-all cursor-pointer ${
                    isCaptain
                      ? "bg-amber-500/12 border-amber-500 text-amber-800 dark:text-amber-300 font-black"
                      : "bg-muted/40 border-border text-muted-foreground font-bold hover:bg-muted/70"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Crown className={`w-3.5 h-3.5 ${isCaptain ? "text-amber-500 fill-amber-500" : ""}`} />
                    <span>チームの主将（キャプテン）に設定する</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black ${
                      isCaptain
                        ? "bg-amber-400 text-slate-950"
                        : "bg-card border border-border text-muted-foreground"
                    }`}
                  >
                    {isCaptain ? "主将 ON" : "OFF"}
                  </span>
                </button>
              </div>
            </section>
          ) : (
            <div className="px-3.5 py-2 rounded-xl bg-card border border-border flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                背番号（#{numStr}）・正式選手名（{player.name}）はスコアブック連動のため指導者管理です
              </span>
            </div>
          )}

          {/* ━━━ 章1: アナウンス・基本プロフィール ━━━ */}
          <section className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
            <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-2 border-primary flex items-center gap-2">
              <Volume2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span className="text-xs font-black text-white">
                1. 読みがな・コール名・学年/球歴
              </span>
            </div>

            <div className="p-3.5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    ふりがな（放送アナウンス用）
                  </label>
                  <input
                    type="text"
                    maxLength={50}
                    value={nameKana}
                    onChange={(e) => setNameKana(e.target.value)}
                    placeholder="例: ヤマダ ショウタ"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    応援コール名・ニックネーム
                  </label>
                  <input
                    type="text"
                    maxLength={24}
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="例: ショウタ / ヤマちゃん"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* 学年・年代 */}
              <div className="space-y-1.5 pt-1 border-t border-border">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-black text-foreground flex items-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5 text-primary" />
                    <span>学年・年代（任意）</span>
                  </label>
                  <div className="inline-flex rounded-lg bg-muted p-0.5 border border-border text-[10px]">
                    <button
                      type="button"
                      onClick={() => setAgePresetTab("adult")}
                      className={`px-2 py-0.5 rounded-md font-black transition-all cursor-pointer ${
                        agePresetTab === "adult"
                          ? "bg-card text-foreground shadow-2xs"
                          : "text-muted-foreground"
                      }`}
                    >
                      一般・草野球
                    </button>
                    <button
                      type="button"
                      onClick={() => setAgePresetTab("youth")}
                      className={`px-2 py-0.5 rounded-md font-black transition-all cursor-pointer ${
                        agePresetTab === "youth"
                          ? "bg-card text-foreground shadow-2xs"
                          : "text-muted-foreground"
                      }`}
                    >
                      学生・ジュニア
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {activeGradePresets.map((preset) => {
                    const selected = gradeOrAge.trim() === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setGradeOrAge(selected ? "" : preset)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] border transition-all active:scale-95 cursor-pointer ${
                          selected
                            ? "bg-primary text-primary-foreground border-primary font-black"
                            : "bg-muted/45 border-border text-foreground hover:bg-muted font-bold"
                        }`}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  maxLength={24}
                  value={gradeOrAge}
                  onChange={(e) => setGradeOrAge(e.target.value)}
                  placeholder="自由入力も可（例: 新6年 / 28歳 / 社会人3年目）"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* 球歴・出身校 */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground block">
                  球歴・出身校・野球歴（任意）
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={baseballHistory}
                  onChange={(e) => setBaseballHistory(e.target.value)}
                  placeholder="例: 〇〇高〜草野球5年目 / 小3入団・野球歴3年"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
          </section>

          {/* ━━━ 章2: 投打 ＆ 希望・守備可能ポジション ━━━ */}
          <section className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
            <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-2 border-teal-500 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span className="text-xs font-black text-white">
                2. 投打 ＆ 希望・守備可能ポジション
              </span>
            </div>

            <div className="p-3.5 space-y-3">
              {/* 投打 */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    投げる手
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: "R", label: "右投" },
                        { id: "L", label: "左投" },
                      ] as const
                    ).map((opt) => {
                      const active = throwsHand === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setThrowsHand(active ? "" : opt.id)}
                          className={`py-2 rounded-xl text-xs border transition-all active:scale-95 cursor-pointer ${
                            active
                              ? "bg-primary text-primary-foreground border-primary font-black"
                              : "bg-muted/45 border-border text-foreground hover:bg-muted font-bold"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    打つ手
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: "R", label: "右打" },
                        { id: "L", label: "左打" },
                        { id: "B", label: "両打" },
                      ] as const
                    ).map((opt) => {
                      const active = batsHand === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setBatsHand(active ? "" : opt.id)}
                          className={`py-2 rounded-xl text-xs border transition-all active:scale-95 cursor-pointer ${
                            active
                              ? "bg-primary text-primary-foreground border-primary font-black"
                              : "bg-muted/45 border-border text-foreground hover:bg-muted font-bold"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* メイン希望守備位置 */}
              <div className="space-y-1.5 pt-1 border-t border-border">
                <label className="text-[11px] font-black text-foreground block">
                  メイン希望ポジション（1つ選択）
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {DEFENSIVE_POSITION_OPTIONS.map((pos) => {
                    const active = primaryPos === pos.code;
                    return (
                      <button
                        key={pos.code}
                        type="button"
                        onClick={() => handleSelectPrimaryPos(pos.code)}
                        className={`py-1.5 px-1 rounded-xl border text-center transition-all active:scale-95 cursor-pointer ${
                          active
                            ? "bg-primary text-primary-foreground border-primary font-black shadow-2xs"
                            : "bg-muted/40 border-border text-foreground hover:bg-muted font-bold"
                        }`}
                      >
                        <span className="text-[9.5px] block opacity-80 leading-none">
                          {pos.code}
                        </span>
                        <span className="text-[11px] block mt-0.5 leading-tight">
                          {pos.shortLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* サブ・挑戦したいポジション */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-foreground">
                    サブ・挑戦したいポジション（複数可）
                  </label>
                  <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                    {subPosList.length}/5
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {DEFENSIVE_POSITION_OPTIONS.map((pos) => {
                    const isMain = primaryPos === pos.code;
                    const active = subPosList.includes(pos.code);
                    return (
                      <button
                        key={`sub-${pos.code}`}
                        type="button"
                        disabled={isMain}
                        onClick={() => toggleSubPosition(pos.code)}
                        className={`py-1.5 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                          isMain
                            ? "bg-muted/20 border-border/50 text-muted-foreground/40 cursor-not-allowed"
                            : active
                            ? "bg-teal-600 text-white border-teal-600 font-black shadow-2xs"
                            : "bg-muted/40 border-border text-foreground hover:bg-muted font-bold active:scale-95"
                        }`}
                      >
                        <span className="text-[11px] block leading-tight">
                          {pos.shortLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* ━━━ 章3: 今季の目標 ＆ プレースタイルタグ ━━━ */}
          <section className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
            <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-2 border-primary flex items-center gap-2">
              <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-black text-white">
                3. 今季の目標 ＆ 得意プレー特徴タグ
              </span>
            </div>

            <div className="p-3.5 space-y-3">
              {/* 今季の目標 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-foreground">
                    今季の目標・意気込み（一言スローガン）
                  </label>
                  <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                    {seasonGoal.length}/80
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={80}
                  value={seasonGoal}
                  onChange={(e) => setSeasonGoal(e.target.value)}
                  placeholder="例: 打率.350＆盗塁10個！エラーゼロで優勝へ！"
                  className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
                  {SEASON_GOAL_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setSeasonGoal(ex)}
                      className="px-2 py-0.5 rounded-lg bg-muted hover:bg-muted/80 border border-border text-[10px] font-bold text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      例: {ex}
                    </button>
                  ))}
                </div>
              </div>

              {/* プレースタイルタグ */}
              <div className="space-y-1.5 pt-1 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-foreground flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>得意プレー・特徴タグ（タップで最大3つ）</span>
                  </label>
                  <span className="px-2 py-0.5 rounded-full bg-primary/12 text-primary text-[10px] font-black tabular-nums">
                    {playStyleTags.length}/{MAX_PLAY_STYLE_TAGS}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {PLAY_STYLE_TAGS.map((tag) => {
                    const selected = playStyleTags.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => togglePlayStyleTag(tag.id)}
                        className={`px-2.5 py-2 rounded-xl border text-left text-xs flex items-center justify-between gap-1 transition-all active:scale-95 cursor-pointer ${
                          selected
                            ? "bg-primary text-primary-foreground border-primary font-black shadow-2xs"
                            : "bg-muted/40 border-border text-foreground hover:bg-muted font-bold"
                        }`}
                      >
                        <span className="truncate">
                          {tag.emoji} {tag.label}
                        </span>
                        {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ひとこと紹介文 */}
              <div className="space-y-1 pt-1 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-foreground">
                    ひとこと自己紹介・メッセージ（任意）
                  </label>
                  <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                    {notes.length}/200
                  </span>
                </div>
                <textarea
                  rows={2}
                  maxLength={200}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="例: 走攻守全力プレーで盛り上げます！よろしくお願いします！"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>
            </div>
          </section>

          {/* ━━━ 章4: プロ名鑑トーク枠（憧れ・愛用ギア・登場曲） ━━━ */}
          <section className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
            <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-2 border-amber-500 flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-black text-white">
                4. 憧れ・愛用ギア・登場曲（任意）
              </span>
            </div>

            <div className="p-3.5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground flex items-center gap-1">
                    <Heart className="w-3 h-3 text-rose-500" />
                    <span>憧れの選手</span>
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={admiredPlayer}
                    onChange={(e) => setAdmiredPlayer(e.target.value)}
                    placeholder="例: 大谷 翔平 / イチロー"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    好きなプロ球団
                  </label>
                  <LiffSelect
                    value={favoriteTeamSelect}
                    onChange={setFavoriteTeamSelect}
                    options={favoriteTeamOptions}
                    placeholder="球団を選択（任意）"
                    title="好きなプロ球団"
                    subtitle="12球団・MLB・自由入力から選べます"
                    accent="amber"
                    searchable
                  />
                </div>
              </div>

              {favoriteTeamSelect === CUSTOM_TEAM_VALUE && (
                <input
                  type="text"
                  maxLength={40}
                  value={favoriteTeamCustom}
                  onChange={(e) => setFavoriteTeamCustom(e.target.value)}
                  placeholder="好きなチーム・球団名を入力（例: ドジャース）"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    🧤 愛用グラブ・こだわり
                  </label>
                  <input
                    type="text"
                    maxLength={50}
                    value={gloveGear}
                    onChange={(e) => setGloveGear(e.target.value)}
                    placeholder="例: ミズノプロ（坂本モデル）"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    🏏 愛用バット・こだわり
                  </label>
                  <input
                    type="text"
                    maxLength={50}
                    value={batGear}
                    onChange={(e) => setBatGear(e.target.value)}
                    placeholder="例: ビヨンドマックスレガシー 84cm"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground flex items-center gap-1">
                  <Music className="w-3.5 h-3.5 text-primary" />
                  <span>登場曲（打席テーマ曲 / アーティスト）</span>
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={walkUpSong}
                  onChange={(e) => setWalkUpSong(e.target.value)}
                  placeholder="例: 第ゼロ感 / 10-FEET"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
          </section>

          {/* ━━━ 章5: フィジカル・自己ベスト（任意・非公開設定対応） ━━━ */}
          <section className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
            <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-2 border-slate-500 flex items-center gap-2">
              <Ruler className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <span className="text-xs font-black text-white">
                5. 体格 ＆ 自己ベスト記録（すべて任意）
              </span>
            </div>

            <div className="p-3.5 space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    身長 (cm)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={90}
                    max={230}
                    value={heightStr}
                    onChange={(e) => setHeightStr(e.target.value)}
                    placeholder="例: 170"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold tabular-nums text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-foreground block">
                    体重 (kg)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={15}
                    max={160}
                    value={weightStr}
                    onChange={(e) => setWeightStr(e.target.value)}
                    placeholder="例: 65"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold tabular-nums text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* 体重非公開トグル */}
              <button
                type="button"
                onClick={() => setHideWeight((prev) => !prev)}
                className={`w-full px-3 py-2 rounded-xl border text-xs flex items-center justify-between transition-all cursor-pointer ${
                  hideWeight
                    ? "bg-slate-900 text-white border-slate-800 font-black"
                    : "bg-muted/40 border-border text-muted-foreground font-bold hover:bg-muted/70"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>体重を選手名鑑で非公開にする</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black ${
                    hideWeight
                      ? "bg-teal-400 text-slate-950"
                      : "bg-card border border-border text-muted-foreground"
                  }`}
                >
                  {hideWeight ? "非公開 ON" : "公開"}
                </span>
              </button>

              {/* 自己ベスト3項目 */}
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border">
                <div className="space-y-1">
                  <label className="text-[10.5px] font-black text-foreground block">
                    MAX球速 (km/h)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={40}
                    max={175}
                    value={maxVelocityStr}
                    onChange={(e) => setMaxVelocityStr(e.target.value)}
                    placeholder="125"
                    className="w-full px-2.5 py-2 rounded-xl bg-background border border-border text-xs font-bold tabular-nums text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-black text-foreground block">
                    50m走 (秒)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    maxLength={6}
                    value={dash50mStr}
                    onChange={(e) => setDash50mStr(e.target.value)}
                    placeholder="6.4"
                    className="w-full px-2.5 py-2 rounded-xl bg-background border border-border text-xs font-bold tabular-nums text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-black text-foreground block">
                    遠投 (m)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={150}
                    value={longTossStr}
                    onChange={(e) => setLongTossStr(e.target.value)}
                    placeholder="80"
                    className="w-full px-2.5 py-2 rounded-xl bg-background border border-border text-xs font-bold tabular-nums text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ━━━ 下部固定ソリッドフッター（Safe Area 完全対応） ━━━ */}
        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 bg-card border-t border-border flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground active:scale-95 transition-all cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="flex-1 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm font-black shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>選手名鑑プロフィールを保存</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

