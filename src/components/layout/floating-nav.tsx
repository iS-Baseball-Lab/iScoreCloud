// filepath: src/components/layout/floating-nav.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { LayoutDashboard, Users, Trophy, MoreHorizontal, UserSquare2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function FloatingNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setIsOpen(false), [pathname]);

  const menuItems = [
    { icon: Users, label: "TEAM", href: "/team", angle: -160 },
    { icon: UserSquare2, label: "PLAYER", href: "/players", angle: -125 },
    { icon: LayoutDashboard, label: "HOME", href: "/dashboard", angle: -90 },
    { icon: Trophy, label: "EVENT", href: "/tournaments", angle: -55 },
    { icon: MoreHorizontal, label: "MENU", href: "/menu", angle: -20 },
  ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]">
      {/* 🌟 復活：美しいすりガラス（backdrop-blur-sm） */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-background/70 backdrop-blur-sm z-[-1]"
          />
        )}
      </AnimatePresence>

      <div className="relative flex items-center justify-center">
        {/* サブボタンの扇状アニメーションはそのまま維持 */}
        <AnimatePresence>
          {isOpen && menuItems.map((item, index) => {
            const isActive = pathname === item.href;
            const RADIUS = 115;
            const radian = (item.angle * Math.PI) / 180;
            const x = Math.cos(radian) * RADIUS;
            const y = Math.sin(radian) * RADIUS;

            return (
              <motion.div
                key={item.href}
                initial={{ scale: 0, x: 0, y: 0 }}
                animate={{ scale: 1, x, y }}
                exit={{ scale: 0, x: 0, y: 0 }}
                transition={{ type: "spring", stiffness: 650, damping: 28, delay: index * 0.02 }}
                className="absolute"
              >
                <Link href={item.href} className="relative flex items-center justify-center active:scale-95 transition-transform">
                  <div className={cn(
                    "w-16 h-16 rounded-full flex flex-col items-center justify-center gap-1 border-[3px] transition-colors relative z-10",
                    isActive 
                      ? "bg-primary border-primary text-primary-foreground shadow-xl shadow-black/20 dark:shadow-black/40" 
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xl shadow-black/10"
                  )}>
                    <item.icon className="w-6 h-6 stroke-[2.5]" />
                    <span className="text-[8px] font-black uppercase tracking-tighter">{item.label}</span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* ⚾️ センターボタン：DOM生成破棄をやめ、CSSの透過と回転だけで切り替える究極の安定構造 */}
        <div className="relative flex items-center justify-center w-24 h-24 z-50">
          <button
            onClick={() => setIsOpen(!isOpen)}
            // 🌟 究極対策1: CSSエンジンに「ここは絶対に真円！」と分からせるためインラインで指定
            style={{ borderRadius: "50%", WebkitBorderRadius: "50%" }}
            className={cn(
              // 🌟 究極対策2: バグの元凶「overflow-hidden」を完全削除！
              "absolute flex items-center justify-center transition-all duration-300 ease-out active:scale-95",
              isOpen
                ? "w-14 h-14 bg-white dark:bg-zinc-800 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-border/50"
                : "w-24 h-24 bg-primary shadow-2xl shadow-primary/50 border-none outline-none ring-0"
            )}
          >
            {/* ✕アイコン（開いている時だけ表示） */}
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-all duration-300",
                isOpen ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 -rotate-90 pointer-events-none"
              )}
            >
              <X className="w-6 h-6 text-muted-foreground stroke-[3]" />
            </div>

            {/* ロゴ画像（閉じている時だけ表示） */}
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-all duration-300",
                isOpen ? "opacity-0 scale-50 rotate-90 pointer-events-none" : "opacity-100 scale-100 rotate-0"
              )}
            >
              {/* paddingを入れて画像の枠線が見えるような錯覚を予防 */}
              <Image src="/logo.webp" alt="iScore" fill className="object-contain p-2" priority />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
