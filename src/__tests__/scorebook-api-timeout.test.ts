// filepath: src/__tests__/scorebook-api-timeout.test.ts
import { describe, expect, it } from "vitest";
import {
  computeThinkingWatchdogPlan,
  getGeminiModelConfigs,
} from "@/api/liff/scorebook";
import {
  isReadOnlyAiMutationUrl,
  isScorebookVisionAiUrl,
  normalizeClientFetchErrorMessage,
  resolveMutationTimeoutMs,
} from "@/lib/liff/api-cache";

describe("scorebook AI & upload mutation timeout protection", () => {
  it("assigns 95s timeout (>= 72s server budget) to all scorebook vision AI endpoints", () => {
    const aiUrls = [
      "/api/liff/scorebook/analyze-structure",
      "/api/liff/scorebook/analyze-inning-chunk",
      "/api/liff/scorebook/reconcile-missing-atbats",
      "/api/liff/scorebook/reconcile-inning-outs",
      "/api/liff/scorebook/extract-symbol-rules",
      "/api/matches/match-123/scorebook",
    ];

    for (const url of aiUrls) {
      expect(isScorebookVisionAiUrl(url)).toBe(true);
      expect(resolveMutationTimeoutMs(url, { method: "POST", body: "{}" })).toBe(
        95_000
      );
    }
  });

  it("keeps 65s timeout for web-search AI discovery/lookup endpoints", () => {
    expect(
      resolveMutationTimeoutMs("/api/liff/related-teams/ai-discover", {
        method: "POST",
        body: "{}",
      })
    ).toBe(65_000);
    expect(
      resolveMutationTimeoutMs("/api/liff/grounds/ai-lookup", {
        method: "POST",
        body: "{}",
      })
    ).toBe(65_000);
  });

  it("assigns 60s upload timeout to scorebook Base64 JSON saves, legend uploads, and >=200KB JSON payloads", () => {
    expect(
      resolveMutationTimeoutMs("/api/liff/scorebook/save", {
        method: "POST",
        body: "{}",
      })
    ).toBe(60_000);
    expect(
      resolveMutationTimeoutMs("/api/liff/scorebook/legend", {
        method: "POST",
        body: "{}",
      })
    ).toBe(60_000);
    expect(
      resolveMutationTimeoutMs("/api/liff/documents", {
        method: "POST",
        body: "x".repeat(210_000),
      })
    ).toBe(60_000);
  });

  it("keeps 22s timeout for ordinary lightweight JSON mutations", () => {
    expect(
      resolveMutationTimeoutMs("/api/liff/scorebook/create-match", {
        method: "POST",
        body: JSON.stringify({ opponent: "〇〇クラブ" }),
      })
    ).toBe(22_000);
    expect(
      resolveMutationTimeoutMs("/api/liff/scorebook/symbol-rules", {
        method: "POST",
        body: "{}",
      })
    ).toBe(22_000);
  });

  it("marks pure AI scan endpoints as read-only while keeping DB-mutating endpoints cache-invalidating", () => {
    expect(isReadOnlyAiMutationUrl("/api/liff/scorebook/analyze-structure")).toBe(
      true
    );
    expect(
      isReadOnlyAiMutationUrl("/api/liff/scorebook/analyze-inning-chunk")
    ).toBe(true);
    expect(
      isReadOnlyAiMutationUrl("/api/liff/scorebook/reconcile-missing-atbats")
    ).toBe(true);
    expect(
      isReadOnlyAiMutationUrl("/api/liff/scorebook/reconcile-inning-outs")
    ).toBe(true);
    expect(isReadOnlyAiMutationUrl("/api/liff/related-teams/ai-discover")).toBe(
      true
    );

    // DB書き込みを伴うエンドポイントは必ずキャッシュ破棄対象（false）
    expect(
      isReadOnlyAiMutationUrl("/api/liff/scorebook/extract-symbol-rules")
    ).toBe(false);
    expect(isReadOnlyAiMutationUrl("/api/liff/scorebook/save")).toBe(false);
    expect(isReadOnlyAiMutationUrl("/api/liff/scorebook/legend")).toBe(false);
    expect(isReadOnlyAiMutationUrl("/api/liff/scorebook/create-match")).toBe(
      false
    );
  });

  it("normalizes browser 'signal is aborted without reason' and raw network errors into clear Japanese", () => {
    expect(
      normalizeClientFetchErrorMessage(
        new Error("signal is aborted without reason")
      )
    ).toContain("通信が中断またはタイムアウトしました");

    expect(
      normalizeClientFetchErrorMessage(new Error("The operation was aborted."))
    ).toContain("通信が中断またはタイムアウトしました");

    expect(
      normalizeClientFetchErrorMessage(new Error("Failed to fetch"))
    ).toContain("ネットワーク通信が途切れました");

    const explicitErr = new Error(
      "AI画像解析の待機時間上限（95秒）に達しました。電波状況をご確認のうえ、もう一度ボタンを押してください"
    );
    expect(normalizeClientFetchErrorMessage(explicitErr)).toBe(
      explicitErr.message
    );
  });

  it("strictly enforces firstTextTimeoutMs ceiling without infinite +6s extension when thought chunks stream", () => {
    // 開始5秒時点: アイドル上限15秒で監視
    const early = computeThinkingWatchdogPlan(5_000, 24_000, 15_000);
    expect(early.expired).toBe(false);
    expect(early.nextWaitMs).toBe(15_000);
    expect(early.reason).toBe("思考ストリーム無応答");

    // 開始20秒時点: 残り4秒をそのまま上限としてセット（6秒に水増ししない）
    const nearEnd = computeThinkingWatchdogPlan(20_000, 24_000, 15_000);
    expect(nearEnd.expired).toBe(false);
    expect(nearEnd.nextWaitMs).toBe(4_000);
    expect(nearEnd.reason).toBe("思考フェーズ上限到達");

    // 24秒到達・超過時点: 即座に expired: true となり次順位モデルへフェイルオーバーさせる
    const atLimit = computeThinkingWatchdogPlan(24_000, 24_000, 15_000);
    expect(atLimit.expired).toBe(true);
    expect(atLimit.nextWaitMs).toBe(0);

    const pastLimit = computeThinkingWatchdogPlan(30_000, 24_000, 15_000);
    expect(pastLimit.expired).toBe(true);
  });

  it("configures gemini-4-hydrogen at MEDIUM for chunk scans and guarantees multi-model failover budget", () => {
    const chunkConfigs = getGeminiModelConfigs("chunk");
    expect(chunkConfigs[0].model).toBe("gemini-4-hydrogen");
    expect(chunkConfigs[0].thinkingMode).toBe("level_medium");
    // 72秒のチャンク予算内で上位2モデルが両方上限に達しても3モデル目（gemini-3.6-flash等）に20秒以上残ること
    expect(
      chunkConfigs[0].firstTextTimeoutMs + chunkConfigs[1].firstTextTimeoutMs
    ).toBeLessThanOrEqual(50_000);

    const structConfigs = getGeminiModelConfigs("structure");
    expect(structConfigs[0].model).toBe("gemini-4-hydrogen");
    expect(structConfigs[0].thinkingMode).toBe("level_high");
    expect(
      structConfigs[0].firstTextTimeoutMs + structConfigs[1].firstTextTimeoutMs
    ).toBeLessThanOrEqual(62_000);
  });
});
