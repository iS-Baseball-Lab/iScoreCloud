// filepath: src/components/liff/LiffProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Liff } from "@line/liff";
import {
  LiffUserProfile,
  initLiff,
  getLiffProfile,
  resolveActiveLiffUserIdFromSdk,
  resolveActiveLiffUserNameFromSdk,
} from "@/lib/liff/liff-client";
import { LIFF_THEME_CHANGE_EVENT, syncLiffThemeClasses } from "@/lib/liff/theme-settings";
import {
  buildLiffHubUrl,
  fetchLiffJsonSWR,
  hasStoredLiffSessionProof,
  installLiffFastFetchCache,
  invalidateLiffApiCache,
  prefetchLiffCoreEndpoints,
} from "@/lib/liff/api-cache";
import {
  getLiffHistoryDepth,
  installLiffHistoryTracker,
  invalidateLiffForwardHistory,
  isPendingLiffRootReset,
  navigateToLiffRoot,
} from "@/lib/liff/navigation";
import {
  LIFF_WEBVIEW_RESUMED_EVENT,
  installLiffRuntimeRecovery,
  releaseOrphanedBodyLocks,
} from "@/lib/liff/runtime-recovery";
import { installGlobalExternalLinkInterceptor } from "@/lib/liff/external-link";
import { installGlobalModalScrollLock } from "@/lib/liff/modal-scroll-lock";
import {
  LIFF_SCORE_SETTINGS_CHANGE_EVENT,
  loadTeamPracticeMatchLabel,
  loadTeamScoreNameDisplayMode,
  resolveScoreTeamDisplayName,
  saveTeamPracticeMatchLabel,
  saveTeamScoreNameDisplayMode,
  type ScoreTeamNameDisplayMode,
} from "@/lib/liff/score-settings";
import { DEFAULT_PRACTICE_MATCH_LABEL } from "@/lib/liff/scorebook-symbol-rules";
import { syncLineMiniAppConfigCache } from "@/lib/line-miniapp";

export const DEMO_TEAM_DEFAULT_LOGO_URL = "/demo-team-logo.svg";
const DEMO_TEAM_LOGO_CLEARED_SENTINEL = "__NONE__";
const TEAMS_STORAGE_KEY = "iscore_teams_v2_json";
const CURRENT_TEAM_STORAGE_KEY = "iscore_currentTeam_v2_json";
const PENDING_TEAMS_STORAGE_KEY = "iscore_pending_teams_v1_json";
const SESSION_OPTIMISTIC_PENDING_KEY = "iscore_session_pending_team_v1";
export const EXPLICIT_DEMO_STORAGE_KEY = "iscore_explicit_demo";
export const PENDING_JOIN_CODE_STORAGE_KEY = "iscore_pending_join_code";

/**
 * URLクエリ（`?join=...` または LIFF Universal Link 展開前の `?liff.state=%3Fjoin%3D...`）から
 * 招待コードを安全に抽出する（LINE OAuth コールバックの `?code=...&state=...` 誤検知を完全防止）
 */
export function extractJoinCodeFromSearch(search: string): string | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(search);
    let candidate = params.get("join") || params.get("invite") || "";

    if (!candidate) {
      const liffState = params.get("liff.state");
      if (liffState) {
        const qIdx = liffState.indexOf("?");
        const rawSubQuery =
          qIdx >= 0
            ? liffState.slice(qIdx)
            : liffState.includes("join=") || liffState.includes("invite=")
            ? `?${liffState}`
            : "";
        if (rawSubQuery) {
          const stateParams = new URLSearchParams(rawSubQuery);
          candidate =
            stateParams.get("join") || stateParams.get("invite") || "";
        }
      }
    }

    if (
      !candidate &&
      params.get("code") &&
      !params.has("state") &&
      !params.has("liffClientId") &&
      !params.has("liffRedirectUri")
    ) {
      candidate = params.get("code") || "";
    }

    const clean = candidate.trim();
    if (!clean || clean === "demo-team") return null;
    return clean;
  } catch {
    return null;
  }
}

function matchesInviteCodeToTeamId(teamId: string, inviteCode: string): boolean {
  const cleanTeamId = teamId.trim().toLowerCase();
  const cleanCode = inviteCode.trim().toLowerCase();
  if (!cleanTeamId || !cleanCode) return false;
  if (cleanTeamId === cleanCode) return true;
  if (cleanCode.length >= 8 && /^[0-9a-f-]+$/i.test(cleanCode)) {
    return cleanTeamId.startsWith(cleanCode);
  }
  return false;
}

function purgeLegacyLeakedTeamStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("iscore_teams_json");
    localStorage.removeItem("iscore_currentTeam_json");
  } catch {
    // ignore storage access errors
  }
}

function isAllowedClientTeamItem(team: LiffTeamItem | null | undefined): team is LiffTeamItem {
  if (!team || !team.id) return false;
  if (team.id === "demo-team" || team.isDemo) return true;
  return team.isMember === true;
}

function resolveDemoTeamLogoUrl(serverFallback?: string): string | undefined {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("iscore_demo_team_logo");
    if (saved === DEMO_TEAM_LOGO_CLEARED_SENTINEL) {
      return undefined;
    }
    if (saved && saved.trim()) {
      return saved.trim();
    }
  }
  return serverFallback || DEMO_TEAM_DEFAULT_LOGO_URL;
}

function resolveDemoTeamCoverUrl(serverFallback?: string): string | undefined {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("iscore_demo_team_cover");
    if (saved === DEMO_TEAM_LOGO_CLEARED_SENTINEL) {
      return undefined;
    }
    if (saved && saved.trim()) {
      return saved.trim();
    }
  }
  return serverFallback || undefined;
}

/**
 * ⚠️ 重要: 内部DBスキーマでは `organizations` (`orgName`) = 「チーム名」、`teams` (`teamName`) = 「構成名」であるため絶対に逆転させないこと。
 */
export interface LiffTeamItem {
  id: string;
  name: string;
  /** `organizations.name` = チーム名（クラブ・団体全体名） */
  orgName?: string;
  /** `teams.name` = 構成名（学年・階層・編成ごとの名称） */
  teamName?: string;
  shortName: string;
  logoImageUrl?: string;
  coverImageUrl?: string;
  role?: string;
  subRoles?: string[];
  canManage?: boolean;
  canManageOps?: boolean;
  canManagePlayers?: boolean;
  canEditScore?: boolean;
  canEditSchedule?: boolean;
  canEditCarpool?: boolean;
  canMutate?: boolean;
  isDemo?: boolean;
  isMember?: boolean;
  scoreTeamNameMode?: ScoreTeamNameDisplayMode;
  practiceMatchLabel?: string;
}

const STAFF_ROLES_SET = new Set(["admin", "manager", "coach", "scorer", "staff"]);
const OPS_MANAGE_ROLES_SET = new Set(["admin", "manager", "coach", "scorer"]);
const SCORE_EDIT_ROLES_SET = new Set(["admin", "manager", "coach", "scorer"]);
const SCHEDULE_EDIT_ROLES_SET = new Set(["admin", "manager", "coach", "staff"]);
const CARPOOL_EDIT_ROLES_SET = new Set(["admin", "manager", "coach", "staff"]);
const MUTABLE_ROLES_SET = new Set([
  "admin",
  "manager",
  "coach",
  "scorer",
  "staff",
  "parent",
]);

