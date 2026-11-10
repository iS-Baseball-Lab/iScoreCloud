// filepath: src/app/liff/tools/news-generator/page.tsx
"use client";

import React, {
  Suspense,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Megaphone,
  Copy,
  Check,
  RotateCcw,
  RefreshCw,
  Cloud,
  Calendar,
  Download,
  Trash2,
  Share2,
  FileText,
  Zap,
  ListOrdered,
  Settings2,
  Plus,
  Lock,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LiffHeader } from "@/components/liff/LiffHeader";
import {
  LiffSelect,
  type LiffSelectBadgeTone,
  type LiffSelectOption,
} from "@/components/liff/LiffSelect";
import {
  LiffToolSubNav,
  LiffToolOtherLinks,
} from "@/components/liff/LiffToolSubNav";
import {
  useLiff,
  usePracticeMatchLabel,
  useScoreTeamDisplayName,
} from "@/components/liff/LiffProvider";
import { isGenericMatchTournamentName } from "@/lib/liff/scorebook-symbol-rules";
import {
  DEMO_LINEUP_PLAYERS,
  getHydratedDemoMatchCards,
  loadDemoMatchLineups,
  resolveLineupPlayerConditionForMatch,
} from "@/lib/liff/demo-lineup";
import { loadDemoPlayerConditionOverrides } from "@/lib/liff/player-condition";
import { parseMatchDayOpsJson } from "@/lib/liff/match-day-ops";
import { buildDemoScorebookSavedBundle } from "@/lib/liff/scorebook-renderer-model";
import {
  compareHalfInningOrder,
  computeScoreboardSummary,
  createDefaultEmptyLineup,
  createInitialLiveReportDocument,
  formatJapaneseMatchDateLabel,
  formatLiveReportText,
  hydrateLiveReportFromLegacyLogsAndScores,
  hydrateLiveReportFromScorebookSnapshot,
  mergeLiveReportDocuments,
  normalizeReportPositionCode,
  sanitizeLiveReportDocument,
  type LegacyPlayLogRow,
} from "@/lib/liff/live-report-v2";
import type {
  LiveReportLineupSlot,
  LiveReportMatchOption,
  LiveReportOutputMode,
  LiveReportRosterPlayer,
  LiveReportV2Document,
} from "@/types/live-report-v2";
import type {
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";
import { MatchAndHeaderSetupCard } from "./_components/MatchAndHeaderSetupCard";
import { LiveAtBatPadCard } from "./_components/LiveAtBatPadCard";
import { InningLogTimelineCard } from "./_components/InningLogTimelineCard";

type ReportSourceMode = "match" | "free";
type WorkspaceTab = "pad" | "preview" | "timeline" | "setup";

interface PersonalFreeReportEntry {
  id: string;
  createdAt: number;
  updatedAt: number;
  doc: LiveReportV2Document;
}

interface MatchOptionWithDraft extends LiveReportMatchOption {
  hasCloudDraft?: boolean;
}

interface MatchBundlePayload {
  matchId: string;
  lineup: Array<{
    order: number;
    position: string;
    playerId: string | null;
    playerName: string;
  }>;
  scorebookSnapshot: {
    topStructure: ScorebookSheetStructure | null;
    bottomStructure: ScorebookSheetStructure | null;
    topAtBats: ScorebookV2AtBat[];
    bottomAtBats: ScorebookV2AtBat[];
  } | null;
  playLogs: LegacyPlayLogRow[];
  cloudDraft: {
    draftId: string;
    report: LiveReportV2Document;
    updatedByName: string | null;
    updatedAt: number;
  } | null;
}

interface PersonalFreeCloudDraftItem {
  draftId: string;
  freeId: string;
  report: LiveReportV2Document;
  updatedByName: string | null;
  updatedAt: number;
}

interface ContextApiResponse {
  success: boolean;
  isDemo?: boolean;
  error?: string;
  matches?: MatchOptionWithDraft[];
  players?: LiveReportRosterPlayer[];
  matchBundle?: MatchBundlePayload | null;
  freeCloudDraft?: MatchBundlePayload["cloudDraft"];
  personalFreeDrafts?: PersonalFreeCloudDraftItem[];
}

interface MatchBundleApiResponse {
  success: boolean;
  error?: string;
  matchBundle?: MatchBundlePayload | null;
}

interface DraftApiResponse {
  success: boolean;
  error?: string;
  unchanged?: boolean;
  merged?: boolean;
  report?: LiveReportV2Document;
  cloudDraft?: MatchBundlePayload["cloudDraft"];
  updatedAt?: number;
  updatedByName?: string | null;
}

function getDraftIdForMode(
  teamId: string,
  mode: ReportSourceMode,
  selectedMatchId: string,
  ownerKey: string,
  selectedFreeId: string
): string {
  if (mode === "free") {
    const safeOwner = ownerKey.replace(/[^a-zA-Z0-9_-]/g, "") || "local";
    const safeFreeId = selectedFreeId.replace(/[^a-zA-Z0-9_-]/g, "") || "f_default";
    return `free:${teamId}:u:${safeOwner}:${safeFreeId}`;
  }
  return `match:${selectedMatchId}`;
}

function getLocalDraftStorageKey(teamId: string, draftId: string): string {
  return `iscore_liff_news_v2_doc_${teamId}_${draftId}`;
}

function getLocalModeStorageKey(teamId: string): string {
  return `iscore_liff_news_v2_mode_${teamId}`;
}

function getLocalActiveSelectionKey(teamId: string): string {
  return `iscore_liff_news_v2_sel_${teamId}`;
}

function getLocalFreeActiveIdKey(teamId: string, ownerKey: string): string {
  return `iscore_liff_news_v2_free_sel_${teamId}_${ownerKey}`;
}

function getLocalPersonalFreeListKey(teamId: string, ownerKey: string): string {
  return `iscore_liff_news_v2_free_list_${teamId}_${ownerKey}`;
}

function getLocalReporterStorageKey(teamId: string): string {
  return `iscore_liff_news_v2_rep_${teamId}`;
}

function resolvePersonalOwnerKey(userId?: string | null): string {
  const cleanedUser = (userId || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (cleanedUser && cleanedUser !== "demo-user") {
    return cleanedUser;
  }
  if (typeof window !== "undefined") {
    const storageKey = "iscore_liff_news_personal_owner_key";
    let existing = localStorage.getItem(storageKey) || "";
    existing = existing.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!existing) {
      existing = `dev_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      localStorage.setItem(storageKey, existing);
    }
    return existing;
  }
  return "local_owner";
}

function buildFreeEntryDisplayLabel(
  entry: PersonalFreeReportEntry,
  idx: number
): { label: string; sublabel: string; badge: string } {
  const d = entry.doc;
  const datePart = d.dateText.trim() || "日付未設定";
  const oppPart = d.opponentName.trim()
    ? `対 ${d.opponentName.trim()}`
    : `フリー速報 #${idx + 1}`;
  const summary = computeScoreboardSummary(d);
  const totalPlays = d.halfInnings.reduce(
    (sum, h) => sum + h.entries.length,
    0
  );
  const subParts = [
    d.tournamentText.trim(),
    d.venueName.trim() ? `@${d.venueName.trim()}` : "",
    totalPlays > 0 ? `${totalPlays}打席記録` : "未入力",
  ].filter(Boolean);

  return {
    label: `${datePart} ${oppPart}`,
    sublabel: subParts.join(" ・ "),
    badge:
      totalPlays > 0
        ? `${summary.firstTotal}-${summary.secondTotal}`
        : "個別登録",
  };
}

function loadPersonalFreeEntriesFromLocal(
  teamId: string,
  ownerKey: string,
  fallbackTeamName: string,
  fallbackReporter: string
): PersonalFreeReportEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(
      getLocalPersonalFreeListKey(teamId, ownerKey)
    );
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const valid: PersonalFreeReportEntry[] = [];
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const obj = item as Record<string, unknown>;
          const id = typeof obj.id === "string" ? obj.id.trim() : "";
          const doc = sanitizeLiveReportDocument(obj.doc, fallbackTeamName);
          if (id && doc) {
            valid.push({
              id,
              createdAt:
                typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
              updatedAt:
                typeof obj.updatedAt === "number" ? obj.updatedAt : Date.now(),
              doc,
            });
          }
        }
        if (valid.length > 0) {
          return valid.sort((a, b) => b.updatedAt - a.updatedAt);
        }
      }
    }
  } catch {
    // ignore parse error
  }

  const initialId = `f_${Date.now().toString(36)}_1`;
  const initialDoc = createInitialLiveReportDocument({
    myTeamName: fallbackTeamName,
    reporterNames: fallbackReporter,
  });
  return [
    {
      id: initialId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      doc: initialDoc,
    },
  ];
}

function savePersonalFreeEntriesToLocal(
  teamId: string,
  ownerKey: string,
  entries: ReadonlyArray<PersonalFreeReportEntry>
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      getLocalPersonalFreeListKey(teamId, ownerKey),
      JSON.stringify(entries)
    );
  } catch {
    // ignore quota error
  }
}

