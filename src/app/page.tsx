// filepath: src/app/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SiLine } from "react-icons/si";
import {
  ArrowUpRight,
  BarChart3,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildLineMiniAppTargets,
  getCachedLineMiniAppConfig,
  resolveLineMiniAppConfig,
  type LineMiniAppConfig,
} from "@/lib/line-miniapp";
import {
  PublicBrandLogoImg,
  PublicWebLayoutShell,
} from "@/components/common/PublicWebShell";
import { cn } from "@/lib/utils";

interface FeatureDomainItem {
  number: string;
  accentClass: string;
  badgeText: string;
  title: string;
  lead: string;
  highlights: string[];
  icon: React.ReactNode;
}

interface OnboardingStepItem {
  step: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const FEATURE_DOMAINS: FeatureDomainItem[] = [
  {
    number: "01",
    accentClass: "border-primary",
    badgeText: "SCOREBOOK, LIVE & AI",
    title: "試合・スコア記録 ＆ AI解析",
    lead: "ベンチでの片手入力から伝統的な早稲田式清書シート出力、1球ごとの速報共有まで一気通貫で連携します。",
    highlights: [
      "早稲田式デジタルスコアブック清書出力（PDF・画像／チーム別21項目の記号流儀＆早見表出力）",
      "紙スコアブックのカメラAI自動読取 ＆ 公認野球規則準拠の自動集計・1マス判定理由ガイド",
      "片手フリック対応「LINE試合速報」（単一担当者ロック・リアルタイム閲覧モード・全角スコア表）",
    ],
    icon: <FileSpreadsheet className="w-4 h-4 text-sky-400" />,
  },
  {
    number: "02",
    accentClass: "border-amber-500",
    badgeText: "TEAM, PLAYERS, STATS & GALLERY",
    title: "チーム情報・選手名鑑・成績 ＆ 写真共有",
    lead: "クラブの方針や戦績、選手一人ひとりの成長推移、試合の思い出までチーム専用空間に美しく蓄積します。",
    highlights: [
      "指導方針・体制・拠点・主な戦績をまとめた「チーム情報」＆ 正面・背景写真付き「選手名鑑」",
      "試合種別ごとの「チーム成績」＆ 月別推移・休養復帰タイムライン付き「個人成長レポート」",
      "撮影位置EXIFを自動除去する「写真アルバム」（選択ZIP一括保存・7日間限定の元画質共有対応）",
    ],
    icon: <BarChart3 className="w-4 h-4 text-amber-400" />,
  },
  {
    number: "03",
    accentClass: "border-teal-500",
    badgeText: "SCHEDULE, CARPOOL & GROUNDS",
    title: "予定・出欠・遠征配車 ＆ 当日運営",
    lead: "週末の連絡調整や遠征移動、グラウンド注意事項の共有など保護者・スタッフの負担を大幅に軽減します。",
    highlights: [
      "4グループ別（選手・母・父・スタッフ）出欠一覧表・当番班/弁当表示・週末LINE自動リマインド",
      "マイカー・チーム共有バス・道具車対応の「簡易配車エディタ」＆ 渋滞表示付き「隊列ライブマップ」",
      "AI施設調査付き「球場・施設マップ」（駐車台数制限・スパイク規定を試合予定へ自動引当）＆ 当日役割しおり",
    ],
    icon: <CalendarCheck2 className="w-4 h-4 text-teal-400" />,
  },
  {
    number: "04",
    accentClass: "border-[#06C755]",
    badgeText: "TEAM ADMIN & SECURITY",
    title: "チーム管理・資料共有 ＆ 安心設計",
    lead: "学童野球から中学・部活・草野球まで、クラブの規模や体制に合わせたきめ細かな権限・資産管理を備えています。",
    highlights: [
      "参加承認制によるチーム単位の完全データ隔離、機微なケガ・体調メモや非公開体重の自動マスク保護",
      "全6画面のチーム管理（メンバー/役職・A/B編成・家族/当番班・車両/バス・大会規定・道具備品）",
      "チームルール・PDF配布資料ビューア・応援歌コール集・よくある質問・関連リンク集を標準搭載",
    ],
    icon: <ShieldCheck className="w-4 h-4 text-[#06C755]" />,
  },
];

const ONBOARDING_STEPS: OnboardingStepItem[] = [
  {
    step: "STEP 1",
    title: "LINEミニアプリを起動",
    description:
      "専用アプリのダウンロードや新規パスワード登録は不要。未参加の状態ではサンプルデータ（体験デモチーム）で全画面の操作感をそのまま確認できます。",
    icon: <Smartphone className="w-4 h-4 text-[#06C755]" />,
  },
  {
    step: "STEP 2",
    title: "チーム作成・グループLINEへ招待",
    description:
      "代表・監督が新しいチームを作成し、「メンバー・権限管理」からグループLINEへ招待カードを1タップ送信。LINE未連携メンバーの手動名簿登録にも対応しています。",
    icon: <UserPlus className="w-4 h-4 text-sky-400" />,
  },
  {
    step: "STEP 3",
    title: "参加承認してその日から運用開始",
    description:
      "メンバーが招待リンクから参加申請し、管理者が役職を選んで承認するだけで完了。承認済みメンバーだけの安全な空間で予定・配車・スコアが即座に共有されます。",
    icon: <Sparkles className="w-4 h-4 text-amber-400" />,
  },
];

const TARGET_BADGES = [
  "学童・少年野球",
  "中学硬式・軟式・部活動",
  "草野球・社会人クラブ",
  "アプリDL・新パスワード不要",
] as const;

export default function LandingPage() {
  const [config, setConfig] = useState<LineMiniAppConfig>(() =>
    getCachedLineMiniAppConfig()
  );
  const [configResolved, setConfigResolved] = useState<boolean>(() => {
    const cached = getCachedLineMiniAppConfig();
    return Boolean(cached.liffId || cached.miniAppUrl);
  });
  const [qrLoadFailed, setQrLoadFailed] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void resolveLineMiniAppConfig().then((resolved) => {
      if (!active) return;
      setConfig(resolved);
      setConfigResolved(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const targets = useMemo(
    () => buildLineMiniAppTargets({ config }),
    [config]
  );

  // LINEミニアプリ起動URL（LIFF ID / ミニアプリURL優先）
  const lineLaunchUrl = targets.externalLineUrl || targets.qrTargetUrl;

  const qrImageSrc = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&ecc=M&data=${encodeURIComponent(
      targets.qrTargetUrl
    )}`;
  }, [targets.qrTargetUrl]);

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(lineLaunchUrl);
      setIsCopied(true);
      toast.success("LINEミニアプリのURLをコピーしました");
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("URLのコピーに失敗しました");
    }
  }, [lineLaunchUrl]);

  return (
    <PublicWebLayoutShell>
      {/* 1. センターヒーロー：サービス紹介 ＋ LINEミニアプリ起動 ＆ 2次元コード */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 pb-14 sm:pt-16 sm:pb-20 text-center space-y-8 sm:space-y-10">
        <div className="space-y-4 sm:space-y-5">
          <p className="text-xs font-black tracking-[0.22em] uppercase text-primary">
            BASEBALL SCOREBOOK &amp; TEAM MANAGEMENT
          </p>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.18] text-foreground">
            野球の記録も、チーム運営も。
            <span className="block mt-1.5 text-primary">
              LINEひとつで、美しく完結。
            </span>
          </h1>

          <p className="text-sm sm:text-base font-medium leading-relaxed text-muted-foreground max-w-2xl mx-auto">
            学童野球から中学・草野球チームまで支えるオールインワン運営プラットフォーム「iScoreCloud」。
            伝統の早稲田式スコア清書・AI読取・LINE試合速報から、出欠・遠征配車・選手名鑑・写真共有まで、いつものLINEミニアプリですぐに始められます。
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {TARGET_BADGES.map((label) => (
              <span
                key={label}
                className="px-3 py-1 rounded-full bg-card border border-border text-[11px] sm:text-xs font-black text-foreground shadow-2xs"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* 中央メインカード：LINEミニアプリ起動ボタン ＋ 2次元コード（A-3 ソリッド規格） */}
        <div className="max-w-md mx-auto rounded-2xl border border-border bg-card shadow-sm overflow-hidden text-left">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-[#06C755] px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-[#06C755] text-white flex items-center justify-center shrink-0">
                <SiLine className="w-4 h-4" />
              </span>
              <span className="text-sm font-black tracking-tight truncate">
                iScoreCloud LINEミニアプリ
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px] font-black text-slate-200 shrink-0">
              無料・DL不要
            </span>
          </div>

          <div className="p-6 sm:p-7 flex flex-col items-center text-center space-y-6">
            {/* 1. LINEリンクボタン */}
            <div className="w-full space-y-2">
              <a
                href={lineLaunchUrl}
                id="launch-line-miniapp-btn"
                className="w-full h-14 px-6 rounded-2xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-base flex items-center justify-center gap-2.5 shadow-sm active:scale-[0.98] transition-all"
              >
                <SiLine className="w-5 h-5 shrink-0" />
                <span>LINEミニアプリを開く</span>
                <ArrowUpRight className="w-4 h-4 shrink-0" />
              </a>
              <p className="text-[11px] font-bold text-muted-foreground">
                スマートフォンからはボタンタップでそのままLINEが起動します
              </p>
            </div>

            {/* 区切り線 */}
            <div className="w-full flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-black tracking-wider text-muted-foreground">
                PCからは2次元コードで開く
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* 2. 中央2次元コード表示 */}
            <div className="flex flex-col items-center space-y-3 w-full">
              <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white p-3 shadow-xs flex items-center justify-center w-48 h-48">
                {!configResolved ? (
                  <div className="w-full h-full rounded-xl bg-slate-100 animate-pulse" />
                ) : !qrLoadFailed ? (
                  <img
                    src={qrImageSrc}
                    alt="iScoreCloud LINEミニアプリ 2次元コード"
                    width={164}
                    height={164}
                    className="w-[164px] h-[164px] object-contain"
                    onError={() => setQrLoadFailed(true)}
                  />
                ) : (
                  <p className="text-[11px] font-bold text-slate-600 px-2 break-all">
                    {lineLaunchUrl}
                  </p>
                )}
              </div>

              <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                スマホのカメラ または LINEのQRコードリーダーで
                <br />
                読み取るとLINEミニアプリが起動します
              </p>

              <button
                type="button"
                id="copy-miniapp-url-btn"
                onClick={handleCopyUrl}
                className="h-9 px-3.5 rounded-xl border border-border bg-muted hover:bg-muted/80 text-foreground font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#06C755]" />
                    <span>URLをコピーしました</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>ミニアプリのリンクをコピー</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 4つの主要領域セクション（最新機能網羅） */}
      <section
        id="features"
        className="border-t border-border bg-background py-12 sm:py-20"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8 sm:space-y-10">
          <div className="text-center space-y-2.5">
            <p className="text-xs font-black tracking-[0.2em] uppercase text-primary">
              ALL-IN-ONE PLATFORM
            </p>
            <h2 className="flex flex-wrap items-center justify-center gap-x-1.5 sm:gap-x-2 gap-y-1.5 text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              <span className="inline-flex items-center gap-2 sm:gap-2.5">
                <PublicBrandLogoImg
                  size={40}
                  alt=""
                  className="w-9 h-9 sm:w-10 sm:h-10 border border-border/80 shadow-2xs"
                />
                <span className="inline-block pr-1 sm:pr-1.5 font-black italic tracking-tighter leading-none text-foreground">
                  iScore<span className="text-primary">Cloud</span>
                </span>
              </span>
              <span className="leading-none">の主な機能</span>
            </h2>
            <p className="text-xs sm:text-sm font-bold text-muted-foreground max-w-2xl mx-auto">
              監督・コーチ・スコアラー・保護者・選手それぞれの現場目線で磨き上げた機能が、すべてLINEミニアプリ内で連動します。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {FEATURE_DOMAINS.map((item) => (
              <article
                key={item.number}
                className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden flex flex-col"
              >
                <div
                  className={cn(
                    "bg-[#0f172a] text-slate-50 border-b-[3px] px-4 py-3 flex items-center justify-between gap-2",
                    item.accentClass
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {item.icon}
                    <span className="text-[11px] font-black tracking-wider uppercase text-slate-200 truncate">
                      {item.badgeText}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black text-slate-400 shrink-0">
                    {item.number}
                  </span>
                </div>

                <div className="p-5 sm:p-6 space-y-3.5 flex-1 flex flex-col">
                  <div className="space-y-1.5">
                    <h3 className="text-base sm:text-lg font-black tracking-tight text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-sm font-bold leading-relaxed text-muted-foreground">
                      {item.lead}
                    </p>
                  </div>

                  <ul className="space-y-2 pt-2 border-t border-border">
                    {item.highlights.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2 text-xs leading-relaxed font-medium text-foreground/90"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 3. ご利用開始までの3ステップ */}
      <section className="border-t border-border bg-background py-12 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="text-center space-y-2">
            <p className="text-xs font-black tracking-[0.2em] uppercase text-primary">
              QUICK ONBOARDING
            </p>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              最短1分でチーム導入・共有スタート
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {ONBOARDING_STEPS.map((s) => (
              <div
                key={s.step}
                className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden flex flex-col"
              >
                <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {s.icon}
                    <span className="text-xs font-black tracking-wider text-white">
                      {s.step}
                    </span>
                  </div>
                </div>
                <div className="p-5 space-y-2 flex-1">
                  <h3 className="text-sm sm:text-base font-black text-foreground">
                    {s.title}
                  </h3>
                  <p className="text-xs leading-relaxed font-medium text-muted-foreground">
                    {s.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicWebLayoutShell>
  );
}