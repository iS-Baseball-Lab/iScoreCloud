// filepath: src/app/(protected)/settings/venues/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  MapPin, Plus, Trash2, Edit, Loader2, ArrowLeft, Info, 
  ExternalLink, Layers, Compass, FileText, Search, Map
} from "lucide-react";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { cn } from "@/lib/utils";

interface VenueInfo {
  id: string;
  name: string;
  shortName: string | null;
  address: string | null;
  mapUrl: string | null;
  surfaceType: string | null;
  dimensions: string | null;
  notes: string | null;
  createdAt?: string | Date;
}

export default function VenuesSettingsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [venues, setVenues] = useState<VenueInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // 地図のインライン展開状態の管理
  const [expandedVenues, setExpandedVenues] = useState<Record<string, boolean>>({});

  const toggleMap = (id: string) => {
    setExpandedVenues(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const getEmbedUrl = useCallback((venue: VenueInfo) => {
    if (!venue.mapUrl) return "";
    if (venue.mapUrl.includes("google.com/maps/embed")) {
      return venue.mapUrl;
    }
    const query = venue.address || venue.name;
    return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
  }, []);

  // フォーム用状態 (新規・編集)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("");
  const [venueShortName, setVenueShortName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueMapUrl, setVenueMapUrl] = useState("");
  const [venueSurfaceType, setVenueSurfaceType] = useState<"dirt" | "turf" | "grass">("dirt");
  const [venueDimensions, setVenueDimensions] = useState("");
  const [venueNotes, setVenueNotes] = useState("");

  // 削除確認用状態
  const [deleteTarget, setDeleteTarget] = useState<VenueInfo | null>(null);

  // 1. データ取得
  const fetchVenues = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/venues");
      const json = await res.json() as { success: boolean; data?: VenueInfo[]; error?: string };
      if (json.success) {
        setVenues(json.data || []);
      } else {
        throw new Error(json.error || "球場一覧の取得に失敗しました。");
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "球場情報の取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  // 2. 検索・フィルタリング
  const filteredVenues = useMemo(() => {
    if (!searchQuery.trim()) return venues;
    const query = searchQuery.toLowerCase();
    return venues.filter(v => 
      v.name.toLowerCase().includes(query) || 
      (v.shortName && v.shortName.toLowerCase().includes(query)) ||
      (v.address && v.address.toLowerCase().includes(query)) ||
      (v.notes && v.notes.toLowerCase().includes(query))
    );
  }, [venues, searchQuery]);

  // 3. フォームモーダルを開く
  const openFormModal = (venue?: VenueInfo) => {
    if (venue) {
      setEditingVenueId(venue.id);
      setVenueName(venue.name);
      setVenueShortName(venue.shortName || "");
      setVenueAddress(venue.address || "");
      setVenueMapUrl(venue.mapUrl || "");
      setVenueSurfaceType((venue.surfaceType as any) || "dirt");
      setVenueDimensions(venue.dimensions || "");
      setVenueNotes(venue.notes || "");
    } else {
      setEditingVenueId(null);
      setVenueName("");
      setVenueShortName("");
      setVenueAddress("");
      setVenueMapUrl("");
      setVenueSurfaceType("dirt");
      setVenueDimensions("");
      setVenueNotes("");
    }
    setIsFormModalOpen(true);
  };

  // 4. 球場の保存（作成 / 更新）
  const handleSaveVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venueName.trim()) {
      toast.error("球場名を入力してください。");
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingVenueId ? `/api/venues/${editingVenueId}` : "/api/venues";
      const method = editingVenueId ? "PATCH" : "POST";
      
      const payload = {
        name: venueName.trim(),
        shortName: venueShortName.trim() || null,
        address: venueAddress.trim() || null,
        mapUrl: venueMapUrl.trim() || null,
        surfaceType: venueSurfaceType,
        dimensions: venueDimensions.trim() || null,
        notes: venueNotes.trim() || null,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error || "保存に失敗しました。");

      toast.success(editingVenueId ? "球場情報を更新しました" : "球場情報を登録しました");
      setIsFormModalOpen(false);
      await fetchVenues();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. 球場の削除
  const handleDeleteVenue = async () => {
    if (!deleteTarget) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/venues/${deleteTarget.id}`, {
        method: "DELETE"
      });

      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error || "削除に失敗しました。");

      toast.success("球場情報を削除しました");
      setDeleteTarget(null);
      await fetchVenues();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "削除に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Loading Venues...</p>
        </div>
      </div>
    );
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

        <SectionHeader title="球場・グラウンド設定" subtitle="VENUE SETTINGS" showPulse={true} />

        {/* 説明アラート */}
        <div className="bg-primary/5 border border-primary/20 text-primary p-4 rounded-3xl text-xs space-y-2 font-bold">
          <div className="flex items-center gap-2 text-sm font-black">
            <Info className="h-4 w-4 shrink-0" />
            <span>予定登録や配車・持ち物連絡とスムーズに連動します</span>
          </div>
          <p>
            よく利用する球場・グラウンド情報をあらかじめ登録しておくことで、試合スケジュール作成時の表記ゆれを防ぎます。
          </p>
          <p className="text-[11px] text-primary/90 border-t border-primary/10 pt-2 font-extrabold leading-normal">
            📍 <strong>マップURLとサーフェス（グラウンド種別）:</strong>
            <br />
            Googleマップの共有リンクを登録しておけば、メンバーへの配車連絡や出欠LINEテキストにマップURLが自動挿入されます。また、グラウンドの種別（土/芝）を設定することで、メンバーが必要なスパイクの準備をしやすくなります。
          </p>
        </div>

        {/* コントロール & 検索エリア */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-card border border-border/40 p-4 rounded-3xl shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="球場名・住所で検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-2xl font-bold bg-muted/20 border-border"
            />
          </div>
          <Button 
            onClick={() => openFormModal()} 
            className="h-11 px-5 rounded-2xl font-black flex items-center gap-1.5 shrink-0"
          >
            <Plus className="h-4 w-4" />
            球場を追加
          </Button>
        </div>

        {/* 一覧表示 */}
        {filteredVenues.length === 0 ? (
          <EmptyState 
            icon={MapPin} 
            title={searchQuery ? "一致する球場が見つかりません" : "登録された球場はありません"} 
            description={searchQuery ? "検索ワードを変えてお試しください。" : "「球場を追加」ボタンから、よく使うグラウンドの情報を登録してください。"}
          />
        ) : (
          <div className="space-y-4">
            {filteredVenues.map((venue) => (
              <div 
                key={venue.id} 
                className="bg-card border border-border/40 p-5 rounded-3xl shadow-xs hover:shadow-sm transition-all space-y-4 relative overflow-hidden group"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn(
                      "h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 border shadow-sm",
                      venue.surfaceType === 'grass' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 
                      venue.surfaceType === 'turf' ? 'bg-teal-500/10 text-teal-600 border-teal-500/20' : 
                      'bg-amber-600/10 text-amber-700 border-amber-600/20'
                    )}>
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-black text-base text-card-foreground leading-tight truncate">
                          {venue.name}
                        </h4>
                        {venue.shortName && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-muted text-muted-foreground shrink-0">
                            {venue.shortName}
                          </span>
                        )}
                      </div>
                      
                      {venue.address && (
                        <p className="text-xs font-bold text-zinc-500 mt-1 flex items-center gap-1.5">
                          <Compass className="h-3 w-3 shrink-0" />
                          <span className="truncate">{venue.address}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* アクションボタン */}
                  <div className="flex items-center gap-1 shrink-0">
                    {venue.mapUrl && (
                      <>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => toggleMap(venue.id)}
                          className={cn(
                            "h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors",
                            expandedVenues[venue.id] && "bg-primary/10 text-primary"
                          )}
                          title={expandedVenues[venue.id] ? "地図を非表示" : "地図をインライン表示"}
                        >
                          <Map className="h-4.5 w-4.5" />
                        </Button>
                        <a 
                          href={venue.mapUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                          title="Google Map で直接開く"
                        >
                          <ExternalLink className="h-4.5 w-4.5" />
                        </a>
                      </>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => openFormModal(venue)}
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted"
                    >
                      <Edit className="h-4.5 w-4.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setDeleteTarget(venue)}
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </Button>
                  </div>
                </div>

                {/* メタ情報 */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-2 border-t border-border/40 pt-3 text-xs font-bold">
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>グラウンド: <strong className="text-foreground font-black">
                      {venue.surfaceType === 'grass' ? '天然芝' : 
                       venue.surfaceType === 'turf' ? '人工芝' : '土'}
                    </strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <Map className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>広さ・設備: <strong className="text-foreground font-black">{venue.dimensions || "未設定"}</strong></span>
                  </div>
                </div>

                {venue.notes && (
                  <div className="bg-muted/30 p-2.5 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 font-medium flex gap-2">
                    <FileText className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                    <p className="leading-normal break-words whitespace-pre-wrap flex-1">{venue.notes}</p>
                  </div>
                )}

                {/* 🗺️ 地図のインライン埋め込み表示 */}
                {venue.mapUrl && expandedVenues[venue.id] && (
                  <div className="w-full aspect-video rounded-2xl overflow-hidden border border-border/40 shadow-inner animate-in fade-in duration-300">
                    <iframe
                      src={getEmbedUrl(venue)}
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      allowFullScreen={false}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      title={`${venue.name}の地図`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 登録・編集フォームダイアログ */}
        <Dialog open={isFormModalOpen} onOpenChange={setIsFormModalOpen}>
          <DialogContent className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="font-black text-lg">
                {editingVenueId ? "球場情報の編集" : "新しい球場の登録"}
              </DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground">
                予定作成やメンバーへの連絡時に使用されるグラウンド詳細を入力します。
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveVenue} className="space-y-4 pt-2">
              
              {/* 球場名 */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">球場・グラウンド名 (必須)</label>
                <Input
                  value={venueName}
                  onChange={e => setVenueName(e.target.value)}
                  required
                  placeholder="例: 多摩川緑地野球場 A面"
                  className="h-11 rounded-xl font-bold"
                />
              </div>

              {/* 略称 */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">略称・表示名 (任意)</label>
                <Input
                  value={venueShortName}
                  onChange={e => setVenueShortName(e.target.value)}
                  placeholder="例: 多摩川A、等々力など"
                  className="h-11 rounded-xl font-bold"
                />
              </div>

              {/* 住所 */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">住所 (任意)</label>
                <Input
                  value={venueAddress}
                  onChange={e => setVenueAddress(e.target.value)}
                  placeholder="例: 東京都大田区本羽田3丁目"
                  className="h-11 rounded-xl font-bold"
                />
              </div>

              {/* マップURL */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Googleマップ共有リンク/URL (任意)</label>
                <Input
                  value={venueMapUrl}
                  onChange={e => setVenueMapUrl(e.target.value)}
                  type="url"
                  placeholder="https://maps.app.goo.gl/..."
                  className="h-11 rounded-xl font-bold text-xs"
                />
              </div>

              {/* グラウンドのタイプ */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">サーフェス (グラウンド種別)</label>
                <select 
                  value={venueSurfaceType} 
                  onChange={e => setVenueSurfaceType(e.target.value as any)}
                  className="w-full h-11 rounded-xl border border-border bg-muted/20 px-3 text-sm font-bold shadow-xs focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                >
                  <option value="dirt">土 (Dirt - 金属不可/ポイント推奨など)</option>
                  <option value="turf">人工芝 (Artificial Turf - スパイク規定注意)</option>
                  <option value="grass">天然芝 (Natural Grass)</option>
                </select>
              </div>

              {/* 広さ・寸法・設備 */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">球場サイズ・設備情報 (任意)</label>
                <Input
                  value={venueDimensions}
                  onChange={e => setVenueDimensions(e.target.value)}
                  placeholder="例: 両翼90m センター110m、照明あり、両翼95mなど"
                  className="h-11 rounded-xl font-bold"
                />
              </div>

              {/* 補足メモ */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">補足メモ・特記事項 (任意)</label>
                <textarea
                  value={venueNotes}
                  onChange={e => setVenueNotes(e.target.value)}
                  placeholder="例: 駐車場は河川敷内の無料Pを利用。ベンチは3塁側が日陰になります。"
                  rows={3}
                  className="w-full rounded-xl border border-border bg-transparent p-3 text-sm font-bold shadow-xs focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 placeholder:text-muted-foreground"
                />
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
              <DialogTitle className="font-black text-base text-rose-500">球場情報の削除</DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground leading-snug">
                球場 <strong>{deleteTarget?.name}</strong> を削除しますか？ <br />
                ※この操作は取り消せません。他の試合データ等で参照されている場合でも削除されます。
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="flex flex-col gap-2 w-full pt-2 sm:flex-col">
              <Button 
                onClick={handleDeleteVenue} 
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
