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
    { icon: Users, label: "TEAM", href: "/team", angle: -210 },
    { icon: UserSquare2, label: "PLAYER", href: "/players", angle: -150 },
    { icon: LayoutDashboard, label: "HOME", href: "/dashboard", angle: -90 },
    { icon: Trophy, label: "EVENT", href: "/tournaments", angle: -30 },
    { icon: MoreHorizontal, label: "MENU", href: "/menu", angle: 30 },
  ];

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100]">
      {/* 🌟 背景オーバーレイ：巨大な丸い枠を撤廃し、画面全体を上品なすりガラスで覆う */}
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
        {/* サブボタン展開 */}
        <AnimatePresence>
          {isOpen && menuItems.map((item, index) => {
            const isActive = pathname === item.href;
            const RADIUS = 100;
            const radian = (item.angle * Math.PI) / 180;
            const x = Math.cos(radian) * RADIUS;
            const y = Math.sin(radian) * RADIUS;

            return (
              <motion.div
                key={item.href}
                initial={{ scale: 0, x: 0, y: 0 }}
                animate={{ scale: 1, x, y }}
                exit={{ scale: 0, x: 0, y: 0 }}
                transition={{ type: "spring", stiffness: 700, damping: 32, delay: index * 0.01 }}
                className="absolute"
              >
                <Link href={item.href} className="relative flex items-center justify-center active:scale-95 transition-transform">
                  {isActive && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <motion.div
                        className="absolute w-full h-full rounded-full bg-primary/40"
                        animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                      />
                    </div>
                  )}
                  <div className={cn(
                    "w-18 h-18 rounded-full flex flex-col items-center justify-center gap-1 shadow-2xl border-[3px] transition-colors relative z-10",
                    isActive ? "bg-primary border-primary text-primary-foreground" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                  )}>
                    <item.icon className="w-7 h-7 stroke-[2.5]" />
                    <span className="text-[8px] font-black uppercase tracking-tighter">{item.label}</span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* ⚾️ センターボタン：極限までスッキリさせたモダン仕様 */}
        <motion.button
          layout
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "relative rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 z-50 overflow-hidden",
            isOpen
              // 💡 展開時: サイズを小さく (w-14) し、半透明のリング (ring-4) を完全削除。色も控えめに。
              ? "w-14 h-14 bg-white dark:bg-zinc-800 shadow-md border border-border/50"
              // 💡 閉鎖時: ロゴの枠線 (border) を完全削除。ロゴそのものの美しさで勝負。
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
                {/* 💡 ✕アイコンも細く、小さく、色を落ち着かせて目立たないように */}
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
                <Image src="/logo.webp" alt="iScore" fill className="object-contain p-1" priority />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
