"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, Settings, HelpCircle, ShieldCheck, ChevronRight, UserCircle2, Loader2, Users } from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { useTeam } from "@/contexts/TeamContext";

export default function MenuPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { currentTeam } = useTeam();

  const handleLogout = async () => {
    await authClient.signOut();
    toast.success("スタジアムから退出しました。お疲れ様でした！");
    window.location.href = "/"; // 強制的にトップ（未ログイン状態）へリダイレクト
  };

  const menuSections = [
    {
      title: "アカウント",
      items: [
        { icon: User, label: "プロフィール設定", href: "/profile" },
        { icon: Settings, label: "アプリ設定", href: "/settings" },
      ],
    },
    {
      title: "サポート",
      items: [
        { icon: HelpCircle, label: "使い方・マニュアル", href: "/help" },
        { icon: ShieldCheck, label: "プライバシーポリシー", href: "/privacy" },
      ],
    },
  ];

  return (
    <div className="min-h-screen p-4 sm:p-6 pt-8 pb-32 animate-in fade-in duration-400">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* ━━ ページヘッダー ━━ */}
        <SectionHeader title="メニュー" subtitle="MENU" showPulse={false} />

        {/* ━━ ユーザープロフィールカード ━━ */}
        <div className="bg-card border border-border rounded-[32px] p-5 sm:p-6 shadow-sm flex items-center gap-5">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border-2 border-primary/20">
            {session?.user?.image ? (
              <img src={session.user.image} alt="User Avatar" className="h-full w-full rounded-full object-cover" />
            ) : (
              <UserCircle2 className="h-8 w-8 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {isPending ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
            ) : (
              <>
                <h2 className="text-xl font-black text-foreground truncate mb-1">
                  {session?.user?.name || "ユーザー"}
                </h2>
                <div className="flex flex-col gap-1.5 items-start">
                  <p className="text-[11px] font-bold text-muted-foreground truncate w-full">
                    {session?.user?.email}
                  </p>
                  <p className="text-[10px] font-black text-primary bg-primary/10 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full">
                    <Users className="h-3 w-3" />
                    {currentTeam ? currentTeam.name : "チーム未選択"}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ━━ メニュー項目リスト ━━ */}
        <div className="space-y-6">
          {menuSections.map((section) => (
            <div key={section.title} className="space-y-3">
              <p className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-widest px-4">
                {section.title}
              </p>
              <div className="bg-card border border-border rounded-[24px] overflow-hidden shadow-sm">
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
            className="w-full h-14 bg-card border-2 border-destructive/20 hover:bg-destructive/5 hover:border-destructive/30 rounded-[24px] flex items-center justify-center gap-3 text-destructive active:scale-[0.98] transition-all shadow-sm"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-black text-sm">ログアウト</span>
          </button>
        </div>

      </div>
    </div>
  );
}
