// filepath: src/components/common/QrCodeSvg.tsx
"use client";

import React, { useMemo } from "react";
import QRCode, { type QRCodeErrorCorrectionLevel } from "qrcode";
import { cn } from "@/lib/utils";

export interface QrSvgRenderData {
  viewBoxSize: number;
  moduleSize: number;
  darkPath: string;
}

/**
 * 外部API通信を一切行わず、ISO/IEC 18004 準拠の2次元コードSVGパスを同期生成する。
 * 連続する黒セルを横方向ランレングス結合し、単一 `<path>` で高速・鮮明に描画する。
 */
export function buildQrSvgData(
  value: string,
  options?: {
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    marginModules?: number;
  }
): QrSvgRenderData | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const qr = QRCode.create(trimmed, {
      errorCorrectionLevel: options?.errorCorrectionLevel ?? "M",
    });
    const size = qr.modules.size;
    const data = qr.modules.data;
    const margin = Math.max(0, options?.marginModules ?? 2);
    const viewBoxSize = size + margin * 2;

    const segments: string[] = [];
    for (let row = 0; row < size; row++) {
      let col = 0;
      while (col < size) {
        if (data[row * size + col]) {
          const startCol = col;
          while (col < size && data[row * size + col]) {
            col++;
          }
          const runLen = col - startCol;
          const x = startCol + margin;
          const y = row + margin;
          segments.push(`M${x} ${y}h${runLen}v1h-${runLen}z`);
        } else {
          col++;
        }
      }
    }

    return {
      viewBoxSize,
      moduleSize: size,
      darkPath: segments.join(""),
    };
  } catch {
    return null;
  }
}

export interface QrCodeSvgProps {
  value: string;
  size?: number;
  alt: string;
  errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
  marginModules?: number;
  className?: string;
}

export function QrCodeSvg({
  value,
  size = 164,
  alt,
  errorCorrectionLevel = "M",
  marginModules = 2,
  className,
}: QrCodeSvgProps) {
  const qrData = useMemo(
    () =>
      buildQrSvgData(value, {
        errorCorrectionLevel,
        marginModules,
      }),
    [value, errorCorrectionLevel, marginModules]
  );

  if (!qrData) {
    return (
      <p className="text-[11px] font-bold text-slate-600 px-2 break-all text-center">
        {value}
      </p>
    );
  }

  return (
    <svg
      role="img"
      aria-label={alt}
      width={size}
      height={size}
      viewBox={`0 0 ${qrData.viewBoxSize} ${qrData.viewBoxSize}`}
      shapeRendering="crispEdges"
      className={cn("block select-none shrink-0", className)}
    >
      <title>{alt}</title>
      <rect
        x={0}
        y={0}
        width={qrData.viewBoxSize}
        height={qrData.viewBoxSize}
        fill="#ffffff"
      />
      <path d={qrData.darkPath} fill="#000000" />
    </svg>
  );
}
