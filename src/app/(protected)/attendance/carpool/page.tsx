// filepath: src/app/(protected)/attendance/carpool/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Car, Users, ArrowLeft, Loader2, Plus, Trash2, ShieldAlert, 
  Check, X, UserMinus, ShieldCheck, MapPin, Info, Link, UserCheck, Fuel,
  ChevronRight, Calendar, Edit
} from "lucide-react";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { cn } from "@/lib/utils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface Attendee {
  id: string; // attendanceId
  eventId: string;
  playerId: string | null;
  memberId: string | null;
  userId: string | null;
  status: string;
  hasCar: boolean;
  playerName: string | null;
  playerNumber: string | null;
  memberName: string | null;
  memberType: "staff" | "parent" | "other" | "player" | null;
}

interface FamilyRelation {
  id: string;
  parentId: string;
  parentName: string;
  childId: string;
  childName: string;
  uniformNumber: string;
}

interface MasterCar {
  id: string;
  ownerId: string;
  name: string;
  capacity: number;
  fuelEfficiency: number;
  carType: "normal" | "cargo" | "bus";
  color: string | null;
  colorCode: string | null;
  numberPlate: string | null;
}

interface CarpoolRider {
  playerId: string | null;
  playerName: string | null;
  playerNumber: string | null;
  memberId: string | null;
  memberName: string | null;
  memberType: "staff" | "parent" | "other" | "player" | null;
}

interface AssignedCar {
  id: string; 
  driverId: string; // teamMembers.id
  driverName: string;
  carId: string | null;
  capacity: number;
  carType: "normal" | "cargo" | "bus";
  highwayFee: number;
  parkingFee: number;
  riders: CarpoolRider[];
}

function CarpoolAssignmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId") || "";

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // APIデータ
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [gasolinePrice, setGasolinePrice] = useState<number>(170);
  const [splitMethod, setSplitMethod] = useState<"by_car" | "by_team">("by_team");
  const [noParentChild, setNoParentChild] = useState(true);

  const [allAttendees, setAllAttendees] = useState<Attendee[]>([]);
  const [familyRelations, setFamilyRelations] = useState<FamilyRelation[]>([]);
  const [masterCars, setMasterCars] = useState<MasterCar[]>([]);
  
  // eventId が存在しないときの日程一覧用
  const [eventsList, setEventsList] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // 🎒 道具関連の状態
  const [equipments, setEquipments] = useState<any[]>([]);
  const [isEquipmentsSubmitting, setIsEquipmentsSubmitting] = useState(false);

  // 🎒 道具マスタ編集モーダル用
  const [isEqModalOpen, setIsEqModalOpen] = useState(false);
  const [eqMasterList, setEqMasterList] = useState<any[]>([]);
  const [editingEq, setEditingEq] = useState<any | null>(null);
  const [eqName, setEqName] = useState("");
  const [eqDescription, setEqDescription] = useState("");
  const [eqIsHeavy, setEqIsHeavy] = useState(false);
  
  // 配車アサイン状態 (クライアント一時メモリ)
  const [assignedCars, setAssignedCars] = useState<AssignedCar[]>([]);

  // 選択中の未アサインメンバー (タップアサイン用)
  const [selectedRider, setSelectedRider] = useState<Attendee | null>(null);

  // 配車枠の追加ダイアログ用状態
  const [isAddCarModalOpen, setIsAddCarModalOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedCarId, setSelectedCarId] = useState("");
  const [manualCapacity, setManualCapacity] = useState(4);
  const [manualCarType, setManualCarType] = useState<"normal" | "cargo" | "bus">("normal");

  // 1. データ取得
  const fetchData = useCallback(async () => {
    if (!eventId) {
      toast.error("イベントIDが見つかりません。");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/carpools/events/${eventId}`);
      const json = await res.json() as {
        success: boolean;
        data?: {
          event: { title: string; startAt: string };
          settings: { distanceKm: number; gasolinePrice: number; splitMethod: "by_car" | "by_team"; noParentChild: boolean; id: string };
          carpools: { id: string; driverId: string; driverName: string; carId: string | null; capacity: number; carType: "normal" | "cargo" | "bus"; highwayFee: number; parkingFee: number; riders: any[] }[];
          attendees: Attendee[];
          familyRelations: FamilyRelation[];
          masterCars: MasterCar[];
        };
        error?: string;
      };

      if (!json.success || !json.data) {
        throw new Error(json.error || "データの取得に失敗しました。");
      }

      const { event, settings, carpools, attendees, familyRelations, masterCars } = json.data;

      setEventTitle(event.title);
      setEventDate(new Date(event.startAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }));
      
      setDistanceKm(settings.distanceKm || 0);
      setGasolinePrice(settings.gasolinePrice || 170);
      setSplitMethod(settings.splitMethod || "by_team");
      setNoParentChild(settings.noParentChild !== false);

      setAllAttendees(attendees);
      setFamilyRelations(familyRelations);
      setMasterCars(masterCars);

      // 保存されていた配車データをローカルアサイン配列にマップ
      const mappedCars: AssignedCar[] = carpools.map(cp => ({
        id: cp.id,
        driverId: cp.driverId,
        driverName: cp.driverName || "ドライバー",
        carId: cp.carId,
        capacity: cp.capacity,
        carType: cp.carType || "normal",
        highwayFee: cp.highwayFee || 0,
        parkingFee: cp.parkingFee || 0,
        riders: cp.riders.map(r => ({
          playerId: r.playerId,
          playerName: r.playerName,
          playerNumber: r.playerNumber,
          memberId: r.memberId,
          memberName: r.memberName,
          memberType: r.memberType
        }))
      }));

      // もし初回（配車スロットが全くない場合）、出欠で「車出しOK (hasCar: true)」にしている出席者を
      // デフォルトのドライバー候補として自動アサイン枠に並べるアシストを行う
      if (mappedCars.length === 0) {
        const defaultCars: AssignedCar[] = [];
        attendees.forEach(att => {
          if (att.hasCar && att.memberId) {
            // 所有する車を検索
            const myCar = masterCars.find(c => c.ownerId === att.memberId);
            defaultCars.push({
              id: `temp_${crypto.randomUUID().replace(/-/g, '')}`,
              driverId: att.memberId,
              driverName: att.memberName || "ドライバー",
              carId: myCar ? myCar.id : null,
              capacity: myCar ? myCar.capacity : 4,
              carType: myCar ? myCar.carType : "normal",
              highwayFee: 0,
              parkingFee: 0,
              riders: []
            });
          }
        });
        setAssignedCars(defaultCars);
      } else {
        setAssignedCars(mappedCars);
      }

      // 🎒 道具データの取得
      const tid = localStorage.getItem("iscore_selectedTeamId") || "";
      const eqRes = await fetch(`/api/equipments/events/${eventId}?teamId=${tid}`);
      const eqJson = await eqRes.json() as { success: boolean; data?: any[] };
      if (eqJson.success && eqJson.data) {
        setEquipments(eqJson.data);
      }

    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "読み込みに失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (eventId) {
      fetchData();
    }
  }, [fetchData, eventId]);

  // 🎒 道具アサイン・ステータス更新などのアクション関数
  const handleAssignEquipment = (equipmentId: string, carpoolId: string | null) => {
    setEquipments(prev => prev.map(eq => {
      if (eq.equipmentId !== equipmentId) return eq;
      return { ...eq, carpoolId: carpoolId || null };
    }));
    toast.success(carpoolId ? "道具を車に積載アサインしました" : "道具を車から降ろしました");
  };

  const handleToggleEquipmentStatus = (equipmentId: string) => {
    setEquipments(prev => prev.map(eq => {
      if (eq.equipmentId !== equipmentId) return eq;
      let newStatus: "pending" | "loaded" | "returned" = "pending";
      if (eq.status === "pending") newStatus = "loaded";
      else if (eq.status === "loaded") newStatus = "returned";
      return { ...eq, status: newStatus };
    }));
  };

  const handleEquipmentResponsibleChange = (equipmentId: string, memberId: string | null) => {
    setEquipments(prev => prev.map(eq => {
      if (eq.equipmentId !== equipmentId) return eq;
      return { ...eq, responsibleMemberId: memberId || null };
    }));
  };

  // 🎒 自動積載アシスト (重い道具を道具車cargoに優先積載)
  const handleAutoLoadEquipments = () => {
    if (assignedCars.length === 0) {
      toast.error("アサイン対象の車両がありません。先に配車枠を追加してください。");
      return;
    }

    const cargoCars = assignedCars.filter(c => c.carType === "cargo");
    const otherCars = assignedCars.filter(c => c.carType !== "cargo");
    const allCars = [...cargoCars, ...otherCars];

    setEquipments(prev => prev.map((eq, index) => {
      let targetCar = null;
      if (eq.isHeavy) {
        targetCar = cargoCars.length > 0 ? cargoCars[index % cargoCars.length] : allCars[0];
      } else {
        targetCar = allCars[index % allCars.length];
      }
      return { ...eq, carpoolId: targetCar ? targetCar.id : null };
    }));

    toast.success("道具の自動積載アシストを適用しました！(重い道具を道具車へ優先積載)");
  };

  // 🎒 道具マスタ取得
  const fetchEqMaster = async () => {
    const tid = localStorage.getItem("iscore_selectedTeamId");
    if (!tid) return;
    try {
      const res = await fetch(`/api/equipments?teamId=${tid}`);
      const json = await res.json() as { success: boolean; data?: any[] };
      if (json.success) {
        setEqMasterList(json.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 🎒 道具マスタ保存
  const handleSaveEqMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    const tid = localStorage.getItem("iscore_selectedTeamId");
    if (!tid || !eqName.trim()) return;

    setIsEquipmentsSubmitting(true);
    try {
      const res = await fetch("/api/equipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEq?.id || null,
          teamId: tid,
          name: eqName.trim(),
          description: eqDescription.trim() || null,
          isHeavy: eqIsHeavy
        })
      });
      const json = await res.json() as { success: boolean };
      if (json.success) {
        toast.success(editingEq ? "道具情報を更新しました" : "道具情報をマスタへ追加しました");
        setEqName("");
        setEqDescription("");
        setEqIsHeavy(false);
        setEditingEq(null);
        await fetchEqMaster();

        // 割当一覧も再読み込み
        const eqRes = await fetch(`/api/equipments/events/${eventId}?teamId=${tid}`);
        const eqJson = await eqRes.json() as { success: boolean; data?: any[] };
        if (eqJson.success && eqJson.data) {
          setEquipments(eqJson.data);
        }
      } else {
        toast.error("保存に失敗しました。");
      }
    } catch (err) {
      console.error(err);
      toast.error("保存中にエラーが発生しました。");
    } finally {
      setIsEquipmentsSubmitting(false);
    }
  };

  // 🎒 道具マスタ削除
  const handleDeleteEqMaster = async (id: string) => {
    if (!window.confirm("この道具をマスタから削除します。よろしいですか？")) return;
    try {
      const res = await fetch(`/api/equipments/${id}`, { method: "DELETE" });
      const json = await res.json() as { success: boolean };
      if (json.success) {
        toast.success("道具を削除しました");
        await fetchEqMaster();

        const tid = localStorage.getItem("iscore_selectedTeamId");
        const eqRes = await fetch(`/api/equipments/events/${eventId}?teamId=${tid}`);
        const eqJson = await eqRes.json() as { success: boolean; data?: any[] };
        if (eqJson.success && eqJson.data) {
          setEquipments(eqJson.data);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("削除に失敗しました。");
    }
  };

  // eventId がない場合のイベント一覧取得
  useEffect(() => {
    if (!eventId) {
      const fetchEvents = async () => {
        setEventsLoading(true);
        try {
          const tid = localStorage.getItem("iscore_selectedTeamId");
          if (!tid) {
            toast.error("チームが選択されていません。");
            return;
          }
          const res = await fetch(`/api/attendance?teamId=${tid}`);
          const json = await res.json() as { success: boolean; data?: { events: any[] } };
          if (json.success && json.data) {
            // 試合 (match) または 合宿 (camp) の日程のみを配車管理の対象とする
            const filtered = json.data.events.filter(
              evt => evt.eventType === 'match' || evt.eventType === 'camp'
            );
            // 直近のイベントが上に来るように、日付の降順でソート
            const sorted = [...filtered].sort(
              (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()
            );
            setEventsList(sorted);
          } else {
            toast.error("イベント一覧の取得に失敗しました。");
          }
        } catch (e) {
          console.error(e);
          toast.error("イベント情報の取得中にエラーが発生しました。");
        } finally {
          setEventsLoading(false);
          setIsLoading(false);
        }
      };
      fetchEvents();
    }
  }, [eventId]);

  // 2. 未割り当てのメンバー一覧をリアクティブに算出
  const unassignedRiders = useMemo(() => {
    const assignedIds = new Set<string>();
    
    assignedCars.forEach(car => {
      assignedIds.add(car.driverId);
      car.riders.forEach(r => {
        if (r.playerId) assignedIds.add(r.playerId);
        if (r.memberId) assignedIds.add(r.memberId);
      });
    });

    return allAttendees.filter(att => {
      const id = att.playerId || att.memberId;
      return id && !assignedIds.has(id);
    });
  }, [assignedCars, allAttendees]);

  // 3. 親子同乗制限チェック
  const checkParentChildConflict = useCallback((car: AssignedCar) => {
    if (!noParentChild) return { conflict: false, msg: "" };

    const adultIds = new Set<string>([car.driverId]);
    car.riders.forEach(r => {
      if (r.memberId) adultIds.add(r.memberId);
    });

    const childIds = car.riders.map(r => r.playerId).filter(Boolean) as string[];

    for (const rel of familyRelations) {
      if (adultIds.has(rel.parentId) && childIds.includes(rel.childId)) {
        return {
          conflict: true,
          msg: `${rel.parentName} と ${rel.childName} 選手`
        };
      }
    }
    return { conflict: false, msg: "" };
  }, [familyRelations, noParentChild]);

  // 4. アサイン処理
  const handleAssignRider = (carId: string) => {
    if (!selectedRider) return;

    const targetCar = assignedCars.find(c => c.id === carId);
    if (!targetCar) return;

    if (targetCar.riders.length >= targetCar.capacity) {
      toast.warning("定員オーバーです！席が足りません。");
      return;
    }

    setAssignedCars(prev => prev.map(car => {
      if (car.id !== carId) return car;
      return {
        ...car,
        riders: [
          ...car.riders,
          {
            playerId: selectedRider.playerId,
            playerName: selectedRider.playerName,
            playerNumber: selectedRider.playerNumber,
            memberId: selectedRider.memberId,
            memberName: selectedRider.memberName,
            memberType: selectedRider.memberType
          }
        ]
      };
    }));

    setSelectedRider(null);
    toast.success("車にアサインしました。");
  };

  // 5. アサイン解除
  const handleRemoveRider = (carId: string, index: number) => {
    setAssignedCars(prev => prev.map(car => {
      if (car.id !== carId) return car;
      const newRiders = [...car.riders];
      newRiders.splice(index, 1);
      return {
        ...car,
        riders: newRiders
      };
    }));
    toast.info("席から外しました。");
  };

  // 6. 配車枠（車両）の追加
  const handleAddCar = () => {
    if (!selectedDriverId) {
      toast.error("ドライバー（運転手）を選択してください。");
      return;
    }

    if (assignedCars.some(c => c.driverId === selectedDriverId)) {
      toast.error("この方はすでにドライバーとしてアサインされています。");
      return;
    }

    const driver = allAttendees.find(att => att.memberId === selectedDriverId);
    if (!driver) return;

    const selectedCar = masterCars.find(c => c.id === selectedCarId);

    const newCarSlot: AssignedCar = {
      id: `temp_${crypto.randomUUID().replace(/-/g, '')}`,
      driverId: selectedDriverId,
      driverName: driver.memberName || "ドライバー",
      carId: selectedCar ? selectedCar.id : null,
      capacity: selectedCar ? selectedCar.capacity : manualCapacity,
      carType: selectedCar ? selectedCar.carType : manualCarType,
      highwayFee: 0,
      parkingFee: 0,
      riders: []
    };

    setAssignedCars(prev => [...prev, newCarSlot]);
    setIsAddCarModalOpen(false);
    setSelectedDriverId("");
    setSelectedCarId("");
    toast.success("配車スロットを追加しました。");
  };

  // 7. 配車枠自体の削除
  const handleDeleteCarSlot = (carId: string) => {
    if (!window.confirm("この配車スロット（ドライバー枠）を削除します。同乗者はすべて未アサインに戻ります。よろしいですか？")) {
      return;
    }
    setAssignedCars(prev => prev.filter(c => c.id !== carId));
  };

  // 8. 車別の実費の変更
  const handleFeeChange = (carId: string, field: "highwayFee" | "parkingFee", value: number) => {
    setAssignedCars(prev => prev.map(car => {
      if (car.id !== carId) return car;
      return {
        ...car,
        [field]: value
      };
    }));
  };

  // 9. ドライバー選択時にマイカー情報を自動適用
  const handleDriverChange = (driverId: string) => {
    setSelectedDriverId(driverId);
    const myCar = masterCars.find(c => c.ownerId === driverId);
    if (myCar) {
      setSelectedCarId(myCar.id);
      setManualCapacity(myCar.capacity);
      setManualCarType(myCar.carType);
    } else {
      setSelectedCarId("");
      setManualCapacity(4);
      setManualCarType("normal");
    }
  };

  // 自動アサイン機能
  const handleAutoAssign = () => {
    if (assignedCars.length === 0) {
      toast.error("稼働予定の車両がありません。先に配車枠を追加してください。");
      return;
    }

    // 変更用の状態コピー
    let tempCars = assignedCars.map(c => ({
      ...c,
      riders: [...c.riders]
    }));

    // 未割り当てメンバーを取得し、選手を優先（先にアサイン）するためにソート
    const sortedRiders = [...unassignedRiders].sort((a, b) => {
      const aIsPlayer = a.memberType === "player" || a.playerId;
      const bIsPlayer = b.memberType === "player" || b.playerId;
      if (aIsPlayer && !bIsPlayer) return -1;
      if (!aIsPlayer && bIsPlayer) return 1;
      return 0;
    });

    let assignedCount = 0;
    let failedRiders: string[] = [];

    for (const rider of sortedRiders) {
      const riderId = rider.playerId || rider.memberId;
      if (!riderId) continue;

      let success = false;
      for (let i = 0; i < tempCars.length; i++) {
        const car = tempCars[i];

        // 1. 定員チェック
        if (car.riders.length >= car.capacity) continue;

        // 2. 親子同乗制限チェック
        if (noParentChild) {
          let hasConflict = false;

          // rider が子供（選手）の場合
          if (rider.playerId || rider.memberType === "player") {
            const childId = rider.playerId;
            
            // ドライバーが親かチェック
            const isParentDriver = familyRelations.some(
              rel => rel.parentId === car.driverId && rel.childId === childId
            );
            if (isParentDriver) hasConflict = true;

            // 同乗している大人が親かチェック
            if (!hasConflict) {
              const hasParentRider = car.riders.some(r => 
                r.memberId && familyRelations.some(rel => rel.parentId === r.memberId && rel.childId === childId)
              );
              if (hasParentRider) hasConflict = true;
            }
          } 
          // rider が大人（保護者等）の場合
          else if (rider.memberId) {
            const parentId = rider.memberId;

            // 同乗している選手の中に自分の子供がいるかチェック
            const hasChildRider = car.riders.some(r => 
              r.playerId && familyRelations.some(rel => rel.parentId === parentId && rel.childId === r.playerId)
            );
            if (hasChildRider) hasConflict = true;
          }

          if (hasConflict) continue;
        }

        // すべてのチェックを通過 ➔ アサイン
        car.riders.push({
          playerId: rider.playerId,
          playerName: rider.playerName,
          playerNumber: rider.playerNumber,
          memberId: rider.memberId,
          memberName: rider.memberName,
          memberType: rider.memberType
        });
        success = true;
        assignedCount++;
        break;
      }

      if (!success) {
        failedRiders.push(rider.playerName || rider.memberName || "不明なメンバー");
      }
    }

    setAssignedCars(tempCars);

    if (failedRiders.length > 0) {
      toast.warning(
        `自動アサイン完了: ${assignedCount}名を配置しましたが、定員または親子制限により ${failedRiders.length}名（${failedRiders.join(", ")}）が配置できませんでした。手動でご調整ください。`
      );
    } else {
      toast.success(`自動アサイン完了: ${assignedCount}名全員を配置しました！`);
    }
  };

  // 交通費精算計算ロジック
  const settlementResult = useMemo(() => {
    // 1. 各車両の総費用を計算
    const carsWithCost = assignedCars.map(car => {
      const mc = car.carId ? masterCars.find(m => m.id === car.carId) : null;
      const fuelEff = mc ? mc.fuelEfficiency : 10;

      const gasolineCost = (fuelEff > 0 && distanceKm > 0)
        ? Math.round((distanceKm / fuelEff) * gasolinePrice)
        : 0;
      const totalCost = gasolineCost + (car.highwayFee || 0) + (car.parkingFee || 0);
      return {
        ...car,
        gasolineCost,
        totalCost
      };
    });

    const overallTotalCost = carsWithCost.reduce((sum, c) => sum + c.totalCost, 0);

    // 2. 出席しているメンバーから「世帯（Family）」を特定
    const presentAttendees = allAttendees.filter(att => att.status !== "absent");
    
    interface Family {
      id: string; 
      name: string; 
      members: Attendee[];
      isDriver: boolean;
      driverCarCost: number; 
    }

    const families: Family[] = [];

    // まず選手世帯を作成
    presentAttendees.forEach(att => {
      if (att.playerId) {
        const parentRelations = familyRelations.filter(rel => rel.childId === att.playerId);
        const parents = presentAttendees.filter(p => p.memberId && parentRelations.some(r => r.parentId === p.memberId));
        
        let driverCarCost = 0;
        let isDriver = false;
        parents.forEach(p => {
          const car = carsWithCost.find(c => c.driverId === p.memberId);
          if (car) {
            driverCarCost += car.totalCost;
            isDriver = true;
          }
        });

        families.push({
          id: att.playerId,
          name: `${att.playerName || "選手"} 家族`,
          members: [att, ...parents],
          isDriver,
          driverCarCost
        });
      }
    });

    // 次に、どの出席選手の親でもない大人（指導者や単独保護者）を独立世帯とする
    presentAttendees.forEach(att => {
      if (att.memberId && att.memberType !== "player") {
        const alreadyIncluded = families.some(fam => 
          fam.members.some(m => m.memberId === att.memberId)
        );

        if (!alreadyIncluded) {
          const car = carsWithCost.find(c => c.driverId === att.memberId);
          const driverCarCost = car ? car.totalCost : 0;

          families.push({
            id: att.memberId,
            name: `${att.memberName || "大人"} 世帯`,
            members: [att],
            isDriver: !!car,
            driverCarCost
          });
        }
      }
    });

    const totalFamiliesCount = families.length;

    // 3. 割り勘の計算
    let detailList: {
      familyId: string;
      name: string;
      role: string;
      costPaid: number; 
      costShare: number; 
      balance: number; 
    }[] = [];

    if (totalFamiliesCount > 0) {
      if (splitMethod === "by_team") {
        const sharePerFamily = Math.round(overallTotalCost / totalFamiliesCount);

        detailList = families.map(fam => {
          const balance = fam.driverCarCost - sharePerFamily;
          return {
            familyId: fam.id,
            name: fam.name,
            role: fam.isDriver ? "車出し" : "同乗",
            costPaid: fam.driverCarCost,
            costShare: sharePerFamily,
            balance
          };
        });
      } else {
        const familyShareMap = new Map<string, number>();
        const familyPaidMap = new Map<string, number>();
        
        families.forEach(fam => {
          familyShareMap.set(fam.id, 0);
          familyPaidMap.set(fam.id, fam.driverCarCost);
        });

        carsWithCost.forEach(car => {
          const carMemberIds = new Set<string>();
          carMemberIds.add(car.driverId);
          car.riders.forEach(r => {
            if (r.memberId) carMemberIds.add(r.memberId);
            if (r.playerId) carMemberIds.add(r.playerId);
          });

          const carFamilies = families.filter(fam => 
            fam.members.some(m => {
              const id = m.playerId || m.memberId;
              return id && carMemberIds.has(id);
            })
          );

          if (carFamilies.length > 0) {
            const sharePerCarFamily = Math.round(car.totalCost / carFamilies.length);
            carFamilies.forEach(fam => {
              const currentShare = familyShareMap.get(fam.id) || 0;
              familyShareMap.set(fam.id, currentShare + sharePerCarFamily);
            });
          }
        });

        detailList = families.map(fam => {
          const costShare = familyShareMap.get(fam.id) || 0;
          const balance = fam.driverCarCost - costShare;
          return {
            familyId: fam.id,
            name: fam.name,
            role: fam.isDriver ? "車出し" : (costShare > 0 ? "同乗" : "不参加/未割当"),
            costPaid: fam.driverCarCost,
            costShare,
            balance
          };
        });
      }
    }

    return {
      overallTotalCost,
      totalFamiliesCount,
      detailList
    };
  }, [assignedCars, allAttendees, familyRelations, distanceKm, gasolinePrice, splitMethod]);

  // 10. 保存
  const handleSaveAll = async () => {
    setIsSubmitting(true);
    try {
      const payload = {
        settings: {
          distanceKm,
          gasolinePrice,
          splitMethod,
          noParentChild
        },
        carpools: assignedCars.map(car => ({
          driverId: car.driverId,
          carId: car.carId,
          capacity: car.capacity,
          carType: car.carType,
          highwayFee: car.highwayFee,
          parkingFee: car.parkingFee,
          riders: car.riders.map(r => ({
            playerId: r.playerId,
            memberId: r.memberId
          }))
        }))
      };

      // 1. 配車データの保存
      const res = await fetch(`/api/carpools/events/${eventId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error || "配車設定の保存に失敗しました。");

      // 2. 道具積載データの保存
      const eqPayload = {
        equipments: equipments.map(eq => ({
          equipmentId: eq.equipmentId,
          carpoolId: eq.carpoolId,
          responsibleMemberId: eq.responsibleMemberId,
          status: eq.status
        }))
      };
      const eqRes = await fetch(`/api/equipments/events/${eventId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eqPayload)
      });
      const eqJson = await eqRes.json() as { success: boolean; error?: string };
      if (!eqJson.success) throw new Error(eqJson.error || "道具積載データの保存に失敗しました。");

      toast.success("配車・道具のデータを保存しました！");
      fetchData(); 
    } catch (e) {
      console.error(e);
      toast.error(`保存に失敗しました: ${e instanceof Error ? e.message : "不明なエラー"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Loading Carpools Board...</p>
        </div>
      </div>
    );
  }

  if (!eventId) {
    return (
      <div className="flex flex-col min-h-screen text-foreground pb-24">
        <main className="flex-1 px-3 sm:px-6 max-w-2xl mx-auto w-full space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* メニューへ戻るボタン */}
          <Button 
            variant="outline" 
            onClick={() => router.push("/menu")} 
            className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> メニューへ戻る
          </Button>

          <SectionHeader title="配車管理日程選択" subtitle="SELECT EVENT" showPulse={true} />

          {eventsLoading ? (
            <div className="flex h-[40vh] items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Loading Events...</p>
              </div>
            </div>
          ) : eventsList.length === 0 ? (
            <EmptyState 
              icon={Car} 
              title="予定されている日程はありません" 
              description="「出欠・スケジュール管理」から、試合や遠征などのイベントを登録してください。"
            />
          ) : (
            <div className="space-y-3">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block px-1">配車設定を行うイベントを選択してください</span>
              <div className="space-y-2.5">
                {eventsList.map((evt) => {
                  const dateStr = new Date(evt.startAt).toLocaleDateString("ja-JP", {
                    month: "short",
                    day: "numeric",
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit"
                  });
                  return (
                    <button
                      key={evt.id}
                      onClick={() => router.push(`/attendance/carpool?eventId=${evt.id}`)}
                      className="w-full p-4 bg-card hover:bg-muted/40 border border-border/40 rounded-2xl text-left transition-all active:scale-[0.99] cursor-pointer flex items-center justify-between group shadow-xs hover:shadow-sm"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <span className="inline-block text-[8px] font-extrabold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          {evt.eventType === 'match' ? '試合' : evt.eventType === 'camp' ? '合宿' : evt.eventType === 'practice' ? '練習' : 'その他'}
                        </span>
                        <h4 className="font-black text-sm text-foreground truncate group-hover:text-primary transition-colors">
                          {evt.title}
                        </h4>
                        <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-bold">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {dateStr}
                          </span>
                          {evt.location && (
                            <span className="flex items-center gap-1 truncate max-w-[150px]">
                              <MapPin className="h-3.5 w-3.5" />
                              {evt.location}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-primary/60 transition-colors shrink-0 ml-2" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen text-foreground pb-32">
      <main className="flex-1 px-3 sm:px-6 max-w-5xl mx-auto w-full space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* 戻るボタン */}
        <Button 
          variant="outline" 
          onClick={() => router.back()} 
          className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> 出欠ボードへ戻る
        </Button>

        <SectionHeader title={`${eventTitle} 配車管理`} subtitle="CARPOOL ASSIST" showPulse={true} />

        {/* ℹ️ 日時と全体設定 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-card border border-border/40 p-5 rounded-3xl shadow-sm">
          <div className="md:col-span-1 space-y-1">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">イベント日時</span>
            <div className="font-black text-sm">{eventDate}</div>
            <p className="text-[10px] text-muted-foreground font-bold">
              ※本日に「参加（◎/○/遅刻）」と回答したメンバーから配車アサインが可能です。
            </p>
          </div>

          <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t md:border-t-0 md:border-l border-border/40 pt-3 md:pt-0 md:pl-5">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">走行距離 (往復km)</label>
              <Input
                type="number"
                value={distanceKm || ""}
                onChange={e => setDistanceKm(Number(e.target.value))}
                placeholder="例: 45"
                className="h-10 rounded-xl font-bold text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">ガソリン時価 (円/L)</label>
              <Input
                type="number"
                value={gasolinePrice || ""}
                onChange={e => setGasolinePrice(Number(e.target.value))}
                placeholder="例: 170"
                className="h-10 rounded-xl font-bold text-xs"
              />
            </div>
            
            <div className="space-y-1.5 col-span-2">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">親子同乗禁止設定</span>
              <div className="flex items-center justify-between p-2 rounded-xl bg-muted/40 border border-border/40 min-h-[40px]">
                <span className="text-[10px] font-bold text-muted-foreground">親子を別車に配置</span>
                <input
                  type="checkbox"
                  checked={noParentChild}
                  onChange={e => setNoParentChild(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ━━━━ アサインエリア ━━━━ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* 👈 左側: 未割り当てメンバー一覧 */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-card border border-border/40 rounded-3xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  未割り当てメンバー ({unassignedRiders.length}名)
                </h3>
              </div>

              {selectedRider && (
                <div className="p-2.5 bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold rounded-xl animate-in fade-in duration-200">
                  👆 <strong>{selectedRider.playerName || selectedRider.memberName}</strong> を選択中。
                  <br />乗せたい車のスロットをタップしてください。
                </div>
              )}

              <div className="max-h-[360px] lg:max-h-[500px] overflow-y-auto space-y-1.5 scrollbar-thin p-1.5 pr-2">
                {unassignedRiders.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-xs font-bold">
                    全員アサイン済みです！👍
                  </div>
                ) : (
                  unassignedRiders.map((rider) => {
                    const isSelected = selectedRider?.id === rider.id;
                    const name = rider.playerName || rider.memberName || "名前なし";
                    const isPlayer = rider.memberType === "player" || rider.playerId;
                    
                    return (
                      <button
                        key={rider.id}
                        onClick={() => setSelectedRider(isSelected ? null : rider)}
                        className={cn(
                          "w-full p-2.5 rounded-xl border text-left transition-all active:scale-98 cursor-pointer flex items-center justify-between",
                          isSelected 
                            ? "bg-primary border-primary text-white shadow-sm ring-2 ring-inset ring-white/30" 
                            : "bg-muted/40 hover:bg-muted/75 border-border/50 text-foreground"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="font-black text-xs truncate">{name}</p>
                          <span className={cn(
                            "inline-block text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-sm mt-1",
                            isSelected 
                              ? "bg-white/20 text-white" 
                              : isPlayer 
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          )}>
                            {isPlayer ? `選手 #${rider.playerNumber || "未"}` : rider.memberType === 'staff' ? '指導者' : '保護者'}
                          </span>
                        </div>
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-white animate-pulse" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* 👉 右側: アサイン済み配車枠スロット */}
          <div className="lg:col-span-8 space-y-4">
            
            <div className="flex items-center justify-between bg-card border border-border/40 p-4 rounded-3xl shadow-sm">
              <span className="text-xs font-black text-muted-foreground">稼働予定車両: {assignedCars.length} 台</span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline"
                  onClick={handleAutoAssign}
                  className="h-10 px-4 rounded-xl font-black flex items-center gap-1.5 border-primary text-primary hover:bg-primary/5 cursor-pointer"
                >
                  <Users className="h-4 w-4" />
                  自動アサイン
                </Button>
                <Button 
                  onClick={() => {
                    setSelectedDriverId("");
                    setSelectedCarId("");
                    setManualCapacity(4);
                    setManualCarType("normal");
                    setIsAddCarModalOpen(true);
                  }} 
                  className="h-10 px-4 rounded-xl font-black flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  配車枠を追加
                </Button>
              </div>
            </div>

            {assignedCars.length === 0 ? (
              <EmptyState 
                icon={Car} 
                title="稼働する車両はありません" 
                description="「配車枠を追加」から、本日の遠征で車出し・運転をする人を登録してください。"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assignedCars.map((car) => {
                  const conflict = checkParentChildConflict(car);
                  const isCargo = car.carType === "cargo";
                  
                  return (
                    <div 
                      key={car.id} 
                      className={cn(
                        "bg-card border rounded-3xl p-4.5 shadow-xs relative flex flex-col justify-between min-h-[300px]",
                        conflict.conflict ? "border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.05)]" : "border-border/40"
                      )}
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            {(() => {
                              const mc = car.carId ? masterCars.find(m => m.id === car.carId) : null;
                              const colorStyle = getCarColorClass(mc?.colorCode);
                              return (
                                <div 
                                  className={cn(
                                    "h-9 w-9 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-300 shadow-sm",
                                    isCargo 
                                      ? "bg-purple-500 text-white border-purple-600" 
                                      : car.carType === "bus" 
                                        ? "bg-amber-500 text-white border-amber-600" 
                                        : `${colorStyle.bg} ${colorStyle.text} ${colorStyle.border}`
                                  )}
                                  style={(!isCargo && car.carType !== "bus") ? colorStyle.style : undefined}
                                >
                                  <Car className="h-4.5 w-4.5" />
                                </div>
                              );
                            })()}
                            <div className="min-w-0 flex-1">
                              <h4 className="font-black text-xs truncate max-w-[130px]" title={car.driverName}>
                                {car.driverName} の車
                              </h4>
                              {(() => {
                                if (!car.carId) return <p className="text-[9px] font-bold text-muted-foreground">手動登録車両</p>;
                                const mc = masterCars.find(m => m.id === car.carId);
                                if (!mc) return <p className="text-[9px] font-bold text-muted-foreground">不明な車両</p>;
                                return (
                                  <div className="space-y-0.5">
                                    <p className="text-[9px] font-bold text-foreground truncate max-w-[130px]" title={mc.name}>
                                      {mc.name} {mc.numberPlate ? `[${mc.numberPlate}]` : ""}
                                    </p>
                                    {mc.color && (
                                      <span className="inline-block text-[8px] font-extrabold text-muted-foreground bg-muted px-1.5 py-0.2 rounded-sm leading-normal">
                                        {mc.color}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-extrabold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                              {car.riders.length} / {car.capacity} 席
                            </span>
                            <button
                              onClick={() => handleDeleteCarSlot(car.id)}
                              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {conflict.conflict && (
                          <div className="flex items-center gap-1.5 p-2 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[9px] font-black rounded-lg animate-pulse">
                            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                            <span>親子同乗: {conflict.msg}</span>
                          </div>
                        )}

                        <div className="space-y-1">
                          <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest block px-1">同乗シート</span>
                          
                          <div className="space-y-1 max-h-[140px] overflow-y-auto scrollbar-none">
                            {car.riders.map((rider, idx) => {
                              const riderName = rider.playerName || rider.memberName || "同乗者";
                              const isRiderPlayer = rider.memberType === "player" || rider.playerId;
                              
                              return (
                                <div 
                                  key={idx} 
                                  className="flex items-center justify-between p-2 bg-muted/40 rounded-xl border border-border/20 text-[10px] font-bold"
                                >
                                  <span className="truncate max-w-[130px]">
                                    {isRiderPlayer ? `選手: ${riderName} (#${rider.playerNumber || ""})` : `大人: ${riderName}`}
                                  </span>
                                  <button
                                    onClick={() => handleRemoveRider(car.id, idx)}
                                    className="h-5 w-5 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              );
                            })}

                            {Array.from({ length: Math.max(0, car.capacity - car.riders.length) }).map((_, idx) => (
                              <button
                                key={`empty-${idx}`}
                                onClick={() => selectedRider && handleAssignRider(car.id)}
                                disabled={!selectedRider}
                                className={cn(
                                  "w-full p-2 rounded-xl border border-dashed text-left text-[9px] font-bold flex items-center gap-1.5 justify-center transition-all",
                                  selectedRider 
                                    ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 cursor-pointer animate-pulse" 
                                    : "border-border/30 bg-transparent text-muted-foreground/40 cursor-default"
                                )}
                              >
                                {selectedRider ? (
                                  <>
                                    <Plus className="h-3.5 w-3.5 shrink-0" />
                                    ここにアサイン
                                  </>
                                ) : (
                                  "💺 空席"
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 🎒 車両カード内 積載道具一覧 */}
                        {(() => {
                          const carEqs = equipments.filter(eq => eq.carpoolId === car.id);
                          if (carEqs.length === 0) return null;
                          return (
                            <div className="space-y-1 mt-2">
                              <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest block px-1">積載道具 ({carEqs.length})</span>
                              <div className="flex flex-wrap gap-1 px-1">
                                {carEqs.map(eq => (
                                  <span 
                                    key={eq.equipmentId} 
                                    onClick={() => handleToggleEquipmentStatus(eq.equipmentId)}
                                    className={cn(
                                      "inline-block text-[8px] font-extrabold px-1.5 py-0.5 rounded border tracking-normal cursor-pointer select-none",
                                      eq.status === 'returned'
                                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                        : eq.status === 'loaded'
                                          ? "bg-primary/10 text-primary border-primary/20"
                                          : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                                    )}
                                    title={`クリックで状況変更 (現在の状態: ${eq.status === 'returned' ? '返却完了' : eq.status === 'loaded' ? '積載済' : '積載待ち'})`}
                                  >
                                    {eq.name} {eq.isHeavy ? "⚠️" : ""}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="grid grid-cols-2 gap-2 border-t border-border/40 pt-3.5 mt-3 text-xs">
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-black text-zinc-400 uppercase tracking-widest block">高速料金 (往復)</label>
                          <Input
                            type="number"
                            value={car.highwayFee || ""}
                            onChange={e => handleFeeChange(car.id, "highwayFee", Number(e.target.value))}
                            placeholder="0"
                            className="h-8 rounded-lg font-bold text-[10px]"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-black text-zinc-400 uppercase tracking-widest block">駐車場代 (日)</label>
                          <Input
                            type="number"
                            value={car.parkingFee || ""}
                            onChange={e => handleFeeChange(car.id, "parkingFee", Number(e.target.value))}
                            placeholder="0"
                            className="h-8 rounded-lg font-bold text-[10px]"
                          />
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>

        </div>

        {/* 🎒 道具の車載・アサイン調整 */}
        <div className="bg-card border border-border/40 p-6 rounded-3xl shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-4 border-b border-border/40">
            <div>
              <h3 className="text-base font-black text-foreground flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                遠征道具の積載・担当調整 (EQUIPMENT CARGO)
              </h3>
              <p className="text-xs text-muted-foreground font-bold mt-1">
                試合・遠征に持参するチームの共有道具を、各車両へ積載アサインします。
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={handleAutoLoadEquipments}
                className="h-10 px-4 rounded-xl font-black flex items-center gap-1.5 border-primary text-primary hover:bg-primary/5 cursor-pointer text-xs"
              >
                <Car className="h-4 w-4" />
                道具を自動積載
              </Button>
              <Button 
                onClick={() => {
                  fetchEqMaster();
                  setIsEqModalOpen(true);
                }}
                className="h-10 px-4 rounded-xl font-black flex items-center gap-1.5 text-xs"
              >
                <Plus className="h-4 w-4" />
                道具リスト編集
              </Button>
            </div>
          </div>

          {equipments.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-xs font-bold space-y-3">
              <p>登録されている共有道具がありません。</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchEqMaster();
                  setIsEqModalOpen(true);
                }}
                className="rounded-lg"
              >
                最初の道具を登録する
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto border border-border/30 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/30 text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                    <th className="p-3">道具名</th>
                    <th className="p-3">区分</th>
                    <th className="p-3">積む車両</th>
                    <th className="p-3">持ち出し・返却担当</th>
                    <th className="p-3 text-center">積載・返却状況</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30 text-xs font-bold">
                  {equipments.map((eq) => {
                    return (
                      <tr key={eq.equipmentId} className="hover:bg-muted/20">
                        <td className="p-3 font-black">
                          <div>
                            <span className="text-foreground">{eq.name}</span>
                            {eq.description && (
                              <p className="text-[9px] font-bold text-muted-foreground mt-0.5">{eq.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={cn(
                            "inline-block text-[8px] font-extrabold px-2 py-0.5 rounded-full border tracking-normal",
                            eq.isHeavy 
                              ? "bg-rose-500/10 text-rose-600 border-rose-500/20" 
                              : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                          )}>
                            {eq.isHeavy ? "⚠️ 大型/重量" : "通常"}
                          </span>
                        </td>
                        <td className="p-3">
                          <select
                            value={eq.carpoolId || ""}
                            onChange={(e) => handleAssignEquipment(eq.equipmentId, e.target.value || null)}
                            className="h-9 rounded-xl border border-border bg-muted/20 px-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                          >
                            <option value="">-- 未積載 (車から降ろす) --</option>
                            {assignedCars.map(car => (
                              <option key={car.id} value={car.id}>
                                {car.driverName} の車 ({car.carType === 'cargo' ? '道具車' : car.carType === 'bus' ? 'バス' : '普通車'})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3">
                          <select
                            value={eq.responsibleMemberId || ""}
                            onChange={(e) => handleEquipmentResponsibleChange(eq.equipmentId, e.target.value || null)}
                            className="h-9 rounded-xl border border-border bg-muted/20 px-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                          >
                            <option value="">-- 担当者なし --</option>
                            {allAttendees
                              .filter(att => att.memberId && att.memberType !== 'player')
                              .map(att => (
                                <option key={att.memberId} value={att.memberId!}>
                                  {att.memberName}
                                </option>
                              ))
                            }
                          </select>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleEquipmentStatus(eq.equipmentId)}
                            className={cn(
                              "px-3 py-1.5 text-[10px] font-black rounded-lg transition-all border cursor-pointer select-none min-w-[90px]",
                              eq.status === "returned" 
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shadow-xs" 
                                : eq.status === "loaded"
                                  ? "bg-primary/10 text-primary border-primary/20 shadow-xs"
                                  : "bg-muted text-muted-foreground border-border/50"
                            )}
                          >
                            {eq.status === "returned" ? "返却完了 ✅" : eq.status === "loaded" ? "積載済 📦" : "積載待ち ⏳"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ━━ 交通費精算シミュレーター ━━ */}
        <div className="bg-card border border-border/40 p-6 rounded-3xl shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-4 border-b border-border/40">
            <div>
              <h3 className="text-base font-black text-foreground flex items-center gap-2">
                <Fuel className="h-5 w-5 text-primary" />
                交通費精算シミュレーター (目安)
              </h3>
              <p className="text-xs text-muted-foreground font-bold mt-1">
                距離、燃費、実費（高速・駐車場）を基にした世帯単位の割り勘計算結果です。
              </p>
            </div>

            {/* 精算方式の切り替え */}
            <div className="flex rounded-xl bg-muted p-1 border border-border/40 self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setSplitMethod("by_team")}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-black rounded-lg transition-all cursor-pointer",
                  splitMethod === "by_team" 
                    ? "bg-card text-foreground shadow-xs" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                チーム一括精算 (推奨)
              </button>
              <button
                type="button"
                onClick={() => setSplitMethod("by_car")}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-black rounded-lg transition-all cursor-pointer",
                  splitMethod === "by_car" 
                    ? "bg-card text-foreground shadow-xs" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                車ごと精算
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-muted/30 border border-border/20 rounded-2xl text-center">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">総交通費 (全車両合計)</span>
              <p className="text-2xl font-black mt-1 text-foreground">
                {settlementResult.overallTotalCost.toLocaleString()} <span className="text-xs">円</span>
              </p>
            </div>
            <div className="p-4 bg-muted/30 border border-border/20 rounded-2xl text-center">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">精算対象世帯数</span>
              <p className="text-2xl font-black mt-1 text-foreground">
                {settlementResult.totalFamiliesCount} <span className="text-xs">世帯</span>
              </p>
            </div>
            <div className="p-4 bg-muted/30 border border-border/20 rounded-2xl text-center">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">世帯平均負担額</span>
              <p className="text-2xl font-black mt-1 text-primary">
                {settlementResult.totalFamiliesCount > 0 
                  ? Math.round(settlementResult.overallTotalCost / settlementResult.totalFamiliesCount).toLocaleString()
                  : 0
                } <span className="text-xs text-foreground">円</span>
              </p>
            </div>
          </div>

          {/* 精算内訳リスト */}
          <div className="space-y-2">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block px-1">世帯別の収支内訳</span>
            
            <div className="overflow-x-auto border border-border/30 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/30 text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                    <th className="p-3">世帯名</th>
                    <th className="p-3">当日の役割</th>
                    <th className="p-3 text-right">立替費用</th>
                    <th className="p-3 text-right">割り勘負担</th>
                    <th className="p-3 text-right">差引収支</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30 text-xs font-bold">
                  {settlementResult.detailList.map((item) => {
                    const isPlus = item.balance > 0;
                    const isZero = item.balance === 0;
                    
                    return (
                      <tr key={item.familyId} className="hover:bg-muted/20">
                        <td className="p-3 font-black">{item.name}</td>
                        <td className="p-3">
                          <span className={cn(
                            "inline-block text-[8px] font-extrabold px-2 py-0.5 rounded-full border tracking-normal",
                            item.role === "車出し" 
                              ? "bg-primary/10 text-primary border-primary/20" 
                              : item.role === "同乗"
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                          )}>
                            {item.role}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">{item.costPaid.toLocaleString()} 円</td>
                        <td className="p-3 text-right tabular-nums">{item.costShare.toLocaleString()} 円</td>
                        <td className={cn(
                          "p-3 text-right tabular-nums font-black",
                          isPlus ? "text-blue-600 dark:text-blue-400" : isZero ? "text-foreground" : "text-rose-600 dark:text-rose-400"
                        )}>
                          {isPlus ? "+" : ""}{item.balance.toLocaleString()} 円
                          <span className="text-[9px] block font-bold text-muted-foreground">
                            {isPlus ? "(受け取る)" : isZero ? "(精算なし)" : "(支払う)"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 💾 保存アクション */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.05)] z-40">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div className="text-[10px] text-muted-foreground font-bold hidden sm:block">
              ※アサインを変更した場合は必ず右下の「設定・配車を保存」を押してください。
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => router.back()}
                className="h-11 px-6 rounded-xl font-bold flex-1 sm:flex-initial"
              >
                キャンセル
              </Button>
              <Button
                onClick={handleSaveAll}
                disabled={isSubmitting}
                className="h-11 px-8 rounded-xl font-black text-white flex-1 sm:flex-initial flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <UserCheck className="h-4 w-4" />
                    設定・配車を保存
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* 🚗 追加モーダル */}
        <Dialog open={isAddCarModalOpen} onOpenChange={setIsAddCarModalOpen}>
          <DialogContent className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="font-black text-lg">配車スロット（ドライバー）の追加</DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground">
                遠征当日に車出しを担当するドライバーと車両を選択します。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">運転手を選択</label>
                <select 
                  value={selectedDriverId} 
                  onChange={e => handleDriverChange(e.target.value)}
                  className="w-full h-11 rounded-xl border border-border bg-muted/20 px-3 text-sm font-bold shadow-xs focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                >
                  <option value="">-- 運転手（出席する大人）を選択 --</option>
                  {allAttendees
                    .filter(att => att.memberId && att.memberType !== 'player')
                    .map(att => (
                      <option key={att.memberId} value={att.memberId!}>
                        {att.memberName} {att.hasCar ? "🚗 (出欠時: 車出しOK)" : ""}
                      </option>
                    ))
                  }
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">使用する登録車両</label>
                <select 
                  value={selectedCarId} 
                  onChange={e => {
                    setSelectedCarId(e.target.value);
                    const car = masterCars.find(c => c.id === e.target.value);
                    if (car) {
                      setManualCapacity(car.capacity);
                      setManualCarType(car.carType);
                    }
                  }}
                  className="w-full h-11 rounded-xl border border-border bg-muted/20 px-3 text-sm font-bold shadow-xs focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                >
                  <option value="">-- 手動入力（車両スペック） --</option>
                  {selectedDriverId && masterCars
                    .filter(c => c.ownerId === selectedDriverId)
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.name} (定員: {c.capacity}人)</option>
                    ))
                  }
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">乗車定員 (運転手除く)</label>
                  <select 
                    value={manualCapacity} 
                    onChange={e => setManualCapacity(Number(e.target.value))}
                    disabled={!!selectedCarId}
                    className="w-full h-11 rounded-xl border border-border bg-muted/20 px-3 text-sm font-bold shadow-xs focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 disabled:opacity-60"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15].map(n => (
                      <option key={n} value={n}>{n} 人</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">車両区分</label>
                  <select 
                    value={manualCarType} 
                    onChange={e => setManualCarType(e.target.value as any)}
                    disabled={!!selectedCarId}
                    className="w-full h-11 rounded-xl border border-border bg-muted/20 px-3 text-sm font-bold shadow-xs focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 disabled:opacity-60"
                  >
                    <option value="normal">普通車</option>
                    <option value="cargo">道具車</option>
                    <option value="bus">マイクロバス</option>
                  </select>
                </div>
              </div>

            </div>

            <DialogFooter className="flex flex-col gap-2 w-full pt-2 sm:flex-col">
              <Button onClick={handleAddCar} className="w-full h-12 rounded-xl font-black text-white text-sm">
                追加する
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsAddCarModalOpen(false)} className="w-full h-12 rounded-xl font-bold text-sm">
                キャンセル
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 🎒 道具リスト編集モーダル */}
        <Dialog open={isEqModalOpen} onOpenChange={setIsEqModalOpen}>
          <DialogContent className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="font-black text-lg">共有道具リスト</DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground">
                遠征や試合時に積載・担当調整が必要なチーム共有道具を登録・編集します。
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveEqMaster} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">道具名 (必須)</label>
                <Input
                  value={eqName}
                  onChange={e => setEqName(e.target.value)}
                  required
                  placeholder="例: キャッチャー防具一式、バットケースなど"
                  className="h-11 rounded-xl font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">補足説明</label>
                <Input
                  value={eqDescription}
                  onChange={e => setEqDescription(e.target.value)}
                  placeholder="例: 青の大型バッグ、練習球3ダース入りなど"
                  className="h-11 rounded-xl font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block px-1">大型・重量のある道具</span>
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/40 min-h-[44px]">
                  <span className="text-xs font-bold text-muted-foreground">
                    道具車（cargo）に優先アサインする
                  </span>
                  <input
                    type="checkbox"
                    checked={eqIsHeavy}
                    onChange={e => setEqIsHeavy(e.target.checked)}
                    className="h-4.5 w-4.5 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
                  />
                </div>
              </div>

              <Button type="submit" disabled={isEquipmentsSubmitting} className="w-full h-12 rounded-xl font-black text-white text-sm">
                {isEquipmentsSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editingEq ? "更新する" : "道具を追加登録する"}
              </Button>
            </form>

            <div className="border-t border-border/40 pt-4 mt-2 space-y-3">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block px-1">登録済みの道具 ({eqMasterList.length})</span>
              
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-thin">
                {eqMasterList.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-xs font-bold">登録されている道具はありません。</p>
                ) : (
                  eqMasterList.map((m) => (
                    <div 
                      key={m.id} 
                      className="flex items-center justify-between p-2.5 bg-muted/30 rounded-xl border border-border/30 text-xs font-bold"
                    >
                      <div className="min-w-0">
                        <p className="font-black text-foreground truncate flex items-center gap-1.5">
                          {m.name}
                          {m.isHeavy && (
                            <span className="text-[7px] font-extrabold bg-rose-500/10 text-rose-600 border border-rose-500/20 px-1 py-0.2 rounded">重</span>
                          )}
                        </p>
                        {m.description && (
                          <p className="text-[9px] text-muted-foreground truncate">{m.description}</p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEq(m);
                            setEqName(m.name);
                            setEqDescription(m.description || "");
                            setEqIsHeavy(!!m.isHeavy);
                          }}
                          className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-muted flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEqMaster(m.id)}
                          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => {
                setIsEqModalOpen(false);
                setEditingEq(null);
                setEqName("");
                setEqDescription("");
                setEqIsHeavy(false);
              }} className="w-full h-12 rounded-xl font-bold text-sm">
                閉じる
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}

export default function CarpoolAssignmentPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Loading Carpool Page...</p>
        </div>
      </div>
    }>
      <CarpoolAssignmentContent />
    </Suspense>
  );
}

// 🎨 車の色に応じたCSSスタイルマッピング関数
function getCarColorClass(colorName: string | null | undefined): { bg: string; text: string; border: string; style?: React.CSSProperties } {
  if (!colorName) {
    return { bg: "bg-primary/10 text-primary", text: "text-primary", border: "border-transparent" };
  }
  const cleanColor = colorName.trim();

  // 16進数カラーコードの判定
  if (cleanColor.startsWith("#")) {
    const isLight = isLightColor(cleanColor);
    return {
      bg: "",
      text: isLight ? "text-zinc-700" : "text-white",
      border: isLight ? "border-zinc-200" : "border-transparent",
      style: {
        backgroundColor: cleanColor,
        color: isLight ? "#27272a" : "#ffffff",
        borderColor: isLight ? "#e4e4e7" : "transparent"
      }
    };
  }

  const lowerColor = cleanColor.toLowerCase();
  // 白・パール系
  if (lowerColor.includes("白") || lowerColor.includes("ホワイト") || lowerColor.includes("white") || lowerColor.includes("パール")) {
    return { 
      bg: "bg-white dark:bg-zinc-800", 
      text: "text-zinc-600 dark:text-zinc-300", 
      border: "border-zinc-200 dark:border-zinc-700" 
    };
  }
  // 黒・ダーク系
  if (lowerColor.includes("黒") || lowerColor.includes("ブラック") || lowerColor.includes("black") || lowerColor.includes("ダークグレー")) {
    return { 
      bg: "bg-zinc-950 dark:bg-zinc-900", 
      text: "text-white dark:text-zinc-200", 
      border: "border-zinc-900 dark:border-zinc-950" 
    };
  }
  // 赤・ピンク系
  if (lowerColor.includes("赤") || lowerColor.includes("レッド") || lowerColor.includes("red") || lowerColor.includes("ピンク")) {
    return { 
      bg: "bg-rose-500 dark:bg-rose-600", 
      text: "text-white", 
      border: "border-rose-600 dark:border-rose-700" 
    };
  }
  // 青・ネイビー系
  if (lowerColor.includes("青") || lowerColor.includes("ブルー") || lowerColor.includes("blue") || lowerColor.includes("紺") || lowerColor.includes("ネイビー")) {
    return { 
      bg: "bg-blue-600 dark:bg-blue-700", 
      text: "text-white", 
      border: "border-blue-700 dark:border-blue-800" 
    };
  }
  // 緑・カーキ系
  if (lowerColor.includes("緑") || lowerColor.includes("グリーン") || lowerColor.includes("green") || lowerColor.includes("カーキ")) {
    return { 
      bg: "bg-emerald-600 dark:bg-emerald-700", 
      text: "text-white", 
      border: "border-emerald-700 dark:border-emerald-800" 
    };
  }
  // 黄色・ゴールド
  if (lowerColor.includes("黄") || lowerColor.includes("イエロー") || lowerColor.includes("yellow") || lowerColor.includes("金") || lowerColor.includes("ゴールド")) {
    return { 
      bg: "bg-amber-400 dark:bg-amber-500", 
      text: "text-zinc-900 dark:text-white", 
      border: "border-amber-500" 
    };
  }
  // 橙・オレンジ
  if (lowerColor.includes("オレンジ") || lowerColor.includes("orange") || lowerColor.includes("橙")) {
    return { 
      bg: "bg-orange-500", 
      text: "text-white", 
      border: "border-orange-600" 
    };
  }
  // シルバー・グレー
  if (lowerColor.includes("シルバー") || lowerColor.includes("銀") || lowerColor.includes("silver") || lowerColor.includes("グレー") || lowerColor.includes("灰") || lowerColor.includes("gray") || lowerColor.includes("grey")) {
    return { 
      bg: "bg-zinc-400 dark:bg-zinc-500", 
      text: "text-white", 
      border: "border-zinc-500" 
    };
  }
  // 茶色・ベージュ・ブラウン
  if (lowerColor.includes("茶") || lowerColor.includes("ブラウン") || lowerColor.includes("brown") || lowerColor.includes("ベージュ")) {
    return { 
      bg: "bg-amber-800 dark:bg-amber-900", 
      text: "text-white", 
      border: "border-amber-900" 
    };
  }

  // デフォルト
  return { bg: "bg-primary/10", text: "text-primary", border: "border-transparent" };
}

// 輝度から明るい色かどうかを判定するヘルパー (テキストの白黒コントラスト調整用)
function isLightColor(hexColor: string): boolean {
  const hex = hexColor.replace("#", "");
  if (hex.length !== 6) return true;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 150; // 輝度が150以上なら明るいとみなして黒文字を合わせる
}
