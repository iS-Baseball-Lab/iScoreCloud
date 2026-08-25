// filepath: src/components/liff/LiffProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Liff } from "@line/liff";
import { LiffUserProfile, initLiff, getLiffProfile, loginLiff } from "@/lib/liff/liff-client";
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

  // チーム状態 (LocalStorageから同期的に初期IDを取得)
  const [teams, setTeams] = useState<LiffTeamItem[]>([]);
  const [currentTeam, setCurrentTeam] = useState<LiffTeamItem | null>(() => {
    if (typeof window !== "undefined") {
      const storedId = localStorage.getItem("iscore_selectedTeamId");
      const storedName = localStorage.getItem("iscore_selectedTeamName");
      if (storedId) {
        return {
          id: storedId,
          name: storedName || "選択チーム",
          shortName: storedName || "選択チーム",
        };
      }
    }
    return null;
  });
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  // チーム選択ハンドラー（LocalStorageに永続化し、全画面で同期）
  const selectTeam = useCallback((teamId: string) => {
    if (teamId === "demo-team") {
      setIsDemo(true);
      setTeams((prevTeams) => {
        const found = prevTeams.find((t) => t.id === "demo-team");
        if (found) {
          setCurrentTeam(found);
        }
        return prevTeams;
      });
    } else {
      setIsDemo(false);
      localStorage.setItem("iscore_selectedTeamId", teamId);
      setTeams((prevTeams) => {
        const found = prevTeams.find((t) => t.id === teamId);
        if (found) {
          setCurrentTeam(found);
          localStorage.setItem("iscore_selectedTeamName", found.name);
        }
        return prevTeams;
      });
    }
  }, []);

  // チーム一覧 & 初期選択チームのロード
  const loadTeams = useCallback(async () => {
    try {
      setIsLoadingTeam(true);
      const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const urlTeamId = urlParams?.get("teamId");
      const storedTeamId = typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : null;
      const targetTeamId = urlTeamId || storedTeamId;

      const endpoint = targetTeamId ? `/api/liff/hub?teamId=${targetTeamId}` : `/api/liff/hub`;
      const res = await fetch(endpoint);

      if (res.ok) {
        const data = await res.json() as {
          isDemo?: boolean;
          teams?: LiffTeamItem[];
          team?: { id: string | null; name: string; orgName?: string; teamName?: string; shortName: string; logoImageUrl?: string };
        };

        setIsDemo(!!data.isDemo);
        const teamList = data.teams || [];
        setTeams(teamList);

        // 選択中チームの特定
        let activeTeam: LiffTeamItem | null = null;
        if (targetTeamId && !data.isDemo) {
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
            isDemo: !!data.isDemo,
          };
        }
        if (!activeTeam && teamList.length > 0) {
          activeTeam = teamList[0];
        }

        if (activeTeam) {
          setCurrentTeam(activeTeam);
          if (!data.isDemo && activeTeam.id !== "demo-team") {
            localStorage.setItem("iscore_selectedTeamId", activeTeam.id);
            localStorage.setItem("iscore_selectedTeamName", activeTeam.name);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load teams in LiffProvider:", err);
    } finally {
      setIsLoadingTeam(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

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
      // 外部ブラウザの場合は Better-Auth の LINE ログインを起動
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

          // LINEアプリ内またはログイン済みの場合
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
            // LINEアプリ内の場合は自動ログインをトリガー
            instance.login();
          }
        }
        setIsReady(true);
      } catch (err: any) {
        if (!isMounted) return;
        console.error("LiffProvider init error:", err);
        setError(err?.message || "LIFF initialization failed");
        setIsReady(true);
      }
    }

    setup();

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
        refreshTeams: loadTeams,
      }}
    >
      {children}
    </LiffContext.Provider>
  );
}

export function useLiff() {
  return useContext(LiffContext);
}
