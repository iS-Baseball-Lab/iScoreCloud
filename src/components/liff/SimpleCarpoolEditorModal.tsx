// filepath: src/components/liff/SimpleCarpoolEditorModal.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import {
  LiffSelect,
  type LiffSelectBadgeTone,
} from "@/components/liff/LiffSelect";
import type {
  SimpleCarpoolContextResponse,
  SimpleCarpoolDriverCandidate,
  SimpleCarpoolPlayerCandidate,
  SimpleCarpoolSavePayload,
} from "@/api/liff/carpool-simple";
import {
  CalendarPlus,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  Minus,
  Package,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

interface DraftRiderItem {
  type: "player" | "adult";
  id: string;
  name: string;
}

interface DraftCarSlot {
  localKey: string;
  existingCarpoolId?: string;
  driverMemberId: string; // tm_... or "__custom__"
  customDriverName: string;
  carId: string | null;
  customCarName: string;
  plate: string;
  capacity: number;
  isCargo: boolean;
  riders: DraftRiderItem[];
}

interface SimpleCarpoolEditorModalProps {
  isOpen: boolean;
  teamId: string;
  initialEventId?: string;
  onClose: () => void;
  onSaved: (savedEventId: string) => void;
}

function getTodayJstDateString(): string {
  const jst = new Date(Date.now() + 9 * 3600_000);
  const yyyy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function makeLocalKey(): string {
  return `slot_${Math.random().toString(36).slice(2, 10)}`;
}

export function SimpleCarpoolEditorModal({
  isOpen,
  teamId,
  initialEventId,
  onClose,
  onSaved,
}: SimpleCarpoolEditorModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [ctx, setCtx] = useState<SimpleCarpoolContextResponse | null>(null);

  // 対象日程モード: 既存イベントID または "__new__"
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [newEventTitle, setNewEventTitle] = useState<string>("");
  const [newEventDate, setNewEventDate] = useState<string>(getTodayJstDateString);
  const [newEventTime, setNewEventTime] = useState<string>("08:00");
  const [destinationInput, setDestinationInput] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");

  // 号車リスト
  const [draftCars, setDraftCars] = useState<DraftCarSlot[]>([]);

  // 乗客ピッカーを開いている号車の localKey とタブ
  const [openPickerCarKey, setOpenPickerCarKey] = useState<string | null>(null);
  const [pickerTab, setPickerTab] = useState<"player" | "adult">("player");

  const applyContextToForm = useCallback(
    (data: SimpleCarpoolContextResponse) => {
      setCtx(data);

      if (!data.selectedEventId || data.events.length === 0) {
        setSelectedEventId("__new__");
        setNewEventDate(getTodayJstDateString());
        setNewEventTime("08:00");
        setDestinationInput(data.venues[0]?.name || "");
        setNotesInput("");
        setDraftCars([
          {
            localKey: makeLocalKey(),
            driverMemberId: data.drivers[0]?.memberId || "__custom__",
            customDriverName: "",
            carId: data.drivers[0]?.cars[0]?.carId || null,
            customCarName: data.drivers[0]?.cars[0]?.name || "",
            plate: data.drivers[0]?.cars[0]?.numberPlate || "",
            capacity: data.drivers[0]?.cars[0]?.capacity || 4,
            isCargo: Boolean(data.drivers[0]?.cars[0]?.isCargo),
            riders: [],
          },
        ]);
        return;
      }

      setSelectedEventId(data.selectedEventId);
      const evMeta = data.events.find((e) => e.id === data.selectedEventId);
      setDestinationInput(evMeta?.location || "");
      setNotesInput(evMeta?.notes || "");

      if (data.existingCars.length > 0) {
        setDraftCars(
          data.existingCars.map((ec) => ({
            localKey: makeLocalKey(),
            existingCarpoolId: ec.id,
            driverMemberId: ec.driverMemberId,
            customDriverName: "",
            carId: ec.carId,
            customCarName: ec.carName,
            plate: ec.plate,
            capacity: ec.capacity,
            isCargo: ec.isCargo,
            riders: ec.riders.map((r) => ({ ...r })),
          }))
        );
      } else {
        // 未作成時は「車出しOK」回答者がいれば自動で初期号車枠を用意、いなければ1号車空枠を1つ用意
        const carOfferDrivers = data.drivers.filter((d) => d.hasCarOffer);
        if (carOfferDrivers.length > 0) {
          setDraftCars(
            carOfferDrivers.map((d) => {
              const preferredCar =
                (d.offeredCarId
                  ? d.cars.find((c) => c.carId === d.offeredCarId)
                  : null) ||
                d.cars[0] ||
                null;
              return {
                localKey: makeLocalKey(),
                driverMemberId: d.memberId,
                customDriverName: "",
                carId: preferredCar?.carId || null,
                customCarName: preferredCar?.name || "",
                plate: preferredCar?.numberPlate || "",
                capacity: preferredCar?.capacity || 4,
                isCargo: Boolean(preferredCar?.isCargo),
                riders: [],
              };
            })
          );
        } else {
          const firstDriver = data.drivers[0] || null;
          const firstCar = firstDriver?.cars[0] || null;
          setDraftCars([
            {
              localKey: makeLocalKey(),
              driverMemberId: firstDriver ? firstDriver.memberId : "__custom__",
              customDriverName: "",
              carId: firstCar?.carId || null,
              customCarName: firstCar?.name || "",
              plate: firstCar?.numberPlate || "",
              capacity: firstCar?.capacity || 4,
              isCargo: Boolean(firstCar?.isCargo),
              riders: [],
            },
          ]);
        }
      }
    },
    []
  );

  const loadContext = useCallback(
    async (targetEvId?: string) => {
      setIsLoading(true);
      try {
        const qs = new URLSearchParams({ teamId: teamId || "demo-team" });
        if (targetEvId && targetEvId !== "__new__" && targetEvId !== "convoy-test") {
          qs.set("eventId", targetEvId);
        }
        const res = await fetch(
          `/api/liff/carpool-simple/context?${qs.toString()}`,
          {
            headers: { "x-iscore-bypass-cache": "1" },
          }
        );
        const data = (await res.json()) as SimpleCarpoolContextResponse;
        if (!res.ok || !data.success) {
          toast.error("配車データの読み込みに失敗しました");
          return;
        }
        applyContextToForm(data);
      } catch {
        toast.error("通信エラーが発生しました");
      } finally {
        setIsLoading(false);
      }
    },
    [teamId, applyContextToForm]
  );

  useEffect(() => {
    if (!isOpen) return;
    setOpenPickerCarKey(null);
    void loadContext(initialEventId);
  }, [isOpen, initialEventId, loadContext]);

  const handleSwitchEvent = useCallback(
    (nextEventId: string) => {
      setOpenPickerCarKey(null);
      if (nextEventId === "__new__") {
        setSelectedEventId("__new__");
        setNewEventTitle("");
        setNewEventDate(getTodayJstDateString());
        setNewEventTime("08:00");
        setDestinationInput("");
        setNotesInput("");
        const firstDriver = ctx?.drivers[0] || null;
        const firstCar = firstDriver?.cars[0] || null;
        setDraftCars([
          {
            localKey: makeLocalKey(),
            driverMemberId: firstDriver ? firstDriver.memberId : "__custom__",
            customDriverName: "",
            carId: firstCar?.carId || null,
            customCarName: firstCar?.name || "",
            plate: firstCar?.numberPlate || "",
            capacity: firstCar?.capacity || 4,
            isCargo: Boolean(firstCar?.isCargo),
            riders: [],
          },
        ]);
        return;
      }
      void loadContext(nextEventId);
    },
    [ctx?.drivers, loadContext]
  );

  // ==========================================
  // 排他制御マップ（どの選手・大人が何号車に割当済みか）
  // ==========================================
  const assignmentLookup = useMemo(() => {
    const driverCarNumByMemberId = new Map<string, number>();
    const playerCarNumById = new Map<string, number>();
    const adultRiderCarNumById = new Map<string, number>();

    draftCars.forEach((slot, idx) => {
      const carNum = idx + 1;
      if (slot.driverMemberId && slot.driverMemberId !== "__custom__") {
        driverCarNumByMemberId.set(slot.driverMemberId, carNum);
      }
      slot.riders.forEach((r) => {
        if (r.type === "player") {
          playerCarNumById.set(r.id, carNum);
        } else {
          adultRiderCarNumById.set(r.id, carNum);
        }
      });
    });

    return {
      driverCarNumByMemberId,
      playerCarNumById,
      adultRiderCarNumById,
    };
  }, [draftCars]);

  // 出席回答者が1人以上いれば出席選手を優先対象、未回答イベントなら全在籍選手を対象として未乗車数を算出
  const targetPlayersForCheck = useMemo<SimpleCarpoolPlayerCandidate[]>(() => {
    const all = ctx?.players || [];
    const attendingOnly = all.filter((p) => p.isAttending);
    return attendingOnly.length > 0 ? attendingOnly : all;
  }, [ctx?.players]);

  const unassignedTargetPlayers = useMemo(() => {
    return targetPlayersForCheck.filter(
      (p) => !assignmentLookup.playerCarNumById.has(p.playerId)
    );
  }, [targetPlayersForCheck, assignmentLookup.playerCarNumById]);

  const totalSeats = useMemo(
    () => draftCars.reduce((acc, c) => acc + c.capacity, 0),
    [draftCars]
  );
  const totalAssignedRiders = useMemo(
    () => draftCars.reduce((acc, c) => acc + c.riders.length, 0),
    [draftCars]
  );

  // ==========================================
  // 号車・運転手・乗客の操作ハンドラ
  // ==========================================
  const handleAddCarSlot = useCallback(() => {
    const drivers = ctx?.drivers || [];
    const unusedDriver =
      drivers.find(
        (d) =>
          !assignmentLookup.driverCarNumByMemberId.has(d.memberId) &&
          !assignmentLookup.adultRiderCarNumById.has(d.memberId)
      ) || null;
    const preferredCar =
      (unusedDriver?.offeredCarId
        ? unusedDriver.cars.find((c) => c.carId === unusedDriver.offeredCarId)
        : null) ||
      unusedDriver?.cars[0] ||
      null;

    const newKey = makeLocalKey();
    setDraftCars((prev) => [
      ...prev,
      {
        localKey: newKey,
        driverMemberId: unusedDriver ? unusedDriver.memberId : "__custom__",
        customDriverName: "",
        carId: preferredCar?.carId || null,
        customCarName: preferredCar?.name || "",
        plate: preferredCar?.numberPlate || "",
        capacity: preferredCar?.capacity || 4,
        isCargo: Boolean(preferredCar?.isCargo),
        riders: [],
      },
    ]);
  }, [ctx?.drivers, assignmentLookup]);

  const handleRemoveCarSlot = useCallback((localKey: string) => {
    setDraftCars((prev) => prev.filter((c) => c.localKey !== localKey));
    setOpenPickerCarKey((prev) => (prev === localKey ? null : prev));
  }, []);

  const handleDriverChange = useCallback(
    (localKey: string, nextDriverMemberId: string) => {
      const driverObj: SimpleCarpoolDriverCandidate | undefined =
        ctx?.drivers.find((d) => d.memberId === nextDriverMemberId);
      const preferredCar =
        (driverObj?.offeredCarId
          ? driverObj.cars.find((c) => c.carId === driverObj.offeredCarId)
          : null) ||
        driverObj?.cars[0] ||
        null;

      setDraftCars((prev) =>
        prev.map((slot) => {
          if (slot.localKey !== localKey) return slot;
          // 自分がこの車の同乗者に入っていたら除外
          const filteredRiders = slot.riders.filter(
            (r) => !(r.type === "adult" && r.id === nextDriverMemberId)
          );
          if (nextDriverMemberId === "__custom__") {
            return {
              ...slot,
              driverMemberId: "__custom__",
              carId: null,
              riders: filteredRiders,
            };
          }
          return {
            ...slot,
            driverMemberId: nextDriverMemberId,
            customDriverName: "",
            carId: preferredCar?.carId || null,
            customCarName: preferredCar?.name || slot.customCarName,
            plate: preferredCar?.numberPlate || slot.plate,
            capacity: preferredCar?.capacity || slot.capacity,
            isCargo: preferredCar ? preferredCar.isCargo : slot.isCargo,
            riders: filteredRiders,
          };
        })
      );
    },
    [ctx?.drivers]
  );

  const handleToggleRiderInSlot = useCallback(
    (localKey: string, item: DraftRiderItem) => {
      setDraftCars((prev) =>
        prev.map((slot) => {
          if (slot.localKey !== localKey) return slot;
          const exists = slot.riders.some(
            (r) => r.type === item.type && r.id === item.id
          );
          if (exists) {
            return {
              ...slot,
              riders: slot.riders.filter(
                (r) => !(r.type === item.type && r.id === item.id)
              ),
            };
          }
          return {
            ...slot,
            riders: [...slot.riders, item],
          };
        })
      );
    },
    []
  );

  // ⚡ 未乗車の対象選手を各号車の空席へ均等自動振り分け
  const handleAutoFillRemainingPlayers = useCallback(() => {
    if (unassignedTargetPlayers.length === 0) {
      toast.info("未乗車の選手はいません");
      return;
    }
    if (draftCars.length === 0) {
      toast.error("先に号車を追加してください");
      return;
    }

    const nextSlots = draftCars.map((s) => ({
      ...s,
      riders: [...s.riders],
    }));

    let placedCount = 0;
    for (const player of unassignedTargetPlayers) {
      // 空席比率が最も余裕のある号車を選択
      const candidateSlot = nextSlots
        .filter((s) => s.riders.length < s.capacity)
        .sort(
          (a, b) =>
            b.capacity - b.riders.length - (a.capacity - a.riders.length)
        )[0];

      if (!candidateSlot) break;
      candidateSlot.riders.push({
        type: "player",
        id: player.playerId,
        name: player.name,
      });
      placedCount += 1;
    }

    if (placedCount === 0) {
      toast.error("すべての号車が満席です。定員を増やすか号車を追加してください");
      return;
    }

    setDraftCars(nextSlots);
    toast.success(`${placedCount}名の選手を空席へ自動セットしました！`);
  }, [unassignedTargetPlayers, draftCars]);

  // ==========================================
  // 保存送信
  // ==========================================
  const handleSave = useCallback(async () => {
    if (selectedEventId === "__new__" && !newEventTitle.trim()) {
      toast.error("予定タイトル（例: 練習試合 遠征）を入力してください");
      return;
    }

    if (selectedEventId === "__new__" && draftCars.length === 0) {
      toast.error("1台以上の号車を追加してください");
      return;
    }

    for (let i = 0; i < draftCars.length; i++) {
      const c = draftCars[i];
      if (c.driverMemberId === "__custom__" && !c.customDriverName.trim()) {
        toast.error(`${i + 1}号車の運転手名を入力してください`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload: SimpleCarpoolSavePayload = {
        teamId: teamId || "demo-team",
        eventId: selectedEventId || "__new__",
        newEvent:
          selectedEventId === "__new__"
            ? {
                title: newEventTitle.trim(),
                date: newEventDate,
                gatherTime: newEventTime,
                destination: destinationInput.trim() || "グラウンド",
                notes: notesInput.trim(),
              }
            : undefined,
        eventPatch:
          selectedEventId !== "__new__"
            ? {
                destination: destinationInput.trim(),
                notes: notesInput,
              }
            : undefined,
        cars: draftCars.map((slot) => ({
          id: slot.existingCarpoolId,
          driverMemberId: slot.driverMemberId,
          customDriverName: slot.customDriverName.trim() || undefined,
          carId: slot.carId,
          customCarName: slot.customCarName.trim() || undefined,
          plate: slot.plate.trim() || undefined,
          capacity: slot.capacity,
          isCargo: slot.isCargo,
          riders: slot.riders.map((r) => ({ type: r.type, id: r.id })),
        })),
      };

      const res = await fetch("/api/liff/carpool-simple/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        success: boolean;
        eventId?: string;
        savedCount?: number;
        error?: string;
      };

      if (!res.ok || !json.success) {
        toast.error(json.error || "保存に失敗しました");
        return;
      }

      invalidateLiffApiCache();
      toast.success(
        `配車表（${json.savedCount ?? draftCars.length}台）を保存しました！`
      );
      onSaved(json.eventId || selectedEventId);
    } catch {
      toast.error("通信エラーにより保存できませんでした");
    } finally {
      setIsSaving(false);
    }
  }, [
    selectedEventId,
    newEventTitle,
    newEventDate,
    newEventTime,
    destinationInput,
    notesInput,
    draftCars,
    teamId,
    onSaved,
  ]);

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-[#eef2f6] dark:bg-background text-foreground shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* A-3 上帯ダークキャップ */}
        <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-teal-500 text-slate-950 flex items-center justify-center shrink-0">
              <Car className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-white truncate">
                簡易配車の作成・編集
              </h2>
              <p className="text-[11px] font-bold text-slate-300 truncate">
                1号車〜N号車の運転手・乗車メンバーをかんたん設定
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* スクロールボディ */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
              <span className="text-xs font-bold">
                予定とメンバー情報を読み込み中...
              </span>
            </div>
          ) : (
            <>
              {/* ==================== 1. 対象予定 ＆ 目的地設定カード ==================== */}
              <section className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
                <div className="px-3.5 py-2 bg-[#0f172a] text-white border-b-[3px] border-teal-500 flex items-center justify-between">
                  <span className="text-xs font-black">
                    1. 対象の予定・目的地グラウンド
                  </span>
                  {ctx && ctx.events.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        handleSwitchEvent(
                          selectedEventId === "__new__"
                            ? ctx.events[0].id
                            : "__new__"
                        )
                      }
                      className="px-2 py-0.5 rounded bg-teal-500 text-slate-950 text-[11px] font-black flex items-center gap-1 cursor-pointer"
                    >
                      <CalendarPlus className="w-3 h-3" />
                      <span>
                        {selectedEventId === "__new__"
                          ? "既存予定から選ぶ"
                          : "＋ 新規日程を作成"}
                      </span>
                    </button>
                  )}
                </div>

                <div className="p-3.5 space-y-2.5 text-xs">
                  {selectedEventId !== "__new__" && ctx && ctx.events.length > 0 ? (
                    <div className="space-y-1">
                      <label className="block text-[11px] font-black text-muted-foreground">
                        配車を設定する予定
                      </label>
                      <LiffSelect
                        value={selectedEventId}
                        onChange={(val) => handleSwitchEvent(val)}
                        options={[
                          ...ctx.events.map((ev) => ({
                            value: ev.id,
                            label: `${ev.dateLabel} ${ev.timeLabel}〜 ${ev.title}`,
                            badge:
                              ev.carCount > 0
                                ? `登録済:${ev.carCount}台`
                                : undefined,
                            badgeTone: "teal" as const,
                            group: "登録済みのチーム予定",
                          })),
                          {
                            value: "__new__",
                            label: "＋ 新しい遠征・配車日程を作成する",
                            sublabel:
                              "予定表にない日程をその場で作成して配車を設定します",
                            badge: "新規作成",
                            badgeTone: "amber" as const,
                            group: "新規作成",
                          },
                        ]}
                        title="配車を設定する予定を選択"
                        accent="teal"
                        searchable={true}
                        searchPlaceholder="日付・予定タイトルで検索..."
                        className="w-full bg-background"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2.5 p-2.5 rounded-xl bg-muted/60 border border-border">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-black text-foreground">
                          新しい予定タイトル（必須）
                        </label>
                        <input
                          type="text"
                          value={newEventTitle}
                          onChange={(e) => setNewEventTitle(e.target.value)}
                          placeholder="例: 練習試合 遠征"
                          className="w-full h-9 px-3 rounded-xl border border-border bg-card text-foreground text-xs font-bold"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="block text-[11px] font-black text-muted-foreground">
                            日付
                          </label>
                          <input
                            type="date"
                            value={newEventDate}
                            onChange={(e) => setNewEventDate(e.target.value)}
                            className="w-full h-9 px-2.5 rounded-xl border border-border bg-card text-foreground text-xs font-bold"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-black text-muted-foreground">
                            集合・出発時刻
                          </label>
                          <input
                            type="time"
                            value={newEventTime}
                            onChange={(e) => setNewEventTime(e.target.value)}
                            className="w-full h-9 px-2.5 rounded-xl border border-border bg-card text-foreground text-xs font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 目的地グラウンド（隊列マップの🏁ピンと連動） */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1 text-[11px] font-black text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 text-teal-600" />
                      <span>目的地（球場・グラウンド名）</span>
                    </label>
                    <input
                      type="text"
                      value={destinationInput}
                      onChange={(e) => setDestinationInput(e.target.value)}
                      placeholder="例: 〇〇市民球場"
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                    />
                    {ctx && ctx.venues.length > 0 && (
                      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                        {ctx.venues.slice(0, 8).map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setDestinationInput(v.name)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold shrink-0 cursor-pointer ${
                              destinationInput === v.name
                                ? "bg-teal-600 text-white border-teal-600 font-black"
                                : "bg-muted text-foreground border-border hover:bg-muted/80"
                            }`}
                          >
                            {v.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 配車連絡メモ */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      連絡メモ（任意・注意事項欄に表示）
                    </label>
                    <input
                      type="text"
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="例: 7:45正門前集合 / 第2駐車場へ駐車"
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                    />
                  </div>
                </div>
              </section>

              {/* ==================== 2. 乗車状況サマリー ＆ 1タップ自動セットバー ==================== */}
              <section className="rounded-2xl border border-border bg-card p-3 shadow-2xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-black text-foreground">
                    <Users className="w-4 h-4 text-teal-600" />
                    <span>
                      {draftCars.length}台 ・ 乗車 {totalAssignedRiders}/
                      {totalSeats}席
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                      unassignedTargetPlayers.length === 0
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    {unassignedTargetPlayers.length === 0
                      ? "✓ 対象選手 全員乗車済"
                      : `未乗車の選手: ${unassignedTargetPlayers.length}名`}
                  </span>
                </div>

                {unassignedTargetPlayers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoFillRemainingPlayers}
                    className="w-full h-9 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      未乗車の選手（{unassignedTargetPlayers.length}
                      名）を空席へ自動セット
                    </span>
                  </button>
                )}
              </section>

              {/* ==================== 3. 各号車スロット（1号車〜N号車） ==================== */}
              <div className="space-y-3">
                {draftCars.length === 0 && (
                  <div className="p-3.5 rounded-2xl border border-border bg-card text-center space-y-1">
                    <p className="text-xs font-black text-foreground">
                      現在、登録する号車が0台です
                    </p>
                    <p className="text-[11px] font-bold text-muted-foreground">
                      下の「1号車を追加する」から車両を登録してください（このまま保存すると対象予定の配車をクリアします）
                    </p>
                  </div>
                )}
                {draftCars.map((slot, index) => {
                  const carNumber = index + 1;
                  const selectedDriver = ctx?.drivers.find(
                    (d) => d.memberId === slot.driverMemberId
                  );
                  const isPickerOpen = openPickerCarKey === slot.localKey;
                  const remainSeats = Math.max(
                    0,
                    slot.capacity - slot.riders.length
                  );

                  return (
                    <section
                      key={slot.localKey}
                      className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden"
                    >
                      {/* 号車ヘッダー（A-3 上帯ダークキャップ） */}
                      <div className="px-3.5 py-2.5 bg-[#0f172a] text-white border-b-[3px] border-primary flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-primary text-primary-foreground text-xs font-black flex items-center justify-center tabular-nums">
                            {carNumber}
                          </span>
                          <span className="text-xs font-black text-white">
                            {carNumber}号車
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftCars((prev) =>
                                prev.map((c) =>
                                  c.localKey === slot.localKey
                                    ? { ...c, isCargo: !c.isCargo }
                                    : c
                                )
                              )
                            }
                            className={`px-2 py-0.5 rounded text-[11px] font-black flex items-center gap-1 cursor-pointer transition-colors ${
                              slot.isCargo
                                ? "bg-amber-400 text-slate-950"
                                : "bg-slate-800 text-slate-300 border border-slate-700"
                            }`}
                          >
                            <Package className="w-3 h-3" />
                            <span>道具車</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-200 tabular-nums">
                            {slot.riders.length}/{slot.capacity}席
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCarSlot(slot.localKey)}
                            title="この号車を削除"
                            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="p-3.5 space-y-3 text-xs">
                        {/* 運転手選択 */}
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-black text-muted-foreground">
                            運転手
                          </label>
                          <LiffSelect
                            value={slot.driverMemberId}
                            onChange={(val) =>
                              handleDriverChange(slot.localKey, val)
                            }
                            options={[
                              ...(ctx?.drivers || []).map((d) => {
                                const assignedNum =
                                  assignmentLookup.driverCarNumByMemberId.get(
                                    d.memberId
                                  );
                                const lockedOther = Boolean(
                                  assignedNum && assignedNum !== carNumber
                                );
                                const carSummary = d.cars[0]
                                  ? `${d.cars[0].name}・${d.cars[0].capacity}席${
                                      d.cars[0].isCargo ? "（道具車）" : ""
                                    }`
                                  : undefined;
                                return {
                                  value: d.memberId,
                                  label: `${d.hasCarOffer ? "🚗 " : ""}${
                                    d.name
                                  } (${d.roleLabel})`,
                                  badge: lockedOther
                                    ? `${assignedNum}号車で選択中`
                                    : d.hasCarOffer
                                    ? "車出しOK"
                                    : undefined,
                                  badgeTone: (lockedOther
                                    ? "slate"
                                    : "teal") as LiffSelectBadgeTone,
                                  sublabel: lockedOther
                                    ? `他の号車（${assignedNum}号車）で割当済のため選択できません${
                                        carSummary ? ` / ${carSummary}` : ""
                                      }`
                                    : carSummary,
                                  disabled: lockedOther,
                                  keywords: `${d.name} ${d.roleLabel} ${
                                    carSummary || ""
                                  }`,
                                };
                              }),
                              {
                                value: "__custom__",
                                label: "＋ 運転手名を手入力する",
                                sublabel:
                                  "名簿にない保護者・スタッフの氏名と車両を手動で入力します",
                                badge: "手入力",
                                badgeTone: "amber" as const,
                              },
                            ]}
                            title={`${carNumber}号車の運転手を選択`}
                            accent="teal"
                            size="sm"
                            searchable={true}
                            searchPlaceholder="運転手名・車両名で検索..."
                            className="w-full h-9 bg-background"
                          />

                          {slot.driverMemberId === "__custom__" && (
                            <input
                              type="text"
                              value={slot.customDriverName}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDraftCars((prev) =>
                                  prev.map((c) =>
                                    c.localKey === slot.localKey
                                      ? { ...c, customDriverName: val }
                                      : c
                                  )
                                );
                              }}
                              placeholder="運転手名を入力（例: 山田 パパ）"
                              className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                            />
                          )}
                        </div>

                        {/* 車種 ＆ 乗車定員ステッパー */}
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-7 space-y-1">
                            <label className="block text-[11px] font-black text-muted-foreground">
                              車両名（任意）
                            </label>
                            {selectedDriver && selectedDriver.cars.length > 1 ? (
                              <LiffSelect
                                value={slot.carId || ""}
                                onChange={(val) => {
                                  const nextCarId = val || null;
                                  const foundCar = selectedDriver.cars.find(
                                    (mc) => mc.carId === nextCarId
                                  );
                                  setDraftCars((prev) =>
                                    prev.map((c) =>
                                      c.localKey === slot.localKey
                                        ? {
                                            ...c,
                                            carId: nextCarId,
                                            customCarName: foundCar?.name || "",
                                            plate: foundCar?.numberPlate || "",
                                            capacity:
                                              foundCar?.capacity || c.capacity,
                                            isCargo: foundCar
                                              ? foundCar.isCargo
                                              : c.isCargo,
                                          }
                                        : c
                                    )
                                  );
                                }}
                                options={selectedDriver.cars.map((mc) => ({
                                  value: mc.carId,
                                  label: `${mc.name}（定員${mc.capacity}）`,
                                  badge: mc.isCargo ? "道具車" : undefined,
                                  badgeTone: "amber" as const,
                                  sublabel: mc.numberPlate
                                    ? `ナンバー: ${mc.numberPlate}`
                                    : undefined,
                                }))}
                                title={`${selectedDriver.name}の車両を選択`}
                                accent="teal"
                                size="sm"
                                searchable={false}
                                className="w-full h-9 bg-background"
                              />
                            ) : (
                              <input
                                type="text"
                                value={slot.customCarName}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftCars((prev) =>
                                    prev.map((c) =>
                                      c.localKey === slot.localKey
                                        ? { ...c, carId: null, customCarName: val }
                                        : c
                                    )
                                  );
                                }}
                                placeholder="例: ミニバン (白)"
                                className="w-full h-9 px-2.5 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                              />
                            )}
                          </div>

                          <div className="col-span-5 space-y-1">
                            <label className="block text-[11px] font-black text-muted-foreground">
                              定員（運転手除く）
                            </label>
                            <div className="h-9 rounded-xl border border-border bg-background flex items-center justify-between px-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftCars((prev) =>
                                    prev.map((c) =>
                                      c.localKey === slot.localKey
                                        ? {
                                            ...c,
                                            capacity: Math.max(1, c.capacity - 1),
                                          }
                                        : c
                                    )
                                  )
                                }
                                className="w-7 h-7 rounded-lg bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-xs font-black tabular-nums">
                                {slot.capacity}名
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftCars((prev) =>
                                    prev.map((c) =>
                                      c.localKey === slot.localKey
                                        ? {
                                            ...c,
                                            capacity: Math.min(25, c.capacity + 1),
                                          }
                                        : c
                                    )
                                  )
                                }
                                className="w-7 h-7 rounded-lg bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 同乗者チップ一覧 ＆ ピッカー開閉ボタン */}
                        <div className="pt-2 border-t border-border space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-muted-foreground">
                              同乗メンバー（{slot.riders.length}名）
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setOpenPickerCarKey((prev) =>
                                  prev === slot.localKey ? null : slot.localKey
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-black flex items-center gap-1 cursor-pointer"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>
                                {isPickerOpen
                                  ? "選択パネルを閉じる"
                                  : `メンバーを選ぶ（残${remainSeats}席）`}
                              </span>
                              {isPickerOpen ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          </div>

                          {slot.riders.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {slot.riders.map((r) => (
                                <button
                                  key={`${r.type}-${r.id}`}
                                  type="button"
                                  onClick={() =>
                                    handleToggleRiderInSlot(slot.localKey, r)
                                  }
                                  className={`px-2.5 py-1 rounded-lg text-xs font-black inline-flex items-center gap-1 cursor-pointer ${
                                    r.type === "player"
                                      ? "bg-primary/12 text-primary border border-primary/30"
                                      : "bg-muted text-foreground border border-border"
                                  }`}
                                >
                                  <span>{r.name}</span>
                                  <X className="w-3 h-3 opacity-70" />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] font-bold text-muted-foreground">
                              まだ同乗メンバーが選択されていません
                            </p>
                          )}

                          {/* インライン乗客ピッカー（排他ロック付き） */}
                          {isPickerOpen && (
                            <div className="p-2.5 rounded-xl bg-muted border border-border space-y-2">
                              <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-card border border-border">
                                <button
                                  type="button"
                                  onClick={() => setPickerTab("player")}
                                  className={`py-1.5 rounded-md text-xs cursor-pointer ${
                                    pickerTab === "player"
                                      ? "bg-[#0f172a] text-white font-black"
                                      : "text-muted-foreground font-bold"
                                  }`}
                                >
                                  選手 ({ctx?.players.length || 0})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPickerTab("adult")}
                                  className={`py-1.5 rounded-md text-xs cursor-pointer ${
                                    pickerTab === "adult"
                                      ? "bg-[#0f172a] text-white font-black"
                                      : "text-muted-foreground font-bold"
                                  }`}
                                >
                                  保護者・指導者 ({ctx?.drivers.length || 0})
                                </button>
                              </div>

                              {pickerTab === "player" ? (
                                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                                  {(ctx?.players || []).map((p) => {
                                    const assignedCarNum =
                                      assignmentLookup.playerCarNumById.get(
                                        p.playerId
                                      );
                                    const inThisCar = assignedCarNum === carNumber;
                                    const inOtherCar = Boolean(
                                      assignedCarNum && assignedCarNum !== carNumber
                                    );
                                    return (
                                      <button
                                        key={p.playerId}
                                        type="button"
                                        disabled={inOtherCar}
                                        onClick={() =>
                                          handleToggleRiderInSlot(slot.localKey, {
                                            type: "player",
                                            id: p.playerId,
                                            name: p.name,
                                          })
                                        }
                                        className={`px-2.5 py-2 rounded-xl border text-left text-xs flex items-center justify-between gap-1 transition-colors ${
                                          inThisCar
                                            ? "bg-primary text-primary-foreground border-primary font-black cursor-pointer"
                                            : inOtherCar
                                            ? "bg-card/50 text-muted-foreground border-border opacity-55 cursor-not-allowed font-bold"
                                            : "bg-card text-foreground border-border hover:bg-muted/60 font-bold cursor-pointer"
                                        }`}
                                      >
                                        <span className="truncate">
                                          {p.uniformNumber
                                            ? `#${p.uniformNumber} `
                                            : ""}
                                          {p.name}
                                          {p.isAttending ? " ◯" : ""}
                                        </span>
                                        {inThisCar ? (
                                          <Check className="w-3.5 h-3.5 shrink-0" />
                                        ) : inOtherCar ? (
                                          <span className="text-[10px] font-black shrink-0">
                                            {assignedCarNum}号車
                                          </span>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                                  {(ctx?.drivers || []).map((m) => {
                                    const driverCarNum =
                                      assignmentLookup.driverCarNumByMemberId.get(
                                        m.memberId
                                      );
                                    const riderCarNum =
                                      assignmentLookup.adultRiderCarNumById.get(
                                        m.memberId
                                      );
                                    const inThisCar = riderCarNum === carNumber;
                                    const lockedAsDriver = Boolean(driverCarNum);
                                    const lockedInOtherCar = Boolean(
                                      riderCarNum && riderCarNum !== carNumber
                                    );
                                    const isLocked =
                                      lockedAsDriver || lockedInOtherCar;

                                    return (
                                      <button
                                        key={m.memberId}
                                        type="button"
                                        disabled={isLocked}
                                        onClick={() =>
                                          handleToggleRiderInSlot(slot.localKey, {
                                            type: "adult",
                                            id: m.memberId,
                                            name: m.name,
                                          })
                                        }
                                        className={`px-2.5 py-2 rounded-xl border text-left text-xs flex items-center justify-between gap-1 transition-colors ${
                                          inThisCar
                                            ? "bg-primary text-primary-foreground border-primary font-black cursor-pointer"
                                            : isLocked
                                            ? "bg-card/50 text-muted-foreground border-border opacity-55 cursor-not-allowed font-bold"
                                            : "bg-card text-foreground border-border hover:bg-muted/60 font-bold cursor-pointer"
                                        }`}
                                      >
                                        <span className="truncate">{m.name}</span>
                                        {inThisCar ? (
                                          <Check className="w-3.5 h-3.5 shrink-0" />
                                        ) : lockedAsDriver ? (
                                          <span className="text-[10px] font-black shrink-0">
                                            {driverCarNum}号車運転
                                          </span>
                                        ) : lockedInOtherCar ? (
                                          <span className="text-[10px] font-black shrink-0">
                                            {riderCarNum}号車
                                          </span>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  );
                })}

                {/* 号車追加ボタン */}
                <button
                  type="button"
                  onClick={handleAddCarSlot}
                  className="w-full h-11 px-4 rounded-2xl border-2 border-dashed border-teal-600/50 bg-card hover:bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>{draftCars.length + 1}号車を追加する</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* 最下部フッター（Safe Area 完全対応） */}
        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
          >
            キャンセル
          </button>

          <button
            type="button"
            disabled={isLoading || isSaving}
            onClick={() => void handleSave()}
            className="h-10 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer transition-colors"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>保存して配車表・隊列マップに反映</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
