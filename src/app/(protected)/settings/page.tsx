"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Wrench, SendHorizontal, AlertCircle, Car, MapPin, Camera, Upload, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { useTeam } from "@/contexts/TeamContext";
import { LineSettingsCard } from "@/components/features/teams/line-settings-card";
import { TeamSettingsUpdatePayload, TeamSettingsUpdateResponse } from "@/api/teams/update-settings";
import { toast } from "sonner";

export default function SettingsPage() {
  const router = useRouter();
  const { currentTeam, selectTeam, isLoading: isTeamLoading } = useTeam();
  
  const [lineSettings, setLineSettings] = useState<{
    lineGroupId: string;
    isAutoReportEnabled: boolean;
    reportPlayballEnabled: boolean;
    reportInningEnabled: boolean;
    reportGameSetEnabled: boolean;
  } | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  // 💡 チームIDが変更されたらLINE設定を取得
  useEffect(() => {
    if (!currentTeam?.id) return;

    const fetchSettings = async () => {
      setIsLoadingSettings(true);
      try {
        const res = await fetch(`/api/teams/${currentTeam.id}/line-settings`);
        const data = (await res.json()) as any;
        if (data.success && data.data) {
          setLineSettings(data.data);
        } else {
          toast.error("LINE設定の取得に失敗しました");
        }
      } catch (err) {
        console.error("Failed to fetch settings", err);
        toast.error("ネットワークエラーが発生しました");
      } finally {
        setIsLoadingSettings(false);
      }
    };

    fetchSettings();
  }, [currentTeam?.id]);

  // 💡 チームアイコン（ロゴ）のアップロード・保存処理
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentTeam?.id) return;

    setLogoUploading(true);
    setStatus("⏳ 画像をアップロード中...");

    const formData = new FormData();
    formData.append("file", file);

    try {
      // 1. 画像アップロード API を叩く (type=team)
      const uploadRes = await fetch("/api/images/upload?type=team", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json() as { success: boolean; imageUrl?: string; error?: string };

      if (!uploadData.success || !uploadData.imageUrl) {
        throw new Error(uploadData.error || "アップロードに失敗しました");
      }

      const imageUrl = uploadData.imageUrl;

      // 2. チーム情報の更新 API を叩く
      setStatus("⏳ チーム情報を更新中...");
      const updateRes = await fetch(`/api/teams/${currentTeam.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoImageUrl: imageUrl }),
      });
      const updateData = await updateRes.json() as { success: boolean; error?: string };

      if (updateData.success) {
        // 3. グローバルコンテキスト（とlocalStorage）を即時更新
        selectTeam({
          id: currentTeam.id,
          name: currentTeam.name,
          organizationCategory: currentTeam.organizationCategory,
          logoImageUrl: imageUrl,
        });
        setStatus("✅ チームアイコンが正常に更新されました。");
        toast.success("チームアイコンを変更しました");
      } else {
        throw new Error(updateData.error || "更新に失敗しました");
      }
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ エラー: ${err.message || "処理に失敗しました"}`);
      toast.error(err.message || "アイコンの変更に失敗しました");
    } finally {
      setLogoUploading(false);
    }
  };

  // 💡 設定の保存処理
  const handleSave = async (settings: {
    lineGroupId: string;
    isAutoReportEnabled: boolean;
    reportPlayballEnabled: boolean;
    reportInningEnabled: boolean;
    reportGameSetEnabled: boolean;
  }) => {
    if (!currentTeam?.id) return;

    setStatus("⏳ D1へ送信中...");
    const payload: TeamSettingsUpdatePayload = {
      teamId: currentTeam.id,
      lineGroupId: settings.lineGroupId,
      isAutoReportEnabled: settings.isAutoReportEnabled,
      reportPlayballEnabled: settings.reportPlayballEnabled,
      reportInningEnabled: settings.reportInningEnabled,
      reportGameSetEnabled: settings.reportGameSetEnabled,
    };

    try {
      const res = await fetch("/api/teams/update-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as TeamSettingsUpdateResponse;
      if (data.success) {
        setStatus("✅ 設定が正常に保存されました。");
        toast.success("設定を保存しました");
        // 最新の状態に更新
        setLineSettings(settings);
      } else {
        setStatus(`❌ 保存エラー: ${data.error}`);
        toast.error("保存に失敗しました");
      }
    } catch (err) {
      setStatus("❌ ネットワークエラーが発生しました");
      toast.error("通信エラーが発生しました");
    }
  };

  // 💡 LINEテスト送信
  const handleTestPush = async () => {
    if (!currentTeam?.id) return;
    setIsPushing(true);
    setStatus("🚀 LINEへ速報を射出中...");

    try {
      const res = await fetch("/api/teams/test-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: currentTeam.id }),
      });
      const data = (await res.json()) as any;

      if (data.success) {
        setStatus("🎉 LINE着弾成功！スマホを確認してください！");
        toast.success("テスト送信が完了しました");
      } else {
        setStatus(`❌ 送信失敗: ${data.error}`);
        toast.error("送信に失敗しました");
      }
    } catch (err) {
      setStatus("❌ 送信エラーが発生しました");
      toast.error("通信エラーが発生しました");
    } finally {
      setIsPushing(false);
    }
  };

  const isLoaded = !isTeamLoading && !isLoadingSettings;

  return (
    <div className="min-h-screen p-4 sm:p-6 pt-8 pb-32 animate-in fade-in duration-400">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* ヘッダーエリア */}
        <div className="flex items-center justify-between">
          <SectionHeader title="アプリ設定" subtitle="SETTINGS" showPulse={false} />
        </div>

        {isTeamLoading || isLoadingSettings ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            <p className="text-sm font-bold text-muted-foreground">読み込み中...</p>
          </div>
        ) : !currentTeam ? (
          /* チーム未選択時のガイダンス */
          <div className="bg-card border-2 border-border/80 rounded-[40px] p-12 text-center space-y-6">
            <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="h-10 w-10 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-foreground">
                チームが選択されていません
              </h2>
              <p className="text-sm font-bold text-muted-foreground max-w-sm mx-auto">
                アプリ設定を変更するには、まずダッシュボード等でチームを選択してください。
              </p>
            </div>
            <Button
              onClick={() => router.push("/dashboard")}
              className="rounded-full font-bold px-8 h-12 shadow-sm active:scale-95 transition-all bg-primary text-primary-foreground"
            >
              ダッシュボードへ移動
            </Button>
          </div>
        ) : (
          /* 本格設定フォーム */
          <div className="space-y-6">
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex items-center justify-between">
              <p className="text-sm font-bold">
                対象チーム: <span className="font-black text-primary">{currentTeam.name}</span>
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/teams")}
                className="text-xs font-black text-primary underline"
              >
                チームを切り替える
              </Button>
            </div>

            {/* 💡 チームアイコン設定カード */}
            <div className="bg-card border border-border/40 rounded-[30px] p-6 sm:p-8 space-y-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-border/40 pb-4">
                <div>
                  <h3 className="text-lg font-black text-foreground flex items-center gap-2">
                    <Camera className="h-5 w-5 text-primary" />
                    チームアイコン設定
                  </h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                    Team Icon Settings
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* プレビュー */}
                <div className="relative group shrink-0">
                  <Avatar className="h-24 w-24 sm:h-28 sm:w-28 border-2 border-primary/20 bg-background shadow-inner flex items-center justify-center overflow-hidden">
                    {currentTeam.logoImageUrl && (
                      <img src={currentTeam.logoImageUrl} alt="Team Icon" className="h-full w-full object-contain" />
                    )}
                    <AvatarFallback className="w-full h-full flex items-center justify-center text-primary font-black text-2xl bg-primary/5 select-none">
                      {currentTeam.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {logoUploading && (
                    <div className="absolute inset-0 bg-background/70 backdrop-blur-sm rounded-full flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    </div>
                  )}
                </div>

                {/* 操作エリア */}
                <div className="flex-1 space-y-4 text-center sm:text-left">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-foreground">ロゴ画像をアップロード</p>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG, WEBP形式の画像を推奨します。設定された画像はチームのマークとして表示されます。
                    </p>
                  </div>

                  <div className="flex justify-center sm:justify-start">
                    <label className={cn(
                      "flex items-center gap-2 px-5 h-11 rounded-full font-black text-xs sm:text-sm bg-primary text-primary-foreground shadow-sm hover:scale-[1.02] active:scale-95 transition-all cursor-pointer",
                      logoUploading && "pointer-events-none opacity-50"
                    )}>
                      <Upload className="h-4 w-4" />
                      {logoUploading ? "アップロード中..." : "画像を選択する"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                        disabled={logoUploading}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* LINE連携カード */}
            {lineSettings && (
              <LineSettingsCard
                teamId={currentTeam.id}
                initialGroupId={lineSettings.lineGroupId}
                initialIsEnabled={lineSettings.isAutoReportEnabled}
                initialPlayballEnabled={lineSettings.reportPlayballEnabled}
                initialInningEnabled={lineSettings.reportInningEnabled}
                initialGameSetEnabled={lineSettings.reportGameSetEnabled}
                onSave={handleSave}
              />
            )}

            {/* 💡 車両・球場設定へのリンクカード */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              <button
                onClick={() => router.push("/settings/cars")}
                className="flex items-center gap-4 p-5 rounded-2xl bg-card border border-border/40 hover:border-primary/40 hover:bg-muted/10 transition-all text-left w-full shadow-sm cursor-pointer group"
              >
                <div className="p-3.5 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all shrink-0">
                  <Car className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-foreground">車両・配車設定</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Car Settings</p>
                </div>
              </button>

              <button
                onClick={() => router.push("/settings/venues")}
                className="flex items-center gap-4 p-5 rounded-2xl bg-card border border-border/40 hover:border-primary/40 hover:bg-muted/10 transition-all text-left w-full shadow-sm cursor-pointer group"
              >
                <div className="p-3.5 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all shrink-0">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-foreground">球場・グラウンド設定</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Venue Settings</p>
                </div>
              </button>
            </div>

            {/* LINEテスト送信セクション */}
            {lineSettings?.lineGroupId && lineSettings?.isAutoReportEnabled && (
              <div className="pt-4 space-y-4">
                <Button 
                  onClick={handleTestPush}
                  disabled={isPushing}
                  variant="outline"
                  className="w-full h-16 rounded-[25px] border-2 border-primary text-primary font-black italic gap-3 hover:bg-primary/5 transition-all active:scale-95 shadow-md"
                >
                  <SendHorizontal className={`w-6 h-6 ${isPushing ? "animate-pulse text-[#06C755]" : ""}`} />
                  {isPushing ? "SENDING..." : "LINE速報テスト送信"}
                </Button>
              </div>
            )}

            {/* システムステータス表示 */}
            {status && (
              <div className="bg-secondary p-5 rounded-[30px] border-2 border-border animate-in fade-in slide-in-from-bottom-2 shadow-sm">
                <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">System Status</p>
                <p className="font-mono text-xs font-bold text-primary break-all leading-relaxed">
                  {status}
                </p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
