// filepath: src/__tests__/qr-code-svg.test.ts
import { describe, expect, it } from "vitest";
import { buildQrSvgData } from "@/components/common/QrCodeSvg";

describe("buildQrSvgData (local QR SVG encoder)", () => {
  it("generates a deterministic non-empty SVG path for LIFF launch URLs without network I/O", () => {
    const res = buildQrSvgData("https://miniapp.line.me/2000000000-abcdefgh?join=TEAM123", {
      errorCorrectionLevel: "M",
      marginModules: 2,
    });
    expect(res).not.toBeNull();
    expect(res!.moduleSize).toBeGreaterThanOrEqual(21);
    expect(res!.viewBoxSize).toBe(res!.moduleSize + 4);
    // Top-left finder pattern outer bar (7 modules wide at row=margin, col=margin)
    expect(res!.darkPath.startsWith("M2 2h7v1h-7z")).toBe(true);
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(buildQrSvgData("")).toBeNull();
    expect(buildQrSvgData("   ")).toBeNull();
  });
});
