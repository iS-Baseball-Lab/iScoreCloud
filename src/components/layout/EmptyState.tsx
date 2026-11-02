// filepath: `src/components/layout/EmptyState.tsx`
import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, className }: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center p-10 rounded-2xl transition-all",
      "bg-card border border-dashed border-border shadow-xs",
      className
    )}>
      {/* アイコン部分もトーンを合わせて微調整 */}
      <div className="p-4 bg-primary/10 rounded-full mb-4 border border-primary/30">
        <Icon className="h-8 w-8 text-primary" />
      </div>

      <h3 className="text-base font-black text-foreground uppercase tracking-wider leading-tight">
        {title}
      </h3>

      {description && (
        <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-[0.3em] mt-3">
          {description}
        </p>
      )}
    </div>
  );
}
