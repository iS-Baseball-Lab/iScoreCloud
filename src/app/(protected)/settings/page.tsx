"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Wrench, SendHorizontal, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { useTeam } from "@/contexts/TeamContext";
import { LineSettingsCard } from "@/components/features/teams/line-settings-card";
import { TeamSettingsUpdatePayload, TeamSettingsUpdateResponse } from "@/api/teams/update-settings";
import { toast } from "sonner";

export default function SettingsPage() {
  const router = useRouter();
  const { currentTeam, isLoading: isTeamLoading } = useTeam();
  
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
