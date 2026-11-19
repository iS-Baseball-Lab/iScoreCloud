// filepath: src/lib/team-access.ts
import type { Context, MiddlewareHandler } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, inArray, or } from "drizzle-orm";
import {
  account,
  events,
  eventCarpools,
  galleryAlbums,
  galleryPhotos,
  lineupTemplates,
  matches,
  memberCars,
  organizationMembers,
  parentChildRelations,
  playLogs,
  players,
  relatedTeams,
  teamDocuments,
  teamEquipments,
  teamFaqs,
  teamLinks,
  teamMembers,
  teamRules,
  teams,
  user,
} from "@/db/schema";
import { ensureAuthSchema, getAuth } from "@/lib/auth";
import {
  ROLES,
  canEditScore,
  canManageTeam,
  canViewInternalData,
} from "@/lib/roles";
import type { WorkerEnv } from "@/types/api";

export const IGNORED_MOCK_USER_IDS = new Set([
  "cached-user",
  "mock-user-12345",
  "undefined",
  "null",
]);

const STAFF_ROSTER_ROLES = new Set<string>([
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.COACH,
  ROLES.SCORER,
  ROLES.STAFF,
]);

const LIFF_SESSION_COOKIE_NAME = "iscore_liff_session";
const LIFF_SESSION_TTL_SECONDS = 60 * 60 * 24 * 180; // 180日間（Better-Auth セッションと同等）
const LINE_ACCESS_TOKEN_CACHE_MAX = 500;
const LINE_VERIFY_TIMEOUT_MS = 5_000;

export interface ResolvedSessionUser {
  id: string;
  name: string;
  email: string;
  image?: string;
  role: string;
}

export interface TeamRoleGrant {
  memberId: string;
  role: string;
  subRoles: string[];
}

export interface CallerTeamAccess {
  sessionUser: ResolvedSessionUser | null;
  primaryUserId: string;
  primaryUserName: string;
  headerUserId: string;
  headerUserName: string;
  candidateUserIds: string[];
  isAuthenticated: boolean;
  isSystemAdmin: boolean;
  activeTeamIds: Set<string>;
  activeOrgIds: Set<string>;
  managedTeamIds: Set<string>;
  scoreEditableTeamIds: Set<string>;
  playerManageableTeamIds: Set<string>;
  mutableTeamIds: Set<string>;
  teamRoles: Map<string, TeamRoleGrant>;
  canAccessTeam: (teamId: string | null | undefined) => boolean;
  canManageTeamId: (teamId: string | null | undefined) => boolean;
  canEditScoreForTeam: (teamId: string | null | undefined) => boolean;
  canManagePlayersForTeam: (teamId: string | null | undefined) => boolean;
  canMutateTeamData: (teamId: string | null | undefined) => boolean;
  canAccessOrganization: (orgId: string | null | undefined) => boolean;
}

interface VerifiedRequestIdentity {
  sessionUser: ResolvedSessionUser | null;
  userId: string;
  userName: string;
  issuedSessionToken: string | null;
  clearInvalidSessionProof: boolean;
}

interface LiffSessionProofPayload {
  uid: string;
  name?: string;
  iat: number;
  exp: number;
}

interface CachedLineTokenEntry {
  uid: string;
  name: string;
  picture?: string;
  expiresAtMs: number;
}

const requestAccessCache = new WeakMap<Request, Promise<CallerTeamAccess>>();
const verifiedIdentityCache = new WeakMap<
  Request,
  Promise<VerifiedRequestIdentity>
>();
const hmacKeyCache = new Map<string, Promise<CryptoKey>>();
const lineAccessTokenCache = new Map<string, CachedLineTokenEntry>();

export function isDemoTeamId(teamId: string | null | undefined): boolean {
  return teamId === "demo-team";
}

export function isDemoEntityId(id: string | null | undefined): boolean {
  if (!id) return false;
  return (
    id === "demo-team" ||
    id === "convoy-test" ||
    id.startsWith("demo-") ||
    id.startsWith("venue-") ||
    id.startsWith("test-cp-")
  );
}

export function sanitizeCallerUserId(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed || IGNORED_MOCK_USER_IDS.has(trimmed)) return "";
  return trimmed;
}

export function extractHeaderUserId(c: Context): string {
  return sanitizeCallerUserId(c.req.header("x-liff-user-id"));
}

export function extractHeaderUserName(c: Context): string {
  const raw = c.req.header("x-liff-user-name");
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export function parseSubRolesList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    // カンマ区切り等の旧形式フォールバック
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLocalDevHost(url: URL): boolean {
  const h = url.hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function resolveSessionSigningSecret(env: WorkerEnv, reqUrl: URL): string {
  const procSecret =
    typeof process !== "undefined" && process.env
      ? process.env.BETTER_AUTH_SECRET || ""
      : "";
  const explicit = (
    env.BETTER_AUTH_SECRET ||
    procSecret ||
    env.LINE_CLIENT_SECRET ||
    env.LINE_CHANNEL_SECRET ||
    env.GOOGLE_CLIENT_SECRET ||
    ""
  ).trim();
  if (explicit) return explicit;
  if (isLocalDevHost(reqUrl)) {
    return "iscorecloud-local-dev-only-hmac-secret";
  }
  return "";
}

function hasProductionAuthSecrets(env: WorkerEnv): boolean {
  const procSecret =
    typeof process !== "undefined" && process.env
      ? process.env.BETTER_AUTH_SECRET || ""
      : "";
  return Boolean(
    (
      env.BETTER_AUTH_SECRET ||
      procSecret ||
      env.LINE_CLIENT_SECRET ||
      env.LINE_CHANNEL_SECRET ||
      ""
    ).trim()
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): Uint8Array | null {
  try {
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

function getHmacSigningKey(secret: string): Promise<CryptoKey> {
  const cached = hmacKeyCache.get(secret);
  if (cached) return cached;
  const keyPromise = crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  hmacKeyCache.set(secret, keyPromise);
  return keyPromise;
}

async function signLiffSessionProof(
  secret: string,
  params: { uid: string; name?: string; ttlSeconds?: number }
): Promise<string | null> {
  if (!secret || !params.uid) return null;
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload: LiffSessionProofPayload = {
      uid: params.uid,
      name: (params.name || "").trim().slice(0, 80) || undefined,
      iat: nowSec,
      exp: nowSec + (params.ttlSeconds ?? LIFF_SESSION_TTL_SECONDS),
    };
    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
    const payloadPart = toBase64Url(payloadBytes);
    const signingInput = `v1.${payloadPart}`;
    const key = await getHmacSigningKey(secret);
    const sigBuf = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signingInput)
    );
    const sigPart = toBase64Url(new Uint8Array(sigBuf));
    return `${signingInput}.${sigPart}`;
  } catch (err) {
    console.warn("[signLiffSessionProof] failed:", err);
    return null;
  }
}

async function verifyLiffSessionProof(
  secret: string,
  token: string
): Promise<{ uid: string; name: string } | null> {
  if (!secret || !token) return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;

  const signingInput = `v1.${parts[1]}`;
  const sigBytes = fromBase64Url(parts[2]);
  const payloadBytes = fromBase64Url(parts[1]);
  if (!sigBytes || !payloadBytes) return null;

  try {
    const key = await getHmacSigningKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes.buffer.slice(
        sigBytes.byteOffset,
        sigBytes.byteOffset + sigBytes.byteLength
      ) as ArrayBuffer,
      new TextEncoder().encode(signingInput)
    );
    if (!valid) return null;

    const decoded = JSON.parse(
      new TextDecoder().decode(payloadBytes)
    ) as Partial<LiffSessionProofPayload>;
    const uid = sanitizeCallerUserId(
      typeof decoded.uid === "string" ? decoded.uid : ""
    );
    const exp = typeof decoded.exp === "number" ? decoded.exp : 0;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!uid || exp <= nowSec) return null;

    return {
      uid,
      name: typeof decoded.name === "string" ? decoded.name.trim() : "",
    };
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function extractCookieValue(cookieHeader: string, cookieName: string): string {
  if (!cookieHeader) return "";
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx < 0) continue;
    const k = pair.slice(0, eqIdx).trim();
    if (k === cookieName) {
      const rawVal = pair.slice(eqIdx + 1).trim();
      try {
        return decodeURIComponent(rawVal);
      } catch {
        return rawVal;
      }
    }
  }
  return "";
}

