// filepath: src/lib/liff/team-profile-schema.ts

export interface TeamCategoryOption {
  value: string;
  label: string;
  shortLabel: string;
}

export const TEAM_CATEGORY_OPTIONS: readonly TeamCategoryOption[] = [
  {
    value: "gakudou",
    label: "学童野球（小学生・軟式）",
    shortLabel: "学童野球（軟式）",
  },
  {
    value: "little",
    label: "リトル・ボーイズ等（小学生・硬式）",
    shortLabel: "小学生硬式",
  },
  {
    value: "chugaku_nanshiki",
    label: "中学軟式（部活・クラブ）",
    shortLabel: "中学軟式",
  },
  {
    value: "chugaku_koshiki",
    label: "中学硬式（シニア・ボーイズ・ヤング等）",
    shortLabel: "中学硬式",
  },
  {
    value: "koukou",
    label: "高校野球（硬式・軟式）",
    shortLabel: "高校野球",
  },
  {
    value: "daigaku",
    label: "大学野球・準硬式",
    shortLabel: "大学野球",
  },
  {
    value: "shakaijin",
    label: "社会人・企業・クラブチーム",
    shortLabel: "社会人・クラブ",
  },
  {
    value: "kusa",
    label: "草野球・一般軟式",
    shortLabel: "草野球",
  },
  {
    value: "softball",
    label: "ソフトボール",
    shortLabel: "ソフトボール",
  },
  {
    value: "other",
    label: "その他",
    shortLabel: "その他",
  },
] as const;

export function resolveTeamCategoryOption(
  rawCategory: string | null | undefined
): TeamCategoryOption {
  const normalized = (rawCategory || "").trim();
  const found = TEAM_CATEGORY_OPTIONS.find((opt) => opt.value === normalized);
  return (
    found || {
      value: "other",
      label: "その他",
      shortLabel: "野球チーム",
    }
  );
}

export type HonorBadgeTone = "gold" | "silver" | "bronze" | "blue";

export interface HonorResultPreset {
  label: string;
  tone: HonorBadgeTone;
}

export const HONOR_RESULT_PRESETS: readonly HonorResultPreset[] = [
  { label: "優勝", tone: "gold" },
  { label: "準優勝", tone: "silver" },
  { label: "第3位", tone: "bronze" },
  { label: "ベスト4", tone: "bronze" },
  { label: "ブロック優勝", tone: "gold" },
  { label: "上部・都県大会出場", tone: "blue" },
  { label: "ベスト8・敢闘賞", tone: "blue" },
] as const;

export function inferHonorBadgeTone(
  resultText: string,
  explicitTone?: unknown
): HonorBadgeTone {
  if (
    explicitTone === "gold" ||
    explicitTone === "silver" ||
    explicitTone === "bronze" ||
    explicitTone === "blue"
  ) {
    return explicitTone;
  }
  const text = resultText.trim();
  if (text.includes("準優勝") || text.includes("2位") || text.includes("二位")) {
    return "silver";
  }
  if (text.includes("優勝") || text.includes("1位") || text.includes("一位") || text.includes("制覇")) {
    return "gold";
  }
  if (
    text.includes("3位") ||
    text.includes("三位") ||
    text.includes("ベスト4") ||
    text.includes("4強") ||
    text.includes("銅")
  ) {
    return "bronze";
  }
  return "blue";
}

export interface TeamHonorItem {
  id: string;
  year: string;
  tournament: string;
  result: string;
  badgeTone: HonorBadgeTone;
  squadLabel: string;
}

export interface OrganizationProfileDetails {
  slogan: string;
  philosophy: string;
  activityArea: string;
  activityDays: string;
  representativeName: string;
  affiliatedLeagues: string[];
  honors: TeamHonorItem[];
}

export const EMPTY_ORGANIZATION_PROFILE_DETAILS: OrganizationProfileDetails = {
  slogan: "",
  philosophy: "",
  activityArea: "",
  activityDays: "",
  representativeName: "",
  affiliatedLeagues: [],
  honors: [],
};

function sanitizeTrimmedString(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, maxLen);
}

