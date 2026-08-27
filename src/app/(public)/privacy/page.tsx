// filepath: src/app/(public)/privacy/page.tsx
import React from "react";
import { ShieldCheck, Lock, Fingerprint, Eye, Database, Share2, UserCheck, RefreshCw } from "lucide-react";

export const metadata = {
  title: "プライバシーポリシー | iScoreCloud",
  description: "iScoreCloud（iScoreMiniを含む）における個人情報の取扱い、収集目的、管理体制に関するプライバシーポリシーです。",
};

export default function PrivacyPage() {
  const styles = {
    section: "space-y-4 pt-10 first:pt-0 border-t border-border/40 first:border-none",
    h2: "text-lg font-black text-foreground flex items-center gap-3 tracking-tight",
    p: "text-sm leading-relaxed text-muted-foreground/90 pl-9",
    ol: "list-none space-y-3 pl-9",
    li: "text-sm leading-relaxed text-muted-foreground/90 flex gap-3",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-12 py-6 px-4">
      {/* ヘッダー */}
      <header className="space-y-4 pb-10 border-b-2 border-primary/20">
        <div className="flex items-center gap-3 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-black tracking-[0.2em] uppercase">Security & Privacy Policy</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black italic tracking-tighter text-foreground">
          プライバシーポリシー <span className="text-muted-foreground/40 ml-2 text-2xl md:text-3xl font-normal">Privacy Policy</span>
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
          <span>最終改訂日: 2026年8月27日</span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span>制定日: 2026年4月1日</span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span>iS Baseball Lab (iScoreCloud 運営事務局)</span>
        </div>
      </header>

      <div className="space-y-10">
        {/* 前文 */}
        <section className={styles.section}>
          <div className="flex items-start gap-4">
            <Lock className="h-5 w-5 text-primary/60 shrink-0 mt-1" />
            <p className="text-sm font-medium leading-relaxed italic text-foreground/90">
              iS Baseball Lab（以下「当運営」）は、提供するスコアブック＆チームマネジメントWebサービス「iScoreCloud」およびLINEミニアプリ「iScoreMini」（以下総称して「本サービス」）において、ユーザーのプライバシーを尊重し、個人情報の保護に関する法律（以下「個人情報保護法」）を遵守して、適切な管理・保護に努めます。
            </p>
          </div>
        </section>

        {/* 第1条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">01.</span>
            第1条（収集する情報および収集方法）
          </h2>
          <p className={styles.p}>
            本サービスでは、円滑なチーム運営、出欠管理、配車調整、スコア記録・動画配信機能の提供にあたり、以下の情報を収集することがあります。
          </p>
          <div className={styles.ol}>
            <div className={styles.li}>
              <Fingerprint className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" />
              <span><strong>アカウント情報:</strong> 氏名・ニックネーム、メールアドレス、パスワード（ハッシュ化して保存）</span>
            </div>
            <div className={styles.li}>
              <Fingerprint className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" />
              <span><strong>LINE連携情報:</strong> LINEユーザーID、表示名、プロフィール画像URL（LINEログインまたはLIFF経由で認証された場合）</span>
            </div>
            <div className={styles.li}>
              <Fingerprint className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" />
              <span><strong>チーム・選手情報:</strong> 所属組織・チーム名、背番号、選手名、学年/カテゴリ、出欠ステータス、配車希望状況、お当番割り当て情報</span>
            </div>
            <div className={styles.li}>
              <Fingerprint className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" />
              <span><strong>試合記録・メディア情報:</strong> 試合日程、対戦相手、スコアボードデータ、打撃・投球成績、YouTubeハイライト動画URL、チーム共有資料（PDF・画像）</span>
            </div>
          </div>
        </section>

        {/* 第2条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">02.</span>
            第2条（個人情報の利用目的）
          </h2>
          <p className={styles.p}>
            当運営は、収集した個人情報を以下の目的のために利用します。
          </p>
          <div className={styles.ol}>
            {[
              "本サービスのアカウント認証、チームメンバーシップ管理および機能提供のため",
              "次回試合・練習の予定共有、ワンタップ出欠回答、配車表・お当番表の自動集計のため",
              "試合スコアブックの記録、個人・チーム成績の分析およびYouTube試合動画アーカイブの共有のため",
              "LINE公式アカウントおよびLINEミニアプリを通じた重要なリマインド通知やお知らせの配信のため",
              "ユーザーからの問い合わせ対応、本人確認、セキュリティ向上および不正利用防止のため",
              "サービスの品質向上、新機能開発のための統計的データ分析（個人を特定できない形式）のため"
            ].map((text, i) => (
              <div key={i} className={styles.li}>
                <Eye className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 第3条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">03.</span>
            第3条（個人情報の第三者提供）
          </h2>
          <p className={styles.p}>
            当運営は、以下の場合を除き、ユーザー本人の同意を得ることなく第三者に個人情報を提供することはありません。
          </p>
          <div className={styles.ol}>
            {[
              "法令に基づく開示要請がある場合",
              "人の生命、身体または財産の保護のために必要がある場合であって、本人の同意を得ることが困難であるとき",
              "公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合",
              "国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合",
              "業務委託先（クラウドインフラ提供事業者、認証基盤等）に対して利用目的の達成に必要な範囲で委託する場合"
            ].map((text, i) => (
              <div key={i} className={styles.li}>
                <Share2 className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 第4条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">04.</span>
            第4条（安全管理体制およびセキュリティ）
          </h2>
          <p className={styles.p}>
            当運営は、個人情報の漏洩、滅失またはき損の防止その他の個人情報の安全管理のために、SSL/TLSによる通信の暗号化、アクセス権限の最小化、データベースの保護など、必要かつ適切なセキュリティ対策を講じています。
          </p>
        </section>

        {/* 第5条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">05.</span>
            第5条（個人情報の開示・訂正・利用停止・削除）
          </h2>
          <p className={styles.p}>
            ユーザーは、当運営に対してご自身の個人情報の開示、訂正、追加、削除または利用停止を請求することができます。請求があった場合は、ご本人確認を行った上で、法令の定めに従い合理的な期間内に対応いたします。
          </p>
        </section>

        {/* 第6条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">06.</span>
            第6条（Cookieおよび外部ツールの利用）
          </h2>
          <p className={styles.p}>
            本サービスでは、ログイン状態の維持、テーマ・UI設定の保存、アクセス解析のためにCookieおよびローカルストレージ（localStorage）を使用しています。ユーザーはブラウザの設定によりCookieを無効化できますが、その場合一部のサービスが正常に機能しない場合があります。
          </p>
        </section>

        {/* 第7条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">07.</span>
            第7条（プライバシーポリシーの改訂）
          </h2>
          <p className={styles.p}>
            当運営は、法令の変更やサービス内容の拡充に伴い、本ポリシーを随時改訂することがあります。改訂後のポリシーは、本サービス上に掲載した時点から効力を生じるものとします。
          </p>
        </section>

        {/* お問い合わせ窓口 */}
        <section className="pt-10 border-t border-border/40 space-y-4 bg-muted/30 p-6 rounded-3xl">
          <h3 className="text-base font-black text-foreground flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            お問い合わせ窓口
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            本ポリシーおよび個人情報の取扱いに関するご質問、ご相談、開示等の請求は、本サービス内のお問い合わせフォームまたはチーム管理者を通じてご連絡ください。
          </p>
          <div className="text-xs font-bold text-foreground pt-1">
            iS Baseball Lab 個人情報保護担当
          </div>
        </section>
      </div>
    </div>
  );
}
