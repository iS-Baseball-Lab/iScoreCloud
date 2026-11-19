// filepath: src/app/global-error.tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  isDeploySkewOrChunkError,
  reloadCurrentPageCleanly,
  tryAutoRecoverFromErrorBoundary,
} from "@/lib/liff/runtime-recovery";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const [isAutoReloading, setIsAutoReloading] = useState<boolean>(() =>
    isDeploySkewOrChunkError(error)
  );

  useEffect(() => {
    console.error("[GlobalError] Caught root error:", error);
    const triggered = tryAutoRecoverFromErrorBoundary(error);
    if (!triggered) {
      setIsAutoReloading(false);
    }
  }, [error]);

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <title>iScoreCloud LINEミニアプリ</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          backgroundColor: "#eef2f6",
          color: "#0f172a",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif',
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            backgroundColor: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
          }}
        >
          <div
            style={{
              backgroundColor: "#0f172a",
              color: "#f8fafc",
              borderBottom: "3px solid #f59e0b",
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: "14px", fontWeight: 900 }}>
              {isAutoReloading
                ? "最新バージョンへ更新しています..."
                : "ページの読み込みに失敗しました"}
            </div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#cbd5e1",
                marginTop: "2px",
              }}
            >
              iScoreCloud LINEミニアプリ
            </div>
          </div>

          <div style={{ padding: "20px 16px" }}>
            <p
              style={{
                margin: "0 0 16px 0",
                fontSize: "12px",
                fontWeight: 700,
                lineHeight: 1.6,
                color: "#475569",
              }}
            >
              {isAutoReloading
                ? "最新の画面データを読み込んでいます。そのまま少々お待ちください..."
                : "アプリの更新直後や通信環境の影響で一時的に表示できなかった可能性があります。「ページを再読み込み」を押してください。"}
            </p>

            {!isAutoReloading && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <button
                  type="button"
                  onClick={() => reloadCurrentPageCleanly()}
                  style={{
                    height: "44px",
                    borderRadius: "12px",
                    border: "none",
                    backgroundColor: "#0f172a",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  ページを再読み込み
                </button>
                <button
                  type="button"
                  onClick={() => reset()}
                  style={{
                    height: "40px",
                    borderRadius: "12px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#334155",
                    fontSize: "12px",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  もう一度試す
                </button>
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
