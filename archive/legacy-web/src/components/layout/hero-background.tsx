// filepath: src/components/layout/hero-background.tsx
"use client";

import React, { useMemo } from "react";
import { motion } from "motion/react";

/**
 * 💡 i-score Cyber Grid Background (v12)
 * 格子状の線上を光のパルスが無差別に、かつ高速に交差する近未来デザイン。
 * ライト/ダーク両対応のタクティカル・ビジュアル。
 */
export function HeroBackground() {
  // 🌟 パルスの生成（無差別な動きを作るためのランダムデータ）
  const pulses = useMemo(() => [...Array(12)].map((_, i) => ({
    id: i,
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    duration: 2 + Math.random() * 4,
    delay: Math.random() * 5,
    direction: i % 3 === 0 ? "horizontal" : i % 3 === 1 ? "vertical" : "diagonal",
  })), []);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-background transition-colors duration-500">
      {/* 🌟 ダイヤモンド・グリッド（SVG基盤） */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.15] dark:opacity-[0.25]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="cyber-grid" width="80" height="138.5" patternUnits="userSpaceOnUse">
            <path 
              d="M 40 0 L 80 69.25 L 40 138.5 L 0 69.25 Z" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="1.5"
              className="text-foreground/40"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cyber-grid)" />
      </svg>

      {/* 🌟 高速交差パルス・レイヤー */}
      {pulses.map((p) => (
        <motion.div
          key={p.id}
          initial={p.direction === "horizontal" ? { x: "-100%", y: p.top } : p.direction === "vertical" ? { y: "-100%", x: p.left } : { x: "-50%", y: "-50%", opacity: 0 }}
          animate={
            p.direction === "horizontal" ? { x: "200%" } : 
            p.direction === "vertical" ? { y: "200%" } : 
            { x: ["0%", "150%"], y: ["0%", "150%"], opacity: [0, 1, 0] }
          }
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: "circIn",
            delay: p.delay,
          }}
          className={cn(
            "absolute blur-[2px] shadow-[0_0_15px_rgba(var(--primary),0.8)]",
            p.direction === "horizontal" ? "h-[2px] w-40 bg-gradient-to-r from-transparent via-primary to-transparent" :
            p.direction === "vertical" ? "w-[2px] h-40 bg-gradient-to-b from-transparent via-primary to-transparent" :
            "w-32 h-[2px] bg-gradient-to-br from-transparent via-primary to-transparent rotate-45"
          )}
        />
      ))}

      {/* 🌟 センター・スポットライト（ロゴとの共鳴） */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(var(--primary),0.1)_0%,transparent_70%)]" />
    </div>
  );
}

import { cn } from "@/lib/utils";
