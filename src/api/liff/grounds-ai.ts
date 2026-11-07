// filepath: src/api/liff/grounds-ai.ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { organizations, teams, venues } from "@/db/schema";
import type { WorkerEnv } from "@/types/api";

const liffGroundsAiRouter = new Hono<{ Bindings: WorkerEnv }>();

export type GroundVenueCategory = "stadium" | "home" | "school" | "indoor";

export type GroundVenueSurface =
  | "土 (クレー)"
  | "人工芝"
  | "天然芝"
  | "土 (内野) / 天然芝 (外野)"
  | "その他";

export type GroundAiVerifiableField =
  | "name"
  | "shortName"
  | "category"
  | "surface"
  | "address"
  | "mapUrl"
  | "parkingInfo"
  | "spikeRule"
  | "notes";

export interface GroundAiSourceLink {
  title: string;
  url: string;
  kind: "maps" | "official" | "web";
}

export interface GroundAiAlternativeCandidate {
  name: string;
  area: string;
  note?: string;
}

export interface GroundAiLookupResult {
  name: string;
  shortName: string;
  category: GroundVenueCategory;
  surface: GroundVenueSurface;
  address: string;
  mapUrl: string;
  parkingInfo: string;
  spikeRule: string;
  notes: string;
  confidence: "high" | "medium" | "low";
  summaryNote: string;
  mapsVerified: boolean;
  verifiedFields: GroundAiVerifiableField[];
  alternatives: GroundAiAlternativeCandidate[];
  sources: GroundAiSourceLink[];
}

interface GroundAiLookupRequestBody {
  name?: string;
  areaHint?: string;
  currentCategory?: string;
  currentAddress?: string;
  currentShortName?: string;
  teamId?: string;
}

interface TeamRegionContext {
  clubName: string;
  clubCategory: string;
  homeGround: string;
  frequentAreas: string[];
  mapsApiKey: string | null;
}

interface GeoAnchor {
  latitude: number;
  longitude: number;
  label: string;
}

interface PlacesTextSearchResult {
  displayName?: string;
  formattedAddress?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  latitude?: number;
  longitude?: number;
}

interface MapsGroundingProbeResult {
  placeTitle?: string;
  address?: string;
  mapsUri?: string;
  chunks: GeminiGroundingChunk[];
}

interface GeminiGeneratePart {
  text?: string;
  thought?: boolean;
}

interface GeminiGroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
  maps?: {
    uri?: string;
    title?: string;
    placeId?: string;
  };
}

interface GeminiGenerateCandidate {
  content?: {
    parts?: GeminiGeneratePart[];
  };
  groundingMetadata?: {
    groundingChunks?: GeminiGroundingChunk[];
  };
}

interface GeminiGenerateResponse {
  candidates?: GeminiGenerateCandidate[];
  error?: {
    message?: string;
    code?: number;
  };
}

interface RawAiAlternativeItem {
  name?: unknown;
  area?: unknown;
  note?: unknown;
}

interface RawAiGroundPayload {
  name?: unknown;
  shortName?: unknown;
  category?: unknown;
  surface?: unknown;
  address?: unknown;
  parkingInfo?: unknown;
  spikeRule?: unknown;
  notes?: unknown;
  confidence?: unknown;
  summaryNote?: unknown;
  verifiedFields?: unknown;
  alternatives?: unknown;
}

interface WebModelAttemptSpec {
  model: string;
  useGoogleSearch: boolean;
  thinkingBudget: number | null;
  timeoutMs: number;
}

// 実稼働が確認済みの高速モデルを最優先配置（404遅延ゼロ＋思考検証1024トークンで対岸・別施設混入を排除）
const WEB_SEARCH_MODEL_ATTEMPTS: ReadonlyArray<WebModelAttemptSpec> = [
  {
    model: "gemini-2.5-flash",
    useGoogleSearch: true,
    thinkingBudget: 1024,
    timeoutMs: 25_000,
  },
  {
    model: "gemini-2.5-pro",
    useGoogleSearch: true,
    thinkingBudget: 1024,
    timeoutMs: 26_000,
  },
  {
    model: "gemini-flash-lite-latest",
    useGoogleSearch: true,
    thinkingBudget: null,
    timeoutMs: 16_000,
  },
  {
    model: "gemini-2.5-flash",
    useGoogleSearch: false,
    thinkingBudget: 512,
    timeoutMs: 12_000,
  },
];

const MODEL_COOLDOWN = new Map<string, number>();

interface HeartRailsTownPostalEntry {
  town: string;
  postal: string;
}

// 同一市区町村の郵便番号辞書キャッシュ（Worker Isolateメモリ保持で2回目以降 0ms）
const TOWN_POSTAL_CACHE = new Map<string, ReadonlyArray<HeartRailsTownPostalEntry>>();

const DESIGNATED_CITY_PREFIX_REGEX =
  /^((?:札幌|仙台|さいたま|千葉|横浜|川崎|相模原|新潟|静岡|浜松|名古屋|京都|大阪|堺|神戸|岡山|広島|北九州|福岡|熊本)市.+?区)(.*)$/;

const KANJI_DIGITS: ReadonlyArray<[string, string]> = [
  ["一", "1"],
  ["二", "2"],
  ["三", "3"],
  ["四", "4"],
  ["五", "5"],
  ["六", "6"],
  ["七", "7"],
  ["八", "8"],
  ["九", "9"],
];

const VALID_CATEGORIES = new Set<GroundVenueCategory>([
  "stadium",
  "home",
  "school",
  "indoor",
]);

const VALID_SURFACES = new Set<GroundVenueSurface>([
  "土 (クレー)",
  "人工芝",
  "天然芝",
  "土 (内野) / 天然芝 (外野)",
  "その他",
]);

