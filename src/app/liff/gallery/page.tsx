// filepath: src/app/liff/gallery/page.tsx
"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  LiffSelect,
  type LiffSelectOption,
} from "@/components/liff/LiffSelect";
import { useLiff } from "@/components/liff/LiffProvider";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";
import {
  buildPhotosZipArchive,
  canShareZipFile,
  formatFileBytes,
  formatRemainingExpiresLabel,
  shareBuiltZipFile,
  triggerAnchorBlobDownload,
  uploadGalleryPhotosBatch,
  type BatchUploadProgress,
  type BuiltZipArchive,
  type GalleryAlbumDetailResponse,
  type GalleryAlbumSummary,
  type GalleryListResponse,
  type GalleryMatchCandidate,
  type GalleryPhotoItem,
  type GalleryStorageInfo,
  type ZipDownloadProgress,
} from "@/lib/liff/gallery-client";
import {
  AlertCircle,
  Archive,
  Calendar,
  Camera,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FolderPlus,
  HardDrive,
  Images,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Share2,
  Sparkles,
  Square,
  Trash2,
  Trophy,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

const ALBUM_CATEGORY_OPTIONS: ReadonlyArray<LiffSelectOption> = [
  { value: "match", label: "試合・大会", badge: "試合", badgeTone: "primary" },
  {
    value: "practice",
    label: "練習・紅白戦",
    badge: "練習",
    badgeTone: "teal",
  },
  {
    value: "event",
    label: "合宿・卒団式・行事",
    badge: "行事",
    badgeTone: "amber",
  },
  { value: "other", label: "その他", badge: "その他", badgeTone: "slate" },
];

const FILTER_CATEGORY_TABS = [
  { id: "all", label: "すべて" },
  { id: "match", label: "試合" },
  { id: "practice", label: "練習" },
  { id: "event", label: "行事・合宿" },
] as const;

function getCategoryBadgeLabel(category: string): string {
  if (category === "match") return "試合";
  if (category === "practice") return "練習";
  if (category === "event") return "行事・合宿";
  return "その他";
}

function getTodayDateString(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function LiffGalleryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentTeam, profile, isDemo } = useLiff();

  const activeTeamId = useMemo(() => {
    if (currentTeam?.id) return currentTeam.id;
    if (typeof window !== "undefined") {
      return localStorage.getItem("iscore_selectedTeamId") || "demo-team";
    }
    return "demo-team";
  }, [currentTeam?.id]);

  const albumIdParam = (searchParams.get("albumId") || "").trim();
  const matchIdParam = (searchParams.get("matchId") || "").trim();

  const initialListCache = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<GalleryListResponse>(
      `/api/liff/gallery?teamId=${encodeURIComponent(activeTeamId)}`
    );
  }, [activeTeamId]);

  const [albums, setAlbums] = useState<GalleryAlbumSummary[]>(
    () => initialListCache?.albums ?? []
  );
  const [storage, setStorage] = useState<GalleryStorageInfo | null>(
    () => initialListCache?.storage ?? null
  );
  const [recentMatches, setRecentMatches] = useState<GalleryMatchCandidate[]>(
    () => initialListCache?.recentMatches ?? []
  );
  const [isLoadingList, setIsLoadingList] = useState<boolean>(
    () => !initialListCache
  );

  // アルバム詳細ステート
  const [activeAlbum, setActiveAlbum] = useState<GalleryAlbumSummary | null>(
    null
  );
  const [photos, setPhotos] = useState<GalleryPhotoItem[]>([]);
  const [isLoadingAlbum, setIsLoadingAlbum] = useState<boolean>(false);

  // 一覧フィルタ
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // 選択モード（シンプル複数選択 → 一括ZIPダウンロード / 削除）
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(
    () => new Set()
  );

  // Portal用マウントフラグ
  const [mounted, setMounted] = useState<boolean>(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // フルスクリーン写真プレビュー（Lightbox）
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // アップロード・新規作成モーダル
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [uploadTargetMode, setUploadTargetMode] = useState<"new" | "existing">(
    "new"
  );
  const [formMatchId, setFormMatchId] = useState<string>("");
  const [formTitle, setFormTitle] = useState<string>("");
  const [formDate, setFormDate] = useState<string>(() => getTodayDateString());
  const [formCategory, setFormCategory] = useState<string>("match");
  const [formNotes, setFormNotes] = useState<string>("");
  const [keepOriginal, setKeepOriginal] = useState<boolean>(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] =
    useState<BatchUploadProgress | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // アルバム編集モーダル
  const [isEditAlbumModalOpen, setIsEditAlbumModalOpen] =
    useState<boolean>(false);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("match");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editMatchId, setEditMatchId] = useState<string>("");
  const [isSavingAlbumEdit, setIsSavingAlbumEdit] = useState<boolean>(false);

  // 一括ZIPダウンロードモーダル
  const [zipTargetPhotos, setZipTargetPhotos] = useState<
    GalleryPhotoItem[] | null
  >(null);
  const [zipQuality, setZipQuality] = useState<"web" | "original">("web");
  const [isBuildingZip, setIsBuildingZip] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<ZipDownloadProgress | null>(
    null
  );
  const [builtArchive, setBuiltArchive] = useState<BuiltZipArchive | null>(
    null
  );
  const zipAbortRef = useRef<AbortController | null>(null);

  // 処理中フラグ（削除・元画質解放）
  const [isDeletingPhotos, setIsDeletingPhotos] = useState<boolean>(false);
  const [isPurgingOriginals, setIsPurgingOriginals] = useState<boolean>(false);
  const [isDeletingAlbum, setIsDeletingAlbum] = useState<boolean>(false);

  // チーム切替時の完全リセット
  const prevTeamIdRef = useRef<string>(activeTeamId);
  useEffect(() => {
    if (prevTeamIdRef.current !== activeTeamId) {
      prevTeamIdRef.current = activeTeamId;
      const nextCached = peekLiffApiCache<GalleryListResponse>(
        `/api/liff/gallery?teamId=${encodeURIComponent(activeTeamId)}`
      );
      setAlbums(nextCached?.albums ?? []);
      setStorage(nextCached?.storage ?? null);
      setRecentMatches(nextCached?.recentMatches ?? []);
      setIsLoadingList(!nextCached);
      setActiveAlbum(null);
      setPhotos([]);
      setIsSelectMode(false);
      setSelectedPhotoIds(new Set());
      setLightboxIndex(null);
    }
  }, [activeTeamId]);

  const fetchGalleryList = useCallback(
    async (bypassCache = false) => {
      if (!activeTeamId) return;
      try {
        const res = await fetch(
          `/api/liff/gallery?teamId=${encodeURIComponent(activeTeamId)}`,
          bypassCache
            ? { headers: { "X-iScore-Bypass-Cache": "1" } }
            : undefined
        );
        const data = (await res.json().catch(() => ({}))) as GalleryListResponse;
        if (res.ok && data.success) {
          setAlbums(data.albums || []);
          setStorage(data.storage || null);
          setRecentMatches(data.recentMatches || []);
        }
      } catch (err) {
        console.warn("fetchGalleryList error:", err);
      } finally {
        setIsLoadingList(false);
      }
    },
    [activeTeamId]
  );

  const fetchAlbumDetail = useCallback(
    async (targetAlbumId: string, bypassCache = false) => {
      if (!activeTeamId || !targetAlbumId) return;
      const cacheUrl = `/api/liff/gallery/albums/${encodeURIComponent(
        targetAlbumId
      )}?teamId=${encodeURIComponent(activeTeamId)}`;

      if (!bypassCache) {
        const cached = peekLiffApiCache<GalleryAlbumDetailResponse>(cacheUrl);
        if (cached?.album) {
          setActiveAlbum(cached.album);
          setPhotos(cached.photos || []);
        } else {
          setIsLoadingAlbum(true);
        }
      } else {
        setIsLoadingAlbum(true);
      }

      try {
        const res = await fetch(
          cacheUrl,
          bypassCache
            ? { headers: { "X-iScore-Bypass-Cache": "1" } }
            : undefined
        );
        const data = (await res
          .json()
          .catch(() => ({}))) as GalleryAlbumDetailResponse;
        if (res.ok && data.success && data.album) {
          setActiveAlbum(data.album);
          setPhotos(data.photos || []);
        } else if (res.status === 404) {
          toast.error("指定されたアルバムが見つかりませんでした");
          router.replace("/liff/gallery");
        }
      } catch (err) {
        console.warn("fetchAlbumDetail error:", err);
      } finally {
        setIsLoadingAlbum(false);
      }
    },
    [activeTeamId, router]
  );

  useEffect(() => {
    void fetchGalleryList(false);
  }, [fetchGalleryList]);

  // URLクエリ（?albumId=... または ?matchId=...）連動
  useEffect(() => {
    if (albumIdParam) {
      setIsSelectMode(false);
      setSelectedPhotoIds(new Set());
      setLightboxIndex(null);
      void fetchAlbumDetail(albumIdParam, false);
      return;
    }

    setActiveAlbum(null);
    setPhotos([]);
    setIsSelectMode(false);
    setSelectedPhotoIds(new Set());
    setLightboxIndex(null);
  }, [albumIdParam, fetchAlbumDetail]);

  // ?matchId=... で遷移してきて既存アルバムがある場合は自動的にそのアルバムを開く
  useEffect(() => {
    if (!albumIdParam && matchIdParam && albums.length > 0) {
      const existing = albums.find((a) => a.matchId === matchIdParam);
      if (existing) {
        router.replace(
          `/liff/gallery?albumId=${encodeURIComponent(existing.id)}`
        );
      }
    }
  }, [albumIdParam, matchIdParam, albums, router]);

  const matchedCandidateForParam = useMemo(() => {
    if (!matchIdParam) return null;
    return recentMatches.find((m) => m.id === matchIdParam) || null;
  }, [matchIdParam, recentMatches]);

  const matchSelectOptions = useMemo<LiffSelectOption[]>(() => {
    const base: LiffSelectOption[] = [
      {
        value: "",
        label: "試合と紐付けない（合宿・練習・行事アルバム）",
        sublabel: "単体アルバムとして作成します",
      },
    ];
    for (const m of recentMatches) {
      const scoreStr =
        m.status === "finished" || m.status === "live"
          ? ` (${m.myScore}-${m.opponentScore})`
          : "";
      base.push({
        value: m.id,
        label: `${m.date} vs ${m.opponent}${scoreStr}`,
        sublabel: m.tournamentName || "試合記録",
        badge: m.existingAlbumId ? "アルバム有" : undefined,
        badgeTone: m.existingAlbumId ? "teal" : undefined,
      });
    }
    return base;
  }, [recentMatches]);

  const filteredAlbums = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return albums.filter((a) => {
      if (categoryFilter !== "all" && a.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.albumDate.includes(q) ||
        (a.matchOpponent || "").toLowerCase().includes(q) ||
        (a.matchTournamentName || "").toLowerCase().includes(q) ||
        a.notes.toLowerCase().includes(q)
      );
    });
  }, [albums, categoryFilter, searchQuery]);

  // 新規作成 or 追加アップロードモーダルを開く
  const openUploadModal = useCallback(
    (mode: "new" | "existing", presetMatch?: GalleryMatchCandidate | null) => {
      if (isDemo || activeTeamId === "demo-team") {
        toast.info(
          "体験デモチームではアップロードはシミュレーション制限されています（一括ZIPダウンロードはお試しいただけます！）"
        );
        return;
      }
      setUploadTargetMode(mode);
      setPendingFiles([]);
      setUploadProgress(null);
      setKeepOriginal(false);

      if (mode === "new") {
        if (presetMatch) {
          setFormMatchId(presetMatch.id);
          setFormTitle(`vs ${presetMatch.opponent}`);
          setFormDate(presetMatch.date || getTodayDateString());
          setFormCategory("match");
          setFormNotes(presetMatch.tournamentName || "");
        } else {
          setFormMatchId("");
          setFormTitle("");
          setFormDate(getTodayDateString());
          setFormCategory("match");
          setFormNotes("");
        }
      }
      setIsUploadModalOpen(true);
    },
    [activeTeamId, isDemo]
  );

  const handleMatchSelectInUploadForm = useCallback(
    (nextMatchId: string) => {
      setFormMatchId(nextMatchId);
      if (!nextMatchId) return;
      const m = recentMatches.find((item) => item.id === nextMatchId);
      if (m) {
        setFormTitle(`vs ${m.opponent}`);
        if (m.date) setFormDate(m.date);
        setFormCategory("match");
        if (!formNotes && m.tournamentName) {
          setFormNotes(m.tournamentName);
        }
      }
    },
    [recentMatches, formNotes]
  );

  const handleFilesSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      const added = Array.from(fileList).filter((f) =>
        f.type.startsWith("image/") ||
        /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(f.name)
      );
      if (added.length === 0) {
        toast.error("画像ファイル（JPG / PNG / WebP / HEIC）を選択してください");
        return;
      }
      setPendingFiles((prev) => [...prev, ...added]);
      e.target.value = "";
    },
    []
  );

  const pendingFilesRawBytes = useMemo(
    () => pendingFiles.reduce((sum, f) => sum + f.size, 0),
    [pendingFiles]
  );
  const estimatedOptimizedBytes = useMemo(
    () => pendingFiles.length * 320 * 1024,
    [pendingFiles.length]
  );

  const handleExecuteUpload = useCallback(async () => {
    if (isUploading) return;
    if (uploadTargetMode === "new" && !formTitle.trim()) {
      toast.error("アルバム名を入力してください");
      return;
    }
    if (uploadTargetMode === "existing" && pendingFiles.length === 0) {
      toast.error("追加する写真を選択してください");
      return;
    }

    setIsUploading(true);
    const abortCtrl = new AbortController();
    uploadAbortRef.current = abortCtrl;

    try {
      let targetAlbumId = activeAlbum?.id || "";
      let startSortOrder = photos.length;

      if (uploadTargetMode === "new") {
        const createRes = await fetch(
          `/api/liff/gallery/albums?teamId=${encodeURIComponent(activeTeamId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              teamId: activeTeamId,
              matchId: formMatchId || null,
              title: formTitle.trim(),
              albumDate: formDate,
              category: formCategory,
              notes: formNotes.trim(),
              reuseExistingMatchAlbum: true,
              userName: profile?.displayName || "",
            }),
          }
        );
        const createJson = (await createRes.json().catch(() => ({}))) as {
          success?: boolean;
          albumId?: string;
          reused?: boolean;
          error?: string;
        };
        if (!createRes.ok || !createJson.success || !createJson.albumId) {
          throw new Error(createJson.error || "アルバムの作成に失敗しました");
        }
        targetAlbumId = createJson.albumId;
        if (createJson.reused) {
          const existingObj = albums.find((a) => a.id === targetAlbumId);
          startSortOrder = existingObj?.photoCount || 0;
        } else {
          startSortOrder = 0;
        }
      }

      if (pendingFiles.length > 0 && targetAlbumId) {
        const result = await uploadGalleryPhotosBatch({
          teamId: activeTeamId,
          albumId: targetAlbumId,
          files: pendingFiles,
          keepOriginal,
          startSortOrder,
          userName: profile?.displayName || "",
          signal: abortCtrl.signal,
          onProgress: (prog) => setUploadProgress({ ...prog }),
        });

        invalidateLiffApiCache("/api/liff/gallery");

        if (abortCtrl.signal.aborted) {
          toast.info("アップロードを中断しました");
        } else if (result.failedFiles.length > 0) {
          toast.warning(
            `${result.uploadedPhotos.length}枚を登録しました（${result.failedFiles.length}枚スキップ）`
          );
        } else {
          toast.success(
            `${result.uploadedPhotos.length}枚の写真を最適化して登録しました！`
          );
        }
      } else {
        invalidateLiffApiCache("/api/liff/gallery");
        toast.success("アルバムを作成しました");
      }

      setIsUploadModalOpen(false);
      setPendingFiles([]);
      setUploadProgress(null);

      await fetchGalleryList(true);
      if (targetAlbumId) {
        if (albumIdParam === targetAlbumId) {
          await fetchAlbumDetail(targetAlbumId, true);
        } else {
          router.push(
            `/liff/gallery?albumId=${encodeURIComponent(targetAlbumId)}`
          );
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "アップロード中にエラーが発生しました";
      toast.error(msg);
    } finally {
      setIsUploading(false);
      uploadAbortRef.current = null;
    }
  }, [
    isUploading,
    uploadTargetMode,
    formTitle,
    formMatchId,
    formDate,
    formCategory,
    formNotes,
    pendingFiles,
    keepOriginal,
    activeAlbum?.id,
    photos.length,
    activeTeamId,
    profile?.displayName,
    albums,
    albumIdParam,
    fetchGalleryList,
    fetchAlbumDetail,
    router,
  ]);

  // 写真の選択トグル
  const toggleSelectPhoto = useCallback((photoId: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }, []);

  const handleSelectAllPhotos = useCallback(() => {
    if (selectedPhotoIds.size === photos.length) {
      setSelectedPhotoIds(new Set());
    } else {
      setSelectedPhotoIds(new Set(photos.map((p) => p.id)));
    }
  }, [photos, selectedPhotoIds.size]);

  // ZIPダウンロードモーダルを開く（選択分 or アルバム全件）
  const openZipDownloadModal = useCallback(
    (targetList: GalleryPhotoItem[]) => {
      if (targetList.length === 0) {
        toast.error("ダウンロードする写真を選択してください");
        return;
      }
      setZipTargetPhotos(targetList);
      setZipQuality("web");
      setZipProgress(null);
      setBuiltArchive(null);
    },
    []
  );

  // アルバム一覧カードからの「全件一括ZIP保存」ショートカット
  const handleQuickAlbumZipFromList = useCallback(
    async (albumSummary: GalleryAlbumSummary) => {
      if (albumSummary.photoCount === 0) {
        toast.info("このアルバムにはまだ写真がありません");
        return;
      }
      try {
        const res = await fetch(
          `/api/liff/gallery/albums/${encodeURIComponent(
            albumSummary.id
          )}?teamId=${encodeURIComponent(activeTeamId)}`
        );
        const data = (await res
          .json()
          .catch(() => ({}))) as GalleryAlbumDetailResponse;
        if (!res.ok || !data.success || !data.photos?.length) {
          toast.error("写真一覧の取得に失敗しました");
          return;
        }
        setActiveAlbum(data.album);
        openZipDownloadModal(data.photos);
      } catch {
        toast.error("通信エラーが発生しました");
      }
    },
    [activeTeamId, openZipDownloadModal]
  );

  const handleStartBuildZip = useCallback(
    async (chosenQuality: "web" | "original") => {
      if (!zipTargetPhotos || zipTargetPhotos.length === 0 || isBuildingZip) {
        return;
      }
      setZipQuality(chosenQuality);
      setIsBuildingZip(true);
      setBuiltArchive(null);
      const ctrl = new AbortController();
      zipAbortRef.current = ctrl;

      try {
        const archive = await buildPhotosZipArchive({
          photos: zipTargetPhotos,
          quality: chosenQuality,
          albumDate: activeAlbum?.albumDate || getTodayDateString(),
          albumTitle: activeAlbum?.title || "gallery",
          signal: ctrl.signal,
          onProgress: (prog) => setZipProgress({ ...prog }),
        });
        setBuiltArchive(archive);

        // PCブラウザおよび通常ブラウザでは完了と同時に即時ダウンロード発火
        const ua =
          typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
        const isInLineApp = /Line\//i.test(ua);
        if (!isInLineApp) {
          triggerAnchorBlobDownload(archive.zipBlob, archive.zipFileName);
          toast.success(
            `ZIPファイル（${archive.includedCount}枚）のダウンロードを開始しました`
          );
        } else {
          toast.success(
            `ZIP作成完了！（${archive.includedCount}枚）下のボタンから保存・共有できます`
          );
        }
      } catch (err) {
        if (!ctrl.signal.aborted) {
          toast.error(
            err instanceof Error
              ? err.message
              : "ZIPファイルの作成に失敗しました"
          );
        }
      } finally {
        setIsBuildingZip(false);
        zipAbortRef.current = null;
      }
    },
    [zipTargetPhotos, isBuildingZip, activeAlbum?.albumDate, activeAlbum?.title]
  );

  const closeZipModal = useCallback(() => {
    if (zipAbortRef.current) {
      zipAbortRef.current.abort();
      zipAbortRef.current = null;
    }
    setIsBuildingZip(false);
    setZipTargetPhotos(null);
    setZipProgress(null);
    setBuiltArchive(null);
    if (!albumIdParam) {
      setActiveAlbum(null);
    }
  }, [albumIdParam]);

  // 選択した写真の削除
  const handleDeleteSelectedPhotos = useCallback(
    async (idsToDelete: string[]) => {
      if (!activeAlbum || idsToDelete.length === 0 || isDeletingPhotos) return;
      const confirmed = window.confirm(
        `選択した ${idsToDelete.length} 枚の写真をギャラリーから完全に削除しますか？`
      );
      if (!confirmed) return;

      setIsDeletingPhotos(true);
      try {
        const res = await fetch(
          `/api/liff/gallery/photos/delete?teamId=${encodeURIComponent(
            activeTeamId
          )}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              teamId: activeTeamId,
              albumId: activeAlbum.id,
              photoIds: idsToDelete,
            }),
          }
        );
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          deletedCount?: number;
          error?: string;
        };
        if (!res.ok || !json.success) {
          throw new Error(json.error || "削除に失敗しました");
        }
        invalidateLiffApiCache("/api/liff/gallery");
        toast.success(`${json.deletedCount || idsToDelete.length}枚の写真を削除しました`);
        setSelectedPhotoIds(new Set());
        setLightboxIndex(null);
        await Promise.all([
          fetchAlbumDetail(activeAlbum.id, true),
          fetchGalleryList(true),
        ]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "削除エラーが発生しました");
      } finally {
        setIsDeletingPhotos(false);
      }
    },
    [
      activeAlbum,
      isDeletingPhotos,
      activeTeamId,
      fetchAlbumDetail,
      fetchGalleryList,
    ]
  );

  // 元画質データのみ今すぐ削除（容量解放）
  const handlePurgeAlbumOriginals = useCallback(async () => {
    if (!activeAlbum || isPurgingOriginals) return;
    const confirmed = window.confirm(
      "一時共有中の「元画質（無圧縮）データ」のみ今すぐ削除して容量を空けますか？\n※ギャラリーの標準高画質写真（2048px）はそのまま残ります。"
    );
    if (!confirmed) return;

    setIsPurgingOriginals(true);
    try {
      const res = await fetch(
        `/api/liff/gallery/albums/${encodeURIComponent(
          activeAlbum.id
        )}/purge-originals?teamId=${encodeURIComponent(activeTeamId)}`,
        { method: "POST" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        freedBytes?: number;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "削除に失敗しました");
      }
      invalidateLiffApiCache("/api/liff/gallery");
      toast.success(
        `元画質データを削除し、${formatFileBytes(
          json.freedBytes || 0
        )} の容量を解放しました`
      );
      await Promise.all([
        fetchAlbumDetail(activeAlbum.id, true),
        fetchGalleryList(true),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsPurgingOriginals(false);
    }
  }, [
    activeAlbum,
    isPurgingOriginals,
    activeTeamId,
    fetchAlbumDetail,
    fetchGalleryList,
  ]);

  // アルバム編集保存
  const openEditAlbumModal = useCallback(() => {
    if (!activeAlbum) return;
    setEditTitle(activeAlbum.title);
    setEditDate(activeAlbum.albumDate);
    setEditCategory(activeAlbum.category || "match");
    setEditNotes(activeAlbum.notes || "");
    setEditMatchId(activeAlbum.matchId || "");
    setIsEditAlbumModalOpen(true);
  }, [activeAlbum]);

  const handleSaveAlbumEdit = useCallback(async () => {
    if (!activeAlbum || isSavingAlbumEdit) return;
    if (!editTitle.trim()) {
      toast.error("アルバム名を入力してください");
      return;
    }
    setIsSavingAlbumEdit(true);
    try {
      const res = await fetch(
        `/api/liff/gallery/albums/${encodeURIComponent(
          activeAlbum.id
        )}?teamId=${encodeURIComponent(activeTeamId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: activeTeamId,
            title: editTitle.trim(),
            albumDate: editDate,
            category: editCategory,
            notes: editNotes.trim(),
            matchId: editMatchId || null,
          }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "更新に失敗しました");
      }
      invalidateLiffApiCache("/api/liff/gallery");
      toast.success("アルバム情報を更新しました");
      setIsEditAlbumModalOpen(false);
      await Promise.all([
        fetchAlbumDetail(activeAlbum.id, true),
        fetchGalleryList(true),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新エラーが発生しました");
    } finally {
      setIsSavingAlbumEdit(false);
    }
  }, [
    activeAlbum,
    isSavingAlbumEdit,
    editTitle,
    editDate,
    editCategory,
    editNotes,
    editMatchId,
    activeTeamId,
    fetchAlbumDetail,
    fetchGalleryList,
  ]);

  const handleDeleteEntireAlbum = useCallback(async () => {
    if (!activeAlbum || isDeletingAlbum) return;
    const confirmed = window.confirm(
      `アルバム「${activeAlbum.title}」と登録されている全写真（${activeAlbum.photoCount}枚）を完全に削除しますか？\nこの操作は取り消せません。`
    );
    if (!confirmed) return;

    setIsDeletingAlbum(true);
    try {
      const res = await fetch(
        `/api/liff/gallery/albums/${encodeURIComponent(
          activeAlbum.id
        )}?teamId=${encodeURIComponent(activeTeamId)}`,
        { method: "DELETE" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "削除に失敗しました");
      }
      invalidateLiffApiCache("/api/liff/gallery");
      toast.success("アルバムを削除しました");
      setIsEditAlbumModalOpen(false);
      router.replace("/liff/gallery");
      void fetchGalleryList(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "削除エラーが発生しました");
    } finally {
      setIsDeletingAlbum(false);
    }
  }, [activeAlbum, isDeletingAlbum, activeTeamId, router, fetchGalleryList]);

  // 選択中の写真リスト
  const selectedPhotosList = useMemo(
    () => photos.filter((p) => selectedPhotoIds.has(p.id)),
    [photos, selectedPhotoIds]
  );
  const selectedDeletableIds = useMemo(
    () => selectedPhotosList.filter((p) => p.canDelete).map((p) => p.id),
    [selectedPhotosList]
  );

  // ZIP対象写真の容量計算
  const zipStats = useMemo(() => {
    if (!zipTargetPhotos) {
      return {
        webTotal: 0,
        rawTotal: 0,
        rawAvailableCount: 0,
        earliestExp: null as number | null,
      };
    }
    let webTotal = 0;
    let rawTotal = 0;
    let rawAvailableCount = 0;
    let earliestExp: number | null = null;
    for (const p of zipTargetPhotos) {
      webTotal += p.webBytes || 0;
      if (p.hasOriginal && p.originalUrl) {
        rawTotal += p.originalBytes || 0;
        rawAvailableCount += 1;
        if (
          p.originalExpiresAt &&
          (earliestExp === null || p.originalExpiresAt < earliestExp)
        ) {
          earliestExp = p.originalExpiresAt;
        }
      } else {
        rawTotal += p.webBytes || 0;
      }
    }
    return { webTotal, rawTotal, rawAvailableCount, earliestExp };
  }, [zipTargetPhotos]);

  // Lightbox 中の対象写真
  const currentLightboxPhoto =
    lightboxIndex !== null && photos[lightboxIndex]
      ? photos[lightboxIndex]
      : null;

  // 容量メーターのパーセント計算
  const storageUsage = useMemo(() => {
    const limit = storage?.freeTierLimitBytes || 10 * 1024 * 1024 * 1024;
    const webB = storage?.webBytes || 0;
    const rawB = storage?.rawBytes || 0;
    const webPct = Math.min(100, (webB / limit) * 100);
    const rawPct = Math.min(100 - webPct, (rawB / limit) * 100);
    return { limit, webB, rawB, webPct, rawPct };
  }, [storage]);

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        {albumIdParam ? (
          /* ==========================================
             📸 VIEW B: アルバム詳細・写真グリッド＆選択一括DL画面
             ========================================== */
          <>
            <button
              type="button"
              onClick={() => router.push("/liff/gallery")}
              className="h-10 px-4 rounded-[var(--radius-xl)] border font-black gap-2 shadow-xs border-border bg-card text-foreground hover:bg-muted inline-flex items-center text-xs active:scale-95 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>アルバム一覧へ戻る</span>
            </button>

            {isLoadingAlbum && !activeAlbum ? (
              <div className="rounded-2xl border border-border bg-card p-10 flex flex-col items-center justify-center gap-3 shadow-xs">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <p className="text-xs font-black text-muted-foreground">
                  アルバムを読み込み中...
                </p>
              </div>
            ) : activeAlbum ? (
              <>
                {/* A-3 アルバムヘッダー＆一括操作カード */}
                <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black">
                          {getCategoryBadgeLabel(activeAlbum.category)}
                        </span>
                        <span className="text-xs font-black tabular-nums text-slate-200">
                          {activeAlbum.albumDate}
                        </span>
                        {activeAlbum.matchScoreLabel && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-black text-amber-300 tabular-nums">
                            {activeAlbum.matchScoreLabel}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-black text-slate-200 tabular-nums">
                          全 {photos.length} 枚
                        </span>
                      </div>
                      <h1 className="text-base sm:text-lg font-black text-white leading-snug break-words">
                        {activeAlbum.title}
                      </h1>
                      {activeAlbum.matchTournamentName && (
                        <p className="text-[11px] font-bold text-slate-300 truncate">
                          {activeAlbum.matchTournamentName}
                        </p>
                      )}
                    </div>

                    {activeAlbum.canManage && !isDemo && (
                      <button
                        type="button"
                        onClick={openEditAlbumModal}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[11px] font-black inline-flex items-center gap-1 shrink-0 active:scale-95 transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>編集</span>
                      </button>
                    )}
                  </div>

                  <div className="p-4 space-y-3 bg-card">
                    {activeAlbum.notes && (
                      <p className="text-xs font-bold text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {activeAlbum.notes}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-muted-foreground">
                      <span>
                        登録: {activeAlbum.createdByName} ・ 容量{" "}
                        {formatFileBytes(activeAlbum.webTotalBytes)}
                      </span>
                      {activeAlbum.matchId && (
                        <Link
                          href={`/liff/matches?id=${encodeURIComponent(
                            activeAlbum.matchId
                          )}`}
                          className="inline-flex items-center gap-1 text-primary font-black hover:underline"
                        >
                          <Trophy className="w-3.5 h-3.5" />
                          <span>試合スコア・詳細を見る</span>
                        </Link>
                      )}
                    </div>

                    {/* 7日間限定・元画質データ共有中の案内バー */}
                    {activeAlbum.activeRawPhotoCount > 0 && (
                      <div className="rounded-xl border border-teal-500/35 bg-teal-500/10 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Package className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                          <div className="text-[11px] font-black text-teal-900 dark:text-teal-200 leading-snug">
                            <span>
                              元画質オリジナル共有中（{activeAlbum.activeRawPhotoCount}枚・
                              {formatFileBytes(activeAlbum.activeRawTotalBytes)}）
                            </span>
                            {activeAlbum.earliestRawExpiresAt && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-teal-600 text-white text-[10px]">
                                <Clock className="w-2.5 h-2.5" />
                                {formatRemainingExpiresLabel(
                                  activeAlbum.earliestRawExpiresAt
                                )}
                                で自動削除
                              </span>
                            )}
                          </div>
                        </div>
                        {activeAlbum.canManage && !isDemo && (
                          <button
                            type="button"
                            disabled={isPurgingOriginals}
                            onClick={() => void handlePurgeAlbumOriginals()}
                            className="px-2.5 py-1 rounded-lg bg-card border border-teal-600/40 text-teal-700 dark:text-teal-300 text-[10px] font-black hover:bg-teal-500/15 active:scale-95 transition-all shrink-0"
                          >
                            {isPurgingOriginals
                              ? "解放中..."
                              : "元画質のみ今すぐ削除（容量解放）"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* 主要アクションボタン群（写真追加 / 選択してDL / 全件一括DL） */}
                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => openUploadModal("existing")}
                        className="h-11 px-3 rounded-xl bg-primary text-primary-foreground font-black text-xs inline-flex items-center justify-center gap-1.5 shadow-xs hover:opacity-95 active:scale-98 transition-all cursor-pointer"
                      >
                        <Upload className="w-4 h-4 shrink-0" />
                        <span>写真を追加登録</span>
                      </button>

                      <button
                        type="button"
                        disabled={photos.length === 0}
                        onClick={() => openZipDownloadModal(photos)}
                        className="h-11 px-3 rounded-xl bg-[#0f172a] text-white font-black text-xs inline-flex items-center justify-center gap-1.5 shadow-xs hover:bg-slate-800 disabled:opacity-45 active:scale-98 transition-all cursor-pointer"
                      >
                        <Archive className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>全件一括DL ({photos.length}枚)</span>
                      </button>
                    </div>

                    {photos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsSelectMode((prev) => {
                            if (prev) {
                              setSelectedPhotoIds(new Set());
                            }
                            return !prev;
                          });
                        }}
                        className={`w-full h-10 px-3 rounded-xl border font-black text-xs inline-flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          isSelectMode
                            ? "border-primary bg-primary/12 text-primary"
                            : "border-border bg-muted/50 hover:bg-muted text-foreground"
                        }`}
                      >
                        <CheckSquare className="w-4 h-4 shrink-0" />
                        <span>
                          {isSelectMode
                            ? "選択モードを終了する"
                            : "写真を選択して一括ダウンロード（複数選択）"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* スティッキー選択操作バー（ボトムナビと干渉しない上部固定ソリッドバー） */}
                {isSelectMode && photos.length > 0 && (
                  <div className="sticky top-2 z-30 rounded-2xl border-2 border-primary bg-[#0f172a] text-slate-50 p-3 shadow-md space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-black tabular-nums">
                          {selectedPhotoIds.size} / {photos.length} 枚選択中
                        </span>
                        <button
                          type="button"
                          onClick={handleSelectAllPhotos}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-black text-slate-100 transition-colors"
                        >
                          {selectedPhotoIds.size === photos.length
                            ? "すべて解除"
                            : "すべて選択"}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsSelectMode(false);
                          setSelectedPhotoIds(new Set());
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-black text-slate-300"
                      >
                        閉じる
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={selectedPhotosList.length === 0}
                        onClick={() => openZipDownloadModal(selectedPhotosList)}
                        className="flex-1 h-10 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black text-xs inline-flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
                      >
                        <Download className="w-4 h-4 shrink-0" />
                        <span>
                          選択した {selectedPhotosList.length} 枚を一括ダウンロード (ZIP)
                        </span>
                      </button>

                      {selectedDeletableIds.length > 0 && !isDemo && (
                        <button
                          type="button"
                          disabled={isDeletingPhotos}
                          onClick={() =>
                            void handleDeleteSelectedPhotos(selectedDeletableIds)
                          }
                          className="h-10 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs inline-flex items-center justify-center gap-1 shrink-0 transition-all cursor-pointer"
                          aria-label="選択した写真を削除"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>削除</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 写真3列グリッド */}
                {photos.length === 0 ? (
                  <div className="space-y-3">
                    <EmptyState
                      icon={Images}
                      title="まだ写真が登録されていません"
                      description="NO PHOTOS IN ALBUM"
                    />
                    <button
                      type="button"
                      onClick={() => openUploadModal("existing")}
                      className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black text-sm inline-flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
                    >
                      <Upload className="w-4 h-4" />
                      <span>このアルバムに写真を一括追加する</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
                    {photos.map((photo, index) => {
                      const isSelected = selectedPhotoIds.has(photo.id);
                      return (
                        <div
                          key={photo.id}
                          className={`relative aspect-square rounded-xl overflow-hidden border bg-muted select-none transition-all ${
                            isSelected
                              ? "border-primary ring-2 ring-primary"
                              : "border-border"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (isSelectMode) {
                                toggleSelectPhoto(photo.id);
                              } else {
                                setLightboxIndex(index);
                              }
                            }}
                            className="w-full h-full block focus:outline-none cursor-pointer"
                          >
                            <img
                              src={photo.thumbUrl}
                              alt={photo.fileName}
                              loading="lazy"
                              decoding="async"
                              className={`w-full h-full object-cover transition-transform ${
                                isSelected ? "scale-95 rounded-lg" : ""
                              }`}
                            />
                          </button>

                          {/* 右上：選択チェックボタン（通常時も1タップで即選択モード開始可能） */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isSelectMode) {
                                setIsSelectMode(true);
                              }
                              toggleSelectPhoto(photo.id);
                            }}
                            aria-label={`${photo.fileName} を選択`}
                            className={`absolute top-1.5 right-1.5 w-7 h-7 rounded-lg border flex items-center justify-center shadow-xs transition-all cursor-pointer ${
                              isSelected
                                ? "bg-primary border-white text-primary-foreground"
                                : "bg-[#0f172a]/80 border-slate-500 text-white hover:bg-[#0f172a]"
                            }`}
                          >
                            {isSelected ? (
                              <Check className="w-4 h-4 stroke-[3]" />
                            ) : (
                              <Square className="w-3.5 h-3.5 opacity-85" />
                            )}
                          </button>

                          {/* 左下：元画質バッジ */}
                          {photo.hasOriginal && (
                            <span className="pointer-events-none absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#0f172a] text-teal-300 border border-teal-500/50 text-[9px] font-black leading-none">
                              RAW有
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : null}
          </>
        ) : (
          /* ==========================================
             📂 VIEW A: アルバム一覧・容量メーター画面
             ========================================== */
          <>
            <LiffPageHeader
              title="フォトギャラリー"
              subtitle="TEAM PHOTO GALLERY & BULK DOWNLOAD"
              icon={
                <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
                  <Camera className="w-4 h-4" />
                </span>
              }
              showBack
              shareData={{
                title: `【フォトギャラリー】${currentTeam?.orgName || currentTeam?.name || "チーム"} 写真アルバム`,
                text: "試合・練習写真の一覧確認や選択一括ダウンロードはこちらから行えます！",
              }}
            />

            {/* 試合詳細画面から ?matchId=... で遷移してきた場合のワンタップ作成バナー */}
            {matchIdParam && matchedCandidateForParam && (
              <div className="rounded-2xl border-2 border-primary bg-card shadow-xs overflow-hidden">
                <div className="px-4 py-2 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
                  <span className="text-xs font-black flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>試合連動アルバムの作成</span>
                  </span>
                  <span className="text-[11px] font-bold text-slate-300 tabular-nums">
                    {matchedCandidateForParam.date}
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs font-black text-foreground leading-relaxed">
                    「vs {matchedCandidateForParam.opponent}」のアルバムはまだ作成されていません。今すぐ作成して写真を一括登録できます！
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      openUploadModal("new", matchedCandidateForParam)
                    }
                    className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-black text-xs inline-flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all cursor-pointer"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>
                      「vs {matchedCandidateForParam.opponent}」の写真を追加する
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* A-3 ストレージ容量＆新規アルバム登録カード */}
            <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
                <span className="text-xs font-black flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                  <span>クラウド写真容量（自動軽量化エンジン搭載）</span>
                </span>
                <span className="text-[11px] font-black tabular-nums text-slate-200">
                  {formatFileBytes(storageUsage.webB + storageUsage.rawB)} / 10 GB
                </span>
              </div>

              <div className="p-4 space-y-3 bg-card">
                {/* 単色ソリッド2色積み上げバー（グラデーション不使用） */}
                <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden flex border border-border">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${Math.max(
                        storageUsage.webB > 0 ? 1.5 : 0,
                        storageUsage.webPct
                      )}%`,
                    }}
                  />
                  <div
                    className="h-full bg-teal-500 transition-all"
                    style={{
                      width: `${Math.max(
                        storageUsage.rawB > 0 ? 1.5 : 0,
                        storageUsage.rawPct
                      )}%`,
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] font-bold text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-primary inline-block" />
                      <span>
                        常設ギャラリー: {formatFileBytes(storageUsage.webB)}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-teal-500 inline-block" />
                      <span>
                        一時元画質(7日自動削除):{" "}
                        {formatFileBytes(storageUsage.rawB)}
                      </span>
                    </span>
                  </div>
                  <span className="tabular-nums font-black text-foreground">
                    全 {storage?.albumCount ?? albums.length} アルバム・
                    {storage?.photoCount ?? 0} 枚
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => openUploadModal("new", matchedCandidateForParam)}
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-black text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-xs hover:opacity-95 active:scale-98 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>新しいアルバム作成・写真を一括登録</span>
                </button>
              </div>
            </div>

            {/* カテゴリ絞り込み ＆ キーワード検索 */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-4 gap-1.5">
                {FILTER_CATEGORY_TABS.map((tab) => {
                  const active = categoryFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCategoryFilter(tab.id)}
                      className={`h-9 rounded-xl border text-xs font-black transition-all cursor-pointer ${
                        active
                          ? "bg-[#0f172a] text-white border-[#0f172a] shadow-xs"
                          : "bg-card text-muted-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="対戦相手・大会名・日付で検索..."
                  className="w-full h-10 pl-9 pr-9 rounded-xl border border-border bg-card text-xs font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    aria-label="検索クリア"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* アルバムカード一覧 */}
            {isLoadingList && albums.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-10 flex flex-col items-center justify-center gap-3 shadow-xs">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <p className="text-xs font-black text-muted-foreground">
                  ギャラリーを読み込み中...
                </p>
              </div>
            ) : filteredAlbums.length === 0 ? (
              <div className="space-y-3">
                <EmptyState
                  icon={Images}
                  title={
                    albums.length === 0
                      ? "まだアルバムがありません"
                      : "該当するアルバムがありません"
                  }
                  description="TEAM PHOTO GALLERY"
                />
                {albums.length === 0 && (
                  <button
                    type="button"
                    onClick={() => openUploadModal("new", null)}
                    className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black text-sm inline-flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>最初のアルバムを作成して写真を追加する</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAlbums.map((album) => (
                  <div
                    key={album.id}
                    className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
                  >
                    {/* A-3 ダークキャップ */}
                    <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black shrink-0">
                          {getCategoryBadgeLabel(album.category)}
                        </span>
                        <span className="text-xs font-black tabular-nums text-slate-200 shrink-0">
                          {album.albumDate}
                        </span>
                        {album.matchScoreLabel && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-black text-amber-300 tabular-nums truncate">
                            {album.matchScoreLabel}
                          </span>
                        )}
                      </div>

                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-black text-slate-100 tabular-nums shrink-0">
                        {album.photoCount} 枚
                      </span>
                    </div>

                    {/* カード本体 */}
                    <div className="p-3.5 space-y-3 bg-card">
                      <Link
                        href={`/liff/gallery?albumId=${encodeURIComponent(
                          album.id
                        )}`}
                        className="block space-y-2.5 group"
                      >
                        <div>
                          <h2 className="text-sm sm:text-base font-black text-foreground group-hover:text-primary transition-colors leading-snug">
                            {album.title}
                          </h2>
                          {album.matchTournamentName && (
                            <p className="text-[11px] font-bold text-muted-foreground mt-0.5 truncate">
                              {album.matchTournamentName}
                            </p>
                          )}
                        </div>

                        {/* 4枚サムネイルモザイク */}
                        {album.previewThumbUrls.length > 0 ? (
                          <div className="grid grid-cols-4 gap-1.5 rounded-xl overflow-hidden">
                            {album.previewThumbUrls.map((url, idx) => (
                              <div
                                key={`${album.id}-prev-${idx}`}
                                className="aspect-square bg-muted overflow-hidden rounded-lg border border-border"
                              >
                                <img
                                  src={url}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="h-20 rounded-xl border border-dashed border-border bg-muted/40 flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
                            <Images className="w-4 h-4" />
                            <span>写真未登録（タップして追加）</span>
                          </div>
                        )}
                      </Link>

                      {album.notes && (
                        <p className="text-[11px] font-bold text-muted-foreground line-clamp-2 leading-relaxed">
                          {album.notes}
                        </p>
                      )}

                      {album.activeRawPhotoCount > 0 && (
                        <div className="flex items-center gap-1.5 text-[11px] font-black text-teal-700 dark:text-teal-300">
                          <Package className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            元画質データあり（{album.activeRawPhotoCount}枚・
                            {formatRemainingExpiresLabel(
                              album.earliestRawExpiresAt
                            )}
                            ）
                          </span>
                        </div>
                      )}

                      {/* アクションフッター */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
                        <Link
                          href={`/liff/gallery?albumId=${encodeURIComponent(
                            album.id
                          )}`}
                          className="h-9 px-3 rounded-xl border border-border bg-muted/50 hover:bg-muted text-foreground font-black text-xs inline-flex items-center justify-center gap-1.5 transition-all active:scale-98"
                        >
                          <CheckSquare className="w-3.5 h-3.5 text-primary" />
                          <span>開く・選択してDL</span>
                        </Link>

                        <button
                          type="button"
                          disabled={album.photoCount === 0}
                          onClick={() => void handleQuickAlbumZipFromList(album)}
                          className="h-9 px-3 rounded-xl bg-[#0f172a] hover:bg-slate-800 disabled:opacity-40 text-white font-black text-xs inline-flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-amber-400" />
                          <span>全件ZIP一括DL</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ボトムナビ干渉防止用の必須スペーサー */}
        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

      {/* ==========================================
         🪟 PORTAL 1: フルスクリーン写真ビューア（Lightbox）
         ========================================== */}
      {mounted &&
        currentLightboxPhoto &&
        lightboxIndex !== null &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950 text-white flex flex-col select-none"
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              const start = touchStartRef.current;
              touchStartRef.current = null;
              const t = e.changedTouches[0];
              if (!start || !t) return;
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.4) {
                if (dx < 0 && lightboxIndex < photos.length - 1) {
                  setLightboxIndex(lightboxIndex + 1);
                } else if (dx > 0 && lightboxIndex > 0) {
                  setLightboxIndex(lightboxIndex - 1);
                }
              }
            }}
          >
            {/* 上部バー */}
            <div className="px-4 py-3 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-black text-white tabular-nums">
                  {lightboxIndex + 1} / {photos.length}
                </p>
                <p className="text-[10px] font-bold text-slate-400 truncate">
                  {currentLightboxPhoto.fileName}（登録:{" "}
                  {currentLightboxPhoto.uploadedByName}）
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (!isSelectMode) setIsSelectMode(true);
                    toggleSelectPhoto(currentLightboxPhoto.id);
                  }}
                  className={`h-9 px-3 rounded-xl border text-xs font-black inline-flex items-center gap-1.5 cursor-pointer ${
                    selectedPhotoIds.has(currentLightboxPhoto.id)
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-slate-800 border-slate-700 text-slate-200"
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {selectedPhotoIds.has(currentLightboxPhoto.id)
                      ? "選択中"
                      : "選択に追加"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setLightboxIndex(null)}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-white cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 中央画像エリア */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden p-2">
              <img
                src={currentLightboxPhoto.webUrl}
                alt={currentLightboxPhoto.fileName}
                className="max-w-full max-h-full object-contain"
              />

              {lightboxIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(lightboxIndex - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[#0f172a] border border-slate-700 text-white flex items-center justify-center shadow-md active:scale-95 cursor-pointer"
                  aria-label="前の写真"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              {lightboxIndex < photos.length - 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(lightboxIndex + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[#0f172a] border border-slate-700 text-white flex items-center justify-center shadow-md active:scale-95 cursor-pointer"
                  aria-label="次の写真"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* 下部アクションフッター（Safe Area 対応） */}
            <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] bg-[#0f172a] border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <a
                  href={`${currentLightboxPhoto.webUrl}?download=1&dlName=${encodeURIComponent(
                    currentLightboxPhoto.fileName
                  )}`}
                  download={currentLightboxPhoto.fileName}
                  className="h-10 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-black inline-flex items-center justify-center gap-1.5 shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    保存（{formatFileBytes(currentLightboxPhoto.webBytes)}）
                  </span>
                </a>

                {currentLightboxPhoto.hasOriginal &&
                  currentLightboxPhoto.originalUrl && (
                    <a
                      href={`${currentLightboxPhoto.originalUrl}?download=1&dlName=${encodeURIComponent(
                        `RAW_${currentLightboxPhoto.fileName}`
                      )}`}
                      download={`RAW_${currentLightboxPhoto.fileName}`}
                      className="h-10 px-3 rounded-xl bg-teal-600 text-white text-xs font-black inline-flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <Package className="w-4 h-4" />
                      <span>
                        元画質（
                        {formatFileBytes(currentLightboxPhoto.originalBytes)}）
                      </span>
                    </a>
                  )}
              </div>

              {currentLightboxPhoto.canDelete && !isDemo && (
                <button
                  type="button"
                  disabled={isDeletingPhotos}
                  onClick={() =>
                    void handleDeleteSelectedPhotos([currentLightboxPhoto.id])
                  }
                  className="h-10 px-3 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 text-xs font-black inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>削除</span>
                </button>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* ==========================================
         🪟 PORTAL 2: アルバム作成 ＆ 写真一括アップロードモーダル
         ========================================== */}
      {mounted &&
        isUploadModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-950/75 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-lg max-h-[89dvh] rounded-t-3xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col">
              {/* A-3 ダークキャップ */}
              <div className="px-4 py-3.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Upload className="w-4 h-4 text-sky-400 shrink-0" />
                  <h2 className="text-sm font-black text-white truncate">
                    {uploadTargetMode === "new"
                      ? "新規アルバム作成・写真一括アップロード"
                      : `「${activeAlbum?.title || ""}」へ写真を追加`}
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => setIsUploadModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* スクロールコンテンツ */}
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {uploadTargetMode === "new" && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-black text-foreground block">
                        試合データとの紐付け（任意）
                      </label>
                      <LiffSelect
                        value={formMatchId}
                        onChange={handleMatchSelectInUploadForm}
                        options={matchSelectOptions}
                        title="紐付ける試合を選択"
                        subtitle="選択すると日付と対戦相手名が自動入力されます"
                        placeholder="試合を選択（または単体アルバム）"
                        searchable
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-black text-foreground block">
                          アルバム名 <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder="例: vs 〇〇チーム / 夏季合宿"
                          className="w-full h-10 px-3 rounded-xl border border-border bg-card text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-black text-foreground block">
                            日付
                          </label>
                          <input
                            type="date"
                            value={formDate}
                            onChange={(e) => setFormDate(e.target.value)}
                            className="w-full h-10 px-2.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-black text-foreground block">
                            区分
                          </label>
                          <LiffSelect
                            value={formCategory}
                            onChange={setFormCategory}
                            options={ALBUM_CATEGORY_OPTIONS}
                            title="アルバム区分"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-black text-foreground block">
                        一言メモ（任意）
                      </label>
                      <input
                        type="text"
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        placeholder="例: 公式サイト掲載用・カメラマン撮影分"
                        className="w-full h-10 px-3 rounded-xl border border-border bg-card text-xs font-bold text-foreground"
                      />
                    </div>
                  </div>
                )}

                {/* 写真複数選択エリア */}
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFilesSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-5 px-4 rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10 text-foreground flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Images className="w-7 h-7 text-primary" />
                    <span className="text-xs sm:text-sm font-black text-primary">
                      スマホ・PCから写真をまとめて選択（何百枚でもOK）
                    </span>
                    <span className="text-[11px] font-bold text-muted-foreground">
                      端末内で長辺2048pxへ自動最適化し、容量と通信量を約97%節約します
                    </span>
                  </button>

                  {pendingFiles.length > 0 && (
                    <div className="rounded-xl border border-border bg-muted/50 p-3 flex items-center justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-xs font-black text-foreground">
                          選択中: {pendingFiles.length} 枚（元容量{" "}
                          {formatFileBytes(pendingFilesRawBytes)}）
                        </p>
                        <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                          ➔ 自動最適化後 目安: 約{" "}
                          {formatFileBytes(estimatedOptimizedBytes)}
                        </p>
                      </div>
                      {!isUploading && (
                        <button
                          type="button"
                          onClick={() => setPendingFiles([])}
                          className="px-2.5 py-1 rounded-lg border border-border bg-card text-[11px] font-black text-muted-foreground hover:text-foreground shrink-0"
                        >
                          クリア
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* オプション：7日間限定の無圧縮オリジナル共有モード */}
                <div className="rounded-2xl border border-border bg-muted/35 p-3.5 space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keepOriginal}
                      disabled={isUploading}
                      onChange={(e) => setKeepOriginal(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-teal-600 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-foreground flex items-center gap-1.5 flex-wrap">
                        <span>元画質（無圧縮オリジナル）も7日間だけ共有する</span>
                        <span className="px-1.5 py-0.5 rounded bg-teal-600 text-white text-[9px] font-black">
                          印刷受け渡し用
                        </span>
                      </p>
                      <p className="text-[11px] font-bold text-muted-foreground mt-1 leading-relaxed">
                        通常の公式サイト掲載・SNS・スマホ保存ならOFF（標準高画質2048px）で十分綺麗です。横断幕や卒団アルバム印刷など元データ受け渡しが必要な場合のみONにしてください（7日後に元データのみ自動削除され容量を圧迫しません）。
                      </p>
                    </div>
                  </label>
                </div>

                {/* アップロード進捗バー */}
                {isUploading && uploadProgress && (
                  <div className="rounded-2xl border-2 border-primary bg-[#0f172a] text-white p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-black">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                        <span>最適化＆アップロード中...</span>
                      </span>
                      <span className="tabular-nums">
                        {uploadProgress.completed} / {uploadProgress.total} 枚
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${Math.round(
                            (uploadProgress.completed /
                              Math.max(1, uploadProgress.total)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-300">
                      <span className="truncate max-w-[60%]">
                        {uploadProgress.currentFileName}
                      </span>
                      <span className="tabular-nums">
                        {formatFileBytes(uploadProgress.originalInputBytes)} ➔{" "}
                        {formatFileBytes(uploadProgress.savedWebBytes)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* モーダルフッター（Safe Area 対応） */}
              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center gap-2 shrink-0">
                {isUploading ? (
                  <button
                    type="button"
                    onClick={() => uploadAbortRef.current?.abort()}
                    className="w-full h-11 rounded-xl bg-rose-600 text-white font-black text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>アップロードを中断する</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsUploadModalOpen(false)}
                      className="h-11 px-4 rounded-xl border border-border bg-muted text-foreground font-black text-xs shrink-0 cursor-pointer"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExecuteUpload()}
                      className="flex-1 h-11 px-4 rounded-xl bg-primary text-primary-foreground font-black text-xs inline-flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition-all cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>
                        {pendingFiles.length > 0
                          ? `${pendingFiles.length}枚の写真を一括登録する`
                          : "空のアルバムを作成する"}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ==========================================
         🪟 PORTAL 3: 一括ZIPダウンロードモーダル
         ========================================== */}
      {mounted &&
        zipTargetPhotos &&
        createPortal(
          <div className="fixed inset-0 z-[10005] bg-slate-950/75 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-md max-h-[88dvh] rounded-t-3xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Archive className="w-4 h-4 text-amber-400 shrink-0" />
                  <h2 className="text-sm font-black text-white truncate">
                    写真を一括ダウンロード（{zipTargetPhotos.length}枚・ZIP）
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeZipModal}
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
                {!builtArchive && !isBuildingZip && (
                  <>
                    <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                      選択した{" "}
                      <span className="font-black text-foreground">
                        {zipTargetPhotos.length}枚
                      </span>{" "}
                      の写真を連番ファイル名付きの1つのZIPファイルにまとめて一括取得します。
                    </p>

                    <div className="space-y-2.5">
                      <button
                        type="button"
                        onClick={() => void handleStartBuildZip("web")}
                        className="w-full p-3.5 rounded-2xl border-2 border-primary bg-primary/5 hover:bg-primary/10 text-left space-y-1 transition-all active:scale-99 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs sm:text-sm font-black text-primary flex items-center gap-1.5">
                            <Download className="w-4 h-4 shrink-0" />
                            <span>標準高画質で一括ダウンロード</span>
                          </span>
                          <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black tabular-nums">
                            約 {formatFileBytes(zipStats.webTotal)}
                          </span>
                        </div>
                        <p className="text-[11px] font-bold text-muted-foreground">
                          公式サイト掲載・ブログ・SNS・スマホ保存に最適（長辺2048px・数秒で高速完了）
                        </p>
                      </button>

                      {zipStats.rawAvailableCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleStartBuildZip("original")}
                          className="w-full p-3.5 rounded-2xl border border-teal-600/40 bg-teal-500/8 hover:bg-teal-500/15 text-left space-y-1 transition-all active:scale-99 cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs sm:text-sm font-black text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                              <Package className="w-4 h-4 shrink-0" />
                              <span>元画質オリジナルで一括ダウンロード</span>
                            </span>
                            <span className="px-2 py-0.5 rounded bg-teal-600 text-white text-[10px] font-black tabular-nums">
                              約 {formatFileBytes(zipStats.rawTotal)}
                            </span>
                          </div>
                          <p className="text-[11px] font-bold text-muted-foreground">
                            大判ポスター・パンフレット印刷用（Wi-Fi環境・PCでの取得を推奨）
                          </p>
                        </button>
                      )}
                    </div>
                  </>
                )}

                {isBuildingZip && (
                  <div className="rounded-2xl border border-border bg-[#0f172a] text-white p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs font-black">
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                        <span>
                          {zipProgress?.phase === "packaging"
                            ? "ZIPアーカイブを生成中..."
                            : "写真データを高速取得中..."}
                        </span>
                      </span>
                      <span className="tabular-nums">
                        {zipProgress?.completed ?? 0} /{" "}
                        {zipProgress?.total ?? zipTargetPhotos.length} 枚
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{
                          width: `${Math.round(
                            ((zipProgress?.completed ?? 0) /
                              Math.max(1, zipTargetPhotos.length)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="text-[11px] font-bold text-slate-300">
                      画面を閉じずにそのままお待ちください（再圧縮なしの高速STORE方式で結合しています）
                    </p>
                  </div>
                )}

                {builtArchive && !isBuildingZip && (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 space-y-1">
                      <p className="text-xs font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>ZIPファイルの準備が完了しました！</span>
                      </p>
                      <p className="text-[11px] font-bold text-muted-foreground break-all">
                        {builtArchive.zipFileName}（
                        {formatFileBytes(builtArchive.totalBytes)}）
                      </p>
                    </div>

                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() =>
                          triggerAnchorBlobDownload(
                            builtArchive.zipBlob,
                            builtArchive.zipFileName
                          )
                        }
                        className="w-full h-11 px-4 rounded-xl bg-primary text-primary-foreground font-black text-xs inline-flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>ZIPファイルを端末にダウンロード保存</span>
                      </button>

                      {canShareZipFile(builtArchive) && (
                        <button
                          type="button"
                          onClick={() => {
                            void shareBuiltZipFile(builtArchive).catch(() => {});
                          }}
                          className="w-full h-11 px-4 rounded-xl bg-[#0f172a] text-white font-black text-xs inline-flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                        >
                          <Share2 className="w-4 h-4 text-sky-400" />
                          <span>
                            「ファイル」に保存 / AirDrop・Driveへ共有（スマホ推奨）
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={closeZipModal}
                  className="w-full h-10 rounded-xl border border-border bg-muted text-foreground font-black text-xs cursor-pointer"
                >
                  {isBuildingZip ? "キャンセル" : "閉じる"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ==========================================
         🪟 PORTAL 4: アルバム情報編集・削除モーダル
         ========================================== */}
      {mounted &&
        isEditAlbumModalOpen &&
        activeAlbum &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-950/75 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-md max-h-[88dvh] rounded-t-3xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-slate-500 flex items-center justify-between gap-3 shrink-0">
                <h2 className="text-sm font-black text-white">
                  アルバム情報の編集・管理
                </h2>
                <button
                  type="button"
                  onClick={() => setIsEditAlbumModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto flex-1">
                <div className="space-y-1">
                  <label className="text-xs font-black text-foreground block">
                    アルバム名
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-card text-xs font-bold text-foreground"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-black text-foreground block">
                      日付
                    </label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full h-10 px-2.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black text-foreground block">
                      区分
                    </label>
                    <LiffSelect
                      value={editCategory}
                      onChange={setEditCategory}
                      options={ALBUM_CATEGORY_OPTIONS}
                      title="アルバム区分"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-foreground block">
                    紐付ける試合
                  </label>
                  <LiffSelect
                    value={editMatchId}
                    onChange={setEditMatchId}
                    options={matchSelectOptions}
                    title="紐付ける試合を選択"
                    searchable
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-foreground block">
                    一言メモ
                  </label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-card text-xs font-bold text-foreground"
                  />
                </div>

                <div className="pt-3 border-t border-border">
                  <button
                    type="button"
                    disabled={isDeletingAlbum}
                    onClick={() => void handleDeleteEntireAlbum()}
                    className="w-full h-10 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-black text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>
                      {isDeletingAlbum
                        ? "削除中..."
                        : "このアルバムと全写真を完全に削除する"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditAlbumModalOpen(false)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground font-black text-xs cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSavingAlbumEdit}
                  onClick={() => void handleSaveAlbumEdit()}
                  className="flex-1 h-10 px-4 rounded-xl bg-primary text-primary-foreground font-black text-xs cursor-pointer"
                >
                  {isSavingAlbumEdit ? "保存中..." : "変更を保存する"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default function LiffGalleryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1">
          <LiffHeader />
          <div className="p-4">
            <div className="rounded-2xl border border-border bg-card p-10 flex flex-col items-center justify-center gap-3 shadow-xs">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
              <p className="text-xs font-black text-muted-foreground">
                フォトギャラリーを起動中...
              </p>
            </div>
          </div>
        </div>
      }
    >
      <LiffGalleryContent />
    </Suspense>
  );
}

