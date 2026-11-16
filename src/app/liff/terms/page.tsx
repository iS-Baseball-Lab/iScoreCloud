// filepath: src/app/liff/terms/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  FileText,
  Scale,
  ShieldCheck,
} from "lucide-react";

const PROHIBITED_ITEMS = [
  "法令、裁判所の判決・命令、または公序良俗に違反する行為（自動車・自転車等の運転中におけるスマートフォン操作・画面注視を含みます）",
  "当運営、所属チーム関係者、対戦相手、審判員、その他第三者の知的財産権、肖像権、プライバシー、名誉その他の権利・利益を侵害する行為",
  "チーム招待コード、限定公開の試合映像URL、アルバム写真、配布資料、メンバーの連絡先・個人情報等を権限なく外部やSNS等へ漏洩・無断転載する行為",
  "虚偽の情報の登録、第三者へのなりすまし、または権限のないチーム・データへの不正アクセスを試みる行為",
  "本サービスを営利目的の勧誘、広告宣伝、営業活動、政治活動、宗教活動等に不正利用する行為",
  "サーバーやネットワークに過度な負荷をかける行為、その他本サービスの正常な運営やセキュリティを妨害する行為",
] as const;

export default function LiffTermsPage() {
  const styles = {
    card: "p-4 rounded-2xl border border-border bg-card shadow-xs space-y-2.5",
    h3: "text-sm font-black text-foreground flex items-center gap-2 leading-snug",
    badge:
      "w-6 h-6 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-black flex items-center justify-center shrink-0 tabular-nums",
    p: "text-xs leading-relaxed text-muted-foreground font-medium",
    bullet:
      "text-xs leading-relaxed text-muted-foreground font-medium flex items-start gap-2",
  };

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="サービス利用規約"
          subtitle="iScoreCloud LINEミニアプリ ご利用条件と免責事項"
          icon={
            <span className="w-8 h-8 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
              <Scale className="w-4 h-4" />
            </span>
          }
          showBack
        />

        {/* メイン規約ドキュメントカード（A-3 Solid Card + #0f172a Cap） */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-black text-white truncate">
                利用規約・免責事項（全10条）
              </h2>
            </div>
            <span className="text-[10px] font-bold text-slate-300 shrink-0">
              改定: 2026年11月16日
            </span>
          </div>

          <div className="p-4 space-y-4">
            {/* 前文 */}
            <div className="p-4 rounded-2xl border border-border border-l-4 border-l-amber-500 bg-muted/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-black text-amber-700 dark:text-amber-400">
                <FileText className="w-4 h-4 shrink-0" />
                <span>はじめに</span>
              </div>
              <p className="text-xs leading-relaxed text-foreground/90 font-medium">
                本利用規約（以下「本規約」）は、iS Baseball Lab（iScoreCloud
                運営事務局）（以下「当運営」）が提供する「iScoreCloud
                LINEミニアプリ」およびWebサービス「iScoreCloud」（以下総称して「本サービス」）の利用条件および免責事項を定めるものです。保護者・選手・指導者・チーム管理者の皆さまは、本規約に同意のうえ本サービスをご利用ください。
              </p>
            </div>

            {/* スマホ閲覧向け：重要ポイント要約コールアウト */}
            <div className="p-3.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-amber-900 dark:text-amber-200">
                <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>ご利用にあたっての重要ポイント（要約）</span>
              </div>
              <div className="space-y-1.5 text-[11px] leading-relaxed font-bold text-foreground/90">
                <p>
                  ・<strong className="font-black">運転中のスマホ操作・注視は厳禁：</strong>
                  配車マップの位置共有切替やスタンプ操作は、必ず出発前・停車中または同乗者が行ってください。
                </p>
                <p>
                  ・<strong className="font-black">配車・移動の責任：</strong>
                  本サービスは連絡補助ツールであり、事故・保険確認・チャイルドシート着用・実費精算はチームおよび当事者間で対応してください。
                </p>
                <p>
                  ・<strong className="font-black">肖像権配慮とマスター保管：</strong>
                  写真・映像のSNS等への無断転載は禁止です。7日間保存の無圧縮元データは期限後に自動削除されます。
                </p>
                <p>
                  ・<strong className="font-black">スコア・AI機能の性質：</strong>
                  自動成績集計・野球規則ガイド・AI解析は運営補助の参考情報であり、公式記録や現地案内との照合をお願いします。
                </p>
              </div>
            </div>

            {/* 第1条 */}
            <div className={styles.card}>
              <h3 className={styles.h3}>
                <span className={styles.badge}>1</span>
                <span>第1条（適用・定義・未成年者の利用同意）</span>
              </h3>
              <div className="space-y-1.5">
                <p className={styles.p}>
                  1. 本規約は、本サービスを閲覧・利用するすべての利用者（保護者、選手、監督・コーチ等の指導者、チーム代表者・管理者を含みます）に適用されます。
                </p>
                <p className={styles.p}>
                  2. 未成年者（児童・生徒等）が自身の端末およびLINEアカウントを用いて本サービスを直接利用する場合、必ず親権者等の法定代理人の事前同意を得たうえでご利用ください。
                </p>
                <p className={styles.p}>
                  3. 当運営が本サービス上で別途定める「プライバシーポリシー」および各機能画面上の注意表示は、本規約の一部を構成するものとします。
                </p>
              </div>
            </div>

            {/* 第2条 */}
            <div className={styles.card}>
              <h3 className={styles.h3}>
                <span className={styles.badge}>2</span>
                <span>第2条（アカウント管理・招待承認・チーム管理権限）</span>
              </h3>
              <div className="space-y-1.5">
                <p className={styles.p}>
                  1. 利用者は自己の責任においてLINEアカウントおよびログインセッションを適切に管理するものとし、端末の紛失や第三者による不正使用等により生じた損害について当運営は責任を負いません。
                </p>
                <p className={styles.p}>
                  2. チーム招待コードの発行・管理、参加申請の承認（承認待ち「pending」から承認済み「active」への変更）、役割・管理権限の付与、および退団・除籍処理は、各チームの代表者・管理者の権限と責任において行われます。
                </p>
                <p className={styles.p}>
                  3. チーム内での権限設定、当番・配車の運用ルール、またはメンバー間の連絡・人間関係等に関するトラブルについて、当運営は一切関与せず責任を負いません。
                </p>
              </div>
            </div>

            {/* 第3条 */}
            <div className={styles.card}>
              <h3 className={styles.h3}>
                <span className={styles.badge}>3</span>
                <span>
                  第3条（出欠・遠征配車・隊列ライブマップおよび運転中の操作厳禁）
                </span>
              </h3>

              {/* 道路交通法遵守・運転中の操作厳禁ハイライトボックス */}
              <div className="p-3 rounded-xl border-2 border-rose-500/50 bg-rose-500/10 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-black text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>【厳守】道路交通法の遵守・運転中のスマホ操作厳禁</span>
                </div>
                <p className="text-xs leading-relaxed font-bold text-foreground">
                  自動車・原動機付自転車・自転車等の運転中にスマートフォンを操作すること、および画面を注視することは道路交通法により厳しく禁止されています。位置情報共有（GPS）のON/OFF切替、状況スタンプ（「順調」「渋滞中」「休憩」「到着」）の送信、ならびに隊列ライブマップの確認は、必ず出発前・安全な場所への停車後に行うか、助手席等の同乗者が操作してください。
                </p>
              </div>

              <div className="space-y-1.5">
                <p className={styles.p}>
                  1. 本サービスの出欠確認・遠征配車割当・隊列ライブマップ機能は、チーム内の連絡および集合調整を補助するための情報共有ツールであり、旅客自動車運送事業やライドシェア・有償運送の仲介・斡旋を行うものではありません。
                </p>
                <p className={styles.p}>
                  2. 配車・移動に伴う交通事故、車両の汚損・破損、任意自動車保険（対人・対物・搭乗者傷害補償等）の適用条件の事前確認、チャイルドシート・ジュニアシート等の着用義務遵守、ならびにガソリン代・高速道路料金・駐車場代等の実費精算に関する取り決めやトラブルは、すべて所属チームおよび当事者間の責任において確認・解決するものとし、当運営は一切の責任を負いません。
                </p>
              </div>
            </div>

            {/* 第4条 */}
            <div className={styles.card}>
              <h3 className={styles.h3}>
                <span className={styles.badge}>4</span>
                <span>第4条（スコア記録・公認野球規則ガイド・AI解析機能の免責）</span>
              </h3>
              <div className="space-y-1.5">
                <p className={styles.p}>
                  1. 本サービスが提供するスコア入力・自動成績集計（打率、防御率、自責点、勝敗・セーブ等の投手記録その他各種指標）およびアプリ内の「公認野球規則ガイド」は、日々のチーム運営・振り返りおよび規則学習を支援するための参考ツールであり、所属連盟や主催大会の公式記録を代替・保証するものではありません（学童・少年野球や地域大会等の特別規則・ローカルルールとは取扱いが異なる場合があります）。
                </p>
                <p className={styles.p}>
                  2. AIスコアブック自動解析（OCR）およびAIグラウンド・施設情報検索（Google Gemini等の外部生成AIを利用）の結果には、手書き文字の誤認識、集計誤差、または古い・不正確な施設住所・地図ピン位置・駐車ルール等が含まれる場合があります。利用者は必ず元のスコアブック原本、大会公式要項、および現地案内・公式地図等と照合・確認のうえご利用ください。
                </p>
              </div>
            </div>

            {/* 第5条 */}
            <div className={styles.card}>
              <h3 className={styles.h3}>
                <span className={styles.badge}>5</span>
                <span>
                  第5条（フォトギャラリー・試合映像・配布資料と肖像権・データ保全免責）
                </span>
              </h3>
              <div className="space-y-1.5">
                <p className={styles.p}>
                  1. フォトギャラリーへの写真投稿、試合映像（YouTube限定公開URL等）の登録、および配布資料（PDF等）のアップロードを行う利用者および所属チームは、自チーム関係者だけでなく、対戦相手チームの選手・指導者、審判員、観客等の肖像権・プライバシー権、第三者の著作権、ならびに大会主催者が定める撮影・配信ルールを遵守する責任を負います。
                </p>
                <p className={styles.p}>
                  2. チーム内で共有された写真、配布資料URL、または限定公開の試合映像URL等を、権限なくチーム外へ転送すること、ならびに外部SNS・動画投稿サイト（X、Instagram、TikTok、公開設定のYouTube等）へ無断転載・公開する行為を固く禁止します。
                </p>
                <p className={styles.p}>
                  3. フォトギャラリーで「無圧縮の元データを7日間残す」オプションを選択した際の元ファイル（オリジナルデータ）は、アップロードから7日経過後にクラウドストレージから自動かつ完全に削除され、復元することはできません。また、本サービスは写真・スコア記録・配布資料等の永続的なバックアップを保証するものではありません。大切なデータの原本（マスターデータ）は、必ず利用者ご自身の端末や外部記録媒体に保管してください。
                </p>
              </div>
            </div>

            {/* 第6条 */}
            <div className={styles.card}>
              <h3 className={styles.h3}>
                <span className={styles.badge}>6</span>
                <span>第6条（未成年の選手情報の登録と保護者同意保証）</span>
              </h3>
              <div className="space-y-1.5">
                <p className={styles.p}>
                  1. チーム代表者・管理者・指導者等が、未成年の選手の氏名、顔写真・プレー写真、背番号、身長・体重・身体測定値、家族関係、またはケガ・体調（コンディショニング）に関するメモ等を本サービスに登録・管理する場合、当該チームおよび登録者は、あらかじめ対象選手の親権者（保護者）から本サービスでの利用およびチーム内共有に関する同意を取得していることを保証するものとします。
                </p>
                <p className={styles.p}>
                  2. 親権者（保護者）から選手情報の訂正・非表示・削除等の申し出があった場合、チーム管理者は速やかに誠実に対応するものとします。
                </p>
              </div>
            </div>

            {/* 第7条 */}
            <div className={styles.card}>
              <h3 className={styles.h3}>
                <span className={styles.badge}>7</span>
                <span>第7条（禁止事項）</span>
              </h3>
              <p className={styles.p}>
                利用者は、本サービスの利用にあたり、以下の各号に該当する行為をしてはなりません。
              </p>
              <div className="space-y-1.5 pt-0.5">
                {PROHIBITED_ITEMS.map((text, i) => (
                  <div key={i} className={styles.bullet}>
                    <Ban className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 第8条 */}
            <div className={styles.card}>
              <h3 className={styles.h3}>
                <span className={styles.badge}>8</span>
                <span>第8条（サービスの変更・中断・終了および免責事項）</span>
              </h3>
              <div className="space-y-1.5">
                <p className={styles.p}>
                  1. 当運営は、システム保守、セキュリティ対応、天災地変、または連携する外部プラットフォーム（LINEヤフー、Cloudflare、Google Maps、Google Gemini、YouTube等）の仕様変更・通信障害・利用制限等により、事前の予告なく本サービスの全部または一部を変更、中断、または終了することがあります。
                </p>
                <p className={styles.p}>
                  2. 当運営は、本サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、特定目的への適合性、セキュリティ上の欠陥、エラー・バグ等を含みます）がないことを明示的にも黙示的にも保証しません。
                </p>
                <p className={styles.p}>
                  3. 本サービスの利用または利用不能に起因して利用者または第三者に生じた損害について、当運営に故意または重過失がある場合を除き、当運営は一切の責任を負いません。なお、消費者契約法その他の強行法規の適用により当運営が損害賠償責任を負う場合であっても、当運営の故意または重過失による場合を除き、賠償の範囲は利用者に直接かつ現実に生じた通常の損害に限られるものとします。
                </p>
              </div>
            </div>

            {/* 第9条 */}
            <div className={styles.card}>
              <h3 className={styles.h3}>
                <span className={styles.badge}>9</span>
                <span>第9条（反社会的勢力の排除）</span>
              </h3>
              <p className={styles.p}>
                利用者は、現在および将来にわたり、暴力団、暴力団員、暴力団準構成員、総会屋、社会運動等標ぼうゴロ、特殊知能暴力集団その他これらに準ずる反社会的勢力に該当しないこと、ならびに反社会的勢力と資金提供・便宜供与その他いかなる不当な関係も有しないことを表明し保証します。当運営は、利用者が本条に違反したと判断した場合、何らの催告なく直ちに本サービスの利用停止または登録削除を行うことができます。
              </p>
            </div>

            {/* 第10条 */}
            <div className={styles.card}>
              <h3 className={styles.h3}>
                <span className={styles.badge}>10</span>
                <span>第10条（規約の改定・準拠法・合意管轄・お問い合わせ）</span>
              </h3>
              <div className="space-y-1.5">
                <p className={styles.p}>
                  1. 当運営は、法令の改正、機能追加、または運営上の必要に応じて本規約を改定できるものとします。重要な改定を行う場合は本サービス上で周知し、改定日以降に利用者が本サービスを利用した時点で改定後の規約に同意したものとみなします。
                </p>
                <p className={styles.p}>
                  2. 本規約の解釈および適用は日本法に準拠するものとし、本サービスに関して当運営と利用者との間で紛争が生じた場合は、当運営の所在地を管轄する地方裁判所または簡易裁判所を第一審の専属的合意管轄裁判所とします。
                </p>
                <p className={styles.p}>
                  3. 本規約および本サービスに関するお問い合わせは、下記窓口までご連絡ください。
                </p>
              </div>

              <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1.5 text-xs">
                <div className="font-bold text-foreground">
                  対象サービス: iScoreCloud LINEミニアプリ / Webサービス iScoreCloud
                </div>
                <div className="font-bold text-foreground">
                  運営者: iS Baseball Lab（iScoreCloud 運営事務局）
                </div>
                <div className="text-muted-foreground flex items-center gap-1.5 flex-wrap font-medium">
                  <span>お問い合わせ窓口:</span>
                  <a
                    href="mailto:info@iscorecloud.com"
                    className="text-primary font-black hover:underline"
                  >
                    info@iscorecloud.com
                  </a>
                </div>
              </div>

              <div className="pt-2 border-t border-border text-[10px] font-bold text-muted-foreground flex items-center justify-between">
                <span>制定: 2026年4月1日</span>
                <span>改定: 2026年11月16日</span>
              </div>
            </div>

            {/* プライバシーポリシーへの導線 */}
            <Link
              href="/liff/privacy"
              className="p-3.5 rounded-2xl border border-border bg-muted/30 hover:bg-muted/60 transition-colors flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-black text-foreground truncate">
                    プライバシーポリシーを確認する
                  </div>
                  <div className="text-[11px] font-bold text-muted-foreground truncate">
                    個人情報の取扱い・位置情報・EXIF除去・外部AI連携について
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          </div>
        </section>

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