const VALID_VERIFIABLE_FIELDS = new Set<GroundAiVerifiableField>([
  "name",
  "shortName",
  "category",
  "surface",
  "address",
  "mapUrl",
  "parkingInfo",
  "spikeRule",
  "notes",
]);

const OFFICIAL_DOMAIN_PATTERN =
  /(\.lg\.jp|\.go\.jp|\.ed\.jp|\.or\.jp|\.ac\.jp|park|sports|taiiku|ryokuchi|shisetsu|city\.|pref\.|town\.|ward\.)/i;

function cleanString(val: unknown, maxLen = 320): string {
  if (typeof val !== "string") return "";
  const trimmed = val
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (
    !trimmed ||
    trimmed === "不明" ||
    trimmed === "情報なし" ||
    trimmed === "未確認" ||
    trimmed === "なし（不明）" ||
    trimmed === "記載なし" ||
    trimmed === "公式情報なし" ||
    trimmed === "null" ||
    trimmed === "undefined"
  ) {
    return "";
  }
  return trimmed.slice(0, maxLen);
}

function toHalfWidthPostalToken(raw: string): string {
  return raw
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[ー－―‐−]/g, "-");
}

function splitPostalAndAddressBody(rawAddr: string): {
  postal: string | null;
  body: string;
} {
  let working = rawAddr.trim().replace(/^日本[、,\s]*/, "").trim();
  if (!working) return { postal: null, body: "" };

  let foundPostal: string | null = null;

  const leadingMatch = working.match(
    /^〒?\s*([0-9０-９]{3})[-ー－―‐−]?([0-9０-９]{4})[、,\s]*/
  );
  if (leadingMatch) {
    const p1 = toHalfWidthPostalToken(leadingMatch[1]);
    const p2 = toHalfWidthPostalToken(leadingMatch[2]);
    const candidate = `${p1}-${p2}`;
    if (candidate !== "000-0000" && !candidate.endsWith("-0000")) {
      foundPostal = candidate;
    }
    working = working
      .slice(leadingMatch[0].length)
      .replace(/^日本[、,\s]*/, "")
      .trim();
  }

  return {
    postal: foundPostal,
    body: working,
  };
}

function normalizeAddressForDisplay(addr: string): string {
  const { postal, body } = splitPostalAndAddressBody(addr);
  if (!body) return "";
  return postal ? `〒${postal} ${body}` : body;
}

function stripRiverbedAmbiguousSuffix(addr: string): string {
  return addr.replace(/(地内|地先|先|付近)$/g, "").trim();
}

function parseJapanMunicipality(address: string): {
  prefecture: string;
  city: string;
  remainder: string;
} | null {
  const { body } = splitPostalAndAddressBody(address);
  if (!body) return null;

  const prefMatch = body.match(/^(北海道|東京都|(?:京都|大阪)府|.{2,3}県)(.*)$/);
  if (!prefMatch) return null;

  const prefecture = prefMatch[1];
  const afterPref = prefMatch[2].trim();
  if (!afterPref) return null;

  // 1. 政令指定都市（市＋区）
  const designatedMatch = afterPref.match(DESIGNATED_CITY_PREFIX_REGEX);
  if (designatedMatch) {
    return {
      prefecture,
      city: designatedMatch[1],
      remainder: designatedMatch[2].trim(),
    };
  }

  // 2. 東京都特別区（23区）
  if (prefecture === "東京都") {
    const wardMatch = afterPref.match(/^([^市町村郡]+?区)(.*)$/);
    if (wardMatch) {
      return {
        prefecture,
        city: wardMatch[1],
        remainder: wardMatch[2].trim(),
      };
    }
  }

  // 3. 市名に「郡」を含む市（郡山市・大和郡山市・小郡市・蒲郡市）
  const specialGunCityMatch = afterPref.match(
    /^((?:大和郡山|郡山|小郡|蒲郡)市)(.*)$/
  );
  if (specialGunCityMatch) {
    return {
      prefecture,
      city: specialGunCityMatch[1],
      remainder: specialGunCityMatch[2].trim(),
    };
  }

  // 4. 一般市
  const regularCityMatch = afterPref.match(/^([^郡]+?市)(.*)$/);
  if (regularCityMatch) {
    return {
      prefecture,
      city: regularCityMatch[1],
      remainder: regularCityMatch[2].trim(),
    };
  }

  // 5. 郡＋町村
  const countyMatch = afterPref.match(/^(.+?郡.+?[町村])(.*)$/);
  if (countyMatch) {
    return {
      prefecture,
      city: countyMatch[1],
      remainder: countyMatch[2].trim(),
    };
  }

  // 6. その他町村フォールバック
  const fallbackMatch = afterPref.match(/^(.+?[市町村区])(.*)$/);
  if (fallbackMatch) {
    return {
      prefecture,
      city: fallbackMatch[1],
      remainder: fallbackMatch[2].trim(),
    };
  }

  return null;
}

function extractAreaPrefix(address: string): string {
  const parsed = parseJapanMunicipality(address);
  if (parsed) {
    return `${parsed.prefecture}${parsed.city}`;
  }
  const { body } = splitPostalAndAddressBody(address);
  const m = body.match(/^(.+?[都道府県].+?[市区町村郡])/);
  return m ? m[1] : "";
}

function normalizeCategory(
  raw: unknown,
  fallbackName: string,
  currentCategory?: string
): GroundVenueCategory {
  if (currentCategory === "home") return "home";
  if (typeof raw === "string") {
    const c = raw.trim().toLowerCase() as GroundVenueCategory;
    if (VALID_CATEGORIES.has(c)) return c;
  }
  if (/小学校|中学校|高校|高等学校|大学|学園|校庭/.test(fallbackName)) {
    return "school";
  }
  if (/室内|インドア|ドーム|練習場|バッティング/.test(fallbackName)) {
    return "indoor";
  }
  return "stadium";
}

