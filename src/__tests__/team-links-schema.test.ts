// filepath: src/__tests__/team-links-schema.test.ts
import { describe, expect, it } from "vitest";
import {
  MAX_SUB_LINKS_PER_LINK,
  normalizeHttpUrlInput,
  parseSubLinksJson,
  serializeSubLinksJson,
  validateAndNormalizeSubLinksInput,
} from "@/lib/liff/team-links-schema";

describe("team-links-schema sub-link helpers", () => {
  it("auto-prefixes https:// when scheme is omitted", () => {
    expect(normalizeHttpUrlInput("jsbb.or.jp/game")).toBe(
      "https://jsbb.or.jp/game"
    );
    expect(normalizeHttpUrlInput("https://example.com/a")).toBe(
      "https://example.com/a"
    );
    expect(normalizeHttpUrlInput("http://example.com/b")).toBe(
      "http://example.com/b"
    );
    expect(normalizeHttpUrlInput("   ")).toBe("");
  });

  it("validates, normalizes, and skips completely empty draft rows", () => {
    const res = validateAndNormalizeSubLinksInput([
      {
        id: "sub_keep_1",
        title: "  春季大会 トーナメント表  ",
        url: "example.com/bracket",
        note: "  毎週金曜更新  ",
      },
      {
        id: "sub_empty_unused",
        title: "   ",
        url: "   ",
        note: "",
      },
      {
        id: "",
        title: "大会規定PDF",
        url: "https://example.com/rules.pdf",
        note: "   ",
      },
    ]);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.subLinks).toHaveLength(2);
      expect(res.subLinks[0]).toEqual({
        id: "sub_keep_1",
        title: "春季大会 トーナメント表",
        url: "https://example.com/bracket",
        note: "毎週金曜更新",
      });
      expect(res.subLinks[1].title).toBe("大会規定PDF");
      expect(res.subLinks[1].url).toBe("https://example.com/rules.pdf");
      expect(res.subLinks[1].note).toBeNull();
      expect(res.subLinks[1].id).toMatch(/^sub_/);
    }
  });

  it("rejects partial rows and unsafe javascript/data URLs", () => {
    const missingTitle = validateAndNormalizeSubLinksInput([
      { id: "s1", title: "", url: "https://example.com", note: "" },
    ]);
    expect(missingTitle.ok).toBe(false);

    const missingUrl = validateAndNormalizeSubLinksInput([
      { id: "s2", title: "組み合わせ表", url: "   ", note: "" },
    ]);
    expect(missingUrl.ok).toBe(false);

    const unsafeJs = validateAndNormalizeSubLinksInput([
      {
        id: "s3",
        title: "悪意のあるリンク",
        url: "javascript:alert(1)",
        note: "",
      },
    ]);
    expect(unsafeJs.ok).toBe(false);

    const tooMany = validateAndNormalizeSubLinksInput(
      Array.from({ length: MAX_SUB_LINKS_PER_LINK + 1 }, (_, idx) => ({
        id: `s_${idx}`,
        title: `項目 ${idx + 1}`,
        url: `https://example.com/${idx}`,
        note: "",
      }))
    );
    expect(tooMany.ok).toBe(false);
  });

  it("parses and round-trips stored JSON while stripping corrupted/unsafe items", () => {
    expect(parseSubLinksJson(null)).toEqual([]);
    expect(parseSubLinksJson("")).toEqual([]);
    expect(parseSubLinksJson("{broken_json")).toEqual([]);

    const raw = JSON.stringify([
      {
        id: "sub_1",
        title: "空き状況照会",
        url: "https://reserve.example.jp/open",
        note: "ログイン不要",
      },
      {
        id: "sub_xss",
        title: "XSS",
        url: "javascript:void(0)",
      },
      {
        id: "sub_1",
        title: "利用者ログイン",
        url: "https://reserve.example.jp/login",
      },
    ]);

    const parsed = parseSubLinksJson(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      id: "sub_1",
      title: "空き状況照会",
      url: "https://reserve.example.jp/open",
      note: "ログイン不要",
    });
    expect(parsed[1].title).toBe("利用者ログイン");
    expect(parsed[1].id).not.toBe("sub_1"); // duplicate id safely disambiguated

    const serialized = serializeSubLinksJson(parsed);
    expect(serialized).not.toBeNull();
    expect(parseSubLinksJson(serialized)).toEqual(parsed);
    expect(serializeSubLinksJson([])).toBeNull();
  });
});
