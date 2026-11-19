// filepath: src/__tests__/runtime-recovery.test.ts
import { describe, expect, it } from "vitest";
import { isDeploySkewOrChunkError } from "@/lib/liff/runtime-recovery";

describe("runtime-recovery deploy skew detection", () => {
  it("detects ChunkLoadError and dynamic import failures", () => {
    expect(
      isDeploySkewOrChunkError(
        new Error("ChunkLoadError: Loading chunk 7635 failed.")
      )
    ).toBe(true);
    expect(
      isDeploySkewOrChunkError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://iscorecloud.com/_next/static/chunks/app/liff/related-teams/page-abc.js"
        )
      )
    ).toBe(true);
    expect(
      isDeploySkewOrChunkError(
        new TypeError("Importing a module script failed.")
      )
    ).toBe(true);
  });

  it("detects V8 and JavaScriptCore Webpack cross-build module factory skew errors", () => {
    const v8SkewErr = new TypeError(
      "Cannot read properties of undefined (reading 'call')"
    );
    v8SkewErr.stack =
      "TypeError: Cannot read properties of undefined (reading 'call')\n    at r (https://iscorecloud.com/_next/static/chunks/webpack-f4fb90cd98aa6b2c.js:1:128)";
    expect(isDeploySkewOrChunkError(v8SkewErr)).toBe(true);

    const jscSkewErr = new TypeError(
      "undefined is not an object (evaluating 'r[e].call')"
    );
    expect(isDeploySkewOrChunkError(jscSkewErr)).toBe(true);
  });

  it("does not misclassify ordinary application errors as deploy skew", () => {
    expect(
      isDeploySkewOrChunkError(new Error("チーム名を入力してください"))
    ).toBe(false);
    expect(
      isDeploySkewOrChunkError(
        new TypeError("Cannot read properties of undefined (reading 'trim')")
      )
    ).toBe(false);
    expect(isDeploySkewOrChunkError(null)).toBe(false);
  });
});
