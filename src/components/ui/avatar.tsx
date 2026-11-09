// filepath: src/components/ui/avatar.tsx
"use client"

import * as React from "react"

import { LIFF_WEBVIEW_RESUMED_EVENT } from "@/lib/liff/runtime-recovery"
import { cn } from "@/lib/utils"

export type AvatarImageLoadingStatus = "idle" | "loading" | "loaded" | "error"

interface AvatarContextValue {
  status: AvatarImageLoadingStatus
  setStatus: (next: AvatarImageLoadingStatus) => void
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null)

/**
 * 🛡️ WebView 耐障害型 Avatar
 * - iOS `WKWebView`（LINE内ブラウザ）で GPU テクスチャ破棄・透明消失の原因となる `mix-blend-darken` 擬似要素を廃止。
 * - Radix の分離 `new window.Image()` 方式では WebView サスペンド復帰後や期限切れ LINE CDN URL 時に
 *   `loaded` ステートが固着して空の円になる不具合があるため、実 DOM `<img>` の `onLoad` / `onError` 直結管理に統一。
 */
function Avatar({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<"span"> & {
  size?: "default" | "sm" | "lg"
}) {
  const [status, setStatus] = React.useState<AvatarImageLoadingStatus>("idle")

  const contextValue = React.useMemo<AvatarContextValue>(
    () => ({ status, setStatus }),
    [status]
  )

  return (
    <AvatarContext.Provider value={contextValue}>
      <span
        data-slot="avatar"
        data-size={size}
        className={cn(
          "group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none data-[size=lg]:size-10 data-[size=sm]:size-6",
          className
        )}
        {...props}
      >
        {children}
      </span>
    </AvatarContext.Provider>
  )
}

function AvatarImage({
  className,
  src,
  alt = "",
  onLoad,
  onError,
  onLoadingStatusChange,
  ...props
}: React.ComponentProps<"img"> & {
  onLoadingStatusChange?: (status: AvatarImageLoadingStatus) => void
}) {
  const ctx = React.useContext(AvatarContext)
  const imgRef = React.useRef<HTMLImageElement | null>(null)
  const [retryCount, setRetryCount] = React.useState(0)

  const normalizedSrc = typeof src === "string" ? src.trim() : ""

  const updateStatus = React.useCallback(
    (next: AvatarImageLoadingStatus) => {
      ctx?.setStatus(next)
      onLoadingStatusChange?.(next)
    },
    [ctx, onLoadingStatusChange]
  )

  // src 変更またはマウント時：キャッシュ済み画像は 1 フレーム目（0ms）で同期的に `loaded` 判定する
  React.useLayoutEffect(() => {
    if (!normalizedSrc) {
      updateStatus("idle")
      return
    }
    const imgEl = imgRef.current
    if (imgEl && imgEl.complete) {
      if (imgEl.naturalWidth > 0) {
        updateStatus("loaded")
      } else {
        updateStatus("error")
      }
    } else {
      updateStatus("loading")
    }
  }, [normalizedSrc, retryCount, updateStatus])

  // アンマウント時は親 Avatar を `idle` に戻し、Fallback が確実に表示されるようにする
  React.useEffect(() => {
    return () => {
      ctx?.setStatus("idle")
    }
  }, [ctx])

  // 一時的な電波瞬断や WebView サスペンドで画像読込が失敗していた場合、復帰時に最大2回まで自動再試行する
  React.useEffect(() => {
    if (!normalizedSrc || ctx?.status !== "error" || retryCount >= 2) return

    const handleResume = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return
      setRetryCount((prev) => (prev < 2 ? prev + 1 : prev))
    }

    window.addEventListener(LIFF_WEBVIEW_RESUMED_EVENT, handleResume)
    return () => {
      window.removeEventListener(LIFF_WEBVIEW_RESUMED_EVENT, handleResume)
    }
  }, [ctx?.status, normalizedSrc, retryCount])

  if (!normalizedSrc) {
    return null
  }

  const isLoaded = ctx ? ctx.status === "loaded" : true
  const isErrored = ctx?.status === "error"

  if (isErrored) {
    return null
  }

  return (
    <img
      key={`${normalizedSrc}::${retryCount}`}
      ref={imgRef}
      data-slot="avatar-image"
      src={normalizedSrc}
      alt={alt}
      decoding="async"
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth > 0) {
          updateStatus("loaded")
        } else {
          updateStatus("error")
        }
        onLoad?.(e)
      }}
      onError={(e) => {
        updateStatus("error")
        onError?.(e)
      }}
      className={cn(
        "aspect-square size-full rounded-full object-cover",
        !isLoaded && "opacity-0 pointer-events-none absolute inset-0",
        className
      )}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  delayMs,
  ...props
}: React.ComponentProps<"span"> & {
  delayMs?: number
}) {
  const ctx = React.useContext(AvatarContext)
  const [canRender, setCanRender] = React.useState(() => !delayMs)

  React.useEffect(() => {
    if (!delayMs) {
      setCanRender(true)
      return
    }
    const timer = setTimeout(() => setCanRender(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])

  if (ctx?.status === "loaded" || !canRender) {
    return null
  }

  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
        className
      )}
      {...props}
    />
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
