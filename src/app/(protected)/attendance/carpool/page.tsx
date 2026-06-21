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
  Check, X, UserMinus, ShieldCheck, MapPin, Info, Link, UserCheck
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

    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "読み込みに失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

      const res = await fetch(`/api/carpools/events/${eventId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error);

      toast.success("配車・アサインデータを保存しました！");
      fetchData(); 
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました。");
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
    return <div className="p-20 text-center text-muted-foreground">イベント情報が選択されていません。</div>;
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

              <div className="max-h-[360px] lg:max-h-[500px] overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
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
                            ? "bg-primary border-primary text-white shadow-md scale-[1.02]" 
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
                              const colorStyle = getCarColorClass(mc?.color);
                              return (
                                <div className={cn(
                                  "h-9 w-9 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-300 shadow-sm",
                                  isCargo 
                                    ? "bg-purple-500 text-white border-purple-600" 
                                    : car.carType === "bus" 
                                      ? "bg-amber-500 text-white border-amber-600" 
                                      : `${colorStyle.bg} ${colorStyle.text} ${colorStyle.border}`
                                )}>
                                  <Car className="h-4.5 w-4.5" />
                                </div>
                              );
                            })()}
                            <div className="min-w-0">
                              <h4 className="font-black text-xs truncate max-w-[130px]" title={car.driverName}>
                                {car.driverName} の車
                              </h4>
                              <p className="text-[9px] font-bold text-muted-foreground truncate max-w-[130px]" title={
                                car.carId 
                                  ? (() => {
                                      const mc = masterCars.find(m => m.id === car.carId);
                                      if (!mc) return "";
                                      return `${mc.color ? mc.color + "の" : ""}${mc.name}${mc.numberPlate ? " [" + mc.numberPlate + "]" : ""}`;
                                    })()
                                  : "手動登録車両"
                              }>
                                {car.carId ? (
                                  (() => {
                                    const mc = masterCars.find(m => m.id === car.carId);
                                    if (!mc) return "不明な車両";
                                    return `${mc.color ? mc.color + "の" : ""}${mc.name}${mc.numberPlate ? " [" + mc.numberPlate + "]" : ""}`;
                                  })()
                                ) : "手動登録車両"}
                              </p>
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
function getCarColorClass(colorName: string | null | undefined): { bg: string; text: string; border: string } {
  if (!colorName) {
    return { bg: "bg-primary/10 text-primary", text: "text-primary", border: "border-transparent" };
  }
  const cleanColor = colorName.trim().toLowerCase();

  // 白・パール系
  if (cleanColor.includes("白") || cleanColor.includes("ホワイト") || cleanColor.includes("white") || cleanColor.includes("パール")) {
    return { 
      bg: "bg-white dark:bg-zinc-800", 
      text: "text-zinc-600 dark:text-zinc-300", 
      border: "border-zinc-200 dark:border-zinc-700" 
    };
  }
  // 黒・ダーク系
  if (cleanColor.includes("黒") || cleanColor.includes("ブラック") || cleanColor.includes("black") || cleanColor.includes("ダークグレー")) {
    return { 
      bg: "bg-zinc-950 dark:bg-zinc-900", 
      text: "text-white dark:text-zinc-200", 
      border: "border-zinc-900 dark:border-zinc-950" 
    };
  }
  // 赤・ピンク系
  if (cleanColor.includes("赤") || cleanColor.includes("レッド") || cleanColor.includes("red") || cleanColor.includes("ピンク")) {
    return { 
      bg: "bg-rose-500 dark:bg-rose-600", 
      text: "text-white", 
      border: "border-rose-600 dark:border-rose-700" 
    };
  }
  // 青・ネイビー系
  if (cleanColor.includes("青") || cleanColor.includes("ブルー") || cleanColor.includes("blue") || cleanColor.includes("紺") || cleanColor.includes("ネイビー")) {
    return { 
      bg: "bg-blue-600 dark:bg-blue-700", 
      text: "text-white", 
      border: "border-blue-700 dark:border-blue-800" 
    };
  }
  // 緑・カーキ系
  if (cleanColor.includes("緑") || cleanColor.includes("グリーン") || cleanColor.includes("green") || cleanColor.includes("カーキ")) {
    return { 
      bg: "bg-emerald-600 dark:bg-emerald-700", 
      text: "text-white", 
      border: "border-emerald-700 dark:border-emerald-800" 
    };
  }
  // 黄色・ゴールド
  if (cleanColor.includes("黄") || cleanColor.includes("イエロー") || cleanColor.includes("yellow") || cleanColor.includes("金") || cleanColor.includes("ゴールド")) {
    return { 
      bg: "bg-amber-400 dark:bg-amber-500", 
      text: "text-zinc-900 dark:text-white", 
      border: "border-amber-500" 
    };
  }
  // 橙・オレンジ
  if (cleanColor.includes("オレンジ") || cleanColor.includes("orange") || cleanColor.includes("橙")) {
    return { 
      bg: "bg-orange-500", 
      text: "text-white", 
      border: "border-orange-600" 
    };
  }
  // シルバー・グレー
  if (cleanColor.includes("シルバー") || cleanColor.includes("銀") || cleanColor.includes("silver") || cleanColor.includes("グレー") || cleanColor.includes("灰") || cleanColor.includes("gray") || cleanColor.includes("grey")) {
    return { 
      bg: "bg-zinc-400 dark:bg-zinc-500", 
      text: "text-white", 
      border: "border-zinc-500" 
    };
  }
  // 茶色・ベージュ・ブラウン
  if (cleanColor.includes("茶") || cleanColor.includes("ブラウン") || cleanColor.includes("brown") || cleanColor.includes("ベージュ")) {
    return { 
      bg: "bg-amber-800 dark:bg-amber-900", 
      text: "text-white", 
      border: "border-amber-900" 
    };
  }

  // デフォルト
  return { bg: "bg-primary/10", text: "text-primary", border: "border-transparent" };
}
