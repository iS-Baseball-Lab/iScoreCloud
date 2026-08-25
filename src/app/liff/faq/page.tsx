// filepath: src/app/liff/faq/page.tsx
"use client";

import React, { useState } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { HelpCircle, ChevronDown, Search, Sparkles, MessageCircle, AlertCircle } from "lucide-react";

interface FaqItem {
  id: string;
  category: "duty" | "rain" | "equipment" | "cost" | "manner";
  categoryLabel: string;
  question: string;
  answer: string;
}

export default function LiffFaqPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [openIds, setOpenIds] = useState<string[]>(["faq-1"]);

  const faqs: FaqItem[] = [
    {
      id: "faq-1",
      category: "rain",
      categoryLabel: "雨天・中止判断",
      question: "雨天時の練習・試合の中止判断はいつ、どこで連絡されますか？",
      answer: "原則として【当日の朝 6:30 まで】にLINEグループおよびチームHUBにて連絡します。グラウンド状態により現地判断となる場合もありますので、連絡があるまでは待機をお願いします。",
    },
    {
      id: "faq-2",
      category: "duty",
      categoryLabel: "当番・配車",
      question: "お当番の日に急用や体調不良で行けなくなった場合はどうすればいいですか？",
      answer: "まずは同じ班のメンバーにLINEで連絡し、交代可能かご相談ください。調整がつかない場合は、父母会長または学年幹事へ速やかにご連絡をお願いします。",
    },
    {
      id: "faq-3",
      category: "duty",
      categoryLabel: "当番・配車",
      question: "配車時の高速代やガソリン代の精算はどうなりますか？",
      answer: "遠征終了後、配車表に記載された目安金額を元に、同乗した各家庭から運転手の方へ直接現金またはPayPay等でお支払いいただきます（1家族あたり500〜800円程度が目安です）。",
    },
    {
      id: "faq-4",
      category: "equipment",
      categoryLabel: "用具・持ち物",
      question: "バットやスパイクを新しく購入する際の注意点はありますか？",
      answer: "公式戦では全日本軟式野球連盟（JSBB）公認マークのバットが必要です。また、小学生（学童部）は金属刃のスパイクは禁止されており、ポイントスパイクまたはゴム底のみ使用可能です。購入前に監督・コーチにご相談いただくことをおすすめします。",
    },
    {
      id: "faq-5",
      category: "equipment",
      categoryLabel: "用具・持ち物",
      question: "夏場の活動時の持ち物や熱中症対策について教えてください。",
      answer: "水筒（2L以上推奨・スポーツドリンク推奨）、氷嚢（アイシング用）、塩分タブレット、着替え用アンダーシャツを必ずご持参ください。ベンチにはチーム用の大型クーラーボックスと氷を用意しています。",
    },
    {
      id: "faq-6",
      category: "cost",
      categoryLabel: "部費・保険",
      question: "部費の支払い方法と期限について教えてください。",
      answer: "部費は毎月25日までに指定口座へのお振込み、または父母会会計への手渡しとなります。半期・年間のまとめ払いも可能です。",
    },
    {
      id: "faq-7",
      category: "manner",
      categoryLabel: "試合観戦マナー",
      question: "試合の応援やベンチ裏での観戦ルールはありますか？",
      answer: "選手への過度な指示出し（審判へのアピールや暴言）は禁止されています。全力プレーを称える温かい声援と拍手をお願いします。また、球場ごとの指定応援席エリアのルールを遵守してください。",
    },
  ];

  const categories = [
    { id: "all", label: "すべて" },
    { id: "rain", label: "雨天判断" },
    { id: "duty", label: "当番・配車" },
    { id: "equipment", label: "用具・持ち物" },
    { id: "cost", label: "部費・保険" },
    { id: "manner", label: "観戦マナー" },
  ];

  const toggleAccordion = (id: string) => {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filteredFaqs = faqs.filter((faq) => {
    const matchesCategory = selectedCategory === "all" || faq.category === selectedCategory;
    const matchesSearch = faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader />

      <div className="p-4 space-y-5">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="よくある質問 (Q&A)"
          subtitle="保護者・選手の疑問を解決"
          icon={
            <span className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black">
              <HelpCircle className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【よくある質問】チームQ&A一覧`,
            text: `雨天時の連絡、当番・配車、用具規定などのFAQはこちらから確認できます`,
          }}
        />
        {/* 検索バー */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="知りたいことを検索 (例: 雨天、配車、スパイク)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-2xl text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* カテゴリフィルター（横スクロール） */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all ${
                selectedCategory === cat.id
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Q&A アコーディオン一覧 */}
        <div className="space-y-3">
          {filteredFaqs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-xs font-bold">
              該当する質問が見つかりませんでした
            </div>
          ) : (
            filteredFaqs.map((faq) => {
              const isOpen = openIds.includes(faq.id);
              return (
                <div
                  key={faq.id}
                  className="bg-card border border-border rounded-3xl overflow-hidden shadow-xs transition-all"
                >
                  <button
                    type="button"
                    onClick={() => toggleAccordion(faq.id)}
                    className="w-full p-4 text-left flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 font-black text-xs">
                        Q
                      </span>
                      <div>
                        <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-black">
                          {faq.categoryLabel}
                        </span>
                        <h3 className="text-xs font-black text-foreground mt-1 tracking-tight leading-snug">
                          {faq.question}
                        </h3>
                      </div>
                    </div>

                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-primary" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-border/40 text-xs text-muted-foreground font-medium leading-relaxed bg-muted/20">
                      <div className="flex items-start gap-2 pt-2">
                        <span className="w-5 h-5 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 font-black text-[11px]">
                          A
                        </span>
                        <p className="whitespace-pre-line text-foreground/90 font-medium">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 解決しない場合のお問い合わせ案内 */}
        <section className="p-4 rounded-2xl bg-muted/40 border border-border/60 text-xs space-y-2 text-center">
          <div className="flex items-center justify-center gap-1.5 font-black text-foreground text-xs">
            <MessageCircle className="w-4 h-4 text-primary" />
            <span>解決しない場合は？</span>
          </div>
          <p className="text-[11px] text-muted-foreground font-medium">
            不明な点や個別のご相談は、LINEグループまたは各学年の父母会役員・監督へお気軽にお尋ねください。
          </p>
        </section>
      </div>
    </div>
  );
}
