// filepath: src/contexts/TeamContext.tsx
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface Team {
  id: string;
  name: string;
  organizationCategory?: string;
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

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 💡 マウント時に localStorage から復元
  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    const savedName = localStorage.getItem(NAME_STORAGE_KEY);
    const savedCategory = localStorage.getItem(CATEGORY_STORAGE_KEY) || undefined;
    const savedLogo = localStorage.getItem(LOGO_STORAGE_KEY) || undefined;
    const savedLegend = localStorage.getItem(LEGEND_STORAGE_KEY) || undefined;

    if (savedId && savedName) {
      setCurrentTeam({ 
        id: savedId, 
        name: savedName, 
        organizationCategory: savedCategory, 
        logoImageUrl: savedLogo,
        scorebookLegendUrl: savedLegend
      });
    }
    setIsLoading(false);
  }, []);

  // 💡 チーム選択時のアクション
  const selectTeam = useCallback((team: Team) => {
    setCurrentTeam(team);
    localStorage.setItem(STORAGE_KEY, team.id);
    localStorage.setItem(NAME_STORAGE_KEY, team.name);
    localStorage.setItem(CATEGORY_STORAGE_KEY, team.organizationCategory || "");
    localStorage.setItem(LOGO_STORAGE_KEY, team.logoImageUrl || "");
    localStorage.setItem(LEGEND_STORAGE_KEY, team.scorebookLegendUrl || "");
  }, []);

  return (
    <TeamContext.Provider value={{ currentTeam, selectTeam, isLoading }}>
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