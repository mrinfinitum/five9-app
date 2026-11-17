import { connect } from "node:tls";
import { safeNext } from "@/lib/safe-next";

/**
 * Security checks run against live sites. Everything here is what an outsider
 * could do with a browser: no logins, no brute force, no attempts to change
 * data. Client sites get only these outside checks; the app also gets the
 * deeper checks in `appChecks`.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type Finding = {
  target: string;
  checkKey: string;
  severity: Severity;
  title: string;
  detail: string;
  fixHint: string;
  /** True when the fix is a change to this app's own code (a Claude PR can do it). */
  fixable: boolean;
};

export type TargetResult = { target: string; reached: boolean; checksRun: number; findings: Finding[] };

const UA = "Five9SecurityScan/1.0 (+https://app.five9.media)";
const TIMEOUT = 10_000;
const MAX_BODY = 2_000_000;

/**
 * Sites behind bot protection (Vercel Firewall, Cloudflare) answer scanners
 * with a challenge page. Optionally send a shared header the firewall can be
 * told to let through (SECURITY_SCAN_TOKEN → "x-five9-scan").
 */
function scanHeaders(): Record<string, string> {
  return process.env.SECURITY_SCAN_TOKEN ? { "x-five9-scan": process.env.SECURITY_SCAN_TOKEN } : {};
}

function challenged(f: { status: number; headers: Headers }) {
  return /challenge/i.test(`${f.headers.get("x-vercel-mitigated") ?? ""} ${f.headers.get("cf-mitigated") ?? ""}`) || f.status === 403 || f.status === 429;
}

type Fetched = { status: number; headers: Headers; body: string; url: string; location: string | null };

async function get(url: string, init: { redirect?: RequestRedirect; method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Fetched | null> {
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      redirect: init.redirect ?? "follow",
      headers: { "User-Agent": UA, ...scanHeaders(), ...init.headers },
      body: init.body,
      signal: AbortSignal.timeout(TIMEOUT),
      cache: "no-store",
    });
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (size < MAX_BODY) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      await reader.cancel().catch(() => {});
    }
    return { status: res.status, headers: res.headers, body: Buffer.concat(chunks).toString("latin1"), url: res.url, location: res.headers.get("location") };
  } catch {
    return null;
  }
}

