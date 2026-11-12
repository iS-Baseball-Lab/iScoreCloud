// src/app/(protected)/layout.tsx
import React from "react";
import { ProtectedClientLayout } from "@/components/layout/protected-client-layout";
import { AppShell } from "@/components/layout/app-shell"; // 💡 追加

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedClientLayout>
      {/* 💡 ログイン必須ページにだけ、ナビゲーション付きのAppShellを適用 */}
      <AppShell>
        {children}
      </AppShell>
    </ProtectedClientLayout>
  );
}
