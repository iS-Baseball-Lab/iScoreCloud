// filepath: src/app/liff/admin/roles/page.tsx
"use client";

import React, { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";

function RolesRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    const targetTab = requestedTab === "titles" ? "titles" : "members";
    router.replace(`/liff/admin?tab=${targetTab}`);
  }, [router, searchParams]);

  return (
    <div className="flex flex-col flex-1 bg-background text-foreground">
      <LiffHeader />
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-xs font-bold">
          メンバー・権限管理へ移動しています...
        </span>
      </div>
    </div>
  );
}

export default function LiffAdminRolesRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1 bg-background text-foreground">
          <LiffHeader />
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">
              メンバー・権限管理へ移動しています...
            </span>
          </div>
        </div>
      }
    >
      <RolesRedirectContent />
    </Suspense>
  );
}
