// filepath: src/components/liff/SimpleCarpoolEditorModal.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import {
  LiffSelect,
  type LiffSelectBadgeTone,
} from "@/components/liff/LiffSelect";
import {
  applyDefaultEquipmentsToCarSlots,
  applyPreviousCarpoolEquipments,
  distributeEquipmentsAcrossCarSlots,
  getEquipmentSetCategoryMeta,
  recommendEquipmentSetIds,
  type CarSlotForEquipmentCalc,
  type EquipmentSetItem,
} from "@/lib/liff/equipment-sets-schema";
import type {
  SimpleCarpoolContextResponse,
  SimpleCarpoolDriverCandidate,
  SimpleCarpoolEquipmentOption,
  SimpleCarpoolPlayerCandidate,
  SimpleCarpoolSavePayload,
  SimpleCarpoolSharedCarItem,
} from "@/api/liff/carpool-simple";
import {
  BookmarkPlus,
  Bus,
  CalendarPlus,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  Loader2,
  MapPin,
  Minus,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
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
  isBus: boolean;
  riders: DraftRiderItem[];
  equipmentIds: string[];
  hasReturnDiff: boolean;
  returnRiders: DraftRiderItem[];
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

function toCalcCarSlot(slot: DraftCarSlot): CarSlotForEquipmentCalc {
  return {
    localKey: slot.localKey,
    carId: slot.carId,
    driverMemberId: slot.driverMemberId,
    isCargo: slot.isCargo,
    isBus: slot.isBus,
    capacity: slot.capacity,
    ridersCount: slot.riders.length,
    equipmentIds: slot.equipmentIds,
  };
}

function withAutoDefaultEquipments(
  slots: DraftCarSlot[],
  equipments: readonly SimpleCarpoolEquipmentOption[]
): DraftCarSlot[] {
  if (slots.length === 0 || equipments.length === 0) return slots;
  const { equipmentIdsBySlotKey, addedCount } = applyDefaultEquipmentsToCarSlots({
    slots: slots.map(toCalcCarSlot),
    equipments,
  });
  if (addedCount === 0) return slots;
  return slots.map((s) => ({
    ...s,
    equipmentIds: equipmentIdsBySlotKey.get(s.localKey) || s.equipmentIds,
  }));
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

  // 行き便乗客ピッカー・通常車の道具ピッカー・帰り便乗客ピッカーの開閉状態
  const [openPickerCarKey, setOpenPickerCarKey] = useState<string | null>(null);
  const [pickerTab, setPickerTab] = useState<"player" | "adult">("player");
  const [openEquipCarKey, setOpenEquipCarKey] = useState<string | null>(null);
  const [openReturnPickerCarKey, setOpenReturnPickerCarKey] = useState<
    string | null
  >(null);
  const [returnPickerTab, setReturnPickerTab] = useState<"player" | "adult">(
    "player"
  );

  // 現在の道具割当をセット保存するインラインドロワー状態
  const [isSavingSetOpen, setIsSavingSetOpen] = useState(false);
  const [quickSetName, setQuickSetName] = useState("");
  const [isSavingQuickSet, setIsSavingQuickSet] = useState(false);

  const applyContextToForm = useCallback(
    (data: SimpleCarpoolContextResponse) => {
      setCtx(data);
      setOpenEquipCarKey(null);
      setOpenReturnPickerCarKey(null);
      setIsSavingSetOpen(false);
      setQuickSetName("");
      const eqMaster = data.teamEquipments || [];

      if (!data.selectedEventId || data.events.length === 0) {
        setSelectedEventId("__new__");
        setNewEventDate(getTodayJstDateString());
        setNewEventTime("08:00");
        setDestinationInput(data.venues[0]?.name || "");
        setNotesInput("");
        setDraftCars(
          withAutoDefaultEquipments(
            [
              {
                localKey: makeLocalKey(),
                driverMemberId: data.drivers[0]?.memberId || "__custom__",
                customDriverName: "",
                carId: data.drivers[0]?.cars[0]?.carId || null,
                customCarName: data.drivers[0]?.cars[0]?.name || "",
                plate: data.drivers[0]?.cars[0]?.numberPlate || "",
                capacity: data.drivers[0]?.cars[0]?.capacity ?? 4,
                isCargo: Boolean(data.drivers[0]?.cars[0]?.isCargo),
                isBus: Boolean(data.drivers[0]?.cars[0]?.isBus),
                riders: [],
                equipmentIds: [],
                hasReturnDiff: false,
                returnRiders: [],
              },
            ],
            eqMaster
          )
        );
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
            isBus: Boolean(ec.isBus),
            riders: ec.riders.map((r) => ({ ...r })),
            equipmentIds: Array.isArray(ec.equipmentIds)
              ? [...ec.equipmentIds]
              : [],
            hasReturnDiff: Boolean(ec.hasReturnDiff),
            returnRiders: Array.isArray(ec.returnRiders)
              ? ec.returnRiders.map((r) => ({ ...r }))
              : [],
          }))
        );
      } else {
        // 未作成時は「車出しOK」回答者がいれば自動で初期号車枠を用意＋常設車両・保管担当の備品を自動セット
        const carOfferDrivers = data.drivers.filter((d) => d.hasCarOffer);
        if (carOfferDrivers.length > 0) {
          setDraftCars(
            withAutoDefaultEquipments(
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
                  capacity: preferredCar?.capacity ?? 4,
                  isCargo: Boolean(preferredCar?.isCargo),
                  isBus: Boolean(preferredCar?.isBus),
                  riders: [],
                  equipmentIds: [],
                  hasReturnDiff: false,
                  returnRiders: [],
                };
              }),
              eqMaster
            )
          );
        } else {
          const firstDriver = data.drivers[0] || null;
          const firstCar = firstDriver?.cars[0] || null;
          setDraftCars(
            withAutoDefaultEquipments(
              [
                {
                  localKey: makeLocalKey(),
                  driverMemberId: firstDriver
                    ? firstDriver.memberId
                    : "__custom__",
                  customDriverName: "",
                  carId: firstCar?.carId || null,
                  customCarName: firstCar?.name || "",
                  plate: firstCar?.numberPlate || "",
                  capacity: firstCar?.capacity ?? 4,
                  isCargo: Boolean(firstCar?.isCargo),
                  isBus: Boolean(firstCar?.isBus),
                  riders: [],
                  equipmentIds: [],
                  hasReturnDiff: false,
                  returnRiders: [],
                },
              ],
              eqMaster
            )
          );
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
    setOpenEquipCarKey(null);
    setOpenReturnPickerCarKey(null);
    setIsSavingSetOpen(false);
    setQuickSetName("");
    void loadContext(initialEventId);
  }, [isOpen, initialEventId, loadContext]);

  const handleSwitchEvent = useCallback(
    (nextEventId: string) => {
      setOpenPickerCarKey(null);
      setOpenEquipCarKey(null);
      setOpenReturnPickerCarKey(null);
      setIsSavingSetOpen(false);
      setQuickSetName("");
      if (nextEventId === "__new__") {
        setSelectedEventId("__new__");
        setNewEventTitle("");
        setNewEventDate(getTodayJstDateString());
        setNewEventTime("08:00");
        setDestinationInput("");
        setNotesInput("");
        const firstDriver = ctx?.drivers[0] || null;
        const firstCar = firstDriver?.cars[0] || null;
        setDraftCars(
          withAutoDefaultEquipments(
            [
              {
                localKey: makeLocalKey(),
                driverMemberId: firstDriver
                  ? firstDriver.memberId
                  : "__custom__",
                customDriverName: "",
                carId: firstCar?.carId || null,
                customCarName: firstCar?.name || "",
                plate: firstCar?.numberPlate || "",
                capacity: firstCar?.capacity ?? 4,
                isCargo: Boolean(firstCar?.isCargo),
                isBus: Boolean(firstCar?.isBus),
                riders: [],
                equipmentIds: [],
                hasReturnDiff: false,
                returnRiders: [],
              },
            ],
            ctx?.teamEquipments || []
          )
        );
        return;
      }
      void loadContext(nextEventId);
    },
    [ctx?.drivers, ctx?.teamEquipments, loadContext]
  );

  // ==========================================
  // 排他制御マップ（行き便・帰り便・道具積載・共有車両）
  // ==========================================
  const assignmentLookup = useMemo(() => {
    const driverCarNumByMemberId = new Map<string, number>();
    const playerCarNumById = new Map<string, number>();
    const adultRiderCarNumById = new Map<string, number>();
    const returnPlayerCarNumById = new Map<string, number>();
    const returnAdultRiderCarNumById = new Map<string, number>();
    const equipmentCarNumById = new Map<string, number>();
    const carNumBySelectedCarId = new Map<string, number>();

    draftCars.forEach((slot, idx) => {
      const carNum = idx + 1;
      if (slot.driverMemberId && slot.driverMemberId !== "__custom__") {
        driverCarNumByMemberId.set(slot.driverMemberId, carNum);
      }
      if (slot.carId) {
        carNumBySelectedCarId.set(slot.carId, carNum);
      }
      slot.riders.forEach((r) => {
        if (r.type === "player") {
          playerCarNumById.set(r.id, carNum);
        } else {
          adultRiderCarNumById.set(r.id, carNum);
        }
      });
      const effectiveReturnRiders = slot.hasReturnDiff
        ? slot.returnRiders
        : slot.riders;
      effectiveReturnRiders.forEach((rr) => {
        if (rr.type === "player") {
          returnPlayerCarNumById.set(rr.id, carNum);
        } else {
          returnAdultRiderCarNumById.set(rr.id, carNum);
        }
      });
      slot.equipmentIds.forEach((eqId) => {
        equipmentCarNumById.set(eqId, carNum);
      });
    });

    return {
      driverCarNumByMemberId,
      playerCarNumById,
      adultRiderCarNumById,
      returnPlayerCarNumById,
      returnAdultRiderCarNumById,
      equipmentCarNumById,
      carNumBySelectedCarId,
    };
  }, [draftCars]);

  const teamEquipmentList = useMemo<SimpleCarpoolEquipmentOption[]>(
    () => ctx?.teamEquipments || [],
    [ctx?.teamEquipments]
  );

  const equipmentById = useMemo(() => {
    const map = new Map<string, SimpleCarpoolEquipmentOption>();
    for (const eq of teamEquipmentList) {
      map.set(eq.id, eq);
    }
    return map;
  }, [teamEquipmentList]);

  const validEquipmentIdSet = useMemo(
    () => new Set(teamEquipmentList.map((eq) => eq.id)),
    [teamEquipmentList]
  );

  const equipmentSets = useMemo<EquipmentSetItem[]>(
    () => ctx?.equipmentSets || [],
    [ctx?.equipmentSets]
  );

  const currentEventMeta = useMemo(() => {
    if (selectedEventId === "__new__") {
      return {
        title: newEventTitle,
        notes: notesInput,
        dateKey: newEventDate,
      };
    }
    const ev = ctx?.events.find((e) => e.id === selectedEventId);
    return {
      title: ev?.title || "",
      notes: notesInput || ev?.notes || "",
      dateKey: ev?.dateKey || null,
    };
  }, [selectedEventId, newEventTitle, notesInput, newEventDate, ctx?.events]);

  const recommendedSetIds = useMemo(
    () =>
      recommendEquipmentSetIds(
        equipmentSets,
        `${currentEventMeta.title} ${currentEventMeta.notes}`,
        currentEventMeta.dateKey
      ),
    [equipmentSets, currentEventMeta]
  );

  const orderedEquipmentSets = useMemo(() => {
    if (recommendedSetIds.size === 0) return equipmentSets;
    return [...equipmentSets].sort((a, b) => {
      const aRec = recommendedSetIds.has(a.id) ? 1 : 0;
      const bRec = recommendedSetIds.has(b.id) ? 1 : 0;
      return bRec - aRec;
    });
  }, [equipmentSets, recommendedSetIds]);

  const pendingDefaultEquipCount = useMemo(() => {
    if (draftCars.length === 0 || teamEquipmentList.length === 0) return 0;
    return applyDefaultEquipmentsToCarSlots({
      slots: draftCars.map(toCalcCarSlot),
      equipments: teamEquipmentList,
    }).addedCount;
  }, [draftCars, teamEquipmentList]);

  const totalAssignedEquipments = assignmentLookup.equipmentCarNumById.size;

  const unassignedHeavyEquipments = useMemo(
    () =>
      teamEquipmentList.filter(
        (eq) => eq.isHeavy && !assignmentLookup.equipmentCarNumById.has(eq.id)
      ),
    [teamEquipmentList, assignmentLookup.equipmentCarNumById]
  );

  const unassignedSharedCars = useMemo<SimpleCarpoolSharedCarItem[]>(() => {
    return (ctx?.sharedCars || []).filter(
      (sc) => !assignmentLookup.carNumBySelectedCarId.has(sc.carId)
    );
  }, [ctx?.sharedCars, assignmentLookup.carNumBySelectedCarId]);

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
  // 号車・運転手・乗客・道具・帰り便の操作ハンドラ
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
    setDraftCars((prev) =>
      withAutoDefaultEquipments(
        [
          ...prev,
          {
            localKey: newKey,
            driverMemberId: unusedDriver ? unusedDriver.memberId : "__custom__",
            customDriverName: "",
            carId: preferredCar?.carId || null,
            customCarName: preferredCar?.name || "",
            plate: preferredCar?.numberPlate || "",
            capacity: preferredCar?.capacity ?? 4,
            isCargo: Boolean(preferredCar?.isCargo),
            isBus: Boolean(preferredCar?.isBus),
            riders: [],
            equipmentIds: [],
            hasReturnDiff: false,
            returnRiders: [],
          },
        ],
        teamEquipmentList
      )
    );
  }, [ctx?.drivers, assignmentLookup, teamEquipmentList]);

  const handleAddSharedCarSlot = useCallback(
    (sharedCar: SimpleCarpoolSharedCarItem) => {
      const drivers = ctx?.drivers || [];
      const unusedStaffDriver =
        drivers.find(
          (d) =>
            d.roleLabel === "指導者" &&
            !assignmentLookup.driverCarNumByMemberId.has(d.memberId) &&
            !assignmentLookup.adultRiderCarNumById.has(d.memberId)
        ) ||
        drivers.find(
          (d) =>
            !assignmentLookup.driverCarNumByMemberId.has(d.memberId) &&
            !assignmentLookup.adultRiderCarNumById.has(d.memberId)
        ) ||
        null;

      const newKey = makeLocalKey();
      setDraftCars((prev) =>
        withAutoDefaultEquipments(
          [
            ...prev,
            {
              localKey: newKey,
              driverMemberId: unusedStaffDriver
                ? unusedStaffDriver.memberId
                : "__custom__",
              customDriverName: "",
              carId: sharedCar.carId,
              customCarName: sharedCar.name,
              plate: sharedCar.numberPlate || "",
              capacity: sharedCar.capacity,
              isCargo: Boolean(sharedCar.isCargo),
              isBus: Boolean(sharedCar.isBus),
              riders: [],
              equipmentIds: [],
              hasReturnDiff: false,
              returnRiders: [],
            },
          ],
          teamEquipmentList
        )
      );
      toast.success(
        `チーム共有の「${sharedCar.name}」を追加しました。当日の運転手を確認してください`
      );
    },
    [ctx?.drivers, assignmentLookup, teamEquipmentList]
  );

  const handleRemoveCarSlot = useCallback((localKey: string) => {
    setDraftCars((prev) => prev.filter((c) => c.localKey !== localKey));
    setOpenPickerCarKey((prev) => (prev === localKey ? null : prev));
    setOpenEquipCarKey((prev) => (prev === localKey ? null : prev));
    setOpenReturnPickerCarKey((prev) => (prev === localKey ? null : prev));
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
        withAutoDefaultEquipments(
          prev.map((slot) => {
            if (slot.localKey !== localKey) return slot;
            // 自分がこの車の同乗者（行き・帰り）に入っていたら除外
            const filteredRiders = slot.riders.filter(
              (r) => !(r.type === "adult" && r.id === nextDriverMemberId)
            );
            const filteredReturnRiders = slot.returnRiders.filter(
              (r) => !(r.type === "adult" && r.id === nextDriverMemberId)
            );
            // 既にチーム共有車両（バス・共有道具車等）を選択中の場合はその車両を維持
            const isKeepingSharedVehicle = Boolean(
              slot.carId &&
                ctx?.sharedCars?.some((sc) => sc.carId === slot.carId)
            );
            if (nextDriverMemberId === "__custom__") {
              return {
                ...slot,
                driverMemberId: "__custom__",
                carId: isKeepingSharedVehicle || slot.isBus ? slot.carId : null,
                riders: filteredRiders,
                returnRiders: filteredReturnRiders,
              };
            }
            if (isKeepingSharedVehicle) {
              return {
                ...slot,
                driverMemberId: nextDriverMemberId,
                customDriverName: "",
                riders: filteredRiders,
                returnRiders: filteredReturnRiders,
              };
            }
            return {
              ...slot,
              driverMemberId: nextDriverMemberId,
              customDriverName: "",
              carId: preferredCar?.carId || null,
              customCarName: preferredCar?.name || slot.customCarName,
              plate: preferredCar?.numberPlate || slot.plate,
              capacity: preferredCar ? preferredCar.capacity : slot.capacity,
              isCargo: preferredCar ? preferredCar.isCargo : slot.isCargo,
              isBus: preferredCar ? Boolean(preferredCar.isBus) : slot.isBus,
              riders: filteredRiders,
              returnRiders: filteredReturnRiders,
            };
          }),
          teamEquipmentList
        )
      );
    },
    [ctx?.drivers, ctx?.sharedCars, teamEquipmentList]
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

  // 📦 道具・備品の割当トグル（他号車に割当済みの場合は重複させずこの号車へ移動）
  const handleToggleEquipmentInSlot = useCallback(
    (
      localKey: string,
      targetCarNum: number,
      eqItem: SimpleCarpoolEquipmentOption
    ) => {
      const prevOwnerCarNum = assignmentLookup.equipmentCarNumById.get(
        eqItem.id
      );
      setDraftCars((prev) =>
        prev.map((slot) => {
          if (slot.localKey === localKey) {
            const exists = slot.equipmentIds.includes(eqItem.id);
            return {
              ...slot,
              equipmentIds: exists
                ? slot.equipmentIds.filter((id) => id !== eqItem.id)
                : [...slot.equipmentIds, eqItem.id],
            };
          }
          if (slot.equipmentIds.includes(eqItem.id)) {
            return {
              ...slot,
              equipmentIds: slot.equipmentIds.filter((id) => id !== eqItem.id),
            };
          }
          return slot;
        })
      );
      if (prevOwnerCarNum && prevOwnerCarNum !== targetCarNum) {
        toast.info(
          `「${eqItem.name}」を${prevOwnerCarNum}号車から${targetCarNum}号車へ移しました`
        );
      }
    },
    [assignmentLookup.equipmentCarNumById]
  );

  // 📦 道具車へ未割当の推奨重量物を1タップ一括セット
  const handleBulkAssignHeavyEquipments = useCallback(
    (localKey: string, targetCarNum: number) => {
      if (unassignedHeavyEquipments.length === 0) {
        toast.info("未割当の重量物はありません");
        return;
      }
      const addIds = unassignedHeavyEquipments.map((eq) => eq.id);
      setDraftCars((prev) =>
        prev.map((slot) => {
          if (slot.localKey !== localKey) return slot;
          const merged = [...slot.equipmentIds];
          for (const id of addIds) {
            if (!merged.includes(id)) {
              merged.push(id);
            }
          }
          return {
            ...slot,
            equipmentIds: merged,
          };
        })
      );
      toast.success(
        `${targetCarNum}号車に推奨重量物（${addIds.length}点）を一括セットしました！`
      );
    },
    [unassignedHeavyEquipments]
  );

  // 📦 道具セットを全号車へおまかせ自動振り分け（既に全品積載済みならワンタップ解除）
  const handleSmartApplySet = useCallback(
    (setObj: EquipmentSetItem) => {
      const targetIds = setObj.equipmentIds.filter((id) =>
        validEquipmentIdSet.has(id)
      );
      if (targetIds.length === 0) {
        toast.info("このセットに有効な道具が含まれていません");
        return;
      }
      if (draftCars.length === 0) {
        toast.error("先に号車を追加してください");
        return;
      }

      const allAlreadyAssigned = targetIds.every((id) =>
        assignmentLookup.equipmentCarNumById.has(id)
      );
      if (allAlreadyAssigned) {
        const removeSet = new Set(targetIds);
        setDraftCars((prev) =>
          prev.map((slot) => ({
            ...slot,
            equipmentIds: slot.equipmentIds.filter((id) => !removeSet.has(id)),
          }))
        );
        toast.info(`「${setObj.name}」の道具割当を解除しました`);
        return;
      }

      const { equipmentIdsBySlotKey, newlyPlacedCount } =
        distributeEquipmentsAcrossCarSlots({
          targetEquipmentIds: targetIds,
          slots: draftCars.map(toCalcCarSlot),
          equipments: teamEquipmentList,
        });

      setDraftCars((prev) =>
        prev.map((slot) => ({
          ...slot,
          equipmentIds:
            equipmentIdsBySlotKey.get(slot.localKey) || slot.equipmentIds,
        }))
      );
      toast.success(
        `「${setObj.name}」（${newlyPlacedCount}品目）を各号車へ自動振り分けしました！`
      );
    },
    [
      validEquipmentIdSet,
      draftCars,
      assignmentLookup.equipmentCarNumById,
      teamEquipmentList,
    ]
  );

  // 📦 特定の1号車へ道具セットを一括積載（既にその号車へ全品積載済みなら解除）
  const handleAssignSetToSingleCar = useCallback(
    (localKey: string, targetCarNum: number, setObj: EquipmentSetItem) => {
      const targetIds = setObj.equipmentIds.filter((id) =>
        validEquipmentIdSet.has(id)
      );
      if (targetIds.length === 0) {
        toast.info("このセットに有効な道具が含まれていません");
        return;
      }

      const targetSlot = draftCars.find((s) => s.localKey === localKey);
      if (!targetSlot) return;

      const allInThisSlot = targetIds.every((id) =>
        targetSlot.equipmentIds.includes(id)
      );
      const targetSet = new Set(targetIds);

      if (allInThisSlot) {
        setDraftCars((prev) =>
          prev.map((slot) =>
            slot.localKey === localKey
              ? {
                  ...slot,
                  equipmentIds: slot.equipmentIds.filter(
                    (id) => !targetSet.has(id)
                  ),
                }
              : slot
          )
        );
        toast.info(`${targetCarNum}号車から「${setObj.name}」を外しました`);
        return;
      }

      setDraftCars((prev) =>
        prev.map((slot) => {
          if (slot.localKey === localKey) {
            const merged = [...slot.equipmentIds];
            for (const id of targetIds) {
              if (!merged.includes(id)) {
                merged.push(id);
              }
            }
            return { ...slot, equipmentIds: merged };
          }
          if (slot.equipmentIds.some((id) => targetSet.has(id))) {
            return {
              ...slot,
              equipmentIds: slot.equipmentIds.filter(
                (id) => !targetSet.has(id)
              ),
            };
          }
          return slot;
        })
      );
      toast.success(
        `${targetCarNum}号車に「${setObj.name}」（${targetIds.length}品目）を一括積載しました！`
      );
    },
    [validEquipmentIdSet, draftCars]
  );

  // 🚗 常設車両・保管担当メンバーの号車へ未割当備品を自動セット
  const handleApplyDefaultEquipments = useCallback(() => {
    const { equipmentIdsBySlotKey, addedCount } =
      applyDefaultEquipmentsToCarSlots({
        slots: draftCars.map(toCalcCarSlot),
        equipments: teamEquipmentList,
      });
    if (addedCount === 0) {
      toast.info("常設・担当一致の未割当道具はありません");
      return;
    }
    setDraftCars((prev) =>
      prev.map((slot) => ({
        ...slot,
        equipmentIds:
          equipmentIdsBySlotKey.get(slot.localKey) || slot.equipmentIds,
      }))
    );
    toast.success(`${addedCount}点の常設・担当道具を該当号車へセットしました！`);
  }, [draftCars, teamEquipmentList]);

  // 🔄 前回の配車データから道具割当を引き継ぐ（車両/運転手一致 ➔ 残りはスマート自動配分）
  const handleRestorePreviousEquipments = useCallback(() => {
    const snapshot = ctx?.previousEquipmentSnapshot;
    if (!snapshot || snapshot.cars.length === 0) {
      toast.info("引き継げる前回の道具記録がありません");
      return;
    }
    if (draftCars.length === 0) {
      toast.error("先に号車を追加してください");
      return;
    }

    const step1 = applyPreviousCarpoolEquipments({
      slots: draftCars.map(toCalcCarSlot),
      previousCars: snapshot.cars,
      validEquipmentIds: validEquipmentIdSet,
    });

    const intermediateSlots: CarSlotForEquipmentCalc[] = draftCars.map((s) => ({
      ...toCalcCarSlot(s),
      equipmentIds:
        step1.equipmentIdsBySlotKey.get(s.localKey) || [...s.equipmentIds],
    }));

    const allPrevIds = Array.from(
      new Set(
        snapshot.cars
          .flatMap((c) => c.equipmentIds)
          .filter((id) => validEquipmentIdSet.has(id))
      )
    );

    const step2 = distributeEquipmentsAcrossCarSlots({
      targetEquipmentIds: allPrevIds,
      slots: intermediateSlots,
      equipments: teamEquipmentList,
    });

    const totalPlaced = step1.restoredCount + step2.newlyPlacedCount;
    if (totalPlaced === 0) {
      toast.info("前回の配車で使用した道具はすべて積載済みです");
      return;
    }

    setDraftCars((prev) =>
      prev.map((slot) => ({
        ...slot,
        equipmentIds:
          step2.equipmentIdsBySlotKey.get(slot.localKey) || slot.equipmentIds,
      }))
    );
    toast.success(
      `前回（${snapshot.dateLabel}）の道具（${totalPlaced}品目）を引き継ぎました！`
    );
  }, [
    ctx?.previousEquipmentSnapshot,
    draftCars,
    validEquipmentIdSet,
    teamEquipmentList,
  ]);

  // 🧹 全号車の道具割当を一括クリア
  const handleClearAllEquipments = useCallback(() => {
    setDraftCars((prev) =>
      prev.map((slot) =>
        slot.equipmentIds.length > 0 ? { ...slot, equipmentIds: [] } : slot
      )
    );
    setIsSavingSetOpen(false);
    toast.info("全号車の道具割当をクリアしました");
  }, []);

  // 💾 現在積載中の道具の組み合わせをマイセットとして即保存
  const handleSaveCurrentAsSet = useCallback(async () => {
    const cleanName = quickSetName.trim();
    if (!cleanName) {
      toast.error("保存するセット名（例: 硬式戦セット / OP戦セット）を入力してください");
      return;
    }
    const allAssignedIds = Array.from(
      new Set(draftCars.flatMap((c) => c.equipmentIds))
    ).filter((id) => validEquipmentIdSet.has(id));

    if (allAssignedIds.length === 0) {
      toast.error("1つ以上の道具を積載してから保存してください");
      return;
    }

    setIsSavingQuickSet(true);
    try {
      const res = await fetch("/api/liff/carpool-simple/save-equipment-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: teamId || "demo-team",
          name: cleanName,
          equipmentIds: allAssignedIds,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        isDemo?: boolean;
        savedSet?: EquipmentSetItem;
        equipmentSets?: EquipmentSetItem[];
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "セットの保存に失敗しました");
        return;
      }

      setCtx((prev) => {
        if (!prev) return prev;
        if (json.isDemo && json.savedSet) {
          const current = prev.equipmentSets || [];
          const sameIdx = current.findIndex(
            (s) =>
              s.name.toLowerCase() === json.savedSet!.name.toLowerCase()
          );
          const nextSets =
            sameIdx >= 0
              ? current.map((s, idx) =>
                  idx === sameIdx ? json.savedSet! : s
                )
              : [...current, json.savedSet];
          return { ...prev, equipmentSets: nextSets };
        }
        return {
          ...prev,
          equipmentSets: json.equipmentSets || prev.equipmentSets || [],
        };
      });

      invalidateLiffApiCache("/api/liff/admin/mgmt/equipments", {
        clearLastKnownGood: true,
      });
      setIsSavingSetOpen(false);
      setQuickSetName("");
      toast.success(
        `道具セット「${cleanName}」（${allAssignedIds.length}品目）を保存しました！`
      );
    } catch {
      toast.error("通信エラーによりセットを保存できませんでした");
    } finally {
      setIsSavingQuickSet(false);
    }
  }, [quickSetName, draftCars, validEquipmentIdSet, teamId]);

  // 🔄 帰り便の個別変更トグル（ON時に空なら現在の行き便メンバーから初期コピー・他号車帰り便との重複は除外）
  const handleToggleReturnDiff = useCallback((localKey: string) => {
    setDraftCars((prev) => {
      const target = prev.find((c) => c.localKey === localKey);
      if (!target) return prev;
      const nextHasDiff = !target.hasReturnDiff;
      if (!nextHasDiff) {
        setOpenReturnPickerCarKey((curr) => (curr === localKey ? null : curr));
        return prev.map((c) =>
          c.localKey === localKey ? { ...c, hasReturnDiff: false } : c
        );
      }

      const occupiedOtherReturnKeys = new Set<string>();
      prev.forEach((c) => {
        if (c.localKey === localKey) return;
        const eff = c.hasReturnDiff ? c.returnRiders : c.riders;
        eff.forEach((r) => occupiedOtherReturnKeys.add(`${r.type}:${r.id}`));
      });

      const baseReturn =
        target.returnRiders.length > 0
          ? target.returnRiders.filter(
              (r) => !occupiedOtherReturnKeys.has(`${r.type}:${r.id}`)
            )
          : target.riders
              .filter((r) => !occupiedOtherReturnKeys.has(`${r.type}:${r.id}`))
              .map((r) => ({ ...r }));

      setOpenReturnPickerCarKey(localKey);
      return prev.map((c) =>
        c.localKey === localKey
          ? {
              ...c,
              hasReturnDiff: true,
              returnRiders: baseReturn,
            }
          : c
      );
    });
  }, []);

  const handleToggleReturnRiderInSlot = useCallback(
    (localKey: string, item: DraftRiderItem) => {
      setDraftCars((prev) =>
        prev.map((slot) => {
          if (slot.localKey !== localKey) return slot;
          const exists = slot.returnRiders.some(
            (r) => r.type === item.type && r.id === item.id
          );
          if (exists) {
            return {
              ...slot,
              returnRiders: slot.returnRiders.filter(
                (r) => !(r.type === item.type && r.id === item.id)
              ),
            };
          }
          return {
            ...slot,
            returnRiders: [...slot.returnRiders, item],
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
          isBus: slot.isBus,
          riders: slot.riders.map((r) => ({ type: r.type, id: r.id })),
          hasReturnDiff: slot.hasReturnDiff,
          returnRiders: slot.hasReturnDiff
            ? slot.returnRiders.map(({ type, id }) => ({ type, id }))
            : undefined,
          equipmentIds: slot.equipmentIds,
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

      invalidateLiffApiCache("/api/liff/carpool", { clearLastKnownGood: true });
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

              {/* ==================== 2.5 道具セット一括配分 ＆ 時短割当バー ==================== */}
              {teamEquipmentList.length > 0 && draftCars.length > 0 && (
                <section className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
                  <div className="px-3.5 py-2 bg-[#0f172a] text-white border-b-[3px] border-amber-500 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Package className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-xs font-black">
                        道具セット一括配分
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700 text-[10px] font-black tabular-nums">
                        積載 {totalAssignedEquipments}/{teamEquipmentList.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {totalAssignedEquipments > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setIsSavingSetOpen((prev) => !prev)
                            }
                            className={`px-2 py-0.5 rounded text-[11px] font-black inline-flex items-center gap-1 cursor-pointer transition-colors ${
                              isSavingSetOpen
                                ? "bg-amber-400 text-slate-950"
                                : "bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700"
                            }`}
                          >
                            <BookmarkPlus className="w-3 h-3" />
                            <span>今の道具をセット保存</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleClearAllEquipments}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-black cursor-pointer transition-colors"
                          >
                            全解除
                          </button>
                        </>
                      )}
                      <Link
                        href="/liff/admin/equipments"
                        onClick={onClose}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-black inline-flex items-center gap-1"
                      >
                        <span>セット管理</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </Link>
                    </div>
                  </div>

                  {/* 現在積載中の道具をマイセットとして即保存するドロワー */}
                  {isSavingSetOpen && totalAssignedEquipments > 0 && (
                    <div className="p-3 bg-amber-500/10 border-b border-border space-y-2 text-xs">
                      <p className="text-[11px] font-black text-foreground">
                        現在積載中の道具（{totalAssignedEquipments}
                        品目）をマイセットとして保存します
                      </p>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={quickSetName}
                          onChange={(e) => setQuickSetName(e.target.value)}
                          placeholder="例: 硬式戦セット / OP戦セット"
                          maxLength={40}
                          className="flex-1 h-9 px-3 rounded-xl border border-border bg-card text-foreground text-xs font-bold"
                        />
                        <button
                          type="button"
                          disabled={isSavingQuickSet}
                          onClick={() => void handleSaveCurrentAsSet()}
                          className="h-9 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black inline-flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-60"
                        >
                          {isSavingQuickSet ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>保存</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsSavingSetOpen(false)}
                          className="h-9 px-2.5 rounded-xl border border-border bg-card text-muted-foreground text-xs font-bold shrink-0 cursor-pointer"
                        >
                          閉じる
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="p-3 space-y-2.5 text-xs">
                    {orderedEquipmentSets.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold text-muted-foreground">
                          セットをタップすると、道具車・常設車・空席バランスに合わせて全号車へ自動振り分けします
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {orderedEquipmentSets.map((setObj) => {
                            const validIds = setObj.equipmentIds.filter((id) =>
                              validEquipmentIdSet.has(id)
                            );
                            const isFullyApplied =
                              validIds.length > 0 &&
                              validIds.every((id) =>
                                assignmentLookup.equipmentCarNumById.has(id)
                              );
                            const isRecommended = recommendedSetIds.has(
                              setObj.id
                            );
                            const catMeta = getEquipmentSetCategoryMeta(
                              setObj.category
                            );
                            const iconEmoji =
                              catMeta.shortBadge.split(" ")[0] || "📦";

                            return (
                              <button
                                key={setObj.id}
                                type="button"
                                onClick={() => handleSmartApplySet(setObj)}
                                className={`px-2.5 py-1.5 rounded-xl border text-xs font-black inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                                  isFullyApplied
                                    ? "bg-amber-500 text-slate-950 border-amber-600 shadow-2xs"
                                    : isRecommended
                                    ? "bg-[#0f172a] hover:bg-slate-800 text-white border-[#0f172a]"
                                    : "bg-muted hover:bg-muted/80 text-foreground border-border"
                                }`}
                              >
                                <span>{iconEmoji}</span>
                                <span>
                                  {setObj.name}（{validIds.length}）
                                </span>
                                {isFullyApplied ? (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-950 text-amber-300 text-[10px] font-black inline-flex items-center gap-0.5">
                                    <Check className="w-2.5 h-2.5" />
                                    <span>適用中</span>
                                  </span>
                                ) : isRecommended ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black">
                                    おすすめ
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-muted/60 border border-border">
                        <span className="text-[11px] font-bold text-muted-foreground">
                          硬式戦セット・OP戦セット等を作成すると1タップで道具配分できます
                        </span>
                        <Link
                          href="/liff/admin/equipments"
                          onClick={onClose}
                          className="px-2.5 py-1.5 rounded-lg bg-[#0f172a] text-white text-[11px] font-black inline-flex items-center gap-1 shrink-0"
                        >
                          <span>＋ セット作成</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    )}

                    {(ctx?.previousEquipmentSnapshot ||
                      pendingDefaultEquipCount > 0) && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
                        {ctx?.previousEquipmentSnapshot && (
                          <button
                            type="button"
                            onClick={handleRestorePreviousEquipments}
                            className="px-2.5 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[11px] font-black inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span className="truncate max-w-[230px]">
                              前回（{ctx.previousEquipmentSnapshot.dateLabel}{" "}
                              {ctx.previousEquipmentSnapshot.eventTitle}
                              ）の道具を引継
                            </span>
                          </button>
                        )}
                        {pendingDefaultEquipCount > 0 && (
                          <button
                            type="button"
                            onClick={handleApplyDefaultEquipments}
                            className="px-2.5 py-1.5 rounded-xl border border-teal-600/35 bg-teal-500/10 hover:bg-teal-500/20 text-teal-900 dark:text-teal-200 text-[11px] font-black inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span>
                              常設・担当車へ自動セット（+
                              {pendingDefaultEquipCount}点）
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

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

                  const driverCars = selectedDriver?.cars || [];
                  const driverCarIds = new Set(driverCars.map((dc) => dc.carId));
                  const extraSharedCars = (ctx?.sharedCars || []).filter(
                    (sc) => !driverCarIds.has(sc.carId)
                  );
                  const hasSelectableVehicles =
                    driverCars.length > 0 || extraSharedCars.length > 0;

                  return (
                    <section
                      key={slot.localKey}
                      className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden"
                    >
                      {/* 号車ヘッダー（A-3 上帯ダークキャップ） */}
                      <div className="px-3.5 py-2.5 bg-[#0f172a] text-white border-b-[3px] border-primary flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                                prev.map((c) => {
                                  if (c.localKey !== slot.localKey) return c;
                                  const nextBus = !c.isBus;
                                  return {
                                    ...c,
                                    isBus: nextBus,
                                    isCargo: nextBus ? false : c.isCargo,
                                    capacity:
                                      nextBus && c.capacity <= 8
                                        ? 20
                                        : c.capacity,
                                  };
                                })
                              )
                            }
                            className={`px-2 py-0.5 rounded text-[11px] font-black flex items-center gap-1 cursor-pointer transition-colors ${
                              slot.isBus
                                ? "bg-teal-400 text-slate-950"
                                : "bg-slate-800 text-slate-300 border border-slate-700"
                            }`}
                          >
                            <Bus className="w-3 h-3" />
                            <span>バス</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftCars((prev) =>
                                prev.map((c) =>
                                  c.localKey === slot.localKey
                                    ? {
                                        ...c,
                                        isCargo: !c.isCargo,
                                        isBus: !c.isCargo ? false : c.isBus,
                                      }
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

                        <div className="flex items-center gap-2 shrink-0">
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
                                      d.cars[0].isBus
                                        ? "（バス）"
                                        : d.cars[0].isCargo
                                        ? "（道具車）"
                                        : ""
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
                                  "名簿にない保護者・スタッフ・バス運転手の氏名を手動で入力します",
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
                              placeholder="運転手名を入力（例: スタッフ名 / バス運転手）"
                              className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                            />
                          )}
                        </div>

                        {/* 車種 ＆ 乗車定員ステッパー */}
                        <div className="grid grid-cols-12 gap-2 items-start">
                          <div className="col-span-7 space-y-1.5">
                            <label className="block text-[11px] font-black text-muted-foreground">
                              車両選択・車両名（任意）
                            </label>
                            {hasSelectableVehicles && (
                              <LiffSelect
                                value={slot.carId || "__manual__"}
                                onChange={(val) => {
                                  if (!val || val === "__manual__") {
                                    setDraftCars((prev) =>
                                      prev.map((c) =>
                                        c.localKey === slot.localKey
                                          ? { ...c, carId: null }
                                          : c
                                      )
                                    );
                                    return;
                                  }
                                  const foundDriverCar = driverCars.find(
                                    (mc) => mc.carId === val
                                  );
                                  const foundSharedCar = extraSharedCars.find(
                                    (sc) => sc.carId === val
                                  );
                                  const chosen =
                                    foundDriverCar || foundSharedCar || null;
                                  setDraftCars((prev) =>
                                    withAutoDefaultEquipments(
                                      prev.map((c) =>
                                        c.localKey === slot.localKey
                                          ? {
                                              ...c,
                                              carId: val,
                                              customCarName: chosen?.name || "",
                                              plate: chosen?.numberPlate || "",
                                              capacity: chosen
                                                ? chosen.capacity
                                                : c.capacity,
                                              isCargo: chosen
                                                ? Boolean(chosen.isCargo)
                                                : c.isCargo,
                                              isBus: chosen
                                                ? Boolean(chosen.isBus)
                                                : c.isBus,
                                            }
                                          : c
                                      ),
                                      teamEquipmentList
                                    )
                                  );
                                }}
                                options={[
                                  ...driverCars.map((mc) => ({
                                    value: mc.carId,
                                    label:
                                      mc.capacity === 0
                                        ? `${mc.name}（荷物専用・0席）`
                                        : `${mc.name}（定員${mc.capacity}）`,
                                    badge: mc.isBus
                                      ? "バス"
                                      : mc.isCargo
                                      ? "道具車"
                                      : undefined,
                                    badgeTone: (mc.isBus
                                      ? "teal"
                                      : "amber") as LiffSelectBadgeTone,
                                    sublabel: mc.numberPlate
                                      ? `ナンバー: ${mc.numberPlate}`
                                      : undefined,
                                    group: "運転手の登録車両",
                                  })),
                                  ...extraSharedCars.map((sc) => {
                                    const usedInNum =
                                      assignmentLookup.carNumBySelectedCarId.get(
                                        sc.carId
                                      );
                                    const lockedOther = Boolean(
                                      usedInNum && usedInNum !== carNumber
                                    );
                                    return {
                                      value: sc.carId,
                                      label:
                                        sc.capacity === 0
                                          ? `${sc.name}（荷物専用・0席）`
                                          : `${sc.name}（定員${sc.capacity}）`,
                                      badge: lockedOther
                                        ? `${usedInNum}号車で選択中`
                                        : sc.isBus
                                        ? "バス・共有車"
                                        : sc.isCargo
                                        ? "共有道具車"
                                        : "チーム共有車",
                                      badgeTone: (lockedOther
                                        ? "slate"
                                        : sc.isBus
                                        ? "teal"
                                        : "amber") as LiffSelectBadgeTone,
                                      sublabel: lockedOther
                                        ? `他の号車（${usedInNum}号車）で使用中`
                                        : sc.numberPlate
                                        ? `ナンバー: ${sc.numberPlate}`
                                        : "チーム共有登録車両",
                                      disabled: lockedOther,
                                      group: "🏢 チーム共有車両（バス・共有道具車）",
                                    };
                                  }),
                                  {
                                    value: "__manual__",
                                    label: "＋ 車両名を手入力する",
                                    badge: "手入力",
                                    badgeTone: "slate" as const,
                                    group: "その他",
                                  },
                                ]}
                                title={`${carNumber}号車の車両を選択`}
                                accent="teal"
                                size="sm"
                                searchable={
                                  driverCars.length + extraSharedCars.length > 5
                                }
                                className="w-full h-9 bg-background"
                              />
                            )}
                            {(!hasSelectableVehicles || slot.carId === null) && (
                              <input
                                type="text"
                                value={slot.customCarName}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftCars((prev) =>
                                    prev.map((c) =>
                                      c.localKey === slot.localKey
                                        ? {
                                            ...c,
                                            carId: null,
                                            customCarName: val,
                                          }
                                        : c
                                    )
                                  );
                                }}
                                placeholder={
                                  slot.isBus
                                    ? "例: マイクロバス 1号車"
                                    : slot.isCargo
                                    ? "例: ハイエース（道具車）"
                                    : "例: ミニバン (白)"
                                }
                                className="w-full h-9 px-2.5 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                              />
                            )}
                          </div>

                          <div className="col-span-5 space-y-1.5">
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
                                            capacity: Math.max(
                                              c.isCargo ? 0 : 1,
                                              c.capacity - 1
                                            ),
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
                                {slot.capacity === 0
                                  ? "0名(荷専)"
                                  : `${slot.capacity}名`}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftCars((prev) =>
                                    prev.map((c) =>
                                      c.localKey === slot.localKey
                                        ? {
                                            ...c,
                                            capacity: Math.min(
                                              60,
                                              c.capacity + 1
                                            ),
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

                        {/* バス選択時のワンタップ座席数プリセット */}
                        {slot.isBus && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="text-[11px] font-black text-muted-foreground">
                              🚌 バス座席プリセット:
                            </span>
                            {[18, 22, 24, 28, 45].map((presetCap) => (
                              <button
                                key={presetCap}
                                type="button"
                                onClick={() =>
                                  setDraftCars((prev) =>
                                    prev.map((c) =>
                                      c.localKey === slot.localKey
                                        ? { ...c, capacity: presetCap }
                                        : c
                                    )
                                  )
                                }
                                className={`px-2 py-0.5 rounded-lg border text-[11px] font-black tabular-nums cursor-pointer transition-colors ${
                                  slot.capacity === presetCap
                                    ? "bg-teal-600 text-white border-teal-600"
                                    : "bg-muted text-foreground border-border hover:bg-muted/80"
                                }`}
                              >
                                {presetCap}席
                              </button>
                            ))}
                          </div>
                        )}

                        {/* 道具車選択時のワンタップ定員プリセット */}
                        {slot.isCargo && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="text-[11px] font-black text-muted-foreground">
                              📦 道具車プリセット:
                            </span>
                            {[0, 1, 2, 4, 5].map((presetCap) => (
                              <button
                                key={presetCap}
                                type="button"
                                onClick={() =>
                                  setDraftCars((prev) =>
                                    prev.map((c) =>
                                      c.localKey === slot.localKey
                                        ? { ...c, capacity: presetCap }
                                        : c
                                    )
                                  )
                                }
                                className={`px-2 py-0.5 rounded-lg border text-[11px] font-black tabular-nums cursor-pointer transition-colors ${
                                  slot.capacity === presetCap
                                    ? "bg-amber-500 text-slate-950 border-amber-500"
                                    : "bg-muted text-foreground border-border hover:bg-muted/80"
                                }`}
                              >
                                {presetCap === 0
                                  ? "荷物専用(0席)"
                                  : `${presetCap}席`}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* 同乗者チップ一覧 ＆ ピッカー開閉ボタン（行き便 / 基本） */}
                        <div className="pt-2 border-t border-border space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-black text-muted-foreground">
                              {slot.hasReturnDiff
                                ? `行き便の同乗メンバー（${slot.riders.length}名）`
                                : `同乗メンバー（${slot.riders.length}名）`}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setOpenPickerCarKey((prev) =>
                                  prev === slot.localKey ? null : slot.localKey
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-black flex items-center gap-1 cursor-pointer shrink-0"
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

                        {/* ==================== 📦 積載する道具・備品ピッカー ==================== */}
                        <div
                          className={
                            slot.isCargo
                              ? "p-2.5 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 space-y-2"
                              : "pt-2 border-t border-border space-y-2"
                          }
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <Package
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  slot.isCargo
                                    ? "text-amber-700 dark:text-amber-300"
                                    : "text-muted-foreground"
                                }`}
                              />
                              <span
                                className={`text-[11px] font-black ${
                                  slot.isCargo
                                    ? "text-amber-900 dark:text-amber-200"
                                    : "text-muted-foreground"
                                }`}
                              >
                                📦 積載する道具・備品（{slot.equipmentIds.length}点）
                              </span>
                            </div>

                            {slot.isCargo ? (
                              teamEquipmentList.length > 0 && (
                                <button
                                  type="button"
                                  disabled={unassignedHeavyEquipments.length === 0}
                                  onClick={() =>
                                    handleBulkAssignHeavyEquipments(
                                      slot.localKey,
                                      carNumber
                                    )
                                  }
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black inline-flex items-center gap-1 transition-colors ${
                                    unassignedHeavyEquipments.length > 0
                                      ? "bg-amber-500 hover:bg-amber-600 text-slate-950 cursor-pointer shadow-2xs"
                                      : "bg-muted text-muted-foreground border border-border opacity-70 cursor-not-allowed"
                                  }`}
                                >
                                  <Sparkles className="w-3 h-3 shrink-0" />
                                  <span>
                                    {unassignedHeavyEquipments.length > 0
                                      ? `推奨重量物を一括セット（${unassignedHeavyEquipments.length}点）`
                                      : "推奨重量物は割当済"}
                                  </span>
                                </button>
                              )
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenEquipCarKey((prev) =>
                                    prev === slot.localKey ? null : slot.localKey
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg border border-border bg-muted hover:bg-muted/80 text-foreground text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>
                                  {openEquipCarKey === slot.localKey
                                    ? "道具リストを閉じる"
                                    : "道具を分担・選択"}
                                </span>
                                {openEquipCarKey === slot.localKey ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </div>

                          {/* 通常車でパネル閉じている場合でも選択済み道具チップを表示 */}
                          {!slot.isCargo &&
                            openEquipCarKey !== slot.localKey &&
                            slot.equipmentIds.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {slot.equipmentIds.map((eqId) => {
                                  const eqObj = equipmentById.get(eqId);
                                  if (!eqObj) return null;
                                  return (
                                    <button
                                      key={eqId}
                                      type="button"
                                      onClick={() =>
                                        handleToggleEquipmentInSlot(
                                          slot.localKey,
                                          carNumber,
                                          eqObj
                                        )
                                      }
                                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/35 text-xs font-black inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>
                                        {eqObj.name}
                                        {eqObj.quantity > 1
                                          ? ` ×${eqObj.quantity}`
                                          : ""}
                                      </span>
                                      <X className="w-3 h-3 opacity-70" />
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                          {/* 道具選択パネル（道具車は常時展開、通常車は開閉式） */}
                          {(slot.isCargo || openEquipCarKey === slot.localKey) && (
                            <div className="space-y-1.5">
                              {teamEquipmentList.length === 0 ? (
                                <div className="p-2.5 rounded-xl bg-card border border-border flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold text-muted-foreground">
                                    道具マスタ未登録（共有道具を登録すると1タップで積載割当できます）
                                  </span>
                                  <Link
                                    href="/liff/admin/equipments"
                                    onClick={onClose}
                                    className="px-2.5 py-1.5 rounded-lg bg-[#0f172a] text-white text-[11px] font-black inline-flex items-center gap-1 shrink-0"
                                  >
                                    <span>道具マスタ登録</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </Link>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {orderedEquipmentSets.length > 0 && (
                                    <div className="flex items-center gap-1.5 flex-wrap pb-1 border-b border-border">
                                      <span className="text-[10px] font-black text-muted-foreground inline-flex items-center gap-1 shrink-0">
                                        <Layers className="w-3 h-3 text-amber-600" />
                                        <span>この車にセット積載:</span>
                                      </span>
                                      {orderedEquipmentSets.map((setObj) => {
                                        const validIds =
                                          setObj.equipmentIds.filter((id) =>
                                            validEquipmentIdSet.has(id)
                                          );
                                        if (validIds.length === 0) return null;
                                        const allInThisSlot = validIds.every(
                                          (id) =>
                                            slot.equipmentIds.includes(id)
                                        );
                                        return (
                                          <button
                                            key={setObj.id}
                                            type="button"
                                            onClick={() =>
                                              handleAssignSetToSingleCar(
                                                slot.localKey,
                                                carNumber,
                                                setObj
                                              )
                                            }
                                            className={`px-2 py-0.5 rounded-lg border text-[11px] font-black inline-flex items-center gap-1 cursor-pointer transition-colors ${
                                              allInThisSlot
                                                ? "bg-amber-500 text-slate-950 border-amber-600"
                                                : "bg-card hover:bg-muted text-foreground border-border"
                                            }`}
                                          >
                                            <span>
                                              {allInThisSlot ? "✓ " : "＋ "}
                                              {setObj.name}({validIds.length})
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                                    {teamEquipmentList.map((eq) => {
                                      const assignedEqCarNum =
                                        assignmentLookup.equipmentCarNumById.get(
                                          eq.id
                                        );
                                      const inThisCar =
                                        assignedEqCarNum === carNumber;
                                      const inOtherCar = Boolean(
                                        assignedEqCarNum &&
                                          assignedEqCarNum !== carNumber
                                      );
                                      const isDefaultForThisCar = Boolean(
                                        (eq.defaultCarId &&
                                          slot.carId &&
                                          eq.defaultCarId === slot.carId) ||
                                          (eq.defaultMemberId &&
                                            slot.driverMemberId &&
                                            slot.driverMemberId !==
                                              "__custom__" &&
                                            eq.defaultMemberId ===
                                              slot.driverMemberId)
                                      );
                                      return (
                                        <button
                                          key={eq.id}
                                          type="button"
                                          onClick={() =>
                                            handleToggleEquipmentInSlot(
                                              slot.localKey,
                                              carNumber,
                                              eq
                                            )
                                          }
                                          className={`px-2.5 py-2 rounded-xl border text-left text-xs flex items-center justify-between gap-1.5 cursor-pointer transition-colors ${
                                            inThisCar
                                              ? "bg-amber-500 text-slate-950 border-amber-500 font-black"
                                              : inOtherCar
                                              ? "bg-card/70 text-muted-foreground border-border hover:bg-muted/70 font-bold"
                                              : "bg-card text-foreground border-border hover:bg-muted/60 font-bold"
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="truncate">
                                              {eq.name}
                                              {eq.quantity > 1
                                                ? ` ×${eq.quantity}`
                                                : ""}
                                            </span>
                                            {isDefaultForThisCar && (
                                              <span
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 ${
                                                  inThisCar
                                                    ? "bg-slate-950 text-teal-300"
                                                    : "bg-teal-500/15 text-teal-800 dark:text-teal-300"
                                                }`}
                                              >
                                                常設
                                              </span>
                                            )}
                                            {eq.isHeavy && (
                                              <span
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 ${
                                                  inThisCar
                                                    ? "bg-slate-950 text-amber-300"
                                                    : "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                                                }`}
                                              >
                                                重量
                                              </span>
                                            )}
                                          </div>
                                          {inThisCar ? (
                                            <Check className="w-3.5 h-3.5 shrink-0" />
                                          ) : inOtherCar ? (
                                            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border text-[10px] font-black shrink-0">
                                              {assignedEqCarNum}号車に積載
                                            </span>
                                          ) : null}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* ==================== 🔄 帰り便の乗車メンバー個別変更 ==================== */}
                        <div className="pt-2 border-t border-border space-y-2">
                          <button
                            type="button"
                            onClick={() => handleToggleReturnDiff(slot.localKey)}
                            className={`w-full px-3 py-2 rounded-xl border text-left text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                              slot.hasReturnDiff
                                ? "bg-teal-600/12 border-teal-600/40 text-teal-900 dark:text-teal-200 font-black"
                                : "bg-muted/60 border-border text-muted-foreground hover:bg-muted font-bold"
                            }`}
                          >
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                              <RefreshCw
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  slot.hasReturnDiff
                                    ? "text-teal-600 dark:text-teal-400"
                                    : "text-muted-foreground"
                                }`}
                              />
                              <span className="truncate">
                                🔄 帰り便の乗車メンバーを個別変更する
                              </span>
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${
                                slot.hasReturnDiff
                                  ? "bg-teal-600 text-white"
                                  : "bg-card text-muted-foreground border border-border"
                              }`}
                            >
                              {slot.hasReturnDiff ? "個別設定ON" : "行き便と同じ"}
                            </span>
                          </button>

                          {slot.hasReturnDiff && (
                            <div className="p-2.5 rounded-xl border border-teal-600/30 bg-teal-500/5 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-black text-teal-800 dark:text-teal-200">
                                  帰り便メンバー（{slot.returnRiders.length}/
                                  {slot.capacity}席）
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenReturnPickerCarKey((prev) =>
                                      prev === slot.localKey
                                        ? null
                                        : slot.localKey
                                    )
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-teal-600 text-white text-[11px] font-black inline-flex items-center gap-1 cursor-pointer shrink-0"
                                >
                                  <UserPlus className="w-3 h-3" />
                                  <span>
                                    {openReturnPickerCarKey === slot.localKey
                                      ? "パネルを閉じる"
                                      : `帰り便を選ぶ（残${Math.max(
                                          0,
                                          slot.capacity -
                                            slot.returnRiders.length
                                        )}席）`}
                                  </span>
                                  {openReturnPickerCarKey === slot.localKey ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                </button>
                              </div>

                              {slot.returnRiders.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {slot.returnRiders.map((rr) => (
                                    <button
                                      key={`ret-${rr.type}-${rr.id}`}
                                      type="button"
                                      onClick={() =>
                                        handleToggleReturnRiderInSlot(
                                          slot.localKey,
                                          rr
                                        )
                                      }
                                      className={`px-2.5 py-1 rounded-lg text-xs font-black inline-flex items-center gap-1 cursor-pointer ${
                                        rr.type === "player"
                                          ? "bg-teal-600 text-white border border-teal-600"
                                          : "bg-card text-foreground border border-border"
                                      }`}
                                    >
                                      <span>{rr.name}</span>
                                      <X className="w-3 h-3 opacity-80" />
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[11px] font-bold text-muted-foreground">
                                  帰り便の同乗メンバーは0名（空車・直帰）です
                                </p>
                              )}

                              {openReturnPickerCarKey === slot.localKey && (
                                <div className="p-2 rounded-xl bg-card border border-border space-y-2">
                                  <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-muted border border-border">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReturnPickerTab("player")
                                      }
                                      className={`py-1.5 rounded-md text-xs cursor-pointer ${
                                        returnPickerTab === "player"
                                          ? "bg-[#0f172a] text-white font-black"
                                          : "text-muted-foreground font-bold"
                                      }`}
                                    >
                                      選手 ({ctx?.players.length || 0})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReturnPickerTab("adult")
                                      }
                                      className={`py-1.5 rounded-md text-xs cursor-pointer ${
                                        returnPickerTab === "adult"
                                          ? "bg-[#0f172a] text-white font-black"
                                          : "text-muted-foreground font-bold"
                                      }`}
                                    >
                                      保護者・指導者 ({ctx?.drivers.length || 0})
                                    </button>
                                  </div>

                                  {returnPickerTab === "player" ? (
                                    <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                                      {(ctx?.players || []).map((p) => {
                                        const assignedRetNum =
                                          assignmentLookup.returnPlayerCarNumById.get(
                                            p.playerId
                                          );
                                        const inThisRetCar =
                                          assignedRetNum === carNumber;
                                        const inOtherRetCar = Boolean(
                                          assignedRetNum &&
                                            assignedRetNum !== carNumber
                                        );
                                        return (
                                          <button
                                            key={`ret-p-${p.playerId}`}
                                            type="button"
                                            disabled={inOtherRetCar}
                                            onClick={() =>
                                              handleToggleReturnRiderInSlot(
                                                slot.localKey,
                                                {
                                                  type: "player",
                                                  id: p.playerId,
                                                  name: p.name,
                                                }
                                              )
                                            }
                                            className={`px-2.5 py-2 rounded-xl border text-left text-xs flex items-center justify-between gap-1 transition-colors ${
                                              inThisRetCar
                                                ? "bg-teal-600 text-white border-teal-600 font-black cursor-pointer"
                                                : inOtherRetCar
                                                ? "bg-muted/50 text-muted-foreground border-border opacity-55 cursor-not-allowed font-bold"
                                                : "bg-background text-foreground border-border hover:bg-muted/60 font-bold cursor-pointer"
                                            }`}
                                          >
                                            <span className="truncate">
                                              {p.uniformNumber
                                                ? `#${p.uniformNumber} `
                                                : ""}
                                              {p.name}
                                              {p.isAttending ? " ◯" : ""}
                                            </span>
                                            {inThisRetCar ? (
                                              <Check className="w-3.5 h-3.5 shrink-0" />
                                            ) : inOtherRetCar ? (
                                              <span className="text-[10px] font-black shrink-0">
                                                {assignedRetNum}号車(帰)
                                              </span>
                                            ) : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                                      {(ctx?.drivers || []).map((m) => {
                                        const driverCarNum =
                                          assignmentLookup.driverCarNumByMemberId.get(
                                            m.memberId
                                          );
                                        const retRiderCarNum =
                                          assignmentLookup.returnAdultRiderCarNumById.get(
                                            m.memberId
                                          );
                                        const inThisRetCar =
                                          retRiderCarNum === carNumber;
                                        const lockedAsDriver =
                                          Boolean(driverCarNum);
                                        const lockedInOtherRetCar = Boolean(
                                          retRiderCarNum &&
                                            retRiderCarNum !== carNumber
                                        );
                                        const isLocked =
                                          lockedAsDriver || lockedInOtherRetCar;

                                        return (
                                          <button
                                            key={`ret-m-${m.memberId}`}
                                            type="button"
                                            disabled={isLocked}
                                            onClick={() =>
                                              handleToggleReturnRiderInSlot(
                                                slot.localKey,
                                                {
                                                  type: "adult",
                                                  id: m.memberId,
                                                  name: m.name,
                                                }
                                              )
                                            }
                                            className={`px-2.5 py-2 rounded-xl border text-left text-xs flex items-center justify-between gap-1 transition-colors ${
                                              inThisRetCar
                                                ? "bg-teal-600 text-white border-teal-600 font-black cursor-pointer"
                                                : isLocked
                                                ? "bg-muted/50 text-muted-foreground border-border opacity-55 cursor-not-allowed font-bold"
                                                : "bg-background text-foreground border-border hover:bg-muted/60 font-bold cursor-pointer"
                                            }`}
                                          >
                                            <span className="truncate">
                                              {m.name}
                                            </span>
                                            {inThisRetCar ? (
                                              <Check className="w-3.5 h-3.5 shrink-0" />
                                            ) : lockedAsDriver ? (
                                              <span className="text-[10px] font-black shrink-0">
                                                {driverCarNum}号車運転
                                              </span>
                                            ) : lockedInOtherRetCar ? (
                                              <span className="text-[10px] font-black shrink-0">
                                                {retRiderCarNum}号車(帰)
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
                          )}
                        </div>
                      </div>
                    </section>
                  );
                })}

                {/* 登録済みチーム共有車両（バス・共有道具車）のワンタップ号車追加 */}
                {unassignedSharedCars.length > 0 && (
                  <div className="p-3 rounded-2xl border border-border bg-card space-y-2">
                    <span className="block text-[11px] font-black text-muted-foreground">
                      チーム共有車両（バス・共有道具車）を号車としてワンタップ追加
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {unassignedSharedCars.map((sc) => (
                        <button
                          key={sc.carId}
                          type="button"
                          onClick={() => handleAddSharedCarSlot(sc)}
                          className={`h-9 px-3 rounded-xl border text-xs font-black inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                            sc.isBus
                              ? "bg-teal-600 hover:bg-teal-700 text-white border-teal-600"
                              : sc.isCargo
                              ? "bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-500"
                              : "bg-[#0f172a] hover:bg-slate-800 text-white border-[#0f172a]"
                          }`}
                        >
                          {sc.isBus ? (
                            <Bus className="w-3.5 h-3.5 shrink-0" />
                          ) : sc.isCargo ? (
                            <Package className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <Car className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>
                            ＋ {sc.name}
                            {sc.capacity === 0
                              ? "（荷専）"
                              : `（${sc.capacity}席）`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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
