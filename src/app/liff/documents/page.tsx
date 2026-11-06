// filepath: src/app/liff/documents/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  LiffSelect,
  type LiffSelectOption,
} from "@/components/liff/LiffSelect";
import { useLiff } from "@/components/liff/LiffProvider";
import { peekLiffApiCache } from "@/lib/liff/api-cache";
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
  FileSpreadsheet,
} from "lucide-react";
const PdfCanvasViewer = dynamic(
  () => import("@/components/common/PdfCanvasViewer").then((m) => m.PdfCanvasViewer),
  { ssr: false }
);

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

const DOCUMENT_CATEGORY_OPTIONS: ReadonlyArray<LiffSelectOption> = [
  { value: "rules", label: "規約・会則" },
  { value: "match", label: "大会・試合" },
  { value: "manual", label: "配車・当番" },
  { value: "equipment", label: "用具・服装" },
  { value: "trip", label: "遠征・合宿" },
  { value: "insurance", label: "保険・安全" },
  { value: "form", label: "届出書類" },
  { value: "other", label: "その他" },
];

// 📄 PDFをスマートフォンやLINE WebViewで確実に表示するためのURL変換ヘルパー
function getAbsoluteUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
  }
  return `https://iscorecloud.com${url.startsWith("/") ? "" : "/"}${url}`;
}

function getPdfViewerUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  const abs = getAbsoluteUrl(url);
  if (abs.includes("localhost") || abs.includes("127.0.0.1")) {
    return url;
  }
  return `https://docs.google.com/viewer?url=${encodeURIComponent(abs)}&embedded=true`;
}

function getExternalBrowserUrl(url: string | null | undefined): string {
  const abs = getAbsoluteUrl(url);
  if (!abs) return "";
  const sep = abs.includes("?") ? "&" : "?";
  return `${abs}${sep}openExternalBrowser=1`;
}

