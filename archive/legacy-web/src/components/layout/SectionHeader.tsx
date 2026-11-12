// filepath: `src/components/layout/SectionHeader.tsx`
import React from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  subtitle: string;
  showPulse?: boolean; // 💡 これが true の時に点滅させる
  className?: string;
}

export function SectionHeader({ title, subtitle, showPulse = false, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <h2 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-5 uppercase tracking-[0.15em]">
        {/* 左側のドット */}
        <div className="flex gap-2">
          <span className="w-1.5 h-1.5 bg-primary/20 rounded-full" />
          <span className="w-1.5 h-1.5 bg-primary/30 rounded-full" />
          <span className="w-1.5 h-1.5 bg-primary/40 rounded-full" />
          <span className="w-1.5 h-1.5 bg-primary/50 rounded-full" />
          <span className={cn(
            "w-1.5 h-1.5 bg-primary rounded-full", 
            showPulse && "animate-pulse" // 💡 復活！
          )} />
        </div>

        {title}

        {/* 右側のドット */}
        <div className="flex gap-2">
          <span className={cn(
            "w-1.5 h-1.5 bg-primary rounded-full", 
            showPulse && "animate-pulse" // 💡 復活！
          )} />
          <span className="w-1.5 h-1.5 bg-primary/50 rounded-full" />
          <span className="w-1.5 h-1.5 bg-primary/40 rounded-full" />
          <span className="w-1.5 h-1.5 bg-primary/30 rounded-full" />
          <span className="w-1.5 h-1.5 bg-primary/20 rounded-full" />
        </div>
      </h2>
      <p className="text-[10px] font-bold text-muted-foreground tracking-[0.4em] uppercase">
        {subtitle}
      </p>
    </div>
  );
}
