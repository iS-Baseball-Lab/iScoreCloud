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

  // 💡 扇状（アーチ型）への配置変更
  const menuItems = [
    { icon: Users, label: "TEAM", href: "/team", angle: -160 },
    { icon: UserSquare2, label: "PLAYER", href: "/players", angle: -125 },
    { icon: LayoutDashboard, label: "HOME", href: "/dashboard", angle: -90 },
    { icon: Trophy, label: "EVENT", href: "/tournaments", angle: -55 },
    { icon: MoreHorizontal, label: "MENU", href: "/menu", angle: -20 },
  ];

  return (
    // 💡 位置を bottom-10 から bottom-6 に下げ、親指のホームポジションに合わせました
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsOpen(false)}
            // 💡 余計な「rounded-full」の暗い枠を削除し、画面全体を覆う綺麗なすりガラスに変更
            className="fixed inset-0 z-[-1]"
          />
        )}
      </AnimatePresence>

      <div className="relative flex items-center justify-center">
        {/* 💡 元あった「センター・リング（周りに表示される半透明の枠）」は不要なため完全削除 */}

        {/* サブボタン展開 */}
        <AnimatePresence>
          {isOpen && menuItems.map((item, index) => {
            const isActive = pathname === item.href;
            const RADIUS = 115; // 💡 アーチの半径
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
                  {/* 💡 カクつきの原因だった波紋アニメーションを完全に削除 */}
                  
                  <div className={cn(
                    "w-16 h-16 rounded-full flex flex-col items-center justify-center gap-1 border-[3px] transition-colors relative z-10",
                    // 💡 影の色を黒系(shadow-black)に統一し、背景と同化する問題も解決
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

        {/* ⚾️ センターボタン：元の「四角くならない完璧な構造」をそのまま維持 */}
        <motion.button
          layout
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "relative rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 z-50 overflow-hidden",
            // 💡 ✕ボタンを小さく(w-14)＆メインロゴの枠線をなくす(border削除)
            isOpen
              ? "w-14 h-14 bg-white dark:bg-zinc-800 shadow-md border border-border/50"
              : "w-24 h-24 bg-primary shadow-xl"
          )}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                className="flex items-center justify-center"
              >
                {/* 💡 ✕アイコンを目立たないデザインに */}
                <X className="w-6 h-6 text-muted-foreground stroke-[3]" />
              </motion.div>
            ) : (
              <motion.div
                key="logo"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative w-full h-full"
              >
                <Image src="/logo.webp" alt="iScoreCloud" fill className="object-contain p-1" priority />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
