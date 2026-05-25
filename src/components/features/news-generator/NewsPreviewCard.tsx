// filepath: src/components/features/news-generator/NewsPreviewCard.tsx
import React from "react";
import Image from "next/image";
import { 
  FileText, RotateCcw, Copy, Check 
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NewsPreviewCardProps {
  editedText: string;
  setEditedText: (text: string) => void;
  loadingDetails: boolean;
  handleResetText: () => void;
  handleCopy: () => void;
  handleLineShare: () => void;
  copied: boolean;
}

export function NewsPreviewCard({
  editedText,
  setEditedText,
  loadingDetails,
  handleResetText,
  handleCopy,
  handleLineShare,
  copied
}: NewsPreviewCardProps) {
  return (
    <div className="bg-white border border-zinc-200 dark:bg-zinc-900/60 dark:border-white/5 p-5 rounded-2xl shadow-md dark:shadow-none space-y-4 relative">
      {/* ツールバー */}
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h4 className="text-xs font-black text-zinc-900 dark:text-white tracking-wider">速報テキスト（編集・手直し可能）</h4>
        </div>
        
        <button
          onClick={handleResetText}
          title="自動生成されたテキストにリセットする"
          className="flex items-center gap-1 text-[10px] font-black text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors px-2.5 py-1.5 rounded-full bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/5 active:scale-95 animate-in fade-in duration-300"
        >
          <RotateCcw className="h-3 w-3" />
          自動生成から復元
        </button>
      </div>

      {/* エディターエリア */}
      {loadingDetails ? (
        <div className="w-full h-[360px] bg-zinc-100 dark:bg-black/20 animate-pulse rounded-2xl" />
      ) : (
        <textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          className="w-full min-h-[480px] bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 focus:border-primary dark:focus:border-primary/50 focus:ring-2 focus:ring-primary/10 text-zinc-900 dark:text-white text-[13px] sm:text-sm p-4 rounded-2xl outline-none font-mono resize-y leading-relaxed transition-all focus:ring-1 focus:ring-primary/20 shadow-inner"
          placeholder="試合を選択すると、ここに自動生成された速報テキストが表示され、自由に手直し・編集ができます。"
        />
      )}

      {/* アクションボタン群 */}
      <div className="flex flex-col sm:flex-row gap-4 pt-2">
        <Button
          onClick={handleCopy}
          className="flex-1 rounded-[24px] font-black text-base sm:text-lg h-20 gap-3.5 active:scale-95 transition-all bg-white hover:bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-300 dark:border-zinc-800 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white shadow-md flex items-center justify-center"
          variant="outline"
        >
          {copied ? (
            <Check className="h-8 w-8 text-emerald-500 shrink-0 animate-in zoom-in-50 duration-200" />
          ) : (
            <Copy className="h-8 w-8 shrink-0" />
          )}
          {copied ? "コピーしました！" : "クリップボードにコピー"}
        </Button>

        <Button
          onClick={handleLineShare}
          className="flex-1 rounded-[24px] font-black text-base sm:text-lg h-20 gap-3.5 bg-[#06C755] hover:bg-[#05b34c] hover:shadow-lg hover:shadow-emerald-500/20 text-white active:scale-95 transition-all shadow-md flex items-center justify-center"
        >
          <div className="relative h-12 w-12 shrink-0">
            <Image src="/line-logo.png" alt="LINE" fill className="object-contain" />
          </div>
          LINEで共有・転送
        </Button>
      </div>

      <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 text-center">
        ※ LINE共有ボタンを押すと、LINEアプリが開き、編集したテキストをフレンドやグループへ直接送信できます。
      </p>
    </div>
  );
}
