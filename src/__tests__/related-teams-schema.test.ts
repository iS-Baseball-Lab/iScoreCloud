// filepath: src/__tests__/related-teams-schema.test.ts
import { describe, expect, it } from "vitest";
import {
  MAX_LINKS_PER_RELATED_TEAM,
  extractCanonicalSnsIdentity,
  extractOpponentMatchKeys,
  hasSoft404HtmlSignature,
  inferRelatedTeamLinkKind,
  isPlaceholderOpponentName,
  isPlatformOfficialSnsAccount,
  isSafePublicFetchUrl,
  isSuspiciousGenericSnsHandle,
  isUselessAiTeamUrl,
  normalizeOpponentMatchKey,
  normalizeRelatedTeamLinkUrlInput,
  parseOrSalvageAiJsonObject,
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

  describe("AI URL accuracy filters & canonical SNS identity", () => {
    it("rejects dummy URLs, vertexaisearch redirects, bare portal roots, login walls, and share intents", () => {
      expect(isUselessAiTeamUrl("https://example.jp/team")).toBe(true);
      expect(
        isUselessAiTeamUrl(
          "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbCdEf"
        )
      ).toBe(true);
      expect(isUselessAiTeamUrl("https://www.instagram.com/")).toBe(true);
      expect(
        isUselessAiTeamUrl("https://www.instagram.com/accounts/login/")
      ).toBe(true);
      expect(isUselessAiTeamUrl("https://x.com/intent/tweet?text=hi")).toBe(
        true
      );
      expect(isUselessAiTeamUrl("https://twitter.com/share?url=x")).toBe(true);
      expect(
        isUselessAiTeamUrl("https://www.facebook.com/sharer/sharer.php?u=x")
      ).toBe(true);
      expect(isUselessAiTeamUrl("https://line.me/R/msg/text/?hello")).toBe(
        true
      );
      expect(isUselessAiTeamUrl("https://89dream.jp/")).toBe(true);
      expect(isUselessAiTeamUrl("https://ikz.jp/")).toBe(true);
      expect(isUselessAiTeamUrl("https://some-team.jp/404.html")).toBe(true);

      // Valid team-specific URLs pass
      expect(
        isUselessAiTeamUrl("https://www.instagram.com/kawasaki_dreams_bbc/")
      ).toBe(false);
      expect(isUselessAiTeamUrl("https://89dream.jp/modules/club/12345/")).toBe(
        false
      );
      expect(isUselessAiTeamUrl("https://lin.ee/AbCdEfG")).toBe(false);
    });

    it("extracts canonical SNS identities for grounding provenance comparison", () => {
      expect(
        extractCanonicalSnsIdentity("https://www.instagram.com/Team_Alpha.BBC/?hl=ja")
      ).toBe("instagram:team_alpha.bbc");
      expect(
        extractCanonicalSnsIdentity("https://instagram.com/team_alpha.bbc/reels/")
      ).toBe("instagram:team_alpha.bbc");
      expect(extractCanonicalSnsIdentity("https://twitter.com/ClubBeta99")).toBe(
        "x:clubbeta99"
      );
      expect(
        extractCanonicalSnsIdentity("https://www.youtube.com/@ClubBetaChannel/videos")
      ).toBe("youtube:@clubbetachannel");
    });

    it("detects soft-404, closed service, and parked domain HTML signatures", () => {
      expect(
        hasSoft404HtmlSignature(
          "<html><head><title>404 Not Found</title></head><body></body></html>"
        )
      ).toBe(true);
      expect(
        hasSoft404HtmlSignature(
          "<html><head><title>エラー</title></head><body>このホームページは公開されていません。</body></html>"
        )
      ).toBe(true);
      expect(
        hasSoft404HtmlSignature(
          "<html><head><title>このドメインはお名前.comで取得されています</title></head></html>"
        )
      ).toBe(true);
      expect(
        hasSoft404HtmlSignature(
          "<html><head><title>〇〇少年野球連盟 公式ホームページ</title></head><body>加盟チーム一覧</body></html>"
        )
      ).toBe(false);
    });
  });

  describe("parseOrSalvageAiJsonObject (large-league truncated JSON salvage)", () => {
    it("parses valid JSON and salvages all completed team objects when truncated mid-array", () => {
      const complete = parseOrSalvageAiJsonObject(
        '```json\n{"leagueTitle":"〇〇市学童軟式野球連盟","candidates":[{"name":"チーム1"},{"name":"チーム2"}]}\n```'
      );
      expect(complete).not.toBeNull();
      expect(Array.isArray(complete?.candidates)).toBe(true);
      expect((complete?.candidates as unknown[]).length).toBe(2);

      // Simulate 52 teams where team #51 truncated mid-object due to maxOutputTokens
      const itemsJson = Array.from({ length: 50 }, (_, idx) =>
        JSON.stringify({
          name: `テストクラブ第${idx + 1}`,
          area: "〇〇市",
          links: [{ label: "Instagram", url: `https://www.instagram.com/club_${idx + 1}/` }],
        })
      ).join(",\n");
      const truncatedRaw = `\`\`\`json\n{\n  "leagueTitle": "〇〇市少年野球連盟",\n  "summaryNote": "加盟52チームを抽出",\n  "candidates": [\n${itemsJson},\n{"name": "途中切れチーム51", "area": "〇〇`;

      const salvaged = parseOrSalvageAiJsonObject(truncatedRaw);
      expect(salvaged).not.toBeNull();
      expect(salvaged?.leagueTitle).toBe("〇〇市少年野球連盟");
      expect(salvaged?.summaryNote).toBe("加盟52チームを抽出");
      const cands = salvaged?.candidates as Array<{ name: string }>;
      expect(cands).toHaveLength(50);
      expect(cands[0].name).toBe("テストクラブ第1");
      expect(cands[49].name).toBe("テストクラブ第50");
    });
  });

  describe("normalizeRelatedTeamLinkUrlInput & SNS handle validation", () => {
    it("expands @handles, bare handles, and fixes instagram/x @-path typos", () => {
      expect(
        normalizeRelatedTeamLinkUrlInput("@club_alpha_bbc", "instagram")
      ).toBe("https://www.instagram.com/club_alpha_bbc/");
      expect(
        normalizeRelatedTeamLinkUrlInput("club_alpha_bbc", "instagram")
      ).toBe("https://www.instagram.com/club_alpha_bbc/");
      expect(
        normalizeRelatedTeamLinkUrlInput(
          "https://www.instagram.com/@club_alpha_bbc",
          "instagram"
        )
      ).toBe("https://www.instagram.com/club_alpha_bbc/");
      expect(normalizeRelatedTeamLinkUrlInput("@club_x", "x")).toBe(
        "https://x.com/club_x"
      );
      expect(
        normalizeRelatedTeamLinkUrlInput("https://x.com/@club_x", "x")
      ).toBe("https://x.com/club_x");
      expect(normalizeRelatedTeamLinkUrlInput("@club_yt", "youtube")).toBe(
        "https://www.youtube.com/@club_yt"
      );
      expect(normalizeRelatedTeamLinkUrlInput("@club_line", "line")).toBe(
        "https://line.me/R/ti/p/@club_line"
      );
    });

    it("accepts @handle rows inside validateAndNormalizeRelatedTeamLinks", () => {
      const res = validateAndNormalizeRelatedTeamLinks([
        { id: "1", kind: "instagram", label: "", url: "@club_alpha_bbc" },
        { id: "2", kind: "x", label: "", url: "@club_alpha_x" },
        { id: "3", kind: "youtube", label: "", url: "@club_alpha_yt" },
      ]);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.links).toEqual([
        {
          id: "1",
          kind: "instagram",
          label: "Instagram",
          url: "https://www.instagram.com/club_alpha_bbc/",
        },
        {
          id: "2",
          kind: "x",
          label: "X (旧Twitter)",
          url: "https://x.com/club_alpha_x",
        },
        {
          id: "3",
          kind: "youtube",
          label: "YouTube",
          url: "https://www.youtube.com/@club_alpha_yt",
        },
      ]);
    });

    it("blocks suspicious generic SNS placeholder handles while allowing real team handles", () => {
      expect(
        isSuspiciousGenericSnsHandle("https://www.instagram.com/sample/")
      ).toBe(true);
      expect(
        isSuspiciousGenericSnsHandle("https://www.instagram.com/official/")
      ).toBe(true);
      expect(isSuspiciousGenericSnsHandle("https://x.com/team_name")).toBe(
        true
      );
      expect(
        isSuspiciousGenericSnsHandle("https://www.instagram.com/xxxx/")
      ).toBe(true);

      // Real team handles containing `_official` or `baseball` must pass
      expect(
        isSuspiciousGenericSnsHandle(
          "https://www.instagram.com/river_official_bbc/"
        )
      ).toBe(false);
      expect(
        isSuspiciousGenericSnsHandle("https://x.com/baseball_club_stars")
      ).toBe(false);
    });

    it("blocks website-builder / blog platform official SNS accounts while allowing team accounts", () => {
      expect(
        isPlatformOfficialSnsAccount("https://x.com/ameba_official")
      ).toBe(true);
      expect(
        isPlatformOfficialSnsAccount("https://www.instagram.com/wix/")
      ).toBe(true);
      expect(
        isPlatformOfficialSnsAccount("https://www.instagram.com/sposuru/")
      ).toBe(true);
      expect(
        isPlatformOfficialSnsAccount(
          "https://www.instagram.com/river_stars_bbc/"
        )
      ).toBe(false);
    });
  });
});
