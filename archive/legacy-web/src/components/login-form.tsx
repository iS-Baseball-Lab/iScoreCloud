// filepath: src/components/login-form.tsx
"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { FcGoogle } from "react-icons/fc"; // Google公式カラーアイコン
import { SiLine } from "react-icons/si";   // LINE公式アイコン

import { signIn } from "@/lib/auth-client"; // Client SDK
import { OpenLineMiniAppButton } from "@/components/common/OpenLineMiniAppButton";

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "line" | null>(null);

  const handleSocialLogin = async (provider: "google" | "line") => {
    setLoadingProvider(provider);
    try {
      await signIn.social({
        provider,
        // 🔥 原因はここでした！ トップページではなく、保護されたダッシュボードへ向かわせます！
        callbackURL: "/dashboard",
      });
    } catch (error) {
      toast.error(`${provider === 'google' ? 'Google' : 'LINE'}でのログインに失敗しました`);
      setLoadingProvider(null);
    }
  };

  return (
    <div className={cn("flex flex-col gap-4 w-full", className)} {...props}>

      {/* 🌟 余計なカード枠を削除し、親のグラスモーフィズムに直接乗せる設計 */}

      {/* Googleボタン */}
      <Button
        type="button"
        variant="outline"
        disabled={loadingProvider !== null}
        className="relative w-full h-14 bg-background/80 hover:bg-background transition-colors text-foreground border-border/50 shadow-sm text-base rounded-2xl font-bold"
        onClick={() => handleSocialLogin("google")}
      >
        <div className="absolute left-4 flex items-center justify-center">
          {loadingProvider === "google" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <FcGoogle style={{ width: '24px', height: '24px' }} />
          )}
        </div>
        Googleで続ける
      </Button>

      {/* LINEボタン */}
      <Button
        type="button"
        disabled={loadingProvider !== null}
        className="relative w-full h-14 bg-[#06C755]/90 hover:bg-[#06C755] text-white transition-colors border-none shadow-sm text-base rounded-2xl font-bold"
        onClick={() => handleSocialLogin("line")}
      >
        <div className="absolute left-4 flex items-center justify-center">
          {loadingProvider === "line" ? (
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          ) : (
            <SiLine style={{ width: '24px', height: '24px' }} />
          )}
        </div>
        LINEで続ける
      </Button>

      <div className="pt-2">
        <OpenLineMiniAppButton
          variant="hero"
          showQrTrigger
          className="w-full [&>a]:flex-1"
        />
      </div>

      {/* 開発者クレジット（少し控えめにデザイン調整） */}
      <footer className="mt-8 text-[10px] text-center text-muted-foreground/60 space-y-2">
        <p>
          Developed by{" "}
          <a
            href="https://github.com/Insomnia-Scorer/iscore"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors font-bold"
          >
            insomnia-Scorer
          </a>
        </p>
      </footer>
    </div>
  );
}