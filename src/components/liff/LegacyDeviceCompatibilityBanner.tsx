// filepath: src/components/liff/LegacyDeviceCompatibilityBanner.tsx
"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Copy, Smartphone, Tablet, X } from "lucide-react";
import { toast } from "sonner";
import { detectIsIPadDevice } from "@/lib/line-miniapp";

const IPAD_LINE_DISMISS_KEY = "iscore_ipad_line_notice_dismissed_v1";

/**
 * 1) `@layer` 非対応の古い iPadOS（15.3以前等）や CSS 未読込環境向けに、
 *    外部CSSやJavaScriptが一切動かなくても崩れず読めるインラインスタイルの A-3 案内カードを表示する
 *    （※ モダンブラウザでは globals.css の `@layer utilities` により初回描画 0ms で完全非表示）
 * 2) 最新 iPadOS でも「iPad版LINEアプリ内ブラウザ」から開かれた場合には、
 *    LINEミニアプリがスマホ版LINE専用である旨と Safari 利用案内を表示する
 */
export function LegacyDeviceCompatibilityBanner() {
  const pathname = usePathname();
  const [showIPadLineBanner, setShowIPadLineBanner] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") {
      return;
    }
    const isIPad = detectIsIPadDevice();
    const isLineInApp = /Line\//i.test(navigator.userAgent || "");
    if (!isIPad || !isLineInApp) {
      return;
    }
    const dismissed = sessionStorage.getItem(IPAD_LINE_DISMISS_KEY) === "1";
    if (!dismissed) {
      setShowIPadLineBanner(true);
    }
  }, []);

  const targetSafariUrl = `https://iscorecloud.com${pathname && pathname.startsWith("/") ? pathname : "/liff"}`;

  const handleCopySafariUrl = async () => {
    try {
      await navigator.clipboard.writeText(targetSafariUrl);
      setCopied(true);
      toast.success("Safari用のURLをコピーしました！");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("URLのコピーに失敗しました");
    }
  };

  const handleDismissIPadBanner = () => {
    setShowIPadLineBanner(false);
    try {
      sessionStorage.setItem(IPAD_LINE_DISMISS_KEY, "1");
    } catch {
      // ignore storage error
    }
  };

  return (
    <>
      {/* 🛡️ 1. 旧 iPadOS（@layer 非対応）/ CSS 未読込時のフェイルセーフ案内（通常環境では 0ms 非表示） */}
      <div
        className="iscore-legacy-env-guard"
        style={{
          padding: "12px",
          backgroundColor: "#eef2f6",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
          color: "#0f172a",
          lineHeight: 1.55,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            borderRadius: "16px",
            border: "1px solid #cbd5e1",
            backgroundColor: "#ffffff",
            overflow: "hidden",
          }}
        >
          {/* A-3 上帯ダークキャップ（単色ソリッド・グラデーション不使用） */}
          <div
            style={{
              backgroundColor: "#0f172a",
              color: "#f8fafc",
              borderBottom: "3px solid #06C755",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <img
              src="/liff-logo.webp"
              alt="iScoreCloud LINEミニアプリ"
              width={32}
              height={32}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "7px",
                objectFit: "contain",
                flexShrink: 0,
              }}
            />
            <div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 800,
                  color: "#ffffff",
                }}
              >
                ご利用端末・OSバージョンのご案内
              </div>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#94a3b8",
                }}
              >
                iScoreCloud LINEミニアプリ
              </div>
            </div>
          </div>

          {/* 純白ボディ */}
          <div style={{ padding: "14px" }}>
            <p
              style={{
                margin: "0 0 10px 0",
                fontSize: "12.5px",
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              現在お使いの端末（古い iPadOS バージョンまたは非対応ブラウザ）では、画面デザインを正しく表示できません。以下のいずれかの方法でご利用ください。
            </p>

            <div
              style={{
                backgroundColor: "#f1f5f9",
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                padding: "10px 12px",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "#059669",
                  marginBottom: "3px",
                }}
              >
                ① スマートフォン（iPhone / Android）のLINEで開く【推奨】
              </div>
              <div
                style={{
                  fontSize: "11.5px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                LINEミニアプリはLINE社の仕様上「スマートフォン版LINE」専用です。スマホのLINEから開くと自動ログインでそのまま快適にご利用いただけます。
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#f1f5f9",
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "#0284c7",
                  marginBottom: "3px",
                }}
              >
                ② iPad で閲覧される場合
              </div>
              <div
                style={{
                  fontSize: "11.5px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                iPadの「設定 ＞ 一般 ＞ ソフトウェアアップデート」より{" "}
                <strong>iPadOS 16.4以降</strong> へ更新した上で、Safariブラウザで{" "}
                <strong>https://iscorecloud.com/liff</strong>{" "}
                を直接開いてご利用ください（※機種仕様により iPadOS 15 までしか更新できない iPad の場合は、お手元のスマートフォンのLINEからご利用ください）。
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 📱 2. 最新 iPadOS で「iPad版LINE」内ブラウザから開いた場合の案内カード */}
      {showIPadLineBanner && (
        <div className="px-3 pt-3">
          <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-[#06C755] px-3.5 py-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Tablet className="w-4 h-4 text-[#06C755] shrink-0" />
                <span className="text-xs font-black text-white truncate">
                  iPad版LINEからのご利用案内
                </span>
              </div>
              <button
                type="button"
                onClick={handleDismissIPadBanner}
                className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
                aria-label="案内を閉じる"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3.5 space-y-2.5">
              <p className="text-[11.5px] font-bold text-foreground leading-relaxed">
                LINEミニアプリはLINE社の仕様上 <span className="text-[#06C755] font-black">スマートフォン版LINE（iPhone / Android）専用</span> です。iPad版LINE内では自動連携が制限されるため、スマホ版LINEで開くか、iPadの場合は右上の共有ボタンまたは下記URLから <span className="text-primary font-black">Safari</span> で開いてご利用ください。
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopySafariUrl()}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 active:scale-95 text-primary-foreground text-[11px] font-black shadow-xs transition-all"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>URLをコピーしました</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Safari用URLをコピー</span>
                    </>
                  )}
                </button>
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-muted-foreground">
                  <Smartphone className="w-3.5 h-3.5 text-[#06C755]" />
                  <span>スマホ版LINEなら1タップ自動連携</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

