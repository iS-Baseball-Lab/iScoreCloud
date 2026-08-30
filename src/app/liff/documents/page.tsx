// filepath: src/app/liff/documents/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  FileText,
  Search,
  Plus,
  X,
  Building2,
  Users2,
  ExternalLink,
  Loader2,
  AlertCircle,
  UploadCloud,
  Link2,
  Paperclip,
  Pencil,
  Trash2,
  Eye,
  ImageIcon,
  Download,
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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [uploadMode, setUploadMode] = useState<"file" | "url">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("rules");
  const [newScope, setNewScope] = useState<"organization" | "team">("team");
  const [newFileUrl, setNewFileUrl] = useState("");
  const [newFileType, setNewFileType] = useState("PDF");
  const [newDescription, setNewDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // プレビューモーダル用ステート
  const [previewDoc, setPreviewDoc] = useState<TeamDocument | null>(null);

  // 編集モーダル用ステート
  const [editingDoc, setEditingDoc] = useState<TeamDocument | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("rules");
  const [editScope, setEditScope] = useState<"organization" | "team">("team");
  const [editFileUrl, setEditFileUrl] = useState("");
  const [editFileType, setEditFileType] = useState("PDF");
  const [editFileSize, setEditFileSize] = useState("WEB");
  const [editDescription, setEditDescription] = useState("");
  const [editUploadMode, setEditUploadMode] = useState<"current" | "file" | "url">("current");
  const [editSelectedFile, setEditSelectedFile] = useState<File | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

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

  // 新規作成ファイル選択
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);

    if (!newTitle.trim()) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setNewTitle(nameWithoutExt);
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (["xls", "xlsx", "csv"].includes(ext)) setNewFileType("XLSX");
    else if (["doc", "docx"].includes(ext)) setNewFileType("DOCX");
    else if (["png", "jpg", "jpeg", "webp"].includes(ext)) setNewFileType("IMG");
    else setNewFileType("PDF");
  };

  // 編集時ファイル選択
  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditSelectedFile(file);

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (["xls", "xlsx", "csv"].includes(ext)) setEditFileType("XLSX");
    else if (["doc", "docx"].includes(ext)) setEditFileType("DOCX");
    else if (["png", "jpg", "jpeg", "webp"].includes(ext)) setEditFileType("IMG");
    else setEditFileType("PDF");
  };

  // 編集モーダルを開く
  const openEditModal = (doc: TeamDocument) => {
    setEditingDoc(doc);
    setEditTitle(doc.title);
    setEditCategory(doc.category);
    setEditScope(doc.scope);
    setEditFileUrl(doc.fileUrl);
    setEditFileType(doc.fileType);
    setEditFileSize(doc.fileSize);
    setEditDescription(doc.description || "");
    setEditUploadMode("current");
    setEditSelectedFile(null);
    setSubmitError(null);
  };

  // ファイルをBase64文字列に変換するヘルパー関数
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // 新規登録処理
  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const teamId = currentTeam?.id || "demo-team";

      let finalFileUrl = newFileUrl.trim();
      let finalFileType = newFileType;
      let finalFileSize = "WEB";

      if (uploadMode === "file") {
        if (!selectedFile) {
          throw new Error("アップロードするファイルを選択してください");
        }

        const sizeBytes = selectedFile.size || 0;
        finalFileSize = sizeBytes >= 1024 * 1024 
          ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` 
          : `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;

        let uploadSuccess = false;

        // 🌟 1. R2アップロードを試行
        try {
          const formData = new FormData();
          formData.append("file", selectedFile);
          formData.append("teamId", teamId);

          const uploadRes = await fetch("/api/liff/documents/upload", {
            method: "POST",
            body: formData,
          });

          if (uploadRes.ok) {
            const uploadData = (await uploadRes.json()) as {
              success: boolean;
              fileUrl?: string;
              fileType?: string;
              fileSize?: string;
            };

            if (uploadData.success && uploadData.fileUrl) {
              finalFileUrl = uploadData.fileUrl;
              if (uploadData.fileType) finalFileType = uploadData.fileType;
              if (uploadData.fileSize) finalFileSize = uploadData.fileSize;
              uploadSuccess = true;
            }
          }
        } catch (uploadErr) {
          console.warn("R2 upload endpoint failed, falling back to data URL:", uploadErr);
        }

        // 🌟 2. アップロードAPIが未応答/失敗した場合は Base64 Data URL でフォールバック保存
        if (!uploadSuccess) {
          try {
            finalFileUrl = await fileToBase64(selectedFile);
          } catch (base64Err) {
            throw new Error("ファイルの読み込みに失敗しました。もう一度お試しください。");
          }
        }
      } else {
        if (!finalFileUrl) {
          throw new Error("資料URLを入力してください");
        }
      }

      const res = await fetch("/api/liff/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          title: newTitle.trim(),
          category: newCategory,
          scope: newScope,
          fileUrl: finalFileUrl,
          fileType: finalFileType,
          fileSize: finalFileSize,
          description: newDescription.trim(),
          userId: profile?.userId,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "資料の登録に失敗しました");
      }

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "登録に失敗しました");
      }

      setIsCreateModalOpen(false);
      setSelectedFile(null);
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

  // 更新処理
  const handleUpdateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc || !editTitle.trim()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const teamId = currentTeam?.id || "demo-team";

      let finalFileUrl = editFileUrl.trim();
      let finalFileType = editFileType;
      let finalFileSize = editFileSize;

      if (editUploadMode === "file" && editSelectedFile) {
        const sizeBytes = editSelectedFile.size || 0;
        finalFileSize = sizeBytes >= 1024 * 1024 
          ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` 
          : `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;

        let uploadSuccess = false;

        try {
          const formData = new FormData();
          formData.append("file", editSelectedFile);
          formData.append("teamId", teamId);

          const uploadRes = await fetch("/api/liff/documents/upload", {
            method: "POST",
            body: formData,
          });

          if (uploadRes.ok) {
            const uploadData = (await uploadRes.json()) as {
              success: boolean;
              fileUrl?: string;
              fileType?: string;
              fileSize?: string;
            };

            if (uploadData.success && uploadData.fileUrl) {
              finalFileUrl = uploadData.fileUrl;
              if (uploadData.fileType) finalFileType = uploadData.fileType;
              if (uploadData.fileSize) finalFileSize = uploadData.fileSize;
              uploadSuccess = true;
            }
          }
        } catch (uploadErr) {
          console.warn("R2 edit upload failed, fallback to base64:", uploadErr);
        }

        if (!uploadSuccess) {
          try {
            finalFileUrl = await fileToBase64(editSelectedFile);
          } catch (base64Err) {
            throw new Error("ファイルの読み込みに失敗しました");
          }
        }
      }

      const res = await fetch(`/api/liff/documents/${editingDoc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          title: editTitle.trim(),
          category: editCategory,
          scope: editScope,
          fileUrl: finalFileUrl,
          fileType: finalFileType,
          fileSize: finalFileSize,
          description: editDescription.trim(),
        }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "資料の更新に失敗しました");
      }

      setEditingDoc(null);
      loadDocuments();
    } catch (err: any) {
      console.error("Error updating document:", err);
      setSubmitError(err.message || "資料の更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 削除処理
  const handleDeleteDocument = async () => {
    if (!editingDoc) return;
    if (!confirm(`「${editingDoc.title}」を削除してもよろしいですか？`)) return;

    try {
      setIsDeleting(true);
      setSubmitError(null);

      const res = await fetch(`/api/liff/documents/${editingDoc.id}`, {
        method: "DELETE",
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        throw new Error(data.error || "資料の削除に失敗しました");
      }

      setEditingDoc(null);
      loadDocuments();
    } catch (err: any) {
      console.error("Error deleting document:", err);
      setSubmitError(err.message || "資料の削除に失敗しました");
    } finally {
      setIsDeleting(false);
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

        {/* 🏢 チーム全体 vs 👥 編成限定 スコープ切り替えタブ */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-4 px-4 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedScope("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer ${
              selectedScope === "all"
                ? "bg-foreground text-background shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            すべて ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("organization")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
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
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedScope === "team"
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users2 className="w-3.5 h-3.5" />
            <span>{currentTeam?.teamName || "編成"}</span>
          </button>
        </div>

        {/* 🔍 検索バー ＆ ➕ 追加ボタン (1行レイアウト) */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="資料名やキーワードで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9.5 pr-8 py-2.5 bg-card border border-border rounded-2xl text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/40 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setIsCreateModalOpen(true);
              setSelectedFile(null);
              setSubmitError(null);
            }}
            className="h-10 px-3.5 rounded-2xl bg-primary text-primary-foreground font-black text-xs shadow-xs hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
            title="新しいチーム資料を追加"
          >
            <Plus className="w-4 h-4" />
            <span>追加</span>
          </button>
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
                上の「資料を追加」ボタンからPDFや遠征のしおりを直接アップロードできます。
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
                    <button
                      type="button"
                      onClick={() => openEditModal(doc)}
                      className="p-1.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center gap-1 text-xs font-black"
                      title="資料を編集・削除"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>編集</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewDoc(doc)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black transition-all active:scale-95 shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>資料を見る</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ➕ 資料 新規追加モーダル
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isCreateModalOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-card rounded-3xl border border-border shadow-2xl p-5 sm:p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
              
              <div className="flex items-center justify-between pb-3 border-b border-border/50 sticky top-0 bg-card z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-foreground">資料の新規登録</h3>
                    <p className="text-[11px] font-bold text-muted-foreground">PDF・しおりをクラウドに保存</p>
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

              <form onSubmit={handleCreateDocument} className="space-y-4">
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

                {/* アップロード方式 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">アップロード方法</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-muted/60 rounded-xl border border-border">
                    <button
                      type="button"
                      onClick={() => setUploadMode("file")}
                      className={`py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                        uploadMode === "file"
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <UploadCloud className="w-3.5 h-3.5 text-primary" />
                      <span>ファイル選択 (R2)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setUploadMode("url")}
                      className={`py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                        uploadMode === "url"
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>外部URL指定</span>
                    </button>
                  </div>
                </div>

                {uploadMode === "file" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-foreground">
                      ファイルを選択 <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="file"
                      id="create-doc-file-input"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="application/pdf,image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp"
                      className="sr-only"
                    />

                    {selectedFile ? (
                      <div className="p-3 rounded-2xl bg-primary/5 border-2 border-dashed border-primary/40 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="w-4 h-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-black text-foreground truncate">
                              {selectedFile.name}
                            </p>
                            <span className="text-[10px] text-muted-foreground font-bold">
                              {(selectedFile.size / 1024).toFixed(0)} KB
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label
                        htmlFor="create-doc-file-input"
                        className="w-full py-6 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-background/50 hover:bg-muted/40 transition-all flex flex-col items-center justify-center gap-1.5 text-muted-foreground cursor-pointer group active:scale-[0.99]"
                      >
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                          <UploadCloud className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-foreground">
                          ここをタップしてPDF・写真を選択
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          PDF, Word, Excel, 画像ファイルに対応
                        </span>
                      </label>
                    )}
                  </div>
                ) : (
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
                  </div>
                )}

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
                  disabled={isSubmitting || (uploadMode === "file" && !selectedFile)}
                  className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>クラウドへ保存中...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>資料を保存する</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ✏️ 資料 編集・削除モーダル
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {editingDoc &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-card rounded-3xl border border-border shadow-2xl p-5 sm:p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
              
              <div className="flex items-center justify-between pb-3 border-b border-border/50 sticky top-0 bg-card z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-foreground">資料の編集</h3>
                    <p className="text-[11px] font-bold text-muted-foreground">公開範囲や内容の更新・削除</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
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

              <form onSubmit={handleUpdateDocument} className="space-y-4">
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

                {/* 資料タイトル */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">
                    資料名 / タイトル <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                {/* カテゴリ */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">カテゴリ</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
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

                {/* ファイルの変更オプション */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">ファイルの差し替え</label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/60 rounded-xl border border-border">
                    <button
                      type="button"
                      onClick={() => setEditUploadMode("current")}
                      className={`py-1.5 rounded-lg text-[11px] font-black transition-all ${
                        editUploadMode === "current"
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      変更しない
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditUploadMode("file")}
                      className={`py-1.5 rounded-lg text-[11px] font-black transition-all ${
                        editUploadMode === "file"
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      ファイル選択
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditUploadMode("url")}
                      className={`py-1.5 rounded-lg text-[11px] font-black transition-all ${
                        editUploadMode === "url"
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      URL変更
                    </button>
                  </div>

                  {editUploadMode === "file" && (
                    <div className="pt-1.5">
                      <input
                        type="file"
                        id="edit-doc-file-input"
                        ref={editFileInputRef}
                        onChange={handleEditFileChange}
                        accept="application/pdf,image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp"
                        className="sr-only"
                      />
                      {editSelectedFile ? (
                        <div className="p-3 rounded-2xl bg-primary/5 border-2 border-dashed border-primary/40 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Paperclip className="w-4 h-4 text-primary shrink-0" />
                            <p className="text-xs font-black text-foreground truncate">
                              {editSelectedFile.name}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditSelectedFile(null);
                              if (editFileInputRef.current) editFileInputRef.current.value = "";
                            }}
                            className="p-1 text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor="edit-doc-file-input"
                          className="w-full py-4 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-background flex flex-col items-center justify-center gap-1 text-muted-foreground cursor-pointer group active:scale-[0.99]"
                        >
                          <UploadCloud className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-bold text-foreground">
                            新しいファイルを選択
                          </span>
                        </label>
                      )}
                    </div>
                  )}

                  {editUploadMode === "url" && (
                    <div className="pt-1.5 relative">
                      <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="url"
                        placeholder="Google Drive, Dropbox等のURL"
                        value={editFileUrl}
                        onChange={(e) => setEditFileUrl(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                        required
                      />
                    </div>
                  )}
                </div>

                {/* 説明・持ち物メモ */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground">説明・持ち物メモ (任意)</label>
                  <textarea
                    rows={2}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleDeleteDocument}
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
                    disabled={isSubmitting || isDeleting}
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

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          👁️ 資料 プレビュー・閲覧モーダル (画像/PDF/URL)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {previewDoc &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-background/90 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            <div 
              className="absolute inset-0"
              onClick={() => setPreviewDoc(null)}
            />

            <div className="w-full max-w-lg bg-card rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] relative z-10 animate-in zoom-in-95 duration-200">
              
              {/* モーダルヘッダー */}
              <div className="flex items-center justify-between p-4 border-b border-border/50 bg-card">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {previewDoc.fileType === "IMG" || previewDoc.fileUrl.startsWith("data:image/") ? (
                      <ImageIcon className="w-4 h-4" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-foreground truncate">
                      {previewDoc.title}
                    </h3>
                    <p className="text-[10px] font-bold text-muted-foreground truncate">
                      {previewDoc.categoryLabel} • {previewDoc.fileSize}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* ダウンロード / 共有リンク */}
                  {previewDoc.fileUrl.startsWith("http") && (
                    <a
                      href={previewDoc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                      title="外部ブラウザで開く"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* プレビューコンテンツ本体 */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center bg-muted/30 min-h-[260px] max-h-[70vh]">
                {previewDoc.fileType === "IMG" || previewDoc.fileUrl.startsWith("data:image/") || previewDoc.fileUrl.match(/\.(png|jpg|jpeg|webp|gif)$/i) ? (
                  <div className="flex flex-col items-center justify-center w-full space-y-3">
                    <div className="relative max-w-full rounded-2xl overflow-hidden shadow-md border border-border/80 bg-black/5 flex items-center justify-center">
                      <img
                        src={previewDoc.fileUrl}
                        alt={previewDoc.title}
                        className="max-h-[60vh] max-w-full object-contain rounded-2xl select-none"
                      />
                    </div>
                    <p className="text-[11px] font-bold text-muted-foreground text-center">
                      💡 画像を長押しするとスマートフォンに保存できます
                    </p>
                  </div>
                ) : previewDoc.fileType === "PDF" || previewDoc.fileUrl.startsWith("data:application/pdf") || previewDoc.fileUrl.endsWith(".pdf") ? (
                  <div className="w-full h-[60vh] flex flex-col items-center justify-center space-y-3">
                    <iframe
                      src={previewDoc.fileUrl}
                      title={previewDoc.title}
                      className="w-full h-full rounded-2xl border border-border shadow-xs bg-card"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                    <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
                      <FileText className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-foreground">{previewDoc.title}</h4>
                      <p className="text-xs font-bold text-muted-foreground">
                        {previewDoc.description || "外部共有リンク資料"}
                      </p>
                    </div>
                    {previewDoc.fileUrl.startsWith("http") ? (
                      <a
                        href={previewDoc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-5 py-2.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black transition-all flex items-center gap-2 shadow-sm active:scale-95"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>外部サイトで閲覧する</span>
                      </a>
                    ) : (
                      <a
                        href={previewDoc.fileUrl}
                        download={previewDoc.title}
                        className="px-5 py-2.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black transition-all flex items-center gap-2 shadow-sm active:scale-95"
                      >
                        <Download className="w-4 h-4" />
                        <span>ファイルを保存する</span>
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* モーダルフッター */}
              {previewDoc.description && (
                <div className="p-3.5 border-t border-border/50 bg-card text-xs text-muted-foreground font-medium">
                  <p className="line-clamp-2">{previewDoc.description}</p>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
