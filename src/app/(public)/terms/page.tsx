// filepath: src/app/(public)/terms/page.tsx
import React from "react";
import { Scale, FileText, AlertTriangle, ShieldCheck, CheckCircle2, UserCheck, Ban } from "lucide-react";

export const metadata = {
  title: "サービス利用規約 | iScoreCloud",
  description: "iScoreCloud（iScoreMiniを含む）のサービス利用条件およびユーザーの権利義務を定める利用規約です。",
};

export default function TermsPage() {
  const styles = {
    section: "space-y-4 pt-10 first:pt-0 border-t border-border/40 first:border-none",
    h2: "text-lg font-black text-foreground flex items-center gap-3 tracking-tight",
    p: "text-sm leading-relaxed text-muted-foreground/90 pl-9",
    ol: "list-none space-y-3 pl-9",
    li: "text-sm leading-relaxed text-muted-foreground/90 flex gap-2.5",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-12 py-6 px-4">
      {/* 統一ヘッダー */}
      <header className="space-y-4 pb-10 border-b-2 border-primary/20">
        <div className="flex items-center gap-3 text-primary">
          <Scale className="h-5 w-5" />
          <span className="text-xs font-black tracking-[0.2em] uppercase">Terms of Service</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black italic tracking-tighter text-foreground">
          サービス利用規約 <span className="text-muted-foreground/40 ml-2 text-2xl md:text-3xl font-normal">Terms of Service</span>
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
          <span>最終改訂日: 2026年8月27日</span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span>制定日: 2026年4月1日</span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span>iS Baseball Lab (iScoreCloud 運営事務局)</span>
        </div>
      </header>

      {/* コンテンツエリア */}
      <div className="space-y-10">
        {/* 前文 */}
        <section className={styles.section}>
          <div className="flex items-start gap-4">
            <FileText className="h-5 w-5 text-primary/60 shrink-0 mt-1" />
            <p className="text-sm font-medium leading-relaxed text-foreground/90">
              この利用規約（以下「本規約」）は、iS Baseball Lab（以下「当運営」）が提供する野球スコアブック＆チームマネジメントWebサービス「iScoreCloud」およびLINEミニアプリ「iScoreMini」（以下総称して「本サービス」）の利用条件を定めるものです。ユーザーの皆さまには、本規約に同意の上、本サービスをご利用いただきます。
            </p>
          </div>
        </section>

        {/* 第1条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">01.</span>
            第1条（定義および適用）
          </h2>
          <div className={styles.ol}>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">1.</span>
              <span>「ユーザー」とは、本サービスに登録またはアクセスし、利用するすべての個人（監督、コーチ、選手、保護者等）および組織を指します。</span>
            </div>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">2.</span>
              <span>本規約は、ユーザーと当運営との間の本サービスの利用に関わる一切の関係に適用されます。</span>
            </div>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">3.</span>
              <span>当運営が本サービス上で掲載する各種の利用ガイドライン、マニュアル、お知らせ等も本規約の一部を構成するものとします。</span>
            </div>
          </div>
        </section>

        {/* 第2条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">02.</span>
            第2条（利用登録およびアカウント管理）
          </h2>
          <div className={styles.ol}>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">1.</span>
              <span>ユーザーは、真実かつ正確な情報を提供して利用登録を行うものとします。</span>
            </div>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">2.</span>
              <span>ユーザーは、自己の責任においてアカウント情報（パスワード、LINE連携情報等）を厳重に管理するものとし、第三者への譲渡、貸与、共用はできません。</span>
            </div>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">3.</span>
              <span>アカウントの不正利用によって生じた損害について、当運営に故意または重過失がある場合を除き、当運営は一切の責任を負いません。</span>
            </div>
          </div>
        </section>

        {/* 第3条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">03.</span>
            第3条（出欠連絡・配車・スコアブック機能の利用）
          </h2>
          <div className={styles.ol}>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">1.</span>
              <span>出欠回答、配車希望、お当番割り当て等の登録情報は、所属チーム内での共有および円滑な活動運営のために利用されます。</span>
            </div>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">2.</span>
              <span>配車および移動に伴う事故、トラブル等については、各チームおよび当事者間で解決するものとし、当運営は責任を負いません。安全運転に十分ご配慮ください。</span>
            </div>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">3.</span>
              <span>試合記録、選手成績、YouTube動画リンク等は、チームの管理者の設定により公開範囲（チーム内限定・一般公開等）が管理されます。</span>
            </div>
          </div>
        </section>

        {/* 第4条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">04.</span>
            第4条（禁止事項）
          </h2>
          <p className={styles.p}>ユーザーは、本サービスの利用にあたり、以下の行為を行ってはなりません。</p>
          <div className={styles.ol}>
            {[
              "法令または公序良俗に違反する行為、または犯罪行為に関連する行為",
              "当運営、他のユーザーまたは第三者の知的財産権、プライバシー権、名誉等を侵害する行為",
              "本サービスのサーバー、ネットワークの機能を破壊、妨害、または過度の負荷をかける行為",
              "不正アクセス、クラッキング、リバースエンジニアリング、スクレイピング等の行為",
              "虚偽の選手情報、試合結果、なりすましによるアカウント登録・操作",
              "他のユーザーの個人情報を不正に収集、蓄積、第三者へ開示する行為",
              "その他、当運営が不適切と合理的に判断する行為"
            ].map((text, i) => (
              <div key={i} className={styles.li}>
                <Ban className="h-4 w-4 text-rose-500/70 shrink-0 mt-0.5" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 第5条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">05.</span>
            第5条（サービスの提供・変更・中断）
          </h2>
          <p className={styles.p}>
            当運営は、システムの保守点検、火災・停電等の不可抗力、その他必要と判断した場合には、ユーザーに事前通知することなく本サービスの提供を一時中断または停止できるものとします。
          </p>
        </section>

        {/* 第6条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">06.</span>
            第6条（免責事項）
          </h2>
          <div className={styles.ol}>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">1.</span>
              <span>当運営は、本サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、エラーやバグ等を含みます）がないことを明示的にも黙示的にも保証しておりません。</span>
            </div>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">2.</span>
              <span>当運営は、本サービスに起因してユーザーに生じたあらゆる損害について、当運営に故意または重過失がある場合を除き、一切の責任を負いません。</span>
            </div>
          </div>
        </section>

        {/* 第7条 */}
        <section className={styles.section}>
          <h2 className={styles.h2}>
            <span className="text-primary font-mono text-sm underline decoration-2">07.</span>
            第7条（規約の変更および準拠法）
          </h2>
          <div className={styles.ol}>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">1.</span>
              <span>当運営は、必要と判断した場合には、ユーザーに通知することなくいつでも本規約を変更できるものとします。変更後の利用規約は、本サービス上に掲載された時点から効力を生じます。</span>
            </div>
            <div className={styles.li}>
              <span className="font-mono text-primary font-bold">2.</span>
              <span>本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、当運営の所在地を管轄する裁判所を専属的合意管轄とします。</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
