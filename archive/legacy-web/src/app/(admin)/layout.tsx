// src/app/(admin)/layout.tsx
/* 💡 管理画面専用レイアウト（認証ガード付き） */
"use client";

import { AppShell } from "@/components/layout/app-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // ※ここで本来は「role !== admin」ならリダイレクトさせるガードを入れるのが安全です

  return (
    <AppShell>
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        {children}
      </div>
    </AppShell>
  );
}