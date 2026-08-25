// filepath: src/app/liff/documents/page.tsx
"use client";

import React, { useState } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { FileText, Download, Eye, Calendar, Tag, Search, ShieldCheck } from "lucide-react";

interface TeamDocument {
  id: string;
  title: string;
  category: "rules" | "manual" | "equipment" | "insurance" | "form";
  categoryLabel: string;
  fileType: "PDF" | "DOCX" | "XLSX";
  fileSize: string;
  updatedAt: string;
  description: string;
  fileUrl: string;
}

export default function LiffDocumentsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const documents: TeamDocument[] = [
    {
      id: "doc-1",
      title: "2026年度 チーム規約・父母会会則",
      category: "rules",
      categoryLabel: "規約・会則",
      fileType: "PDF",
      fileSize: "1.2 MB",
      updatedAt: "2026/04/01",
      description: "チームの理念、部費・活動方針、父母会の役割と運営規定に関する基本規約です。",
      fileUrl: "#",
    },
    {
      id: "doc-2",
      title: "配車・送迎マニュアル & 安全ガイドライン",
      category: "manual",
      categoryLabel: "当番・配車",
      fileType: "PDF",
      fileSize: "840 KB",
      updatedAt: "2026/05/15",
      description: "遠征時の集合場所、ジュニアシートの着用基準、高速代・ガソリン代の精算ルールです。",
      fileUrl: "#",
    },
    {
      id: "doc-3",
      title: "学童・少年野球 連盟指定用具・服装規定",
      category: "equipment",
      categoryLabel: "用具・服装",
      fileType: "PDF",
      fileSize: "2.1 MB",
      updatedAt: "2026/03/20",
      description: "公式戦で使用可能なバット(JSBBマーク)、ヘルメット、スパイク(金具禁止)、アンダーシャツの規定です。",
      fileUrl: "#",
    },
    {
      id: "doc-4",
      title: "スポーツ安全保険 補償内容・事故時対応マニュアル",
      category: "insurance",
      categoryLabel: "保険・安全",
      fileType: "PDF",
      fileSize: "650 KB",
      updatedAt: "2026/04/01",
      description: "怪我や事故が発生した際の初期対応手順、病院受診時の連絡先、保険金請求の流れです。",
      fileUrl: "#",
    },
    {
      id: "doc-5",
      title: "救急セット・AED取扱手順書 & 熱中症対策マニュアル",
      category: "insurance",
      categoryLabel: "保険・安全",
      fileType: "PDF",
      fileSize: "1.5 MB",
      updatedAt: "2026/06/01",
      description: "夏場の水分補給ガイドライン、アイシング手順、AEDの設置場所と使用手順です。",
      fileUrl: "#",
    },
    {
      id: "doc-6",
      title: "入部申込書 & 個人情報同意書",
      category: "form",
      categoryLabel: "届出書類",
      fileType: "PDF",
      fileSize: "420 KB",
      updatedAt: "2026/04/01",
      description: "新規入部時の提出書類、緊急連絡先届、写真・動画のチーム内共有に関する同意書です。",
      fileUrl: "#",
    },
  ];

  const categories = [
    { id: "all", label: "すべて" },
    { id: "rules", label: "規約・会則" },
    { id: "manual", label: "配車・当番" },
    { id: "equipment", label: "用具・服装" },
    { id: "insurance", label: "保険・安全" },
    { id: "form", label: "届出書類" },
  ];

  const filteredDocs = documents.filter((doc) => {
    const matchesCategory = selectedCategory === "all" || doc.category === selectedCategory;
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          doc.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader />

      <div className="p-4 space-y-5">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="資料ダウンロード"
          subtitle="チーム規約・配車マニュアル・届出書類"
          icon={
            <span className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
              <FileText className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【チーム資料】各種規約・マニュアル一覧`,
            text: `チーム規約、配車ガイド、用具規定などのPDF資料はこちらから閲覧できます`,
          }}
        />
        {/* 検索バー */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="資料名やキーワードで検索..."
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

        {/* 資料カード一覧 */}
        <div className="space-y-3">
          {filteredDocs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-xs font-bold">
              該当する資料が見つかりませんでした
            </div>
          ) : (
            filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="bg-card border border-border rounded-3xl p-4 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 font-black text-xs">
                      <FileText className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-black">
                        {doc.categoryLabel}
                      </span>
                      <h3 className="text-sm font-black text-foreground mt-1 tracking-tight">
                        {doc.title}
                      </h3>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-black shrink-0 border border-rose-500/20">
                    {doc.fileType}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                  {doc.description}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px] font-bold text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>{doc.fileSize}</span>
                    <span>•</span>
                    <span>更新: {doc.updatedAt}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => alert(`「${doc.title}」のプレビューを開きます`)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-bold transition-all active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>閲覧</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => alert(`「${doc.title}」のダウンロードを開始します`)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black transition-all active:scale-95 shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>保存</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
