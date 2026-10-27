// filepath: src/lib/google-maps.ts

const SHORT_URL_CACHE = new Map<string, string>();

/**
 * Googleマップの短縮共有URL（maps.app.goo.gl / goo.gl）かどうかを判定する
 */
export function isGoogleMapsShortUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)\//i.test(rawUrl.trim());
}

/**
 * <iframe src="..."> タグごと貼り付けられていた場合に src URL を抽出する
 */
export function normalizeRawMapUrlInput(rawInput: string | null | undefined): string {
  if (!rawInput) return "";
  const trimmed = rawInput.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("<iframe")) {
    const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
    if (srcMatch?.[1]) {
      return srcMatch[1].replace(/&amp;/g, "&").trim();
    }
  }
  return trimmed;
}

/**
 * URL文字列がすでに位置・プレイス情報を含む展開済みGoogleマップURLか判定する
 */
function hasResolvedGoogleMapTarget(urlStr: string): boolean {
  return (
    urlStr.includes("/maps/embed") ||
    urlStr.includes("/maps/place/") ||
    urlStr.includes("/maps/search/") ||
    urlStr.includes("/maps/dir/") ||
    /\/@-?\d+\.\d+,-?\d+\.\d+/.test(urlStr) ||
    /!3d-?\d+\.\d+!4d-?\d+\.\d+/.test(urlStr) ||
    /[?&](q|query|ll|sll|cid|ftid|destination|daddr|center)=/i.test(urlStr)
  );
}

/**
 * サーバーサイド（Cloudflare Workers）で短縮URL（maps.app.goo.gl 等）のリダイレクト先を展開する
 */
