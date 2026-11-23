// filepath: src/api/liff/team-info.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  matches,
  organizations,
  players,
  teamLinks,
  teamMembers,
  teamRoleSettings,
  teams,
  user,
  venues,
} from "@/db/schema";
import { ensureAllSchemasOnce } from "@/lib/db-helper";
import {
  GRADE_AGE_PRESETS_ADULT,
  GRADE_AGE_PRESETS_YOUTH,
  parsePlayerProfileDetails,
} from "@/lib/liff/player-profile-schema";
import {
  parseOrganizationProfileDetails,
  serializeOrganizationProfileDetails,
  TEAM_CATEGORY_OPTIONS,
  type OrganizationProfileDetails,
  type TeamGradeBreakdownItem,
  type TeamGroundSummaryItem,
  type TeamInfoResponse,
  type TeamInfoUpdateRequest,
  type TeamLinkSummaryItem,
  type TeamPlayerSelectOption,
  type TeamSquadSummaryItem,
  type TeamStaffSummaryItem,
} from "@/lib/liff/team-profile-schema";
import { parseSubLinksJson } from "@/lib/liff/team-links-schema";
import {
  canManageSystem,
  canManageTeam,
  parseTeamRoleDefinitions,
  resolveRoleLabel,
  ROLES,
  type CustomRoleSetting,
} from "@/lib/roles";
import {
  parseSubRolesList,
  resolveCallerTeamAccess,
} from "@/lib/team-access";
import { buildTeamTenantWhere } from "@/lib/tenant-scope";
import type { WorkerEnv } from "@/types/api";

const liffTeamInfoRouter = new Hono<{ Bindings: WorkerEnv }>();

const STAFF_DISPLAY_ROLES = new Set<string>([
  ROLES.MANAGER,
  ROLES.COACH,
  ROLES.ADMIN,
  ROLES.SCORER,
  ROLES.STAFF,
]);

const STAFF_ROLE_PRIORITY: Record<string, number> = {
  [ROLES.MANAGER]: 1,
  [ROLES.COACH]: 2,
  [ROLES.SCORER]: 3,
  [ROLES.STAFF]: 4,
  [ROLES.ADMIN]: 5,
};

const VALID_CATEGORY_SET = new Set<string>(
  TEAM_CATEGORY_OPTIONS.map((opt) => opt.value)
);

const GRADE_SORT_ORDER: readonly string[] = [
  ...[...GRADE_AGE_PRESETS_YOUTH].reverse(), // 高3 ➔ ... ➔ 小6 ➔ 小5 ➔ ... ➔ 小1
  ...GRADE_AGE_PRESETS_ADULT,
];

function getGradeSortRank(label: string): number {
  const idx = GRADE_SORT_ORDER.indexOf(label);
  return idx >= 0 ? idx : 999;
}

function compareUniformNumbers(a: string, b: string): number {
  const ta = a.trim();
  const tb = b.trim();
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  const na = Number.parseInt(ta, 10);
  const nb = Number.parseInt(tb, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) {
    return na - nb;
  }
  return ta.localeCompare(tb, "ja");
}