function normalizeSurface(raw: unknown): GroundVenueSurface {
  if (typeof raw !== "string") return "土 (クレー)";
  const s = raw.trim();
  if (VALID_SURFACES.has(s as GroundVenueSurface)) {
    return s as GroundVenueSurface;
  }
  const hasArtificial = /人工芝/.test(s);
  const hasNatural = /天然芝|芝/.test(s) && !hasArtificial;
  const hasDirt = /土|クレー|黒土|真砂土|アンツーカ/.test(s);

  if (hasDirt && hasNatural) return "土 (内野) / 天然芝 (外野)";
  if (hasArtificial) return "人工芝";
  if (hasNatural) return "天然芝";
  if (hasDirt) return "土 (クレー)";
  return "土 (クレー)";
}

function normalizeConfidence(raw: unknown): "high" | "medium" | "low" {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "medium";
}

function normalizeVerifiedFields(
  raw: unknown,
  hasMapsLink: boolean,
  hasWebSources: boolean
): GroundAiVerifiableField[] {
  if (!hasMapsLink && !hasWebSources) {
    return [];
  }
  const result = new Set<GroundAiVerifiableField>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (
        typeof item === "string" &&
        VALID_VERIFIABLE_FIELDS.has(item as GroundAiVerifiableField)
      ) {
        result.add(item as GroundAiVerifiableField);
      }
    }
  }
  if (hasMapsLink) {
    result.add("name");
    result.add("address");
    result.add("mapUrl");
  }
  return Array.from(result);
}

function normalizeAlternatives(raw: unknown): GroundAiAlternativeCandidate[] {
  if (!Array.isArray(raw)) return [];
  const items: GroundAiAlternativeCandidate[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as RawAiAlternativeItem;
    const name = cleanString(obj.name, 80);
    const area = cleanString(obj.area, 50);
    const note = cleanString(obj.note, 80);
    if (!name) continue;
    const dedupeKey = `${name}::${area}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    items.push({
      name,
      area,
      note: note || undefined,
    });
    if (items.length >= 3) break;
  }
  return items;
}

function extractFirstJsonObject(rawText: string): RawAiGroundPayload | null {
  const cleaned = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  if (firstBrace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = firstBrace; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = cleaned.slice(firstBrace, i + 1);
        try {
          const parsed = JSON.parse(candidate) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as RawAiGroundPayload;
          }
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function extractGroundingSources(
  webChunks: ReadonlyArray<GeminiGroundingChunk>,
  mapsProbe: MapsGroundingProbeResult | null,
  placesResult: PlacesTextSearchResult | null,
  resolvedAreaPrefix: string
): {
  sources: GroundAiSourceLink[];
  bestMapsUrl: string | null;
} {
  const seenUrls = new Set<string>();
  const links: GroundAiSourceLink[] = [];
  let bestMapsUrl: string | null = placesResult?.googleMapsUri || null;

  if (placesResult?.googleMapsUri && /^https?:\/\//i.test(placesResult.googleMapsUri)) {
    seenUrls.add(placesResult.googleMapsUri);
    links.push({
      title: `Google マップ: ${placesResult.displayName || "施設ピン"}`,
      url: placesResult.googleMapsUri,
      kind: "maps",
    });
  }

  // Google Maps Grounding chunks（自治体エリアが食い違う対岸POIは除外して正確なピンを採用）
  const mapChunks = mapsProbe?.chunks || [];
  const mapsProbeArea = mapsProbe?.address ? extractAreaPrefix(mapsProbe.address) : "";
  const isSameAreaAsWeb =
    !resolvedAreaPrefix ||
    !mapsProbeArea ||
    resolvedAreaPrefix === mapsProbeArea ||
    Boolean(mapsProbe?.address?.includes(resolvedAreaPrefix)) ||
    resolvedAreaPrefix.includes(mapsProbeArea);

  if (isSameAreaAsWeb) {
    for (const ch of mapChunks) {
      const mapsUri = typeof ch?.maps?.uri === "string" ? ch.maps.uri.trim() : "";
      if (!mapsUri || !/^https?:\/\//i.test(mapsUri)) continue;
      if (!bestMapsUrl) {
        bestMapsUrl = mapsUri;
      }
      if (seenUrls.has(mapsUri)) continue;
      seenUrls.add(mapsUri);
      const mapsTitle =
        typeof ch?.maps?.title === "string" && ch.maps.title.trim()
          ? `Google マップ: ${ch.maps.title.trim()}`
          : "Google マップ (施設地点)";
      links.push({
        title: mapsTitle.slice(0, 80),
        url: mapsUri,
        kind: "maps",
      });
      break;
    }
  }

  if (placesResult?.websiteUri && /^https?:\/\//i.test(placesResult.websiteUri)) {
    if (!seenUrls.has(placesResult.websiteUri)) {
      seenUrls.add(placesResult.websiteUri);
      let host = placesResult.websiteUri;
      try {
        host = new URL(placesResult.websiteUri).hostname;
      } catch {
        // ignore
      }
      links.push({
        title: host.slice(0, 80),
        url: placesResult.websiteUri,
        kind: OFFICIAL_DOMAIN_PATTERN.test(host) ? "official" : "web",
      });
    }
  }

  // Web Search Grounding chunks（自治体・公園協会等の公式ドメインを最優先ソート＆汎用コインパSEO除外）
  const webCandidates: GroundAiSourceLink[] = [];
  for (const ch of webChunks) {
    const uri = typeof ch?.web?.uri === "string" ? ch.web.uri.trim() : "";
    if (!uri || !/^https?:\/\//i.test(uri) || seenUrls.has(uri)) continue;
    seenUrls.add(uri);
    const rawTitle =
      typeof ch?.web?.title === "string" && ch.web.title.trim()
        ? ch.web.title.trim()
        : (() => {
            try {
              return new URL(uri).hostname;
            } catch {
              return "Web参照元";
            }
          })();

    const isCoinParkingAggregator = /(times-info\.net|akippa\.com|toku-p\.jp|repark\.jp)/i.test(
      `${rawTitle} ${uri}`
    );
    if (isCoinParkingAggregator) continue;

    const isOfficial = OFFICIAL_DOMAIN_PATTERN.test(`${rawTitle} ${uri}`);
    webCandidates.push({
      title: rawTitle.slice(0, 80),
      url: uri,
      kind: isOfficial ? "official" : "web",
    });
  }

  webCandidates.sort((a, b) => {
    if (a.kind === "official" && b.kind !== "official") return -1;
    if (a.kind !== "official" && b.kind === "official") return 1;
    return 0;
  });

  for (const wc of webCandidates) {
    if (links.length >= 5) break;
    links.push(wc);
  }

  return { sources: links, bestMapsUrl };
}

function buildGoogleMapsSearchUrl(
  name: string,
  address: string,
  bestMapsUrl: string | null,
  placesResult: PlacesTextSearchResult | null
): string {
  if (bestMapsUrl && /^https?:\/\//i.test(bestMapsUrl)) {
    return bestMapsUrl;
  }
  if (
    placesResult &&
    typeof placesResult.latitude === "number" &&
    typeof placesResult.longitude === "number"
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${name} ${placesResult.latitude},${placesResult.longitude}`
    )}`;
  }
  const cleanAddr = stripRiverbedAmbiguousSuffix(address);
  const query = cleanAddr ? `${name} ${cleanAddr}` : name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query.trim()
  )}`;
}