export async function expandGoogleMapsShortUrl(rawUrl: string): Promise<string> {
  const cleaned = normalizeRawMapUrlInput(rawUrl);
  if (!cleaned || !isGoogleMapsShortUrl(cleaned)) {
    return cleaned;
  }

  const cached = SHORT_URL_CACHE.get(cleaned);
  if (cached) {
    return cached;
  }

  let currentUrl = cleaned;

  try {
    for (let hop = 0; hop < 5; hop++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      let res: Response;
      try {
        res = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
            "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
          },
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const locationHeader = res.headers.get("location");
      if (locationHeader) {
        const nextUrl = new URL(locationHeader, currentUrl).toString();
        currentUrl = nextUrl;
        if (hasResolvedGoogleMapTarget(currentUrl) || !isGoogleMapsShortUrl(currentUrl)) {
          if (hasResolvedGoogleMapTarget(currentUrl)) {
            break;
          }
        }
        continue;
      }

      // 200 OK のHTMLレスポンス内にリダイレクト先URLが含まれるケースへの対応
      if (res.ok) {
        const html = (await res.text()).slice(0, 65536);
        const mapLinkMatch = html.match(
          /https:\/\/(?:www\.|maps\.)?google\.(?:com|co\.jp)\/maps[^\s"'<>\\]+/i
        );
        if (mapLinkMatch?.[0]) {
          currentUrl = mapLinkMatch[0].replace(/&amp;/g, "&");
        }
      }
      break;
    }

    if (currentUrl && currentUrl !== cleaned) {
      SHORT_URL_CACHE.set(cleaned, currentUrl);
    }
  } catch (err) {
    console.warn("Failed to expand Google Maps short URL:", err);
  }

  return currentUrl;
}

/**
 * URL内のズーム指定（/@lat,lng,17z または ?z=17）を安全に抽出する
 */
function extractZoomFromUrl(urlStr: string, parsedUrl: URL | null): number {
  if (parsedUrl) {
    const zParam = Number(parsedUrl.searchParams.get("z"));
    if (Number.isFinite(zParam) && zParam >= 10 && zParam <= 20) {
      return Math.round(zParam);
    }
  }
  const atZoomMatch = urlStr.match(/\/@-?\d+\.\d+,-?\d+\.\d+,(\d+(?:\.\d+)?)z/);
  if (atZoomMatch?.[1]) {
    const z = Math.round(Number(atZoomMatch[1]));
    if (Number.isFinite(z) && z >= 10 && z <= 20) {
      return z;
    }
  }
  return 16;
}

/**
 * 登録された Google Map URL から iframe 埋め込み用 URL を構築する（住所に依存せず登録URLの位置を忠実に再現）
 */
export function buildGoogleMapsEmbedFromUrl(rawUrl: string | null | undefined): string {
  const cleaned = normalizeRawMapUrlInput(rawUrl);
  if (!cleaned) return "";

  // 1. すでに埋め込み専用URLの場合はそのまま利用
  if (cleaned.includes("/maps/embed") || /[?&]output=embed/i.test(cleaned)) {
    return cleaned;
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(cleaned);
  } catch {
    return "";
  }

  const host = parsed.hostname.toLowerCase();
  const isGoogleDomain =
    host.includes("google.") || host === "maps.app.goo.gl" || host === "goo.gl";
  if (!isGoogleDomain) {
    return "";
  }

  const zoom = extractZoomFromUrl(cleaned, parsed);

  // 2. Google プレイス固有ID (?cid=...) が指定されている場合
  const cid = (parsed.searchParams.get("cid") || "").trim();
  if (/^\d+$/.test(cid)) {
    return `https://maps.google.com/maps?cid=${cid}&hl=ja&z=${zoom}&output=embed`;
  }

  // 3. クエリパラメータ (?q=, ?query=, ?ll=, ?destination=, ?daddr=, ?center=) が指定されている場合
  const paramKeys = ["q", "query", "ll", "sll", "destination", "daddr", "center"] as const;
  for (const key of paramKeys) {
    const val = (parsed.searchParams.get(key) || "").trim();
    if (val) {
      return `https://maps.google.com/maps?q=${encodeURIComponent(val)}&hl=ja&z=${zoom}&output=embed`;
    }
  }

  // 4. URL内の厳密なピン座標 (!3d<lat>!4d<lng>) — 河川敷や特定グラウンド面のピン位置を最優先で再現
  const pinMatches = Array.from(cleaned.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g));
  if (pinMatches.length > 0) {
    const lastPin = pinMatches[pinMatches.length - 1];
    return `https://maps.google.com/maps?q=${lastPin[1]},${lastPin[2]}&hl=ja&z=${zoom}&output=embed`;
  }

  // 5. /maps/search/<query_or_coords> 形式
  const searchPathMatch = parsed.pathname.match(/\/maps\/search\/([^/?#]+)/i);
  if (searchPathMatch?.[1]) {
    try {
      const decodedSearch = decodeURIComponent(searchPathMatch[1].replace(/\+/g, " ")).trim();
      if (decodedSearch) {
        return `https://maps.google.com/maps?q=${encodeURIComponent(decodedSearch)}&hl=ja&z=${zoom}&output=embed`;
      }
    } catch {}
  }

  // 6. /maps/place/<place_name> 形式
  const placePathMatch = parsed.pathname.match(/\/maps\/place\/([^/?#]+)/i);
  if (placePathMatch?.[1]) {
    try {
      const decodedPlace = decodeURIComponent(placePathMatch[1].replace(/\+/g, " ")).trim();
      if (decodedPlace) {
        return `https://maps.google.com/maps?q=${encodeURIComponent(decodedPlace)}&hl=ja&z=${zoom}&output=embed`;
      }
    } catch {}
  }

  // 7. ビューポート座標 (/@<lat>,<lng>) 形式
  const atCoordMatch = cleaned.match(/\/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atCoordMatch?.[1] && atCoordMatch?.[2]) {
    return `https://maps.google.com/maps?q=${atCoordMatch[1]},${atCoordMatch[2]}&hl=ja&z=${zoom}&output=embed`;
  }

  // 8. モバイル共有リンク等の Feature ID (!1s0x...:0x... または ftid=0x...:0x...) から CID を復元
  const ftidSource = `${cleaned} ${parsed.searchParams.get("ftid") || ""}`;
  const ftidMatch = ftidSource.match(/0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)/);
  if (ftidMatch?.[1]) {
    try {
      const derivedCid = BigInt(`0x${ftidMatch[1]}`).toString(10);
      return `https://maps.google.com/maps?cid=${derivedCid}&hl=ja&z=${zoom}&output=embed`;
    } catch {}
  }

  return "";
}

/**
 * ルート案内（destination=）用に登録URLからピン座標または検索対象を抽出する
 */
export function extractDirectionsTargetFromUrl(rawUrl: string | null | undefined): string {
  const cleaned = normalizeRawMapUrlInput(rawUrl);
  if (!cleaned) return "";

  const pinMatches = Array.from(cleaned.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g));
  if (pinMatches.length > 0) {
    const lastPin = pinMatches[pinMatches.length - 1];
    return `${lastPin[1]},${lastPin[2]}`;
  }

  try {
    const parsed = new URL(cleaned);
    const paramKeys = ["q", "query", "ll", "destination", "daddr"] as const;
    for (const key of paramKeys) {
      const val = (parsed.searchParams.get(key) || "").trim();
      if (val) return val;
    }

    const searchPathMatch = parsed.pathname.match(/\/maps\/search\/([^/?#]+)/i);
    if (searchPathMatch?.[1]) {
      const decoded = decodeURIComponent(searchPathMatch[1].replace(/\+/g, " ")).trim();
      if (decoded) return decoded;
    }

    const placePathMatch = parsed.pathname.match(/\/maps\/place\/([^/?#]+)/i);
    if (placePathMatch?.[1]) {
      const decoded = decodeURIComponent(placePathMatch[1].replace(/\+/g, " ")).trim();
      if (decoded) return decoded;
    }
  } catch {}

  const atCoordMatch = cleaned.match(/\/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atCoordMatch?.[1] && atCoordMatch?.[2]) {
    return `${atCoordMatch[1]},${atCoordMatch[2]}`;
  }

  return "";
}

