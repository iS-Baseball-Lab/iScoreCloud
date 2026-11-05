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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
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
} from "@/lib/liff/demo-lineup";
import { parseMatchDayOpsJson } from "@/lib/liff/match-day-ops";
import { buildDemoScorebookSavedBundle } from "@/lib/liff/scorebook-renderer-model";
import {
  createDefaultEmptyLineup,
  createInitialLiveReportDocument,
  deriveScoreboardShortName,
  formatJapaneseMatchDateLabel,
  formatLiveReportText,
  hydrateLiveReportFromLegacyLogsAndScores,
  hydrateLiveReportFromScorebookSnapshot,
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

const FREE_MATCH_KEY = "__free__";

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

interface ContextApiResponse {
  success: boolean;
  isDemo?: boolean;
  error?: string;
  matches?: MatchOptionWithDraft[];
  players?: LiveReportRosterPlayer[];
  matchBundle?: MatchBundlePayload | null;
  freeCloudDraft?: MatchBundlePayload["cloudDraft"];
}

interface MatchBundleApiResponse {
  success: boolean;
  error?: string;
  matchBundle?: MatchBundlePayload | null;
}

interface DraftApiResponse {
  success: boolean;
  error?: string;
  cloudDraft?: MatchBundlePayload["cloudDraft"];
  updatedAt?: number;
  updatedByName?: string | null;
}

function getDraftIdForSelection(teamId: string, selectedKey: string): string {
  if (!selectedKey || selectedKey === FREE_MATCH_KEY) {
    return `team:${teamId}:free`;
  }
  return `match:${selectedKey}`;
}

function getLocalDraftStorageKey(teamId: string, draftId: string): string {
  return `iscore_liff_news_v2_doc_${teamId}_${draftId}`;
}

function getLocalActiveSelectionKey(teamId: string): string {
  return `iscore_liff_news_v2_sel_${teamId}`;
}

function getLocalReporterStorageKey(teamId: string): string {
  return `iscore_liff_news_v2_rep_${teamId}`;
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

  const [matches, setMatches] = useState<MatchOptionWithDraft[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<LiveReportRosterPlayer[]>(
    []
  );
  const [selectedMatchKey, setSelectedMatchKey] =
    useState<string>(FREE_MATCH_KEY);
  const [activeBundle, setActiveBundle] = useState<MatchBundlePayload | null>(
    null
  );

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

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchKey) || null,
    [matches, selectedMatchKey]
  );

  const activeDraftId = useMemo(
    () => getDraftIdForSelection(resolvedTeamId, selectedMatchKey),
    [resolvedTeamId, selectedMatchKey]
  );

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

        const demoRoster: LiveReportRosterPlayer[] = DEMO_LINEUP_PLAYERS.filter(
          (p) => p.conditionStatus !== "on_leave"
        ).map((p) => ({
          id: p.id,
          name: p.name,
          uniformNumber: p.uniformNumber || "",
          mainPosition: null,
        }));

        const savedSel =
          typeof window !== "undefined"
            ? localStorage.getItem(getLocalActiveSelectionKey("demo-team")) || ""
            : "";
        const initialKey =
          (queryMatchId && demoMatches.some((m) => m.id === queryMatchId)
            ? queryMatchId
            : "") ||
          (savedSel &&
          (savedSel === FREE_MATCH_KEY ||
            demoMatches.some((m) => m.id === savedSel))
            ? savedSel
            : demoMatches[0]?.id || FREE_MATCH_KEY);

        const targetMatch =
          demoMatches.find((m) => m.id === initialKey) || null;
        const bundle =
          initialKey !== FREE_MATCH_KEY
            ? buildDemoBundle(initialKey, targetMatch)
            : null;
        const draftId = getDraftIdForSelection("demo-team", initialKey);
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
          setMatches(demoMatches);
          setRosterPlayers(demoRoster);
          setSelectedMatchKey(initialKey);
          setActiveBundle(bundle);
          setDoc(
            localParsed ||
              buildDocumentFromMatchAndBundle(
                targetMatch,
                bundle,
                savedReporter
              )
          );
          setIsLoadingContext(false);
          isHydratingRef.current = false;
        }
        return;
      }

      // B. 実チームDBモード
      try {
        const savedSel =
          typeof window !== "undefined"
            ? localStorage.getItem(getLocalActiveSelectionKey(resolvedTeamId)) ||
              ""
            : "";
        const candidateMatchId =
          queryMatchId ||
          (savedSel && savedSel !== FREE_MATCH_KEY ? savedSel : "");

        const url = `/api/liff/news-generator/context?teamId=${encodeURIComponent(
          resolvedTeamId
        )}${
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

        const resolvedKey =
          (queryMatchId && fetchedMatches.some((m) => m.id === queryMatchId)
            ? queryMatchId
            : "") ||
          (savedSel &&
          (savedSel === FREE_MATCH_KEY ||
            fetchedMatches.some((m) => m.id === savedSel))
            ? savedSel
            : fetchedMatches[0]?.id || FREE_MATCH_KEY);

        setSelectedMatchKey(resolvedKey);

        let bundle: MatchBundlePayload | null = null;
        if (resolvedKey !== FREE_MATCH_KEY) {
          if (json.matchBundle && json.matchBundle.matchId === resolvedKey) {
            bundle = json.matchBundle;
          } else {
            const bRes = await fetch(
              `/api/liff/news-generator/match-bundle?teamId=${encodeURIComponent(
                resolvedTeamId
              )}&matchId=${encodeURIComponent(resolvedKey)}`,
              { cache: "no-store" }
            );
            const bJson = (await bRes.json()) as MatchBundleApiResponse;
            if (cancelled) return;
            bundle = bJson.matchBundle || null;
          }
        }
        setActiveBundle(bundle);

        const draftId = getDraftIdForSelection(resolvedTeamId, resolvedKey);
        const cloudDraft =
          resolvedKey === FREE_MATCH_KEY
            ? json.freeCloudDraft || null
            : bundle?.cloudDraft || null;

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
          fetchedMatches.find((m) => m.id === resolvedKey) || null;

        if (cloudDraft) {
          setDoc(cloudDraft.report);
          setLastSyncedAt(cloudDraft.updatedAt);
          setLastSyncedBy(cloudDraft.updatedByName);
        } else if (localParsed) {
          setDoc(localParsed);
        } else {
          setDoc(
            buildDocumentFromMatchAndBundle(targetMatch, bundle, savedReporter)
          );
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
    queryMatchId,
    scoreTeamName,
    buildDemoBundle,
    buildDocumentFromMatchAndBundle,
  ]);

  // 2. 試合セレクタ手動切替ハンドラ
  const handleSelectMatchKey = async (nextKey: string) => {
    if (nextKey === selectedMatchKey) return;
    isHydratingRef.current = true;
    setSelectedMatchKey(nextKey);
    setManualEditedText(null);
    setShowResetConfirm(false);

    if (typeof window !== "undefined") {
      localStorage.setItem(getLocalActiveSelectionKey(resolvedTeamId), nextKey);
    }

    const savedReporter =
      typeof window !== "undefined"
        ? localStorage.getItem(getLocalReporterStorageKey(resolvedTeamId)) ||
          doc.reporterNames
        : doc.reporterNames;

    const targetMatch = matches.find((m) => m.id === nextKey) || null;
    const draftId = getDraftIdForSelection(resolvedTeamId, nextKey);

    // ローカル保存があればまず即時反映（体感0ms）
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
      const bundle =
        nextKey !== FREE_MATCH_KEY
          ? buildDemoBundle(nextKey, targetMatch)
          : null;
      setActiveBundle(bundle);
      setDoc(
        localParsed ||
          buildDocumentFromMatchAndBundle(targetMatch, bundle, savedReporter)
      );
      isHydratingRef.current = false;
      return;
    }

    if (localParsed) {
      setDoc(localParsed);
    }

    try {
      setIsSyncingCloud(true);
      if (nextKey === FREE_MATCH_KEY) {
        setActiveBundle(null);
        const dRes = await fetch(
          `/api/liff/news-generator/draft?teamId=${encodeURIComponent(
            resolvedTeamId
          )}&draftId=${encodeURIComponent(draftId)}`,
          { cache: "no-store" }
        );
        const dJson = (await dRes.json()) as DraftApiResponse;
        if (dJson.cloudDraft) {
          setDoc(dJson.cloudDraft.report);
          setLastSyncedAt(dJson.cloudDraft.updatedAt);
          setLastSyncedBy(dJson.cloudDraft.updatedByName);
        } else if (!localParsed) {
          setDoc(
            buildDocumentFromMatchAndBundle(null, null, savedReporter)
          );
          setLastSyncedAt(null);
          setLastSyncedBy(null);
        }
      } else {
        const bRes = await fetch(
          `/api/liff/news-generator/match-bundle?teamId=${encodeURIComponent(
            resolvedTeamId
          )}&matchId=${encodeURIComponent(nextKey)}`,
          { cache: "no-store" }
        );
        const bJson = (await bRes.json()) as MatchBundleApiResponse;
        const bundle = bJson.matchBundle || null;
        setActiveBundle(bundle);

        if (bundle?.cloudDraft) {
          setDoc(bundle.cloudDraft.report);
          setLastSyncedAt(bundle.cloudDraft.updatedAt);
          setLastSyncedBy(bundle.cloudDraft.updatedByName);
        } else if (!localParsed) {
          setDoc(
            buildDocumentFromMatchAndBundle(targetMatch, bundle, savedReporter)
          );
          setLastSyncedAt(null);
          setLastSyncedBy(null);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncingCloud(false);
      isHydratingRef.current = false;
    }
  };

  // 3. 端末自動保存 ＆ デバウンス付きクラウド下書き同期
  const pushDraftToCloud = useCallback(
    async (targetDoc: LiveReportV2Document, silent = true) => {
      if (resolvedTeamId === "demo-team") {
        setLastSyncedAt(Date.now());
        return;
      }

      try {
        setIsSyncingCloud(true);
        const updaterName =
          targetDoc.reporterNames.trim() || profile?.displayName || null;

        const res = await fetch("/api/liff/news-generator/draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: resolvedTeamId,
            draftId: activeDraftId,
            matchId:
              selectedMatchKey !== FREE_MATCH_KEY ? selectedMatchKey : null,
            report: targetDoc,
            updatedByName: updaterName,
          }),
        });
        const json = (await res.json()) as DraftApiResponse;
        if (res.ok && json.success) {
          setLastSyncedAt(json.updatedAt || Date.now());
          setLastSyncedBy(json.updatedByName ?? updaterName);
          if (selectedMatchKey !== FREE_MATCH_KEY) {
            setMatches((prev) =>
              prev.map((m) =>
                m.id === selectedMatchKey ? { ...m, hasCloudDraft: true } : m
              )
            );
          }
          if (!silent) {
            toast.success("クラウドに速報データを保存しました");
          }
        }
      } catch (err) {
        console.error(err);
        if (!silent) {
          toast.error("クラウド保存に失敗しました（端末内には保存済です）");
        }
      } finally {
        setIsSyncingCloud(false);
      }
    },
    [resolvedTeamId, activeDraftId, selectedMatchKey, profile?.displayName]
  );

  const handleUpdateDoc = useCallback(
    (updater: (prev: LiveReportV2Document) => LiveReportV2Document) => {
      setDoc((prev) => {
        const next = updater(prev);
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

        if (!isHydratingRef.current) {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            void pushDraftToCloud(next, true);
          }, 900);
        }
        return next;
      });
    },
    [resolvedTeamId, activeDraftId, pushDraftToCloud]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // 4. クラウドから最新状態を引き継ぐ（石塚さん ➔ 瀧さん の途中交代用）
  const handlePullLatestCloudDraft = async () => {
    if (resolvedTeamId === "demo-team") {
      toast.info("デモチームは現在の端末内で自動保持されています");
      return;
    }

    try {
      setIsSyncingCloud(true);
      const res = await fetch(
        `/api/liff/news-generator/draft?teamId=${encodeURIComponent(
          resolvedTeamId
        )}&draftId=${encodeURIComponent(activeDraftId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as DraftApiResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || "最新データの取得に失敗しました");
      }

      if (json.cloudDraft) {
        setDoc(json.cloudDraft.report);
        setManualEditedText(null);
        setLastSyncedAt(json.cloudDraft.updatedAt);
        setLastSyncedBy(json.cloudDraft.updatedByName);
        if (typeof window !== "undefined") {
          localStorage.setItem(
            getLocalDraftStorageKey(resolvedTeamId, activeDraftId),
            JSON.stringify(json.cloudDraft.report)
          );
        }
        toast.success("クラウドから最新の速報データを同期しました！");
      } else {
        toast.info("まだクラウド上に他メンバーの下書きはありません");
      }
    } catch (err) {
      console.error(err);
      toast.error("クラウド同期に失敗しました");
    } finally {
      setIsSyncingCloud(false);
    }
  };

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
    handleUpdateDoc((prev) => {
      if (activeBundle.scorebookSnapshot) {
        return hydrateLiveReportFromScorebookSnapshot({
          baseDoc: prev,
          topStructure: activeBundle.scorebookSnapshot.topStructure,
          bottomStructure: activeBundle.scorebookSnapshot.bottomStructure,
          topAtBats: activeBundle.scorebookSnapshot.topAtBats,
          bottomAtBats: activeBundle.scorebookSnapshot.bottomAtBats,
          matchStatus: selectedMatch?.status,
        });
      }
      return hydrateLiveReportFromLegacyLogsAndScores({
        baseDoc: prev,
        playLogs: activeBundle.playLogs,
        myInningScores: selectedMatch?.myInningScores || [],
        opponentInningScores: selectedMatch?.opponentInningScores || [],
        matchStatus: selectedMatch?.status,
      });
    });
    setManualEditedText(null);
    toast.success("記録済みスコアデータから全イニング経過を生成しました！");
  };

  // 6. この試合の速報データを初期化リセット
  const handleConfirmResetReport = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

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
              : doc.reporterNames,
        })
      : createInitialLiveReportDocument({
          myTeamName: scoreTeamName,
          reporterNames: doc.reporterNames,
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
    const shareUrl = `https://line.me/R/share?text=${encodeURIComponent(
      displayedText
    )}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const canImportSavedScore = Boolean(
    activeBundle &&
      (activeBundle.scorebookSnapshot || activeBundle.playLogs.length > 0)
  );

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="試合速報ジェネレータ"
          subtitle="LIVE NEWS GENERATOR v2"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <Megaphone className="w-4 h-4" />
            </span>
          }
          rightElement={
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-600 text-white">
              v2稼働中
            </span>
          }
          showBack
        />

        {/* ツール切替ナビ */}
        <LiffToolSubNav />

        {/* 0. 対象試合の選択 ＆ クラウド引き継ぎ同期バー */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
              <h2 className="text-xs font-black text-white truncate">
                対象の試合を選択・クラウド同期
              </h2>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-300">
                <Cloud className="w-3 h-3 text-emerald-400" />
                {isSyncingCloud
                  ? "同期中..."
                  : lastSyncedAt
                  ? `保存済 ${formatSyncTimeLabel(lastSyncedAt)}${
                      lastSyncedBy ? ` (${lastSyncedBy})` : ""
                    }`
                  : "端末自動保持"}
              </span>
              <button
                type="button"
                onClick={handlePullLatestCloudDraft}
                disabled={isSyncingCloud}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-[10px] font-black cursor-pointer active:scale-95"
                title="他の速報担当者が入力した最新データを読み込みます"
              >
                <RefreshCw
                  className={cn("w-3 h-3 text-sky-400", isSyncingCloud && "animate-spin")}
                />
                <span>最新同期</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 space-y-2.5">
            {isLoadingContext ? (
              <div className="h-10 rounded-xl bg-muted animate-pulse" />
            ) : (
              <select
                value={selectedMatchKey}
                onChange={(e) => void handleSelectMatchKey(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-muted/45 px-3 text-xs font-black text-foreground outline-none focus:border-primary"
              >
                {matches.map((m) => {
                  const stLabel =
                    m.status === "live"
                      ? "【試合中】"
                      : m.status === "scheduled"
                      ? "【予定】"
                      : m.status === "finished"
                      ? `【終了 ${m.myScore}-${m.opponentScore}】`
                      : "【中止】";
                  const dateDisp = formatJapaneseMatchDateLabel(m.date);
                  const draftMark = m.hasCloudDraft ? " ☁️速報記録あり" : "";
                  return (
                    <option key={m.id} value={m.id}>
                      {stLabel} {dateDisp} 対{m.opponent}
                      {m.venueShortName ? ` @${m.venueShortName}` : ""}
                      {draftMark}
                    </option>
                  );
                })}
                <option value={FREE_MATCH_KEY}>
                  ＋ 試合データなしで新規手入力（フリー作成）
                </option>
              </select>
            )}

            {/* 記録済みスコア一括取込 ＆ リセットボタン */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {canImportSavedScore ? (
                <button
                  type="button"
                  onClick={handleImportFromSavedScorebook}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary border border-primary/25 text-[11px] font-black cursor-pointer active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>記録済みスコアから全打席を自動生成</span>
                </button>
              ) : (
                <span className="text-[10.5px] font-bold text-muted-foreground">
                  LINE貼り付けで画面を閉じても自動保存・途中引き継ぎ可能です
                </span>
              )}

              {!showResetConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-black text-muted-foreground hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>内容を初期化</span>
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

        {/* 1. 試合・スタメン・速報担当の設定カード */}
        <MatchAndHeaderSetupCard
          doc={doc}
          onChangeDoc={handleUpdateDoc}
          rosterPlayers={rosterPlayers}
          suggestedReporters={selectedMatch?.lineLiveAssignees || []}
          hasSavedMatchLineup={Boolean(
            activeBundle && activeBundle.lineup.length > 0
          )}
          onReloadMatchLineup={handleReloadMatchLineup}
          activeContextKey={`${resolvedTeamId}:${selectedMatchKey}`}
        />

        {/* 2. ライブ1打席入力パッド */}
        <LiveAtBatPadCard
          doc={doc}
          onChangeDoc={handleUpdateDoc}
          rosterPlayers={rosterPlayers}
          activeContextKey={`${resolvedTeamId}:${selectedMatchKey}`}
        />

        {/* 2.5. 記録済みイニング経過一覧（タップで1行修正・削除） */}
        <InningLogTimelineCard
          doc={doc}
          onChangeDoc={handleUpdateDoc}
          activeContextKey={`${resolvedTeamId}:${selectedMatchKey}`}
        />

        {/* 3. LINE速報テキスト プレビュー ＆ 出力モード切替 ＆ LINE共有 */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-sky-400 shrink-0" />
              <h2 className="text-xs font-black text-white truncate">
                3. LINE速報テキスト出力・共有
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

          <div className="p-3.5 space-y-3">
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
                      "py-2 px-1 rounded-lg text-[11px] transition-all cursor-pointer",
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
              rows={18}
              className="w-full rounded-xl border border-border bg-muted/35 focus:bg-card focus:border-primary p-3.5 text-xs sm:text-sm font-bold text-foreground leading-relaxed outline-none resize-y font-sans"
              placeholder="ここにLINE速報テキストが自動生成されます（直接手直しも可能です）"
            />

            {/* コピー ＆ 公式ブランドカラー #06C755 LINE送信ボタン */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => void handleCopyText()}
                className="py-3.5 px-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>コピーしました！</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 shrink-0" />
                    <span>全文をコピー</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleShareLine}
                className="py-3.5 px-3 rounded-2xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Share2 className="w-4 h-4 shrink-0" />
                <span>LINEで送る</span>
              </button>
            </div>
          </div>
        </section>

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
