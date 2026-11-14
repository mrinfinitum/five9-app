import "server-only";
import { createSign } from "node:crypto";

/**
 * Talks to Google as one service account (read-only). Each client adds the
 * service account's email as a Viewer on their GA4 property and as a user on
 * their Search Console site; nothing else is needed per client.
 *
 * GOOGLE_SERVICE_ACCOUNT_JSON holds the key file Google Cloud gives you,
 * either as raw JSON or base64-encoded (easier to paste into Vercel).
 */

const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/webmasters.readonly"];

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super("Google isn't connected yet. Add GOOGLE_SERVICE_ACCOUNT_JSON in the Vercel project settings.");
  }
}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

/** The email clients add to their GA4 property and Search Console site, or null when not set up. */
export function serviceAccountEmail() {
  return serviceAccount()?.client_email ?? null;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

let token: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const account = serviceAccount();
  if (!account) throw new GoogleNotConfiguredError();

  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iss: account.client_email, scope: SCOPES.join(" "), aud: tokenUri, iat: now, exp: now + 3600 }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key);

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(signature)}` }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new GoogleApiError(`Google sign-in failed: ${body.error_description ?? response.statusText}`, response.status);
  }
  token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return token.value;
}

/** Authenticated JSON call to a Google API. */
export async function googleFetch<T>(url: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) {
    const message =
      response.status === 403
        ? "The service account doesn't have access. Add it as a Viewer on this property or site."
        : body.error?.message ?? response.statusText;
    throw new GoogleApiError(message, response.status);
  }
  return body;
}

/** Small in-memory cache so switching back and forth between clients doesn't re-hit Google's quotas. */
const memo = new Map<string, { at: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  memo.set(key, { at: Date.now(), value });
  // Failures aren't cached.
  value.catch(() => memo.delete(key));
  if (memo.size > 500) memo.delete(memo.keys().next().value as string);
  return value;
}