async function loadTeamRegionContext(
  env: WorkerEnv,
  teamId?: string
): Promise<TeamRegionContext> {
  const emptyCtx: TeamRegionContext = {
    clubName: "",
    clubCategory: "",
    homeGround: "",
    frequentAreas: [],
    mapsApiKey:
      (env.GOOGLE_MAPS_API_KEY || "").trim() ||
      (env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim() ||
      null,
  };

  if (!teamId || teamId === "demo-team") {
    return emptyCtx;
  }

  try {
    const db = drizzle(env.DB);
    const [teamRow, venueRows] = await Promise.all([
      db
        .select({
          name: teams.name,
          homeGround: teams.homeGround,
          organizationId: teams.organizationId,
          orgName: organizations.name,
          orgCategory: organizations.category,
          orgMapsKey: organizations.googleMapsApiKey,
        })
        .from(teams)
        .leftJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(eq(teams.id, teamId))
        .get(),
      db
        .select({
          address: venues.address,
        })
        .from(venues)
        .limit(40)
        .all(),
    ]);

    const areaCount = new Map<string, number>();
    for (const v of venueRows) {
      const addr = (v.address || "").trim();
      const areaPrefix = extractAreaPrefix(addr);
      if (areaPrefix) {
        areaCount.set(areaPrefix, (areaCount.get(areaPrefix) || 0) + 1);
      }
    }

    const frequentAreas = Array.from(areaCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([area]) => area);

    const resolvedMapsKey =
      (env.GOOGLE_MAPS_API_KEY || "").trim() ||
      (teamRow?.orgMapsKey || "").trim() ||
      (env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim() ||
      null;

    return {
      clubName: (teamRow?.orgName || teamRow?.name || "").trim(),
      clubCategory: (teamRow?.orgCategory || "").trim(),
      homeGround: (teamRow?.homeGround || "").trim(),
      frequentAreas,
      mapsApiKey: resolvedMapsKey,
    };
  } catch {
    return emptyCtx;
  }
}

function buildTownMatchVariants(rawRemainder: string): string[] {
  const base = stripRiverbedAmbiguousSuffix(
    rawRemainder
      .replace(/^[\s　]+/, "")
      .replace(/^(?:大字|字)/, "")
      .trim()
  );
  if (!base) return [];

  const variants = new Set<string>([base]);

  // 漢数字「一丁目」⇔ 算用数字「1丁目」の双方に対応
  let toArabic = base;
  let toKanji = base;
  for (const [kanji, digit] of KANJI_DIGITS) {
    toArabic = toArabic.replace(new RegExp(`${kanji}(?=丁目)`, "g"), digit);
    toKanji = toKanji.replace(new RegExp(`${digit}(?=丁目)`, "g"), kanji);
  }
  variants.add(toArabic);
  variants.add(toKanji);

  return Array.from(variants);
}

/**
 * 日本郵便データ準拠の町域郵便番号API（HeartRails Geo API・キー不要）で正確な7桁郵便番号を照合
 */
async function resolveOfficialJapanPostalCode(
  addressOrBody: string
): Promise<{ primaryPostal: string; candidates: string[] } | null> {
  const parsed = parseJapanMunicipality(addressOrBody);
  if (!parsed || !parsed.remainder) return null;

  const cacheKey = `${parsed.prefecture}:${parsed.city}`;
  let towns = TOWN_POSTAL_CACHE.get(cacheKey);

  if (!towns) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_200);
    try {
      const url = `https://geoapi.heartrails.com/api/json?method=getTowns&prefecture=${encodeURIComponent(
        parsed.prefecture
      )}&city=${encodeURIComponent(parsed.city)}`;
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        const json = (await res.json()) as {
          response?: {
            location?: Array<{
              town?: string;
              postal?: string;
            }>;
          };
        };
        const rawLocations = json.response?.location || [];
        const validEntries: HeartRailsTownPostalEntry[] = [];
        for (const loc of rawLocations) {
          const town = typeof loc.town === "string" ? loc.town.trim() : "";
          const postal = typeof loc.postal === "string" ? loc.postal.trim() : "";
          if (
            !town ||
            town === "（その他）" ||
            town.includes("以下に掲載がない場合") ||
            !/^\d{7}$/.test(postal) ||
            postal.endsWith("0000")
          ) {
            continue;
          }
          validEntries.push({
            town,
            postal: `${postal.slice(0, 3)}-${postal.slice(3)}`,
          });
        }
        // 最長一致を優先するため町域名が長い順にソート
        validEntries.sort((a, b) => b.town.length - a.town.length);
        if (TOWN_POSTAL_CACHE.size >= 80) {
          const oldestKey = TOWN_POSTAL_CACHE.keys().next().value;
          if (oldestKey) TOWN_POSTAL_CACHE.delete(oldestKey);
        }
        TOWN_POSTAL_CACHE.set(cacheKey, validEntries);
        towns = validEntries;
      }
    } catch {
      // ignore network timeout and fall back to grounded postal code
    } finally {
      clearTimeout(timer);
    }
  }

  if (!towns || towns.length === 0) return null;

  const variants = buildTownMatchVariants(parsed.remainder);
  if (variants.length === 0) return null;

  let matchedTownName: string | null = null;
  for (const entry of towns) {
    if (variants.some((v) => v.startsWith(entry.town))) {
      matchedTownName = entry.town;
      break;
    }
  }

  if (!matchedTownName) return null;

  const matchingCodes = Array.from(
    new Set(
      towns
        .filter((e) => e.town === matchedTownName)
        .map((e) => e.postal)
    )
  );
  if (matchingCodes.length === 0) return null;

  return {
    primaryPostal: matchingCodes[0],
    candidates: matchingCodes,
  };
}