function buildDemoTeamInfoResponse(): TeamInfoResponse {
  const demoProfile: OrganizationProfileDetails = {
    slogan: "笑顔で全力疾走・仲間とつなぐ一球",
    philosophy:
      "挨拶・礼儀・道具を大切にする心を育みながら、失敗を恐れずフルスイング・全力疾走できる環境づくりを大切にしています。学童期に必要な基礎体力とチームワークを段階的に伸ばします。",
    activityArea: "東京都世田谷区・多摩川緑地周辺",
    activityDays: "毎週 土・日・祝（午前 8:30〜12:30 ／ 午後 13:00〜16:30）",
    representativeName: "山本 健一",
    affiliatedLeagues: [
      "東京都軟式野球連盟",
      "世田谷区少年野球連盟",
      "多摩川少年野球親善リーグ",
    ],
    honors: [
      {
        id: "demo-h-1",
        year: "2026",
        tournament: "春季区民少年野球大会",
        result: "優勝",
        badgeTone: "gold",
        squadLabel: "Aチーム",
      },
      {
        id: "demo-h-2",
        year: "2025",
        tournament: "多摩川カップ学童軟式野球大会",
        result: "準優勝",
        badgeTone: "silver",
        squadLabel: "Aチーム",
      },
      {
        id: "demo-h-3",
        year: "2025",
        tournament: "秋季新人戦（ジュニアの部）",
        result: "ベスト4",
        badgeTone: "bronze",
        squadLabel: "Bチーム",
      },
      {
        id: "demo-h-4",
        year: "2024",
        tournament: "東京都学童軟式野球選手権大会",
        result: "都大会出場",
        badgeTone: "blue",
        squadLabel: "Aチーム",
      },
    ],
  };

  return {
    success: true,
    isDemo: true,
    canEdit: true,
    canManage: true,
    organization: {
      id: "demo-org",
      name: "iScore ドリームス",
      shortName: "ドリームス",
      category: "gakudou",
      foundedYear: 2015,
      description:
        "地域小学校の1年生〜6年生を中心に活動する学童軟式野球チームです。Aチーム・Bチーム（低学年）の2編成で毎週元気に活動しています。",
      logoImageUrl: "/demo-team-logo.svg",
      coverImageUrl: null,
      profile: demoProfile,
    },
    currentSquad: {
      id: "demo-team",
      name: "2026年度 Aチーム",
      year: 2026,
      tier: "A",
      teamType: "regular",
      managerName: "佐藤 健太",
      captainId: "demo-p-1",
      captainName: "鈴木 翔太",
      captainUniformNumber: "10",
      homeGround: "多摩川緑地広場 軟式野球場A面",
    },
    rosterSummary: {
      activePlayerCount: 14,
      onLeavePlayerCount: 0,
      staffCount: 5,
      gradeBreakdown: [
        { label: "小6", count: 6 },
        { label: "小5", count: 5 },
        { label: "小4", count: 3 },
      ],
    },
    staffMembers: [
      {
        id: "demo-st-1",
        name: "佐藤 健太",
        avatarUrl: null,
        primaryRoleKey: "manager",
        roleLabel: "監督",
        subRoleLabels: [],
      },
      {
        id: "demo-st-2",
        name: "高橋 誠",
        avatarUrl: null,
        primaryRoleKey: "coach",
        roleLabel: "ヘッドコーチ",
        subRoleLabels: ["審判"],
      },
      {
        id: "demo-st-3",
        name: "伊藤 大輔",
        avatarUrl: null,
        primaryRoleKey: "coach",
        roleLabel: "投手・守備コーチ",
        subRoleLabels: [],
      },
      {
        id: "demo-st-4",
        name: "鈴木 美咲",
        avatarUrl: null,
        primaryRoleKey: "scorer",
        roleLabel: "公式スコアラー",
        subRoleLabels: ["保護者"],
      },
      {
        id: "demo-st-5",
        name: "渡辺 剛",
        avatarUrl: null,
        primaryRoleKey: "admin",
        roleLabel: "事務局・IT担当",
        subRoleLabels: [],
      },
    ],
    squads: [
      {
        id: "demo-team",
        name: "2026年度 Aチーム",
        year: 2026,
        tier: "A",
        teamType: "regular",
        managerName: "佐藤 健太",
        homeGround: "多摩川緑地広場 軟式野球場A面",
        playerCount: 14,
        isCurrent: true,
      },
      {
        id: "demo-team-b",
        name: "2026年度 Bチーム（低学年）",
        year: 2026,
        tier: "B",
        teamType: "regular",
        managerName: "高橋 誠",
        homeGround: "市立第一小学校グラウンド",
        playerCount: 11,
        isCurrent: false,
      },
    ],
    grounds: [
      {
        id: "demo-v-1",
        name: "多摩川緑地広場 軟式野球場A面",
        shortName: "多摩川A面",
        category: "home",
        address: "東京都世田谷区玉川3丁目 河川敷",
        mapUrl: "https://maps.google.com/?q=多摩川緑地広場野球場",
        surfaceType: "dirt",
        dimensions: "両翼70m / センター85m",
        parkingInfo: "河川敷有料Pあり（1チーム5台まで目安）",
        spikeRule: "ポイントスパイク推奨（金具不可）",
        isPrimaryHome: true,
      },
      {
        id: "demo-v-2",
        name: "市立第一小学校グラウンド",
        shortName: "第一小G",
        category: "school",
        address: "東京都世田谷区玉川1丁目",
        mapUrl: null,
        surfaceType: "dirt",
        dimensions: null,
        parkingInfo: "校内駐車不可（近隣コインP利用）",
        spikeRule: "トレーニングシューズ・ポイント可",
        isPrimaryHome: false,
      },
    ],
    officialLinks: [
      {
        id: "demo-l-1",
        title: "世田谷区少年野球連盟 公式サイト",
        url: "https://example.com/league",
        category: "league",
        description: "大会日程・トーナメント表・連盟規定",
        isImportant: true,
        subLinks: [
          {
            id: "demo-l-1-sub-1",
            title: "春季大会 トーナメント表",
            url: "https://example.com/league/spring-bracket",
            note: "Aクラス・ジュニアの部",
          },
          {
            id: "demo-l-1-sub-2",
            title: "連盟特別規則・グラウンド注意",
            url: "https://example.com/league/rules",
            note: null,
          },
        ],
      },
      {
        id: "demo-l-2",
        title: "iScore ドリームス 公式Instagram",
        url: "https://instagram.com",
        category: "sns",
        description: "週末の試合結果・体験練習会のお知らせ",
        isImportant: true,
        subLinks: [],
      },
    ],
    playerOptions: [
      { id: "demo-p-2", name: "佐藤 蓮", uniformNumber: "1" },
      { id: "demo-p-3", name: "高橋 陸", uniformNumber: "6" },
      { id: "demo-p-1", name: "鈴木 翔太", uniformNumber: "10" },
    ],
    seasonRecord: {
      totalMatches: 12,
      wins: 9,
      losses: 2,
      draws: 1,
    },
  };
}

