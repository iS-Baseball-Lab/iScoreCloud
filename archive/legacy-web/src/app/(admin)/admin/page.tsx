// src/app/(admin)/admin/page.tsx
/* 💡 システム管理者専用ダッシュボード */
"use client";

import React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Users, Trophy, Settings } from "lucide-react";

export default function AdminDashboardPage() {
  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        href="/"
        icon={Settings}
        title="システム管理"
        subtitle="iScore プラットフォーム全体の管理を行います。"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 管理者向けクイック統計カード */}
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold">総ユーザー数</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">1,284</div>
          </CardContent>
        </Card>

        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold">稼働チーム数</CardTitle>
            <Trophy className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">342</div>
          </CardContent>
        </Card>
      </div>

      {/* 今後、ここに承認待ちチーム一覧やシステムログなどを実装 */}
      <div className="p-10 text-center rounded-[40px] border-2 border-dashed border-border/50 bg-muted/20">
        <ShieldCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
        <p className="text-muted-foreground font-bold">管理者向け機能（チーム承認・データ監視）をここに集約します</p>
      </div>
    </div>
  );
}