// filepath: src/__tests__/security-and-r2.test.ts
import { describe, expect, it } from "vitest";
import { deleteR2UrlsSafely, extractR2KeyFromAppUrl } from "@/lib/r2-cleanup";
import {
  buildInternalR2EdgeCacheUrl,
  matchesIfNoneMatch,
  serveR2WithEdgeCache,
} from "@/lib/r2-edge-cache";
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

  it("handles ETag If-None-Match (strong/weak/comma-separated) and 304 Not Modified with private Cache-Control", async () => {
    expect(matchesIfNoneMatch('"abc123"', '"abc123"')).toBe(true);
    expect(matchesIfNoneMatch('W/"abc123"', '"abc123"')).toBe(true);
    expect(matchesIfNoneMatch('"other", "abc123"', '"abc123"')).toBe(true);
    expect(matchesIfNoneMatch('"different"', '"abc123"')).toBe(false);
    expect(buildInternalR2EdgeCacheUrl("players/p1.webp")).toBe(
      "https://r2-edge-cache.iscorecloud.internal/players/p1.webp"
    );

    const mockBucket = {
      get: async () => ({
        httpEtag: '"etag-v1"',
        size: 4,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3, 4]));
            controller.close();
          },
        }),
        writeHttpMetadata(h: Headers) {
          h.set("content-type", "image/webp");
        },
      }),
    } as unknown as R2Bucket;

    const notModifiedRes = await serveR2WithEdgeCache({
      bucket: mockBucket,
      r2Key: "players/p1.webp",
      requestHeaders: new Headers({ "if-none-match": '"etag-v1"' }),
      edgeTtlSeconds: 0,
      buildResponseHeaders: ({ httpEtag }) =>
        new Headers({
          ETag: httpEtag,
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=86400",
        }),
    });

    expect(notModifiedRes?.status).toBe(304);
    expect(notModifiedRes?.headers.get("Cache-Control")).toBe(
      "private, max-age=86400"
    );
  });
});