export function parseOrganizationProfileDetails(
  rawJson: string | null | undefined
): OrganizationProfileDetails {
  if (!rawJson) {
    return {
      ...EMPTY_ORGANIZATION_PROFILE_DETAILS,
      affiliatedLeagues: [],
      honors: [],
    };
  }
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ...EMPTY_ORGANIZATION_PROFILE_DETAILS,
        affiliatedLeagues: [],
        honors: [],
      };
    }
    const obj = parsed as Record<string, unknown>;

    const rawLeagues = Array.isArray(obj.affiliatedLeagues)
      ? obj.affiliatedLeagues
      : [];
    const affiliatedLeagues: string[] = [];
    for (const item of rawLeagues) {
      const cleaned = sanitizeTrimmedString(item, 60);
      if (cleaned && !affiliatedLeagues.includes(cleaned)) {
        affiliatedLeagues.push(cleaned);
      }
      if (affiliatedLeagues.length >= 12) break;
    }

    const rawHonors = Array.isArray(obj.honors) ? obj.honors : [];
    const honors: TeamHonorItem[] = [];
    rawHonors.forEach((entry, idx) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
      const h = entry as Record<string, unknown>;
      const tournament = sanitizeTrimmedString(h.tournament, 80);
      const result = sanitizeTrimmedString(h.result, 40);
      if (!tournament || !result) return;
      const yearRaw = sanitizeTrimmedString(h.year, 12);
      const year = yearRaw || String(new Date().getFullYear());
      const id =
        sanitizeTrimmedString(h.id, 48) || `honor_${idx + 1}_${year}`;
      const squadLabel = sanitizeTrimmedString(h.squadLabel, 30);
      const badgeTone = inferHonorBadgeTone(result, h.badgeTone);
      honors.push({
        id,
        year,
        tournament,
        result,
        badgeTone,
        squadLabel,
      });
    });

    honors.sort((a, b) => {
      const ya = Number.parseInt(a.year, 10) || 0;
      const yb = Number.parseInt(b.year, 10) || 0;
      return yb - ya;
    });

    return {
      slogan: sanitizeTrimmedString(obj.slogan, 80),
      philosophy: sanitizeTrimmedString(obj.philosophy, 800),
      activityArea: sanitizeTrimmedString(obj.activityArea, 80),
      activityDays: sanitizeTrimmedString(obj.activityDays, 100),
      representativeName: sanitizeTrimmedString(obj.representativeName, 40),
      affiliatedLeagues,
      honors: honors.slice(0, 40),
    };
  } catch {
    return {
      ...EMPTY_ORGANIZATION_PROFILE_DETAILS,
      affiliatedLeagues: [],
      honors: [],
    };
  }
}

export function serializeOrganizationProfileDetails(
  input: Partial<OrganizationProfileDetails>
): string {
  const normalized = parseOrganizationProfileDetails(JSON.stringify(input));
  return JSON.stringify(normalized);
}

// =========================================================
// API レスポンス ＆ リクエスト型定義
// =========================================================

export interface TeamStaffSummaryItem {
  id: string;
  name: string;
  avatarUrl: string | null;
  primaryRoleKey: string;
  roleLabel: string;
  subRoleLabels: string[];
}

export interface TeamGradeBreakdownItem {
  label: string;
  count: number;
}

export interface TeamSquadSummaryItem {
  id: string;
  name: string;
  year: number;
  tier: string;
  teamType: "regular" | "practice";
  managerName: string;
  homeGround: string;
  playerCount: number;
  isCurrent: boolean;
}

export interface TeamGroundSummaryItem {
  id: string;
  name: string;
  shortName: string | null;
  category: string;
  address: string | null;
  mapUrl: string | null;
  surfaceType: string | null;
  dimensions: string | null;
  parkingInfo: string | null;
  spikeRule: string | null;
  isPrimaryHome: boolean;
}

import type { TeamSubLinkItem } from "@/lib/liff/team-links-schema";

export interface TeamLinkSummaryItem {
  id: string;
  title: string;
  url: string;
  category: string;
  description: string | null;
  isImportant: boolean;
  subLinks?: TeamSubLinkItem[];
}

export interface TeamPlayerSelectOption {
  id: string;
  name: string;
  uniformNumber: string;
}

export interface TeamInfoResponse {
  success: boolean;
  isDemo: boolean;
  canEdit: boolean;
  canManage: boolean;
  organization: {
    id: string;
    name: string;
    shortName: string;
    category: string;
    foundedYear: number | null;
    description: string;
    logoImageUrl: string | null;
    coverImageUrl: string | null;
    profile: OrganizationProfileDetails;
  };
  currentSquad: {
    id: string;
    name: string;
    year: number;
    tier: string;
    teamType: "regular" | "practice";
    managerName: string;
    captainId: string | null;
    captainName: string | null;
    captainUniformNumber: string | null;
    homeGround: string;
  };
  rosterSummary: {
    activePlayerCount: number;
    onLeavePlayerCount: number;
    staffCount: number;
    gradeBreakdown: TeamGradeBreakdownItem[];
  };
  staffMembers: TeamStaffSummaryItem[];
  squads: TeamSquadSummaryItem[];
  grounds: TeamGroundSummaryItem[];
  officialLinks: TeamLinkSummaryItem[];
  playerOptions: TeamPlayerSelectOption[];
  seasonRecord: {
    totalMatches: number;
    wins: number;
    losses: number;
    draws: number;
  };
  error?: string;
}

export interface TeamInfoUpdateRequest {
  teamId: string;
  orgName: string;
  orgShortName: string;
  category: string;
  foundedYear: number | null;
  description: string;
  managerName: string;
  captainId: string | null;
  homeGround: string;
  profile: OrganizationProfileDetails;
}
