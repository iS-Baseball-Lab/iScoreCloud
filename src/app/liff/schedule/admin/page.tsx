// filepath: src/app/liff/schedule/admin/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LiffScheduleAdminPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/liff/schedule?tab=planner");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh] p-4">
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden px-5 py-4 text-xs font-bold text-muted-foreground">
        活動予定（スケジューラー）へ移動中...
      </div>
    </div>
  );
}
