// filepath: src/components/legal/LegalDocumentContents.tsx
"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  Lock,
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

const COLLECTED_DATA_ITEMS = [
  {
    num: "①",
    title: "LINE・認証情報",
    desc: "LINEユーザーID、LINE表示名、プロフィール画像URL、およびOAuthログイン時のメールアドレス",
  },
  {
    num: "②",
    title: "成人メンバー・家族・車両情報",
    desc: "氏名・ふりがな、電話番号・メールアドレス（任意登録）、チーム内の役職（兼務を含む）・当番班、LINE未連携メンバーの手動登録名簿、親子・家族関係、配車用車両情報（個人所有マイカーおよびチーム共有バス・道具車の車種・乗車定員・ナンバー等）",
  },
  {
    num: "③",
    title: "選手情報（未成年の児童・生徒を含む）",
    desc: "氏名・ふりがな、背番号（背番号なしを含む）、入団日、学年・年齢区分、投打・守備位置、身長・体重（非公開設定可）・身体測定記録、正面写真・プレー背景写真、球歴・目標・登場曲・愛用ギア、打撃・投球・守備成績、ならびに対戦相手チーム名および出場・控え選手記録",
  },
  {
    num: "④",
    title: "コンディショニング・ケガ・休部期間情報",
    desc: "在籍・コンディション区分（通常／一部制限あり／リハビリ・調整中／休部中）、期間履歴（開始日・終了日）、および指導者限定の補足メモ",
  },
  {
    num: "⑤",
    title: "リアルタイム位置情報",
    desc: "配車隊列ライブマップで運転手または同乗者が明示的に「位置共有ON」にした間の緯度・経度、進行方向、移動速度、測位精度、および状況スタンプ（「順調」「渋滞中」「休憩」「到着」）",
  },
  {
    num: "⑥",
    title: "写真・資料データ",
    desc: "フォトギャラリーのアルバム写真、「無圧縮の元データを7日間残す」選択時の無圧縮元ファイル、スコアブック撮影画像、チームロゴ・背景カバー写真、および配布資料（PDF等）",
  },
  {
    num: "⑦",
    title: "通信・端末情報",
    desc: "IPアドレス、User-Agent、Cookie、Web Storage（localStorage・sessionStorage）、および端末内データベース（IndexedDB）",
  },
] as const;

const USAGE_PURPOSES = [
  "LINEミニアプリにおける本人認証、参加承認管理、およびチーム単位のデータアクセス隔離のため",
  "予定共有、グループ別（選手・母・父・スタッフ）出欠確認、当番班割当、遠征配車編成、および隊列ライブマップによる移動・合流状況共有のため",
  "スコアブック記録・早稲田式清書出力、LINE試合速報、個人・チーム成績集計、成長推移レポート管理、およびYouTube試合映像による振り返りのため",
  "スコアブック撮影画像のAI文字認識（OCR）入力補助、およびグラウンド・施設情報のAI検索補助のため",
  "LINE共有ピッカーによる連絡共有、およびチーム管理者が明示的に有効化した場合の週末予定リマインド等のLINEグループ通知配信（初期値OFF）のため",
  "不正アクセスの防止、セキュリティ維持、障害対応、およびお問い合わせ対応のため",
] as const;

export interface TermsDocumentContentProps {
  /** プライバシーポリシーへの遷移先パス（Web版は `/privacy`、LIFF内は `/liff/privacy`） */
  privacyHref: string;
}

/**
 * サービス利用規約 本文コンポーネント（Web版 `/terms` ＆ LIFF内 `/liff/terms` 共通の単一情報源）
 */
