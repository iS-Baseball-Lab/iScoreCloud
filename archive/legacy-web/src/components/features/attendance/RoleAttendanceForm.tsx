// filepath: src/components/features/attendance/RoleAttendanceForm.tsx
/* 💡 現場至上主義: 選手・スタッフを切り替えて出欠登録 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { User, ShieldCheck, Car } from "lucide-react";
import { cn } from "@/lib/utils";

export const RoleAttendanceForm = () => {
  const [role, setRole] = useState("player");
  const [status, setStatus] = useState("present");

  return (
    <div className="p-6 bg-secondary rounded-[32px] space-y-6">
      <div className="space-y-3">
        <Label className="text-lg font-bold">今回の役割</Label>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant={role === "player" ? "default" : "outline"}
            className={cn("h-14 gap-2 text-md", role === "player" && "bg-blue-600")}
            onClick={() => setRole("player")}
          >
            <User size={20} /> 選手として
          </Button>
          <Button
            variant={role === "staff" ? "default" : "outline"}
            className={cn("h-14 gap-2 text-md", role === "staff" && "bg-orange-600")}
            onClick={() => setRole("staff")}
          >
            <ShieldCheck size={20} /> スタッフ/応援
          </Button>
        </div>
      </div>

      {/* 出欠ボタン（高コントラスト設計） */}
      <div className="grid grid-cols-3 gap-2">
        {['present', 'absent', 'late'].map((s) => (
          <Button
            key={s}
            className={cn(
              "h-20 font-bold text-lg rounded-2xl",
              status === s ? "bg-primary text-primary-foreground" : "bg-background border-2"
            )}
            onClick={() => setStatus(s)}
          >
            {s === 'present' ? '出席' : s === 'absent' ? '欠席' : '遅刻'}
          </Button>
        ))}
      </div>
    </div>
  );
};