function hasAnyMatchingRole(
  team: LiffTeamItem | null | undefined,
  allowedSet: Set<string>
): boolean {
  if (!team) return false;
  const primary = (team.role || "").toLowerCase();
  if (primary && allowedSet.has(primary)) return true;
  if (Array.isArray(team.subRoles)) {
    return team.subRoles.some((sr) => allowedSet.has((sr || "").toLowerCase()));
  }
  return false;
}

export function canManageCurrentTeam(
  team: LiffTeamItem | null | undefined,
  isDemo?: boolean
): boolean {
  if (isDemo || team?.isDemo || team?.id === "demo-team") return true;
  if (!team) return false;
  if (typeof team.canManage === "boolean") return team.canManage;
  const r = (team.role || "").toLowerCase();
  if (r === "admin" || r === "manager") return true;
  if (Array.isArray(team.subRoles)) {
    return team.subRoles.some((sr) => {
      const s = (sr || "").toLowerCase();
      return s === "admin" || s === "manager";
    });
  }
  return false;
}

export function canManageOpsCurrentTeam(
  team: LiffTeamItem | null | undefined,
  isDemo?: boolean
): boolean {
  if (isDemo || team?.isDemo || team?.id === "demo-team") return true;
  if (!team) return false;
  if (typeof team.canManageOps === "boolean") return team.canManageOps;
  if (team.canManage === true) return true;
  return hasAnyMatchingRole(team, OPS_MANAGE_ROLES_SET);
}

export function canManagePlayersCurrentTeam(
  team: LiffTeamItem | null | undefined,
  isDemo?: boolean
): boolean {
  if (isDemo || team?.isDemo || team?.id === "demo-team") return true;
  if (!team) return false;
  if (typeof team.canManagePlayers === "boolean") return team.canManagePlayers;
  if (team.canManage === true) return true;
  return hasAnyMatchingRole(team, STAFF_ROLES_SET);
}

export function canEditScoreCurrentTeam(
  team: LiffTeamItem | null | undefined,
  isDemo?: boolean
): boolean {
  if (isDemo || team?.isDemo || team?.id === "demo-team") return true;
  if (!team) return false;
  if (typeof team.canEditScore === "boolean") return team.canEditScore;
  if (team.canManage === true) return true;
  return hasAnyMatchingRole(team, SCORE_EDIT_ROLES_SET);
}

export function canEditScheduleCurrentTeam(
  team: LiffTeamItem | null | undefined,
  isDemo?: boolean
): boolean {
  if (isDemo || team?.isDemo || team?.id === "demo-team") return true;
  if (!team) return false;
  if (typeof team.canEditSchedule === "boolean") return team.canEditSchedule;
  if (team.canManage === true) return true;
  return hasAnyMatchingRole(team, SCHEDULE_EDIT_ROLES_SET);
}

export function canEditCarpoolCurrentTeam(
  team: LiffTeamItem | null | undefined,
  isDemo?: boolean
): boolean {
  if (isDemo || team?.isDemo || team?.id === "demo-team") return true;
  if (!team) return false;
  if (typeof team.canEditCarpool === "boolean") return team.canEditCarpool;
  if (team.canManage === true) return true;
  return hasAnyMatchingRole(team, CARPOOL_EDIT_ROLES_SET);
}

export function canMutateCurrentTeam(
  team: LiffTeamItem | null | undefined,
  isDemo?: boolean,
  isLoggedIn = true
): boolean {
  if (isDemo || team?.isDemo || team?.id === "demo-team") return true;
  if (!team || !isLoggedIn) return false;
  if (typeof team.canMutate === "boolean") return team.canMutate;
  if (
    team.canManage === true ||
    team.canManageOps === true ||
    team.canManagePlayers === true ||
    team.canEditScore === true ||
    team.canEditSchedule === true ||
    team.canEditCarpool === true
  ) {
    return true;
  }
  return hasAnyMatchingRole(team, MUTABLE_ROLES_SET);
}

export function canUsePaidCloudFeatures(
  team: LiffTeamItem | null | undefined,
  isDemo?: boolean,
  isLoggedIn = true
): boolean {
  if (isDemo || !team || team.isDemo || team.id === "demo-team" || !isLoggedIn) {
    return false;
  }
  return canMutateCurrentTeam(team, false, isLoggedIn);
}

export interface LiffPendingTeamItem {
  id: string;
  name: string;
  orgName?: string;
  teamName?: string;
  shortName?: string;
  logoImageUrl?: string;
}

interface HubTeamsPayload {
  success?: boolean;
  error?: string;
  authVerified?: boolean;
  liffId?: string;
  miniAppUrl?: string;
  sessionUser?: {
    userId: string;
    displayName: string;
    pictureUrl?: string;
  } | null;
  isDemo?: boolean;
  teams?: LiffTeamItem[];
  pendingTeams?: LiffPendingTeamItem[];
  team?: {
    id: string | null;
    name: string;
    orgName?: string;
    teamName?: string;
    shortName: string;
    logoImageUrl?: string;
    coverImageUrl?: string;
    scoreTeamNameMode?: ScoreTeamNameDisplayMode;
    practiceMatchLabel?: string;
  };
}

interface LiffContextType {
  liff: Liff | null;
  isReady: boolean;
  isInClient: boolean;
  isLoggedIn: boolean;
  isMock: boolean;
  reason?: string;
  profile: LiffUserProfile | null;
  error: string | null;
  login: () => void;
  // チーム状態管理 (LocalStorage & Provider で完全維持)
  teams: LiffTeamItem[];
  currentTeam: LiffTeamItem | null;
  selectTeam: (teamId: string) => void;
  isLoadingTeam: boolean;
  isDemo: boolean;
  refreshTeams: () => Promise<void>;
  updateCurrentTeamLogo: (logoImageUrl: string | undefined) => void;
  updateCurrentTeamCover: (coverImageUrl: string | undefined) => void;
  // 招待コード自動引当 & 承認待ちステータス管理
  pendingTeams: LiffPendingTeamItem[];
  pendingJoinCode: string | null;
  shouldOpenJoinModal: boolean;
  persistPendingJoinCode: (code: string) => void;
  clearPendingJoinCode: () => void;
  recordOptimisticPendingTeam: (item: LiffPendingTeamItem) => void;
}

const LiffContext = createContext<LiffContextType>({
  liff: null,
  isReady: false,
  isInClient: false,
  isLoggedIn: false,
  isMock: false,
  profile: null,
  error: null,
  login: () => {},
  teams: [],
  currentTeam: null,
  selectTeam: () => {},
  isLoadingTeam: true,
  isDemo: false,
  refreshTeams: async () => {},
  updateCurrentTeamLogo: () => {},
  updateCurrentTeamCover: () => {},
  pendingTeams: [],
  pendingJoinCode: null,
  shouldOpenJoinModal: false,
  persistPendingJoinCode: () => {},
  clearPendingJoinCode: () => {},
  recordOptimisticPendingTeam: () => {},
});