// =========================================================
// GET /api/liff/team-info?teamId=...
// =========================================================
liffTeamInfoRouter.get("/", async (c) => {
  try {
    const rawTeamId = (c.req.query("teamId") || "").trim();
    if (!rawTeamId || rawTeamId === "demo-team") {
      return c.json(buildDemoTeamInfoResponse());
    }

    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    if (!access.canAccessTeam(rawTeamId)) {
      return c.json(
        { success: false, error: "このチームへのアクセス権限がありません" },
        403
      );
    }

    const db = drizzle(c.env.DB);

    const currentRow = await db
      .select({
        teamId: teams.id,
        orgId: teams.organizationId,
        squadName: teams.name,
        year: teams.year,
        managerName: teams.managerName,
        captainId: teams.captainId,
        homeGround: teams.homeGround,
        tier: teams.tier,
        teamType: teams.teamType,
        rolePermissionsJson: teams.rolePermissionsJson,
        orgName: organizations.name,
        orgShortName: organizations.shortName,
        orgCategory: organizations.category,
        orgFoundedYear: organizations.foundedYear,
        orgDescription: organizations.description,
        orgLogoUrl: organizations.logoImageUrl,
        orgCoverUrl: organizations.coverImageUrl,
        orgProfileJson: organizations.profileJson,
      })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, rawTeamId))
      .get();

    if (!currentRow) {
      return c.json(
        { success: false, error: "対象チームが見つかりません" },
        404
      );
    }

    const grant = access.teamRoles.get(rawTeamId);
    const myRole = (grant?.role || "viewer").toLowerCase();
    const subRoles = grant?.subRoles || [];

    const canManage =
      access.isSystemAdmin ||
      access.canManageTeamId(rawTeamId) ||
      canManageSystem(myRole, subRoles);

    const canEdit =
      canManage ||
      access.canManagePlayersForTeam(rawTeamId) ||
      access.canManageOpsForTeam(rawTeamId);

    const orgId = currentRow.orgId || null;
    const tenantScope = { teamId: rawTeamId, organizationId: orgId };

    const [
      siblingRows,
      teamPlayerRows,
      memberRows,
      roleSettingRows,
      venueRows,
      linkRows,
      finishedMatchRows,
    ] = await Promise.all([
      orgId
        ? db
            .select({
              id: teams.id,
              name: teams.name,
              year: teams.year,
              tier: teams.tier,
              teamType: teams.teamType,
              managerName: teams.managerName,
              homeGround: teams.homeGround,
            })
            .from(teams)
            .where(eq(teams.organizationId, orgId))
            .orderBy(desc(teams.year), asc(teams.name))
            .all()
        : Promise.resolve([
            {
              id: currentRow.teamId,
              name: currentRow.squadName,
              year: currentRow.year,
              tier: currentRow.tier,
              teamType: currentRow.teamType,
              managerName: currentRow.managerName,
              homeGround: currentRow.homeGround,
            },
          ]),
      db
        .select({
          id: players.id,
          name: players.name,
          uniformNumber: players.uniformNumber,
          conditionStatus: players.conditionStatus,
          profileDetails: players.profileDetails,
          isActive: players.isActive,
        })
        .from(players)
        .where(eq(players.teamId, rawTeamId))
        .all(),
      db
        .select({
          id: teamMembers.id,
          memberName: teamMembers.name,
          userName: user.name,
          avatarUrl: teamMembers.avatarUrl,
          userImage: user.image,
          memberType: teamMembers.memberType,
          role: teamMembers.role,
          subRoles: teamMembers.subRoles,
        })
        .from(teamMembers)
        .leftJoin(user, eq(teamMembers.userId, user.id))
        .where(
          and(
            eq(teamMembers.teamId, rawTeamId),
            eq(teamMembers.status, "active")
          )
        )
        .all(),
      db
        .select({
          role: teamRoleSettings.role,
          customLabel: teamRoleSettings.customLabel,
        })
        .from(teamRoleSettings)
        .where(eq(teamRoleSettings.teamId, rawTeamId))
        .all(),
      db
        .select({
          id: venues.id,
          name: venues.name,
          shortName: venues.shortName,
          category: venues.category,
          address: venues.address,
          mapUrl: venues.mapUrl,
          surfaceType: venues.surfaceType,
          dimensions: venues.dimensions,
          parkingInfo: venues.parkingInfo,
          spikeRule: venues.spikeRule,
        })
        .from(venues)
        .where(
          buildTeamTenantWhere(
            { organizationId: venues.organizationId, teamId: venues.teamId },
            tenantScope
          )
        )
        .all(),
      db
        .select({
          id: teamLinks.id,
          title: teamLinks.title,
          url: teamLinks.url,
          category: teamLinks.category,
          description: teamLinks.description,
          isImportant: teamLinks.isImportant,
          priority: teamLinks.priority,
          subLinks: teamLinks.subLinks,
        })
        .from(teamLinks)
        .where(
          buildTeamTenantWhere(
            {
              organizationId: teamLinks.organizationId,
              teamId: teamLinks.teamId,
            },
            tenantScope
          )
        )
        .orderBy(desc(teamLinks.isImportant), asc(teamLinks.priority))
        .all(),
      db
        .select({
          myScore: matches.myScore,
          opponentScore: matches.opponentScore,
        })
        .from(matches)
        .where(
          and(eq(matches.teamId, rawTeamId), eq(matches.status, "finished"))
        )
        .all(),
    ]);

    // 同一クラブ内に複数編成がある場合は各編成の在籍選手数も一括集計
    const siblingIds = siblingRows.map((s) => s.id);
    const squadPlayerCounts = new Map<string, number>();
    if (siblingIds.length > 1) {
      const countRows = await db
        .select({
          teamId: players.teamId,
          cnt: sql<number>`count(*)`,
        })
        .from(players)
        .where(
          and(
            inArray(players.teamId, siblingIds),
            sql`(${players.isActive} IS NULL OR ${players.isActive} = 1)`
          )
        )
        .groupBy(players.teamId)
        .all();
      for (const r of countRows) {
        squadPlayerCounts.set(r.teamId, Number(r.cnt) || 0);
      }
    }

    const activePlayers = teamPlayerRows.filter((p) => p.isActive !== false);
    squadPlayerCounts.set(rawTeamId, activePlayers.length);

    let onLeavePlayerCount = 0;
    const gradeMap = new Map<string, number>();
    for (const p of activePlayers) {
      if ((p.conditionStatus || "").toLowerCase() === "on_leave") {
        onLeavePlayerCount += 1;
      }
      const details = parsePlayerProfileDetails(p.profileDetails);
      const grade = (details.gradeOrAge || "").trim();
      if (grade) {
        gradeMap.set(grade, (gradeMap.get(grade) || 0) + 1);
      }
    }

    const gradeBreakdown: TeamGradeBreakdownItem[] = Array.from(
      gradeMap.entries()
    )
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => {
        const ra = getGradeSortRank(a.label);
        const rb = getGradeSortRank(b.label);
        if (ra !== rb) return ra - rb;
        return a.label.localeCompare(b.label, "ja");
      });

    const playerOptions: TeamPlayerSelectOption[] = [...activePlayers]
      .sort((a, b) =>
        compareUniformNumbers(a.uniformNumber || "", b.uniformNumber || "")
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        uniformNumber: p.uniformNumber || "",
      }));

    const captainPlayer = currentRow.captainId
      ? activePlayers.find((p) => p.id === currentRow.captainId) ||
        teamPlayerRows.find((p) => p.id === currentRow.captainId) ||
        null
      : null;

    // スタッフ・指導者一覧の整形（個人連絡先は一切含めない）
    const customSettings: CustomRoleSetting[] = roleSettingRows.map((r) => ({
      role: r.role,
      customLabel: r.customLabel,
    }));
    const roleDefinitions = parseTeamRoleDefinitions(
      currentRow.rolePermissionsJson,
      customSettings
    );
    const staffRoleKeySet = new Set<string>(STAFF_DISPLAY_ROLES);
    const rolePriorityMap: Record<string, number> = { ...STAFF_ROLE_PRIORITY };
    for (const def of roleDefinitions) {
      if (
        !def.isBuiltin &&
        (def.permissions.canManageTeam ||
          def.permissions.canManageOps ||
          def.permissions.canManagePlayers ||
          def.permissions.canEditScore)
      ) {
        staffRoleKeySet.add(def.role);
        rolePriorityMap[def.role] = def.priority;
      }
    }

    const staffMembers: TeamStaffSummaryItem[] = [];
    for (const m of memberRows) {
      const primaryRole = (m.role || "").toLowerCase();
      const subRoleKeys = parseSubRolesList(m.subRoles);
      const matchingStaffSubRoles = subRoleKeys.filter((sr) =>
        staffRoleKeySet.has(sr)
      );
      const isStaffEntry =
        m.memberType === "staff" ||
        staffRoleKeySet.has(primaryRole) ||
        matchingStaffSubRoles.length > 0;

      if (!isStaffEntry) continue;

      const displayName = (m.memberName || m.userName || "").trim();
      if (!displayName) continue;

      const effectivePrimaryKey = staffRoleKeySet.has(primaryRole)
        ? primaryRole
        : matchingStaffSubRoles[0] || primaryRole || ROLES.STAFF;

      const primaryLabel = resolveRoleLabel(
        effectivePrimaryKey,
        roleDefinitions
      );
      const extraKeys = subRoleKeys.filter((sr) => sr !== effectivePrimaryKey);
      const subRoleLabels = extraKeys.map((sr) =>
        resolveRoleLabel(sr, roleDefinitions)
      );

      staffMembers.push({
        id: m.id,
        name: displayName,
        avatarUrl: m.avatarUrl || m.userImage || null,
        primaryRoleKey: effectivePrimaryKey,
        roleLabel: primaryLabel,
        subRoleLabels,
      });
    }

    staffMembers.sort((a, b) => {
      const pa = rolePriorityMap[a.primaryRoleKey] ?? 99;
      const pb = rolePriorityMap[b.primaryRoleKey] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name, "ja");
    });

    const squads: TeamSquadSummaryItem[] = siblingRows.map((s) => ({
      id: s.id,
      name: s.name,
      year: s.year,
      tier: s.tier || "ALL",
      teamType: s.teamType === "practice" ? "practice" : "regular",
      managerName: s.managerName || "",
      homeGround: s.homeGround || "",
      playerCount: squadPlayerCounts.get(s.id) ?? 0,
      isCurrent: s.id === rawTeamId,
    }));

    // グラウンド整形（ホームグラウンド一致 または category === 'home' を優先）
    const homeGroundNorm = (currentRow.homeGround || "").trim();
    const sortedVenues: TeamGroundSummaryItem[] = venueRows
      .map((v) => {
        const isNameMatch =
          Boolean(homeGroundNorm) &&
          (v.name === homeGroundNorm ||
            v.shortName === homeGroundNorm ||
            v.name.includes(homeGroundNorm) ||
            homeGroundNorm.includes(v.name));
        const isPrimaryHome = v.category === "home" || isNameMatch;
        return {
          id: v.id,
          name: v.name,
          shortName: v.shortName || null,
          category: v.category || "stadium",
          address: v.address || null,
          mapUrl: v.mapUrl || null,
          surfaceType: v.surfaceType || null,
          dimensions: v.dimensions || null,
          parkingInfo: v.parkingInfo || null,
          spikeRule: v.spikeRule || null,
          isPrimaryHome,
        };
      })
      .sort((a, b) => {
        if (a.isPrimaryHome !== b.isPrimaryHome) {
          return a.isPrimaryHome ? -1 : 1;
        }
        return a.name.localeCompare(b.name, "ja");
      })
      .slice(0, 4);

    // 関連リンク（公式ピン留め・連盟・SNS・大会・協力団体を優先）
    const PRIORITY_LINK_CATEGORIES = new Set<string>([
      "league",
      "sns",
      "tournament",
      "partner",
    ]);
    const officialLinks: TeamLinkSummaryItem[] = linkRows
      .filter(
        (l) => Boolean(l.isImportant) || PRIORITY_LINK_CATEGORIES.has(l.category)
      )
      .slice(0, 8)
      .map((l) => ({
        id: l.id,
        title: l.title,
        url: l.url,
        category: l.category || "other",
        description: l.description || null,
        isImportant: Boolean(l.isImportant),
        subLinks: parseSubLinksJson(l.subLinks),
      }));

    let wins = 0;
    let losses = 0;
    let draws = 0;
    for (const m of finishedMatchRows) {
      if (m.myScore > m.opponentScore) wins += 1;
      else if (m.myScore < m.opponentScore) losses += 1;
      else draws += 1;
    }

    const parsedProfile = parseOrganizationProfileDetails(
      currentRow.orgProfileJson
    );

    const payload: TeamInfoResponse = {
      success: true,
      isDemo: false,
      canEdit,
      canManage,
      organization: {
        id: currentRow.orgId || `org-virtual-${currentRow.teamId}`,
        name: currentRow.orgName || currentRow.squadName,
        shortName:
          currentRow.orgShortName ||
          (currentRow.orgName || currentRow.squadName).slice(0, 6),
        category: currentRow.orgCategory || "other",
        foundedYear: currentRow.orgFoundedYear ?? null,
        description: currentRow.orgDescription || "",
        logoImageUrl: currentRow.orgLogoUrl || null,
        coverImageUrl: currentRow.orgCoverUrl || null,
        profile: parsedProfile,
      },
      currentSquad: {
        id: currentRow.teamId,
        name: currentRow.squadName,
        year: currentRow.year,
        tier: currentRow.tier || "ALL",
        teamType: currentRow.teamType === "practice" ? "practice" : "regular",
        managerName: currentRow.managerName || "",
        captainId: currentRow.captainId || null,
        captainName: captainPlayer ? captainPlayer.name : null,
        captainUniformNumber: captainPlayer
          ? captainPlayer.uniformNumber || null
          : null,
        homeGround: currentRow.homeGround || "",
      },
      rosterSummary: {
        activePlayerCount: activePlayers.length,
        onLeavePlayerCount,
        staffCount: staffMembers.length,
        gradeBreakdown,
      },
      staffMembers,
      squads,
      grounds: sortedVenues,
      officialLinks,
      playerOptions,
      seasonRecord: {
        totalMatches: finishedMatchRows.length,
        wins,
        losses,
        draws,
      },
    };

    return c.json(payload);
  } catch (error) {
    console.error("[GET /api/liff/team-info] error:", error);
    return c.json(
      { success: false, error: "チーム情報の取得に失敗しました" },
      500
    );
  }
});