async function enrichAddressWithPostalCode(
  rawAddress: string,
  placesHint: PlacesTextSearchResult | null
): Promise<string> {
  const { postal: existingPostal, body } = splitPostalAndAddressBody(rawAddress);
  if (!body) return "";

  const placesSplit = placesHint?.formattedAddress
    ? splitPostalAndAddressBody(placesHint.formattedAddress)
    : { postal: null, body: "" };
  const targetArea = extractAreaPrefix(body);
  const placesArea = placesSplit.body ? extractAreaPrefix(placesSplit.body) : "";
  const validPlacesPostal =
    placesSplit.postal && targetArea && targetArea === placesArea
      ? placesSplit.postal
      : null;

  const officialLookup = await resolveOfficialJapanPostalCode(body);

  let bestPostal: string | null = null;
  if (validPlacesPostal) {
    bestPostal = validPlacesPostal;
  } else if (officialLookup) {
    if (officialLookup.candidates.length === 1) {
      // 町域に対して単一の日本郵便番号が確定している場合は公式番号を採用（AIの桁誤認を完全防止）
      bestPostal = officialLookup.primaryPostal;
    } else if (
      existingPostal &&
      officialLookup.candidates.includes(existingPostal)
    ) {
      bestPostal = existingPostal;
    } else {
      bestPostal = existingPostal || officialLookup.primaryPostal;
    }
  } else {
    bestPostal = existingPostal;
  }

  return bestPostal ? `〒${bestPostal} ${body}` : body;
}

/**
 * 国土地理院（GSI）住所検索APIで地域アンカー座標を取得（APIキー不要・Google Maps Grounding の位置バイアス用）
 */