function resolveExpectedLineClientIds(env: WorkerEnv): Set<string> {
  const ids = new Set<string>();
  const addCandidate = (raw?: string) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const channelPart = trimmed.split("-")[0]?.trim() || "";
    if (/^\d+$/.test(channelPart)) {
      ids.add(channelPart);
    }
  };
  addCandidate(env.LINE_CLIENT_ID);
  addCandidate(env.LIFF_ID);
  addCandidate(env.NEXT_PUBLIC_LIFF_ID);
  if (typeof process !== "undefined" && process.env) {
    addCandidate(process.env.NEXT_PUBLIC_LIFF_ID);
    addCandidate(process.env.LINE_CLIENT_ID);
  }
  return ids;
}

async function verifyLineAccessTokenWithLineApi(
  accessToken: string,
  env: WorkerEnv
): Promise<{ uid: string; name: string; picture?: string } | null> {
  const cleanToken = accessToken.trim();
  if (!cleanToken || cleanToken.length < 16 || cleanToken.length > 4096) {
    return null;
  }

  const cacheKey = await sha256Hex(cleanToken);
  const nowMs = Date.now();
  const cached = lineAccessTokenCache.get(cacheKey);
  if (cached) {
    if (cached.expiresAtMs > nowMs) {
      return { uid: cached.uid, name: cached.name, picture: cached.picture };
    }
    lineAccessTokenCache.delete(cacheKey);
  }

  const controller = new AbortController();
  const timerId = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, LINE_VERIFY_TIMEOUT_MS);

  try {
    const verifyRes = await fetch(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(
        cleanToken
      )}`,
      { method: "GET", signal: controller.signal }
    );
    if (!verifyRes.ok) return null;

    const verifyJson = (await verifyRes.json()) as {
      client_id?: string | number;
      expires_in?: number;
    };
    const expiresIn =
      typeof verifyJson.expires_in === "number" ? verifyJson.expires_in : 0;
    if (expiresIn <= 0) return null;

    const expectedClientIds = resolveExpectedLineClientIds(env);
    const tokenClientId = String(verifyJson.client_id ?? "").trim();
    if (expectedClientIds.size > 0 && !expectedClientIds.has(tokenClientId)) {
      console.warn(
        `[LIFF Auth] Rejected LINE access token with mismatched client_id: ${tokenClientId}`
      );
      return null;
    }

    const profileRes = await fetch("https://api.line.me/v2/profile", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
      signal: controller.signal,
    });
    if (!profileRes.ok) return null;

    const profileJson = (await profileRes.json()) as {
      userId?: string;
      displayName?: string;
      pictureUrl?: string;
    };
    const uid = sanitizeCallerUserId(profileJson.userId);
    if (!uid) return null;
    const name = (profileJson.displayName || "").trim();
    const picture = (profileJson.pictureUrl || "").trim() || undefined;

    const ttlMs = Math.min(Math.max(expiresIn * 1000, 30_000), 15 * 60_000);
    lineAccessTokenCache.set(cacheKey, {
      uid,
      name,
      picture,
      expiresAtMs: nowMs + ttlMs,
    });
    if (lineAccessTokenCache.size > LINE_ACCESS_TOKEN_CACHE_MAX) {
      const oldestKey = lineAccessTokenCache.keys().next().value;
      if (oldestKey) lineAccessTokenCache.delete(oldestKey);
    }

    return { uid, name, picture };
  } catch (err) {
    console.warn("[verifyLineAccessTokenWithLineApi] failed:", err);
    return null;
  } finally {
    clearTimeout(timerId);
  }
}

async function computeVerifiedRequestIdentity(
  request: Request,
  env: WorkerEnv
): Promise<VerifiedRequestIdentity> {
  const reqUrl = new URL(request.url);
  const cookieHeader = request.headers.get("cookie") || "";
  const signingSecret = resolveSessionSigningSecret(env, reqUrl);

  let sessionUser: ResolvedSessionUser | null = null;
  if (cookieHeader.includes("better-auth")) {
    try {
      await ensureAuthSchema(env.DB);
      const auth = getAuth(env.DB, env);
      const session = await auth.api
        .getSession({ headers: request.headers })
        .catch(() => null);
      if (session?.user?.id) {
        const rawRole = (session.user as { role?: string }).role || "USER";
        sessionUser = {
          id: session.user.id,
          name: session.user.name || "メンバー",
          email: session.user.email || "",
          image: session.user.image || undefined,
          role: rawRole,
        };
      }
    } catch {
      sessionUser = null;
    }
  }

  const headerSessionToken = (
    request.headers.get("x-liff-session-token") || ""
  ).trim();
  const cookieSessionToken = extractCookieValue(
    cookieHeader,
    LIFF_SESSION_COOKIE_NAME
  );
  const headerAccessToken = (
    request.headers.get("x-liff-access-token") || ""
  ).trim();

  // 1. Better-Auth 正規セッションが確立している場合
  if (sessionUser?.id) {
    let issuedSessionToken: string | null = null;
    if (!headerSessionToken && !cookieSessionToken && signingSecret) {
      issuedSessionToken = await signLiffSessionProof(signingSecret, {
        uid: sessionUser.id,
        name: sessionUser.name,
      });
    }
    return {
      sessionUser,
      userId: sessionUser.id,
      userName: sessionUser.name,
      issuedSessionToken,
      clearInvalidSessionProof: false,
    };
  }

  let hadInvalidHeaderProof = false;

  // 2. クライアント保持の HMAC 署名付きセッショントークン検証（< 0.05ms、外部通信ゼロ）
  if (headerSessionToken && signingSecret) {
    const verifiedProof = await verifyLiffSessionProof(
      signingSecret,
      headerSessionToken
    );
    if (verifiedProof) {
      return {
        sessionUser: null,
        userId: verifiedProof.uid,
        userName: verifiedProof.name,
        issuedSessionToken: null,
        clearInvalidSessionProof: false,
      };
    }
    hadInvalidHeaderProof = true;
  }

  // 3. LINE アクセストークン検証（初回起動・トークン更新時のみ LINE 公式 API 照合 → 180日 HMAC トークン発行）
  if (headerAccessToken) {
    const verifiedLine = await verifyLineAccessTokenWithLineApi(
      headerAccessToken,
      env
    );
    if (verifiedLine) {
      const issuedSessionToken = signingSecret
        ? await signLiffSessionProof(signingSecret, {
            uid: verifiedLine.uid,
            name: verifiedLine.name,
          })
        : null;
      return {
        sessionUser: null,
        userId: verifiedLine.uid,
        userName: verifiedLine.name,
        issuedSessionToken,
        clearInvalidSessionProof: false,
      };
    }
  }

  // 4. HttpOnly Cookie 内の署名付きセッショントークン検証（<img> / <iframe> / 直接DL 等で自動送信）
  if (cookieSessionToken && signingSecret) {
    const verifiedCookie = await verifyLiffSessionProof(
      signingSecret,
      cookieSessionToken
    );
    if (verifiedCookie) {
      return {
        sessionUser: null,
        userId: verifiedCookie.uid,
        userName: verifiedCookie.name,
        issuedSessionToken: null,
        clearInvalidSessionProof: false,
      };
    }
  }

  // 5. 純粋なローカル開発（localhost かつ本番シークレット未設定時）のみモックヘッダーを許可
  if (isLocalDevHost(reqUrl) && !hasProductionAuthSecrets(env)) {
    const devUid = sanitizeCallerUserId(request.headers.get("x-liff-user-id"));
    let devName = "";
    const rawDevName = request.headers.get("x-liff-user-name") || "";
    if (rawDevName) {
      try {
        devName = decodeURIComponent(rawDevName).trim();
      } catch {
        devName = rawDevName.trim();
      }
    }
    if (devUid) {
      return {
        sessionUser: null,
        userId: devUid,
        userName: devName,
        issuedSessionToken: null,
        clearInvalidSessionProof: false,
      };
    }
  }

  return {
    sessionUser: null,
    userId: "",
    userName: "",
    issuedSessionToken: null,
    clearInvalidSessionProof: hadInvalidHeaderProof,
  };
}

function resolveVerifiedRequestIdentity(
  request: Request,
  env: WorkerEnv
): Promise<VerifiedRequestIdentity> {
  const cached = verifiedIdentityCache.get(request);
  if (cached) return cached;
  const promise = computeVerifiedRequestIdentity(request, env);
  verifiedIdentityCache.set(request, promise);
  return promise;
}

export function buildLiffSessionSetCookieHeader(
  token: string,
  isSecure: boolean
): string {
  const parts = [
    `${LIFF_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${LIFF_SESSION_TTL_SECONDS}`,
  ];
  if (isSecure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildClearLiffSessionCookieHeader(isSecure: boolean): string {
  const parts = [
    `${LIFF_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isSecure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/**
 * 🛡️ Worker エントリポイント用リクエスト認証サニタイザ
 * - すべての `/api/*`（`/api/auth/*`, `/api/admin/*`, `/api/matches/webhook` を除く）において、
 *   クライアント申告の未検証 `X-Liff-User-Id` / `X-Liff-User-Name` / `?userId=` / `?userName=` および
 *   `/api/liff/*` の JSON `body.userId` を、暗号学的に検証済みの本人IDで上書き（未認証時は完全除去）する。
 */
export async function sanitizeIncomingApiRequest(
  request: Request,
  env: WorkerEnv
): Promise<{
  sanitizedRequest: Request;
  issuedSessionToken: string | null;
  clearInvalidSessionProof: boolean;
}> {
  const url = new URL(request.url);
  if (
    !url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/api/auth/") ||
    url.pathname.startsWith("/api/admin/") ||
    url.pathname.startsWith("/api/matches/webhook")
  ) {
    return {
      sanitizedRequest: request,
      issuedSessionToken: null,
      clearInvalidSessionProof: false,
    };
  }

  const identity = await resolveVerifiedRequestIdentity(request, env);
  const headers = new Headers(request.headers);
  let mutated = false;

  if (identity.userId) {
    if (headers.get("x-liff-user-id") !== identity.userId) {
      headers.set("X-Liff-User-Id", identity.userId);
      mutated = true;
    }
    if (identity.userName) {
      const encodedName = encodeURIComponent(identity.userName);
      if (headers.get("x-liff-user-name") !== encodedName) {
        headers.set("X-Liff-User-Name", encodedName);
        mutated = true;
      }
    }
  } else {
    if (headers.has("x-liff-user-id")) {
      headers.delete("x-liff-user-id");
      mutated = true;
    }
    if (headers.has("x-liff-user-name")) {
      headers.delete("x-liff-user-name");
      mutated = true;
    }
  }

  if (url.searchParams.has("userId")) {
    if (identity.userId) {
      if (url.searchParams.get("userId") !== identity.userId) {
        url.searchParams.set("userId", identity.userId);
        mutated = true;
      }
    } else {
      url.searchParams.delete("userId");
      mutated = true;
    }
  }

  if (url.searchParams.has("userName")) {
    if (identity.userId && identity.userName) {
      if (url.searchParams.get("userName") !== identity.userName) {
        url.searchParams.set("userName", identity.userName);
        mutated = true;
      }
    } else if (!identity.userId) {
      url.searchParams.delete("userName");
      mutated = true;
    }
  }

  const method = request.method.toUpperCase();
  const ct = (headers.get("content-type") || "").toLowerCase();
  const contentLength = Number(headers.get("content-length") || "0");
  const isStreamingOrBinaryPath =
    ct.includes("multipart/form-data") ||
    ct.includes("application/octet-stream") ||
    ct.startsWith("image/") ||
    ct.startsWith("video/") ||
    ct.includes("application/pdf") ||
    ct.includes("application/zip") ||
    url.pathname.endsWith("/original") ||
    url.pathname.includes("/upload") ||
    url.pathname.endsWith("/photo") ||
    url.pathname.endsWith("/photos") ||
    url.pathname.endsWith("/logo") ||
    url.pathname.endsWith("/cover") ||
    contentLength > 262_144;

  let rewrittenJsonBody: string | null = null;
  if (
    url.pathname.startsWith("/api/liff/") &&
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "OPTIONS" &&
    !isStreamingOrBinaryPath
  ) {
    try {
      const rawText = await request.clone().text();
      const trimmed = rawText.trim();
      if (trimmed.startsWith("{") && trimmed.includes('"userId"')) {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const obj = parsed as Record<string, unknown>;
          if ("userId" in obj) {
            const desiredUid = identity.userId || "";
            if (obj.userId !== desiredUid) {
              obj.userId = desiredUid;
              rewrittenJsonBody = JSON.stringify(obj);
              headers.delete("content-length");
              mutated = true;
            }
          }
        }
      }
    } catch {
      // malformed JSON will be handled by downstream route handler
    }
  }

  if (!mutated) {
    return {
      sanitizedRequest: request,
      issuedSessionToken: identity.issuedSessionToken,
      clearInvalidSessionProof: identity.clearInvalidSessionProof,
    };
  }

  const baseRewritten =
    rewrittenJsonBody !== null
      ? new Request(url.toString(), {
          method: request.method,
          headers,
          body: rewrittenJsonBody,
          redirect: request.redirect,
        })
      : new Request(new Request(url.toString(), request), { headers });

  verifiedIdentityCache.set(baseRewritten, Promise.resolve(identity));
  return {
    sanitizedRequest: baseRewritten,
    issuedSessionToken: identity.issuedSessionToken,
    clearInvalidSessionProof: identity.clearInvalidSessionProof,
  };
}

/**
 * 🔑 `account` テーブルのみを介して確定済みの連携アカウントIDを双方向展開する
 * ⚠️ 未承認・未招待ユーザーの他人名義混入を防ぐため、表示名や苗字による横断推測は絶対に行わない。
 */
export async function expandLinkedUserIds(
  db: ReturnType<typeof drizzle>,
  rawIds: Array<string | null | undefined>
): Promise<string[]> {
  const idSet = new Set<string>();
  for (const raw of rawIds) {
    const clean = sanitizeCallerUserId(raw);
    if (clean) idSet.add(clean);
  }
  if (idSet.size === 0) return [];

  try {
    const initialIds = Array.from(idSet);
    const linkedRows = await db
      .select({ userId: account.userId, accountId: account.accountId })
      .from(account)
      .where(
        or(
          inArray(account.accountId, initialIds),
          inArray(account.userId, initialIds)
        )
      )
      .all();

    const newlyDiscoveredUserIds: string[] = [];
    for (const row of linkedRows) {
      const uid = sanitizeCallerUserId(row.userId);
      const aid = sanitizeCallerUserId(row.accountId);
      if (uid && !idSet.has(uid)) {
        idSet.add(uid);
        newlyDiscoveredUserIds.push(uid);
      }
      if (aid) {
        idSet.add(aid);
      }
    }

    if (newlyDiscoveredUserIds.length > 0) {
      const extraRows = await db
        .select({ accountId: account.accountId })
        .from(account)
        .where(inArray(account.userId, newlyDiscoveredUserIds))
        .all();
      for (const row of extraRows) {
        const aid = sanitizeCallerUserId(row.accountId);
        if (aid) idSet.add(aid);
      }
    }
  } catch (err) {
    console.warn("expandLinkedUserIds warning:", err);
  }

  return Array.from(idSet);
}

async function computeCallerTeamAccess(
  c: Context<{ Bindings: WorkerEnv }>
): Promise<CallerTeamAccess> {
  const db = drizzle(c.env.DB);
  const identity = await resolveVerifiedRequestIdentity(c.req.raw, c.env);
  const sessionUser = identity.sessionUser;
  const primaryUserId = identity.userId;
  const primaryUserName = identity.userName;

  // ⚠️ セキュリティ重要原則: 未検証のヘッダー・クエリ・ボディ userId は一切合算しない
  const candidateUserIds = primaryUserId
    ? await expandLinkedUserIds(db, [primaryUserId])
    : [];

  const activeTeamIds = new Set<string>();
  const activeOrgIds = new Set<string>();
  const managedTeamIds = new Set<string>();
  const scoreEditableTeamIds = new Set<string>();
  const playerManageableTeamIds = new Set<string>();
  const mutableTeamIds = new Set<string>();
  const teamRoles = new Map<string, TeamRoleGrant>();
  let isSystemAdmin = sessionUser?.role === "SYSTEM_ADMIN";

  if (candidateUserIds.length > 0) {
    const candidateSet = new Set(candidateUserIds);

    const [dbUsers, memberRows, createdTeamsRows, orgMemberRows, playerRows] =
      await db.batch([
        db
          .select({ id: user.id, role: user.role })
          .from(user)
          .where(inArray(user.id, candidateUserIds)),
        db
          .select({
            id: teamMembers.id,
            teamId: teamMembers.teamId,
            role: teamMembers.role,
            subRoles: teamMembers.subRoles,
            status: teamMembers.status,
          })
          .from(teamMembers)
          .where(inArray(teamMembers.userId, candidateUserIds)),
        db
          .select({
            id: teams.id,
            organizationId: teams.organizationId,
            createdBy: teams.createdBy,
          })
          .from(teams)
          .where(inArray(teams.createdBy, candidateUserIds)),
        db
          .select({
            organizationId: organizationMembers.organizationId,
            role: organizationMembers.role,
            status: organizationMembers.status,
          })
          .from(organizationMembers)
          .where(inArray(organizationMembers.userId, candidateUserIds)),
        db
          .select({ teamId: players.teamId })
          .from(players)
          .where(inArray(players.userId, candidateUserIds)),
      ]);

    if (dbUsers.some((u) => u.role === "SYSTEM_ADMIN")) {
      isSystemAdmin = true;
    }

    const directTeamIds = new Set<string>();
    const directOrgIds = new Set<string>();
    for (const m of memberRows) {
      if (m.teamId) directTeamIds.add(m.teamId);
    }
    for (const p of playerRows) {
      if (p.teamId) directTeamIds.add(p.teamId);
    }
    for (const ct of createdTeamsRows) {
      if (ct.id) directTeamIds.add(ct.id);
      if (ct.organizationId) directOrgIds.add(ct.organizationId);
    }
    for (const om of orgMemberRows) {
      if (om.organizationId) directOrgIds.add(om.organizationId);
    }

    const scopedTeamConditions = [];
    if (directTeamIds.size > 0) {
      scopedTeamConditions.push(inArray(teams.id, Array.from(directTeamIds)));
    }
    if (directOrgIds.size > 0) {
      scopedTeamConditions.push(
        inArray(teams.organizationId, Array.from(directOrgIds))
      );
    }

    const relevantTeamsRows =
      scopedTeamConditions.length > 0
        ? await db
            .select({
              id: teams.id,
              organizationId: teams.organizationId,
              createdBy: teams.createdBy,
            })
            .from(teams)
            .where(
              scopedTeamConditions.length === 1
                ? scopedTeamConditions[0]
                : or(...scopedTeamConditions)
            )
            .all()
        : createdTeamsRows;

    const mergedTeamsMap = new Map<
      string,
      { id: string; organizationId: string | null; createdBy: string }
    >();
    for (const t of createdTeamsRows) mergedTeamsMap.set(t.id, t);
    for (const t of relevantTeamsRows) mergedTeamsMap.set(t.id, t);

    const teamOrgById = new Map<string, string | null>();
    const teamsByOrgId = new Map<string, string[]>();
    for (const t of mergedTeamsMap.values()) {
      teamOrgById.set(t.id, t.organizationId);
      if (t.organizationId) {
        const list = teamsByOrgId.get(t.organizationId) || [];
        list.push(t.id);
        teamsByOrgId.set(t.organizationId, list);
      }
      if (t.createdBy && candidateSet.has(t.createdBy)) {
        activeTeamIds.add(t.id);
        managedTeamIds.add(t.id);
        scoreEditableTeamIds.add(t.id);
        playerManageableTeamIds.add(t.id);
        mutableTeamIds.add(t.id);
        if (t.organizationId) activeOrgIds.add(t.organizationId);
      }
    }

    const pendingOrBlockedTeams = new Set<string>();
    for (const m of memberRows) {
      if (!m.teamId) continue;
      const normalizedStatus = (m.status || "active").toLowerCase();
      const normalizedRole = (m.role || "parent").toLowerCase();
      if (normalizedStatus !== "active" || normalizedRole === "pending") {
        pendingOrBlockedTeams.add(m.teamId);
        continue;
      }

      activeTeamIds.add(m.teamId);
      const orgId = teamOrgById.get(m.teamId);
      if (orgId) activeOrgIds.add(orgId);

      const subRoles = parseSubRolesList(m.subRoles);
      const existingGrant = teamRoles.get(m.teamId);
      if (!existingGrant || canManageTeam(m.role, subRoles)) {
        teamRoles.set(m.teamId, {
          memberId: m.id,
          role: m.role,
          subRoles,
        });
      }

      if (canViewInternalData(m.role, subRoles)) {
        mutableTeamIds.add(m.teamId);
      }
      if (
        STAFF_ROSTER_ROLES.has(normalizedRole) ||
        subRoles.some((sr) => STAFF_ROSTER_ROLES.has(sr.toLowerCase()))
      ) {
        playerManageableTeamIds.add(m.teamId);
      }
      if (canManageTeam(m.role, subRoles)) {
        managedTeamIds.add(m.teamId);
        scoreEditableTeamIds.add(m.teamId);
        playerManageableTeamIds.add(m.teamId);
        mutableTeamIds.add(m.teamId);
      } else if (canEditScore(m.role, subRoles)) {
        scoreEditableTeamIds.add(m.teamId);
      }
    }

    for (const om of orgMemberRows) {
      const st = (om.status || "active").toLowerCase();
      if (st !== "active") continue;
      activeOrgIds.add(om.organizationId);

      const r = (om.role || "").toUpperCase();
      if (
        r === "OWNER" ||
        r === "ADMIN" ||
        r === "MANAGER" ||
        r === "IT_ADMIN"
      ) {
        const orgTeams = teamsByOrgId.get(om.organizationId) || [];
        for (const tid of orgTeams) {
          activeTeamIds.add(tid);
          managedTeamIds.add(tid);
          scoreEditableTeamIds.add(tid);
          playerManageableTeamIds.add(tid);
          mutableTeamIds.add(tid);
        }
      }
    }

    for (const p of playerRows) {
      if (p.teamId && !pendingOrBlockedTeams.has(p.teamId)) {
        activeTeamIds.add(p.teamId);
        mutableTeamIds.add(p.teamId);
        const orgId = teamOrgById.get(p.teamId);
        if (orgId) activeOrgIds.add(orgId);
      }
    }
  }

  const canAccessTeam = (teamId: string | null | undefined): boolean => {
    if (!teamId || teamId === "demo-team") return false;
    return isSystemAdmin || activeTeamIds.has(teamId);
  };

  const canManageTeamId = (teamId: string | null | undefined): boolean => {
    if (!teamId || teamId === "demo-team") return false;
    return isSystemAdmin || managedTeamIds.has(teamId);
  };

  const canEditScoreForTeam = (teamId: string | null | undefined): boolean => {
    if (!teamId || teamId === "demo-team") return false;
    return isSystemAdmin || scoreEditableTeamIds.has(teamId);
  };

  const canManagePlayersForTeam = (
    teamId: string | null | undefined
  ): boolean => {
    if (!teamId || teamId === "demo-team") return false;
    return isSystemAdmin || playerManageableTeamIds.has(teamId);
  };

  const canMutateTeamData = (teamId: string | null | undefined): boolean => {
    if (!teamId || teamId === "demo-team") return false;
    return isSystemAdmin || mutableTeamIds.has(teamId);
  };

  const canAccessOrganization = (orgId: string | null | undefined): boolean => {
    if (!orgId) return false;
    return isSystemAdmin || activeOrgIds.has(orgId);
  };

  return {
    sessionUser,
    primaryUserId,
    primaryUserName,
    headerUserId: primaryUserId,
    headerUserName: primaryUserName,
    candidateUserIds,
    isAuthenticated: candidateUserIds.length > 0,
    isSystemAdmin,
    activeTeamIds,
    activeOrgIds,
    managedTeamIds,
    scoreEditableTeamIds,
    playerManageableTeamIds,
    mutableTeamIds,
    teamRoles,
    canAccessTeam,
    canManageTeamId,
    canEditScoreForTeam,
    canManagePlayersForTeam,
    canMutateTeamData,
    canAccessOrganization,
  };
}

export async function resolveCallerTeamAccess(
  c: Context<{ Bindings: WorkerEnv }>,
  _ignoredExtraUserIds?: Array<string | null | undefined>
): Promise<CallerTeamAccess> {
  const existing = requestAccessCache.get(c.req.raw);
  if (existing) return existing;

  const promise = computeCallerTeamAccess(c);
  requestAccessCache.set(c.req.raw, promise);
  return promise;
}

export async function findTeamIdForMatch(
  db: ReturnType<typeof drizzle>,
  matchId: string | null | undefined
): Promise<string | null> {
  if (!matchId || isDemoEntityId(matchId)) return null;
  const row = await db
    .select({ teamId: matches.teamId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .get();
  return row?.teamId ?? null;
}

export async function findTeamIdForPlayLog(
  db: ReturnType<typeof drizzle>,
  logId: string | null | undefined
): Promise<string | null> {
  if (!logId || isDemoEntityId(logId)) return null;
  const logRow = await db
    .select({ matchId: playLogs.matchId })
    .from(playLogs)
    .where(eq(playLogs.id, logId))
    .get();
  if (!logRow?.matchId) return null;
  return findTeamIdForMatch(db, logRow.matchId);
}

export async function findTeamIdForEvent(
  db: ReturnType<typeof drizzle>,
  eventId: string | null | undefined
): Promise<string | null> {
  if (!eventId || isDemoEntityId(eventId)) return null;
  const row = await db
    .select({ teamId: events.teamId })
    .from(events)
    .where(eq(events.id, eventId))
    .get();
  return row?.teamId ?? null;
}

export async function findTeamIdForPlayer(
  db: ReturnType<typeof drizzle>,
  playerId: string | null | undefined
): Promise<string | null> {
  if (!playerId || isDemoEntityId(playerId)) return null;
  const row = await db
    .select({ teamId: players.teamId })
    .from(players)
    .where(eq(players.id, playerId))
    .get();
  return row?.teamId ?? null;
}

export async function findTeamIdForCarpool(
  db: ReturnType<typeof drizzle>,
  carpoolId: string | null | undefined
): Promise<string | null> {
  if (!carpoolId || isDemoEntityId(carpoolId)) return null;
  const row = await db
    .select({ eventId: eventCarpools.eventId })
    .from(eventCarpools)
    .where(eq(eventCarpools.id, carpoolId))
    .get();
  if (!row?.eventId) return null;
  return findTeamIdForEvent(db, row.eventId);
}

async function findTeamIdForGalleryAlbum(
  db: ReturnType<typeof drizzle>,
  albumId: string | null | undefined
): Promise<string | null> {
  if (!albumId || isDemoEntityId(albumId)) return null;
  try {
    const row = await db
      .select({ teamId: galleryAlbums.teamId })
      .from(galleryAlbums)
      .where(eq(galleryAlbums.id, albumId))
      .get();
    return row?.teamId ?? null;
  } catch {
    return null;
  }
}

async function findTeamIdForGalleryPhoto(
  db: ReturnType<typeof drizzle>,
  photoId: string | null | undefined
): Promise<string | null> {
  if (!photoId || isDemoEntityId(photoId)) return null;
  try {
    const row = await db
      .select({ teamId: galleryPhotos.teamId })
      .from(galleryPhotos)
      .where(eq(galleryPhotos.id, photoId))
      .get();
    return row?.teamId ?? null;
  } catch {
    return null;
  }
}

export async function verifyScopedRecordOwnership(
  db: ReturnType<typeof drizzle>,
  access: CallerTeamAccess,
  kind:
    | "document"
    | "faq"
    | "rule"
    | "link"
    | "related_team"
    | "relation"
    | "car"
    | "equipment",
  id: string,
  expectedTeamId?: string
): Promise<boolean> {
  if (isDemoEntityId(id)) {
    return !expectedTeamId || expectedTeamId === "demo-team";
  }

  if (kind === "relation") {
    const row = await db
      .select({ teamId: parentChildRelations.teamId })
      .from(parentChildRelations)
      .where(eq(parentChildRelations.id, id))
      .get();
    if (!row?.teamId) return false;
    if (expectedTeamId && expectedTeamId !== row.teamId) return false;
    return access.isSystemAdmin || access.canAccessTeam(row.teamId);
  }

  if (kind === "car") {
    const row = await db
      .select({ teamId: memberCars.teamId })
      .from(memberCars)
      .where(eq(memberCars.id, id))
      .get();
    if (!row?.teamId) return false;
    if (expectedTeamId && expectedTeamId !== row.teamId) return false;
    return access.isSystemAdmin || access.canAccessTeam(row.teamId);
  }

  if (kind === "equipment") {
    const row = await db
      .select({ teamId: teamEquipments.teamId })
      .from(teamEquipments)
      .where(eq(teamEquipments.id, id))
      .get();
    if (!row?.teamId) return false;
    if (expectedTeamId && expectedTeamId !== row.teamId) return false;
    return access.isSystemAdmin || access.canAccessTeam(row.teamId);
  }

  const table =
    kind === "document"
      ? teamDocuments
      : kind === "faq"
      ? teamFaqs
      : kind === "rule"
      ? teamRules
      : kind === "related_team"
      ? relatedTeams
      : teamLinks;

  const row = await db
    .select({
      teamId: table.teamId,
      organizationId: table.organizationId,
    })
    .from(table)
    .where(eq(table.id, id))
    .get();

  if (!row) return false;
  if (expectedTeamId === "demo-team") return false;
  if (expectedTeamId && row.teamId && expectedTeamId !== row.teamId) {
    return false;
  }
  if (access.isSystemAdmin) return true;
  if (row.teamId && access.canAccessTeam(row.teamId)) return true;
  if (row.organizationId && access.canAccessOrganization(row.organizationId)) {
    return true;
  }
  return false;
}

/**
 * Content-Type ヘッダー偽装（`text/plain` 等）による検査バイパスを防ぐため、
 * マルチパート・バイナリ以外のボディで `{` から始まる JSON オブジェクトを常時検査する
 */
export async function peekJsonBodyFields(
  c: Context
): Promise<Record<string, unknown> | null> {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }
  const ct = (c.req.header("content-type") || "").toLowerCase();
  if (
    ct.includes("multipart/form-data") ||
    ct.includes("application/octet-stream") ||
    ct.startsWith("image/") ||
    ct.startsWith("video/") ||
    ct.includes("application/pdf") ||
    ct.includes("application/zip")
  ) {
    return null;
  }
  const contentLength = Number(c.req.header("content-length") || "0");
  if (contentLength > 1_048_576) {
    return null;
  }
  try {
    const rawText = await c.req.raw.clone().text();
    const trimmed = rawText.trim();
    if (!trimmed.startsWith("{")) {
      return null;
    }
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed json here; route handler will return 400
  }
  return null;
}

function pickStringField(
  obj: Record<string, unknown> | null,
  key: string
): string {
  if (!obj) return "";
  const val = obj[key];
  return typeof val === "string" ? val.trim() : "";
}

function isTeamAlignedWithExplicit(
  ownerTeamId: string,
  explicitTeamId: string
): boolean {
  if (!explicitTeamId) return true;
  return explicitTeamId === ownerTeamId;
}

/**
 * 🛡️ LIFF API 共通チーム隔離ガードミドルウェア
 * - 個別リソースID（`matchId` / `eventId` / `playerId` / `albumId` / `photoId` / `documentId` 等）が存在する場合は、
 *   `?teamId=demo-team` や別チームIDによるすり抜けを防ぐため **必ず先にDB上の所有チームを逆引き検証** する。
 */
export function createLiffTeamIsolationMiddleware(options?: {
  publicSubpaths?: string[];
}): MiddlewareHandler<{ Bindings: WorkerEnv }> {
  const publicSet = new Set(options?.publicSubpaths || []);

  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method === "OPTIONS") {
      return next();
    }

    const fullPath = new URL(c.req.url).pathname;
    if (publicSet.has(fullPath)) {
      return next();
    }

    // URLパスセグメント抽出 (['api', 'liff', ...])
    const segs = fullPath.split("/").filter(Boolean);

    // ギャラリー画像メディア配信（24文字暗号学的ランダムシークレット検証付き）は <img> 直読込のため通過
    if (method === "GET" && segs[2] === "gallery" && segs[3] === "media") {
      return next();
    }

    const bodyFields = await peekJsonBodyFields(c);
    const access = await resolveCallerTeamAccess(c);
    const db = drizzle(c.env.DB);

    // /api/liff/teams/:teamId/logo or /cover
    const pathTeamId = segs[2] === "teams" && segs[3] ? segs[3] : "";
    const queryTeamId = (c.req.query("teamId") || "").trim();
    const bodyTeamId = pickStringField(bodyFields, "teamId");
    const explicitTeamId = pathTeamId || queryTeamId || bodyTeamId;

    // 1. 管理者コンソール（/api/liff/admin/*）の厳格チェック（teamId 省略バイパスも遮断）
    if (segs[2] === "admin") {
      if (method !== "GET") {
        if (!explicitTeamId) {
          return c.json(
            {
              success: false,
              error: "対象チームが指定されていません",
              isForbidden: true,
            },
            403
          );
        }
        if (
          explicitTeamId !== "demo-team" &&
          !access.canManageTeamId(explicitTeamId)
        ) {
          return c.json(
            {
              success: false,
              error: "管理者権限がありません",
              isForbidden: true,
            },
            403
          );
        }
      }
    }

    // 2. 個別リソースIDの所有チーム逆引き検証（demo-team 早期リターンより必ず先に実行！）
    const matchId =
      (c.req.query("matchId") || "").trim() ||
      pickStringField(bodyFields, "matchId");
    if (matchId && !isDemoEntityId(matchId)) {
      const ownerTeamId = await findTeamIdForMatch(db, matchId);
      if (
        !ownerTeamId ||
        !isTeamAlignedWithExplicit(ownerTeamId, explicitTeamId) ||
        !access.canAccessTeam(ownerTeamId) ||
        (method !== "GET" && !access.canMutateTeamData(ownerTeamId))
      ) {
        return c.json(
          {
            success: false,
            error: "この試合データへのアクセス権限がありません",
            isForbidden: true,
          },
          403
        );
      }
    }

    const eventId =
      (c.req.query("eventId") || "").trim() ||
      pickStringField(bodyFields, "eventId");
    if (eventId && eventId !== "__new__" && !isDemoEntityId(eventId)) {
      const ownerTeamId = await findTeamIdForEvent(db, eventId);
      if (
        !ownerTeamId ||
        !isTeamAlignedWithExplicit(ownerTeamId, explicitTeamId) ||
        !access.canAccessTeam(ownerTeamId) ||
        (method !== "GET" && !access.canMutateTeamData(ownerTeamId))
      ) {
        return c.json(
          {
            success: false,
            error: "この予定データへのアクセス権限がありません",
            isForbidden: true,
          },
          403
        );
      }
    }

    const carpoolId =
      (c.req.query("carpoolId") || "").trim() ||
      pickStringField(bodyFields, "carpoolId");
    if (carpoolId && !isDemoEntityId(carpoolId)) {
      const ownerTeamId = await findTeamIdForCarpool(db, carpoolId);
      if (
        !ownerTeamId ||
        !isTeamAlignedWithExplicit(ownerTeamId, explicitTeamId) ||
        !access.canAccessTeam(ownerTeamId) ||
        (method !== "GET" && !access.canMutateTeamData(ownerTeamId))
      ) {
        return c.json(
          {
            success: false,
            error: "この配車データへのアクセス権限がありません",
            isForbidden: true,
          },
          403
        );
      }
    }

    const pathPlayerId =
      segs[2] === "players" &&
      segs[3] &&
      segs[3] !== "growth" &&
      segs[3] !== "create"
        ? segs[3]
        : "";
    const playerId =
      pathPlayerId ||
      (c.req.query("playerId") || "").trim() ||
      pickStringField(bodyFields, "playerId");
    if (playerId && !isDemoEntityId(playerId)) {
      const ownerTeamId = await findTeamIdForPlayer(db, playerId);
      if (
        !ownerTeamId ||
        !isTeamAlignedWithExplicit(ownerTeamId, explicitTeamId) ||
        !access.canAccessTeam(ownerTeamId) ||
        (method !== "GET" && !access.canMutateTeamData(ownerTeamId))
      ) {
        return c.json(
          {
            success: false,
            error: "この選手データへのアクセス権限がありません",
            isForbidden: true,
          },
          403
        );
      }
    }

    // フォトギャラリーのアルバムID・写真ID逆引き検証
    if (segs[2] === "gallery") {
      if (segs[3] === "albums" && segs[4] && !isDemoEntityId(segs[4])) {
        const ownerTeamId = await findTeamIdForGalleryAlbum(db, segs[4]);
        if (
          !ownerTeamId ||
          !isTeamAlignedWithExplicit(ownerTeamId, explicitTeamId) ||
          !access.canAccessTeam(ownerTeamId) ||
          (method !== "GET" && !access.canMutateTeamData(ownerTeamId))
        ) {
          return c.json(
            {
              success: false,
              error: "このアルバムへのアクセス権限がありません",
              isForbidden: true,
            },
            403
          );
        }
      }
      if (
        segs[3] === "photos" &&
        segs[4] &&
        segs[4] !== "delete" &&
        !isDemoEntityId(segs[4])
      ) {
        const ownerTeamId = await findTeamIdForGalleryPhoto(db, segs[4]);
        if (
          !ownerTeamId ||
          !isTeamAlignedWithExplicit(ownerTeamId, explicitTeamId) ||
          !access.canAccessTeam(ownerTeamId) ||
          (method !== "GET" && !access.canMutateTeamData(ownerTeamId))
        ) {
          return c.json(
            {
              success: false,
              error: "この写真へのアクセス権限がありません",
              isForbidden: true,
            },
            403
          );
        }
      }
    }

    // 個別ID更新・削除ルート (/documents/:id, /faqs/:id, /rules/:id, /links/:id, /profile/family/:relationId, /profile/cars/:carId, /admin/mgmt/*/:id)
    if (method !== "GET") {
      if (segs[2] === "profile" && segs[3] === "family" && segs[4]) {
        const ok = await verifyScopedRecordOwnership(
          db,
          access,
          "relation",
          segs[4],
          explicitTeamId || undefined
        );
        if (!ok) {
          return c.json(
            { success: false, error: "このデータへの変更権限がありません" },
            403
          );
        }
      }

      if (segs[2] === "profile" && segs[3] === "cars" && segs[4]) {
        const ok = await verifyScopedRecordOwnership(
          db,
          access,
          "car",
          segs[4],
          explicitTeamId || undefined
        );
        if (!ok) {
          return c.json(
            { success: false, error: "この車両データへの変更権限がありません" },
            403
          );
        }
      }

      const kindMap: Record<
        string,
        "document" | "faq" | "rule" | "link" | "related_team"
      > = {
        documents: "document",
        faqs: "faq",
        rules: "rule",
        links: "link",
        "related-teams": "related_team",
      };
      const nonIdSubroutes = new Set([
        "upload",
        "bulk",
        "bulk-delete",
        "ai-discover",
        "ai-lookup",
      ]);
      const scopedKind = kindMap[segs[2] || ""];
      if (scopedKind && segs[3] && !nonIdSubroutes.has(segs[3])) {
        const ok = await verifyScopedRecordOwnership(
          db,
          access,
          scopedKind,
          segs[3],
          explicitTeamId || undefined
        );
        if (!ok) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
      }
    }

    // 3. 明示的に demo-team が指定されたリクエスト（かつ実リソースID混入なし確認済み）
    if (explicitTeamId === "demo-team") {
      return next();
    }

    // 4. 実チームIDが指定されている場合は所属および更新ロールを検証
    if (explicitTeamId) {
      if (!access.canAccessTeam(explicitTeamId)) {
        return c.json(
          {
            success: false,
            error: "このチームへのアクセス権限がありません",
            isForbidden: true,
          },
          403
        );
      }

      if (
        method !== "GET" &&
        segs[2] !== "profile" &&
        !access.canMutateTeamData(explicitTeamId)
      ) {
        return c.json(
          {
            success: false,
            error: "閲覧専用メンバーのため変更操作はできません",
            isForbidden: true,
          },
          403
        );
      }

      return next();
    }

    // 5. teamId なしの書き込み操作は承認済みの内部メンバー所属を必須化
    if (method !== "GET") {
      if (segs[2] === "grounds" && segs[3] && isDemoEntityId(segs[3])) {
        return next();
      }
      if (!access.isSystemAdmin && access.mutableTeamIds.size === 0) {
        return c.json(
          {
            success: false,
            error: "承認済みの所属チームがないため、この操作は実行できません",
            isForbidden: true,
          },
          403
        );
      }
    }

    return next();
  };
}

/**
 * 🛡️ 共通 API (`/api/matches`, `/api/events`, `/api/attendance`, `/api/carpools`, `/api/equipments`, `/api/venues`, `/api/tournaments`, `/api/teams` 等) 向けのチーム隔離ガード
 */
export function createSharedApiTeamIsolationMiddleware(): MiddlewareHandler<{
  Bindings: WorkerEnv;
}> {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method === "OPTIONS") {
      return next();
    }

    const fullPath = new URL(c.req.url).pathname;
    const segs = fullPath.split("/").filter(Boolean); // ['api', '<module>', ...]
    const mod = segs[1] || "";

    // LINE Bot Webhook や静的ファイル配信は各ハンドラ側で署名/キー検証
    if (
      fullPath.startsWith("/api/matches/webhook") ||
      (mod === "documents" && segs[2] === "files") ||
      (mod === "images" && method === "GET")
    ) {
      return next();
    }

    const bodyFields = await peekJsonBodyFields(c);
    const access = await resolveCallerTeamAccess(c);
    const db = drizzle(c.env.DB);
    const queryTeamId = (c.req.query("teamId") || "").trim();
    const bodyTeamId = pickStringField(bodyFields, "teamId");
    const explicitTeamId = queryTeamId || bodyTeamId;

    // 1. /api/events/:teamId/...
    if (mod === "events") {
      const pathTeamId = segs[2] || "";
      const pathEventId = segs[3] && segs[3] !== "bulk" ? segs[3] : "";
      const targetTeamId = pathTeamId || explicitTeamId;

      if (pathEventId && !isDemoEntityId(pathEventId)) {
        const ownerTeamId = await findTeamIdForEvent(db, pathEventId);
        if (
          !ownerTeamId ||
          (targetTeamId && targetTeamId !== ownerTeamId) ||
          !access.canAccessTeam(ownerTeamId)
        ) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
      }

      if (targetTeamId === "demo-team") return next();
      if (!targetTeamId || !access.canAccessTeam(targetTeamId)) {
        return c.json({ success: false, error: "権限がありません" }, 403);
      }
      if (method !== "GET" && !access.canMutateTeamData(targetTeamId)) {
        return c.json({ success: false, error: "権限がありません" }, 403);
      }
      return next();
    }

    // 2. /api/matches/...
    if (mod === "matches") {
      // 2a. /api/matches/logs/:logId...
      if (segs[2] === "logs" && segs[3]) {
        if (isDemoEntityId(segs[3])) {
          if (explicitTeamId && explicitTeamId !== "demo-team") {
            return c.json({ success: false, error: "権限がありません" }, 403);
          }
          return next();
        }
        const ownerTeamId = await findTeamIdForPlayLog(db, segs[3]);
        if (
          !ownerTeamId ||
          !isTeamAlignedWithExplicit(ownerTeamId, explicitTeamId) ||
          !access.canAccessTeam(ownerTeamId) ||
          (method !== "GET" && !access.canMutateTeamData(ownerTeamId))
        ) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }

      // 2b. 個別 matchId 逆引き検証 (/api/matches/:id/... または body.matchId)
      const pathMatchId =
        segs[2] && segs[2] !== "create" && segs[2] !== "update-score"
          ? segs[2]
          : "";
      const targetMatchId = pathMatchId || pickStringField(bodyFields, "matchId");
      if (targetMatchId) {
        if (isDemoEntityId(targetMatchId)) {
          if (explicitTeamId && explicitTeamId !== "demo-team") {
            return c.json({ success: false, error: "権限がありません" }, 403);
          }
          return next();
        }
        const ownerTeamId = await findTeamIdForMatch(db, targetMatchId);
        if (
          !ownerTeamId ||
          !isTeamAlignedWithExplicit(ownerTeamId, explicitTeamId) ||
          !access.canAccessTeam(ownerTeamId)
        ) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        if (method !== "GET") {
          // 試合本体の完全削除はスタッフ・スコア編集者・管理者のみ許可
          const isMatchRootDelete = method === "DELETE" && !segs[3];
          if (isMatchRootDelete && !access.canManagePlayersForTeam(ownerTeamId)) {
            return c.json(
              { success: false, error: "試合データの削除権限がありません" },
              403
            );
          }
          if (!access.canMutateTeamData(ownerTeamId)) {
            return c.json({ success: false, error: "権限がありません" }, 403);
          }
        }
        return next();
      }

      // 2c. 一覧取得 / 新規作成 (?teamId= または body.teamId)
      if (explicitTeamId === "demo-team") return next();
      if (explicitTeamId) {
        if (!access.canAccessTeam(explicitTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        if (method !== "GET" && !access.canMutateTeamData(explicitTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }

      return c.json({ success: false, error: "権限がありません" }, 403);
    }

    // 3. /api/attendance/...
    if (mod === "attendance") {
      const evId =
        (segs[2] && segs[2] !== "update" ? segs[2] : "") ||
        (c.req.query("eventId") || "").trim() ||
        pickStringField(bodyFields, "eventId");
      if (evId && !isDemoEntityId(evId)) {
        const ownerTeamId = await findTeamIdForEvent(db, evId);
        if (
          !ownerTeamId ||
          !isTeamAlignedWithExplicit(ownerTeamId, explicitTeamId) ||
          !access.canAccessTeam(ownerTeamId) ||
          (method !== "GET" && !access.canMutateTeamData(ownerTeamId))
        ) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      if (evId && isDemoEntityId(evId)) return next();
      if (explicitTeamId === "demo-team") return next();
      if (explicitTeamId && access.canAccessTeam(explicitTeamId)) {
        if (method !== "GET" && !access.canMutateTeamData(explicitTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      return c.json({ success: false, error: "権限がありません" }, 403);
    }

    // 4. /api/carpools/...
    if (mod === "carpools") {
      if (segs[2] === "events" && segs[3]) {
        if (isDemoEntityId(segs[3])) return next();
        const ownerTeamId = await findTeamIdForEvent(db, segs[3]);
        if (
          !ownerTeamId ||
          !isTeamAlignedWithExplicit(ownerTeamId, explicitTeamId) ||
          !access.canAccessTeam(ownerTeamId) ||
          (method !== "GET" && !access.canMutateTeamData(ownerTeamId))
        ) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      if (segs[2] === "cars" && segs[3] && method === "DELETE") {
        const ok = await verifyScopedRecordOwnership(
          db,
          access,
          "car",
          segs[3],
          explicitTeamId || undefined
        );
        if (!ok) return c.json({ success: false, error: "権限がありません" }, 403);
        return next();
      }
      if (segs[2] === "family" && segs[3] && method === "DELETE") {
        const ok = await verifyScopedRecordOwnership(
          db,
          access,
          "relation",
          segs[3],
          explicitTeamId || undefined
        );
        if (!ok) return c.json({ success: false, error: "権限がありません" }, 403);
        return next();
      }
      if (explicitTeamId === "demo-team") return next();
      if (explicitTeamId && access.canAccessTeam(explicitTeamId)) {
        if (method !== "GET" && !access.canMutateTeamData(explicitTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      return c.json({ success: false, error: "権限がありません" }, 403);
    }

    // 5. /api/equipments/...
    if (mod === "equipments") {
      if (segs[2] === "events" && segs[3]) {
        if (isDemoEntityId(segs[3])) return next();
        const ownerTeamId = await findTeamIdForEvent(db, segs[3]);
        if (
          !ownerTeamId ||
          !isTeamAlignedWithExplicit(ownerTeamId, explicitTeamId) ||
          !access.canAccessTeam(ownerTeamId) ||
          (method !== "GET" && !access.canMutateTeamData(ownerTeamId))
        ) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      if (segs[2] && segs[2] !== "events" && method === "DELETE") {
        const ok = await verifyScopedRecordOwnership(
          db,
          access,
          "equipment",
          segs[2],
          explicitTeamId || undefined
        );
        if (!ok) return c.json({ success: false, error: "権限がありません" }, 403);
        return next();
      }
      if (explicitTeamId === "demo-team") return next();
      if (explicitTeamId && access.canAccessTeam(explicitTeamId)) {
        if (method !== "GET" && !access.canMutateTeamData(explicitTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      return c.json({ success: false, error: "権限がありません" }, 403);
    }

    // 6. /api/teams/...
    if (mod === "teams") {
      const second = segs[2] || "";
      if (!second || second === "join" || second === "search") {
        return next();
      }
      if (
        second === "update-line" ||
        second === "settings" ||
        second === "test-push"
      ) {
        const settingsPathTid = second === "settings" && segs[3] ? segs[3] : "";
        const targetTid = settingsPathTid || explicitTeamId;
        if (targetTid === "demo-team") return next();
        if (!targetTid || !access.canManageTeamId(targetTid)) {
          return c.json(
            { success: false, error: "管理者権限がありません" },
            403
          );
        }
        return next();
      }

      // /api/teams/:teamId/...
      if (second === "demo-team") return next();
      if (!access.canAccessTeam(second)) {
        return c.json({ success: false, error: "権限がありません" }, 403);
      }

      // /api/teams/:teamId/line-settings は LINE チャネルトークン設定を含むため管理者限定
      if (segs[3] === "line-settings" && !access.canManageTeamId(second)) {
        return c.json({ success: false, error: "管理者権限がありません" }, 403);
      }

      // /api/teams/:teamId/players の公式名簿追加・編集・削除はスタッフ以上を必須化（かつ :playerId の所有チーム一致も検証）
      if (segs[3] === "players" && method !== "GET") {
        if (!access.canManagePlayersForTeam(second)) {
          return c.json(
            { success: false, error: "選手名簿の管理権限がありません" },
            403
          );
        }
        if (segs[4] && !isDemoEntityId(segs[4])) {
          const ownerTid = await findTeamIdForPlayer(db, segs[4]);
          if (ownerTid !== second) {
            return c.json({ success: false, error: "権限がありません" }, 403);
          }
        }
        return next();
      }

      // /api/teams/:teamId/lineup-templates/:id の所有チーム検証
      if (segs[3] === "lineup-templates" && method !== "GET") {
        if (!access.canMutateTeamData(second)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        if (segs[4] && !isDemoEntityId(segs[4])) {
          const tpl = await db
            .select({ teamId: lineupTemplates.teamId })
            .from(lineupTemplates)
            .where(eq(lineupTemplates.id, segs[4]))
            .get();
          if (!tpl || tpl.teamId !== second) {
            return c.json({ success: false, error: "権限がありません" }, 403);
          }
        }
        return next();
      }

      if (method !== "GET" && !access.canMutateTeamData(second)) {
        return c.json({ success: false, error: "権限がありません" }, 403);
      }

      return next();
    }

    // 7. /api/venues, /api/tournaments, /api/documents/upload, /api/images/upload
    if (
      mod === "venues" ||
      mod === "tournaments" ||
      mod === "documents" ||
      mod === "images"
    ) {
      if (!access.isSystemAdmin && access.activeTeamIds.size === 0) {
        return c.json(
          {
            success: false,
            error: "承認済みの所属チームが必要です",
          },
          403
        );
      }
      // 共通マスタ（venues / tournaments）の変更・削除はスタッフ・管理者以上のみ許可
      if (
        (mod === "venues" || mod === "tournaments") &&
        method !== "GET" &&
        !access.isSystemAdmin &&
        access.playerManageableTeamIds.size === 0
      ) {
        return c.json(
          {
            success: false,
            error: "マスタデータの変更には指導者・管理者権限が必要です",
          },
          403
        );
      }
      if (
        (mod === "documents" || mod === "images") &&
        method !== "GET" &&
        !access.isSystemAdmin &&
        access.mutableTeamIds.size === 0
      ) {
        return c.json({ success: false, error: "権限がありません" }, 403);
      }
      return next();
    }

    return next();
  };
}