export function LiffProvider({
  children,
  liffId,
}: {
  children: React.ReactNode;
  liffId?: string;
}) {
  if (typeof window !== "undefined") {
    installLiffFastFetchCache();
    installLiffHistoryTracker();
    installLiffRuntimeRecovery();
    installGlobalExternalLinkInterceptor();
    installGlobalModalScrollLock();
  }
  const router = useRouter();
  const pathname = usePathname();
  const [liff, setLiff] = useState<Liff | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInClient, setIsInClient] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    if (typeof window !== "undefined") {
      const uid = localStorage.getItem("iscore_user_id");
      return Boolean(uid && uid !== "cached-user");
    }
    return false;
  });
  const [isMock, setIsMock] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [profile, setProfile] = useState<LiffUserProfile | null>(() => {
    if (typeof window !== "undefined") {
      const storedName = localStorage.getItem("iscore_user_name");
      const storedAvatar = localStorage.getItem("iscore_user_avatar");
      const storedUserId = localStorage.getItem("iscore_user_id");
      if (storedName) {
        return {
          userId: storedUserId || "cached-user",
          displayName: storedName,
          pictureUrl: storedAvatar || undefined,
        };
      }
    }
    return null;
  });
  const [error, setError] = useState<string | null>(null);
  const lastLoadedUserIdRef = useRef<string>("");
  const teamsLoadFailedRef = useRef<boolean>(false);
  const isRecoveringSdkRef = useRef<boolean>(false);
  const liffReadyRef = useRef<boolean>(false);
  const [loadedTeamsUserId, setLoadedTeamsUserId] = useState<string | null>(null);

  // チーム状態 (LocalStorageから同期的に承認済みチームオブジェクトのみを取得・旧キャッシュは破棄)
  const [teams, setTeams] = useState<LiffTeamItem[]>(() => {
    if (typeof window !== "undefined") {
      purgeLegacyLeakedTeamStorage();
      try {
        const storedTeams = localStorage.getItem(TEAMS_STORAGE_KEY);
        if (storedTeams) {
          const parsed = JSON.parse(storedTeams) as LiffTeamItem[];
          return parsed
            .filter((t) => isAllowedClientTeamItem(t))
            .map((t) =>
              t.id === "demo-team" || t.isDemo
                ? {
                    ...t,
                    logoImageUrl: resolveDemoTeamLogoUrl(t.logoImageUrl),
                    coverImageUrl: resolveDemoTeamCoverUrl(t.coverImageUrl),
                  }
                : t
            );
        }
      } catch {}
    }
    return [];
  });

  const [isDemo, setIsDemo] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("iscore_isDemo") === "true";
    }
    return false;
  });

  const [pendingTeams, setPendingTeams] = useState<LiffPendingTeamItem[]>(() => {
    if (typeof window === "undefined") return [];
    const merged: LiffPendingTeamItem[] = [];
    const seen = new Set<string>();
    try {
      const rawStored = localStorage.getItem(PENDING_TEAMS_STORAGE_KEY);
      if (rawStored) {
        const parsed = JSON.parse(rawStored) as LiffPendingTeamItem[];
        for (const item of parsed) {
          if (item?.id && item?.name && !seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
      }
    } catch {}
    try {
      const rawSession = sessionStorage.getItem(SESSION_OPTIMISTIC_PENDING_KEY);
      if (rawSession) {
        const parsed = JSON.parse(rawSession) as LiffPendingTeamItem;
        if (parsed?.id && parsed?.name && !seen.has(parsed.id)) {
          seen.add(parsed.id);
          merged.push(parsed);
        }
      }
    } catch {}
    return merged;
  });

  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const fromUrl = extractJoinCodeFromSearch(window.location.search);
    if (fromUrl) {
      try {
        sessionStorage.setItem(PENDING_JOIN_CODE_STORAGE_KEY, fromUrl);
      } catch {}
      return fromUrl;
    }
    try {
      const stored = sessionStorage.getItem(PENDING_JOIN_CODE_STORAGE_KEY);
      return stored && stored.trim() && stored.trim() !== "demo-team"
        ? stored.trim()
        : null;
    } catch {
      return null;
    }
  });

  const persistPendingJoinCode = useCallback((code: string) => {
    const clean = code.trim();
    if (!clean || clean === "demo-team") return;
    setPendingJoinCode(clean);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(PENDING_JOIN_CODE_STORAGE_KEY, clean);
      } catch {}
    }
  }, []);

  const clearPendingJoinCode = useCallback(() => {
    setPendingJoinCode(null);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(PENDING_JOIN_CODE_STORAGE_KEY);
      } catch {}
      if (pathname === "/liff") {
        const params = new URLSearchParams(window.location.search);
        if (params.has("join") || params.has("invite")) {
          router.replace("/liff", { scroll: false });
        }
      }
    }
  }, [pathname, router]);

  const recordOptimisticPendingTeam = useCallback((item: LiffPendingTeamItem) => {
    if (!item?.id || !item?.name) return;
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(SESSION_OPTIMISTIC_PENDING_KEY, JSON.stringify(item));
      } catch {}
    }
    setPendingTeams((prev) => {
      if (prev.some((p) => p.id === item.id)) return prev;
      return [...prev, item];
    });
  }, []);

  const [currentTeam, setCurrentTeam] = useState<LiffTeamItem | null>(() => {
    if (typeof window !== "undefined") {
      purgeLegacyLeakedTeamStorage();
      let authorizedTeamMap = new Map<string, LiffTeamItem>();
      try {
        const storedTeams = localStorage.getItem(TEAMS_STORAGE_KEY);
        if (storedTeams) {
          const parsedList = JSON.parse(storedTeams) as LiffTeamItem[];
          authorizedTeamMap = new Map(
            parsedList
              .filter((t) => isAllowedClientTeamItem(t))
              .map((t) => [t.id, t])
          );
        }
      } catch {}

      try {
        const storedTeamJson = localStorage.getItem(CURRENT_TEAM_STORAGE_KEY);
        if (storedTeamJson) {
          const parsed = JSON.parse(storedTeamJson) as LiffTeamItem;
          if (parsed.id === "demo-team" || parsed.isDemo) {
            return {
              ...parsed,
              logoImageUrl: resolveDemoTeamLogoUrl(parsed.logoImageUrl),
              coverImageUrl: resolveDemoTeamCoverUrl(parsed.coverImageUrl),
            };
          }
          if (isAllowedClientTeamItem(parsed) && authorizedTeamMap.has(parsed.id)) {
            return parsed;
          }
        }
      } catch {}

      const storedId = localStorage.getItem("iscore_selectedTeamId");
      const storedName = localStorage.getItem("iscore_selectedTeamName");
      if (storedId === "demo-team") {
        return {
          id: "demo-team",
          name: storedName || "iScore ドリームス (体験デモ)",
          orgName: "iScore ドリームス",
          teamName: "体験デモチーム",
          shortName: "ドリームス",
          isDemo: true,
          logoImageUrl: resolveDemoTeamLogoUrl(),
          coverImageUrl: resolveDemoTeamCoverUrl(),
          scoreTeamNameMode: loadTeamScoreNameDisplayMode("demo-team", "organization"),
          practiceMatchLabel: loadTeamPracticeMatchLabel(
            "demo-team",
            DEFAULT_PRACTICE_MATCH_LABEL
          ),
        };
      }
      if (storedId && authorizedTeamMap.has(storedId)) {
        return authorizedTeamMap.get(storedId) || null;
      }
    }
    return null;
  });
  const [isLoadingTeam, setIsLoadingTeam] = useState<boolean>(() => currentTeam === null);
  const teamsRef = useRef<LiffTeamItem[]>(teams);
  useEffect(() => {
    teamsRef.current = teams;
  }, [teams]);
  const hasExplicitTeamSelectionRef = useRef<boolean>(false);
  const prevPathnameRef = useRef<string | null>(null);

  // トップページ（/liff）へ遷移した際は、どの経路からであってもアプリ内遷移履歴をクリアする
  useEffect(() => {
    if (!pathname) return;
    if (pathname === "/liff") {
      if (getLiffHistoryDepth() > 0 && !isPendingLiffRootReset()) {
        navigateToLiffRoot(router, "/liff");
      } else if (
        prevPathnameRef.current !== null &&
        prevPathnameRef.current !== "/liff"
      ) {
        invalidateLiffForwardHistory();
      }
    }
    prevPathnameRef.current = pathname;

    const lockTimer = setTimeout(() => {
      releaseOrphanedBodyLocks();
    }, 100);
    return () => clearTimeout(lockTimer);
  }, [pathname, router]);

  // チーム選択ハンドラー（LocalStorageに永続化し、全画面で0ms同期）
  const selectTeam = useCallback((teamId: string) => {
    hasExplicitTeamSelectionRef.current = true;
    const storedUserId =
      typeof window !== "undefined"
        ? localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || ""
        : "";
    const storedUserName =
      typeof window !== "undefined" ? localStorage.getItem("iscore_user_name") || "" : "";

    if (teamId === "demo-team") {
      setIsDemo(true);
      localStorage.setItem("iscore_isDemo", "true");
      localStorage.setItem(EXPLICIT_DEMO_STORAGE_KEY, "1");
      localStorage.setItem("iscore_selectedTeamId", "demo-team");
      const baseFound = teamsRef.current.find((t) => t.id === "demo-team") || {
        id: "demo-team",
        name: "iScore ドリームス (体験デモ)",
        orgName: "iScore ドリームス",
        teamName: "体験デモチーム",
        shortName: "ドリームス",
        isDemo: true,
      };
      const nextDemoTeam: LiffTeamItem = {
        ...baseFound,
        logoImageUrl: resolveDemoTeamLogoUrl(baseFound.logoImageUrl),
        coverImageUrl: resolveDemoTeamCoverUrl(baseFound.coverImageUrl),
        scoreTeamNameMode: loadTeamScoreNameDisplayMode(
          "demo-team",
          baseFound.scoreTeamNameMode ?? "organization"
        ),
        practiceMatchLabel: loadTeamPracticeMatchLabel(
          "demo-team",
          baseFound.practiceMatchLabel ?? DEFAULT_PRACTICE_MATCH_LABEL
        ),
      };
      setCurrentTeam(nextDemoTeam);
      localStorage.setItem("iscore_selectedTeamName", nextDemoTeam.name);
      localStorage.setItem(CURRENT_TEAM_STORAGE_KEY, JSON.stringify(nextDemoTeam));
      prefetchLiffCoreEndpoints({
        teamId: "demo-team",
        userId: storedUserId,
        userName: storedUserName,
      });
    } else {
      const found = teamsRef.current.find(
        (t) => t.id === teamId && isAllowedClientTeamItem(t)
      );
      if (!found) {
        return;
      }
      setIsDemo(false);
      localStorage.setItem("iscore_isDemo", "false");
      localStorage.removeItem(EXPLICIT_DEMO_STORAGE_KEY);
      localStorage.setItem("iscore_selectedTeamId", teamId);
      setCurrentTeam(found);
      localStorage.setItem("iscore_selectedTeamName", found.name);
      localStorage.setItem(CURRENT_TEAM_STORAGE_KEY, JSON.stringify(found));
      prefetchLiffCoreEndpoints({
        teamId,
        userId: storedUserId,
        userName: storedUserName,
      });
    }
  }, []);

  const applyHubPayload = useCallback((data: HubTeamsPayload, targetTeamId: string | null, uid: string, uName: string) => {
    if (!data || data.success === false) {
      teamsLoadFailedRef.current = true;
      return;
    }
    teamsLoadFailedRef.current = false;

    if (typeof window !== "undefined" && (data.liffId || data.miniAppUrl)) {
      syncLineMiniAppConfigCache({
        liffId: data.liffId,
        miniAppUrl: data.miniAppUrl,
      });
    }

    // Better-Auth (HttpOnly Cookie) セッションがサーバー側で確認された場合、追加通信ゼロで即座にユーザー状態を同期
    if (data.sessionUser?.userId) {
      const webUser: LiffUserProfile = {
        userId: data.sessionUser.userId,
        displayName: data.sessionUser.displayName,
        pictureUrl: data.sessionUser.pictureUrl,
      };
      if (typeof window !== "undefined") {
        const existingUid = localStorage.getItem("iscore_user_id");
        if (!existingUid || existingUid === "cached-user") {
          localStorage.setItem("iscore_user_id", webUser.userId);
          localStorage.setItem("iscore_user_name", webUser.displayName);
          if (webUser.pictureUrl) {
            localStorage.setItem("iscore_user_avatar", webUser.pictureUrl);
          }
        }
      }
      lastLoadedUserIdRef.current = webUser.userId;
      setProfile((prev) => {
        if (!prev || !prev.userId || prev.userId === "cached-user") {
          return webUser;
        }
        if (prev.userId === webUser.userId && webUser.pictureUrl && !prev.pictureUrl) {
          return { ...prev, pictureUrl: webUser.pictureUrl };
        }
        return prev;
      });
      setIsLoggedIn(true);
    }

    if (
      data.authVerified === false &&
      Boolean(uid && uid !== "cached-user") &&
      !liffReadyRef.current
    ) {
      return;
    }

    const resolvedAppliedUid = data.sessionUser?.userId || uid || "";
    setLoadedTeamsUserId(resolvedAppliedUid);
    const hasVerifiedIdentity = Boolean(
      data.authVerified !== false &&
        resolvedAppliedUid &&
        resolvedAppliedUid !== "cached-user"
    );

    const demoFlag = !!data.isDemo;
    setIsDemo(demoFlag);
    localStorage.setItem("iscore_isDemo", demoFlag ? "true" : "false");

    // 認証ユーザー確定済みの状態で要求した実チームIDが未承認・権限外としてデモへ差し戻された場合のみ残留キャッシュを完全破棄
    if (targetTeamId && targetTeamId !== "demo-team" && demoFlag && hasVerifiedIdentity) {
      localStorage.removeItem(EXPLICIT_DEMO_STORAGE_KEY);
      invalidateLiffApiCache(undefined, { clearLastKnownGood: true });
    } else if (!demoFlag) {
      localStorage.removeItem(EXPLICIT_DEMO_STORAGE_KEY);
    }

    const teamList = (data.teams || [])
      .filter((t) => isAllowedClientTeamItem(t))
      .map((t) =>
        t.id === "demo-team" || t.isDemo
          ? {
              ...t,
              logoImageUrl: resolveDemoTeamLogoUrl(t.logoImageUrl),
              coverImageUrl: resolveDemoTeamCoverUrl(t.coverImageUrl),
            }
          : t
      );
    setTeams(teamList);
    localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(teamList));

    const activeRealIds = new Set(
      teamList
        .filter((t) => !t.isDemo && t.id !== "demo-team" && t.isMember)
        .map((t) => t.id)
    );
    const serverPending = Array.isArray(data.pendingTeams)
      ? data.pendingTeams.filter((p) => p?.id && p?.name && !activeRealIds.has(p.id))
      : [];

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          PENDING_TEAMS_STORAGE_KEY,
          JSON.stringify(serverPending)
        );
      } catch {}
      try {
        const rawOptimistic = sessionStorage.getItem(SESSION_OPTIMISTIC_PENDING_KEY);
        if (rawOptimistic) {
          const parsedOpt = JSON.parse(rawOptimistic) as LiffPendingTeamItem;
          if (
            !parsedOpt?.id ||
            activeRealIds.has(parsedOpt.id) ||
            (!demoFlag && parsedOpt.id === "demo-team")
          ) {
            sessionStorage.removeItem(SESSION_OPTIMISTIC_PENDING_KEY);
          } else if (!serverPending.some((p) => p.id === parsedOpt.id)) {
            serverPending.push(parsedOpt);
          }
        }
      } catch {}
    }
    setPendingTeams(serverPending);

    let activeTeam: LiffTeamItem | null = null;
    if (demoFlag || targetTeamId === "demo-team") {
      const baseDemo = teamList.find((t) => t.id === "demo-team") || {
        id: "demo-team",
        name: "iScore ドリームス (体験デモ)",
        orgName: "iScore ドリームス",
        teamName: "体験デモチーム",
        shortName: "ドリームス",
        isDemo: true,
      };
      activeTeam = {
        ...baseDemo,
        logoImageUrl: resolveDemoTeamLogoUrl(baseDemo.logoImageUrl),
        coverImageUrl: resolveDemoTeamCoverUrl(baseDemo.coverImageUrl),
        scoreTeamNameMode: loadTeamScoreNameDisplayMode(
          "demo-team",
          baseDemo.scoreTeamNameMode ?? "organization"
        ),
        practiceMatchLabel: loadTeamPracticeMatchLabel(
          "demo-team",
          baseDemo.practiceMatchLabel ?? DEFAULT_PRACTICE_MATCH_LABEL
        ),
      };
    } else if (targetTeamId) {
      activeTeam = teamList.find((t) => t.id === targetTeamId) || null;
    }

    if (!activeTeam && data.team?.id) {
      const matchingListed = teamList.find((t) => t.id === data.team?.id);
      if (matchingListed || demoFlag || data.team.id === "demo-team") {
        activeTeam = matchingListed || {
          id: data.team.id,
          name: data.team.name,
          orgName: data.team.orgName,
          teamName: data.team.teamName,
          shortName: data.team.shortName,
          logoImageUrl: data.team.logoImageUrl,
          coverImageUrl: data.team.coverImageUrl,
          isDemo: demoFlag,
          isMember: !demoFlag,
          scoreTeamNameMode: data.team.scoreTeamNameMode,
          practiceMatchLabel: data.team.practiceMatchLabel,
        };
      }
    }
    if (!activeTeam && teamList.length > 0) {
      activeTeam = teamList[0];
    }

    if (activeTeam) {
      if (!activeTeam.isDemo && activeTeam.scoreTeamNameMode) {
        saveTeamScoreNameDisplayMode(
          activeTeam.id,
          activeTeam.scoreTeamNameMode,
          false
        );
      }
      if (!activeTeam.isDemo && activeTeam.practiceMatchLabel) {
        saveTeamPracticeMatchLabel(
          activeTeam.id,
          activeTeam.practiceMatchLabel,
          false
        );
      }
      setCurrentTeam((prev) => {
        if (
          prev &&
          prev.id === activeTeam!.id &&
          prev.name === activeTeam!.name &&
          prev.orgName === activeTeam!.orgName &&
          prev.teamName === activeTeam!.teamName &&
          prev.shortName === activeTeam!.shortName &&
          prev.logoImageUrl === activeTeam!.logoImageUrl &&
          prev.coverImageUrl === activeTeam!.coverImageUrl &&
          prev.role === activeTeam!.role &&
          JSON.stringify(prev.subRoles || []) ===
            JSON.stringify(activeTeam!.subRoles || []) &&
          prev.canManage === activeTeam!.canManage &&
          prev.canManageOps === activeTeam!.canManageOps &&
          prev.canManagePlayers === activeTeam!.canManagePlayers &&
          prev.canEditScore === activeTeam!.canEditScore &&
          prev.canEditSchedule === activeTeam!.canEditSchedule &&
          prev.canEditCarpool === activeTeam!.canEditCarpool &&
          prev.canMutate === activeTeam!.canMutate &&
          prev.isDemo === activeTeam!.isDemo &&
          prev.scoreTeamNameMode === activeTeam!.scoreTeamNameMode &&
          prev.practiceMatchLabel === activeTeam!.practiceMatchLabel
        ) {
          return prev;
        }
        return activeTeam;
      });
      localStorage.setItem(CURRENT_TEAM_STORAGE_KEY, JSON.stringify(activeTeam));
      localStorage.setItem("iscore_selectedTeamId", activeTeam.id);
      localStorage.setItem("iscore_selectedTeamName", activeTeam.name);

      // アイドル時に主要タブ（予定・試合一覧）をプリフェッチしタブ遷移を 0ms にする
      prefetchLiffCoreEndpoints({
        teamId: activeTeam.id,
        userId: uid,
        userName: uName,
      });
    }
  }, []);

  // チーム一覧 & 初期選択チームのロード（SWR + 重複リクエスト統合）
  const loadTeams = useCallback(async (forceRefresh = false) => {
    try {
      const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const urlTeamId = urlParams?.get("teamId");
      const storedTeamId = typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : null;
      const explicitDemo =
        typeof window !== "undefined"
          ? localStorage.getItem(EXPLICIT_DEMO_STORAGE_KEY) === "1"
          : false;
      const rawStoredUserId =
        typeof window !== "undefined"
          ? localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || ""
          : "";
      const storedUserId =
        rawStoredUserId && rawStoredUserId !== "cached-user"
          ? rawStoredUserId
          : resolveActiveLiffUserIdFromSdk();
      const storedUserName =
        (typeof window !== "undefined" ? localStorage.getItem("iscore_user_name") || "" : "") ||
        resolveActiveLiffUserNameFromSdk();

      let targetTeamId: string | null = null;
      if (urlTeamId && !hasExplicitTeamSelectionRef.current) {
        targetTeamId = urlTeamId;
      } else if (storedTeamId) {
        if (storedTeamId === "demo-team") {
          // ユーザーが明示的に体験デモを選択した時のみ demo-team を固定維持する
          // （初回匿名マウント時の自動デモ降格では固定せず、LIFF userId 確定後に実チームへ自動昇格させる）
          if (explicitDemo) targetTeamId = "demo-team";
        } else {
          targetTeamId = storedTeamId;
        }
      }

      lastLoadedUserIdRef.current = storedUserId;

      const endpoint = buildLiffHubUrl({
        teamId: targetTeamId,
        userId: storedUserId,
        userName: storedUserName,
      });

      if (forceRefresh) {
        invalidateLiffApiCache("/api/liff/hub");
      }

      const data = await fetchLiffJsonSWR<HubTeamsPayload>(endpoint, {
        forceRefresh,
        onRevalidate: (fresh) => applyHubPayload(fresh, targetTeamId, storedUserId, storedUserName),
      });

      applyHubPayload(data, targetTeamId, storedUserId, storedUserName);
    } catch (err) {
      teamsLoadFailedRef.current = true;
      console.error("Failed to load teams in LiffProvider:", err);
    } finally {
      setIsLoadingTeam(false);
    }
  }, [applyHubPayload]);

  const refreshTeams = useCallback(async () => {
    await loadTeams(true);
  }, [loadTeams]);

  const updateCurrentTeamLogo = useCallback(
    (nextLogoUrl: string | undefined) => {
      const normalized = nextLogoUrl && nextLogoUrl.trim() ? nextLogoUrl.trim() : undefined;
      setCurrentTeam((prev) => {
        if (!prev) return prev;
        const updated: LiffTeamItem = {
          ...prev,
          logoImageUrl: normalized,
        };
        if (typeof window !== "undefined") {
          localStorage.setItem(CURRENT_TEAM_STORAGE_KEY, JSON.stringify(updated));
          if (prev.id === "demo-team" || prev.isDemo) {
            if (normalized === DEMO_TEAM_DEFAULT_LOGO_URL) {
              localStorage.removeItem("iscore_demo_team_logo");
            } else if (normalized) {
              localStorage.setItem("iscore_demo_team_logo", normalized);
            } else {
              localStorage.setItem(
                "iscore_demo_team_logo",
                DEMO_TEAM_LOGO_CLEARED_SENTINEL
              );
            }
          }
        }
        return updated;
      });
      setTeams((prevTeams) => {
        if (prevTeams.length === 0) return prevTeams;
        const targetOrgName = currentTeam?.orgName;
        const targetId = currentTeam?.id;
        const updatedList = prevTeams.map((t) => {
          const sameTeamOrOrg =
            (targetId && t.id === targetId) ||
            (targetOrgName && t.orgName && t.orgName === targetOrgName);
          return sameTeamOrOrg ? { ...t, logoImageUrl: normalized } : t;
        });
        if (typeof window !== "undefined") {
          localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(updatedList));
        }
        return updatedList;
      });
    },
    [currentTeam?.id, currentTeam?.orgName]
  );

  const updateCurrentTeamCover = useCallback(
    (nextCoverUrl: string | undefined) => {
      const normalized = nextCoverUrl && nextCoverUrl.trim() ? nextCoverUrl.trim() : undefined;
      setCurrentTeam((prev) => {
        if (!prev) return prev;
        const updated: LiffTeamItem = {
          ...prev,
          coverImageUrl: normalized,
        };
        if (typeof window !== "undefined") {
          localStorage.setItem(CURRENT_TEAM_STORAGE_KEY, JSON.stringify(updated));
          if (prev.id === "demo-team" || prev.isDemo) {
            if (normalized) {
              localStorage.setItem("iscore_demo_team_cover", normalized);
            } else {
              localStorage.setItem(
                "iscore_demo_team_cover",
                DEMO_TEAM_LOGO_CLEARED_SENTINEL
              );
            }
          }
        }
        return updated;
      });
      setTeams((prevTeams) => {
        if (prevTeams.length === 0) return prevTeams;
        const targetOrgName = currentTeam?.orgName;
        const targetId = currentTeam?.id;
        const updatedList = prevTeams.map((t) => {
          const sameTeamOrOrg =
            (targetId && t.id === targetId) ||
            (targetOrgName && t.orgName && t.orgName === targetOrgName);
          return sameTeamOrOrg ? { ...t, coverImageUrl: normalized } : t;
        });
        if (typeof window !== "undefined") {
          localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(updatedList));
        }
        return updatedList;
      });
      invalidateLiffApiCache("/api/liff/hub");
      invalidateLiffApiCache("/api/liff/players");
    },
    [currentTeam?.id, currentTeam?.orgName]
  );

  useEffect(() => {
    syncLiffThemeClasses();
    const handleThemeSync = () => syncLiffThemeClasses();
    window.addEventListener(LIFF_THEME_CHANGE_EVENT, handleThemeSync);
    window.addEventListener("storage", handleThemeSync);
    return () => {
      window.removeEventListener(LIFF_THEME_CHANGE_EVENT, handleThemeSync);
      window.removeEventListener("storage", handleThemeSync);
    };
  }, []);

  useEffect(() => {
    void loadTeams(false);
  }, [loadTeams]);

  // LIFF SDK や認証セッションから初回とは異なる本物の userId が新しく確定した時のみ再同期（無駄な二重フェッチを防止）
  useEffect(() => {
    if (
      profile?.userId &&
      profile.userId !== "cached-user" &&
      profile.userId !== lastLoadedUserIdRef.current
    ) {
      void loadTeams(true);
    }
  }, [profile?.userId, loadTeams]);

  // 本家Web版（Better-Auth）のセッションCookieが存在する場合のみ、初回マウント時に1回だけ軽量反映（ルート遷移ごとの /api/auth/get-session ポーリング・再レンダーを完全排除）
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.cookie.includes("better-auth")) return;

    let cancelled = false;
    void import("@/lib/auth-client")
      .then(({ authClient }) => authClient.getSession())
      .then((res) => {
        if (cancelled) return;
        const sessionUser = res?.data?.user;
        if (!sessionUser?.id || !sessionUser?.name) return;

        const userProf: LiffUserProfile = {
          userId: sessionUser.id,
          displayName: sessionUser.name,
          pictureUrl: sessionUser.image || undefined,
        };
        if (!localStorage.getItem("iscore_user_id")) {
          localStorage.setItem("iscore_user_name", sessionUser.name);
          localStorage.setItem("iscore_user_id", sessionUser.id);
          if (sessionUser.image) {
            localStorage.setItem("iscore_user_avatar", sessionUser.image);
          }
        }
        setProfile((prev) => {
          if (!prev || !prev.userId || prev.userId === "cached-user") {
            return userProf;
          }
          return prev;
        });
        setIsLoggedIn(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // ログイン処理ハンドラー (LIFFとBetter-Authソーシャルログインのハイブリッド・保留中の招待コードをリダイレクト後も確実に保持)
  const handleLogin = useCallback(async () => {
    let returnUrl = typeof window !== "undefined" ? window.location.href : "/liff";
    if (typeof window !== "undefined") {
      try {
        const savedJoin =
          pendingJoinCode ||
          sessionStorage.getItem(PENDING_JOIN_CODE_STORAGE_KEY) ||
          "";
        if (savedJoin.trim() && savedJoin.trim() !== "demo-team") {
          sessionStorage.setItem(PENDING_JOIN_CODE_STORAGE_KEY, savedJoin.trim());
          const urlObj = new URL("/liff", window.location.origin);
          urlObj.searchParams.set("join", savedJoin.trim());
          returnUrl = urlObj.toString();
        }
      } catch {}
    }

    if (isInClient && liff) {
      if (!liff.isLoggedIn()) {
        liff.login({
          redirectUri: returnUrl,
        });
      }
    } else {
      try {
        const { authClient } = await import("@/lib/auth-client");
        await authClient.signIn.social({
          provider: "line",
          callbackURL: returnUrl,
        });
      } catch {
        if (liff) {
          liff.login({ redirectUri: returnUrl });
        }
      }
    }
  }, [isInClient, liff, pendingJoinCode]);

  const realProfileUserId =
    profile?.userId && profile.userId !== "cached-user" ? profile.userId : "";
  const isTeamsSyncedForCurrentProfile =
    !isLoadingTeam &&
    loadedTeamsUserId !== null &&
    (!realProfileUserId || loadedTeamsUserId === realProfileUserId);

  const shouldOpenJoinModal = useMemo(() => {
    if (!pendingJoinCode || !isReady || !isTeamsSyncedForCurrentProfile) {
      return false;
    }
    const alreadyActive = teams.some(
      (t) =>
        !t.isDemo &&
        t.id !== "demo-team" &&
        t.isMember &&
        matchesInviteCodeToTeamId(t.id, pendingJoinCode)
    );
    if (alreadyActive) return false;

    const alreadyPending = pendingTeams.some((p) =>
      matchesInviteCodeToTeamId(p.id, pendingJoinCode)
    );
    if (alreadyPending) return false;

    return true;
  }, [
    isReady,
    isTeamsSyncedForCurrentProfile,
    pendingJoinCode,
    pendingTeams,
    teams,
  ]);

  // 招待URL（?join=...）アクセス時：すでに承認済みメンバーなら該当チームへ即座に切替、すでに承認待ちなら重複モーダルを抑止
  useEffect(() => {
    if (!pendingJoinCode || !isReady || !isTeamsSyncedForCurrentProfile) return;

    const matchedActive = teams.find(
      (t) =>
        !t.isDemo &&
        t.id !== "demo-team" &&
        t.isMember &&
        matchesInviteCodeToTeamId(t.id, pendingJoinCode)
    );
    if (matchedActive) {
      if (currentTeam?.id !== matchedActive.id) {
        selectTeam(matchedActive.id);
      }
      clearPendingJoinCode();
      return;
    }

    const matchedPending = pendingTeams.find((p) =>
      matchesInviteCodeToTeamId(p.id, pendingJoinCode)
    );
    if (matchedPending) {
      clearPendingJoinCode();
    }
  }, [
    clearPendingJoinCode,
    currentTeam?.id,
    isReady,
    isTeamsSyncedForCurrentProfile,
    pendingJoinCode,
    pendingTeams,
    selectTeam,
    teams,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function setup() {
      try {
        const { liff: instance, isMock: mockMode, reason: mockReason } = await initLiff(liffId);
        if (!isMounted) return;

        setIsMock(mockMode);
        setReason(mockReason);

        // `@line/liff` が `liff.state` クエリを展開した直後にも `?join=...` を再捕捉
        if (typeof window !== "undefined") {
          const unpackedJoin = extractJoinCodeFromSearch(window.location.search);
          if (unpackedJoin) {
            try {
              sessionStorage.setItem(PENDING_JOIN_CODE_STORAGE_KEY, unpackedJoin);
            } catch {}
            setPendingJoinCode(unpackedJoin);
          }
        }

        if (instance) {
          setLiff(instance);
          await instance.ready;
          const inClient = instance.isInClient();
          setIsInClient(inClient);

          if (instance.isLoggedIn()) {
            const userProfile = await getLiffProfile();
            if (isMounted && userProfile) {
              localStorage.setItem("iscore_user_name", userProfile.displayName);
              localStorage.setItem("iscore_user_id", userProfile.userId);
              if (userProfile.pictureUrl) {
                localStorage.setItem("iscore_user_avatar", userProfile.pictureUrl);
              } else {
                localStorage.removeItem("iscore_user_avatar");
              }
              setProfile(userProfile);
              setIsLoggedIn(true);
              if (
                userProfile.userId &&
                userProfile.userId !== "cached-user" &&
                userProfile.userId === lastLoadedUserIdRef.current &&
                !hasStoredLiffSessionProof(userProfile.userId)
              ) {
                void loadTeams(true);
              }
            }
          } else if (inClient) {
            let redirectUri: string | undefined =
              typeof window !== "undefined" ? window.location.href : undefined;
            if (typeof window !== "undefined") {
              try {
                const savedJoin = sessionStorage.getItem(
                  PENDING_JOIN_CODE_STORAGE_KEY
                );
                if (savedJoin && savedJoin.trim()) {
                  const urlObj = new URL("/liff", window.location.origin);
                  urlObj.searchParams.set("join", savedJoin.trim());
                  redirectUri = urlObj.toString();
                }
              } catch {}
            }
            instance.login(redirectUri ? { redirectUri } : undefined);
          }
        }
        liffReadyRef.current = true;
        setIsReady(true);
      } catch (err: unknown) {
        if (!isMounted) return;
        console.error("LiffProvider init error:", err);
        const message = err instanceof Error ? err.message : "LIFF initialization failed";
        setError(message);
        liffReadyRef.current = true;
        setIsReady(true);
      }
    }

    void setup();

    return () => {
      isMounted = false;
    };
  }, [liffId, loadTeams]);

  // 🛡️ WebView 復帰・電波回復時の自己修復ガード（LINE再起動なしでプロフィール・チーム状態を自動復旧）
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSelfHealOnResume = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;

      // 1. 初回起動時に電波不良等で LIFF SDK 初期化やプロフィール取得がタイムアウトしていた場合は再試行
      const needsSdkRetry =
        (!liff &&
          isMock &&
          Boolean(
            reason && (reason.includes("TIMEOUT") || reason.includes("ERROR"))
          )) ||
        Boolean(
          liff &&
            liff.isLoggedIn() &&
            (!profile?.userId || profile.userId === "cached-user")
        );

      if (needsSdkRetry && !isRecoveringSdkRef.current) {
        isRecoveringSdkRef.current = true;
        try {
          let activeInstance = liff;
          if (!activeInstance) {
            const retried = await initLiff(liffId);
            if (retried.liff) {
              activeInstance = retried.liff;
              setLiff(retried.liff);
              setIsMock(false);
              setReason(undefined);
              setIsInClient(retried.liff.isInClient());
            }
          }
          if (activeInstance && activeInstance.isLoggedIn()) {
            const recoveredProfile = await getLiffProfile();
            if (recoveredProfile) {
              localStorage.setItem("iscore_user_name", recoveredProfile.displayName);
              localStorage.setItem("iscore_user_id", recoveredProfile.userId);
              if (recoveredProfile.pictureUrl) {
                localStorage.setItem("iscore_user_avatar", recoveredProfile.pictureUrl);
              }
              setProfile(recoveredProfile);
              setIsLoggedIn(true);
            }
          }
        } catch {
          // ignore transient retry errors
        } finally {
          isRecoveringSdkRef.current = false;
        }
      } else {
        // localStorage 側だけ欠落していた場合も SDK IDトークンから即時補完
        resolveActiveLiffUserIdFromSdk();
      }

      // 2. 直前のチーム情報同期が通信失敗していた、または未取得の場合は自動で再同期
      if (teamsLoadFailedRef.current || !currentTeam) {
        void loadTeams(true);
      }
    };

    window.addEventListener(LIFF_WEBVIEW_RESUMED_EVENT, handleSelfHealOnResume);
    window.addEventListener("online", handleSelfHealOnResume);
    return () => {
      window.removeEventListener(LIFF_WEBVIEW_RESUMED_EVENT, handleSelfHealOnResume);
      window.removeEventListener("online", handleSelfHealOnResume);
    };
  }, [currentTeam, isMock, liff, liffId, loadTeams, profile?.userId, reason]);

  const contextValue = useMemo<LiffContextType>(
    () => ({
      liff,
      isReady,
      isInClient,
      isLoggedIn,
      isMock,
      reason,
      profile,
      error,
      login: handleLogin,
      teams,
      currentTeam,
      selectTeam,
      isLoadingTeam,
      isDemo,
      refreshTeams,
      updateCurrentTeamLogo,
      updateCurrentTeamCover,
      pendingTeams,
      pendingJoinCode,
      shouldOpenJoinModal,
      persistPendingJoinCode,
      clearPendingJoinCode,
      recordOptimisticPendingTeam,
    }),
    [
      liff,
      isReady,
      isInClient,
      isLoggedIn,
      isMock,
      reason,
      profile,
      error,
      handleLogin,
      teams,
      currentTeam,
      selectTeam,
      isLoadingTeam,
      isDemo,
      refreshTeams,
      updateCurrentTeamLogo,
      updateCurrentTeamCover,
      pendingTeams,
      pendingJoinCode,
      shouldOpenJoinModal,
      persistPendingJoinCode,
      clearPendingJoinCode,
      recordOptimisticPendingTeam,
    ]
  );

  return (
    <LiffContext.Provider value={contextValue}>
      {children}
    </LiffContext.Provider>
  );
}

