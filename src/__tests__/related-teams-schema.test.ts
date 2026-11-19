// filepath: src/__tests__/related-teams-schema.test.ts
import { describe, expect, it } from "vitest";
import {
  MAX_LINKS_PER_RELATED_TEAM,
  extractOpponentMatchKeys,
  inferRelatedTeamLinkKind,
  isPlaceholderOpponentName,
  isSafePublicFetchUrl,
  normalizeOpponentMatchKey,
  parseRelatedTeamLinksJson,
  stripSquadSuffixFromMatchKey,
  validateAndNormalizeRelatedTeamLinks,
} from "@/lib/liff/related-teams-schema";

describe("related-teams-schema", () => {
  describe("inferRelatedTeamLinkKind", () => {
    it("detects SNS and platform kinds from URLs and labels", () => {
      expect(
        inferRelatedTeamLinkKind("https://www.instagram.com/sample_baseball/")
      ).toBe("instagram");
      expect(
        inferRelatedTeamLinkKind("https://youtu.be/dQw4w9WgXcQ")
      ).toBe("youtube");
      expect(inferRelatedTeamLinkKind("https://x.com/team_official")).toBe("x");
      expect(inferRelatedTeamLinkKind("https://lin.ee/abc1234")).toBe("line");
      expect(
        inferRelatedTeamLinkKind("https://www.facebook.com/sampleclub")
      ).toBe("facebook");
      expect(
        inferRelatedTeamLinkKind("https://maps.app.goo.gl/xyz987")
      ).toBe("map");
      expect(
        inferRelatedTeamLinkKind("https://ameblo.jp/youth-baseball/")
      ).toBe("blog");
      expect(
        inferRelatedTeamLinkKind("https://team-portal.jp/", "公式ホームページ")
      ).toBe("official");
    });
  });

  describe("validateAndNormalizeRelatedTeamLinks & parseRelatedTeamLinksJson", () => {
    it("normalizes schemeless URLs, fills default labels, skips empty rows, and deduplicates", () => {
      const res = validateAndNormalizeRelatedTeamLinks([
        { id: "1", kind: "instagram", label: "", url: "www.instagram.com/club_a" },
        { id: "2", kind: "other", label: "", url: "https://youtube.com/@club_a" },
        { id: "3", kind: "instagram", label: "重複", url: "https://www.instagram.com/club_a" },
        { id: "4", kind: "official", label: "未入力枠", url: "   " },
      ]);

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.links).toHaveLength(2);
      expect(res.links[0]).toMatchObject({
        kind: "instagram",
        label: "Instagram",
        url: "https://www.instagram.com/club_a",
      });
      expect(res.links[1]).toMatchObject({
        kind: "youtube",
        label: "YouTube",
        url: "https://youtube.com/@club_a",
      });

      const roundTrip = parseRelatedTeamLinksJson(JSON.stringify(res.links));
      expect(roundTrip).toEqual(res.links);
    });

    it("rejects unsafe javascript: URLs and excessive counts", () => {
      const bad = validateAndNormalizeRelatedTeamLinks([
        { id: "1", kind: "other", label: "危険", url: "javascript:alert(1)" },
      ]);
      expect(bad.ok).toBe(false);

      const tooMany = Array.from(
        { length: MAX_LINKS_PER_RELATED_TEAM + 1 },
        (_, idx) => ({
          id: `id_${idx}`,
          kind: "other",
          label: `Link ${idx}`,
          url: `https://team-${idx}.jp`,
        })
      );
      const overRes = validateAndNormalizeRelatedTeamLinks(tooMany);
      expect(overRes.ok).toBe(false);
    });
  });

  describe("opponent name normalization and matching", () => {
    it("normalizes prefixes, spaces, full-width alphanumerics, and squad suffixes", () => {
      expect(normalizeOpponentMatchKey("vs. 高津タイガース Ａ")).toBe(
        "高津タイガースa"
      );
      expect(stripSquadSuffixFromMatchKey("対 高津タイガース Aチーム")).toBe(
        "高津タイガース"
      );
      expect(stripSquadSuffixFromMatchKey("中原イーグルス（B）")).toBe(
        "中原イーグルス"
      );

      const keys = extractOpponentMatchKeys("川崎中央シニア 1軍", "川崎中央");
      expect(keys).toContain("川崎中央シニア1軍");
      expect(keys).toContain("川崎中央シニア");
      expect(keys).toContain("川崎中央");
    });

    it("identifies placeholder opponent names", () => {
      expect(isPlaceholderOpponentName("未定")).toBe(true);
      expect(isPlaceholderOpponentName("対戦相手未定")).toBe(true);
      expect(isPlaceholderOpponentName("紅白戦")).toBe(true);
      expect(isPlaceholderOpponentName("TBD")).toBe(true);
      expect(isPlaceholderOpponentName("多摩リバーサイドベアーズ")).toBe(false);
    });
  });

  describe("isSafePublicFetchUrl (SSRF protection)", () => {
    it("accepts standard public HTTP/HTTPS URLs", () => {
      const ok1 = isSafePublicFetchUrl("https://www.jsbb.or.jp/teams");
      expect(ok1.ok).toBe(true);

      const ok2 = isSafePublicFetchUrl("kawasaki-baseball.jp/list.html");
      expect(ok2.ok).toBe(true);
      expect(ok2.url).toBe("https://kawasaki-baseball.jp/list.html");
    });

    it("blocks localhost, private IPv4/IPv6, metadata IPs, credentials, and non-standard ports", () => {
      expect(isSafePublicFetchUrl("http://localhost:3000/admin").ok).toBe(false);
      expect(isSafePublicFetchUrl("http://127.0.0.1/secret").ok).toBe(false);
      expect(isSafePublicFetchUrl("http://169.254.169.254/latest/meta-data").ok).toBe(
        false
      );
      expect(isSafePublicFetchUrl("http://192.168.1.10/index.html").ok).toBe(
        false
      );
      expect(isSafePublicFetchUrl("http://10.0.0.5/").ok).toBe(false);
      expect(isSafePublicFetchUrl("http://172.20.0.1/").ok).toBe(false);
      expect(isSafePublicFetchUrl("http://[::1]/").ok).toBe(false);
      expect(isSafePublicFetchUrl("https://user:pass@public-site.jp/").ok).toBe(
        false
      );
      expect(isSafePublicFetchUrl("https://public-site.jp:8443/list").ok).toBe(
        false
      );
    });
  });
});