export function TermsDocumentContent({
  privacyHref,
}: TermsDocumentContentProps) {
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
          改定: 2026年11月18日
        </span>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
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
              2. チーム招待コードの発行・管理、参加申請の承認（承認待ち「pending」から承認済み「active」への変更）、LINE未連携メンバーの手動名簿追加、役職・兼務および管理権限の付与、ならびに退団・除籍処理は、各チームの代表者・管理者の権限と責任において行われます。
            </p>
            <p className={styles.p}>
              3. チーム内での権限設定、当番班・配車・週末通知の運用ルール、またはメンバー間の連絡・人間関係等に関するトラブルについて、当運営は一切関与せず責任を負いません。
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
              1. 本サービスの出欠確認・遠征配車編成（個人マイカーおよびチーム共有バス・道具車の割当を含む）・隊列ライブマップ機能は、チーム内の連絡および集合調整を補助するための情報共有ツールであり、旅客自動車運送事業やライドシェア・有償運送の仲介・斡旋を行うものではありません。
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
              1. 本サービスが提供するスコア入力・早稲田式清書シート出力・LINE試合速報・自動成績集計（打率、防御率、自責点、勝敗・セーブ等の投手記録その他各種指標）およびアプリ内の「公認野球規則ガイド・判定解説」は、日々のチーム運営・振り返りおよび規則理解を支援するための参考ツールであり、所属連盟や主催大会の公式記録を代替・保証するものではありません（学童・少年野球や地域大会等の特別規則・ローカルルールとは取扱いが異なる場合があります）。
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
              1. チーム代表者・管理者・指導者等が、未成年の選手の氏名、正面写真・プレー写真、背番号、身長・体重・身体測定値、家族関係、またはケガ・休部期間・体調（コンディショニング）に関するメモ等を本サービスに登録・管理する場合、当該チームおよび登録者は、あらかじめ対象選手の親権者（保護者）から本サービスでの利用およびチーム内共有に関する同意を取得していることを保証するものとします。
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
              1. 当運営は、システム保守、セキュリティ対応、天災地変、または連携する外部プラットフォーム（LINEヤフー、Cloudflare®、Google Maps、Google Gemini、YouTube等）の仕様変更・通信障害・利用制限等により、事前の予告なく本サービスの全部または一部を変更、中断、または終了することがあります。
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
            <span>改定: 2026年11月18日</span>
          </div>
        </div>

        {/* プライバシーポリシーへの導線 */}
        <Link
          href={privacyHref}
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
  );
}

export interface PrivacyDocumentContentProps {
  /** サービス利用規約への遷移先パス（Web版は `/terms`、LIFF内は `/liff/terms`） */
  termsHref: string;
}

/**
 * プライバシーポリシー 本文コンポーネント（Web版 `/privacy` ＆ LIFF内 `/liff/privacy` 共通の単一情報源）
 */
