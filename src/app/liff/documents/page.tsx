// filepath: src/app/liff/documents/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  FileText,
  Download,
  Eye,
  Calendar,
  Tag,
  Search,
  Plus,
  X,
  Building2,
  Users2,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  FileCode,
  Link2,
} from "lucide-react";

interface TeamDocument {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  fileType: string;
  fileSize: string;
  updatedAt: string;
  description: string;
  fileUrl: string;
  scope: "organization" | "team";
  scopeLabel: string;
}

export default function LiffDocumentsPage() {
  const { currentTeam, profile } = useLiff();
  const [documents, setDocuments] = useState<TeamDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedScope, setSelectedScope] = useState<"all" | "organization" | "team">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // 新規登録モーダル用ステート
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("rules");
  const [newScope, setNewScope] = useState<"organization" | "team">("team");
  const [newFileUrl, setNewFileUrl] = useState("");
  const [newFileType, setNewFileType] = useState("PDF");
  const [newDescription, setNewDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const teamId = currentTeam?.id || "demo-team";
      const res = await fetch(`/api/liff/documents?teamId=${teamId}`);
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; documents?: TeamDocument[] };
        if (data.documents) {
          setDocuments(data.documents);
        }
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newFileUrl.trim()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const teamId = currentTeam?.id || "demo-team";
      const res = await fetch("/api/liff/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          title: newTitle.trim(),
          category: newCategory,
          scope: newScope,
          fileUrl: newFileUrl.trim(),
          fileType: newFileType,
          fileSize: "WEB",
          description: newDescription.trim(),
          userId: profile?.userId,
        }),
      });

      const data = await res.json() as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "登録に失敗しました");
      }

      // 登録成功
      setIsModalOpen(false);
      setNewTitle("");
      setNewFileUrl("");
      setNewDescription("");
      loadDocuments();
    } catch (err: any) {
      console.error("Error creating document:", err);
      setSubmitError(err.message || "資料の登録に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories = [
    { id: "all", label: "すべて" },
    { id: "rules", label: "規約・会則" },
    { id: "manual", label: "配車・当番" },
    { id: "equipment", label: "用具・服装" },
    { id: "trip", label: "遠征・合宿" },
    { id: "insurance", label: "保険・安全" },
    { id: "form", label: "届出書類" },
    { id: "other", label: "その他" },
  ];

  const filteredDocs = documents.filter((doc) => {
    const matchesCategory = selectedCategory === "all" || doc.category === selectedCategory;
    const matchesScope = selectedScope === "all" || doc.scope === selectedScope;
    const matchesSearch =
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesScope && matchesSearch;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader />

      <div className="p-4 space-y-5">
        {/* ページ内ヘッダー */}
        <div className="flex items-center justify-between gap-3">
          <LiffPageHeader
            title="資料ダウンロード"
            subtitle="チーム規約・配車マニュアル・合宿のしおり"
            icon={
              <span className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
                <FileText className="w-4 h-4" />
              </span>
            }
            showBack
            shareData={{
              title: `【チーム資料】各種規約・マニュアル一覧`,
              text: `チーム規約、配車ガイド、用具規定などの資料はこちらから閲覧できます`,
            }}
          />

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-primary text-primary-foreground text-xs font-black shadow-sm hover:bg-primary/90 active:scale-95 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>資料を追加</span>
          </button>
        </div>

        {/* 🏢 チーム全体 vs 👥 編成限定 スコープ切り替えタブ */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setSelectedScope("all")}
            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all ${
              selectedScope === "all"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            全資料 ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("organization")}
            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 ${
              selectedScope === "organization"
                ? "bg-card text-primary shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>チーム全体</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("team")}
            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 ${
              selectedScope === "team"
                ? "bg-card text-purple-600 dark:text-purple-400 shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users2 className="w-3.5 h-3.5" />
            <span>{currentTeam?.teamName || "この編成"}</span>
          </button>
        </div>

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

        {/* ローディング */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">資料を読み込み中...</span>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-card border border-border rounded-3xl p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
              <FileText className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-foreground">登録されている資料はありません</h4>
              <p className="text-xs font-bold text-muted-foreground">
                右上の「資料を追加」ボタンから規約や合宿のしおりを登録できます。
              </p>
            </div>
          </div>
        ) : (
          /* 資料カード一覧 */
          <div className="space-y-3">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="bg-card border border-border rounded-3xl p-4 shadow-xs space-y-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 font-black text-xs">
                      <FileText className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* スコープバッジ */}
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1 ${
                            doc.scope === "organization"
                              ? "bg-primary/10 text-primary border border-primary/20"
                              : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                          }`}
                        >
                          {doc.scope === "organization" ? (
                            <Building2 className="w-3 h-3" />
                          ) : (
                            <Users2 className="w-3 h-3" />
                          )}
                          <span>{doc.scopeLabel}</span>
                        </span>

                        <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-black">
                          {doc.categoryLabel}
                        </span>
                      </div>

                      <h3 className="text-sm font-black text-foreground mt-1.5 tracking-tight leading-snug">
                        {doc.title}
                      </h3>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-black shrink-0 border border-rose-500/20">
                    {doc.fileType}
                  </span>
                </div>

                {doc.description && (
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                    {doc.description}
                  </p>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px] font-bold text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>{doc.fileSize}</span>
                    <span>•</span>
                    <span>更新: {doc.updatedAt}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black transition-all active:scale-95 shadow-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>資料を開く</span>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          📄 資料追加モーダル (createPortalでdocument.body直下にマウント)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isModalOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-card rounded-3xl border border-border shadow-2xl p-5 sm:p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
              
              {/* モーダルヘッダー */}
              <div className="flex items-center justify-between pb-3 border-b border-border/50 sticky top-0 bg-card z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-foreground">資料の登録</h3>
                    <p className="text-[11px] font-bold text-muted-foreground">規約・マニュアル・しおりを追加</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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

              <form onSubmit={handleCreateDocument} className="space-y-4">
                {/* 🌟 登録スコープ選択（チーム全体 vs この編成） */}
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
                        <span>この編成のみ</span>
                      </div>
                      <p className="text-[10px] font-medium leading-tight opacity-80">
                        {currentTeam?.teamName || "選択中の編成"} 限定で公開
                      </p>
                    </button>
                  </div>
                </div>

                {/* 資料タイトル */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">
                    資料名 / タイトル <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="例: 2026年度 遠征合宿のしおり"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                {/* カテゴリ */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">カテゴリ</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="rules">規約・会則</option>
                    <option value="manual">配車・当番</option>
                    <option value="equipment">用具・服装</option>
                    <option value="trip">遠征・合宿</option>
                    <option value="insurance">保険・安全</option>
                    <option value="form">届出書類</option>
                    <option value="other">その他</option>
                  </select>
                </div>

                {/* ファイルURL / Google Driveリンク */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">
                    資料URL / 共有リンク <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="url"
                      placeholder="Google Drive, Dropbox, PDF等の共有URL"
                      value={newFileUrl}
                      onChange={(e) => setNewFileUrl(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground font-bold">
                    ※Googleドライブの「リンクを知っている全員が閲覧可」URLなどを貼り付けてください。
                  </p>
                </div>

                {/* ファイル形式 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">ファイル形式</label>
                  <div className="grid grid-cols-4 gap-2">
                    {["PDF", "DOCX", "XLSX", "LINK"].map((ft) => (
                      <button
                        key={ft}
                        type="button"
                        onClick={() => setNewFileType(ft)}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                          newFileType === ft
                            ? "bg-primary text-primary-foreground border-primary shadow-xs"
                            : "bg-background border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {ft}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 説明・メモ */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">説明・持ち物メモ (任意)</label>
                  <textarea
                    rows={2}
                    placeholder="資料の概要や保護者への連絡事項を記入"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
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
                      <span>資料を登録する</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
