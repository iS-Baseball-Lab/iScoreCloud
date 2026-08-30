// filepath: `src/app/(public)/layout.tsx`
import React from "react";
import Link from "next/link";
import Image from "next/image"; // 💡 追加
import { Button } from "@/components/ui/button";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  
  // 💡 logo.webp を使用した共通ロゴコンポーネント
  const Logo = () => (
    <div className="flex items-center gap-2.5 group">
      <div className="relative w-7 h-7 md:w-8 md:h-8 transition-transform duration-300 group-hover:scale-110">
        {/* ロゴの背後にわずかな光彩を放たせて質感をアップ */}
        <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        <Image
          src="/logo.webp"
          alt="iScoreCloud Logo"
          fill
          className="object-contain"
          priority
        />
      </div>
      <span className="text-xl font-black italic tracking-tighter text-primary">
        iScore<span className="text-foreground/80">Cloud</span>
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      
      {/* 🚀 ヘッダー */}
      <header className="h-16 border-b border-border/40 flex items-center justify-between px-6 sticky top-0 bg-background/80 backdrop-blur-md z-50">
        <Link href="/">
          <Logo />
        </Link>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="text-xs font-bold transition-all active:scale-95">
            <Link href="/login">ログイン</Link>
          </Button>
          <Button size="sm" asChild className="text-xs font-bold rounded-full px-5 shadow-lg shadow-primary/20 transition-all active:scale-95">
            <Link href="/register">無料で始める</Link>
          </Button>
        </div>
      </header>

      {/* 🏟 コンテンツエリア */}
      <main className="flex-1 w-full max-w-4xl mx-auto py-10 px-4 animate-in fade-in duration-500">
        {children}
      </main>

      {/* 🚀 フッター */}
      <footer className="border-t border-border/40 bg-muted/5 py-12 mt-auto">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-10">
            <div className="space-y-4 flex flex-col items-center md:items-start">
              <Link href="/">
                <Logo />
              </Link>
              <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed text-center md:text-left">
                野球スコアの記録を、究極の体験へ。
                すべてのプレーに、データの熱狂を。
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-16">
              <div className="space-y-4 text-left">
                <h4 className="text-[10px] font-black tracking-widest uppercase text-foreground/50">Product</h4>
                <ul className="space-y-2 text-xs text-muted-foreground font-bold">
                  <li><Link href="/#features" className="hover:text-primary transition-colors">機能</Link></li>
                  <li><Link href="/#pricing" className="hover:text-primary transition-colors">料金</Link></li>
                </ul>
              </div>
              <div className="space-y-4 text-left">
                <h4 className="text-[10px] font-black tracking-widest uppercase text-foreground/50">Legal</h4>
                <ul className="space-y-2 text-xs text-muted-foreground font-bold">
                  <li><Link href="/terms" className="hover:text-primary transition-colors">サービス利用規約</Link></li>
                  <li><Link href="/privacy" className="hover:text-primary transition-colors">プライバシーポリシー</Link></li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="mt-12 pt-8 border-t border-border/10 text-center">
            <p className="text-[10px] text-muted-foreground/30 font-medium tracking-tighter">
              © 2026 iScoreCloud. Baseball Evolution Starts Here.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
