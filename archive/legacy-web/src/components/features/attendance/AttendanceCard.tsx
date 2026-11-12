// filepath: src/components/features/attendance/AttendanceCard.tsx
/* 💡 現場視認性：脱・グラスモーフィズム。高コントラストなソリッド背景を採用 */

import { CheckCircle2, XCircle, Clock, Car } from "lucide-react";
import { cn } from "@/lib/utils";

interface AttendanceCardProps {
  status: 'present' | 'absent' | 'pending' | 'late' | 'early';
  userName: string;
  hasCar: boolean;
  comment?: string;
}

export const AttendanceCard = ({ status, userName, hasCar, comment }: AttendanceCardProps) => {
  // ステータスごとの配色定義 (bg-background とのコントラストを重視)
  const statusStyles = {
    present: "bg-green-600 text-white",
    absent: "bg-red-600 text-white",
    late: "bg-yellow-500 text-black",
    early: "bg-blue-500 text-white",
    pending: "bg-secondary text-muted-foreground",
  };

  return (
    <div className="flex items-center justify-between p-4 mb-2 bg-secondary rounded-xl border border-border/50">
      <div className="flex items-center gap-3">
        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center shrink-0", statusStyles[status])}>
          {status === 'present' && <CheckCircle2 size={24} />}
          {status === 'absent' && <XCircle size={24} />}
          {(status === 'late' || status === 'early') && <Clock size={24} />}
        </div>
        <div>
          <p className="font-bold text-lg">{userName}</p>
          {comment && <p className="text-sm text-muted-foreground">{comment}</p>}
        </div>
      </div>
      
      {/* 💡 野球現場に必須の「車出し」アイコン */}
      {hasCar && (
        <div className="p-2 bg-primary/20 rounded-lg">
          <Car className="text-primary w-5 h-5" />
        </div>
      )}
    </div>
  );
};
