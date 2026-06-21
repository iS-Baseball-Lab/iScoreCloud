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
  HelpCircle, Settings, Users, Fuel, Palette, Hash, Check
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
        <div className="bg-primary/5 border border-primary/20 text-primary p-4 rounded-3xl text-xs space-y-2 font-bold">
          <div className="flex items-center gap-2 text-sm font-black">
            <Info className="h-4 w-4 shrink-0" />
            <span>チーム遠征・試合時の配車計算に使用されます</span>
          </div>
          <p>
            ご提供いただく車両の「定員」や「燃費（km/L）」をあらかじめ登録しておくことで、自動配車機能や交通費（ガソリン代・高速代）の割り勘精算計算が正確に行われます。
          </p>
          <p className="text-[11px] text-primary/90 border-t border-primary/10 pt-2 font-extrabold leading-normal">
            ⚠️ <strong>「定員」に関する重要事項:</strong>
            <br />
            登録する定員数には<strong>運転手（ご自身）は含めず、同乗可能な最大人数</strong>を指定してください。
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
                    {(() => {
                      const colorStyle = getCarColorClass(car.color);
                      return (
                        <div 
                          className={cn(
                            "h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-300 shadow-sm",
                            colorStyle.bg,
                            colorStyle.text,
                            colorStyle.border
                          )}
                          style={colorStyle.style}
                        >
                          <Car className="h-5 w-5" />
                        </div>
                      );
                    })()}
                    <div className="min-w-0">
                      <h4 className="font-black text-sm truncate">
                        {car.name}
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

                <div className="grid grid-cols-2 gap-x-2 gap-y-2 border-t border-border/40 pt-3 text-xs font-bold">
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>定員: <strong className="text-foreground text-sm font-black">{car.capacity}</strong> 人</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <Fuel className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>燃費: <strong className="text-foreground text-sm font-black">{car.fuelEfficiency}</strong> km/L</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <Palette className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>カラー: <strong className="text-foreground text-sm font-black">{car.color || "未設定"}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>ナンバー: <strong className="text-foreground text-sm font-black">{car.numberPlate || "未設定"}</strong></span>
                  </div>
                </div>
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
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">車の色</label>
                
                {/* 丸いカラーパレット（ビジュアルカラーピッカー） */}
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {[
                    { label: "白", hex: "#ffffff", name: "白" },
                    { label: "黒", hex: "#18181b", name: "黒" },
                    { label: "銀", hex: "#d4d4d8", name: "シルバー" },
                    { label: "灰", hex: "#71717a", name: "グレー" },
                    { label: "赤", hex: "#ef4444", name: "赤" },
                    { label: "青", hex: "#3b82f6", name: "青" },
                    { label: "紺", hex: "#1e3a8a", name: "紺" },
                    { label: "緑", hex: "#10b981", name: "緑" },
                    { label: "黄", hex: "#f59e0b", name: "黄" },
                    { label: "橙", hex: "#f97316", name: "オレンジ" },
                    { label: "茶", hex: "#78350f", name: "茶" }
                  ].map(item => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => setCarColor(item.name)}
                      className={cn(
                        "h-6 w-6 rounded-full border transition-all active:scale-90 cursor-pointer shadow-xs relative flex items-center justify-center",
                        carColor === item.name ? "ring-2 ring-primary ring-offset-2 scale-110" : "border-border"
                      )}
                      style={{ backgroundColor: item.hex }}
                      title={item.name}
                    >
                      {carColor === item.name && (
                        <Check className="h-3.5 w-3.5" style={{ color: (item.label === "白" || item.label === "銀") ? "#000000" : "#ffffff" }} />
                      )}
                    </button>
                  ))}

                  {/* カスタムカラーピッカーボタン (HTML5のcolor inputを活用) */}
                  <div className="relative h-6 w-6 rounded-full border border-border overflow-hidden bg-gradient-to-tr from-rose-400 via-indigo-500 to-emerald-400 cursor-pointer flex items-center justify-center group active:scale-90 transition-transform" title="カスタムカラー選択">
                    <input
                      type="color"
                      value={carColor.startsWith("#") ? carColor : "#3b82f6"}
                      onChange={e => setCarColor(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                    />
                    <Plus className="h-3.5 w-3.5 text-white pointer-events-none drop-shadow-sm" />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Input
                    value={carColor}
                    onChange={e => setCarColor(e.target.value)}
                    placeholder="例: パールホワイト、ダークブルーなど"
                    className="h-11 rounded-xl font-bold flex-1"
                  />
                  {carColor.startsWith("#") && (
                    <div 
                      className="w-11 h-11 rounded-xl border border-border shrink-0 shadow-xs transition-colors duration-300" 
                      style={{ backgroundColor: carColor }} 
                    />
                  )}
                </div>
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
