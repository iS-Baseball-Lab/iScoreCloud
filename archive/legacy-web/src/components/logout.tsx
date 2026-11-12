// 💡 src/components/logout.tsx
"use client";

import React from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client"; // 🔥 better-authのクライアント機能をインポート
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LogoutButtonProps {
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}

// 🔥 「名前付きエクスポート」にすることでエラー 2305 を解決！
export function LogoutButton({ className, variant = "outline" }: LogoutButtonProps) {
  const router = useRouter();

  const handleLogout = async () => {
    toast.info("ログアウトしています...", {
      description: "ゲートへ戻ります。",
      duration: 1500,
    });

    try {
      // 本物のログアウト処理を実行
      await signOut();
      if (typeof window !== "undefined") {
        localStorage.removeItem("iscore_auth_cache_active");
      }
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error("ログアウトに失敗しました。");
    }
  };

  return (
    <Button
      variant={variant}
      className={cn("gap-2 font-bold", className)}
      onClick={handleLogout}
    >
      <LogOut className="h-4 w-4" />
      ログアウトして戻る
    </Button>
  );
}