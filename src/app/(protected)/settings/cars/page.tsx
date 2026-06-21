// filepath: src/app/(protected)/settings/cars/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Car, Plus, Trash2, Edit, Loader2, ArrowLeft, AlertCircle, Info, 
  HelpCircle, Settings, Users, Fuel
} from "lucide-react";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { cn } from "@/lib/utils";

interface CarInfo {
  id: string;
  name: string;
  color: string | null;
  numberPlate: string | null;
  capacity: number;
  fuelEfficiency: number;
  carType: "normal" | "cargo" | "bus";
}

interface Member {
  memberId: string;
  userId: string | null;
  name: string;
}

export default function MyCarsPage() {
  const router = useRouter();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [cars, setCars] = useState<CarInfo[]>([]);

  // フォーム用状態 (新規・編集)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCarId, setEditingCarId] = useState<string | null>(null);
  const [carName, setCarName] = useState("");
  const [carColor, setCarColor] = useState("");
  const [carNumberPlate, setCarNumberPlate] = useState("");
  const [carCapacity, setCarCapacity] = useState<number>(4);
  const [carFuelEfficiency, setCarFuelEfficiency] = useState<number>(10);
  const [carType, setCarType] = useState<"normal" | "cargo" | "bus">("normal");

  // 削除確認用状態
  const [deleteTarget, setDeleteTarget] = useState<CarInfo | null>(null);

  // 1. 初期化とマイメンバーID・マイカー一覧の取得
  const fetchCarsData = useCallback(async (tid: string, mid: string) => {
    try {
      const res = await fetch(`/api/carpools/cars?teamId=${tid}&ownerId=${mid}`);
      const json = await res.json() as { success: boolean; data?: CarInfo[] };
      if (json.success) {
        setCars(json.data || []);
      }
    } catch (e) {
      console.error(e);
      toast.error("マイカー一覧の取得に失敗しました。");
    }
  }, []);

  const initialize = useCallback(async (tid: string) => {
    setIsLoading(true);
    try {
      // (1) ログインユーザーのuserIdを取得
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) throw new Error("認証情報の取得に失敗しました。");
      const meJson = await meRes.json() as { success: boolean; data?: { id: string } };
      if (!meJson.success || !meJson.data) throw new Error("認証に失敗しました。");
      const myUserId = meJson.data.id;

      // (2) チームのメンバーリストから、自分(teamMembers.userId === myUserId)を特定する
      const membersRes = await fetch(`/api/teams/${tid}/members`);
      const membersJson = await membersRes.json() as { success: boolean; members?: Member[] };
      if (!membersJson.success) throw new Error("メンバーリストの取得に失敗しました。");

      const myMember = (membersJson.members || []).find(m => m.userId === myUserId);
      if (!myMember) {
        throw new Error("チーム内のメンバー登録が見つかりません。先にメンバー登録を行ってください。");
      }

      setMyMemberId(myMember.memberId);

      // (3) 車両一覧取得
      await fetchCarsData(tid, myMember.memberId);

    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "初期化に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, [fetchCarsData]);

  useEffect(() => {
    const tid = localStorage.getItem("iscore_selectedTeamId");
    if (tid) {
      setTeamId(tid);
      initialize(tid);
    } else {
      setIsLoading(false);
    }
  }, [initialize]);

  // 2. フォームの新規追加・編集ダイアログを開く
  const openFormModal = (car?: CarInfo) => {
    if (car) {
      setEditingCarId(car.id);
      setCarName(car.name);
      setCarColor(car.color || "");
      setCarNumberPlate(car.numberPlate || "");
      setCarCapacity(car.capacity);
      setCarFuelEfficiency(car.fuelEfficiency);
      setCarType(car.carType);
    } else {
      setEditingCarId(null);
      setCarName("");
      setCarColor("");
      setCarNumberPlate("");
      setCarCapacity(4);
      setCarFuelEfficiency(10);
      setCarType("normal");
    }
    setIsFormModalOpen(true);
  };

  // 3. 車両の保存（作成 / 更新）
  const handleSaveCar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !myMemberId) return;
    if (!carName.trim()) {
      toast.error("車両名を入力してください。");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/carpools/cars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingCarId,
          teamId,
          ownerId: myMemberId,
          name: carName.trim(),
          color: carColor.trim() || null,
          numberPlate: carNumberPlate.trim() || null,
          capacity: carCapacity,
          fuelEfficiency: carFuelEfficiency,
          carType
        })
      });

      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error);

      toast.success(editingCarId ? "マイカー情報を更新しました" : "マイカー情報を登録しました");
      setIsFormModalOpen(false);
      await fetchCarsData(teamId, myMemberId);
    } catch (err) {
      console.error(err);
      toast.error("保存に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. 車両の削除
  const handleDeleteCar = async () => {
    if (!teamId || !myMemberId || !deleteTarget) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/carpools/cars/${deleteTarget.id}`, {
        method: "DELETE"
      });

      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error);

      toast.success("車両情報を削除しました");
      setDeleteTarget(null);
      await fetchCarsData(teamId, myMemberId);
    } catch (err) {
      console.error(err);
      toast.error("削除に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Loading My Cars...</p>
        </div>
      </div>
    );
  }

  if (!teamId || !myMemberId) {
    return <div className="p-20 text-center text-muted-foreground">チーム内のメンバー情報が見つからないためマイカー登録ができません。</div>;
  }

  return (
    <div className="flex flex-col min-h-screen text-foreground pb-24">
      <main className="flex-1 px-3 sm:px-6 max-w-2xl mx-auto w-full space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* 戻るボタン */}
        <Button 
          variant="outline" 
          onClick={() => router.back()} 
          className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> 設定メニューへ戻る
        </Button>

        <SectionHeader title="マイカー情報の登録" subtitle="MY CAR REGISTRATION" showPulse={true} />

        {/* インフォメーションアラート */}
        <div className="bg-primary/5 border border-primary/20 text-primary p-4 rounded-3xl text-xs space-y-1.5 font-bold">
          <div className="flex items-center gap-2 text-sm font-black">
            <Info className="h-4 w-4 shrink-0" />
            <span>チーム遠征・試合時の配車計算に使用されます</span>
          </div>
          <p>
            ご提供いただく車両の「定員（運転手除く）」や「燃費（km/L）」をあらかじめ登録しておくことで、自動配車機能や交通費（ガソリン代・高速代）の割り勘精算計算が正確に行われます。
          </p>
        </div>

        {/* コントロールエリア */}
        <div className="flex items-center justify-between bg-card border border-border/40 p-4 rounded-3xl shadow-sm">
          <span className="text-xs font-black text-muted-foreground">登録済み車両数: {cars.length}台</span>
          <Button 
            onClick={() => openFormModal()} 
            className="h-11 px-5 rounded-2xl font-black flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            車両を追加
          </Button>
        </div>

        {/* 車両一覧 */}
        {cars.length === 0 ? (
          <EmptyState 
            icon={Car} 
            title="登録された車両はありません" 
            description="「車両を追加」ボタンから、遠征に提供可能なマイカーの情報を登録してください。"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cars.map((car) => (
              <div 
                key={car.id} 
                className="bg-card border border-border/40 p-5 rounded-3xl shadow-xs hover:shadow-sm transition-all space-y-4 relative overflow-hidden group"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Car className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-black text-sm flex items-center gap-1.5 truncate">
                        {car.color && <span className="text-zinc-500">{car.color}の</span>}
                        <span>{car.name}</span>
                        {car.numberPlate && (
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-zinc-500 font-extrabold">
                            [{car.numberPlate}]
                          </span>
                        )}
                      </h4>
                      <span className={cn(
                        "inline-block text-[8px] font-black uppercase px-2 py-0.5 rounded-full border tracking-wider mt-1",
                        car.carType === 'cargo' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' : 
                        car.carType === 'bus' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' : 
                        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      )}>
                        {car.carType === 'cargo' ? '道具車' : car.carType === 'bus' ? 'マイクロバス/大型' : '普通車'}
                      </span>
                    </div>
                  </div>

                  {/* アクションボタン */}
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => openFormModal(car)}
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted"
                    >
                      <Edit className="h-4.5 w-4.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setDeleteTarget(car)}
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-border/40 pt-3 text-xs font-bold">
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>定員: <strong className="text-foreground text-sm font-black">{car.capacity}</strong> 人</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <Fuel className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>燃費: <strong className="text-foreground text-sm font-black">{car.fuelEfficiency}</strong> km/L</span>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground font-bold leading-tight">
                  ※定員にドライバー（ご自身）は含まれません。同乗可能な人数を指定しています。
                </p>
              </div>
            ))}
          </div>
        )}

        {/* 登録・編集フォームダイアログ */}
        <Dialog open={isFormModalOpen} onOpenChange={setIsFormModalOpen}>
          <DialogContent className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="font-black text-lg">
                {editingCarId ? "車両情報の編集" : "新しい車両の登録"}
              </DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground">
                提供可能なマイカーの乗車スペックを入力してください。
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveCar} className="space-y-4 pt-2">
              {/* 車両名 */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">車両名 (必須)</label>
                <Input
                  value={carName}
                  onChange={e => setCarName(e.target.value)}
                  required
                  placeholder="例: セレナ、アルファードなど"
                  className="h-11 rounded-xl font-bold"
                />
              </div>

              {/* 車の色 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">車の色</label>
                
                {/* クイック選択バッジ */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {["白", "黒", "シルバー", "グレー", "紺", "青", "赤", "茶"].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCarColor(color)}
                      className={cn(
                        "px-2.5 py-1 text-[10px] font-black rounded-lg border transition-all active:scale-95 cursor-pointer",
                        carColor === color 
                          ? "bg-primary border-primary text-white" 
                          : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {color}
                    </button>
                  ))}
                </div>

                <Input
                  value={carColor}
                  onChange={e => setCarColor(e.target.value)}
                  placeholder="例: パールホワイト、ダークブルーなど"
                  className="h-11 rounded-xl font-bold"
                />
              </div>

              {/* 車のナンバー */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">車両ナンバー (下4桁など)</label>
                <Input
                  value={carNumberPlate}
                  onChange={e => setCarNumberPlate(e.target.value)}
                  placeholder="例: 12-34"
                  className="h-11 rounded-xl font-bold"
                />
              </div>

              {/* 定員 ＆ 燃費 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">同乗可能人数 (運転手除く)</label>
                  <select 
                    value={carCapacity} 
                    onChange={e => setCarCapacity(Number(e.target.value))}
                    className="w-full h-11 rounded-xl border border-border bg-muted/20 px-3 text-sm font-bold shadow-xs focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20].map(n => (
                      <option key={n} value={n}>{n} 人</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">実燃費 (km/L - 目安)</label>
                  <select 
                    value={carFuelEfficiency} 
                    onChange={e => setCarFuelEfficiency(Number(e.target.value))}
                    className="w-full h-11 rounded-xl border border-border bg-muted/20 px-3 text-sm font-bold shadow-xs focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                  >
                    {[5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 25, 30].map(f => (
                      <option key={f} value={f}>{f} km/L</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 車種タイプ */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">車両区分</label>
                <select 
                  value={carType} 
                  onChange={e => setCarType(e.target.value as any)}
                  className="w-full h-11 rounded-xl border border-border bg-muted/20 px-3 text-sm font-bold shadow-xs focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                >
                  <option value="normal">普通車 (主に人の移動用)</option>
                  <option value="cargo">道具車 (バックや大物荷物を積む優先車)</option>
                  <option value="bus">マイクロバス・大型車</option>
                </select>
              </div>

              <DialogFooter className="flex flex-col gap-2 w-full pt-2 sm:flex-col">
                <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl font-black text-white text-sm">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存する"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsFormModalOpen(false)} className="w-full h-12 rounded-xl font-bold text-sm">
                  キャンセル
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 削除確認ダイアログ */}
        <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-xs" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="font-black text-base text-rose-500">車両情報の削除</DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground leading-snug">
                車両 <strong>{deleteTarget?.name}</strong> を削除しますか？ <br />
                ※この操作は取り消せません。
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="flex flex-col gap-2 w-full pt-2 sm:flex-col">
              <Button 
                onClick={handleDeleteCar} 
                disabled={isSubmitting} 
                className="w-full h-12 rounded-xl font-black text-white text-sm bg-rose-500 hover:bg-rose-600 border-none"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "削除する"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} className="w-full h-12 rounded-xl font-bold text-sm">
                キャンセル
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}
