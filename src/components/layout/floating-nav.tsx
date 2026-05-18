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
    // 🌟 修正1: bottom-10 から bottom-6 に下げ、指が届きやすい定位置へ
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]">
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
                    "w-16 h-16 rounded-full flex flex-col items-center justify-center gap-1 border-[3px] transition-colors relative z-10",
                    // 🌟 修正2: サブボタンにも shadow-xl を追加して浮き上がらせる
                    isActive 
                      ? "bg-primary border-primary text-primary-foreground shadow-xl shadow-primary/30" 
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

        {/* ⚾️ センターボタン */}
        {/* 🌟 修正3: `motion.button` から `layout` プロパティを削除し、ネイティブCSSの transition-all を活用。
            これで四角形になるバグが完全に消滅します。 */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "relative rounded-full flex items-center justify-center active:scale-95 z-50 transition-all duration-300 ease-out",
            isOpen
              ? "w-14 h-14 bg-white dark:bg-zinc-800 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-border/50"
              // 🌟 修正4: shadow-2xl と shadow-primary/50 を組み合わせて、強烈な「浮いてる感（立体感）」を演出
              : "w-24 h-24 bg-primary shadow-2xl shadow-primary/50 border-none outline-none ring-0"
          )}
        >
          <AnimatePresence>
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute inset-0 flex items-center justify-center rounded-full"
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
                className="absolute inset-0 flex items-center justify-center rounded-full"
              >
                <Image src="/logo.webp" alt="iScore" fill className="object-contain" priority />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}