async function resolveJapanGeoAnchor(queryText: string): Promise<GeoAnchor | null> {
  const stripped = splitPostalAndAddressBody(queryText).body || queryText.trim();
  const q = stripped.trim();
  if (!q) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_800);
  try {
    const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: { title?: string };
    }>;
    const first = arr?.[0];
    const coords = first?.geometry?.coordinates;
    if (
      Array.isArray(coords) &&
      coords.length >= 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      return {
        longitude: coords[0],
        latitude: coords[1],
        label: first?.properties?.title || q,
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function queryGooglePlacesIfAvailable(
  mapsApiKey: string | null,
  inputName: string,
  areaHint: string,
  currentAddress: string,
  frequentAreas: ReadonlyArray<string>
): Promise<PlacesTextSearchResult | null> {
  if (!mapsApiKey) return null;

  const regionPart =
    areaHint ||
    extractAreaPrefix(currentAddress) ||
    (frequentAreas.length > 0 ? frequentAreas[0] : "");
  const textQuery = regionPart ? `${inputName} ${regionPart}` : inputName;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_500);

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": mapsApiKey,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.googleMapsUri,places.websiteUri,places.location",
      },
      signal: controller.signal,
      body: JSON.stringify({
        textQuery,
        languageCode: "ja",
        regionCode: "JP",
        maxResultCount: 1,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      places?: Array<{
        displayName?: { text?: string };
        formattedAddress?: string;
        googleMapsUri?: string;
        websiteUri?: string;
        location?: { latitude?: number; longitude?: number };
      }>;
    };
    const top = json.places?.[0];
    if (!top) return null;

    return {
      displayName: top.displayName?.text,
      formattedAddress: top.formattedAddress
        ? normalizeAddressForDisplay(top.formattedAddress)
        : undefined,
      googleMapsUri: top.googleMapsUri,
      websiteUri: top.websiteUri,
      latitude: top.location?.latitude,
      longitude: top.location?.longitude,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 並列タスクB: Gemini Google Maps Grounding (`tools: [{ googleMaps: {} }]`) で正確なPOIリンク・番地を取得
 * Web検索タスクと並列実行されるため追加待ち時間はゼロ。失敗してもWeb検索側を一切ブロックしない。
 */
async function probeGoogleMapsGrounding(params: {
  apiKey: string;
  inputName: string;
  regionHintText: string;
  geoAnchor: GeoAnchor | null;
}): Promise<MapsGroundingProbeResult | null> {
  const { apiKey, inputName, regionHintText, geoAnchor } = params;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11_000);

  try {
    const mapPrompt = [
      `日本の野球場・スポーツ施設・学校「${inputName}」${regionHintText ? `（地域ヒント: ${regionHintText}）` : ""}のGoogleマップ上の正確な施設名と所在地（都道府県〜番地）を特定し、以下のJSONのみを返してください:`,
      '{"placeTitle": "施設名", "address": "都道府県からの所在地"}',
    ].join("\n");

    const payload: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: mapPrompt }] }],
      tools: [{ googleMaps: {} }],
      generationConfig: {
        temperature: 0.05,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    if (geoAnchor) {
      payload.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: geoAnchor.latitude,
            longitude: geoAnchor.longitude,
          },
        },
      };
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as GeminiGenerateResponse;
    const cand = data.candidates?.[0];
    const chunks = cand?.groundingMetadata?.groundingChunks || [];
    const text = (cand?.content?.parts || [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text || "")
      .join("\n")
      .trim();

    const parsed = extractFirstJsonObject(text) as {
      placeTitle?: unknown;
      address?: unknown;
    } | null;

    const firstMapChunk = chunks.find(
      (c) => typeof c?.maps?.uri === "string" && c.maps.uri.trim().length > 0
    );

    return {
      placeTitle:
        cleanString(parsed?.placeTitle, 100) ||
        firstMapChunk?.maps?.title?.trim(),
      address: parsed?.address
        ? normalizeAddressForDisplay(cleanString(parsed.address, 140))
        : undefined,
      mapsUri: firstMapChunk?.maps?.uri?.trim(),
      chunks,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildLookupPrompt(params: {
  inputName: string;
  areaHint: string;
  currentCategory?: string;
  currentAddress: string;
  currentShortName: string;
  teamCtx: TeamRegionContext;
  placesHint: PlacesTextSearchResult | null;
}): string {
  const {
    inputName,
    areaHint,
    currentCategory,
    currentAddress,
    currentShortName,
    teamCtx,
    placesHint,
  } = params;

  const contextLines: string[] = [
    `- 入力された施設・球場名: ${inputName}`,
  ];

  if (areaHint) {
    contextLines.push(`- ユーザー指定の地域ヒント（最優先）: ${areaHint}`);
  }
  if (currentAddress && currentAddress !== "住所未登録") {
    contextLines.push(`- 現在の登録済み住所ヒント: ${currentAddress}`);
  }
  if (currentShortName) {
    contextLines.push(`- 現在の登録略称: ${currentShortName}`);
  }
  if (currentCategory === "home") {
    contextLines.push(`- 施設区分ヒント: 本拠地・ホームグラウンド (home)`);
  }
  if (teamCtx.frequentAreas.length > 0 && !areaHint && !currentAddress) {
    contextLines.push(
      `- チームの主な活動エリア参考（同名施設が複数ある場合の優先地域）: ${teamCtx.frequentAreas.join(" / ")}`
    );
  }
  if (teamCtx.clubCategory && teamCtx.clubCategory !== "other") {
    contextLines.push(`- チームの競技種別参考: ${teamCtx.clubCategory}`);
  }
  if (placesHint) {
    contextLines.push(
      `- Google Places 事前照合データ: 名称="${placesHint.displayName || ""}", 住所="${placesHint.formattedAddress || ""}", 公式Web="${placesHint.websiteUri || "なし"}"`
    );
  }

  return [
    "あなたは日本の少年野球・中学硬式野球・草野球チームの遠征・施設管理を支援する、球場・スポーツ施設リサーチの専門調査官です。",
    "Google検索を用いて、指定された野球場・河川敷グラウンド・学校校庭・室内練習場の「自治体公式ページ（.lg.jp等）」「公園緑地協会・指定管理者の利用案内」「野球連盟の球場案内」を徹底調査し、現場の指導者・保護者がそのまま使える正確な施設情報をJSONで返してください。",
    "",
    "【調査対象の施設・コンテキスト】",
    ...contextLines,
    "",
    "【調査・検証の厳守プロトコル（精度最優先・ハルシネーション絶対禁止）】",
    "1. 施設同一性の厳格なクロスチェック（対岸・近隣別施設との混同防止）:",
    "   - 特に河川敷（多摩川・荒川・江戸川・鶴見川・淀川など）や大規模公園では、対岸の別自治体の球場（例: 川崎市中原区側と東京都大田区田園調布側など）や、同じ河川敷内の「硬式専用球場」と「軟式広場（第1〜第3面など）」を取り違えないよう、必ず【同一の市区町村・同一の施設名】の情報だけを統合してください。",
    "   - 同名・類似名の別施設（対岸の球場、同公園内の軟式面/硬式面、他県の同名市民球場など）が存在する場合は、情報を混ぜずに `alternatives` 配列（最大3件）に別候補として切り出してください。",
    "2. 駐車場情報（parkingInfo）の厳格ルール:",
    "   - 必ず「その施設専用または所属公園・河川敷の公式駐車場」の有無・駐車場名・料金・開放時間・進入路の注意（右折進入不可、川崎側/東京側スロープ指定、車高制限等）・チーム台数制限を記載してください。",
    "   - times-info / akippa / 特P / NAVITIME 等のコインパーキング検索サイトの無関係な周辺コインパーキング名を列挙することは【絶対禁止】です（公式に「専用駐車場なし・近隣コインパーキング利用」と案内されている場合のみ、その旨を簡潔に記載してください）。",
    "3. スパイク規定（spikeRule）の重点検索:",
    "   - 公式利用案内・施設規約・連盟規定から「金属（金具）スパイク禁止 / 金具スパイク可 / ポイントスパイク・トレシュー限定 / 人工芝のため金具不可 / 室内履きのみ」等の規定を検索してください。",
    "   - 裏付けが取れた事実のみを簡潔に記載し、公式情報で確認できない場合は推測せず必ず空文字 \"\" にしてください。",
    "4. 施設設備・諸注意メモ（notes）の実用特化（歴史・雑学の完全排除）:",
    "   - 「かつて〇〇球団の二軍本拠地だった」「〇〇クラブの本拠地」等の歴史・雑学・Wikipedia的トリビアは一切書かないでください。",
    "   - 野球の現場で必要な実務情報（両翼・中堅の広さ、照明有無、電光/手書きスコアボード、ベンチ屋根・観客席・日陰の有無、トイレ・水道・更衣室・自販機の有無、河川増水時や雨天翌日の利用制限、敷地内禁煙・ゴミ持ち帰り規定など）のみを端的にまとめてください。",
    "5. surface は必ず次の5択のいずれか完全一致で出力してください:",
    '   - "土 (クレー)"',
    '   - "人工芝"',
    '   - "天然芝"',
    '   - "土 (内野) / 天然芝 (外野)"',
    '   - "その他"',
    '6. category は "stadium"（公営球場・公園・河川敷・専用球場）, "school"（小中高大の学校グラウンド）, "indoor"（室内練習場・ドーム）, "home" のいずれか1つにしてください。',
    "7. verifiedFields には、自治体・指定管理者公式情報で明確に裏付けが取れた項目キー（name, shortName, category, surface, address, parkingInfo, spikeRule, notes のうち該当するもの）を配列で列挙してください。",
    "8. 出力は説明文やマークダウンを含めず、以下のキーを持つ純粋なJSONオブジェクト1つのみを返してください:",
    "{",
    '  "name": "正式な施設・球場名",',
    '  "shortName": "予定表バッジ用の4〜10文字の略称",',
    '  "category": "stadium | school | indoor | home",',
    '  "surface": "5択のいずれか",',
    '  "address": "郵便番号（〒XXX-XXXX）付きの都道府県からの正確な所在地（例: 〒000-0000 〇〇県〇〇市... / 公式に郵便番号が確認できない場合は都道府県からの所在地のみ記載し推測で番号を作らないこと）",',
    '  "parkingInfo": "公式駐車場の有無・料金・開放時間・進入路注意・台数制限（不明なら空文字）",',
    '  "spikeRule": "公式確認できたスパイク・靴規定（不明なら空文字）",',
    '  "notes": "現場運営に必要な設備・広さ・トイレ・屋根・利用制限メモ（不明なら空文字）",',
    '  "confidence": "high | medium | low",',
    '  "summaryNote": "特定した自治体・施設根拠の1行要約（同名他候補がある場合はその旨も簡潔に）",',
    '  "verifiedFields": ["name", "address", "surface"],',
    '  "alternatives": [',
    '    { "name": "紛らわしい近隣・同名の別施設名", "area": "〇〇県〇〇市", "note": "軟式面 / 対岸の別施設 など" }',
    "  ]",
    "}",
  ].join("\n");
}

/**
 * POST /api/liff/grounds/ai-lookup
 * 並列デュアルグラウンディング（Web公式検索 × Google Maps POI特定 × チーム活動地域コンテキスト）
 */
liffGroundsAiRouter.post("/", async (c) => {
  let body: GroundAiLookupRequestBody;
  try {
    body = await c.req.json<GroundAiLookupRequestBody>();
  } catch {
    return c.json({ success: false, error: "リクエスト形式が不正です" }, 400);
  }

  const inputName = typeof body.name === "string" ? body.name.trim() : "";
  const areaHint = typeof body.areaHint === "string" ? body.areaHint.trim() : "";
  const currentCategory =
    typeof body.currentCategory === "string" ? body.currentCategory.trim() : undefined;
  const currentAddress =
    typeof body.currentAddress === "string" ? body.currentAddress.trim() : "";
  const currentShortName =
    typeof body.currentShortName === "string" ? body.currentShortName.trim() : "";
  const teamId = typeof body.teamId === "string" ? body.teamId.trim() : undefined;

  if (!inputName) {
    return c.json(
      { success: false, error: "施設・球場名を入力してからAI取得を実行してください" },
      400
    );
  }

  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json(
      {
        success: false,
        error: "AI検索用のAPIキー（GEMINI_API_KEY）がサーバーに設定されていません",
      },
      503
    );
  }

  const overallStart = Date.now();
  const MAX_BUDGET_MS = 45_000;

  const teamCtx = await loadTeamRegionContext(c.env, teamId);
  const effectiveRegionHint =
    areaHint ||
    extractAreaPrefix(currentAddress) ||
    (teamCtx.frequentAreas.length > 0 ? teamCtx.frequentAreas[0] : "");

  // 座標アンカー（国土地理院API）と Google Places 事前照合を高速並列取得
  const [geoAnchor, placesHint] = await Promise.all([
    resolveJapanGeoAnchor(effectiveRegionHint || inputName),
    queryGooglePlacesIfAvailable(
      teamCtx.mapsApiKey,
      inputName,
      areaHint,
      currentAddress,
      teamCtx.frequentAreas
    ),
  ]);

  const prompt = buildLookupPrompt({
    inputName,
    areaHint,
    currentCategory,
    currentAddress,
    currentShortName,
    teamCtx,
    placesHint,
  });

  // 🗺️ Google Maps Grounding プローブを裏で並列起動（Web検索と完全同時進行のため待ち時間ゼロ）
  const mapsProbePromise = probeGoogleMapsGrounding({
    apiKey,
    inputName,
    regionHintText: effectiveRegionHint,
    geoAnchor,
  });

  let lastErrorMsg = "AIからの応答を取得できませんでした";
  let skipGoogleSearch = false;

  for (const spec of WEB_SEARCH_MODEL_ATTEMPTS) {
    if (spec.useGoogleSearch && skipGoogleSearch) continue;

    const remainingMs = MAX_BUDGET_MS - (Date.now() - overallStart);
    if (remainingMs < 4_500) break;

    const cooldownKey = `${spec.model}:${spec.useGoogleSearch ? "gs" : "plain"}`;
    const cooldownUntil = MODEL_COOLDOWN.get(cooldownKey) || 0;
    if (Date.now() < cooldownUntil) continue;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      Math.min(spec.timeoutMs, remainingMs)
    );

    try {
      const generationConfig: Record<string, unknown> = {
        temperature: 0.05,
      };
      if (!spec.useGoogleSearch) {
        generationConfig.responseMimeType = "application/json";
      }
      if (spec.thinkingBudget !== null) {
        generationConfig.thinkingConfig = {
          thinkingBudget: spec.thinkingBudget,
        };
      }

      const requestPayload: Record<string, unknown> = {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig,
      };

      if (spec.useGoogleSearch) {
        requestPayload.tools = [{ google_search: {} }];
      }

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${spec.model}:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(requestPayload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (res.status === 404 || res.status === 429 || res.status === 503) {
          MODEL_COOLDOWN.set(cooldownKey, Date.now() + 45_000);
        }
        if (spec.useGoogleSearch && (res.status === 429 || res.status === 403)) {
          skipGoogleSearch = true;
        }
        lastErrorMsg = `AI検索エラー (${res.status})`;
        console.warn(`[grounds-ai] ${spec.model} failed (${res.status}):`, errText.slice(0, 220));
        continue;
      }

      const data = (await res.json()) as GeminiGenerateResponse;
      const firstCandidate = data.candidates?.[0];
      const parts = firstCandidate?.content?.parts || [];
      const combinedText = parts
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text || "")
        .join("\n")
        .trim();

      const extracted = extractFirstJsonObject(combinedText);
      if (!extracted) {
        lastErrorMsg = "AI応答の解析に失敗しました";
        continue;
      }

      // 並列起動していた Google Maps Grounding の結果を合流
      const mapsProbe = await mapsProbePromise;
      const webChunks = firstCandidate?.groundingMetadata?.groundingChunks || [];

      const resolvedName =
        cleanString(extracted.name, 120) ||
        placesHint?.displayName ||
        mapsProbe?.placeTitle ||
        inputName;
      const resolvedShortName =
        cleanString(extracted.shortName, 40) || resolvedName.slice(0, 10);
      const resolvedCategory = normalizeCategory(
        extracted.category,
        resolvedName,
        currentCategory
      );
      const resolvedSurface = normalizeSurface(extracted.surface);
      const webAddress = normalizeAddressForDisplay(cleanString(extracted.address, 160));
      const webAreaPrefix = extractAreaPrefix(webAddress);

      // Web公式住所が「〜地内・地先」等で番地を持たない場合、同一市区町村のGoogle Maps番地で補完
      const mapsAddr = mapsProbe?.address || "";
      const mapsAreaPrefix = extractAreaPrefix(mapsAddr);
      const canUseMapsAddress =
        Boolean(mapsAddr) &&
        (!webAddress ||
          ((webAddress.endsWith("地内") || webAddress.endsWith("地先")) &&
            webAreaPrefix &&
            webAreaPrefix === mapsAreaPrefix));

      const baseAddress =
        (canUseMapsAddress ? mapsAddr : webAddress) ||
        placesHint?.formattedAddress ||
        mapsAddr ||
        "";

      const resolvedAddress = baseAddress
        ? await enrichAddressWithPostalCode(baseAddress, placesHint)
        : "";

      const { sources, bestMapsUrl } = extractGroundingSources(
        webChunks,
        mapsProbe,
        placesHint,
        extractAreaPrefix(resolvedAddress)
      );

      const resolvedParking = cleanString(extracted.parkingInfo, 300);
      const resolvedSpikeRule = cleanString(extracted.spikeRule, 220);
      const resolvedNotes = cleanString(extracted.notes, 360);
      const resolvedConfidence = normalizeConfidence(extracted.confidence);
      const resolvedSummary = cleanString(extracted.summaryNote, 200);
      const mapsVerified = Boolean(bestMapsUrl);
      const hasWebSources = spec.useGoogleSearch && webChunks.length > 0;
      const verifiedFields = normalizeVerifiedFields(
        extracted.verifiedFields,
        mapsVerified,
        hasWebSources
      );
      const alternatives = normalizeAlternatives(extracted.alternatives).filter(
        (alt) => alt.name !== resolvedName
      );

      const candidateResult: GroundAiLookupResult = {
        name: resolvedName,
        shortName: resolvedShortName,
        category: resolvedCategory,
        surface: resolvedSurface,
        address: resolvedAddress,
        mapUrl: buildGoogleMapsSearchUrl(
          resolvedName,
          resolvedAddress,
          bestMapsUrl,
          placesHint
        ),
        parkingInfo: resolvedParking,
        spikeRule: resolvedSpikeRule,
        notes: resolvedNotes,
        confidence: resolvedConfidence,
        summaryNote: resolvedSummary,
        mapsVerified,
        verifiedFields,
        alternatives,
        sources,
      };

      return c.json({
        success: true,
        model: spec.model,
        grounded: hasWebSources || mapsVerified,
        mapsGrounded: mapsVerified,
        candidate: candidateResult,
      });
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastErrorMsg = isAbort
        ? "施設情報の検索がタイムアウトしました。もう一度お試しください"
        : err instanceof Error
          ? err.message
          : "施設情報の取得中にエラーが発生しました";
      console.warn(`[grounds-ai] ${spec.model} exception:`, lastErrorMsg);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return c.json(
    {
      success: false,
      error:
        lastErrorMsg ||
        "施設情報を取得できませんでした。施設名や地域ヒントを確認してください。",
    },
    502
  );
});

export default liffGroundsAiRouter;
