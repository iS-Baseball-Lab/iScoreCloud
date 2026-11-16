// filepath: src/app/liff/privacy/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Lock,
  Scale,
  ShieldCheck,
} from "lucide-react";

const COLLECTED_DATA_ITEMS = [
  {
    num: "①",
    title: "LINE・認証情報",
    desc: "LINEユーザーID、LINE表示名、プロフィール画像URL、およびOAuthログイン時のメールアドレス",
  },
  {
    num: "②",
    title: "成人メンバー・家族・車両情報",
    desc: "氏名・ふりがな、電話番号・メールアドレス（任意登録）、チーム内の役割・お当番班、親子・家族関係、配車用マイカー情報（車種・色・乗車定員・ナンバープレート・燃費等）",
  },
  {
    num: "③",
    title: "選手情報（未成年の児童・生徒を含む）",
    desc: "氏名・ふりがな、背番号、学年・年齢区分、投打・守備位置、身長・体重・身体能力測定値、顔写真・プレー写真、球歴・目標、打撃・投球・守備成績、指導者メモ、ならびに対戦相手チーム名および出場選手記録",
  },
  {
    num: "④",
    title: "コンディショニング・ケガ情報",
    desc: "活動コンディション区分（通常／制限付き／リハビリ／休養）、および指導者共有用の補足メモ",
  },
  {
    num: "⑤",
    title: "リアルタイム位置情報",
    desc: "配車隊列ライブマップで本人が明示的に「共有ON」にした間の緯度・経度、進行方向、移動速度、測位精度、および状況スタンプ（「順調」「渋滞中」「休憩」「到着」）",
  },
  {
    num: "⑥",
    title: "写真・資料データ",
    desc: "フォトギャラリーのアルバム写真、「無圧縮の元データを7日間残す」選択時の無圧縮元ファイル、スコアブック撮影画像、および配布資料（PDF等）",
  },
  {
    num: "⑦",
    title: "通信・端末情報",
    desc: "IPアドレス、User-Agent、Cookie、Web Storage（localStorage・sessionStorage）、および端末内データベース（IndexedDB）",
  },
] as const;

const USAGE_PURPOSES = [
  "LINEミニアプリ・Web版における本人認証、参加承認管理、およびチーム単位のデータアクセス隔離のため",
  "予定共有、ワンタップ出欠確認、お当番割当、遠征配車計画、および隊列ライブマップによる移動・合流状況共有のため",
  "スコアブック記録、個人・チーム成績集計、身体測定・成長記録の管理、およびYouTube試合映像による振り返りのため",
  "スコアブック撮影画像のAI文字認識（OCR）入力補助、およびグラウンド・施設情報のAI検索補助のため",
  "LINE通知・グループ連携メッセージ等による円滑なチーム連絡配信のため",
  "不正アクセスの防止、セキュリティ維持、障害対応、およびお問い合わせ対応のため",
] as const;

export default function LiffPrivacyPage() {
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
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="プライバシーポリシー"
          subtitle="個人情報の取扱いと保護方針（個人情報保護法・LINEミニアプリ準拠）"
          icon={
            <span className="w-8 h-8 rounded-xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black">
              <ShieldCheck className="w-4 h-4" />
            </span>
          }
          showBack
        />

        {/* メインプライバシーポリシーカード（A-3 Solid Card + #0f172a Cap） */}
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
              改定: 2026年11月16日
            </span>
          </div>

          <div className="p-4 space-y-4">
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
                  ・<strong className="text-foreground">ケガ・体調メモの閲覧制限：</strong>
                  詳細なコンディショニングメモは監督・コーチ・管理者のみに制限し、一般保護者には非表示化されます。
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
                  2. 選手のケガ・故障箇所やリハビリ状況等の詳細なコンディショニングメモ（指導者共有用メモ・非公開メモ）は、安全配慮上の機微な情報としてシステム上のロール（役割）権限管理により閲覧範囲を厳格に制限しており、所属チームの指導者・管理者権限を持つ担当者のみが閲覧でき、一般の保護者や他メンバーからは自動的にマスキング（非表示化）されます。
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
                  1. 本サービスは、本人の同意なくバックグラウンドで常時位置情報を取得することはありません。位置情報は、利用者が遠征配車画面（<code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[11px]">/liff/carpool</code>）の隊列ライブマップにおいて、自らの操作で明示的に「位置共有ON」にした間のみ送信されます。
                </p>
                <p className={styles.p}>
                  2. 利用者が「位置共有OFF」に切り替えると、サーバー上の現在地座標は即時に消去されます。また、OFFへの切り忘れがあった場合でも、最終更新から最大6時間以内に自動失効・消去されます。
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
                    アプリケーション実行基盤（Cloudflare Workers）、データベース（Cloudflare D1）、および写真・配布資料等のファイルストレージ（Cloudflare R2）として利用しています。
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
                    隊列ライブマップの地図・渋滞描画および住所検索、PDF配布資料のフォールバック表示、ならびにプライバシー強化モード（<code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">youtube-nocookie.com</code>）による試合映像の埋め込み再生に利用しています。
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
                  1. 当運営は、通信のSSL/TLS暗号化、暗号署名によるセッション検証、チーム分離ミドルウェアによるアクセス制御、および役割に応じた機微情報のマスキング処理等、個人データの漏洩・滅失・毀損の防止その他安全管理のために必要かつ適切な措置を講じています。
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
                <span>改定: 2026年11月16日</span>
              </div>
            </div>

            {/* 利用規約への導線 */}
            <Link
              href="/liff/terms"
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

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
