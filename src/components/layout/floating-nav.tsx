// filepath: src/components/layout/floating-nav.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { LayoutDashboard, Users, Trophy, MoreHorizontal, UserSquare2, X, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function FloatingNav() {
  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [prevScrollY, setPrevScrollY] = useState(0);
  const pathname = usePathname();

  useEffect(() => setIsOpen(false), [pathname]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // 1. 最上部付近（10px未満）は常に表示
      if (currentScrollY < 10) {
        setVisible(true);
        setPrevScrollY(currentScrollY);
        return;
      }

      // 2. メニューが開いているときはスクロールしても隠さない
      if (isOpen) {
        setPrevScrollY(currentScrollY);
        return;
      }

      // 3. 最下部に到達したときはメニューにアクセスできるよう常に表示
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      if (windowHeight + currentScrollY >= documentHeight - 20) {
        setVisible(true);
        setPrevScrollY(currentScrollY);
        return;
      }

      // 4. スクロール方向による判定
      if (currentScrollY > prevScrollY) {
        // 下スクロール時は非表示（スライドダウン）
        setVisible(false);
      } else {
        // 上スクロール時は表示
        setVisible(true);
      }

      setPrevScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [prevScrollY, isOpen]);

  const menuItems = [
    { icon: Users, label: "TEAM", href: "/team", angle: -165 },
    { icon: UserSquare2, label: "PLAYER", href: "/players", angle: -135 },
    { icon: CalendarCheck, label: "ATTEND", href: "/attendance", angle: -105 },
    { icon: LayoutDashboard, label: "HOME", href: "/dashboard", angle: -75 },
    { icon: Trophy, label: "EVENT", href: "/tournaments", angle: -45 },
    { icon: MoreHorizontal, label: "MENU", href: "/menu", angle: -15 },
  ];

  return (
    <motion.div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]"
      animate={{
        y: visible ? 0 : 150,
        opacity: visible ? 1 : 0,
        scale: visible ? 1 : 0.9,
      }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 25,
      }}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-[-1]"
          />
        )}
      </AnimatePresence>

      <div className="relative flex items-center justify-center">
        {/* サブボタン展開 */}
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

        {/* ⚾️ センターボタン */}
        <motion.button
          layout
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "relative rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 z-50 overflow-hidden",
            isOpen
              ? "w-14 h-14 bg-white dark:bg-zinc-800 shadow-md border border-border/50"
              // 💡 修正1: 念のため border-none outline-none ring-0 を追加し、枠線を完全に無効化
              : "w-24 h-24 bg-primary shadow-xl border-none outline-none ring-0"
          )}
          // 💡 修正2: サイズ変更のバネを少し強く(速く)設定
          transition={{ type: "spring", stiffness: 700, damping: 25 }}
        >
          {/* 💡 修正3: mode="wait" を削除して、待たずに瞬時に切り替える(クロスフェード) */}
          <AnimatePresence>
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                // 💡 修正4: トランジションを 0.15秒に短縮し爆速化
                transition={{ duration: 0.15, ease: "easeOut" }}
                // 💡 修正5: absolute inset-0 を追加して位置を重ね、スムーズにクロスフェードさせる
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
                {/* 💡 修正6: 元凶だった `p-1` を削除し、背景色が枠線のように見えてしまう隙間を完全に埋める */}
                <Image src="/logo.webp" alt="iScoreCloud" fill className="object-contain" priority />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.div>
  );
}
