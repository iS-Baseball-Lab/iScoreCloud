// filepath: src/components/liff/LiffProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { Liff } from "@line/liff";
import { LiffUserProfile, initLiff, getLiffProfile } from "@/lib/liff/liff-client";
import { LIFF_THEME_CHANGE_EVENT, syncLiffThemeClasses } from "@/lib/liff/theme-settings";
import {
  buildLiffHubUrl,
  fetchLiffJsonSWR,
  installLiffFastFetchCache,
  invalidateLiffApiCache,
  prefetchLiffCoreEndpoints,
} from "@/lib/liff/api-cache";
import { authClient } from "@/lib/auth-client";

export interface LiffTeamItem {
  id: string;
  name: string;
  orgName?: string;
  teamName?: string;
  shortName: string;
  logoImageUrl?: string;
  role?: string;
  isDemo?: boolean;
}

interface HubTeamsPayload {
  isDemo?: boolean;
  teams?: LiffTeamItem[];
  team?: {
    id: string | null;
    name: string;
    orgName?: string;
    teamName?: string;
    shortName: string;
    logoImageUrl?: string;
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
  }
  const [liff, setLiff] = useState<Liff | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInClient, setIsInClient] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
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

  // チーム状態 (LocalStorageから同期的に完全なチームオブジェクトを取得)
  const [teams, setTeams] = useState<LiffTeamItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const storedTeams = localStorage.getItem("iscore_teams_json");
        if (storedTeams) {
          return JSON.parse(storedTeams) as LiffTeamItem[];
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

  const [currentTeam, setCurrentTeam] = useState<LiffTeamItem | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const storedTeamJson = localStorage.getItem("iscore_currentTeam_json");
        if (storedTeamJson) {
          return JSON.parse(storedTeamJson) as LiffTeamItem;
        }
      } catch {}
      const storedId = localStorage.getItem("iscore_selectedTeamId");
      const storedName = localStorage.getItem("iscore_selectedTeamName");
      if (storedId) {
        return {
          id: storedId,
          name: storedName || "チーム",
          orgName: storedName || "チーム",
          teamName: "チームHUB",
          shortName: storedName || "チーム",
        };
      }
    }
    return null;
  });
  const [isLoadingTeam, setIsLoadingTeam] = useState<boolean>(() => currentTeam === null);

  // チーム選択ハンドラー（LocalStorageに永続化し、全画面で同期）
  const selectTeam = useCallback((teamId: string) => {
    if (teamId === "demo-team") {
      setIsDemo(true);
      localStorage.setItem("iscore_isDemo", "true");
      localStorage.setItem("iscore_selectedTeamId", "demo-team");
      setTeams((prevTeams) => {
        let found = prevTeams.find((t) => t.id === "demo-team");
        if (!found) {
          found = {
            id: "demo-team",
            name: "iScoreドリームス",
            orgName: "iScoreドリームス",
            teamName: "体験デモチーム",
            shortName: "ドリームス",
            isDemo: true,
          };
        }
        setCurrentTeam(found);
        localStorage.setItem("iscore_selectedTeamName", found.name);
        localStorage.setItem("iscore_currentTeam_json", JSON.stringify(found));
        return prevTeams;
      });
    } else {
      setIsDemo(false);
      localStorage.setItem("iscore_isDemo", "false");
      localStorage.setItem("iscore_selectedTeamId", teamId);
      setTeams((prevTeams) => {
        const found = prevTeams.find((t) => t.id === teamId);
        if (found) {
          setCurrentTeam(found);
          localStorage.setItem("iscore_selectedTeamName", found.name);
          localStorage.setItem("iscore_currentTeam_json", JSON.stringify(found));
        }
        return prevTeams;
      });
    }
  }, []);

  const applyHubPayload = useCallback((data: HubTeamsPayload, targetTeamId: string | null, uid: string, uName: string) => {
    const demoFlag = !!data.isDemo;
    setIsDemo(demoFlag);
    localStorage.setItem("iscore_isDemo", demoFlag ? "true" : "false");

    const teamList = data.teams || [];
    setTeams(teamList);
    localStorage.setItem("iscore_teams_json", JSON.stringify(teamList));

    let activeTeam: LiffTeamItem | null = null;
    if (demoFlag || targetTeamId === "demo-team") {
      activeTeam = teamList.find((t) => t.id === "demo-team") || {
        id: "demo-team",
        name: "iScoreドリームス",
        orgName: "iScoreドリームス",
        teamName: "体験デモチーム",
        shortName: "ドリームス",
        isDemo: true,
      };
    } else if (targetTeamId) {
      activeTeam = teamList.find((t) => t.id === targetTeamId) || null;
    }

    if (!activeTeam && data.team?.id) {
      activeTeam = {
        id: data.team.id,
        name: data.team.name,
        orgName: data.team.orgName,
        teamName: data.team.teamName,
        shortName: data.team.shortName,
        logoImageUrl: data.team.logoImageUrl,
        isDemo: demoFlag,
      };
    }
    if (!activeTeam && teamList.length > 0) {
      activeTeam = teamList[0];
    }

    if (activeTeam) {
      setCurrentTeam((prev) => {
        if (
          prev &&
          prev.id === activeTeam!.id &&
          prev.name === activeTeam!.name &&
          prev.logoImageUrl === activeTeam!.logoImageUrl &&
          prev.isDemo === activeTeam!.isDemo
        ) {
          return prev;
        }
        return activeTeam;
      });
      localStorage.setItem("iscore_currentTeam_json", JSON.stringify(activeTeam));
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
      const storedIsDemo = typeof window !== "undefined" ? localStorage.getItem("iscore_isDemo") === "true" : false;
      const storedUserId =
        typeof window !== "undefined"
          ? localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || ""
          : "";
      const storedUserName =
        typeof window !== "undefined" ? localStorage.getItem("iscore_user_name") || "" : "";

      let targetTeamId: string | null = null;
      if (urlTeamId) {
        targetTeamId = urlTeamId;
      } else if (storedTeamId) {
        if (storedTeamId === "demo-team") {
          if (storedIsDemo) targetTeamId = "demo-team";
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
      console.error("Failed to load teams in LiffProvider:", err);
    } finally {
      setIsLoadingTeam(false);
    }
  }, [applyHubPayload]);

  const refreshTeams = useCallback(async () => {
    await loadTeams(true);
  }, [loadTeams]);

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

  const { data: authSession } = authClient.useSession();

  // 本家Web版（Better-Auth）のセッションが存在する場合、プロファイルに自動反映
  useEffect(() => {
    if (authSession?.user?.name) {
      const userProf: LiffUserProfile = {
        userId: authSession.user.id,
        displayName: authSession.user.name,
        pictureUrl: authSession.user.image || undefined,
      };
      setProfile((prev) => prev || userProf);
      setIsLoggedIn(true);
      localStorage.setItem("iscore_user_name", authSession.user.name);
      localStorage.setItem("iscore_user_id", authSession.user.id);
      if (authSession.user.image) {
        localStorage.setItem("iscore_user_avatar", authSession.user.image);
      }
    }
  }, [authSession]);

  // ログイン処理ハンドラー (LIFFとBetter-Authソーシャルログインのハイブリッド)
  const handleLogin = useCallback(async () => {
    if (isInClient && liff) {
      if (!liff.isLoggedIn()) {
        liff.login({
          redirectUri: typeof window !== "undefined" ? window.location.href : undefined,
        });
      }
    } else {
      try {
        await authClient.signIn.social({
          provider: "line",
          callbackURL: typeof window !== "undefined" ? window.location.href : "/liff",
        });
      } catch {
        if (liff) {
          liff.login();
        }
      }
    }
  }, [isInClient, liff]);

  useEffect(() => {
    let isMounted = true;

    async function setup() {
      try {
        const { liff: instance, isMock: mockMode, reason: mockReason } = await initLiff(liffId);
        if (!isMounted) return;

        setIsMock(mockMode);
        setReason(mockReason);

        if (instance) {
          setLiff(instance);
          await instance.ready;
          const inClient = instance.isInClient();
          setIsInClient(inClient);

          if (instance.isLoggedIn()) {
            const userProfile = await getLiffProfile();
            if (isMounted && userProfile) {
              setProfile(userProfile);
              setIsLoggedIn(true);
              localStorage.setItem("iscore_user_name", userProfile.displayName);
              localStorage.setItem("iscore_user_id", userProfile.userId);
              if (userProfile.pictureUrl) {
                localStorage.setItem("iscore_user_avatar", userProfile.pictureUrl);
              }
            }
          } else if (inClient) {
            instance.login();
          }
        }
        setIsReady(true);
      } catch (err: unknown) {
        if (!isMounted) return;
        console.error("LiffProvider init error:", err);
        const message = err instanceof Error ? err.message : "LIFF initialization failed";
        setError(message);
        setIsReady(true);
      }
    }

    void setup();

    return () => {
      isMounted = false;
    };
  }, [liffId]);

  return (
    <LiffContext.Provider
      value={{
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
      }}
    >
      {children}
    </LiffContext.Provider>
  );
}

export function useLiff() {
  return useContext(LiffContext);
}