// =========================================================
// PUT /api/liff/team-info
// =========================================================
liffTeamInfoRouter.put("/", async (c) => {
  try {
    const body = (await c.req.json()) as Partial<TeamInfoUpdateRequest>;
    const rawTeamId = typeof body.teamId === "string" ? body.teamId.trim() : "";

    if (!rawTeamId) {
      return c.json({ success: false, error: "teamId が必要です" }, 400);
    }

    if (rawTeamId === "demo-team") {
      return c.json({ success: true, isDemo: true });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    if (!access.canAccessTeam(rawTeamId)) {
      return c.json(
        { success: false, error: "このチームへのアクセス権限がありません" },
        403
      );
    }

    const grant = access.teamRoles.get(rawTeamId);
    const myRole = (grant?.role || "viewer").toLowerCase();
    const subRoles = grant?.subRoles || [];
    const canEdit =
      access.isSystemAdmin ||
      access.canManageTeamId(rawTeamId) ||
      access.canManagePlayersForTeam(rawTeamId) ||
      canManageSystem(myRole, subRoles) ||
      canManageTeam(myRole, subRoles);

    if (!canEdit) {
      return c.json(
        {
          success: false,
          error: "チーム情報の編集には管理者または指導者権限が必要です",
        },
        403
      );
    }

    const orgName = typeof body.orgName === "string" ? body.orgName.trim() : "";
    if (!orgName) {
      return c.json({ success: false, error: "チーム名を入力してください" }, 400);
    }

    const orgShortName =
      typeof body.orgShortName === "string" && body.orgShortName.trim()
        ? body.orgShortName.trim().slice(0, 20)
        : orgName.slice(0, 8);

    const rawCategory =
      typeof body.category === "string" ? body.category.trim() : "other";
    const category = VALID_CATEGORY_SET.has(rawCategory)
      ? rawCategory
      : "other";

    let foundedYear: number | null = null;
    if (typeof body.foundedYear === "number" && Number.isFinite(body.foundedYear)) {
      const yr = Math.trunc(body.foundedYear);
      if (yr >= 1900 && yr <= 2100) {
        foundedYear = yr;
      }
    }

    const description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 800)
        : "";
    const managerName =
      typeof body.managerName === "string"
        ? body.managerName.trim().slice(0, 40)
        : "";
    const homeGround =
      typeof body.homeGround === "string"
        ? body.homeGround.trim().slice(0, 80)
        : "";

    const db = drizzle(c.env.DB);
    const currentTeamRow = await db
      .select({
        id: teams.id,
        organizationId: teams.organizationId,
      })
      .from(teams)
      .where(eq(teams.id, rawTeamId))
      .get();

    if (!currentTeamRow) {
      return c.json(
        { success: false, error: "対象チームが見つかりません" },
        404
      );
    }

    // 主将IDの所属整合性チェック
    let captainId: string | null = null;
    if (
      typeof body.captainId === "string" &&
      body.captainId.trim() &&
      body.captainId !== "__none__"
    ) {
      const candidateId = body.captainId.trim();
      const playerRow = await db
        .select({ id: players.id })
        .from(players)
        .where(and(eq(players.id, candidateId), eq(players.teamId, rawTeamId)))
        .get();
      if (playerRow) {
        captainId = playerRow.id;
      }
    }

    const serializedProfile = serializeOrganizationProfileDetails(
      body.profile || {}
    );

    let targetOrgId = currentTeamRow.organizationId;
    if (!targetOrgId) {
      targetOrgId = `org_${crypto.randomUUID()}`;
      await db.insert(organizations).values({
        id: targetOrgId,
        name: orgName.slice(0, 60),
        shortName: orgShortName,
        category,
        foundedYear,
        description: description || null,
        profileJson: serializedProfile,
      });
      await db
        .update(teams)
        .set({
          organizationId: targetOrgId,
          managerName: managerName || null,
          captainId,
          homeGround: homeGround || null,
        })
        .where(eq(teams.id, rawTeamId));
    } else {
      await Promise.all([
        db
          .update(organizations)
          .set({
            name: orgName.slice(0, 60),
            shortName: orgShortName,
            category,
            foundedYear,
            description: description || null,
            profileJson: serializedProfile,
          })
          .where(eq(organizations.id, targetOrgId)),
        db
          .update(teams)
          .set({
            managerName: managerName || null,
            captainId,
            homeGround: homeGround || null,
          })
          .where(eq(teams.id, rawTeamId)),
      ]);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[PUT /api/liff/team-info] error:", error);
    return c.json(
      { success: false, error: "チーム情報の保存に失敗しました" },
      500
    );
  }
});

export default liffTeamInfoRouter;
