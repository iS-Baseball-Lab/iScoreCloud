// filepath: src/app/(protected)/menu/page.tsx
"use client";

import React from "react";
import { LogOut, User, Settings, HelpCircle, ShieldCheck, ChevronRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

export default function MenuPage() {
  const handleLogout = async () => {
    await authClient.signOut();
    toast.success("スタジアムから退出しました。お疲れ様でした！");
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
    <div className="min-h-screen p-6 pt-24 pb-32">
      <h1 className="text-3xl font-black italic tracking-tighter text-primary mb-8">MENU</h1>

      <div className="space-y-8">
        {menuSections.map((section) => (
          <div key={section.title} className="space-y-3">
            <p className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-widest px-2">
              {section.title}
            </p>
            <div className="grid gap-2">
              {section.items.map((item) => (
                <button
                  key={item.label}
                  className="w-full h-16 bg-card border border-border rounded-[24px] px-6 flex items-center justify-between active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center gap-4">
                    <item.icon className="w-6 h-6 text-primary" />
                    <span className="font-bold text-foreground">{item.label}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground/40" />
                </button>
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={handleLogout}
          className="w-full h-16 bg-destructive/10 border border-destructive/20 rounded-[24px] px-6 flex items-center gap-4 text-destructive active:scale-[0.98] transition-all"
        >
          <LogOut className="w-6 h-6" />
          <span className="font-bold">ログアウト</span>
        </button>
      </div>
    </div>
  );
}
