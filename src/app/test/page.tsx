// filepath: src/app/test/page.tsx
/* 💡 iScoreCloud 規約: 
   1. 現場での最終確認用として、実際の LINE Push 送信をトリガーするボタンを配置。
   2. 成功/失敗のステータスを即座にフィードバックする。 */

"use client";

import React, { useState } from "react";
import { LineSettingsCard } from "@/components/features/teams/line-settings-card";
import { TeamSettingsUpdatePayload, TeamSettingsUpdateResponse } from "@/api/teams/update-settings";
import { Button } from "@/components/ui/button"; // 🌟 ボタンをインポート
import { SendHorizontal } from "lucide-react"; // 🌟 アイコン追加

export default function LineIntegrationTestPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const testTeamId = "test-team-001";

  // --- 既存の保存処理 ---
  const handleSave = async (settings: { 
    lineGroupId: string; 
    isAutoReportEnabled: boolean;
    reportPlayballEnabled: boolean;
    reportInningEnabled: boolean;
    reportGameSetEnabled: boolean;
  }) => {
    setStatus("⏳ D1へ送信中...");
    const payload: TeamSettingsUpdatePayload = {
      teamId: testTeamId,
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
        setStatus(`✅ 保存完了! (ID: ${data.data?.updatedId})`);
      } else {
        setStatus(`❌ エラー: ${data.error}`);
      }
    } catch (err) {
      setStatus("❌ ネットワークエラーが発生しました");
    }
  };

  // --- 🌟 追加：LINE送信テスト処理 ---
  const handleTestPush = async () => {
    setIsPushing(true);
    setStatus("🚀 LINEへ速報を射出中...");

    try {
      const res = await fetch("/api/teams/test-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: testTeamId }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus("🎉 LINE着弾成功！スマホを確認してください！");
      } else {
        setStatus(`❌ 送信失敗: ${data.error}`);
      }
    } catch (err) {
      setStatus("❌ 送信エラー: Workerのルーティングを確認してください");
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 space-y-8 max-w-md mx-auto">
      <header className="space-y-2 pt-8">
        <h1 className="text-3xl font-black italic tracking-tighter uppercase text-primary">
          LINE Integration
        </h1>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-primary/10 px-3 py-1 rounded-full border border-primary/20 inline-block">
          Messaging API / Push Test
        </p>
      </header>

      <main className="space-y-6">
        {/* 設定カード */}
        <LineSettingsCard 
          teamId={testTeamId}
          initialGroupId="" 
          initialIsEnabled={false}
          onSave={handleSave}
        />

        {/* 🌟 速報テスト送信ボタン */}
        <div className="pt-4">
          <Button 
            onClick={handleTestPush}
            disabled={isPushing}
            variant="outline"
            className="w-full h-16 rounded-[25px] border-2 border-primary text-primary font-black italic gap-3 hover:bg-primary/5 transition-all"
          >
            <SendHorizontal className={`w-6 h-6 ${isPushing ? "animate-ping" : ""}`} />
            {isPushing ? "SENDING..." : "LINE速報テスト送信"}
          </Button>
        </div>

        {/* ステータス表示 */}
        {status && (
          <div className="bg-secondary p-5 rounded-[30px] border-2 border-border animate-in fade-in slide-in-from-bottom-2 shadow-sm">
            <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">System Status</p>
            <p className="font-mono text-xs font-bold text-primary break-all leading-relaxed">
              {status}
            </p>
          </div>
        )}
      </main>

      <footer className="pt-12 text-center opacity-30">
        <p className="text-[10px] font-black italic tracking-widest uppercase">
          iScoreCloud Quality Assurance
        </p>
      </footer>
    </div>
  );
}
