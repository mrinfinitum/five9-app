import "server-only";
import { sendEmail } from "@/lib/email/send";
import { securityViewerEmails } from "./access";
import { button, escapeHtml, layout } from "@/lib/email/templates";
import { listWebSites } from "@/lib/google/access";
import { supabasePublishableKey, supabaseSecretKey, supabaseUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { appChecks, siteChecks, type Finding, type Severity, type TargetResult } from "./checks";

/** The app's own public address (scanned in depth). */
export function appUrl() {
  return (process.env.SECURITY_APP_URL || "https://app.five9.media").replace(/\/$/, "");
}

/** Client sites: the domains linked in web analytics (Search Console), scanned from the outside only. */
async function clientSites() {
  const sites = await listWebSites();
  const urls = new Set<string>();
  for (const s of sites) {
    const sc = s.searchConsoleSite;
    if (!sc) continue;
    const url = sc.startsWith("sc-domain:") ? `https://${sc.slice(10)}` : sc;
    try {
      urls.add(new URL(url).origin);
    } catch {
      // skip malformed
    }
  }
  urls.delete(new URL(appUrl()).origin);
  return [...urls];
}

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const fingerprint = (f: Finding) => `${f.target}|${f.checkKey}`;

export async function runSecurityScan(trigger: "schedule" | "manual", startedBy?: string) {
  const db = createAdminClient();
  const app = appUrl();
  const clients = await clientSites();
  const { data: scan, error } = await db
    .from("security_scans")
    .insert({ trigger, started_by: startedBy ?? null, targets: [new URL(app).host, ...clients.map((c) => new URL(c).host)] })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  try {
    const results: TargetResult[] = await Promise.all([
      siteChecks(app, { isApp: true }),
      appChecks(app, { url: supabaseUrl(), publishableKey: supabasePublishableKey(), secretKey: supabaseSecretKey() }),
      ...clients.map((url) => siteChecks(url, { isApp: false })),
    ]);
    const found = results.flatMap((r) => r.findings);
    const reached = new Set(results.filter((r) => r.reached).map((r) => r.target));
    // A target that failed to load only reports that; don't mark its other findings fixed.
    const unreachable = new Set(results.filter((r) => !r.reached).map((r) => r.target));
    const now = new Date().toISOString();

    const { data: existing, error: readError } = await db.from("security_findings").select("id, fingerprint, target, status");
    if (readError) throw new Error(readError.message);
    const byPrint = new Map((existing ?? []).map((row) => [row.fingerprint as string, row]));
    const alerts: Finding[] = [];

    for (const f of found) {
      const print = fingerprint(f);
      const row = byPrint.get(print);
      const fields = { target: f.target, check_key: f.checkKey, severity: f.severity, title: f.title, detail: f.detail, fix_hint: f.fixHint, fixable: f.fixable, last_seen: now };
      if (!row) {
        await db.from("security_findings").insert({ fingerprint: print, ...fields });
        if (f.severity === "critical" || f.severity === "high") alerts.push(f);
      } else {
        const reopened = row.status === "fixed";
        await db
          .from("security_findings")
          .update({ ...fields, ...(reopened ? { status: "open", resolved_at: null } : {}) })
          .eq("id", row.id);
        if (reopened && (f.severity === "critical" || f.severity === "high")) alerts.push(f);
      }
    }

    // Anything open that wasn't seen this time on a reachable target is fixed.
    const seen = new Set(found.map(fingerprint));
    const resolved = (existing ?? []).filter(
      (row) => (row.status === "open" || row.status === "fixing") && !seen.has(row.fingerprint) && reached.has(row.target) && !unreachable.has(row.target),
    );
    if (resolved.length) {
      await db.from("security_findings").update({ status: "fixed", resolved_at: now }).in("id", resolved.map((r) => r.id));
    }

    const checksRun = results.reduce((sum, r) => sum + r.checksRun, 0);
    await db.from("security_scans").update({ status: "done", finished_at: now, checks_run: checksRun }).eq("id", scan.id);

    if (alerts.length) await emailAlerts(alerts).catch((e) => console.error("[security] alert email failed", e));
    return { scanId: scan.id as string, findings: found.length, newAlerts: alerts.length, resolved: resolved.length, checksRun };
  } catch (err) {
    await db.from("security_scans").update({ status: "failed", finished_at: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) }).eq("id", scan.id);
    throw err;
  }
}

async function emailAlerts(alerts: Finding[]) {
  const sorted = [...alerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const rows = sorted
    .map(
      (f) =>
        `<li style="margin:0 0 10px"><strong style="color:${f.severity === "critical" ? "#b91c1c" : "#c2410c"};text-transform:uppercase;font-size:12px">${f.severity}</strong> · ${escapeHtml(f.target)}<br /><strong>${escapeHtml(f.title)}</strong><br /><span style="color:#555">${escapeHtml(f.detail)}</span></li>`,
    )
    .join("");
  await sendEmail({
    to: securityViewerEmails(),
    subject: `Security scan: ${alerts.length} new ${alerts.length === 1 ? "problem" : "problems"} (${sorted[0].severity})`,
    html: layout(`<h1 style="font-size:20px;margin:0 0 12px">New security findings</h1><ul style="padding-left:18px">${rows}</ul>${button(`${appUrl()}/admin/security`, "Open the security page")}`, appUrl()),
  });
}