export function PrivacyDocumentContent({
  termsHref,
}: PrivacyDocumentContentProps) {
  const styles = {
    card: "p-4 rounded-2xl border border-border bg-card shadow-xs space-y-2.5",
    h3: "text-sm font-black text-foreground flex items-center gap-2 leading-snug",
    badge:
      "w-6 h-6 rounded-lg bg-slate-500/15 text-slate-700 dark:text-slate-200 border border-slate-500/30 text-[11px] font-black flex items-center justify-center shrink-0 tabular-nums",
    p: "text-xs leading-relaxed text-muted-foreground font-medium",
    bullet:
      "text-xs leading-relaxed text-muted-foreground font-medium flex items-start gap-2",
  };

  return (
    <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-slate-500 px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </span>
          <h2 className="text-sm font-black text-white truncate">
            個人情報保護方針（全10条）
          </h2>
        </div>
        <span className="text-[10px] font-bold text-slate-300 shrink-0">
          改定: 2026年11月18日
        </span>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* 前文 */}
        <div className="p-4 rounded-2xl border border-border border-l-4 border-l-slate-500 bg-muted/30 space-y-2">
          <div className="flex items-center gap-2 text-xs font-black text-foreground">
            <Lock className="w-4 h-4 text-primary shrink-0" />
            <span>個人情報保護への取り組み</span>
          </div>
          <p className="text-xs leading-relaxed text-foreground/90 font-medium">
            iS Baseball Lab（iScoreCloud
            運営事務局）（以下「当運営」）は、「iScoreCloud
            LINEミニアプリ」およびWebサービス「iScoreCloud」（以下総称して「本サービス」）における利用者および未成年の選手の個人情報を、個人情報の保護に関する法律（個人情報保護法）および関連ガイドラインに基づき適正に取り扱い、安全に保護いたします。
          </p>
        </div>

        {/* 安心設計の要点コールアウト */}
        <div className="p-3.5 rounded-2xl border border-border bg-muted/40 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>本サービスのプライバシー保護設計（要約）</span>
          </div>
          <div className="space-y-1 text-[11px] leading-relaxed font-bold text-muted-foreground">
            <p>
              ・<strong className="text-foreground">チーム単位の完全隔離：</strong>
              承認された所属チームメンバー以外に予定・名簿・写真は公開されません。
            </p>
            <p>
              ・<strong className="text-foreground">ケガ・体調メモ＆非公開体重の保護：</strong>
              詳細なコンディショニングメモは指導者・管理者のみに制限し、体重の非公開設定時もサーバー側で自動マスクされます。
            </p>
            <p>
              ・<strong className="text-foreground">GPS常時追跡なし＆写真EXIF自動除去：</strong>
              位置共有は手動ON時のみ送信（OFFで即時消去・最大6時間で自動失効）。通常アップロード写真は撮影位置EXIFを自動除去します。
            </p>
          </div>
        </div>

        {/* 第1条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className={styles.badge}>1</span>
            <span>第1条（取得する情報）</span>
          </h3>
          <p className={styles.p}>
            本サービスでは、チーム運営・連絡調整・記録管理に必要な範囲で以下の情報を取得します。
          </p>
          <div className="space-y-2 pt-1">
            {COLLECTED_DATA_ITEMS.map((item) => (
              <div
                key={item.num}
                className="p-2.5 rounded-xl border border-border bg-muted/25 space-y-0.5"
              >
                <div className="text-xs font-black text-foreground">
                  {item.num} {item.title}
                </div>
                <p className="text-[11px] leading-relaxed font-medium text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 第2条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className={styles.badge}>2</span>
            <span>第2条（利用目的）</span>
          </h3>
          <p className={styles.p}>
            当運営は、取得した情報を以下の利用目的の範囲内で適正に利用いたします。
          </p>
          <div className="space-y-1.5 pt-0.5">
            {USAGE_PURPOSES.map((text, i) => (
              <div key={i} className={styles.bullet}>
                <span className="text-primary font-black shrink-0">・</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 第3条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className={styles.badge}>3</span>
            <span>第3条（未成年の選手情報およびケガ・体調情報の厳格管理）</span>
          </h3>
          <div className="space-y-1.5">
            <p className={styles.p}>
              1. 未成年の児童・生徒に関する選手情報の登録は、親権者（保護者）ご自身による登録、またはチーム代表者・管理者・指導者が事前に親権者の同意を得たうえで行うことを前提として取り扱います。
            </p>
            <p className={styles.p}>
              2. 選手のケガ・故障箇所やリハビリ・休部事情等の詳細なコンディショニングメモ（指導者限定メモ）は、安全配慮上の機微な情報としてシステム上の役職権限管理により閲覧範囲を厳格に制限しており、所属チームの指導者・管理者権限を持つ担当者のみが閲覧でき、一般の保護者や他メンバーからは自動的にマスキング（非表示化）されます。また、体重の非公開設定を有効にした選手の体重情報も一般閲覧者向けには非表示化されます。
            </p>
          </div>
        </div>

        {/* 第4条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className={styles.badge}>4</span>
            <span>
              第4条（リアルタイムGPS位置情報の取得条件・即時消去・自動失効）
            </span>
          </h3>
          <div className="space-y-1.5">
            <p className={styles.p}>
              1. 本サービスは、本人の同意なくバックグラウンドで常時位置情報を取得することはありません。位置情報は、利用者が遠征配車画面の隊列ライブマップにおいて、自らの操作で明示的に「位置共有ON」にした間のみ送信されます。
            </p>
            <p className={styles.p}>
              2. 利用者が「位置共有OFF」に切り替えると、サーバー上の現在地座標は即時に消去されます。また、OFFへの切り忘れがあった場合でも、到着スタンプ操作時または最終更新から最大6時間以内に自動失効・消去されます。
            </p>
            <p className={styles.p}>
              3. 送信された位置情報は所属チーム内の合流・到着確認にのみ利用し、過去の移動ルートの履歴保存や広告配信目的での利用は一切行いません。
            </p>
          </div>
        </div>

        {/* 第5条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className={styles.badge}>5</span>
            <span>
              第5条（フォトギャラリーにおけるEXIF情報の自動除去と元データ保存時の例外）
            </span>
          </h3>
          <div className="space-y-1.5">
            <p className={styles.p}>
              1. フォトギャラリーへの通常アップロード（「Web高画質」画像およびサムネイル）では、利用者の端末内（HTML5 Canvas）で画像を再エンコードしてから送信するため、撮影場所のGPS座標やカメラ情報等のEXIFメタデータは自動的に除去されます。
            </p>
            <p className={styles.p}>
              2. ただし、投稿者が印刷受け渡し等の目的で任意オプション「無圧縮の元データを7日間残す（元画質オリジナル共有）」を明示的にONにしてアップロードした場合に限り、撮影時のEXIF情報（GPS位置情報・撮影日時・機種情報等）が含まれ得る無圧縮の元ファイルがチーム内ダウンロード用に保存されます。この無圧縮元ファイルは、アップロードから7日経過後にストレージから自動的に完全削除されます。
            </p>
          </div>
        </div>

        {/* 第6条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className={styles.badge}>6</span>
            <span>第6条（チーム単位の共有範囲・アクセス隔離と第三者提供の制限）</span>
          </h3>
          <div className="space-y-1.5">
            <p className={styles.p}>
              1. 本サービスに登録された予定・出欠・配車・名簿・成績・写真等のデータは、承認済みの所属チームメンバー（<code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[11px]">active</code>）および当該クラブ管理者のみがアクセスできる単位で論理的に隔離されます。
            </p>
            <p className={styles.p}>
              2. 当運営は、法令に基づく場合または人の生命・身体・財産の保護のために緊急の必要がある場合を除き、本人の同意なく個人データを第三者（所属チーム外の第三者を含みます）に提供しません。
            </p>
            <p className={styles.p}>
              3. なお、所属メンバーが画像・資料の直接URLや限定公開の試合映像URL等をチーム外へ転送した場合、第三者が閲覧可能となるおそれがあるため、外部へのURL共有およびSNS等への無断転載は利用規約により禁止しています。
            </p>
          </div>
        </div>

        {/* 第7条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className={styles.badge}>7</span>
            <span>第7条（外部サービス・生成AI・外国にあるクラウド基盤の利用）</span>
          </h3>
          <p className={styles.p}>
            本サービスの提供・運用にあたり、適切な安全管理措置を講じたうえで以下の外部事業者のサービスおよびクラウド基盤を利用しています（外国にあるサーバーでの処理・保管を含みます）。
          </p>

          <div className="space-y-2 pt-1">
            <div className="p-3 rounded-xl border border-border bg-muted/25 space-y-1">
              <div className="text-xs font-black text-foreground">
                1. Cloudflare, Inc.（アメリカ合衆国）
              </div>
              <p className="text-[11px] leading-relaxed font-medium text-muted-foreground">
                アプリケーション実行基盤（Cloudflare Workers®）、データベース（Cloudflare D1）、および写真・配布資料等のファイルストレージ（Cloudflare R2）として利用しています。
              </p>
            </div>

            <div className="p-3 rounded-xl border border-border bg-muted/25 space-y-1.5">
              <div className="text-xs font-black text-foreground">
                2. Google LLC（アメリカ合衆国）
              </div>
              <p className="text-[11px] leading-relaxed font-medium text-muted-foreground">
                ・<strong className="text-foreground">Google Gemini API：</strong>
                スコアブック画像のAI自動解析（OCR：スコアブック撮影画像および照合用の登録選手名を送信）ならびにグラウンド・施設情報のAI検索補助（施設検索クエリを送信）に利用しています。
              </p>
              <p className="text-[11px] leading-relaxed font-medium text-muted-foreground">
                ・<strong className="text-foreground">Google Maps Platform / Google Docs Viewer / YouTube：</strong>
                隊列ライブマップや球場カードの地図・渋滞描画および住所検索、PDF配布資料のフォールバック表示、ならびにプライバシー強化モード（<code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">youtube-nocookie.com</code>）による試合映像の埋め込み再生に利用しています。
              </p>
              <div className="pt-0.5">
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-black text-primary underline underline-offset-2 hover:opacity-80"
                >
                  <span>Google プライバシーポリシー</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-border bg-muted/25 space-y-1">
              <div className="text-xs font-black text-foreground">
                3. LINEヤフー株式会社（日本）
              </div>
              <p className="text-[11px] leading-relaxed font-medium text-muted-foreground">
                LIFF（LINEミニアプリ）SDKによるユーザー認証、LINE共有ピッカーによる招待・連絡共有、およびMessaging APIによるグループ通知配信に利用しています。
              </p>
            </div>
          </div>
        </div>

        {/* 第8条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className={styles.badge}>8</span>
            <span>第8条（Cookie・ローカルストレージ等の利用）</span>
          </h3>
          <p className={styles.p}>
            本サービスでは、ログインセッションの維持、画面表示の高速化キャッシュ（<code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[11px]">localStorage</code>・<code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[11px]">sessionStorage</code>）、およびスコアブック取込作業中の一時下書き保存（<code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[11px]">IndexedDB</code>：最大14日間で自動整理）の目的でのみCookieおよび端末内ストレージを利用します。行動ターゲティング広告等の追跡目的での利用は一切行いません。
          </p>
        </div>

        {/* 第9条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className={styles.badge}>9</span>
            <span>第9条（退団・除籍・チーム削除時のデータの取扱い）</span>
          </h3>
          <div className="space-y-1.5">
            <p className={styles.p}>
              1. メンバーがチームを退団または除籍された場合、当該メンバーによるチームデータへのアクセス権は直ちに停止され、メンバー名簿・連絡先等の登録情報は削除または非表示化されます。なお、過去の試合スコアやチーム通算成績等の競技記録はチームの活動履歴として残る場合があります。
            </p>
            <p className={styles.p}>
              2. チーム全体の削除、または本人・親権者（保護者）からの個別データの削除要望については、所属チーム管理者または下記お問い合わせ窓口にて受け付け、本人確認のうえ合理的な期間内に対応いたします。
            </p>
          </div>
        </div>

        {/* 第10条 */}
        <div className={styles.card}>
          <h3 className={styles.h3}>
            <span className={styles.badge}>10</span>
            <span>第10条（安全管理措置・開示等の請求・お問い合わせ窓口）</span>
          </h3>
          <div className="space-y-1.5">
            <p className={styles.p}>
              1. 当運営は、通信のSSL/TLS暗号化、暗号署名によるセッション検証、チーム分離ミドルウェアによるアクセス制御、および役職に応じた機微情報のマスキング処理等、個人データの漏洩・滅失・毀損の防止その他安全管理のために必要かつ適切な措置を講じています。
            </p>
            <p className={styles.p}>
              2. 保有個人データの開示・訂正・追加・削除・利用停止・消去等のご請求、および個人情報の取扱いに関するお問い合わせは、下記窓口までご連絡ください。なお、本ポリシーは法令改正やサービス内容の変更に応じて随時改定されることがあります。
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
            <span>改定: 2026年11月18日</span>
          </div>
        </div>

        {/* 利用規約への導線 */}
        <Link
          href={termsHref}
          className="p-3.5 rounded-2xl border border-border bg-muted/30 hover:bg-muted/60 transition-colors flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-black text-foreground truncate">
                サービス利用規約を確認する
              </div>
              <div className="text-[11px] font-bold text-muted-foreground truncate">
                ご利用条件・運転中の操作厳禁・配車や写真共有の免責事項
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </Link>
      </div>
    </section>
  );
}