export default function LiffDocumentsPage() {
  const { currentTeam, profile } = useLiff();
  const initialCachedDocs = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    const tid =
      currentTeam?.id || localStorage.getItem("iscore_selectedTeamId") || "demo-team";
    return peekLiffApiCache<{ success: boolean; documents?: TeamDocument[] }>(
      `/api/liff/documents?teamId=${tid}`
    );
  }, [currentTeam?.id]);

  const [documents, setDocuments] = useState<TeamDocument[]>(
    () => initialCachedDocs?.documents ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(() => !initialCachedDocs);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedScope, setSelectedScope] = useState<"all" | "organization" | "team">("all");
  const [selectedFileType, setSelectedFileType] = useState<string>("all");
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
      const teamId = currentTeam?.id || "demo-team";
      const cached = peekLiffApiCache<{ success: boolean; documents?: TeamDocument[] }>(
        `/api/liff/documents?teamId=${teamId}`
      );
      if (cached?.documents) {
        setDocuments(cached.documents);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
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
    const isExcel =
      ["xls", "xlsx", "csv", "xlsm"].includes(ext) ||
      file.type.includes("sheet") ||
      file.type.includes("excel") ||
      file.type.includes("csv");
    const isWord =
      ["doc", "docx"].includes(ext) || file.type.includes("word");
    const isImg =
      ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) ||
      file.type.startsWith("image/");
    const isPpt =
      ["ppt", "pptx"].includes(ext) || file.type.includes("presentation");

    if (isExcel) setNewFileType("XLSX");
    else if (isWord) setNewFileType("DOCX");
    else if (isImg) setNewFileType("IMG");
    else if (isPpt) setNewFileType("PPTX");
    else setNewFileType("PDF");
  };

  // 編集時ファイル選択
  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditSelectedFile(file);

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isExcel =
      ["xls", "xlsx", "csv", "xlsm"].includes(ext) ||
      file.type.includes("sheet") ||
      file.type.includes("excel") ||
      file.type.includes("csv");
    const isWord =
      ["doc", "docx"].includes(ext) || file.type.includes("word");
    const isImg =
      ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) ||
      file.type.startsWith("image/");
    const isPpt =
      ["ppt", "pptx"].includes(ext) || file.type.includes("presentation");

    if (isExcel) setEditFileType("XLSX");
    else if (isWord) setEditFileType("DOCX");
    else if (isImg) setEditFileType("IMG");
    else if (isPpt) setEditFileType("PPTX");
    else setEditFileType("PDF");
  };

  // 編集モーダルを開く
  const openEditModal = (doc: TeamDocument) => {
    setEditingDoc(doc);
    setEditTitle(doc.title);
    setEditCategory(doc.category);
    setEditScope(doc.scope);
    setEditFileUrl(doc.fileUrl);
    const isExcelDoc = doc.fileType === "XLSX" || Boolean(doc.fileUrl.match(/\.(xlsx?|csv|xlsm)($|\?)/i));
    const isDocxDoc = doc.fileType === "DOCX" || Boolean(doc.fileUrl.match(/\.docx?($|\?)/i));
    const isImgDoc = doc.fileType === "IMG" || Boolean(doc.fileUrl.match(/\.(png|jpe?g|webp|gif)($|\?)/i));
    setEditFileType(isExcelDoc ? "XLSX" : isDocxDoc ? "DOCX" : isImgDoc ? "IMG" : (doc.fileType || "PDF"));
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
    { id: "match", label: "大会・試合" },
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
    const isExcelDoc = doc.fileType === "XLSX" || Boolean(doc.fileUrl.match(/\.(xlsx?|csv|xlsm)($|\?)/i));
    const isPdfDoc = doc.fileType === "PDF" || Boolean(doc.fileUrl.match(/\.pdf($|\?)/i));
    const isWordDoc = doc.fileType === "DOCX" || Boolean(doc.fileUrl.match(/\.docx?($|\?)/i));
    const isImgDoc = doc.fileType === "IMG" || Boolean(doc.fileUrl.match(/\.(png|jpe?g|webp|gif)($|\?)/i));

    const matchesFileType =
      selectedFileType === "all" ||
      (selectedFileType === "XLSX" && isExcelDoc) ||
      (selectedFileType === "PDF" && isPdfDoc) ||
      (selectedFileType === "DOCX" && isWordDoc) ||
      (selectedFileType === "IMG" && isImgDoc);

    const matchesSearch =
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesScope && matchesFileType && matchesSearch;
  });

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="資料ダウンロード"
          subtitle="チーム規約・配車マニュアル・合宿のしおり"
          icon={
            <span className="w-8 h-8 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
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
            className={`px-3.5 py-1.5 rounded-xl text-xs shrink-0 transition-all cursor-pointer ${
              selectedScope === "all"
                ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
            }`}
          >
            すべて ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("organization")}
            className={`px-3.5 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedScope === "organization"
                ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>チーム全体</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("team")}
            className={`px-3.5 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedScope === "team"
                ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
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

        {/* 形式フィルター (すべて / Excel / PDF / Word / 画像) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-4 px-4 scrollbar-none">
          {[
            { id: "all", label: "すべての形式", icon: FileText },
            { id: "XLSX", label: "Excel (表計算)", icon: FileSpreadsheet },
            { id: "PDF", label: "PDF", icon: FileText },
            { id: "DOCX", label: "Word (文書)", icon: FileText },
            { id: "IMG", label: "画像", icon: ImageIcon },
          ].map((type) => {
            const Icon = type.icon;
            const isSelected = selectedFileType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setSelectedFileType(type.id)}
                className={`px-3 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                    : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{type.label}</span>
              </button>
            );
          })}
        </div>

        {/* カテゴリフィルター */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs shrink-0 transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                  : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* 📋 チーム資料 セクションカード (A-3 Dark Solid Header Cap) */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-black text-white truncate">
                  {selectedCategory === "all"
                    ? "チーム資料一覧"
                    : `${categories.find((cat) => cat.id === selectedCategory)?.label || ""} の資料`}
                </h2>
                <p className="text-[10px] font-bold text-slate-300 truncate">
                  Excel・PDF・Word・写真資料の閲覧・ダウンロード
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-[11px] font-black shrink-0">
              {filteredDocs.length}件
            </span>
          </div>

          <div className="p-4">
            {/* ローディング */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs font-bold">資料を読み込み中...</span>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-border bg-muted/20 p-6 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-foreground">登録されている資料はありません</h4>
                  <p className="text-xs font-bold text-muted-foreground">
                    上の「追加」ボタンからExcel・PDF・写真を直接アップロードできます。
                  </p>
                </div>
              </div>
            ) : (
              /* 資料カード一覧 */
              <div className="space-y-3">
                {filteredDocs.map((doc) => {
                  const isExcel = doc.fileType === "XLSX" || Boolean(doc.fileUrl.match(/\.(xlsx?|csv|xlsm)($|\?)/i));
                  const isWord = doc.fileType === "DOCX" || Boolean(doc.fileUrl.match(/\.docx?($|\?)/i));
                  const isPdf = doc.fileType === "PDF" || Boolean(doc.fileUrl.match(/\.pdf($|\?)/i));
                  const isImg = doc.fileType === "IMG" || Boolean(doc.fileUrl.match(/\.(png|jpe?g|webp|gif)($|\?)/i));

                  return (
                    <div
                      key={doc.id}
                      className="rounded-2xl border border-border bg-card shadow-xs p-4 space-y-3 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 font-black text-xs bg-amber-500/12 text-amber-600 dark:text-amber-400">
                            {isExcel ? (
                              <FileSpreadsheet className="w-4 h-4" />
                            ) : isImg ? (
                              <ImageIcon className="w-4 h-4" />
                            ) : (
                              <FileText className="w-4 h-4" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* スコープバッジ */}
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1 ${
                                  doc.scope === "organization"
                                    ? "bg-primary/10 text-primary border border-primary/25"
                                    : "bg-muted text-muted-foreground border border-border"
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

                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black shrink-0 ${
                            isPdf
                              ? "bg-rose-500/12 text-rose-600 dark:text-rose-400 border border-rose-500/25"
                              : isExcel
                              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25"
                              : isWord
                              ? "bg-sky-500/12 text-sky-700 dark:text-sky-400 border border-sky-500/25"
                              : "bg-primary/10 text-primary border border-primary/25"
                          }`}
                        >
                          {isExcel ? "Excel" : isWord ? "Word" : isPdf ? "PDF" : isImg ? "画像" : doc.fileType}
                        </span>
                      </div>

                      {doc.description && (
                        <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                          {doc.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-border text-[11px] font-bold text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span>{doc.fileSize}</span>
                          <span>•</span>
                          <span>更新: {doc.updatedAt}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(doc)}
                            className="p-1.5 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center gap-1 text-xs font-black"
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
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ➕ 資料 新規追加モーダル
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isCreateModalOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 overflow-y-auto animate-in fade-in duration-200">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xs overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">資料の新規登録</h3>
                    <p className="text-[11px] font-bold text-slate-300">PDF・しおりをクラウドに保存</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
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
                            : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
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
                            ? "bg-primary/10 border-primary text-primary shadow-xs"
                            : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
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
                    <div className="grid grid-cols-2 gap-1 bg-muted/80 dark:bg-muted/50 p-1 rounded-2xl border border-border">
                      <button
                        type="button"
                        onClick={() => setUploadMode("file")}
                        className={`py-1.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          uploadMode === "file"
                            ? "bg-card text-foreground shadow-sm border border-border font-black"
                            : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                        }`}
                      >
                        <UploadCloud className={`w-3.5 h-3.5 ${uploadMode === "file" ? "text-primary" : ""}`} />
                        <span>ファイル選択 (R2)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setUploadMode("url")}
                        className={`py-1.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          uploadMode === "url"
                            ? "bg-card text-foreground shadow-sm border border-border font-black"
                            : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                        }`}
                      >
                        <Link2 className={`w-3.5 h-3.5 ${uploadMode === "url" ? "text-primary" : ""}`} />
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
                        accept=".xlsx,.xls,.xlsm,.csv,.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel.sheet.binary.macroEnabled.12,text/csv,application/csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*"
                        className="sr-only"
                      />

                      {selectedFile ? (
                        <div className="p-3 rounded-2xl bg-primary/10 border border-dashed border-primary/40 flex items-center justify-between gap-2">
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
                            className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor="create-doc-file-input"
                          className="w-full py-6 rounded-2xl border border-dashed border-border bg-card shadow-xs hover:border-primary/40 hover:bg-muted/35 transition-all flex flex-col items-center justify-center gap-1.5 text-muted-foreground cursor-pointer group active:scale-[0.99]"
                        >
                          <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                            <UploadCloud className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-bold text-foreground">
                            ここをタップしてExcel・PDF・写真を選択
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Excel (.xlsx, .xls), PDF, Word, 画像に対応
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

                  {/* ファイル形式 / 種別選択 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-foreground">
                      ファイル形式 / 種類 <span className="text-destructive">*</span>
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: "XLSX", label: "Excel", sub: "表計算", icon: FileSpreadsheet },
                        { id: "PDF", label: "PDF", sub: "文書", icon: FileText },
                        { id: "DOCX", label: "Word", sub: "書類", icon: FileText },
                        { id: "IMG", label: "画像", sub: "写真", icon: ImageIcon },
                      ].map((fmt) => {
                        const isSelected = newFileType === fmt.id;
                        const Icon = fmt.icon;
                        return (
                          <button
                            key={fmt.id}
                            type="button"
                            onClick={() => setNewFileType(fmt.id)}
                            className={`p-2 rounded-2xl border text-center transition-all flex flex-col items-center gap-0.5 cursor-pointer ${
                              isSelected
                                ? "border-primary bg-primary/10 text-primary shadow-xs font-black"
                                : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground font-bold"
                            }`}
                          >
                            <Icon className="w-4 h-4 mb-0.5" />
                            <span className="text-xs leading-none">{fmt.label}</span>
                            <span className="text-[9px] opacity-70 leading-none">{fmt.sub}</span>
                          </button>
                        );
                      })}
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
                    <LiffSelect
                      value={newCategory}
                      onChange={setNewCategory}
                      options={DOCUMENT_CATEGORY_OPTIONS}
                      title="資料カテゴリを選択"
                      accent="amber"
                      searchable={false}
                      className="w-full bg-background"
                    />
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
                    className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
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
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 overflow-y-auto animate-in fade-in duration-200">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xs overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center font-black">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">資料の編集</h3>
                    <p className="text-[11px] font-bold text-slate-300">公開範囲や内容の更新・削除</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
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
                            : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
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
                            ? "bg-primary/10 border-primary text-primary shadow-xs"
                            : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
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

                  {/* ファイル形式 / 種別選択 (編集) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-foreground">
                      ファイル形式 / 種類 <span className="text-destructive">*</span>
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: "XLSX", label: "Excel", sub: "表計算", icon: FileSpreadsheet },
                        { id: "PDF", label: "PDF", sub: "文書", icon: FileText },
                        { id: "DOCX", label: "Word", sub: "書類", icon: FileText },
                        { id: "IMG", label: "画像", sub: "写真", icon: ImageIcon },
                      ].map((fmt) => {
                        const isSelected = editFileType === fmt.id;
                        const Icon = fmt.icon;
                        return (
                          <button
                            key={fmt.id}
                            type="button"
                            onClick={() => setEditFileType(fmt.id)}
                            className={`p-2 rounded-2xl border text-center transition-all flex flex-col items-center gap-0.5 cursor-pointer ${
                              isSelected
                                ? "border-primary bg-primary/10 text-primary shadow-xs font-black"
                                : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground font-bold"
                            }`}
                          >
                            <Icon className="w-4 h-4 mb-0.5" />
                            <span className="text-xs leading-none">{fmt.label}</span>
                            <span className="text-[9px] opacity-70 leading-none">{fmt.sub}</span>
                          </button>
                        );
                      })}
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
                    <LiffSelect
                      value={editCategory}
                      onChange={setEditCategory}
                      options={DOCUMENT_CATEGORY_OPTIONS}
                      title="資料カテゴリを選択"
                      accent="amber"
                      searchable={false}
                      className="w-full bg-background"
                    />
                  </div>

                  {/* ファイルの変更オプション */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-foreground">ファイルの差し替え</label>
                    <div className="grid grid-cols-3 gap-1 bg-muted/80 dark:bg-muted/50 p-1 rounded-2xl border border-border">
                      <button
                        type="button"
                        onClick={() => setEditUploadMode("current")}
                        className={`py-1.5 rounded-xl text-[11px] transition-all cursor-pointer ${
                          editUploadMode === "current"
                            ? "bg-card text-foreground shadow-sm border border-border font-black"
                            : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                        }`}
                      >
                        変更しない
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditUploadMode("file")}
                        className={`py-1.5 rounded-xl text-[11px] transition-all cursor-pointer ${
                          editUploadMode === "file"
                            ? "bg-card text-foreground shadow-sm border border-border font-black"
                            : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                        }`}
                      >
                        ファイル選択
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditUploadMode("url")}
                        className={`py-1.5 rounded-xl text-[11px] transition-all cursor-pointer ${
                          editUploadMode === "url"
                            ? "bg-card text-foreground shadow-sm border border-border font-black"
                            : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
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
                          accept=".xlsx,.xls,.xlsm,.csv,.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel.sheet.binary.macroEnabled.12,text/csv,application/csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*"
                          className="sr-only"
                        />
                        {editSelectedFile ? (
                          <div className="p-3 rounded-2xl bg-primary/10 border border-dashed border-primary/40 flex items-center justify-between gap-2">
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
                              className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <label
                            htmlFor="edit-doc-file-input"
                            className="w-full py-4 rounded-2xl border border-dashed border-border bg-card shadow-xs hover:border-primary/40 hover:bg-muted/35 flex flex-col items-center justify-center gap-1 text-muted-foreground cursor-pointer group active:scale-[0.99]"
                          >
                            <UploadCloud className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold text-foreground">
                              新しいExcel・PDF・写真を選択
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
                      className="py-3 px-4 rounded-2xl border border-rose-500 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 font-black text-xs transition-all flex items-center justify-center gap-1.5 shrink-0 active:scale-95 disabled:opacity-50"
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
                      className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
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
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 overflow-y-auto animate-in fade-in duration-200">
            <div 
              className="absolute inset-0"
              onClick={() => setPreviewDoc(null)}
            />

            <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xs overflow-hidden flex flex-col max-h-[92vh] relative z-10 animate-in zoom-in-95 duration-200">
              {/* モーダルヘッダー (A-3 Dark Solid Header Cap) */}
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    {previewDoc.fileType === "XLSX" || previewDoc.fileUrl.match(/\.(xlsx?|csv|xlsm)($|\?)/i) ? (
                      <FileSpreadsheet className="w-4 h-4" />
                    ) : previewDoc.fileType === "IMG" || previewDoc.fileUrl.startsWith("data:image/") ? (
                      <ImageIcon className="w-4 h-4" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-white truncate">
                      {previewDoc.title}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-300 truncate">
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
                      className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
                      title="外部ブラウザで開く"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* プレビューコンテンツ本体 */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center bg-muted/35 min-h-[260px] max-h-[70vh]">
                {previewDoc.fileType === "IMG" || previewDoc.fileUrl.startsWith("data:image/") || previewDoc.fileUrl.match(/\.(png|jpg|jpeg|webp|gif)$/i) ? (
                  <div className="flex flex-col items-center justify-center w-full space-y-3">
                    <div className="relative max-w-full rounded-2xl overflow-hidden shadow-xs border border-border bg-black/5 flex items-center justify-center">
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
                  <div className="w-full flex flex-col items-center justify-center space-y-2">
                    <PdfCanvasViewer
                      url={previewDoc.fileUrl}
                      title={previewDoc.title}
                      aspectRatioA4={true}
                    />
                    <div className="flex items-center justify-between w-full px-1 text-[10px] text-muted-foreground font-medium">
                      <span>💡 端末によって表示されない場合は右のボタンをお試しください</span>
                      <a
                        href={getExternalBrowserUrl(previewDoc.fileUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary font-black hover:underline flex items-center gap-0.5 shrink-0"
                      >
                        <span>ブラウザで開く</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                ) : previewDoc.fileType === "XLSX" || previewDoc.fileUrl.match(/\.(xlsx?|csv|xlsm)($|\?)/i) ? (
                  <div className="flex flex-col items-center justify-center py-8 px-4 text-center space-y-4 max-w-sm w-full">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/25">
                      <FileSpreadsheet className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5">
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-[10px] font-black border border-emerald-500/25 inline-block">
                        Excel スプレッドシート
                      </span>
                      <h4 className="text-sm font-black text-foreground">{previewDoc.title}</h4>
                      <p className="text-xs font-medium text-muted-foreground">
                        {previewDoc.description || "表計算テンプレート資料"}
                      </p>
                    </div>

                    <div className="p-3 rounded-2xl bg-muted/50 border border-border text-[11px] font-bold text-muted-foreground text-left w-full space-y-1">
                      <p className="flex items-center gap-1.5 text-foreground">
                        <span>💡</span>
                        <span>ご利用方法</span>
                      </p>
                      <p className="text-[10px] leading-relaxed">
                        ダウンロード後、スマートフォンやPCのExcel・Numbers・Googleスプレッドシートアプリ等で開いて閲覧・編集できます。
                      </p>
                    </div>

                    {previewDoc.fileUrl.startsWith("http") && !previewDoc.fileUrl.includes("/api/liff/documents/files") && !previewDoc.fileUrl.includes("/api/documents/files") ? (
                      <a
                        href={previewDoc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black transition-all flex items-center justify-center gap-2 shadow-xs active:scale-95 cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>外部スプレッドシートで開く</span>
                      </a>
                    ) : (
                      <a
                        href={previewDoc.fileUrl}
                        download={
                          previewDoc.title.match(/\.(xlsx?|csv|xlsm)$/i)
                            ? previewDoc.title
                            : `${previewDoc.title}.xlsx`
                        }
                        className="w-full py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black transition-all flex items-center justify-center gap-2 shadow-xs active:scale-95 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>Excelファイルをダウンロード</span>
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                    <div
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                        previewDoc.fileType === "DOCX" || previewDoc.fileUrl.match(/\.docx?($|\?)/i)
                          ? "bg-sky-500/12 text-sky-700 dark:text-sky-400 border border-sky-500/25"
                          : "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                      }`}
                    >
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
                        className="px-5 py-2.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black transition-all flex items-center gap-2 shadow-xs active:scale-95"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>外部サイトで閲覧する</span>
                      </a>
                    ) : (
                      <a
                        href={previewDoc.fileUrl}
                        download={previewDoc.title}
                        className="px-5 py-2.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black transition-all flex items-center gap-2 shadow-xs active:scale-95"
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
                <div className="p-3.5 border-t border-border bg-card text-xs text-muted-foreground font-medium">
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
