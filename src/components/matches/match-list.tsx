// filepath: src/components/matches/match-list.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Swords } from "lucide-react";
import { Match } from "@/types/match";
import { EmptyState } from "@/components/layout/EmptyState";
import { MatchCard } from "@/components/matches/match-card";

interface MatchListProps {
  matches: Match[];
  isLoading: boolean;
  onDelete?: (id: string) => void;
}

export function MatchList({ matches, isLoading, onDelete }: MatchListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [teamFullName, setTeamFullName] = useState("");

  useEffect(() => {
    const fetchTeamName = async () => {
      const teamId = localStorage.getItem("iscore_selectedTeamId");
      if (!teamId) return;
      const teamRes = await fetch("/api/auth/me");
      if (teamRes.ok) {
        const res = (await teamRes.json()) as { data: { memberships: { teamId: string; organizationName?: string; teamName: string }[] } };
        const currentMembership = res.data.memberships.find(m => m.teamId === teamId);
        if (currentMembership) {
          setTeamFullName(`${currentMembership.organizationName ?? ""} ${currentMembership.teamName}`.trim());
        }
      }
    };
    fetchTeamName();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3 px-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 w-full rounded-2xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!matches || matches.length === 0) {
    return (
      <EmptyState
        icon={Swords}
        title="試合データがありません"
        description="No match data recorded yet"
      />
    );
  }

  return (
    <div className="space-y-3 overflow-x-hidden px-1 pb-1">
      {matches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          isExpanded={expandedId === match.id}
          onToggleExpand={() => setExpandedId(expandedId === match.id ? null : match.id)}
          enableSwipe={true}
          onDelete={onDelete}
          teamFullName={teamFullName}
        />
      ))}
    </div>
  );
}
