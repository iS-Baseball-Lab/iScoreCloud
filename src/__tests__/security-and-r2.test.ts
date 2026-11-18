// filepath: src/__tests__/security-and-r2.test.ts
import { describe, expect, it } from "vitest";
import { deleteR2UrlsSafely, extractR2KeyFromAppUrl } from "@/lib/r2-cleanup";
import { sanitizeSafeExternalHref, validateSafeHttpUrl } from "@/lib/utils";

describe("R2 orphan cleanup & URL XSS security helpers", () => {
  it("extracts valid R2 keys from internal app endpoints while blocking traversal & external URLs", () => {
    expect(
      extractR2KeyFromAppUrl("/api/documents/files/team1/2026/guide.pdf")
    ).toBe("documents/team1/2026/guide.pdf");

    expect(
      extractR2KeyFromAppUrl("/api/images/rules/team1/helmet.webp?v=2")
    ).toBe("rules/team1/helmet.webp");

    expect(
      extractR2KeyFromAppUrl("/api/images/players/action/p1.jpg#top")
    ).toBe("players/action/p1.jpg");

    // Path traversal & external URLs must be rejected
    expect(
      extractR2KeyFromAppUrl("/api/documents/files/../../secret.txt")
    ).toBeNull();
    expect(extractR2KeyFromAppUrl("/api/images/..\\evil.png")).toBeNull();
    expect(
      extractR2KeyFromAppUrl("https://example.com/api/images/logo.png")
    ).toBeNull();
    expect(extractR2KeyFromAppUrl("/player-bg-pitcher.webp")).toBeNull();
    expect(extractR2KeyFromAppUrl(null)).toBeNull();
  });

  it("deduplicates keys and deletes safely from R2 bucket mock", async () => {
    const deletedBatches: Array<string | string[]> = [];
    const mockBucket = {
      delete: async (keys: string | string[]) => {
        deletedBatches.push(keys);
      },
    } as unknown as R2Bucket;

    const count = await deleteR2UrlsSafely(mockBucket, [
      "/api/images/links/t1/a.png",
      "/api/images/links/t1/a.png",
      "/api/documents/files/t1/doc.pdf",
      "https://youtube.com/watch?v=123",
      null,
    ]);

    expect(count).toBe(2);
    expect(deletedBatches).toEqual([
      ["links/t1/a.png", "documents/t1/doc.pdf"],
    ]);
  });

  it("blocks javascript:/data: XSS schemes while allowing clean http/https URLs", () => {
    expect(validateSafeHttpUrl("javascript:alert(1)").ok).toBe(false);
    expect(
      validateSafeHttpUrl("data:text/html,<script>alert(1)</script>").ok
    ).toBe(false);
    expect(validateSafeHttpUrl("vbscript:msgbox(1)").ok).toBe(false);

    const good = validateSafeHttpUrl("https://maps.google.com/?q=baseball");
    expect(good.ok).toBe(true);

    expect(sanitizeSafeExternalHref("javascript:alert(1)")).toBe("#");
    expect(sanitizeSafeExternalHref("https://line.me/R/")).toBe(
      "https://line.me/R/"
    );
  });
});
