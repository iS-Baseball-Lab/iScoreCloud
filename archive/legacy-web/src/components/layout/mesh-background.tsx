// filepath: `src/components/layout/mesh-background.tsx`
import React from "react";

/**
 * 💡 アプリ共通：メッシュグラデーション背景 (モバイル最適化版)
 * 現場至上主義の視認性を守るため、透過度(20%)を維持し、
 * fixed配置によりスクロール時も常に美しく画面全体を覆います。
 * 【最適化】will-changeと省電力モードへの配慮を追加し、バッテリー消費を抑制しています。
 */
export function MeshBackground() {
  return (
    <>
      <style>{`
        @keyframes mesh-blob-1 {
          0% { transform: translate(0%, 0%) scale(1); }
          33% { transform: translate(15%, -10%) scale(1.15); }
          66% { transform: translate(-10%, 15%) scale(0.9); }
          100% { transform: translate(0%, 0%) scale(1); }
        }
        @keyframes mesh-blob-2 {
          0% { transform: translate(0%, 0%) scale(1); }
          33% { transform: translate(-15%, 15%) scale(0.9); }
          66% { transform: translate(15%, -10%) scale(1.15); }
          100% { transform: translate(0%, 0%) scale(1); }
        }
        @keyframes mesh-blob-3 {
          0% { transform: translate(0%, 0%) scale(1); }
          33% { transform: translate(10%, 15%) scale(1.1); }
          66% { transform: translate(-15%, -15%) scale(0.95); }
          100% { transform: translate(0%, 0%) scale(1); }
        }
        @keyframes mesh-blob-4 {
          0% { transform: translate(0%, 0%) scale(1); }
          33% { transform: translate(-10%, -15%) scale(0.95); }
          66% { transform: translate(15%, 15%) scale(1.1); }
          100% { transform: translate(0%, 0%) scale(1); }
        }
        @keyframes mesh-blob-5 {
          0% { transform: translate(0%, 0%) scale(1); }
          33% { transform: translate(15%, 10%) scale(1.05); }
          66% { transform: translate(-15%, -10%) scale(0.95); }
          100% { transform: translate(0%, 0%) scale(1); }
        }
        
        .animate-mesh-1 { animation: mesh-blob-1 12s infinite alternate ease-in-out; }
        .animate-mesh-2 { animation: mesh-blob-2 14s infinite alternate ease-in-out; }
        .animate-mesh-3 { animation: mesh-blob-3 15s infinite alternate ease-in-out; }
        .animate-mesh-4 { animation: mesh-blob-4 11s infinite alternate ease-in-out; }
        .animate-mesh-5 { animation: mesh-blob-5 13s infinite alternate ease-in-out; }

        /* 💡 モバイルの低電力モードや、アニメーションを嫌うユーザーへの配慮（超重要） */
        @media (prefers-reduced-motion: reduce) {
          .animate-mesh-1, .animate-mesh-2, .animate-mesh-3, .animate-mesh-4, .animate-mesh-5 {
            animation: none !important;
          }
        }
      `}</style>

      {/* 💡 背景コンテナ：fixedで画面に固定し、はみ出しを隠す */}
      <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-background">
        {/* アニメーション要素本体 */}
        <div className="absolute inset-[-50%] flex items-center justify-center opacity-80 dark:opacity-50">
          {/* 
            💡 will-change-transform を追加。
            ブラウザに「この要素は変形するからGPUスタンバイよろしく」と伝え、再描画の負荷を激減させます。 
          */}
          <div className="absolute top-[10%] right-[10%] w-[70vw] h-[70vw] min-w-[500px] min-h-[500px] bg-primary/5 blur-[100px] rounded-full animate-mesh-1 will-change-transform" />
          <div className="absolute bottom-[10%] left-[10%] w-[80vw] h-[80vw] min-w-[600px] min-h-[600px] bg-blue-500/10 blur-[100px] rounded-full animate-mesh-2 will-change-transform" />
          <div className="absolute top-[30%] left-[30%] w-[60vw] h-[60vw] min-w-[400px] min-h-[400px] bg-emerald-500/10 blur-[100px] rounded-full animate-mesh-3 will-change-transform" />
          <div className="absolute bottom-[20%] right-[20%] w-[65vw] h-[65vw] min-w-[450px] min-h-[450px] bg-amber-500/10 blur-[100px] rounded-full animate-mesh-4 will-change-transform" />
          <div className="absolute top-[15%] left-[15%] w-[75vw] h-[75vw] min-w-[550px] min-h-[550px] bg-purple-500/10 blur-[100px] rounded-full animate-mesh-5 will-change-transform" />
        </div>
      </div>
    </>
  );
}