// filepath: src/__tests__/scorebook-json-repair.test.ts
import { describe, expect, it } from "vitest";
import { repairAndParseGeminiJson } from "@/lib/liff/gemini-json-repair";
import {
  buildOrderedGeminiAttemptConfigs,
  getGeminiModelConfigs,
  type ModelCooldownRecord,
} from "@/api/liff/scorebook";

interface SampleChunkPayload {
  ab: Array<{
    i: number;
    bo: number;
    pt?: string;
    obs?: string;
    rl?: string;
    rc: string;
    o: number;
    p?: string[];
    pn?: number | null;
  }>;
}

describe("repairAndParseGeminiJson — Gemini lightweight model JSON repair & truncation handling", () => {
  it("parses valid JSON on fast path without marking repaired", () => {
    const raw =
      '{"ab":[{"i":1,"bo":1,"pt":"山田","obs":"左:○,ー/右下:6-3","rl":"遊ゴロ","rc":"groundout","o":1,"p":["S","B","X"]}]}';
    const res = repairAndParseGeminiJson<SampleChunkPayload>(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.repaired).toBe(false);
      expect(res.salvagedTruncated).toBe(false);
      expect(res.value.ab).toHaveLength(1);
      expect(res.value.ab[0].rc).toBe("groundout");
    }
  });

  it("repairs unescaped double quotes inside Japanese string fields that trigger V8 'Expected , or } after property value'", () => {
    // 実際に gemini-flash-lite-latest が生成して JSON.parse をクラッシュさせる未エスケープ引用符パターン
    const raw =
      '```json\n{"ab":[{"i":1,"bo":1,"pt":"山田","obs":"左:○,ー/右下:"6-3"と記入","rl":"遊ゴロ("6-3")","rc":"groundout","o":1},{"i":1,"bo":2,"pt":"山田","obs":"左:"○", "中":Ⅰ, 右下:"K"","rl":"三振","rc":"strikeout","o":1}]}\n```';
    const res = repairAndParseGeminiJson<SampleChunkPayload>(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.repaired).toBe(true);
      expect(res.salvagedTruncated).toBe(false);
      expect(res.value.ab).toHaveLength(2);
      expect(res.value.ab[0].obs).toBe('左:○,ー/右下:"6-3"と記入');
      expect(res.value.ab[0].rl).toBe('遊ゴロ("6-3")');
      expect(res.value.ab[1].obs).toBe('左:"○", "中":Ⅰ, 右下:"K"');
    }
  });

  it("repairs raw newlines in strings, missing commas between fields/objects, trailing commas, and undefined literals", () => {
    const raw = `Here is the JSON result:\n{"ab":[{"i":1 "bo":1,"pt":"選手1" "obs":"1行目\n2行目","rc":"single","o":0,"p":["B" "H",],"pn":undefined,}{"i":1,"bo":2,"rc":"flyout","o":1,},]}\nNote: done.`;
    const res = repairAndParseGeminiJson<SampleChunkPayload>(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.repaired).toBe(true);
      expect(res.salvagedTruncated).toBe(false);
      expect(res.value.ab).toHaveLength(2);
      expect(res.value.ab[0].obs).toBe("1行目\n2行目");
      expect(res.value.ab[0].p).toEqual(["B", "H"]);
      expect(res.value.ab[0].pn).toBeNull();
      expect(res.value.ab[1].bo).toBe(2);
    }
  });

  it("detects mid-stream SSE truncation (finishReason UNKNOWN at byte ~342) and only salvages completed array items when allowed", () => {
    const truncatedMidSecondBatter =
      '{"ab":[{"i":1,"bo":1,"pt":"山田","obs":"左:○,ー/右下:4-3","rc":"groundout","o":1,"p":["S","B","X"]},{"i":1,"bo":2,"pt":"山田","obs":"左:ー,●","rc":"single"';

    const strictRes = repairAndParseGeminiJson<SampleChunkPayload>(
      truncatedMidSecondBatter,
      { allowTruncatedSalvage: false }
    );
    expect(strictRes.ok).toBe(false);
    if (!strictRes.ok) {
      expect(strictRes.likelyTruncated).toBe(true);
    }

    const salvagedRes = repairAndParseGeminiJson<SampleChunkPayload>(
      truncatedMidSecondBatter,
      { allowTruncatedSalvage: true }
    );
    expect(salvagedRes.ok).toBe(true);
    if (salvagedRes.ok) {
      expect(salvagedRes.salvagedTruncated).toBe(true);
      expect(salvagedRes.value.ab).toHaveLength(1);
      expect(salvagedRes.value.ab[0].bo).toBe(1);
    }
  });
});

describe("buildOrderedGeminiAttemptConfigs — anti-starvation multi-model failover pool", () => {
  it("keeps at least 4 candidate models (prioritizing top-tier recoveries) even when upper 5 models are in short 503/RPM cooldown", () => {
    const now = 1_000_000;
    const raw = getGeminiModelConfigs("chunk");
    const cooldowns = new Map<string, ModelCooldownRecord>([
      ["gemini-4-hydrogen", { until: now + 9_000, status: 429, daily: false }],
      ["gemini-3.8-flash", { until: now + 10_000, status: 503 }],
      ["gemini-3.6-flash", { until: now + 11_000, status: 503 }],
      ["gemini-3.5-flash-lite", { until: now + 10_500, status: 503 }],
      ["gemini-3.1-flash-lite", { until: now + 8_500, status: 503 }],
    ]);

    // 以前は [gemini-flash-lite-latest, gemini-3.1-flash-lite] の2件だけで打ち切られていたケース
    const ordered = buildOrderedGeminiAttemptConfigs(
      raw,
      cooldowns,
      ["gemini-4-hydrogen", "gemini-3.8-flash"],
      now
    );

    expect(ordered.length).toBeGreaterThanOrEqual(4);
    expect(ordered[0].model).toBe("gemini-flash-lite-latest");
    // 復帰バケット内で上位モデル（gemini-4-hydrogen / gemini-3.8-flash）が下位 lite より優先して補填されること
    const followUpModels = ordered.slice(1).map((c) => c.model);
    expect(followUpModels).toContain("gemini-4-hydrogen");
    expect(followUpModels).toContain("gemini-3.8-flash");
  });

  it("excludes 404 models and places daily-exhausted (PerDay) models behind short-term cooling models", () => {
    const now = 1_000_000;
    const raw = getGeminiModelConfigs("chunk");
    const cooldowns = new Map<string, ModelCooldownRecord>([
      ["gemini-4-hydrogen", { until: now + 180_000, status: 429, daily: true }],
      ["gemini-3.8-flash", { until: now + 10_000, status: 503 }],
      ["gemini-3.6-flash", { until: now + 3_600_000, status: 404 }],
      ["gemini-3.5-flash-lite", { until: now + 11_000, status: 503 }],
      ["gemini-3.1-flash-lite", { until: now + 9_000, status: 503 }],
      ["gemini-flash-lite-latest", { until: now + 8_000, status: 503 }],
    ]);

    const ordered = buildOrderedGeminiAttemptConfigs(raw, cooldowns, [], now);
    const models = ordered.map((c) => c.model);
    expect(models).not.toContain("gemini-3.6-flash");
    expect(models).not.toContain("gemini-4-hydrogen");
    expect(models[0]).toBe("gemini-3.8-flash");
  });
});
