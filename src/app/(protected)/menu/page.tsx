// filepath: src/app/menu/page.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { 
  LogOut, User, Settings, HelpCircle, ChevronRight, Activity, Calendar,
  LayoutDashboard, Users, Contact, CalendarCheck, Trophy, FileText, Shield, Zap,
  UserPlus, ScrollText, CalendarPlus, Timer, ShieldCheck, MapPin, BookOpen,
  History // 🔥 プレイログ用のアイコンを追加
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { SectionHeader } from "@/components/layout/SectionHeader";

export default function MenuPage() {
  const router = useRouter();

  const handleLogout = async () => {
    await authClient.signOut();
    toast.success("iScoreCloudから退出しました。お疲れ様でした！");
    router.push("/");
    router.refresh();
  };

  const menuSections = [
    {
      title: "アカウント",
      items: [
        { icon: User, label: "プロフィール設定", href: "/profile" },
        { icon: Settings, label: "アプリ設定", href: "/settings" },
        { icon: UserPlus, label: "チーム参加申請", href: "/teams/join" },
      ],
    },
    {
      title: "試合・スコア",
      items: [
        { icon: LayoutDashboard, label: "ダッシュボード", href: "/dashboard" },
        { icon: ScrollText, label: "試合一覧", href: "/matches" },
        { icon: CalendarPlus, label: "試合予定登録", href: "/matches/create?mode=real" },
        { icon: Activity, label: "ライブスコア入力", href: "/matches/create?mode=live" },
        { icon: Timer, label: "クイックスコア入力", href: "/matches/create?mode=quick" },
        { icon: BookOpen, label: "スコアブック", href: "/matches/scorebook" },
        { icon: History, label: "プレイログ", href: "/matches/play-logs" },
      ],
    },
    {
      title: "チーム・選手",
      items: [
        { icon: Users, label: "チーム編成", href: "/teams" },
        { icon: Shield, label: "チーム情報", href: "/team" },
        { icon: Contact, label: "選手名簿", href: "/players" },
      ],
    },
    {
      title: "大会・球場",
      items: [
        { icon: Trophy, label: "大会・イベント", href: "/tournaments" },
        { icon: MapPin, label: "球場・グラウンド", href: "/grounds" },
      ],
    },
    {
      title: "支援・その他",
      items: [
        { icon: CalendarCheck, label: "出欠管理", href: "/attendance" },
        { icon: Zap, label: "試合速報ジェネレーター", href: "/news-generator" },
      ],
    },
    {
      title: "サポート",
      items: [
        { icon: HelpCircle, label: "使い方・マニュアル", href: "/help" },
        { icon: FileText, label: "利用規約", href: "/terms" },
        { icon: ShieldCheck, label: "プライバシーポリシー", href: "/privacy" },
      ],
    },
  ];

  return (
    <div className="min-h-screen p-4 sm:p-6 pt-8 pb-32 animate-in fade-in duration-400">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* ━━ ページヘッダー ━━ */}
        <SectionHeader title="メニュー" subtitle="MENU" showPulse={false} />

        {/* ━━ メニュー項目リスト ━━ */}
        <div className="space-y-6">
          {menuSections.map((section) => (
            <div key={section.title} className="space-y-3">
              
              {/* ━━ カスタマイズされた見出し（画像ベース） ━━ */}
              <div className="flex items-center gap-2 px-1">
                {/* 縦線のアクセント */}
                <div className="w-1.5 h-4 bg-primary rounded-full shadow-sm" />
                {/* 見出しテキスト */}
                <h3 className="font-black text-sm text-foreground tracking-wide">
                  {section.title}
                </h3>
                {/* 項目数をバッジとして表示 */}
                <span className="flex items-center justify-center bg-muted text-muted-foreground text-[10px] font-bold px-2 py-0.5 rounded-full border border-border/50">
                  {section.items.length}
                </span>
              </div>
              
              <div className="bg-card border border-border rounded-[var(--radius-xl)] overflow-hidden shadow-sm">
                {section.items.map((item, index) => (
                  <button
                    key={item.label}
                    onClick={() => router.push(item.href)}
                    className={`w-full h-14 px-5 flex items-center justify-between hover:bg-muted/50 active:bg-muted transition-colors ${
                      index !== section.items.length - 1 ? "border-b border-border/50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="h-8 w-8 rounded-full bg-primary/5 flex items-center justify-center">
                        <item.icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-bold text-sm text-foreground">{item.label}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ━━ ログアウトボタン ━━ */}
        <div className="pt-4">
          <button
            onClick={handleLogout}
            className="w-full h-14 bg-card border-2 border-destructive/20 hover:bg-destructive/5 hover:border-destructive/30 rounded-[var(--radius-xl)] flex items-center justify-center gap-3 text-destructive active:scale-[0.98] transition-all shadow-sm"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-black text-sm">ログアウト</span>
          </button>
        </div>

      </div>
    </div>
  );
}
