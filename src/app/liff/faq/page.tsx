// filepath: src/app/liff/faq/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  HelpCircle,
  ChevronDown,
  Search,
  Plus,
  X,
  Building2,
  Users2,
  Loader2,
  AlertCircle,
  MessageCircleQuestion,
  Pencil,
  Trash2,
} from "lucide-react";

interface FaqItem {
  id: string;
  category: string;
  categoryLabel: string;
  question: string;
  answer: string;
  scope: "organization" | "team";
  scopeLabel: string;
}

export default function LiffFaqPage() {
  const { currentTeam, profile } = useLiff();
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedScope, setSelectedScope] = useState<"all" | "organization" | "team">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [openIds, setOpenIds] = useState<string[]>([]);

  // 新規登録モーダル用ステート
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newCategory, setNewCategory] = useState("rain");
  const [newScope, setNewScope] = useState<"organization" | "team">("team");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 編集モーダル用ステート
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editCategory, setEditCategory] = useState("rain");
  const [editScope, setEditScope] = useState<"organization" | "team">("team");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadFaqs = useCallback(async () => {
    try {
      setIsLoading(true);
      const teamId = currentTeam?.id || "demo-team";
      const res = await fetch(`/api/liff/faqs?teamId=${teamId}`);
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; faqs?: FaqItem[] };
        if (data.faqs) {
          setFaqs(data.faqs);
        }
      }
    } catch (err) {
      console.error("Failed to fetch faqs:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id]);

  useEffect(() => {
    loadFaqs();
  }, [loadFaqs]);

  // 編集モーダルを開く
  const openEditModal = (faq: FaqItem) => {
    setEditingFaq(faq);
    setEditQuestion(faq.question);
    setEditAnswer(faq.answer);
    setEditCategory(faq.category);
    setEditScope(faq.scope);
    setSubmitError(null);
  };

  // 新規登録処理
  const handleCreateFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const teamId = currentTeam?.id || "demo-team";

      const res = await fetch("/api/liff/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          question: newQuestion.trim(),
          answer: newAnswer.trim(),
          category: newCategory,
          scope: newScope,
          userId: profile?.userId,
        }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "Q&Aの登録に失敗しました");
      }

      setIsCreateModalOpen(false);
      setNewQuestion("");
      setNewAnswer("");
      loadFaqs();
    } catch (err: any) {
      console.error("Error creating FAQ:", err);
      setSubmitError(err.message || "Q&Aの登録に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 更新処理
  const handleUpdateFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFaq || !editQuestion.trim() || !editAnswer.trim()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const teamId = currentTeam?.id || "demo-team";

      const res = await fetch(`/api/liff/faqs/${editingFaq.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          question: editQuestion.trim(),
          answer: editAnswer.trim(),
          category: editCategory,
          scope: editScope,
        }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "Q&Aの更新に失敗しました");
      }

      setEditingFaq(null);
      loadFaqs();
    } catch (err: any) {
      console.error("Error updating FAQ:", err);
      setSubmitError(err.message || "Q&Aの更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 削除処理
  const handleDeleteFaq = async () => {
    if (!editingFaq) return;
    if (!confirm(`このQ&A（${editingFaq.question.slice(0, 20)}...）を削除してもよろしいですか？`)) return;

    try {
      setIsDeleting(true);
      setSubmitError(null);

      const res = await fetch(`/api/liff/faqs/${editingFaq.id}`, {
        method: "DELETE",
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "Q&Aの削除に失敗しました");
      }

      setEditingFaq(null);
      loadFaqs();
    } catch (err: any) {
      console.error("Error deleting FAQ:", err);
      setSubmitError(err.message || "Q&Aの削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  const categories = [
    { id: "all", label: "すべて" },
    { id: "rain", label: "雨天判断" },
    { id: "duty", label: "当番・配車" },
    { id: "equipment", label: "用具・持ち物" },
    { id: "trip", label: "遠征・合宿" },
    { id: "cost", label: "部費・保険" },
    { id: "manner", label: "観戦マナー" },
    { id: "general", label: "その他" },
  ];

  const toggleAccordion = (id: string) => {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filteredFaqs = faqs.filter((faq) => {
    const matchesCategory = selectedCategory === "all" || faq.category === selectedCategory;
    const matchesScope = selectedScope === "all" || faq.scope === selectedScope;
    const matchesSearch =
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesScope && matchesSearch;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader />

      <div className="p-4 space-y-5">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="よくある質問 (Q&A)"
          subtitle="保護者・選手の疑問を即座に解決"
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

        {/* ➕ Q&Aを追加ボタン (別行配置) */}
        <button
          type="button"
          onClick={() => {
            setIsCreateModalOpen(true);
            setSubmitError(null);
          }}
          className="w-full py-3 px-4 rounded-2xl bg-primary text-primary-foreground font-black text-xs shadow-sm hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>新しいQ&A（質問・回答）を追加する</span>
        </button>

        {/* 🏢 チーム全体 vs 👥 編成限定 スコープ切り替えタブ */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-4 px-4 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedScope("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all ${
              selectedScope === "all"
                ? "bg-foreground text-background shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            すべて ({faqs.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("organization")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 ${
              selectedScope === "organization"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>チーム全体</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("team")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 ${
              selectedScope === "team"
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users2 className="w-3.5 h-3.5" />
            <span>{currentTeam?.teamName || "編成"}</span>
          </button>
        </div>

        {/* 検索バー */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="知りたいことを検索 (例: 雨天、配車、合宿、スパイク)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-2xl text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* カテゴリフィルター */}
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

        {/* ローディング */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">Q&Aを読み込み中...</span>
          </div>
        ) : filteredFaqs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-card border border-border rounded-3xl p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
              <MessageCircleQuestion className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-foreground">該当するQ&Aがありません</h4>
              <p className="text-xs font-bold text-muted-foreground">
                上の「Q&Aを追加」ボタンから新しい質問と回答を登録できます。
              </p>
            </div>
          </div>
        ) : (
          /* Q&A アコーディオン一覧 */
          <div className="space-y-3">
            {filteredFaqs.map((faq) => {
              const isOpen = openIds.includes(faq.id);
              return (
                <div
                  key={faq.id}
                  className={`bg-card border rounded-3xl overflow-hidden shadow-xs transition-all ${
                    isOpen ? "border-primary/50 shadow-md" : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="w-full p-4 text-left flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleAccordion(faq.id)}
                      className="flex items-start gap-2.5 min-w-0 flex-1 focus:outline-hidden text-left"
                    >
                      <span className="w-6 h-6 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        Q
                      </span>
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* スコープバッジ */}
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1 ${
                              faq.scope === "organization"
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                            }`}
                          >
                            {faq.scope === "organization" ? (
                              <Building2 className="w-3 h-3" />
                            ) : (
                              <Users2 className="w-3 h-3" />
                            )}
                            <span>{faq.scopeLabel}</span>
                          </span>

                          <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-black">
                            {faq.categoryLabel}
                          </span>
                        </div>
                        <h3 className="text-xs sm:text-sm font-black text-foreground tracking-tight leading-snug">
                          {faq.question}
                        </h3>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(faq)}
                        className="p-1.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center gap-1 text-[11px] font-black"
                        title="Q&Aを編集・削除"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>編集</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleAccordion(faq.id)}
                        className={`w-6 h-6 rounded-full bg-muted flex items-center justify-center transition-transform duration-200 ${
                          isOpen ? "rotate-180 bg-primary/10 text-primary" : "text-muted-foreground"
                        }`}
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-border/40 bg-muted/20 animate-in fade-in duration-200">
                      <div className="flex items-start gap-2.5 mt-2">
                        <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                          A
                        </span>
                        <p className="text-xs text-foreground/90 font-bold leading-relaxed whitespace-pre-wrap flex-1">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ➕ Q&A 新規追加モーダル
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isCreateModalOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-card rounded-3xl border border-border shadow-2xl p-5 sm:p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
              
              <div className="flex items-center justify-between pb-3 border-b border-border/50 sticky top-0 bg-card z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-foreground">Q&Aの新規登録</h3>
                    <p className="text-[11px] font-bold text-muted-foreground">よくある質問と回答を共有</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleCreateFaq} className="space-y-4">
                {/* 登録スコープ選択 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">
                    登録範囲 (公開対象) <span className="text-destructive">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewScope("organization")}
                      className={`p-3 rounded-2xl text-left border transition-all flex flex-col gap-1 ${
                        newScope === "organization"
                          ? "bg-primary/10 border-primary text-primary shadow-xs"
                          : "bg-background border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-black text-xs">
                        <Building2 className="w-4 h-4 shrink-0" />
                        <span>チーム全体</span>
                      </div>
                      <p className="text-[10px] font-medium leading-tight opacity-80">
                        {currentTeam?.orgName || "クラブ"}の全編成・全学年で共通
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewScope("team")}
                      className={`p-3 rounded-2xl text-left border transition-all flex flex-col gap-1 ${
                        newScope === "team"
                          ? "bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-400 shadow-xs"
                          : "bg-background border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-black text-xs">
                        <Users2 className="w-4 h-4 shrink-0" />
                        <span>{currentTeam?.teamName || "この編成"}</span>
                      </div>
                      <p className="text-[10px] font-medium leading-tight opacity-80">
                        {currentTeam?.teamName || "選択中の編成"} メンバーに公開
                      </p>
                    </button>
                  </div>
                </div>

                {/* カテゴリ選択 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">カテゴリ</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="rain">雨天・中止判断</option>
                    <option value="duty">当番・配車</option>
                    <option value="equipment">用具・持ち物</option>
                    <option value="trip">遠征・合宿</option>
                    <option value="cost">部費・保険</option>
                    <option value="manner">観戦マナー</option>
                    <option value="general">その他・全般</option>
                  </select>
                </div>

                {/* 質問（Q） */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">
                    質問 (Q) <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="例: 雨天時の練習中止の連絡は何時頃入りますか？"
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                {/* 回答（A） */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">
                    回答 (A) <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    rows={4}
                    placeholder="保護者や選手に向けた分かりやすい回答を記入"
                    value={newAnswer}
                    onChange={(e) => setNewAnswer(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20 resize-none"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !newQuestion.trim() || !newAnswer.trim()}
                  className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>登録中...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Q&Aを登録する</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ✏️ Q&A 編集・削除モーダル
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {editingFaq &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-card rounded-3xl border border-border shadow-2xl p-5 sm:p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
              
              <div className="flex items-center justify-between pb-3 border-b border-border/50 sticky top-0 bg-card z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-foreground">Q&Aの編集</h3>
                    <p className="text-[11px] font-bold text-muted-foreground">公開範囲や質問・回答の更新・削除</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingFaq(null)}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleUpdateFaq} className="space-y-4">
                {/* 登録スコープ選択 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">
                    登録範囲 (公開対象) <span className="text-destructive">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditScope("organization")}
                      className={`p-3 rounded-2xl text-left border transition-all flex flex-col gap-1 ${
                        editScope === "organization"
                          ? "bg-primary/10 border-primary text-primary shadow-xs"
                          : "bg-background border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-black text-xs">
                        <Building2 className="w-4 h-4 shrink-0" />
                        <span>チーム全体</span>
                      </div>
                      <p className="text-[10px] font-medium leading-tight opacity-80">
                        {currentTeam?.orgName || "クラブ"}の全編成・全学年で共通
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditScope("team")}
                      className={`p-3 rounded-2xl text-left border transition-all flex flex-col gap-1 ${
                        editScope === "team"
                          ? "bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-400 shadow-xs"
                          : "bg-background border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-black text-xs">
                        <Users2 className="w-4 h-4 shrink-0" />
                        <span>{currentTeam?.teamName || "この編成"}</span>
                      </div>
                      <p className="text-[10px] font-medium leading-tight opacity-80">
                        {currentTeam?.teamName || "選択中の編成"} メンバーに公開
                      </p>
                    </button>
                  </div>
                </div>

                {/* カテゴリ選択 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">カテゴリ</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="rain">雨天・中止判断</option>
                    <option value="duty">当番・配車</option>
                    <option value="equipment">用具・持ち物</option>
                    <option value="trip">遠征・合宿</option>
                    <option value="cost">部費・保険</option>
                    <option value="manner">観戦マナー</option>
                    <option value="general">その他・全般</option>
                  </select>
                </div>

                {/* 質問（Q） */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">
                    質問 (Q) <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={editQuestion}
                    onChange={(e) => setEditQuestion(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                {/* 回答（A） */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">
                    回答 (A) <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={editAnswer}
                    onChange={(e) => setEditAnswer(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20 resize-none"
                    required
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleDeleteFaq}
                    disabled={isDeleting || isSubmitting}
                    className="py-3 px-4 rounded-2xl border border-destructive/30 text-destructive hover:bg-destructive/10 font-black text-xs transition-all flex items-center justify-center gap-1.5 shrink-0 active:scale-95 disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    <span>削除</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting || isDeleting || !editQuestion.trim() || !editAnswer.trim()}
                    className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>保存中...</span>
                      </>
                    ) : (
                      <span>変更を保存</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
