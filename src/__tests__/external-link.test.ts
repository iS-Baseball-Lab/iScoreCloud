// filepath: src/__tests__/external-link.test.ts
import { describe, expect, it, vi } from "vitest";
import type { Liff } from "@line/liff";
import {
  appendLineExternalBrowserParam,
  classifyAnchorExternalNavigation,
  isLinePlatformActionUrl,
  isLineWebViewUserAgent,
  openExternalUrlInDefaultBrowser,
  stripLineExternalBrowserParam,
} from "@/lib/liff/external-link";

const ORIGIN = "https://iscorecloud.com";

describe("External link default-browser routing helpers", () => {
  it("identifies LINE platform action & share URLs without misclassifying external websites", () => {
    expect(isLinePlatformActionUrl("https://line.me/R/msg/text/?hello")).toBe(true);
    expect(isLinePlatformActionUrl("https://line.me/R/share?text=score")).toBe(true);
    expect(isLinePlatformActionUrl("https://line.me/R/nv/QRCodeReader")).toBe(true);
    expect(isLinePlatformActionUrl("https://liff.line.me/1234567890-abcdefgh/matches")).toBe(true);
    expect(isLinePlatformActionUrl("https://miniapp.line.me/1234567890-abcdefgh")).toBe(true);
    expect(isLinePlatformActionUrl("https://lin.ee/AbCdEfG")).toBe(true);
    expect(isLinePlatformActionUrl("line://msg/text/hello")).toBe(true);

    // External websites must NOT be classified as LINE internal actions
    expect(isLinePlatformActionUrl("https://www.google.com/maps/dir/?api=1")).toBe(false);
    expect(isLinePlatformActionUrl("https://maps.app.goo.gl/xyz123")).toBe(false);
    expect(isLinePlatformActionUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(isLinePlatformActionUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(false);
    expect(isLinePlatformActionUrl("https://www.instagram.com/example_baseball/")).toBe(false);
    expect(isLinePlatformActionUrl("https://policies.google.com/privacy")).toBe(false);
  });

  it("classifies external websites and explicit target=_blank PDF/asset links for default browser", () => {
    // External links (Google Maps, YouTube, Instagram, tournament brackets, Google Privacy Policy)
    expect(
      classifyAnchorExternalNavigation({
        rawHref: "https://www.google.com/maps/search/?api=1&query=球場",
        currentOrigin: ORIGIN,
        targetAttr: "_blank",
      })
    ).toEqual({
      shouldOpenInDefaultBrowser: true,
      resolvedUrl: "https://www.google.com/maps/search/?api=1&query=%E7%90%83%E5%A0%B4",
    });

    // External link even if target="_blank" was omitted
    expect(
      classifyAnchorExternalNavigation({
        rawHref: "https://www.instagram.com/team_official/",
        currentOrigin: ORIGIN,
      })
    ).toEqual({
      shouldOpenInDefaultBrowser: true,
      resolvedUrl: "https://www.instagram.com/team_official/",
    });

    // Same-origin PDF / document "ブラウザで開く" / "直接開く" with target="_blank"
    expect(
      classifyAnchorExternalNavigation({
        rawHref: "/api/liff/documents/files/team1/2026/guide.pdf?openExternalBrowser=1",
        currentOrigin: ORIGIN,
        targetAttr: "_blank",
      })
    ).toEqual({
      shouldOpenInDefaultBrowser: true,
      resolvedUrl: "https://iscorecloud.com/api/liff/documents/files/team1/2026/guide.pdf",
    });
  });

  it("excludes internal Next.js routes, file downloads, non-HTTP schemes, and LINE share intents", () => {
    expect(
      classifyAnchorExternalNavigation({
        rawHref: "/liff/team",
        currentOrigin: ORIGIN,
      }).shouldOpenInDefaultBrowser
    ).toBe(false);

    expect(
      classifyAnchorExternalNavigation({
        rawHref: "/privacy",
        currentOrigin: ORIGIN,
      }).shouldOpenInDefaultBrowser
    ).toBe(false);

    expect(
      classifyAnchorExternalNavigation({
        rawHref: "/api/liff/documents/files/team1/sheet.xlsx",
        currentOrigin: ORIGIN,
        hasDownloadAttr: true,
      }).shouldOpenInDefaultBrowser
    ).toBe(false);

    expect(
      classifyAnchorExternalNavigation({
        rawHref: "mailto:info@iscorecloud.com",
        currentOrigin: ORIGIN,
      }).shouldOpenInDefaultBrowser
    ).toBe(false);

    expect(
      classifyAnchorExternalNavigation({
        rawHref: "tel:090-1234-5678",
        currentOrigin: ORIGIN,
      }).shouldOpenInDefaultBrowser
    ).toBe(false);

    expect(
      classifyAnchorExternalNavigation({
        rawHref: "https://line.me/R/msg/text/?test",
        currentOrigin: ORIGIN,
        targetAttr: "_blank",
      }).shouldOpenInDefaultBrowser
    ).toBe(false);

    expect(
      classifyAnchorExternalNavigation({
        rawHref: "https://miniapp.line.me/2000000000-abcdef",
        currentOrigin: ORIGIN,
      }).shouldOpenInDefaultBrowser
    ).toBe(false);
  });

  it("detects LINE User-Agent and manages openExternalBrowser=1 query cleanly", () => {
    expect(
      isLineWebViewUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1 Line/14.10.0 LIFF"
      )
    ).toBe(true);
    expect(
      isLineWebViewUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1"
      )
    ).toBe(false);

    const withFlag = appendLineExternalBrowserParam("https://example.com/bracket?id=10");
    expect(withFlag).toBe("https://example.com/bracket?id=10&openExternalBrowser=1");
    expect(stripLineExternalBrowserParam(withFlag)).toBe("https://example.com/bracket?id=10");
  });

  it("calls liff.openWindow({ url, external: true }) when running inside LIFF client", () => {
    const openWindowSpy = vi.fn();
    const mockLiff = {
      isInClient: () => true,
      openWindow: openWindowSpy,
    } as unknown as Liff;

    const prevWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      value: {
        location: { origin: ORIGIN },
        open: vi.fn(),
      },
      configurable: true,
      writable: true,
    });

    try {
      const opened = openExternalUrlInDefaultBrowser(
        "https://www.youtube.com/watch?v=abc123&openExternalBrowser=1",
        { liff: mockLiff }
      );
      expect(opened).toBe(true);
      expect(openWindowSpy).toHaveBeenCalledTimes(1);
      expect(openWindowSpy).toHaveBeenCalledWith({
        url: "https://www.youtube.com/watch?v=abc123",
        external: true,
      });
    } finally {
      Object.defineProperty(globalThis, "window", {
        value: prevWindow,
        configurable: true,
        writable: true,
      });
    }
  });
});
