// filepath: src/app/liff/events/page.tsx
"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Coins,
  Crown,
  Edit3,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  PartyPopper,
  Plus,
  Users,
  Utensils,
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { LiffDataLoadErrorCard } from "@/components/liff/LiffDataLoadErrorCard";
import { ImportantNoticeBanner } from "@/components/liff/ImportantNoticeBanner";
import { useTeamGrounds } from "@/components/liff/LiffLocationPicker";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  useLiff,
  useLiffPermissions,
  useScoreTeamDisplayName,
} from "@/components/liff/LiffProvider";
import {
  fetchLiffJsonSWR,
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";
import { LIFF_WEBVIEW_RESUMED_EVENT } from "@/lib/liff/runtime-recovery";
import {
  buildDemoSpecialEventsBundle,
  buildSpecialEventHouseholdsAndSummary,
  buildSpecialEventTimeRangeLabel,
  formatDateKeyToJaLabel,
  getSpecialEventCategoryMeta,
  type RawSpecialEventResponseRow,
  type SpecialEventDetailItem,
  type TeamHouseholdUnit,
} from "@/lib/liff/special-events-schema";
import type {
  SubmitHouseholdResponsePayload,
  UpsertSpecialEventPayload,
} from "@/components/liff/SpecialEventModals";
import { cn } from "@/lib/utils";

const CreateOrEditSpecialEventModal = dynamic(
  () =>
    import("@/components/liff/SpecialEventModals").then(
      (m) => m.CreateOrEditSpecialEventModal
    ),
  { ssr: false }
);
const RespondSpecialEventModal = dynamic(
  () =>
    import("@/components/liff/SpecialEventModals").then(
      (m) => m.RespondSpecialEventModal
    ),
  { ssr: false }
);
const SpecialEventResponsesSummaryModal = dynamic(
  () =>
    import("@/components/liff/SpecialEventModals").then(
      (m) => m.SpecialEventResponsesSummaryModal
    ),
  { ssr: false }
);
const FinalizeCandidateDateModal = dynamic(
  () =>
    import("@/components/liff/SpecialEventModals").then(
      (m) => m.FinalizeCandidateDateModal
    ),
  { ssr: false }
);

interface SpecialEventsApiResponse {
  success: boolean;
  isDemo?: boolean;
  error?: string;
  myHouseholdKey?: string | null;
  events?: SpecialEventDetailItem[];
}

function buildSpecialEventsUrl(teamId: string, userName: string): string {
  const qs = new URLSearchParams({ teamId });
  if (userName) qs.set("userName", userName);
  return `/api/liff/special-events?${qs.toString()}`;
}

function rebuildClientEventFromHouseholds(
  ev: SpecialEventDetailItem,
  nextResponseRow: RawSpecialEventResponseRow,
  myHouseholdKey: string | null
): SpecialEventDetailItem {
  const units: TeamHouseholdUnit[] = ev.households.map((hh) => ({
    householdKey: hh.householdKey,
    householdLabel: hh.householdLabel,
    sortCategory: hh.sortCategory,
    isAllOnLeave: hh.isAllOnLeave,
    members: hh.memberEntries.map((m) => ({
      entityType: m.entityType,
      entityId: m.entityId,
      name: m.name,
      roleGroup: m.roleGroup,
      defaultFeeTierId: m.entityType === "player" ? "player" : "adult",
    })),
  }));

  const existingRows: RawSpecialEventResponseRow[] = ev.households
    .filter(
      (hh) => hh.hasResponded && hh.householdKey !== nextResponseRow.householdKey
    )
    .map((hh) => ({
      id: hh.responseId || `resp_${hh.householdKey}`,
      specialEventId: ev.id,
      householdKey: hh.householdKey,
      householdLabel: hh.householdLabel,
      memberEntriesJson: JSON.stringify(hh.memberEntries),
      companionsJson: JSON.stringify(hh.companions),
      dateVotesJson: JSON.stringify(hh.dateVotes),
      surveyAnswersJson: JSON.stringify(hh.surveyAnswers),
      comment: hh.comment,
      feePaid: hh.feePaid,
      updatedByUserId: null,
      updatedByName: hh.updatedByName,
      updatedAt: hh.updatedAtIso,
    }));

  const built = buildSpecialEventHouseholdsAndSummary({
    units,
    responseRows: [...existingRows, nextResponseRow],
    mode: ev.mode,
    includeStaff: ev.includeStaff,
    allowCompanions: ev.allowCompanions,
    useFeeCalculation: ev.useFeeCalculation,
    feeTiers: ev.feeTiers,
    candidateDates: ev.candidateDates,
    questions: ev.questions,
  });

  const nextMyResp = myHouseholdKey
    ? built.households.find((h) => h.householdKey === myHouseholdKey) || null
    : ev.myHouseholdResponse;

  return {
    ...ev,
    households: built.households,
    summary: built.summary,
    myHouseholdResponse: nextMyResp,
    isMyHouseholdTarget: Boolean(nextMyResp),
  };
}

function LiffSpecialEventsContent() {
  const searchParams = useSearchParams();
  const focusEventId = searchParams.get("id") || "";
  const shouldOpenNew = searchParams.get("new") === "1";

  const { currentTeam, profile, isDemo } = useLiff();
  const {
    canMutate,
    canEditSchedule,
    canManagePlayers,
    canManageTeam,
    isDemoMode,
  } = useLiffPermissions();
  const { scoreTeamName } = useScoreTeamDisplayName("チーム");

  const activeTeamId = useMemo(() => {
    if (currentTeam?.id) return currentTeam.id;
    if (typeof window !== "undefined") {
      return localStorage.getItem("iscore_selectedTeamId") || "demo-team";
    }
    return "demo-team";
  }, [currentTeam?.id]);

  const activeUserName = useMemo(() => {
    if (profile?.displayName) return profile.displayName;
    if (typeof window !== "undefined") {
      return localStorage.getItem("iscore_user_name") || "";
    }
    return "";
  }, [profile?.displayName]);

  const { grounds } = useTeamGrounds(activeTeamId);

  const initialEndpoint = buildSpecialEventsUrl(activeTeamId, activeUserName);
  const initialCached = useMemo(
    () => peekLiffApiCache<SpecialEventsApiResponse>(initialEndpoint),
    [initialEndpoint]
  );

  const [events, setEvents] = useState<SpecialEventDetailItem[]>(() =>
    Array.isArray(initialCached?.events) ? initialCached!.events! : []
  );
  const [myHouseholdKey, setMyHouseholdKey] = useState<string | null>(
    () => initialCached?.myHouseholdKey ?? null
  );
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached);
  const [hasLoaded, setHasLoaded] = useState<boolean>(Boolean(initialCached));
  const [loadError, setLoadError] = useState<boolean>(false);

  const [tabFilter, setTabFilter] = useState<"open" | "all" | "closed">("open");
  const [expandedSurveyMap, setExpandedSurveyMap] = useState<
    Record<string, boolean>
  >({});

  // モーダル制御ステート
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] =
    useState<SpecialEventDetailItem | null>(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);

  const [respondingEventId, setRespondingEventId] = useState<string | null>(
    null
  );
  const [respondingHouseholdKey, setRespondingHouseholdKey] = useState<
    string | null
  >(null);
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  const [summaryModalEventId, setSummaryModalEventId] = useState<string | null>(
    null
  );
  const [finalizingEventId, setFinalizingEventId] = useState<string | null>(
    null
  );

  const hasLoadedRef = useRef<boolean>(Boolean(initialCached));
  const prevTeamIdRef = useRef<string>(activeTeamId);
  const didAutoFocusRef = useRef<string>("");

  const effectiveCanEdit =
    canEditSchedule || canManagePlayers || canManageTeam || isDemoMode || isDemo;
  const effectiveCanRespond = canMutate || isDemoMode || isDemo;

  const applyApiData = useCallback((data: SpecialEventsApiResponse) => {
    if (!data || data.success === false) {
      if (!hasLoadedRef.current) {
        setLoadError(true);
      }
      setIsLoading(false);
      return;
    }
    setLoadError(false);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setMyHouseholdKey(data.myHouseholdKey ?? null);
    hasLoadedRef.current = true;
    setHasLoaded(true);
    setIsLoading(false);
  }, []);

  const loadEvents = useCallback(
    async (forceRefresh = false) => {
      const endpoint = buildSpecialEventsUrl(activeTeamId, activeUserName);
      const cached = !forceRefresh
        ? peekLiffApiCache<SpecialEventsApiResponse>(endpoint)
        : null;
      if (cached && cached.success !== false) {
        applyApiData(cached);
      } else if (!hasLoadedRef.current) {
        setIsLoading(true);
      }

      try {
        const fresh = await fetchLiffJsonSWR<SpecialEventsApiResponse>(
          endpoint,
          {
            forceRefresh,
            onRevalidate: (next) => applyApiData(next),
          }
        );
        applyApiData(fresh);
      } catch (err) {
        console.error("Failed to load special events:", err);
        if (!hasLoadedRef.current) {
          setLoadError(true);
        }
        setIsLoading(false);
      }
    },
    [activeTeamId, activeUserName, applyApiData]
  );

  useEffect(() => {
    if (prevTeamIdRef.current !== activeTeamId) {
      prevTeamIdRef.current = activeTeamId;
      const cached = peekLiffApiCache<SpecialEventsApiResponse>(
        buildSpecialEventsUrl(activeTeamId, activeUserName)
      );
      if (!cached) {
        setEvents([]);
        setMyHouseholdKey(null);
        hasLoadedRef.current = false;
        setHasLoaded(false);
        setLoadError(false);
      }
    }
    void loadEvents(false);
  }, [activeTeamId, activeUserName, loadEvents]);

  useEffect(() => {
    const onResume = () => {
      if (!hasLoadedRef.current) {
        void loadEvents(true);
      }
    };
    window.addEventListener("online", onResume);
    window.addEventListener(LIFF_WEBVIEW_RESUMED_EVENT, onResume);
    return () => {
      window.removeEventListener("online", onResume);
      window.removeEventListener(LIFF_WEBVIEW_RESUMED_EVENT, onResume);
    };
  }, [loadEvents]);

  useEffect(() => {
    if (shouldOpenNew && effectiveCanEdit) {
      setEditingEvent(null);
      setIsEditorOpen(true);
    }
  }, [effectiveCanEdit, shouldOpenNew]);

  useEffect(() => {
    if (
      !focusEventId ||
      events.length === 0 ||
      didAutoFocusRef.current === focusEventId
    ) {
      return;
    }
    const target = events.find((e) => e.id === focusEventId);
    if (!target) return;
    didAutoFocusRef.current = focusEventId;
    if (target.status !== "open" && tabFilter === "open") {
      setTabFilter("all");
    }
    requestAnimationFrame(() => {
      const el = document.getElementById(`spev-card-${focusEventId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [events, focusEventId, tabFilter]);

  const openEventsCount = useMemo(
    () => events.filter((e) => e.status === "open").length,
    [events]
  );
  const closedEventsCount = useMemo(
    () => events.filter((e) => e.status !== "open").length,
    [events]
  );

  const displayedEvents = useMemo(() => {
    if (tabFilter === "open") {
      const openList = events.filter((e) => e.status === "open");
      return openList.length > 0 || closedEventsCount === 0 ? openList : events;
    }
    if (tabFilter === "closed") {
      return events.filter((e) => e.status !== "open");
    }
    return events;
  }, [closedEventsCount, events, tabFilter]);

  const respondingEvent = useMemo(
    () => events.find((e) => e.id === respondingEventId) || null,
    [events, respondingEventId]
  );
  const summaryModalEvent = useMemo(
    () => events.find((e) => e.id === summaryModalEventId) || null,
    [events, summaryModalEventId]
  );
  const finalizingEvent = useMemo(
    () => events.find((e) => e.id === finalizingEventId) || null,
    [events, finalizingEventId]
  );

  // 新規作成・編集の保存
  const handleSaveEvent = async (payload: UpsertSpecialEventPayload) => {
    setIsSavingEvent(true);
    try {
      const isEditing = Boolean(editingEvent);
      const url = isEditing
        ? `/api/liff/special-events/${encodeURIComponent(editingEvent!.id)}`
        : "/api/liff/special-events";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: activeTeamId,
          createdByName: activeUserName || undefined,
          ...payload,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        isDemo?: boolean;
        id?: string;
        error?: string;
      };

      if (!res.ok || !json.success) {
        toast.error(json.error || "保存に失敗しました");
        return;
      }

      if (json.isDemo || activeTeamId === "demo-team") {
        // デモチームではスタッフを含む完全な初期名簿から再計算してOFF⇄ON切替も即時反映
        const demoFullHouseholds =
          buildDemoSpecialEventsBundle().events[0].households;
        const baseUnits: TeamHouseholdUnit[] = demoFullHouseholds.map((hh) => ({
          householdKey: hh.householdKey,
          householdLabel: hh.householdLabel,
          sortCategory: hh.sortCategory,
          isAllOnLeave: hh.isAllOnLeave,
          members: hh.memberEntries.map((m) => ({
            entityType: m.entityType,
            entityId: m.entityId,
            name: m.name,
            roleGroup: m.roleGroup,
            defaultFeeTierId: m.entityType === "player" ? "player" : "adult",
          })),
        }));
        const excludedStaffKeys = baseUnits
          .filter((u) => u.sortCategory === "staff")
          .map((u) => u.householdKey);

        if (isEditing && editingEvent) {
          setEvents((prev) =>
            prev.map((ev) => {
              if (ev.id !== editingEvent.id) return ev;
              const existingRows: RawSpecialEventResponseRow[] = ev.households
                .filter((hh) => hh.hasResponded)
                .map((hh) => ({
                  id: hh.responseId || `resp_${hh.householdKey}`,
                  specialEventId: ev.id,
                  householdKey: hh.householdKey,
                  householdLabel: hh.householdLabel,
                  memberEntriesJson: JSON.stringify(hh.memberEntries),
                  companionsJson: JSON.stringify(hh.companions),
                  dateVotesJson: JSON.stringify(hh.dateVotes),
                  surveyAnswersJson: JSON.stringify(hh.surveyAnswers),
                  comment: hh.comment,
                  feePaid: hh.feePaid,
                  updatedByUserId: null,
                  updatedByName: hh.updatedByName,
                  updatedAt: hh.updatedAtIso,
                }));
              const rebuilt = buildSpecialEventHouseholdsAndSummary({
                units: baseUnits,
                responseRows: existingRows,
                mode: payload.mode,
                includeStaff: payload.includeStaff,
                excludedStaffHouseholdKeys: excludedStaffKeys,
                allowCompanions: payload.allowCompanions,
                useFeeCalculation: payload.useFeeCalculation,
                feeTiers: payload.feeTiers,
                candidateDates: payload.candidateDates,
                questions: payload.questions,
              });
              const nextMyResp = myHouseholdKey
                ? rebuilt.households.find(
                    (h) => h.householdKey === myHouseholdKey
                  ) || null
                : null;
              return {
                ...ev,
                ...payload,
                eventDateLabel: formatDateKeyToJaLabel(payload.eventDate),
                timeRangeLabel: buildSpecialEventTimeRangeLabel(
                  payload.startTime,
                  payload.endTime
                ),
                interimDeadlineDateLabel: formatDateKeyToJaLabel(
                  payload.interimDeadlineDate
                ),
                deadlineDateLabel: formatDateKeyToJaLabel(payload.deadlineDate),
                households: rebuilt.households,
                summary: rebuilt.summary,
                isMyHouseholdTarget: Boolean(nextMyResp),
                myHouseholdResponse: nextMyResp,
              };
            })
          );
        } else {
          const newId = json.id || `demo-spev-${Date.now()}`;
          const built = buildSpecialEventHouseholdsAndSummary({
            units: baseUnits,
            responseRows: [],
            mode: payload.mode,
            includeStaff: payload.includeStaff,
            excludedStaffHouseholdKeys: excludedStaffKeys,
            allowCompanions: payload.allowCompanions,
            useFeeCalculation: payload.useFeeCalculation,
            feeTiers: payload.feeTiers,
            candidateDates: payload.candidateDates,
            questions: payload.questions,
          });
          const nextMyResp = myHouseholdKey
            ? built.households.find(
                (h) => h.householdKey === myHouseholdKey
              ) || null
            : null;
          const created: SpecialEventDetailItem = {
            id: newId,
            teamId: activeTeamId,
            ...payload,
            eventDateLabel: formatDateKeyToJaLabel(payload.eventDate),
            timeRangeLabel: buildSpecialEventTimeRangeLabel(
              payload.startTime,
              payload.endTime
            ),
            interimDeadlineDateLabel: formatDateKeyToJaLabel(
              payload.interimDeadlineDate
            ),
            deadlineDateLabel: formatDateKeyToJaLabel(payload.deadlineDate),
            createdByUserId: "demo-user",
            createdByName: activeUserName || "幹事",
            canDelete: true,
            isMyHouseholdTarget: Boolean(nextMyResp),
            myHouseholdResponse: nextMyResp,
            households: built.households,
            summary: built.summary,
          };
          setEvents((prev) => [created, ...prev]);
        }
      } else {
        invalidateLiffApiCache();
        await loadEvents(true);
      }

      setIsEditorOpen(false);
      setEditingEvent(null);
      toast.success(
        isEditing
          ? "イベント内容を更新しました！"
          : "新しいイベントを公開しました！"
      );
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSavingEvent(false);
    }
  };

  // イベント削除
  const handleDeleteEvent = async (eventId: string) => {
    const res = await fetch(
      `/api/liff/special-events/${encodeURIComponent(
        eventId
      )}?teamId=${encodeURIComponent(activeTeamId)}`,
      { method: "DELETE" }
    );
    const json = (await res.json()) as {
      success?: boolean;
      isDemo?: boolean;
      error?: string;
    };
    if (!res.ok || !json.success) {
      toast.error(json.error || "削除に失敗しました");
      return;
    }

    if (json.isDemo || activeTeamId === "demo-team") {
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    } else {
      invalidateLiffApiCache();
      await loadEvents(true);
    }
    setIsEditorOpen(false);
    setEditingEvent(null);
    toast.success("イベントを削除しました");
  };

  // 家族出欠・同伴・アンケートの回答保存
  const handleSubmitHouseholdResponse = async (
    payload: SubmitHouseholdResponsePayload
  ) => {
    if (!respondingEvent) return;
    setIsSubmittingResponse(true);
    try {
      const res = await fetch(
        `/api/liff/special-events/${encodeURIComponent(
          respondingEvent.id
        )}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: activeTeamId,
            updatedByName: activeUserName || undefined,
            ...payload,
          }),
        }
      );
      const json = (await res.json()) as {
        success?: boolean;
        isDemo?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "回答の保存に失敗しました");
        return;
      }

      const prevHh = respondingEvent.households.find(
        (h) => h.householdKey === payload.householdKey
      );
      const optimisticRow: RawSpecialEventResponseRow = {
        id: prevHh?.responseId || `resp_${payload.householdKey}`,
        specialEventId: respondingEvent.id,
        householdKey: payload.householdKey,
        householdLabel: payload.householdLabel,
        memberEntriesJson: JSON.stringify(payload.memberEntries),
        companionsJson: JSON.stringify(payload.companions),
        dateVotesJson: JSON.stringify(payload.dateVotes),
        surveyAnswersJson: JSON.stringify(payload.surveyAnswers),
        comment: payload.comment,
        feePaid: prevHh?.feePaid || false,
        updatedByUserId: null,
        updatedByName: activeUserName || "メンバー",
        updatedAt: new Date().toISOString(),
      };

      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === respondingEvent.id
            ? rebuildClientEventFromHouseholds(ev, optimisticRow, myHouseholdKey)
            : ev
        )
      );

      if (!json.isDemo && activeTeamId !== "demo-team") {
        invalidateLiffApiCache();
        await loadEvents(true);
      }

      setRespondingEventId(null);
      setRespondingHouseholdKey(null);
      toast.success(`${payload.householdLabel}の回答を保存しました！`);
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  // 集金済チェック切替
  const handleToggleFeePaid = async (
    eventId: string,
    householdKey: string,
    nextPaid: boolean
  ) => {
    const res = await fetch(
      `/api/liff/special-events/${encodeURIComponent(eventId)}/fee-paid`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: activeTeamId,
          householdKey,
          feePaid: nextPaid,
        }),
      }
    );
    const json = (await res.json()) as {
      success?: boolean;
      isDemo?: boolean;
      error?: string;
    };
    if (!res.ok || !json.success) {
      toast.error(json.error || "集金状態の更新に失敗しました");
      return;
    }

    setEvents((prev) =>
      prev.map((ev) => {
        if (ev.id !== eventId) return ev;
        const targetHh = ev.households.find(
          (h) => h.householdKey === householdKey
        );
        if (!targetHh) return ev;
        return rebuildClientEventFromHouseholds(
          ev,
          {
            id: targetHh.responseId || `resp_${householdKey}`,
            specialEventId: ev.id,
            householdKey,
            householdLabel: targetHh.householdLabel,
            memberEntriesJson: JSON.stringify(targetHh.memberEntries),
            companionsJson: JSON.stringify(targetHh.companions),
            dateVotesJson: JSON.stringify(targetHh.dateVotes),
            surveyAnswersJson: JSON.stringify(targetHh.surveyAnswers),
            comment: targetHh.comment,
            feePaid: nextPaid,
            updatedByUserId: null,
            updatedByName: targetHh.updatedByName,
            updatedAt: new Date().toISOString(),
          },
          myHouseholdKey
        );
      })
    );

    if (!json.isDemo && activeTeamId !== "demo-team") {
      invalidateLiffApiCache();
      await loadEvents(true);
    }
    toast.success(nextPaid ? "集金済にしました！" : "未集金に戻しました");
  };

  const todayJstKey = useMemo(() => {
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value || "2026";
    const m = parts.find((p) => p.type === "month")?.value || "01";
    const d = parts.find((p) => p.type === "day")?.value || "01";
    return `${y}-${m}-${d}`;
  }, []);

  // 候補日決定 ➔ 本出欠モードへ切替
  const handleFinalizeCandidateDate = async (params: {
    eventDate: string;
    startTime: string;
    endTime: string;
    location: string;
    interimDeadlineDate: string | null;
    deadlineDate: string | null;
    includeStaff: boolean;
  }) => {
    if (!finalizingEvent) return;
    setIsSavingEvent(true);
    try {
      const cleanTitle = finalizingEvent.title
        .replace(/\s*(?:開催日|日程調整)?アンケート\s*$/, "")
        .trim();

      const res = await fetch(
        `/api/liff/special-events/${encodeURIComponent(finalizingEvent.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: activeTeamId,
            title: cleanTitle || finalizingEvent.title,
            mode: "rsvp",
            status: "open",
            eventDate: params.eventDate,
            startTime: params.startTime,
            endTime: params.endTime,
            location: params.location,
            interimDeadlineDate: params.interimDeadlineDate,
            deadlineDate: params.deadlineDate,
            includeStaff: params.includeStaff,
          }),
        }
      );
      const json = (await res.json()) as {
        success?: boolean;
        isDemo?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "本出欠への切替に失敗しました");
        return;
      }

      if (json.isDemo || activeTeamId === "demo-team") {
        const demoFullHouseholds =
          buildDemoSpecialEventsBundle().events[0].households;
        const baseUnits: TeamHouseholdUnit[] = demoFullHouseholds.map((hh) => ({
          householdKey: hh.householdKey,
          householdLabel: hh.householdLabel,
          sortCategory: hh.sortCategory,
          isAllOnLeave: hh.isAllOnLeave,
          members: hh.memberEntries.map((m) => ({
            entityType: m.entityType,
            entityId: m.entityId,
            name: m.name,
            roleGroup: m.roleGroup,
            defaultFeeTierId: m.entityType === "player" ? "player" : "adult",
          })),
        }));
        const excludedStaffKeys = baseUnits
          .filter((u) => u.sortCategory === "staff")
          .map((u) => u.householdKey);

        setEvents((prev) =>
          prev.map((ev) => {
            if (ev.id !== finalizingEvent.id) return ev;
            const built = buildSpecialEventHouseholdsAndSummary({
              units: baseUnits,
              responseRows: [],
              mode: "rsvp",
              includeStaff: params.includeStaff,
              excludedStaffHouseholdKeys: excludedStaffKeys,
              allowCompanions: ev.allowCompanions,
              useFeeCalculation: ev.useFeeCalculation,
              feeTiers: ev.feeTiers,
              candidateDates: ev.candidateDates,
              questions: ev.questions,
            });
            const nextMyResp = myHouseholdKey
              ? built.households.find(
                  (h) => h.householdKey === myHouseholdKey
                ) || null
              : null;
            return {
              ...ev,
              title: cleanTitle || ev.title,
              mode: "rsvp",
              status: "open",
              eventDate: params.eventDate,
              eventDateLabel: formatDateKeyToJaLabel(params.eventDate),
              startTime: params.startTime,
              endTime: params.endTime,
              timeRangeLabel: buildSpecialEventTimeRangeLabel(
                params.startTime,
                params.endTime
              ),
              location: params.location,
              interimDeadlineDate: params.interimDeadlineDate,
              interimDeadlineDateLabel: formatDateKeyToJaLabel(
                params.interimDeadlineDate
              ),
              deadlineDate: params.deadlineDate,
              deadlineDateLabel: formatDateKeyToJaLabel(params.deadlineDate),
              includeStaff: params.includeStaff,
              households: built.households,
              summary: built.summary,
              isMyHouseholdTarget: Boolean(nextMyResp),
              myHouseholdResponse: nextMyResp,
            };
          })
        );
      } else {
        invalidateLiffApiCache();
        await loadEvents(true);
      }

      setFinalizingEventId(null);
      toast.success(
        "開催日を確定し、本出欠・同伴家族募集へ切り替えました！（カレンダーにも反映されました）"
      );
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSavingEvent(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="行事・アンケート"
          subtitle="忘年会・卒団式・同伴家族・会費・日程調整"
          icon={
            <span className="w-8 h-8 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 border border-teal-500/25 flex items-center justify-center">
              <PartyPopper className="w-4 h-4" />
            </span>
          }
          shareData={{
            title: `${scoreTeamName} 行事・アンケート`,
            text: "忘年会・卒団式・チームイベントの出欠・ご家族同伴・アンケート回答はこちらから！",
          }}
          rightElement={
            effectiveCanEdit ? (
              <button
                type="button"
                onClick={() => {
                  setEditingEvent(null);
                  setIsEditorOpen(true);
                }}
                className="px-3 py-2 rounded-2xl bg-primary hover:bg-primary/90 active:scale-95 text-primary-foreground text-xs font-black inline-flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>新規作成</span>
              </button>
            ) : undefined
          }
        />

        {/* 通常練習予定への相互案内バー */}
        <div className="rounded-2xl border border-border bg-card px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-2xs">
          <p className="text-[11px] font-bold text-muted-foreground">
            通常の練習・試合スケジュールとは別枠で出欠・家族同伴・アンケートを集計できます
          </p>
          <Link
            href="/liff/schedule"
            className="px-2.5 py-1 rounded-xl border border-border bg-muted/40 hover:bg-muted text-[10.5px] font-black text-foreground shrink-0"
          >
            通常予定へ
          </Link>
        </div>

        {/* フィルタタブ */}
        {events.length > 0 && (
          <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-muted border border-border">
            <button
              type="button"
              onClick={() => setTabFilter("open")}
              className={cn(
                "py-2 rounded-xl text-xs transition-all cursor-pointer",
                tabFilter === "open"
                  ? "bg-card text-foreground font-black border border-border shadow-xs"
                  : "text-muted-foreground font-bold"
              )}
            >
              受付中 ({openEventsCount})
            </button>
            <button
              type="button"
              onClick={() => setTabFilter("all")}
              className={cn(
                "py-2 rounded-xl text-xs transition-all cursor-pointer",
                tabFilter === "all"
                  ? "bg-card text-foreground font-black border border-border shadow-xs"
                  : "text-muted-foreground font-bold"
              )}
            >
              すべて ({events.length})
            </button>
            <button
              type="button"
              onClick={() => setTabFilter("closed")}
              className={cn(
                "py-2 rounded-xl text-xs transition-all cursor-pointer",
                tabFilter === "closed"
                  ? "bg-card text-foreground font-black border border-border shadow-xs"
                  : "text-muted-foreground font-bold"
              )}
            >
              締切・終了 ({closedEventsCount})
            </button>
          </div>
        )}

        {/* 読み込み・エラー・空状態・イベント一覧 */}
        {!hasLoaded && loadError ? (
          <LiffDataLoadErrorCard
            title="行事・アンケートを読み込めませんでした"
            onRetry={() => void loadEvents(true)}
            isRetrying={isLoading}
          />
        ) : isLoading && !hasLoaded ? (
          <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <span className="text-xs font-bold text-muted-foreground">
              行事・アンケートを読み込み中...
            </span>
          </div>
        ) : displayedEvents.length === 0 ? (
          <EmptyState
            icon={PartyPopper}
            title="登録されている行事・アンケートはありません"
            description="忘年会・納会・卒団式・親子BBQ・開催日調整アンケートなど、兄弟やご家族の同伴人数・会費も含めてかんたんに集計できます。"
            action={
              effectiveCanEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingEvent(null);
                    setIsEditorOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>最初の行事・アンケートを作成する</span>
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {displayedEvents.map((ev) => {
              const cat = getSpecialEventCategoryMeta(ev.category);
              const myResp = ev.myHouseholdResponse;
              const isSurveyExpanded = Boolean(expandedSurveyMap[ev.id]);
              const isFocused = focusEventId === ev.id;

              return (
                <article
                  key={ev.id}
                  id={`spev-card-${ev.id}`}
                  className={cn(
                    "rounded-2xl border bg-card shadow-xs overflow-hidden",
                    isFocused
                      ? "border-2 border-teal-500"
                      : "border-border"
                  )}
                >
                  {/* ━━ A-3 上帯ダークキャップ ━━ */}
                  <div
                    className={cn(
                      "px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] space-y-1.5",
                      ev.mode === "date_poll"
                        ? "border-amber-500"
                        : "border-teal-500"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px] font-black text-white">
                          {cat.icon} {cat.label}
                        </span>
                        {ev.mode === "date_poll" && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black">
                            🗳️ 日程調整
                          </span>
                        )}
                        {!ev.includeStaff && (
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/20 border border-sky-400/40 text-[10px] font-black text-sky-200">
                            🏠 ご家庭のみ
                          </span>
                        )}
                        {ev.status === "open" ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black">
                            受付中
                          </span>
                        ) : ev.status === "closed" ? (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black">
                            締切済
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-slate-700 text-slate-200 text-[10px] font-black">
                            終了
                          </span>
                        )}
                      </div>

                      {/* 自分の世帯の回答ステータスバッジ */}
                      {myResp ? (
                        <span
                          className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-black border",
                            !myResp.hasResponded
                              ? "bg-amber-500 text-slate-950 border-amber-400"
                              : myResp.overallState === "attending"
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                          )}
                        >
                          {!myResp.hasResponded
                            ? "⚡ 未回答"
                            : myResp.overallState === "attending"
                            ? ev.mode === "date_poll"
                              ? `✅ 回答済（${myResp.householdLabel}）`
                              : `✅ 出席 ${myResp.totalHeadcount}名${
                                  ev.useFeeCalculation
                                    ? ` / ${myResp.totalFeeAmount.toLocaleString()}円`
                                    : ""
                                }`
                            : "回答済（欠席）"}
                        </span>
                      ) : !ev.includeStaff ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-slate-800 text-slate-300 border-slate-700">
                          🏠 選手・保護者対象
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm sm:text-base font-black text-white leading-snug">
                        {ev.title}
                      </h2>
                      {effectiveCanEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEvent(ev);
                            setIsEditorOpen(true);
                          }}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-black inline-flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>編集</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ━━ ボディ ━━ */}
                  <div className="p-4 space-y-3.5 bg-card">
                    {/* 日時・会場・期限 */}
                    {ev.mode === "rsvp" ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-xl bg-muted/35 border border-border flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold text-muted-foreground block">
                              開催日時
                            </span>
                            <span className="font-black text-foreground">
                              {ev.eventDateLabel || ev.eventDate || "日程調整中"}{" "}
                              {ev.timeRangeLabel}
                            </span>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-muted/35 border border-border flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold text-muted-foreground block">
                                会場・お店
                              </span>
                              <span className="font-black text-foreground block truncate">
                                {ev.location || "未定・確認中"}
                              </span>
                            </div>
                          </div>
                          {ev.locationUrl && (
                            <a
                              href={ev.locationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-[10px] font-black inline-flex items-center gap-0.5 shrink-0"
                            >
                              <span>地図・店</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* 候補日ランキング表示 */
                      <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-foreground flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>候補日の回答状況</span>
                          </span>
                          {effectiveCanEdit &&
                            ev.summary.candidateSummaries.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setFinalizingEventId(ev.id)}
                                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-black inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Crown className="w-3 h-3" />
                                <span>開催日を決定して本出欠へ</span>
                              </button>
                            )}
                        </div>

                        <div className="space-y-1.5">
                          {ev.summary.candidateSummaries.map((cs) => (
                            <div
                              key={cs.id}
                              className={cn(
                                "p-2.5 rounded-xl border bg-card flex items-center justify-between gap-2",
                                cs.isTopCandidate
                                  ? "border-amber-500 shadow-2xs"
                                  : "border-border"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {cs.isTopCandidate && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 text-[9.5px] font-black">
                                      👑 最多
                                    </span>
                                  )}
                                  <span className="text-xs font-black text-foreground">
                                    {cs.dateLabel}
                                  </span>
                                  <span className="text-[10.5px] font-bold text-muted-foreground tabular-nums">
                                    {buildSpecialEventTimeRangeLabel(
                                      cs.startTime,
                                      cs.endTime
                                    )}
                                  </span>
                                </div>
                                {cs.note && (
                                  <p className="text-[10px] font-bold text-muted-foreground mt-0.5">
                                    {cs.note}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-black tabular-nums">
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
                                  ◯{cs.okCount}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300">
                                  △{cs.maybeCount}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                  ×{cs.ngCount}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 対象範囲・2段階回答期限（中間・最終日）＆ 会費チップ */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded-lg border font-black",
                          ev.includeStaff
                            ? "bg-teal-500/10 text-teal-800 dark:text-teal-300 border-teal-500/30"
                            : "bg-sky-500/12 text-sky-800 dark:text-sky-300 border border-sky-500/30"
                        )}
                      >
                        {ev.includeStaff
                          ? "🧢 対象: 選手・保護者・スタッフ"
                          : "🏠 対象: 選手・保護者ご家庭のみ（スタッフ除く）"}
                      </span>
                      {ev.interimDeadlineDateLabel && (
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-lg border tabular-nums",
                            ev.interimDeadlineDate &&
                              ev.interimDeadlineDate < todayJstKey &&
                              ev.deadlineDateLabel
                              ? "bg-muted text-muted-foreground border-border font-bold"
                              : "bg-sky-500/12 text-sky-800 dark:text-sky-300 border border-sky-500/30 font-black"
                          )}
                        >
                          {ev.interimDeadlineDate &&
                          ev.interimDeadlineDate < todayJstKey &&
                          ev.deadlineDateLabel
                            ? `📌 中間期限: ${ev.interimDeadlineDateLabel}（経過）`
                            : `📌 中間回答期限: ${ev.interimDeadlineDateLabel} まで`}
                        </span>
                      )}
                      {ev.deadlineDateLabel && (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/12 text-amber-800 dark:text-amber-300 border border-amber-500/30 font-black tabular-nums">
                          ⏰ 最終回答期限: {ev.deadlineDateLabel} まで
                        </span>
                      )}
                      {ev.mode === "rsvp" &&
                        ev.useFeeCalculation &&
                        ev.feeTiers
                          .filter((t) => t.enabled)
                          .map((t) => (
                            <span
                              key={t.id}
                              className="px-2 py-1 rounded-lg bg-muted/50 border border-border font-bold text-foreground"
                            >
                              {t.label}:{" "}
                              <strong className="font-black">
                                {t.amount === 0
                                  ? "無料"
                                  : `${t.amount.toLocaleString()}円`}
                              </strong>
                            </span>
                          ))}
                    </div>

                    {/* ⚠️ 注意事項・特記事項（入力時のみ常時強調表示） */}
                    <ImportantNoticeBanner notice={ev.importantNotice} />

                    {/* 📝 ご案内・連絡事項 */}
                    {ev.description && (
                      <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-black text-muted-foreground">
                          <FileText className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                          <span>ご案内・連絡事項</span>
                        </div>
                        <p className="text-xs font-bold text-foreground/90 whitespace-pre-wrap leading-relaxed">
                          {ev.description}
                        </p>
                      </div>
                    )}

                    {/* リアルタイム人数＆区分内訳サマリー（本出欠モード） */}
                    {ev.mode === "rsvp" && (
                      <div className="rounded-xl border border-border bg-muted/25 p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                            <span className="text-xs font-black text-foreground">
                              現在の参加予定:
                            </span>
                            <span className="text-base font-black text-teal-700 dark:text-teal-300 tabular-nums">
                              計 {ev.summary.totalHeadcount}名
                            </span>
                            {ev.summary.companionCount > 0 && (
                              <span className="text-[10.5px] font-bold text-muted-foreground">
                                （うち兄弟・同伴家族 {ev.summary.companionCount}
                                名）
                              </span>
                            )}
                          </div>
                          <span className="text-[10.5px] font-black text-muted-foreground tabular-nums">
                            回答 {ev.summary.respondedHouseholdCount}/
                            {ev.summary.activeTargetHouseholdCount} 世帯
                          </span>
                        </div>

                        {/* 区分別バッジ */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {ev.summary.tierTotals.map((t) => (
                            <div
                              key={t.tierId}
                              className="px-2.5 py-1.5 rounded-lg border border-border bg-card flex items-center justify-between gap-1 text-[11px]"
                            >
                              <span className="font-bold text-muted-foreground truncate">
                                {t.label}
                              </span>
                              <span className="font-black text-foreground shrink-0 tabular-nums">
                                {t.totalCount}名
                              </span>
                            </div>
                          ))}
                        </div>

                        {ev.useFeeCalculation && (
                          <div className="pt-1 border-t border-border/60 flex items-center justify-between text-[11px] font-black">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Coins className="w-3.5 h-3.5 text-amber-600" />
                              <span>会費予定総額 / 集金済</span>
                            </span>
                            <span className="text-foreground tabular-nums">
                              {ev.summary.expectedFeeTotal.toLocaleString()}円
                              <span className="text-emerald-700 dark:text-emerald-400 ml-1.5">
                                （済 {ev.summary.paidFeeTotal.toLocaleString()}
                                円）
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* アンケート簡易プレビュー折りたたみ */}
                    {ev.summary.questionSummaries.length > 0 && (
                      <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSurveyMap((prev) => ({
                              ...prev,
                              [ev.id]: !prev[ev.id],
                            }))
                          }
                          className="w-full px-3 py-2 bg-muted/35 hover:bg-muted/60 flex items-center justify-between text-xs font-black text-foreground cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <Utensils className="w-3.5 h-3.5 text-amber-600" />
                            <span>
                              アンケート集計を見る（
                              {ev.summary.questionSummaries.length}問）
                            </span>
                          </span>
                          {isSurveyExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>

                        {isSurveyExpanded && (
                          <div className="p-3 space-y-2.5 border-t border-border">
                            {ev.summary.questionSummaries.map((qs) => (
                              <div key={qs.questionId} className="space-y-1">
                                <p className="text-[11px] font-black text-foreground">
                                  ・{qs.title}
                                </p>
                                {qs.type === "text" ? (
                                  <p className="text-[10.5px] font-bold text-muted-foreground pl-3">
                                    記述回答: {qs.textAnswers.length}件
                                  </p>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5 pl-3">
                                    {qs.optionCounts.map((oc) => (
                                      <span
                                        key={oc.option}
                                        className="px-2 py-0.5 rounded-md bg-muted border border-border text-[10.5px] font-bold text-foreground"
                                      >
                                        {oc.option}:{" "}
                                        <strong className="font-black text-primary">
                                          {oc.count}
                                        </strong>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* メインアクションボタン */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={
                          !effectiveCanRespond ||
                          (!myResp && !effectiveCanEdit) ||
                          ev.households.length === 0
                        }
                        onClick={() => {
                          setRespondingEventId(ev.id);
                          setRespondingHouseholdKey(
                            myResp?.householdKey ||
                              ev.households[0]?.householdKey ||
                              myHouseholdKey
                          );
                        }}
                        className="h-11 px-4 rounded-xl bg-primary hover:bg-primary/90 active:scale-[0.99] disabled:opacity-50 text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {!myResp && !ev.includeStaff
                            ? effectiveCanEdit
                              ? "代理入力（世帯を選択）"
                              : "選手・保護者ご家庭のみ対象"
                            : myResp?.hasResponded
                            ? "回答を確認・変更する"
                            : ev.mode === "date_poll"
                            ? "候補日・アンケートを回答"
                            : "出欠・同伴・アンケートを回答"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSummaryModalEventId(ev.id)}
                        className="h-11 px-4 rounded-xl border border-border bg-card hover:bg-muted active:scale-[0.99] text-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <ClipboardList className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                        <span>回答一覧・集金・LINE共有</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

      {/* 各種モーダル */}
      {isEditorOpen && (
        <CreateOrEditSpecialEventModal
          isOpen={isEditorOpen}
          editingEvent={editingEvent}
          grounds={grounds}
          isSaving={isSavingEvent}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingEvent(null);
          }}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
        />
      )}

      {respondingEvent && (
        <RespondSpecialEventModal
          isOpen={Boolean(respondingEvent)}
          event={respondingEvent}
          initialHouseholdKey={respondingHouseholdKey}
          myHouseholdKey={myHouseholdKey}
          isSubmitting={isSubmittingResponse}
          onClose={() => {
            setRespondingEventId(null);
            setRespondingHouseholdKey(null);
          }}
          onSubmit={handleSubmitHouseholdResponse}
        />
      )}

      {summaryModalEvent && (
        <SpecialEventResponsesSummaryModal
          isOpen={Boolean(summaryModalEvent)}
          event={summaryModalEvent}
          teamName={scoreTeamName}
          canEditResponses={effectiveCanEdit}
          onClose={() => setSummaryModalEventId(null)}
          onProxyEditHousehold={(hhKey) => {
            const targetEvId = summaryModalEvent.id;
            setSummaryModalEventId(null);
            setRespondingEventId(targetEvId);
            setRespondingHouseholdKey(hhKey);
          }}
          onToggleFeePaid={(hhKey, nextPaid) =>
            handleToggleFeePaid(summaryModalEvent.id, hhKey, nextPaid)
          }
        />
      )}

      {finalizingEvent && (
        <FinalizeCandidateDateModal
          isOpen={Boolean(finalizingEvent)}
          event={finalizingEvent}
          isSaving={isSavingEvent}
          onClose={() => setFinalizingEventId(null)}
          onFinalize={handleFinalizeCandidateDate}
        />
      )}
    </div>
  );
}

export default function LiffSpecialEventsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1">
          <LiffHeader />
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        </div>
      }
    >
      <LiffSpecialEventsContent />
    </Suspense>
  );
}