function certificate(host: string): Promise<{ validTo: Date; authorized: boolean; error?: string } | null> {
  return new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host, timeout: TIMEOUT, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      resolve(cert?.valid_to ? { validTo: new Date(cert.valid_to), authorized: socket.authorized, error: socket.authorizationError?.toString() } : null);
      socket.end();
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

// ---------- outside checks (every site) ----------

const EXPOSED_FILES: { path: string; severity: Severity; looksReal: (f: Fetched) => boolean; what: string }[] = [
  { path: "/.env", severity: "critical", what: "environment file with secrets", looksReal: (f) => /^[A-Z][A-Z0-9_]{2,}=\S+/m.test(f.body) && !/<html/i.test(f.body) },
  { path: "/.env.local", severity: "critical", what: "environment file with secrets", looksReal: (f) => /^[A-Z][A-Z0-9_]{2,}=\S+/m.test(f.body) && !/<html/i.test(f.body) },
  { path: "/.git/HEAD", severity: "critical", what: "Git repository (full source code and history)", looksReal: (f) => /^ref: refs\//.test(f.body) },
  { path: "/.git/config", severity: "critical", what: "Git repository config", looksReal: (f) => /^\[core\]/m.test(f.body) },
  { path: "/wp-config.php.bak", severity: "critical", what: "WordPress config backup with database password", looksReal: (f) => /DB_PASSWORD/.test(f.body) },
  { path: "/.DS_Store", severity: "low", what: "macOS folder index (lists hidden files)", looksReal: (f) => f.body.startsWith("\u0000\u0000\u0000\u0001Bud1") },
  { path: "/phpinfo.php", severity: "medium", what: "PHP configuration dump", looksReal: (f) => /phpinfo\(\)|PHP Version \d/.test(f.body) },
  { path: "/server-status", severity: "medium", what: "Apache server status page", looksReal: (f) => /Apache Server Status/i.test(f.body) },
  { path: "/backup.sql", severity: "critical", what: "database dump", looksReal: (f) => /CREATE TABLE|INSERT INTO/i.test(f.body) && !/<html/i.test(f.body) },
];

/** Secrets that must never appear in a public page or script. Matches are redacted. */
const SECRET_PATTERNS: { key: string; label: string; pattern: RegExp }[] = [
  { key: "stripe-secret", label: "Stripe secret key", pattern: /\b[sr]k_live_[0-9a-zA-Z]{20,}/ },
  { key: "aws-key", label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { key: "supabase-secret", label: "Supabase secret key", pattern: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { key: "private-key", label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { key: "github-token", label: "GitHub token", pattern: /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,})/ },
  { key: "shopify-admin-token", label: "Shopify Admin API token", pattern: /\bshp(?:at|ss|ca)_[a-fA-F0-9]{32}\b/ },
  { key: "slack-token", label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { key: "sendgrid-key", label: "SendGrid key", pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
  { key: "anthropic-key", label: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { key: "openai-key", label: "OpenAI API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/ },
];

function serviceRoleJwt(text: string) {
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")) as { role?: string };
      if (payload.role === "service_role") return match[0];
    } catch {
      // not a JWT
    }
  }
  return null;
}

const redact = (value: string) => `${value.slice(0, 8)}…`;

export async function siteChecks(siteUrl: string, opts: { isApp: boolean }): Promise<TargetResult> {
  const base = new URL(siteUrl);
  const target = base.host;
  const findings: Finding[] = [];
  let checksRun = 0;
  const add = (f: Omit<Finding, "target" | "fixable"> & { fixable?: boolean }) => findings.push({ target, fixable: false, ...f });

  // 1. Loads over HTTPS.
  checksRun++;
  const home = await get(`https://${target}/`);
  if (!home || home.status >= 500) {
    add({
      checkKey: "https-down",
      severity: "high",
      title: "Site didn't load over HTTPS",
      detail: home ? `The home page returned HTTP ${home.status}.` : "No response within 10 seconds.",
      fixHint: "Check the hosting provider's status and the domain's DNS and certificate.",
    });
    return { target, reached: false, checksRun, findings };
  }
  // Bot protection served a challenge page: its headers say nothing about the real site.
  if (challenged(home)) {
    add({
      checkKey: "scan-blocked",
      severity: "info",
      title: "Bot protection blocked the scan",
      detail: `The site answered with a ${home.headers.get("x-vercel-mitigated") ? "Vercel Firewall" : home.headers.get("cf-mitigated") ? "Cloudflare" : `HTTP ${home.status}`} challenge, so the other checks couldn't run. That protection is good; the scanner just needs to be let through.`,
      fixHint:
        "In the site's firewall (Vercel → Firewall, or Cloudflare WAF), add a bypass rule for requests with header x-five9-scan equal to a long random value, and set the same value as SECURITY_SCAN_TOKEN in the five9-app Vercel project.",
    });
    return { target, reached: false, checksRun, findings };
  }
  // Probe the host the site actually serves from (e.g. example.com → www.example.com).
  const host = new URL(home.url).host;

  // 2. Plain HTTP goes to HTTPS.
  checksRun++;
  const plain = await get(`http://${target}/`, { redirect: "manual" });
  if (plain && !(plain.status >= 300 && plain.status < 400 && plain.location?.startsWith("https://"))) {
    add({
      checkKey: "http-no-redirect",
      severity: "medium",
      title: "HTTP doesn't redirect to HTTPS",
      detail: `http://${target}/ answered ${plain.status} instead of redirecting to https://.`,
      fixHint: "Turn on \"force HTTPS\" in the hosting or CDN settings.",
    });
  }

  // 3. Certificate.
  checksRun++;
  const cert = await certificate(host);
  if (cert) {
    const days = Math.floor((cert.validTo.getTime() - Date.now()) / 86_400_000);
    if (!cert.authorized) {
      add({ checkKey: "tls-invalid", severity: "high", title: "TLS certificate isn't trusted", detail: cert.error ?? "Browsers will show a warning.", fixHint: "Reissue the certificate for this domain from the hosting provider." });
    } else if (days < 30) {
      add({
        checkKey: "tls-expiring",
        severity: days < 7 ? "critical" : days < 14 ? "high" : "medium",
        title: `TLS certificate expires in ${Math.max(days, 0)} day${days === 1 ? "" : "s"}`,
        detail: `Valid until ${cert.validTo.toISOString().slice(0, 10)}. Automatic renewal may have failed.`,
        fixHint: "Check the certificate's auto-renewal in the hosting or CDN settings.",
      });
    }
  }

  // 4. Security headers on the home page.
  checksRun++;
  const h = home.headers;
  const csp = h.get("content-security-policy") ?? "";
  const headerFix = opts.isApp ? "Set it in next.config.ts securityHeaders." : "Add it in the hosting/CDN settings or the theme (Shopify: via a proxy app or Cloudflare).";
  if (!h.get("strict-transport-security")) {
    add({ checkKey: "header-hsts", severity: opts.isApp ? "medium" : "low", title: "Missing Strict-Transport-Security header", detail: "Browsers may be tricked into using plain HTTP on hostile networks.", fixHint: headerFix, fixable: opts.isApp });
  }
  if (!h.get("x-content-type-options")) {
    add({ checkKey: "header-nosniff", severity: "low", title: "Missing X-Content-Type-Options: nosniff", detail: "Browsers may guess file types, which helps some injection attacks.", fixHint: headerFix, fixable: opts.isApp });
  }
  if (!h.get("x-frame-options") && !/frame-ancestors/.test(csp)) {
    add({ checkKey: "header-framing", severity: opts.isApp ? "medium" : "low", title: "Site can be framed by other sites (clickjacking)", detail: "No X-Frame-Options or CSP frame-ancestors.", fixHint: headerFix, fixable: opts.isApp });
  }
  if (!csp) {
    add({ checkKey: "header-csp", severity: opts.isApp ? "medium" : "info", title: "No Content-Security-Policy", detail: "A CSP limits the damage of any script injection.", fixHint: headerFix, fixable: opts.isApp });
  }
  const powered = h.get("x-powered-by");
  const server = h.get("server") ?? "";
  if (powered || /\d/.test(server)) {
    add({ checkKey: "header-version", severity: "low", title: "Server software and version are disclosed", detail: [powered && `X-Powered-By: ${powered}`, /\d/.test(server) && `Server: ${server}`].filter(Boolean).join(" · "), fixHint: opts.isApp ? "Set poweredByHeader: false in next.config.ts." : "Hide version headers in the server or CDN settings.", fixable: opts.isApp });
  }

  // 5. Cookies set without Secure.
  checksRun++;
  const insecure = h.getSetCookie().filter((c) => !/;\s*secure/i.test(c)).map((c) => c.split("=")[0]);
  if (insecure.length) {
    add({ checkKey: "cookie-insecure", severity: "low", title: "Cookies set without the Secure flag", detail: `Cookies: ${insecure.slice(0, 5).join(", ")}`, fixHint: "Mark cookies Secure (and HttpOnly when scripts don't need them).", fixable: opts.isApp });
  }

  // 6. Files that should never be public.
  for (const file of EXPOSED_FILES) {
    checksRun++;
    const res = await get(`https://${host}${file.path}`, { redirect: "manual" });
    if (res && res.status === 200 && file.looksReal(res)) {
      add({
        checkKey: `exposed:${file.path}`,
        severity: file.severity,
        title: `Public ${file.what} at ${file.path}`,
        detail: `https://${host}${file.path} is downloadable by anyone.`,
        fixHint: `Delete the file from the web root or block ${file.path} at the server, then rotate any secrets it contained.`,
      });
    }
  }

  // 7. Secrets in the home page and its own scripts.
  checksRun++;
  const scripts = [...home.body.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map((m) => {
      try {
        return new URL(m[1].replace(/&amp;/g, "&"), home.url);
      } catch {
        return null;
      }
    })
    .filter((u): u is URL => Boolean(u && (u.host === host || u.host === target || u.host.endsWith(`.${base.host.replace(/^www\./, "")}`))))
    .slice(0, 12);
  const sources = [{ where: "home page", text: home.body }];
  for (const url of scripts) {
    const js = await get(url.toString());
    if (js?.status === 200) sources.push({ where: url.pathname, text: js.body });
  }
  for (const { where, text } of sources) {
    for (const secret of SECRET_PATTERNS) {
      const match = secret.pattern.exec(text);
      if (match) {
        add({
          checkKey: `secret:${secret.key}`,
          severity: "critical",
          title: `${secret.label} is visible to the public`,
          detail: `Found ${redact(match[0])} in ${where}.`,
          fixHint: `Revoke and rotate this ${secret.label} now, then move it to a server-only setting.`,
          fixable: opts.isApp,
        });
      }
    }
    const jwt = serviceRoleJwt(text);
    if (jwt) {
      add({ checkKey: "secret:supabase-service-role", severity: "critical", title: "Supabase service-role key is visible to the public", detail: `Found ${redact(jwt)} in ${where}. It bypasses all database security.`, fixHint: "Rotate the service-role key in Supabase now and keep it server-only.", fixable: opts.isApp });
    }
  }

  // 8. Source maps (reveal original source).
  if (opts.isApp && scripts[0]) {
    checksRun++;
    const map = await get(`${scripts[0]}.map`, { redirect: "manual" });
    if (map?.status === 200 && map.body.includes('"mappings"')) {
      add({ checkKey: "source-maps", severity: "low", title: "Source maps are public", detail: "Anyone can read the original front-end source.", fixHint: "Set productionBrowserSourceMaps: false in next.config.ts.", fixable: true });
    }
  }

  return { target, reached: true, checksRun, findings };
}

// ---------- deeper checks (this app only) ----------

/**
 * What an attacker would try against this app specifically: the public
 * Supabase key straight against the database, sign-up and auth settings,
 * protected pages and cron routes without signing in, and redirect tricks.
 */
export async function appChecks(appUrl: string, supabase: { url: string; publishableKey: string; secretKey: string }): Promise<TargetResult> {
  const target = new URL(appUrl).host;
  const findings: Finding[] = [];
  let checksRun = 0;
  const add = (f: Omit<Finding, "target">) => findings.push({ target, ...f });
  const anon = { apikey: supabase.publishableKey };

  // 1. Every table, read with only the public key.
  checksRun++;
  const schema = await get(`${supabase.url}/rest/v1/`, { headers: { apikey: supabase.secretKey, Authorization: `Bearer ${supabase.secretKey}` } });
  let tables: string[] = [];
  try {
    tables = Object.keys((JSON.parse(schema?.body ?? "{}") as { paths?: Record<string, unknown> }).paths ?? {})
      .filter((p) => /^\/[a-z_]+$/.test(p))
      .map((p) => p.slice(1));
  } catch {
    tables = [];
  }
  if (!tables.length) {
    add({ checkKey: "db-schema-unreadable", severity: "info", title: "Couldn't list database tables to test", detail: "The anonymous-access check was skipped.", fixHint: "Check SUPABASE_SECRET_KEY is set for the scanner.", fixable: false });
  }
  for (const table of tables) {
    checksRun++;
    const res = await get(`${supabase.url}/rest/v1/${table}?select=*&limit=1`, { headers: anon });
    if (res?.status === 200 && res.body.trim() !== "[]") {
      add({
        checkKey: `db-anon-read:${table}`,
        severity: "critical",
        title: `Anyone can read the ${table} table`,
        detail: "The public Supabase key (shipped to every browser) returned rows. This is how most Supabase data leaks happen.",
        fixHint: `Enable row-level security on public.${table} and add policies limited to signed-in members.`,
        fixable: true,
      });
    }
  }

  // 2. Storage: anonymous listing of any bucket.
  checksRun++;
  const buckets = await get(`${supabase.url}/storage/v1/bucket`, { headers: { apikey: supabase.secretKey, Authorization: `Bearer ${supabase.secretKey}` } });
  let bucketIds: string[] = [];
  try {
    bucketIds = (JSON.parse(buckets?.body ?? "[]") as { id: string }[]).map((b) => b.id);
  } catch {
    bucketIds = [];
  }
  for (const bucket of bucketIds) {
    const res = await get(`${supabase.url}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: "POST",
      headers: { ...anon, Authorization: `Bearer ${supabase.publishableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 1 }),
    });
    if (res?.status === 200 && res.body.trim() !== "[]") {
      add({ checkKey: `storage-anon-list:${bucket}`, severity: "high", title: `Anyone can list files in the ${bucket} bucket`, detail: "File names (and possibly files) are visible without signing in.", fixHint: `Remove anonymous SELECT policies on storage.objects for bucket ${bucket}.`, fixable: true });
    }
  }

  // 3. Auth settings: invite-only and confirmed emails.
  checksRun++;
  const settings = await get(`${supabase.url}/auth/v1/settings`, { headers: anon });
  try {
    const s = JSON.parse(settings?.body ?? "{}") as { disable_signup?: boolean; mailer_autoconfirm?: boolean };
    if (s.disable_signup === false) {
      add({ checkKey: "auth-signup-open", severity: "high", title: "Anyone can create an account", detail: "Supabase public sign-ups are on, but the app is invite-only.", fixHint: "Supabase → Authentication → Sign In / Providers: turn off \"Allow new users to sign up\".", fixable: false });
    }
    if (s.mailer_autoconfirm === true) {
      add({ checkKey: "auth-autoconfirm", severity: "high", title: "Email addresses aren't verified", detail: "With \"Confirm email\" off, a user can change their email to someone else's without proof.", fixHint: "Supabase → Authentication → Email: turn on \"Confirm email\" and \"Secure email change\".", fixable: false });
    }
  } catch {
    // settings unavailable
  }

  // 4. Pages and APIs that must require sign-in.
  for (const path of ["/admin", "/web", "/analytics", "/admin/security", "/api/profile", "/api/attachments/00000000-0000-0000-0000-000000000000"]) {
    checksRun++;
    const res = await get(`${appUrl}${path}`, { redirect: "manual" });
    const toLogin = res && res.status >= 300 && res.status < 400 && (res.location ?? "").includes("/login");
    if (res && !toLogin && res.status !== 401 && res.status !== 404) {
      add({ checkKey: `unauth:${path}`, severity: "critical", title: `${path} opens without signing in`, detail: `Expected a redirect to sign-in; got HTTP ${res.status}.`, fixHint: "Check proxy.ts public paths and the page's own auth check.", fixable: true });
    }
  }
  for (const path of ["/api/cron/weekly-digest?dry=1", "/api/cron/web-weekly?dry=1", "/api/cron/security-scan"]) {
    checksRun++;
    const res = await get(`${appUrl}${path}`, { redirect: "manual", headers: { Authorization: "Bearer wrong" } });
    if (res && res.status !== 401 && res.status !== 404) {
      add({ checkKey: `cron-open:${path.split("?")[0]}`, severity: "critical", title: `${path.split("?")[0]} runs without the cron secret`, detail: `Got HTTP ${res.status} with a wrong secret.`, fixHint: "Require CRON_SECRET with a constant-time comparison.", fixable: true });
    }
  }

  // 5. Sign-in redirect tricks (the open redirect fixed in Nov 2026).
  checksRun++;
  const tricks = ["//evil.example", "/\t/evil.example", "/\n/evil.example", "/\\evil.example", "https://evil.example", "/%09/evil.example"];
  const escaped = tricks.filter((t) => new URL(safeNext(decodeURIComponent(t)), appUrl).host !== target);
  if (escaped.length) {
    add({ checkKey: "open-redirect", severity: "high", title: "Sign-in redirect can send people to another site", detail: `These next= values leave the site: ${escaped.map((t) => JSON.stringify(t)).join(", ")}.`, fixHint: "Validate next= with the URL parser in lib/safe-next.ts.", fixable: true });
  }

  return { target, reached: true, checksRun, findings };
}