export function useLiff() {
  return useContext(LiffContext);
}

/**
 * スコア表示（試合カード・スコアボード・清書スコアブック・打席経過・個人成績・早見表等）で
 * チーム共通設定（`organization` = チーム名 [デフォルト] / `squad` = 構成名）に応じた自チーム名をリアクティブに取得するフック
 * ⚠️ 内部DBスキーマでは `organizations` (`orgName`) = チーム名、`teams` (`teamName`) = 構成名であるため絶対に逆転させないこと。
 */
export function useScoreTeamDisplayName(fallback = "自チーム"): {
  scoreTeamName: string;
  scoreTeamNameMode: ScoreTeamNameDisplayMode;
  orgDisplayName: string;
  squadDisplayName: string;
} {
  const { currentTeam } = useLiff();
  const [, setRevision] = useState(0);

  useEffect(() => {
    const bump = () => setRevision((v) => v + 1);
    window.addEventListener(LIFF_SCORE_SETTINGS_CHANGE_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(LIFF_SCORE_SETTINGS_CHANGE_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const scoreTeamNameMode = loadTeamScoreNameDisplayMode(
    currentTeam?.id,
    currentTeam?.scoreTeamNameMode
  );
  const orgDisplayName =
    (currentTeam?.orgName || currentTeam?.name || fallback).trim() || fallback;
  const rawSquad = (currentTeam?.teamName || "").trim();
  const squadDisplayName =
    (rawSquad && rawSquad !== "チームHUB"
      ? rawSquad
      : currentTeam?.shortName || currentTeam?.name || fallback
    ).trim() || fallback;
  const scoreTeamName = resolveScoreTeamDisplayName(
    currentTeam,
    scoreTeamNameMode,
    fallback
  );

  return {
    scoreTeamName,
    scoreTeamNameMode,
    orgDisplayName,
    squadDisplayName,
  };
}

/**
 * チーム設定で指定された「練習試合の呼称」（例: `練習試合` / `OP戦` / `オープン戦` 等）をリアクティブに取得するフック
 */
export function usePracticeMatchLabel(): string {
  const { currentTeam } = useLiff();
  const [, setRevision] = useState(0);

  useEffect(() => {
    const bump = () => setRevision((v) => v + 1);
    window.addEventListener(LIFF_SCORE_SETTINGS_CHANGE_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(LIFF_SCORE_SETTINGS_CHANGE_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  return loadTeamPracticeMatchLabel(
    currentTeam?.id,
    currentTeam?.practiceMatchLabel
  );
}

/**
 * 全LIFF画面で統一利用する権限判定フック（サーバー `src/lib/team-access.ts` の7軸権限と完全同期）
 * - `canManageTeam`: チーム管理（IT管理コンソール `/liff/admin/*`・参加承認・役職/権限設定・マスタ管理・LINE通知・ティッカー編集）
 * - `canManageOps`: 運用・規定の設定（`/liff/settings/team` チーム表示・予定設定、`/liff/settings/score` スコア・試合規定）
 * - `canManagePlayers`: 選手名簿・試合管理（選手登録/削除、試合本体作成/編集/削除、球場・関連チーム編集）
 * - `canEditScore`: スコア・オーダー記録（スタメン・ベンチ編成、スコアブックAI取込・記録編集、LINE速報入力）
 * - `canEditSchedule`: 予定・行事・資料編集（活動予定、出欠項目/代理入力、行事アンケート/集金管理、ルール/FAQ/資料/リンク編集）
 * - `canEditCarpool`: 配車編成・管理（配車表・号車割り・乗車メンバー・道具セット編成）
 * - `canMutate`: 一般メンバー操作（本人/家族の出欠・行事回答、マイカー登録、隊列GPS発信・積載チェック、アルバム投稿、セルフ名鑑編集）
 * - `canUsePaidAi`: 有償クラウドAI解析・R2アップロード・スコアブッククラウド保存（体験デモモード・未ログイン・閲覧専用は `false`）
 */
export function useLiffPermissions() {
  const { currentTeam, isDemo, isLoggedIn, isLoadingTeam, profile } = useLiff();
  const isDemoMode = Boolean(
    isDemo || !currentTeam || currentTeam.isDemo || currentTeam.id === "demo-team"
  );
  const effectiveLoggedIn = Boolean(
    isLoggedIn || (profile?.userId && profile.userId !== "cached-user")
  );

  return {
    isDemoMode,
    isLoadingTeam,
    isLoggedIn: effectiveLoggedIn,
    canManageTeam: canManageCurrentTeam(currentTeam, isDemo),
    canManageOps: canManageOpsCurrentTeam(currentTeam, isDemo),
    canManagePlayers: canManagePlayersCurrentTeam(currentTeam, isDemo),
    canEditScore: canEditScoreCurrentTeam(currentTeam, isDemo),
    canEditSchedule: canEditScheduleCurrentTeam(currentTeam, isDemo),
    canEditCarpool: canEditCarpoolCurrentTeam(currentTeam, isDemo),
    canMutate: canMutateCurrentTeam(currentTeam, isDemo, effectiveLoggedIn),
    canUsePaidAi: canUsePaidCloudFeatures(
      currentTeam,
      isDemo,
      effectiveLoggedIn
    ),
  };
}