function formatSyncTimeLabel(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function LiffNewsGeneratorContent() {
  const searchParams = useSearchParams();
  const queryMatchId =
    searchParams.get("matchId") || searchParams.get("id") || "";

  const { currentTeam, isDemo, profile } = useLiff();
  const { scoreTeamName } = useScoreTeamDisplayName("自チーム");
  const practiceMatchLabel = usePracticeMatchLabel();

  const resolvedTeamId = useMemo(() => {
    if (isDemo || currentTeam?.id === "demo-team") return "demo-team";
    if (currentTeam?.id) return currentTeam.id;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("iscore_selectedTeamId") || "";
      if (stored) return stored;
    }
    return "demo-team";
  }, [currentTeam?.id, isDemo]);

  const personalOwnerKey = useMemo(
    () => resolvePersonalOwnerKey(profile?.userId || null),
    [profile?.userId]
  );

  const [reportMode, setReportMode] = useState<ReportSourceMode>("match");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("pad");

  const [matches, setMatches] = useState<MatchOptionWithDraft[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<LiveReportRosterPlayer[]>(
    []
  );
  const [selectedMatchKey, setSelectedMatchKey] = useState<string>("");
  const [activeBundle, setActiveBundle] = useState<MatchBundlePayload | null>(
    null
  );

  // フリー作成（個人ごとの個別登録リスト・他メンバーとは共有しない）
  const [freeEntries, setFreeEntries] = useState<PersonalFreeReportEntry[]>([]);
  const [selectedFreeId, setSelectedFreeId] = useState<string>("");

  const [doc, setDoc] = useState<LiveReportV2Document>(() =>
    createInitialLiveReportDocument({ myTeamName: "自チーム" })
  );

  const [outputMode, setOutputMode] = useState<LiveReportOutputMode>("full");
  const [manualEditedText, setManualEditedText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastSyncedBy, setLastSyncedBy] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHydratingRef = useRef<boolean>(true);
  const docRef = useRef<LiveReportV2Document>(doc);
  const reportModeRef = useRef<ReportSourceMode>(reportMode);
  const selectedFreeIdRef = useRef<string>(selectedFreeId);
  const baseDocRef = useRef<LiveReportV2Document | null>(null);
  const baseUpdatedAtRef = useRef<number | null>(null);
  const hasPendingLocalSaveRef = useRef<boolean>(false);
  const isPushingRef = useRef<boolean>(false);
  const queuedPushRef = useRef<boolean>(false);
  const isPollingRef = useRef<boolean>(false);
  const lastSyncActivityAtRef = useRef<number>(Date.now());

  const selectedMatch = useMemo(
    () =>
      reportMode === "match"
        ? matches.find((m) => m.id === selectedMatchKey) || null
        : null,
    [reportMode, matches, selectedMatchKey]
  );

  const activeDraftId = useMemo(
    () =>
      getDraftIdForMode(
        resolvedTeamId,
        reportMode,
        selectedMatchKey,
        personalOwnerKey,
        selectedFreeId
      ),
    [
      resolvedTeamId,
      reportMode,
      selectedMatchKey,
      personalOwnerKey,
      selectedFreeId,
    ]
  );

  const activeDraftIdRef = useRef<string>(activeDraftId);
  useEffect(() => {
    activeDraftIdRef.current = activeDraftId;
  }, [activeDraftId]);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  useEffect(() => {
    reportModeRef.current = reportMode;
  }, [reportMode]);
  useEffect(() => {
    selectedFreeIdRef.current = selectedFreeId;
  }, [selectedFreeId]);

  // 指定試合＋バンドルから初期 LiveReportV2Document を組み立てる
  const buildDocumentFromMatchAndBundle = useCallback(
    (
      matchOpt: MatchOptionWithDraft | null,
      bundle: MatchBundlePayload | null,
      fallbackReporter: string
    ): LiveReportV2Document => {
      if (!matchOpt) {
        return createInitialLiveReportDocument({
          myTeamName: scoreTeamName,
          reporterNames: fallbackReporter,
        });
      }

      const effectiveReporters =
        matchOpt.lineLiveAssignees.length > 0
          ? matchOpt.lineLiveAssignees.join("、")
          : fallbackReporter;

      const tournamentLabel =
        matchOpt.tournamentName &&
        !isGenericMatchTournamentName(
          matchOpt.tournamentName,
          practiceMatchLabel
        )
          ? matchOpt.tournamentName
          : matchOpt.matchType === "official"
          ? "公式戦"
          : matchOpt.matchType === "exchange"
          ? "交流戦"
          : practiceMatchLabel;

      let nextDoc = createInitialLiveReportDocument({
        matchId: matchOpt.id,
        myTeamName: scoreTeamName,
        opponentName: matchOpt.opponent,
        date: matchOpt.date,
        tournamentName: tournamentLabel,
        venueName: matchOpt.venueShortName || matchOpt.venueName || "",
        battingOrder: matchOpt.battingOrder,
        regulationInnings: matchOpt.innings || 7,
        reporterNames: effectiveReporters,
      });

      // スタメン反映
      if (bundle && bundle.lineup.length > 0) {
        const slots: LiveReportLineupSlot[] = bundle.lineup.map((item, idx) => ({
          order: item.order || idx + 1,
          position: normalizeReportPositionCode(item.position),
          playerId: item.playerId,
          playerName: item.playerName || "",
          substitutions: [],
        }));
        while (slots.length < 9) {
          slots.push({
            order: slots.length + 1,
            position: "打",
            playerId: null,
            playerName: "",
            substitutions: [],
          });
        }
        nextDoc = { ...nextDoc, lineup: slots };
      }

      // 終了済み試合等でスコアブック取込データがある場合は自動展開
      if (bundle?.scorebookSnapshot) {
        nextDoc = hydrateLiveReportFromScorebookSnapshot({
          baseDoc: nextDoc,
          topStructure: bundle.scorebookSnapshot.topStructure,
          bottomStructure: bundle.scorebookSnapshot.bottomStructure,
          topAtBats: bundle.scorebookSnapshot.topAtBats,
          bottomAtBats: bundle.scorebookSnapshot.bottomAtBats,
          matchStatus: matchOpt.status,
        });
      } else if (
        (bundle && bundle.playLogs.length > 0) ||
        matchOpt.myInningScores.length > 0 ||
        matchOpt.opponentInningScores.length > 0
      ) {
        nextDoc = hydrateLiveReportFromLegacyLogsAndScores({
          baseDoc: nextDoc,
          playLogs: bundle?.playLogs || [],
          myInningScores: matchOpt.myInningScores,
          opponentInningScores: matchOpt.opponentInningScores,
          matchStatus: matchOpt.status,
        });
      }

      return nextDoc;
    },
    [scoreTeamName, practiceMatchLabel]
  );

  // デモチーム用バンドル構築
  const buildDemoBundle = useCallback(
    (
      matchId: string,
      matchOpt: MatchOptionWithDraft | null
    ): MatchBundlePayload => {
      const demoLineupData = loadDemoMatchLineups(matchId);
      const lineup = (demoLineupData.myLineup || [])
        .filter((s) => Boolean(s.playerId || s.name))
        .map((s, idx) => ({
          order: s.order || idx + 1,
          position: s.position || "打",
          playerId: s.playerId || null,
          playerName: s.name || "",
        }));

      let scorebookSnapshot: MatchBundlePayload["scorebookSnapshot"] = null;
      if (matchOpt && matchOpt.status === "finished") {
        const isMyFirst = matchOpt.battingOrder === "first";
        const demoSaved = buildDemoScorebookSavedBundle({
          matchId,
          isMyTeamFirst: isMyFirst,
          myTeamName: scoreTeamName,
          opponentName: matchOpt.opponent,
        });
        scorebookSnapshot = {
          topStructure: demoSaved.topStructure,
          bottomStructure: demoSaved.bottomStructure,
          topAtBats: demoSaved.topAtBats,
          bottomAtBats: demoSaved.bottomAtBats,
        };
      }

      return {
        matchId,
        lineup,
        scorebookSnapshot,
        playLogs: [],
        cloudDraft: null,
      };
    },
    [scoreTeamName]
  );

  // 1. チーム切替・初回マウント時のコンテキスト読み込み
  useEffect(() => {
    let cancelled = false;
    isHydratingRef.current = true;
    setIsLoadingContext(true);
    setManualEditedText(null);
    setShowResetConfirm(false);
    setLastSyncedAt(null);
    setLastSyncedBy(null);

    const savedReporter =
      typeof window !== "undefined"
        ? localStorage.getItem(getLocalReporterStorageKey(resolvedTeamId)) || ""
        : "";

    async function loadContext() {
      // まず個人用のフリー作成リストをローカルから復元
      let mergedFreeList = loadPersonalFreeEntriesFromLocal(
        resolvedTeamId,
        personalOwnerKey,
        scoreTeamName,
        savedReporter
      );
      const savedFreeId =
        typeof window !== "undefined"
          ? localStorage.getItem(
              getLocalFreeActiveIdKey(resolvedTeamId, personalOwnerKey)
            ) || ""
          : "";

      // A. デモチームモード
      if (resolvedTeamId === "demo-team") {
        const demoCards = getHydratedDemoMatchCards();
        const demoMatches: MatchOptionWithDraft[] = demoCards.map((m) => {
          const ops = parseMatchDayOpsJson(m.matchDayOps);
          const lineRole = (ops.staffRoles || []).find(
            (r) => r.roleKey === "line_live" || r.roleLabel.includes("速報")
          );
          const assignees = (lineRole?.assignees || []).map((a) =>
            a.replace(/\s*(さん|様|パパ|ママ|父|母)\s*$/g, "").trim()
          );
          return {
            id: m.id,
            date: m.date,
            opponent: m.opponent,
            matchType: m.matchType || "official",
            status: m.status,
            battingOrder: m.battingOrder === "second" ? "second" : "first",
            innings: m.innings || 7,
            myScore: m.myScore,
            opponentScore: m.opponentScore,
            myInningScores: m.myInningScores || [],
            opponentInningScores: m.opponentInningScores || [],
            tournamentName: m.tournamentName || null,
            venueName: m.venueName || null,
            venueShortName: m.venueShortName || null,
            hasScorebook: Boolean(m.hasScorebook || m.status === "finished"),
            hasLineup: Boolean(m.hasLineup || m.status === "finished"),
            lineLiveAssignees: assignees,
            hasCloudDraft: false,
          };
        });

        const demoCondOverrides = loadDemoPlayerConditionOverrides();
        const initialDemoMatch =
          (queryMatchId ? demoMatches.find((m) => m.id === queryMatchId) : null) ||
          demoMatches[0];
        const demoRoster: LiveReportRosterPlayer[] = DEMO_LINEUP_PLAYERS.filter(
          (p) => {
            const ov = demoCondOverrides[p.id];
            const eff = resolveLineupPlayerConditionForMatch(
              {
                conditionStatus: ov ? ov.conditionStatus : p.conditionStatus,
                conditionPeriods: ov ? ov.conditionPeriods : p.conditionPeriods,
              },
              initialDemoMatch?.date || null
            );
            return eff.status !== "on_leave";
          }
        ).map((p) => ({
          id: p.id,
          name: p.name,
          uniformNumber: p.uniformNumber || "",
          mainPosition: null,
        }));

        const savedModeRaw =
          typeof window !== "undefined"
            ? localStorage.getItem(getLocalModeStorageKey("demo-team")) || ""
            : "";
        const savedSel =
          typeof window !== "undefined"
            ? localStorage.getItem(getLocalActiveSelectionKey("demo-team")) || ""
            : "";

        const initialMode: ReportSourceMode = queryMatchId
          ? "match"
          : savedModeRaw === "free" || demoMatches.length === 0
          ? "free"
          : "match";

        const initialMatchKey =
          (queryMatchId && demoMatches.some((m) => m.id === queryMatchId)
            ? queryMatchId
            : "") ||
          (savedSel && demoMatches.some((m) => m.id === savedSel)
            ? savedSel
            : demoMatches[0]?.id || "");

        const initialFreeEntry =
          mergedFreeList.find((f) => f.id === savedFreeId) || mergedFreeList[0];

        const targetMatch =
          initialMode === "match"
            ? demoMatches.find((m) => m.id === initialMatchKey) || null
            : null;
        const bundle =
          initialMode === "match" && initialMatchKey
            ? buildDemoBundle(initialMatchKey, targetMatch)
            : null;
        const draftId = getDraftIdForMode(
          "demo-team",
          initialMode,
          initialMatchKey,
          personalOwnerKey,
          initialFreeEntry.id
        );

        const localRaw =
          typeof window !== "undefined"
            ? localStorage.getItem(getLocalDraftStorageKey("demo-team", draftId))
            : null;
        const localParsed = localRaw
          ? sanitizeLiveReportDocument(
              (() => {
                try {
                  return JSON.parse(localRaw) as unknown;
                } catch {
                  return null;
                }
              })(),
              scoreTeamName
            )
          : null;

        if (!cancelled) {
          const initialDemoDoc =
            initialMode === "free"
              ? initialFreeEntry.doc
              : localParsed ||
                buildDocumentFromMatchAndBundle(
                  targetMatch,
                  bundle,
                  savedReporter
                );
          baseDocRef.current = null;
          baseUpdatedAtRef.current = null;
          hasPendingLocalSaveRef.current = false;
          queuedPushRef.current = false;
          activeDraftIdRef.current = draftId;
          reportModeRef.current = initialMode;
          selectedFreeIdRef.current = initialFreeEntry.id;
          docRef.current = initialDemoDoc;
          setMatches(demoMatches);
          setRosterPlayers(demoRoster);
          setFreeEntries(mergedFreeList);
          setSelectedFreeId(initialFreeEntry.id);
          setReportMode(initialMode);
          setSelectedMatchKey(initialMatchKey);
          setActiveBundle(bundle);
          setDoc(initialDemoDoc);
          setIsLoadingContext(false);
          isHydratingRef.current = false;
        }
        return;
      }

      // B. 実チームDBモード
      try {
        baseDocRef.current = null;
        baseUpdatedAtRef.current = null;
        hasPendingLocalSaveRef.current = false;
        queuedPushRef.current = false;

        const savedModeRaw =
          typeof window !== "undefined"
            ? localStorage.getItem(getLocalModeStorageKey(resolvedTeamId)) || ""
            : "";
        const savedSel =
          typeof window !== "undefined"
            ? localStorage.getItem(getLocalActiveSelectionKey(resolvedTeamId)) ||
              ""
            : "";
        const candidateMatchId =
          queryMatchId ||
          (savedSel && savedSel !== "__free__" ? savedSel : "");

        const url = `/api/liff/news-generator/context?teamId=${encodeURIComponent(
          resolvedTeamId
        )}&ownerKey=${encodeURIComponent(personalOwnerKey)}${
          candidateMatchId
            ? `&matchId=${encodeURIComponent(candidateMatchId)}`
            : ""
        }`;

        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json()) as ContextApiResponse;
        if (cancelled) return;

        if (!res.ok || !json.success) {
          throw new Error(json.error || "初期データの取得に失敗しました");
        }

        const fetchedMatches = json.matches || [];
        const fetchedPlayers = json.players || [];
        setMatches(fetchedMatches);
        setRosterPlayers(fetchedPlayers);

        // サーバーに保存されている本人専用の個別フリー作成データがあればマージ
        if (
          Array.isArray(json.personalFreeDrafts) &&
          json.personalFreeDrafts.length > 0
        ) {
          const byId = new Map<string, PersonalFreeReportEntry>();
          for (const loc of mergedFreeList) {
            byId.set(loc.id, loc);
          }
          for (const rem of json.personalFreeDrafts) {
            const existing = byId.get(rem.freeId);
            if (!existing || rem.updatedAt >= existing.updatedAt) {
              byId.set(rem.freeId, {
                id: rem.freeId,
                createdAt: existing?.createdAt ?? rem.updatedAt,
                updatedAt: rem.updatedAt,
                doc: rem.report,
              });
            }
          }
          mergedFreeList = Array.from(byId.values()).sort(
            (a, b) => b.updatedAt - a.updatedAt
          );
          savePersonalFreeEntriesToLocal(
            resolvedTeamId,
            personalOwnerKey,
            mergedFreeList
          );
        }

        setFreeEntries(mergedFreeList);
        const initialFreeEntry =
          mergedFreeList.find((f) => f.id === savedFreeId) || mergedFreeList[0];
        setSelectedFreeId(initialFreeEntry.id);
        selectedFreeIdRef.current = initialFreeEntry.id;

        const resolvedMatchKey =
          (queryMatchId && fetchedMatches.some((m) => m.id === queryMatchId)
            ? queryMatchId
            : "") ||
          (savedSel && fetchedMatches.some((m) => m.id === savedSel)
            ? savedSel
            : fetchedMatches[0]?.id || "");

        const initialMode: ReportSourceMode = queryMatchId
          ? "match"
          : savedModeRaw === "free" || fetchedMatches.length === 0
          ? "free"
          : "match";

        setReportMode(initialMode);
        reportModeRef.current = initialMode;
        setSelectedMatchKey(resolvedMatchKey);

        let bundle: MatchBundlePayload | null = null;
        if (initialMode === "match" && resolvedMatchKey) {
          if (json.matchBundle && json.matchBundle.matchId === resolvedMatchKey) {
            bundle = json.matchBundle;
          } else {
            const bRes = await fetch(
              `/api/liff/news-generator/match-bundle?teamId=${encodeURIComponent(
                resolvedTeamId
              )}&matchId=${encodeURIComponent(resolvedMatchKey)}`,
              { cache: "no-store" }
            );
            const bJson = (await bRes.json()) as MatchBundleApiResponse;
            if (cancelled) return;
            bundle = bJson.matchBundle || null;
          }
        }
        setActiveBundle(bundle);

        const draftId = getDraftIdForMode(
          resolvedTeamId,
          initialMode,
          resolvedMatchKey,
          personalOwnerKey,
          initialFreeEntry.id
        );
        activeDraftIdRef.current = draftId;

        if (initialMode === "free") {
          baseDocRef.current = initialFreeEntry.doc;
          baseUpdatedAtRef.current = initialFreeEntry.updatedAt;
          docRef.current = initialFreeEntry.doc;
          setDoc(initialFreeEntry.doc);
          setLastSyncedAt(initialFreeEntry.updatedAt);
          setLastSyncedBy(null);
        } else {
          const cloudDraft = bundle?.cloudDraft || null;
          const localRaw =
            typeof window !== "undefined"
              ? localStorage.getItem(
                  getLocalDraftStorageKey(resolvedTeamId, draftId)
                )
              : null;
          const localParsed = localRaw
            ? sanitizeLiveReportDocument(
                (() => {
                  try {
                    return JSON.parse(localRaw) as unknown;
                  } catch {
                    return null;
                  }
                })(),
                scoreTeamName
              )
            : null;

          const targetMatch =
            fetchedMatches.find((m) => m.id === resolvedMatchKey) || null;

          if (cloudDraft) {
            baseDocRef.current = cloudDraft.report;
            baseUpdatedAtRef.current = cloudDraft.updatedAt;
            docRef.current = cloudDraft.report;
            setDoc(cloudDraft.report);
            setLastSyncedAt(cloudDraft.updatedAt);
            setLastSyncedBy(cloudDraft.updatedByName);
            if (typeof window !== "undefined") {
              localStorage.setItem(
                getLocalDraftStorageKey(resolvedTeamId, draftId),
                JSON.stringify(cloudDraft.report)
              );
            }
          } else if (localParsed) {
            baseDocRef.current = null;
            baseUpdatedAtRef.current = null;
            docRef.current = localParsed;
            setDoc(localParsed);
          } else {
            const built = buildDocumentFromMatchAndBundle(
              targetMatch,
              bundle,
              savedReporter
            );
            baseDocRef.current = null;
            baseUpdatedAtRef.current = null;
            docRef.current = built;
            setDoc(built);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          toast.error("速報データの読み込みに失敗しました");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingContext(false);
          isHydratingRef.current = false;
        }
      }
    }

    loadContext();
    return () => {
      cancelled = true;
    };
  }, [
    resolvedTeamId,
    personalOwnerKey,
    queryMatchId,
    scoreTeamName,
    buildDemoBundle,
    buildDocumentFromMatchAndBundle,
  ]);

  // 2A. モード切替ハンドラ（⚾ 試合連動 ⇔ ✏️ フリー作成）
  const handleSwitchMode = async (nextMode: ReportSourceMode) => {
    if (nextMode === reportMode) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    isHydratingRef.current = true;
    hasPendingLocalSaveRef.current = false;
    queuedPushRef.current = false;
    baseDocRef.current = null;
    baseUpdatedAtRef.current = null;

    setReportMode(nextMode);
    reportModeRef.current = nextMode;
    setManualEditedText(null);
    setShowResetConfirm(false);

    if (typeof window !== "undefined") {
      localStorage.setItem(getLocalModeStorageKey(resolvedTeamId), nextMode);
    }

    if (nextMode === "free") {
      setActiveBundle(null);
      const currentFree =
        freeEntries.find((f) => f.id === selectedFreeId) || freeEntries[0];
      if (currentFree) {
        const draftId = getDraftIdForMode(
          resolvedTeamId,
          "free",
          selectedMatchKey,
          personalOwnerKey,
          currentFree.id
        );
        activeDraftIdRef.current = draftId;
        selectedFreeIdRef.current = currentFree.id;
        setSelectedFreeId(currentFree.id);
        baseDocRef.current = currentFree.doc;
        baseUpdatedAtRef.current = currentFree.updatedAt;
        docRef.current = currentFree.doc;
        setDoc(currentFree.doc);
        setLastSyncedAt(currentFree.updatedAt);
        setLastSyncedBy(null);
      }
      isHydratingRef.current = false;
      return;
    }

    // 試合連動モードへ切替
    const targetMatchKey = selectedMatchKey || matches[0]?.id || "";
    if (!targetMatchKey) {
      isHydratingRef.current = false;
      return;
    }
    setSelectedMatchKey(targetMatchKey);
    await loadMatchSelection(targetMatchKey);
  };

  // 2B. 試合セレクタ手動切替ハンドラ（試合連動モード専用）
  const loadMatchSelection = async (nextKey: string) => {
    const savedReporter =
      typeof window !== "undefined"
        ? localStorage.getItem(getLocalReporterStorageKey(resolvedTeamId)) ||
          docRef.current.reporterNames
        : docRef.current.reporterNames;

    const targetMatch = matches.find((m) => m.id === nextKey) || null;
    const draftId = getDraftIdForMode(
      resolvedTeamId,
      "match",
      nextKey,
      personalOwnerKey,
      selectedFreeIdRef.current
    );
    activeDraftIdRef.current = draftId;

    const localRaw =
      typeof window !== "undefined"
        ? localStorage.getItem(getLocalDraftStorageKey(resolvedTeamId, draftId))
        : null;
    const localParsed = localRaw
      ? sanitizeLiveReportDocument(
          (() => {
            try {
              return JSON.parse(localRaw) as unknown;
            } catch {
              return null;
            }
          })(),
          scoreTeamName
        )
      : null;

    if (resolvedTeamId === "demo-team") {
      const bundle = buildDemoBundle(nextKey, targetMatch);
      const nextDemoDoc =
        localParsed ||
        buildDocumentFromMatchAndBundle(targetMatch, bundle, savedReporter);
      setActiveBundle(bundle);
      docRef.current = nextDemoDoc;
      setDoc(nextDemoDoc);
      isHydratingRef.current = false;
      return;
    }

    if (localParsed) {
      docRef.current = localParsed;
      setDoc(localParsed);
    }

    try {
      setIsSyncingCloud(true);
      const bRes = await fetch(
        `/api/liff/news-generator/match-bundle?teamId=${encodeURIComponent(
          resolvedTeamId
        )}&matchId=${encodeURIComponent(nextKey)}`,
        { cache: "no-store" }
      );
      const bJson = (await bRes.json()) as MatchBundleApiResponse;
      if (activeDraftIdRef.current !== draftId) return;

      const bundle = bJson.matchBundle || null;
      setActiveBundle(bundle);

      if (bundle?.cloudDraft) {
        baseDocRef.current = bundle.cloudDraft.report;
        baseUpdatedAtRef.current = bundle.cloudDraft.updatedAt;
        docRef.current = bundle.cloudDraft.report;
        setDoc(bundle.cloudDraft.report);
        setLastSyncedAt(bundle.cloudDraft.updatedAt);
        setLastSyncedBy(bundle.cloudDraft.updatedByName);
        if (typeof window !== "undefined") {
          localStorage.setItem(
            getLocalDraftStorageKey(resolvedTeamId, draftId),
            JSON.stringify(bundle.cloudDraft.report)
          );
        }
      } else if (!localParsed) {
        const built = buildDocumentFromMatchAndBundle(
          targetMatch,
          bundle,
          savedReporter
        );
        docRef.current = built;
        setDoc(built);
        setLastSyncedAt(null);
        setLastSyncedBy(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (activeDraftIdRef.current === draftId) {
        setIsSyncingCloud(false);
        isHydratingRef.current = false;
      }
    }
  };

  const handleSelectMatchKey = async (nextKey: string) => {
    if (!nextKey || (reportMode === "match" && nextKey === selectedMatchKey)) {
      return;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    isHydratingRef.current = true;
    hasPendingLocalSaveRef.current = false;
    queuedPushRef.current = false;
    baseDocRef.current = null;
    baseUpdatedAtRef.current = null;

    setSelectedMatchKey(nextKey);
    setManualEditedText(null);
    setShowResetConfirm(false);

    if (typeof window !== "undefined") {
      localStorage.setItem(getLocalActiveSelectionKey(resolvedTeamId), nextKey);
    }

    await loadMatchSelection(nextKey);
  };

  // 2C. フリー作成（個別登録）の切替・新規登録・削除ハンドラ
  const handleSelectFreeEntry = (nextFreeId: string) => {
    if (!nextFreeId || nextFreeId === selectedFreeId) return;
    const found = freeEntries.find((f) => f.id === nextFreeId);
    if (!found) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    isHydratingRef.current = true;
    hasPendingLocalSaveRef.current = false;
    queuedPushRef.current = false;

    const draftId = getDraftIdForMode(
      resolvedTeamId,
      "free",
      selectedMatchKey,
      personalOwnerKey,
      found.id
    );
    activeDraftIdRef.current = draftId;
    selectedFreeIdRef.current = found.id;
    setSelectedFreeId(found.id);
    setManualEditedText(null);
    setShowResetConfirm(false);

    if (typeof window !== "undefined") {
      localStorage.setItem(
        getLocalFreeActiveIdKey(resolvedTeamId, personalOwnerKey),
        found.id
      );
    }

    baseDocRef.current = found.doc;
    baseUpdatedAtRef.current = found.updatedAt;
    docRef.current = found.doc;
    setDoc(found.doc);
    setLastSyncedAt(found.updatedAt);
    setLastSyncedBy(null);
    isHydratingRef.current = false;
  };

  const handleCreateNewFreeEntry = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const savedReporter =
      typeof window !== "undefined"
        ? localStorage.getItem(getLocalReporterStorageKey(resolvedTeamId)) ||
          docRef.current.reporterNames
        : docRef.current.reporterNames;

    const newId = `f_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const newDoc = createInitialLiveReportDocument({
      myTeamName: scoreTeamName,
      reporterNames: savedReporter,
    });
    const now = Date.now();
    const newEntry: PersonalFreeReportEntry = {
      id: newId,
      createdAt: now,
      updatedAt: now,
      doc: newDoc,
    };

    const nextList = [newEntry, ...freeEntries];
    setFreeEntries(nextList);
    savePersonalFreeEntriesToLocal(resolvedTeamId, personalOwnerKey, nextList);

    const draftId = getDraftIdForMode(
      resolvedTeamId,
      "free",
      selectedMatchKey,
      personalOwnerKey,
      newId
    );
    activeDraftIdRef.current = draftId;
    selectedFreeIdRef.current = newId;
    setSelectedFreeId(newId);
    setManualEditedText(null);
    setShowResetConfirm(false);

    if (typeof window !== "undefined") {
      localStorage.setItem(
        getLocalFreeActiveIdKey(resolvedTeamId, personalOwnerKey),
        newId
      );
    }

    baseDocRef.current = newDoc;
    baseUpdatedAtRef.current = now;
    docRef.current = newDoc;
    setDoc(newDoc);
    setLastSyncedAt(now);
    setLastSyncedBy(null);
    setActiveTab("setup");
    toast.success(
      "新しいフリー速報（個人用）を作成しました！対戦相手やスタメンを設定できます"
    );
  };

  const handleDeleteCurrentFreeEntry = async () => {
    const targetId = selectedFreeIdRef.current;
    const targetDraftId = activeDraftIdRef.current;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (resolvedTeamId !== "demo-team") {
      await fetch(
        `/api/liff/news-generator/draft?teamId=${encodeURIComponent(
          resolvedTeamId
        )}&draftId=${encodeURIComponent(targetDraftId)}`,
        { method: "DELETE" }
      ).catch(() => null);
    }

    if (typeof window !== "undefined") {
      localStorage.removeItem(
        getLocalDraftStorageKey(resolvedTeamId, targetDraftId)
      );
    }

    const remaining = freeEntries.filter((f) => f.id !== targetId);
    let nextList = remaining;
    if (nextList.length === 0) {
      const savedReporter =
        typeof window !== "undefined"
          ? localStorage.getItem(getLocalReporterStorageKey(resolvedTeamId)) ||
            docRef.current.reporterNames
          : docRef.current.reporterNames;
      const freshId = `f_${Date.now().toString(36)}_1`;
      const freshDoc = createInitialLiveReportDocument({
        myTeamName: scoreTeamName,
        reporterNames: savedReporter,
      });
      nextList = [
        {
          id: freshId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          doc: freshDoc,
        },
      ];
    }

    setFreeEntries(nextList);
    savePersonalFreeEntriesToLocal(resolvedTeamId, personalOwnerKey, nextList);

    const nextActive = nextList[0];
    const nextDraftId = getDraftIdForMode(
      resolvedTeamId,
      "free",
      selectedMatchKey,
      personalOwnerKey,
      nextActive.id
    );
    activeDraftIdRef.current = nextDraftId;
    selectedFreeIdRef.current = nextActive.id;
    setSelectedFreeId(nextActive.id);
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getLocalFreeActiveIdKey(resolvedTeamId, personalOwnerKey),
        nextActive.id
      );
    }

    docRef.current = nextActive.doc;
    setDoc(nextActive.doc);
    setManualEditedText(null);
    setShowResetConfirm(false);
    toast.success(
      remaining.length > 0
        ? "選択中のフリー速報を削除しました"
        : "フリー速報を初期状態にリセットしました"
    );
  };

  // 3. 端末自動保存 ＆ クラウド保存（試合連動時は3-Way共同編集マージ、フリー作成時は個人専用保存）
  const pushDraftToCloud = useCallback(
    async (options?: {
      silent?: boolean;
      forceOverwrite?: boolean;
      preferKeepalive?: boolean;
    }) => {
      const silent = options?.silent ?? true;
      const isFreeMode = reportModeRef.current === "free";
      const forceOverwrite = isFreeMode
        ? true
        : options?.forceOverwrite ?? false;
      const preferKeepalive = options?.preferKeepalive ?? false;

      if (resolvedTeamId === "demo-team") {
        hasPendingLocalSaveRef.current = false;
        setLastSyncedAt(Date.now());
        return;
      }

      if (isPushingRef.current) {
        queuedPushRef.current = true;
        return;
      }

      const requestDraftId = activeDraftIdRef.current;
      const requestMatchId =
        !isFreeMode && selectedMatchKey ? selectedMatchKey : null;
      const snapshotSent = docRef.current;
      const baseSent = baseDocRef.current;
      const baseTsSent = baseUpdatedAtRef.current;

      isPushingRef.current = true;
      try {
        setIsSyncingCloud(true);
        const updaterName =
          profile?.displayName?.trim() ||
          snapshotSent.reporterNames.trim() ||
          null;

        const payloadStr = JSON.stringify({
          teamId: resolvedTeamId,
          draftId: requestDraftId,
          matchId: requestMatchId,
          report: snapshotSent,
          baseUpdatedAt: baseTsSent,
          baseReport: baseSent,
          forceOverwrite,
          updatedByName: updaterName,
        });

        // ブラウザの keepalive 64KiB 制限を超える場合は通常 fetch にフォールバック
        const useKeepalive = preferKeepalive && payloadStr.length < 56000;

        const res = await fetch("/api/liff/news-generator/draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          keepalive: useKeepalive,
          body: payloadStr,
        });
        const json = (await res.json()) as DraftApiResponse;
        if (activeDraftIdRef.current !== requestDraftId) {
          return;
        }

        if (res.ok && json.success) {
          const serverDoc =
            (json.report
              ? sanitizeLiveReportDocument(json.report, scoreTeamName)
              : null) || snapshotSent;
          const nextUpdatedAt = json.updatedAt || Date.now();

          baseDocRef.current = serverDoc;
          baseUpdatedAtRef.current = nextUpdatedAt;
          setLastSyncedAt(nextUpdatedAt);
          setLastSyncedBy(isFreeMode ? null : json.updatedByName ?? updaterName);

          if (docRef.current === snapshotSent) {
            hasPendingLocalSaveRef.current = false;
            if (!isFreeMode && json.merged && json.report) {
              const reconciled = mergeLiveReportDocuments({
                base: baseSent,
                remote: serverDoc,
                local: snapshotSent,
                clientSideCursorFollow: true,
              });
              docRef.current = reconciled;
              setDoc(reconciled);
              if (typeof window !== "undefined") {
                localStorage.setItem(
                  getLocalDraftStorageKey(resolvedTeamId, requestDraftId),
                  JSON.stringify(reconciled)
                );
              }
            }
          } else {
            hasPendingLocalSaveRef.current = true;
            queuedPushRef.current = true;
            if (!isFreeMode && json.merged && json.report) {
              const rebased = mergeLiveReportDocuments({
                base: snapshotSent,
                remote: serverDoc,
                local: docRef.current,
                clientSideCursorFollow: true,
              });
              docRef.current = rebased;
              setDoc(rebased);
              if (typeof window !== "undefined") {
                localStorage.setItem(
                  getLocalDraftStorageKey(resolvedTeamId, requestDraftId),
                  JSON.stringify(rebased)
                );
              }
            }
          }

          if (requestMatchId) {
            setMatches((prev) =>
              prev.map((m) =>
                m.id === requestMatchId ? { ...m, hasCloudDraft: true } : m
              )
            );
          }
          if (!silent) {
            toast.success(
              isFreeMode
                ? "個人用のフリー速報を保存しました"
                : "クラウドに速報データを保存しました"
            );
          }
        }
      } catch (err) {
        console.error(err);
        if (!silent) {
          toast.error("保存に失敗しました（端末内には保存済です）");
        }
      } finally {
        isPushingRef.current = false;
        setIsSyncingCloud(false);
        if (
          queuedPushRef.current &&
          activeDraftIdRef.current === requestDraftId
        ) {
          queuedPushRef.current = false;
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            void pushDraftToCloud({ silent: true });
          }, 250);
        }
      }
    },
    [resolvedTeamId, selectedMatchKey, profile?.displayName, scoreTeamName]
  );

  const flushPendingSaveNow = useCallback(
    (preferKeepalive = false) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (hasPendingLocalSaveRef.current && !isHydratingRef.current) {
        void pushDraftToCloud({
          silent: true,
          preferKeepalive,
        });
      }
    },
    [pushDraftToCloud]
  );

  const handleUpdateDoc = useCallback(
    (updater: (prev: LiveReportV2Document) => LiveReportV2Document) => {
      setDoc((prev) => {
        const next = updater(prev);
        docRef.current = next;
        const now = Date.now();

        if (typeof window !== "undefined") {
          localStorage.setItem(
            getLocalDraftStorageKey(resolvedTeamId, activeDraftId),
            JSON.stringify(next)
          );
          if (next.reporterNames.trim()) {
            localStorage.setItem(
              getLocalReporterStorageKey(resolvedTeamId),
              next.reporterNames.trim()
            );
          }
        }

        // フリー作成モード時は個人の個別登録リストもリアルタイム更新
        if (reportModeRef.current === "free") {
          const activeFreeId = selectedFreeIdRef.current;
          setFreeEntries((prevList) => {
            const exists = prevList.some((f) => f.id === activeFreeId);
            const updatedList = exists
              ? prevList.map((f) =>
                  f.id === activeFreeId
                    ? { ...f, updatedAt: now, doc: next }
                    : f
                )
              : [
                  {
                    id: activeFreeId || `f_${now.toString(36)}`,
                    createdAt: now,
                    updatedAt: now,
                    doc: next,
                  },
                  ...prevList,
                ];
            savePersonalFreeEntriesToLocal(
              resolvedTeamId,
              personalOwnerKey,
              updatedList
            );
            return updatedList;
          });
        }

        if (!isHydratingRef.current) {
          lastSyncActivityAtRef.current = now;
          hasPendingLocalSaveRef.current = true;
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            void pushDraftToCloud({ silent: true });
          }, 650);
        }
        return next;
      });
    },
    [resolvedTeamId, personalOwnerKey, activeDraftId, pushDraftToCloud]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // 4. クラウドから最新状態を同期（試合連動モード専用 — フリー作成モードでは他者との共有・ポーリングを行わない）
  const pullLatestFromCloud = useCallback(
    async (silent: boolean) => {
      if (reportModeRef.current === "free") {
        return;
      }
      if (resolvedTeamId === "demo-team") {
        if (!silent) {
          toast.info("デモチームは現在の端末内で自動保持されています");
        }
        return;
      }

      if (
        isHydratingRef.current ||
        isPushingRef.current ||
        isPollingRef.current
      ) {
        return;
      }
      if (
        silent &&
        typeof navigator !== "undefined" &&
        navigator.onLine === false
      ) {
        return;
      }
      if (silent && saveTimerRef.current !== null) {
        return;
      }

      const requestDraftId = activeDraftIdRef.current;
      const knownTs = silent ? baseUpdatedAtRef.current || 0 : 0;

      isPollingRef.current = true;
      if (!silent) {
        setIsSyncingCloud(true);
      }

      try {
        const res = await fetch(
          `/api/liff/news-generator/draft?teamId=${encodeURIComponent(
            resolvedTeamId
          )}&draftId=${encodeURIComponent(requestDraftId)}${
            knownTs > 0 ? `&sinceUpdatedAt=${knownTs}` : ""
          }`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as DraftApiResponse;

        if (
          activeDraftIdRef.current !== requestDraftId ||
          (reportModeRef.current as ReportSourceMode) === "free" ||
          isHydratingRef.current ||
          isPushingRef.current
        ) {
          return;
        }

        if (!res.ok || !json.success) {
          if (!silent) {
            throw new Error(json.error || "最新データの取得に失敗しました");
          }
          return;
        }

        if (json.unchanged) {
          return;
        }

        if (json.cloudDraft) {
          if (
            silent &&
            baseUpdatedAtRef.current !== null &&
            json.cloudDraft.updatedAt <= baseUpdatedAtRef.current
          ) {
            return;
          }

          const prevBase = baseDocRef.current;
          const remoteDoc = json.cloudDraft.report;
          let nextDoc: LiveReportV2Document;

          if (hasPendingLocalSaveRef.current) {
            nextDoc = mergeLiveReportDocuments({
              base: prevBase,
              remote: remoteDoc,
              local: docRef.current,
              clientSideCursorFollow: silent,
            });
          } else if (silent && prevBase) {
            const localWasAtBase =
              docRef.current.activeInning === prevBase.activeInning &&
              docRef.current.activeIsBottom === prevBase.activeIsBottom;
            const remoteAdvanced =
              compareHalfInningOrder(
                remoteDoc.activeInning,
                remoteDoc.activeIsBottom,
                prevBase.activeInning,
                prevBase.activeIsBottom
              ) > 0;

            if (localWasAtBase && remoteAdvanced) {
              nextDoc = remoteDoc;
            } else if (!localWasAtBase) {
              nextDoc = {
                ...remoteDoc,
                activeInning: docRef.current.activeInning,
                activeIsBottom: docRef.current.activeIsBottom,
              };
            } else {
              nextDoc = remoteDoc;
            }
          } else {
            nextDoc = remoteDoc;
          }

          baseDocRef.current = remoteDoc;
          baseUpdatedAtRef.current = json.cloudDraft.updatedAt;
          lastSyncActivityAtRef.current = Date.now();
          docRef.current = nextDoc;
          setDoc(nextDoc);
          if (!silent) {
            setManualEditedText(null);
          }
          setLastSyncedAt(json.cloudDraft.updatedAt);
          setLastSyncedBy(json.cloudDraft.updatedByName);

          if (typeof window !== "undefined") {
            localStorage.setItem(
              getLocalDraftStorageKey(resolvedTeamId, requestDraftId),
              JSON.stringify(nextDoc)
            );
          }
          if (!silent) {
            toast.success("クラウドから最新の速報データを同期しました！");
          }
        } else {
          if (
            baseUpdatedAtRef.current !== null &&
            !hasPendingLocalSaveRef.current
          ) {
            baseDocRef.current = null;
            baseUpdatedAtRef.current = null;
            setLastSyncedAt(null);
            setLastSyncedBy(null);
          }
          if (!silent) {
            toast.info("まだクラウド上に他メンバーの下書きはありません");
          }
        }
      } catch (err) {
        if (!silent) {
          console.error(err);
          toast.error("クラウド同期に失敗しました");
        }
      } finally {
        isPollingRef.current = false;
        if (!silent) {
          setIsSyncingCloud(false);
        }
      }
    },
    [resolvedTeamId]
  );

  const handlePullLatestCloudDraft = async () => {
    flushPendingSaveNow(false);
    await pullLatestFromCloud(false);
  };

  // バックグラウンド自動同期（試合連動モード時のみ稼働）
  useEffect(() => {
    if (
      resolvedTeamId === "demo-team" ||
      reportMode === "free" ||
      typeof window === "undefined"
    ) {
      return;
    }

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let currentIntervalMs = 4500;

    const clearPollTimer = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const computeAdaptiveDelayMs = (): number | null => {
      const idleMs = Date.now() - lastSyncActivityAtRef.current;
      if (idleMs < 3 * 60_000) return 4500;
      if (idleMs < 10 * 60_000) return 12_000;
      if (idleMs < 20 * 60_000) return 25_000;
      return null;
    };

    const scheduleNextPoll = () => {
      clearPollTimer();
      if (disposed || document.visibilityState !== "visible") return;
      const nextMs = computeAdaptiveDelayMs();
      currentIntervalMs = nextMs ?? 0;
      if (nextMs === null) return;
      timerId = setTimeout(async () => {
        timerId = null;
        if (disposed || document.visibilityState !== "visible") return;
        await pullLatestFromCloud(true);
        scheduleNextPoll();
      }, nextMs);
    };

    lastSyncActivityAtRef.current = Date.now();
    scheduleNextPoll();

    const handleUserActivity = () => {
      const wasSlowOrPaused = timerId === null || currentIntervalMs > 4500;
      lastSyncActivityAtRef.current = Date.now();
      if (wasSlowOrPaused && document.visibilityState === "visible") {
        void pullLatestFromCloud(true);
        scheduleNextPoll();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearPollTimer();
        flushPendingSaveNow(true);
      } else if (document.visibilityState === "visible") {
        lastSyncActivityAtRef.current = Date.now();
        void pullLatestFromCloud(true);
        scheduleNextPoll();
      }
    };

    const handleWindowFocus = () => {
      lastSyncActivityAtRef.current = Date.now();
      void pullLatestFromCloud(true);
      scheduleNextPoll();
    };

    window.addEventListener("pointerdown", handleUserActivity, {
      passive: true,
    });
    window.addEventListener("keydown", handleUserActivity, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      disposed = true;
      clearPollTimer();
      window.removeEventListener("pointerdown", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [resolvedTeamId, reportMode, pullLatestFromCloud, flushPendingSaveNow]);

  // 5. 登録済みスタメン・記録済みスコアブックの再取込
  const handleReloadMatchLineup = () => {
    if (!activeBundle || activeBundle.lineup.length === 0) return;
    handleUpdateDoc((prev) => {
      const slots: LiveReportLineupSlot[] = activeBundle.lineup.map(
        (item, idx) => ({
          order: item.order || idx + 1,
          position: normalizeReportPositionCode(item.position),
          playerId: item.playerId,
          playerName: item.playerName || "",
          substitutions: [],
        })
      );
      while (slots.length < 9) {
        slots.push({
          order: slots.length + 1,
          position: "打",
          playerId: null,
          playerName: "",
          substitutions: [],
        });
      }
      return { ...prev, lineup: slots };
    });
    toast.success("登録済みスタメンを反映しました");
  };

  const handleImportFromSavedScorebook = () => {
    if (!activeBundle) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setDoc((prev) => {
      const imported = activeBundle.scorebookSnapshot
        ? hydrateLiveReportFromScorebookSnapshot({
            baseDoc: prev,
            topStructure: activeBundle.scorebookSnapshot.topStructure,
            bottomStructure: activeBundle.scorebookSnapshot.bottomStructure,
            topAtBats: activeBundle.scorebookSnapshot.topAtBats,
            bottomAtBats: activeBundle.scorebookSnapshot.bottomAtBats,
            matchStatus: selectedMatch?.status,
          })
        : hydrateLiveReportFromLegacyLogsAndScores({
            baseDoc: prev,
            playLogs: activeBundle.playLogs,
            myInningScores: selectedMatch?.myInningScores || [],
            opponentInningScores: selectedMatch?.opponentInningScores || [],
            matchStatus: selectedMatch?.status,
          });

      docRef.current = imported;
      hasPendingLocalSaveRef.current = true;
      if (typeof window !== "undefined") {
        localStorage.setItem(
          getLocalDraftStorageKey(resolvedTeamId, activeDraftId),
          JSON.stringify(imported)
        );
      }
      return imported;
    });

    void pushDraftToCloud({ silent: true, forceOverwrite: true });
    setManualEditedText(null);
    toast.success("記録済みスコアデータから全イニング経過を生成しました！");
  };

  // 6. この試合の速報データを初期化リセット
  const handleConfirmResetReport = async () => {
    if (reportMode === "free") {
      await handleDeleteCurrentFreeEntry();
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    hasPendingLocalSaveRef.current = false;
    queuedPushRef.current = false;
    baseDocRef.current = null;
    baseUpdatedAtRef.current = null;

    if (typeof window !== "undefined") {
      localStorage.removeItem(
        getLocalDraftStorageKey(resolvedTeamId, activeDraftId)
      );
    }

    if (resolvedTeamId !== "demo-team") {
      await fetch(
        `/api/liff/news-generator/draft?teamId=${encodeURIComponent(
          resolvedTeamId
        )}&draftId=${encodeURIComponent(activeDraftId)}`,
        { method: "DELETE" }
      ).catch(() => null);
    }

    const freshDoc = selectedMatch
      ? createInitialLiveReportDocument({
          matchId: selectedMatch.id,
          myTeamName: scoreTeamName,
          opponentName: selectedMatch.opponent,
          date: selectedMatch.date,
          tournamentName:
            selectedMatch.tournamentName &&
            !isGenericMatchTournamentName(
              selectedMatch.tournamentName,
              practiceMatchLabel
            )
              ? selectedMatch.tournamentName
              : selectedMatch.matchType === "official"
              ? "公式戦"
              : selectedMatch.matchType === "exchange"
              ? "交流戦"
              : practiceMatchLabel,
          venueName:
            selectedMatch.venueShortName || selectedMatch.venueName || "",
          battingOrder: selectedMatch.battingOrder,
          regulationInnings: selectedMatch.innings || 7,
          reporterNames:
            selectedMatch.lineLiveAssignees.length > 0
              ? selectedMatch.lineLiveAssignees.join("、")
              : docRef.current.reporterNames,
        })
      : createInitialLiveReportDocument({
          myTeamName: scoreTeamName,
          reporterNames: docRef.current.reporterNames,
        });

    if (activeBundle && activeBundle.lineup.length > 0) {
      const slots: LiveReportLineupSlot[] = activeBundle.lineup.map(
        (item, idx) => ({
          order: item.order || idx + 1,
          position: normalizeReportPositionCode(item.position),
          playerId: item.playerId,
          playerName: item.playerName || "",
          substitutions: [],
        })
      );
      while (slots.length < 9) {
        slots.push({
          order: slots.length + 1,
          position: "打",
          playerId: null,
          playerName: "",
          substitutions: [],
        });
      }
      freshDoc.lineup = slots;
    } else {
      freshDoc.lineup = createDefaultEmptyLineup(9);
    }

    docRef.current = freshDoc;
    setDoc(freshDoc);
    setManualEditedText(null);
    setLastSyncedAt(null);
    setLastSyncedBy(null);
    setShowResetConfirm(false);
    toast.success("速報データを初期状態にリセットしました");
  };

  // 7. 出力テキスト計算 ＆ コピー・LINE共有
  const autoGeneratedText = useMemo(
    () => formatLiveReportText(doc, outputMode),
    [doc, outputMode]
  );

  const displayedText =
    manualEditedText !== null ? manualEditedText : autoGeneratedText;

  const handleCopyText = async () => {
    flushPendingSaveNow(true);
    try {
      await navigator.clipboard.writeText(displayedText);
      setCopied(true);
      toast.success("速報テキストをコピーしました！");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  const handleShareLine = () => {
    if (!displayedText.trim()) return;
    flushPendingSaveNow(true);
    const shareUrl = `https://line.me/R/share?text=${encodeURIComponent(
      displayedText
    )}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const canImportSavedScore = Boolean(
    reportMode === "match" &&
      activeBundle &&
      (activeBundle.scorebookSnapshot || activeBundle.playLogs.length > 0)
  );

  // 試合連動用オプション（フリーは完全に除外し、登録済み試合のみを表示）
  const matchSelectOptions = useMemo<LiffSelectOption[]>(() => {
    const bucketOrder: Record<string, number> = {
      live: 0,
      scheduled: 1,
      finished: 2,
    };
    const orderedMatches = [...matches].sort(
      (a, b) => (bucketOrder[a.status] ?? 3) - (bucketOrder[b.status] ?? 3)
    );

    return orderedMatches.map((m) => {
      const dateDisp = formatJapaneseMatchDateLabel(m.date);
      const venueDisp = m.venueShortName || m.venueName || "";
      const tournDisp =
        m.tournamentName && !isGenericMatchTournamentName(m.tournamentName)
          ? m.tournamentName
          : m.matchType === "practice"
          ? practiceMatchLabel
          : m.tournamentName || "";

      let badge = "中止";
      let badgeTone: LiffSelectBadgeTone = "slate";
      let group = "中止・その他";

      if (m.status === "live") {
        badge = m.hasCloudDraft ? "試合中・速報あり" : "試合中";
        badgeTone = "rose";
        group = "試合中";
      } else if (m.status === "scheduled") {
        badge = m.hasCloudDraft ? "予定・速報記録あり" : "予定";
        badgeTone = "teal";
        group = "予定の試合";
      } else if (m.status === "finished") {
        badge = `終了 ${m.myScore}-${m.opponentScore}${
          m.hasCloudDraft ? " ☁️" : ""
        }`;
        badgeTone = "primary";
        group = "終了した試合";
      }

      const subParts = [
        tournDisp,
        venueDisp ? `@${venueDisp}` : "",
        m.hasCloudDraft
          ? "☁️速報記録あり"
          : m.hasScorebook
          ? "📖スコア記録あり"
          : "",
      ].filter(Boolean);

      return {
        value: m.id,
        label: `${dateDisp} 対${m.opponent}`,
        sublabel: subParts.length > 0 ? subParts.join(" ・ ") : undefined,
        badge,
        badgeTone,
        group,
        keywords: `${m.opponent} ${m.date} ${dateDisp} ${venueDisp} ${tournDisp}`,
      };
    });
  }, [matches, practiceMatchLabel]);

  // フリー作成（個人ごとの個別登録）用セレクタオプション
  const freeSelectOptions = useMemo<LiffSelectOption[]>(() => {
    return freeEntries.map((entry, idx) => {
      const disp = buildFreeEntryDisplayLabel(entry, idx);
      return {
        value: entry.id,
        label: disp.label,
        sublabel: disp.sublabel,
        badge: disp.badge,
        badgeTone: "amber" as const,
        keywords: `${disp.label} ${disp.sublabel}`,
      };
    });
  }, [freeEntries]);

  const totalEntriesCount = useMemo(
    () => doc.halfInnings.reduce((sum, h) => sum + h.entries.length, 0),
    [doc.halfInnings]
  );

  const filledLineupCount = useMemo(
    () => doc.lineup.filter((s) => s.playerName.trim().length > 0).length,
    [doc.lineup]
  );

  const activeContextKey =
    reportMode === "free"
      ? `${resolvedTeamId}:free:${selectedFreeId}`
      : `${resolvedTeamId}:match:${selectedMatchKey}`;

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="px-3 pt-2.5 pb-4 space-y-2.5">
        {/* ツール切替ナビ */}
        <LiffToolSubNav />

        {/* ════════════════════════════════════════════════════════════════
            0. モード切替（⚾ 試合連動 ⇔ ✏️ フリー作成）＆ 対象セレクタ（超コンパクト）
           ════════════════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-3 py-2 flex items-center justify-between gap-2">
            {/* モード切替タブ（試合連動 vs フリー作成） */}
            <div className="inline-flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => void handleSwitchMode("match")}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer",
                  reportMode === "match"
                    ? "bg-primary text-white shadow-2xs"
                    : "text-slate-300 hover:text-white"
                )}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>試合連動</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSwitchMode("free")}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer",
                  reportMode === "free"
                    ? "bg-amber-400 text-slate-950 shadow-2xs"
                    : "text-slate-300 hover:text-white"
                )}
              >
                <PenLine className="w-3.5 h-3.5" />
                <span>フリー作成</span>
              </button>
            </div>

            {/* 右側: 試合連動時はクラウド共同編集ステータス、フリー時は個人個別登録ボタン */}
            {reportMode === "match" ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-300">
                  <Cloud className="w-3 h-3 text-emerald-400" />
                  {resolvedTeamId === "demo-team"
                    ? "デモ保持"
                    : isSyncingCloud
                    ? "同期中..."
                    : lastSyncedAt
                    ? `同期済 ${formatSyncTimeLabel(lastSyncedAt)}`
                    : "共同編集ON"}
                </span>
                <button
                  type="button"
                  onClick={handlePullLatestCloudDraft}
                  disabled={isSyncingCloud}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-[10px] font-black cursor-pointer active:scale-95"
                  title="他の速報担当者の最新データを手動同期"
                >
                  <RefreshCw
                    className={cn(
                      "w-3 h-3 text-sky-400",
                      isSyncingCloud && "animate-spin"
                    )}
                  />
                  <span>同期</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300">
                  <Lock className="w-3 h-3" />
                  <span>個人専用（非共有・{freeEntries.length}件）</span>
                </span>
                <button
                  type="button"
                  onClick={handleCreateNewFreeEntry}
                  className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-black cursor-pointer active:scale-95"
                  title="新しいフリー速報を個別登録"
                >
                  <Plus className="w-3 h-3" />
                  <span>新規登録</span>
                </button>
              </div>
            )}
          </div>

          <div className="p-2.5 space-y-2">
            {isLoadingContext ? (
              <div className="h-9 rounded-xl bg-muted animate-pulse" />
            ) : reportMode === "match" ? (
              matchSelectOptions.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <LiffSelect
                    value={selectedMatchKey}
                    onChange={(val) => void handleSelectMatchKey(val)}
                    options={matchSelectOptions}
                    title="連動する試合を選択"
                    subtitle="登録済みの予定・試合中・終了試合と連携します"
                    searchable={true}
                    searchPlaceholder="対戦相手・日付・会場名で検索..."
                    size="sm"
                    className="flex-1"
                  />
                  {canImportSavedScore && (
                    <button
                      type="button"
                      onClick={handleImportFromSavedScorebook}
                      className="h-9 px-2.5 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary border border-primary/25 text-[10.5px] font-black inline-flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
                      title="記録済みスコアブックから全打席を自動生成"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>スコブ取込</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    登録済みの試合がありません
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleSwitchMode("free")}
                    className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-black cursor-pointer"
                  >
                    ✏️ フリー作成を使う
                  </button>
                </div>
              )
            ) : (
              <div className="flex items-center gap-1.5">
                <LiffSelect
                  value={selectedFreeId}
                  onChange={(val) => handleSelectFreeEntry(val)}
                  options={freeSelectOptions}
                  title="個別登録したフリー速報を選択"
                  subtitle="他のメンバーとは共有されず、ご自身の端末・アカウント専用で複数登録できます"
                  searchable={false}
                  size="sm"
                  className="flex-1"
                />
                {!showResetConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="h-9 px-2.5 rounded-xl border border-border bg-card hover:bg-rose-500/10 text-muted-foreground hover:text-rose-600 text-[10.5px] font-black inline-flex items-center gap-1 shrink-0 cursor-pointer"
                    title="選択中のフリー速報を削除・初期化"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{freeEntries.length > 1 ? "削除" : "初期化"}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleDeleteCurrentFreeEntry()}
                      className="h-9 px-2.5 rounded-xl bg-rose-600 text-white text-[10.5px] font-black cursor-pointer"
                    >
                      実行
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(false)}
                      className="h-9 px-2 rounded-xl border border-border bg-card text-[10.5px] font-black text-foreground cursor-pointer"
                    >
                      戻す
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 4画面ゼロスクロール・ワークスペース切替タブ */}
            <div className="grid grid-cols-4 gap-1 bg-muted p-1 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setActiveTab("pad")}
                className={cn(
                  "py-1.5 px-1 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 transition-all cursor-pointer",
                  activeTab === "pad"
                    ? "bg-[#0f172a] text-white shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">入力・速報</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={cn(
                  "py-1.5 px-1 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 transition-all cursor-pointer",
                  activeTab === "preview"
                    ? "bg-[#0f172a] text-white shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">速報全文</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("timeline")}
                className={cn(
                  "py-1.5 px-1 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 transition-all cursor-pointer",
                  activeTab === "timeline"
                    ? "bg-[#0f172a] text-white shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ListOrdered className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">経過({totalEntriesCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("setup")}
                className={cn(
                  "py-1.5 px-1 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 transition-all cursor-pointer",
                  activeTab === "setup"
                    ? "bg-[#0f172a] text-white shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Settings2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">設定({filledLineupCount}/9)</span>
              </button>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            TAB 1 (デフォルト): ゼロスクロール・1画面ライブ入力＆速報確認パッド
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === "pad" && (
          <LiveAtBatPadCard
            doc={doc}
            onChangeDoc={handleUpdateDoc}
            rosterPlayers={rosterPlayers}
            activeContextKey={activeContextKey}
            outputMode={outputMode}
            onChangeOutputMode={(m) => {
              setOutputMode(m);
              setManualEditedText(null);
            }}
            onCopyText={() => void handleCopyText()}
            onShareLine={handleShareLine}
            copied={copied}
            onOpenFullPreview={() => setActiveTab("preview")}
          />
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 2: LINE速報イメージ全文・出力形式切替・共有
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === "preview" && (
          <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-3.5 py-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                <h2 className="text-xs font-black text-white truncate">
                  LINE速報イメージ確認・出力・共有
                </h2>
              </div>

              {manualEditedText !== null ? (
                <button
                  type="button"
                  onClick={() => setManualEditedText(null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 text-[10.5px] font-black cursor-pointer active:scale-95"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>自動生成に戻す</span>
                </button>
              ) : (
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold">
                  リアルタイム反映中
                </span>
              )}
            </div>

            <div className="p-3 space-y-2.5">
              {/* 上部にコピー＆LINE送信ボタンを配置（スクロール不要で即送信可能） */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyText()}
                  className="py-2.5 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 shrink-0" />
                      <span>コピーしました！</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 shrink-0" />
                      <span>速報テキストをコピー</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleShareLine}
                  className="py-2.5 px-3 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  <Share2 className="w-4 h-4 shrink-0" />
                  <span>LINEで送る</span>
                </button>
              </div>

              {/* 出力単位ワンタップ切替タブ */}
              <div className="grid grid-cols-4 gap-1 bg-muted p-1 rounded-xl border border-border">
                {(
                  [
                    { id: "full", label: "全文積み上げ" },
                    { id: "latest_inning", label: "直近イニング" },
                    { id: "lineup", label: "スタメン発表" },
                    { id: "game_set", label: "試合終了全文" },
                  ] as const
                ).map((tab) => {
                  const active = outputMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setOutputMode(tab.id);
                        setManualEditedText(null);
                      }}
                      className={cn(
                        "py-1.5 px-1 rounded-lg text-[11px] transition-all cursor-pointer",
                        active
                          ? "bg-card text-foreground border border-border font-black shadow-2xs"
                          : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* 編集可能なプレビューテキストエリア */}
              <textarea
                value={displayedText}
                onChange={(e) => setManualEditedText(e.target.value)}
                rows={14}
                className="w-full rounded-xl border border-border bg-muted/35 focus:bg-card focus:border-primary p-3 text-xs sm:text-sm font-bold text-foreground leading-relaxed outline-none resize-y font-sans"
                placeholder="ここにLINE速報テキストが自動生成されます（直接手直しも可能です）"
              />

              {/* 初期化リセットボタン */}
              <div className="flex items-center justify-end pt-1">
                {!showResetConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-black text-muted-foreground hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>この速報データを初期化</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10.5px] font-black text-rose-600">
                      初期化しますか？
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleConfirmResetReport()}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[10.5px] font-black cursor-pointer"
                    >
                      実行
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(false)}
                      className="px-2 py-1 rounded-lg border border-border bg-card text-[10.5px] font-black text-foreground cursor-pointer"
                    >
                      やめる
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 3: 記録済みイニング経過一覧（タップで1行修正・挿入・削除）
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === "timeline" && (
          <InningLogTimelineCard
            doc={doc}
            onChangeDoc={handleUpdateDoc}
            activeContextKey={activeContextKey}
          />
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 4: 試合情報・スタメン・速報担当の設定
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === "setup" && (
          <MatchAndHeaderSetupCard
            doc={doc}
            onChangeDoc={handleUpdateDoc}
            rosterPlayers={rosterPlayers}
            suggestedReporters={selectedMatch?.lineLiveAssignees || []}
            hasSavedMatchLineup={Boolean(
              reportMode === "match" &&
                activeBundle &&
                activeBundle.lineup.length > 0
            )}
            onReloadMatchLineup={handleReloadMatchLineup}
            activeContextKey={activeContextKey}
            defaultExpanded={true}
          />
        )}

        {/* 他のツールへの回遊リンク */}
        <LiffToolOtherLinks />

        {/* SKILL.md 規約60: LiffBottomNav 干渉防止用最下部スペーサー */}
        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export default function LiffNewsGeneratorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1">
          <LiffHeader />
          <div className="p-4 space-y-4">
            <div className="h-14 rounded-2xl bg-card border border-border animate-pulse" />
            <div className="h-64 rounded-2xl bg-card border border-border animate-pulse" />
          </div>
        </div>
      }
    >
      <LiffNewsGeneratorContent />
    </Suspense>
  );
}
