// filepath: src/contexts/TeamContext.tsx
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";

export interface Team {
  id: string;
  name: string;
  organizationCategory?: string;
  logoImageUrl?: string | null;
  scorebookLegendUrl?: string | null;
}

interface ServerTeamRow {
  id: string;
  name: string;
  category?: string;
  logoImageUrl?: string | null;
  scorebookLegendUrl?: string | null;
}

interface TeamContextType {
  currentTeam: Team | null;
  selectTeam: (team: Team) => void;
  isLoading: boolean;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

const STORAGE_KEY = "iscore_selectedTeamId";
const NAME_STORAGE_KEY = "iscore_selectedTeamName";
const CATEGORY_STORAGE_KEY = "iscore_selectedTeamCategory";
const LOGO_STORAGE_KEY = "iscore_selectedTeamLogo";
const LEGEND_STORAGE_KEY = "iscore_selectedTeamLegend";

function clearStoredWebTeam(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(NAME_STORAGE_KEY);
    localStorage.removeItem(CATEGORY_STORAGE_KEY);
    localStorage.removeItem(LOGO_STORAGE_KEY);
    localStorage.removeItem(LEGEND_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 💡 マウント時にサーバーから承認済みチーム一覧を取得・照合し、権限外の残留チームIDは即破棄
  useEffect(() => {
    // 🌟 LIFF 画面や公開LP・認証前ページでは不要な /api/teams 通信を行わない
    if (
      !pathname ||
      pathname.startsWith("/liff") ||
      pathname === "/" ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/pending-approval") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/terms")
    ) {
      setIsLoading(false);
      return;
    }

    const savedId = localStorage.getItem(STORAGE_KEY);
    const savedName = localStorage.getItem(NAME_STORAGE_KEY);
    const savedCategory = localStorage.getItem(CATEGORY_STORAGE_KEY) || undefined;
    const savedLogo = localStorage.getItem(LOGO_STORAGE_KEY) || undefined;
    const savedLegend = localStorage.getItem(LEGEND_STORAGE_KEY) || undefined;

    if (savedId && savedId !== "demo-team" && savedName) {
      setCurrentTeam({
        id: savedId,
        name: savedName,
        organizationCategory: savedCategory,
        logoImageUrl: savedLogo,
        scorebookLegendUrl: savedLegend,
      });
    }

    let cancelled = false;
    fetch("/api/teams", { cache: "no-store" })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            setCurrentTeam(null);
            clearStoredWebTeam();
          }
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data: unknown) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          const rows = data as ServerTeamRow[];
          const matched =
            (savedId ? rows.find((t) => t.id === savedId) : undefined) || rows[0];
          if (matched) {
            const serverTeam: Team = {
              id: matched.id,
              name: matched.name,
              organizationCategory: matched.category || undefined,
              logoImageUrl: matched.logoImageUrl || undefined,
              scorebookLegendUrl: matched.scorebookLegendUrl || undefined,
            };
            setCurrentTeam(serverTeam);
            localStorage.setItem(STORAGE_KEY, serverTeam.id);
            localStorage.setItem(NAME_STORAGE_KEY, serverTeam.name);
            localStorage.setItem(CATEGORY_STORAGE_KEY, serverTeam.organizationCategory || "");
            localStorage.setItem(LOGO_STORAGE_KEY, serverTeam.logoImageUrl || "");
            localStorage.setItem(LEGEND_STORAGE_KEY, serverTeam.scorebookLegendUrl || "");
          } else {
            setCurrentTeam(null);
            clearStoredWebTeam();
          }
        }
      })
      .catch((err) => {
        console.error("Failed to sync team data from server:", err);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // 💡 チーム選択時のアクション
  const selectTeam = useCallback((team: Team) => {
    setCurrentTeam(team);
    localStorage.setItem(STORAGE_KEY, team.id);
    localStorage.setItem(NAME_STORAGE_KEY, team.name);
    localStorage.setItem(CATEGORY_STORAGE_KEY, team.organizationCategory || "");
    localStorage.setItem(LOGO_STORAGE_KEY, team.logoImageUrl || "");
    localStorage.setItem(LEGEND_STORAGE_KEY, team.scorebookLegendUrl || "");
  }, []);

  const contextValue = useMemo(
    () => ({ currentTeam, selectTeam, isLoading }),
    [currentTeam, selectTeam, isLoading]
  );

  return (
    <TeamContext.Provider value={contextValue}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error("useTeam must be used within a TeamProvider");
  }
  return context;
}
