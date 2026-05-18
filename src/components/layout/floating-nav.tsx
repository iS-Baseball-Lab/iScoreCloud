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

        {/* ⚾️ センターボタン */}
        <motion.button
          layout
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "relative rounded-full flex items-center justify-center active:scale-95 z-50 overflow-hidden",
            isOpen
              ? "w-14 h-14 bg-white dark:bg-zinc-800 shadow-md border border-border/50"
              // 💡 修正1: 枠線の原因を完全に消去。border-none, outline-none, ring-0 を明示。
              : "w-24 h-24 bg-primary shadow-xl border-none outline-none ring-0"
          )}
          // 💡 修正2: サイズ変更自体のスピードもアップ（stiffnessを上げてバネを硬く）
          transition={{ type: "spring", stiffness: 700, damping: 25 }}
        >
          {/* 💡 修正3: mode="wait" を削除し、瞬時にクロスフェードさせる */}
          <AnimatePresence>
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                // 💡 修正4: アニメーション時間を 0.15秒に短縮し、爆速レスポンスに
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <X className="w-6 h-6 text-muted-foreground stroke-[3]" />
              </motion.div>
            ) : (
              <motion.div
                key="logo"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute inset-0 flex items-center justify-center"
              >
                {/* 💡 修正5: p-1 を削除し、背景色が枠線のように見えてしまう隙間を完全に埋める */}
                <Image src="/logo.webp" alt="iScore" fill className="object-contain" priority />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
