import { ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { FindingList, RunScanButton, type FindingView } from "@/components/security/security-console";
import { requireAdmin } from "@/lib/auth";
import { fixAutomationReady, fixRepo } from "@/lib/security/fix";
import { SEVERITY_ORDER } from "@/lib/security/scan";
import type { Severity } from "@/lib/security/checks";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Security" };
// "Run scan now" checks every site from this page's server action.
export const maxDuration = 300;

export default function SecurityPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-panel" />}>
        <Security />
      </Suspense>
    </main>
  );
}

const SEVERITIES: { key: Severity; label: string; className: string }[] = [
  { key: "critical", label: "Critical", className: "text-red-400" },
  { key: "high", label: "High", className: "text-orange-400" },
  { key: "medium", label: "Medium", className: "text-amber-300" },
  { key: "low", label: "Low", className: "text-sky-300" },
];

function when(iso: string | null) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function Security() {
  await requireAdmin();
  const db = createAdminClient();
  const [findingsRes, scansRes] = await Promise.all([
    db
      .from("security_findings")
      .select("id, target, check_key, severity, title, detail, fix_hint, fixable, status, first_seen, last_seen, resolved_at, fix_issue_url")
      .order("last_seen", { ascending: false })
      .limit(500),
    db.from("security_scans").select("id, started_at, finished_at, trigger, status, targets, checks_run, error").order("started_at", { ascending: false }).limit(8),
  ]);
  const missing = [findingsRes.error, scansRes.error].find((e) => e && (e.code === "42P01" || e.code === "PGRST205"));
  if (missing) return <p className="card p-6 text-sm text-muted">The security tables aren&apos;t set up yet. They&apos;re created on the next deploy.</p>;
  if (findingsRes.error) throw new Error(findingsRes.error.message);
  if (scansRes.error) throw new Error(scansRes.error.message);

  const findings = (findingsRes.data ?? []) as FindingView[];
  const scans = scansRes.data ?? [];
  const lastScan = scans.find((s) => s.status !== "running") ?? scans[0];
  const active = findings
    .filter((f) => f.status === "open" || f.status === "fixing")
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.target.localeCompare(b.target));
  const closed = findings.filter((f) => f.status === "fixed" || f.status === "ignored").slice(0, 40);
  const targets = [...new Set([...(lastScan?.targets ?? []), ...active.map((f) => f.target)])];

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-brand">
            <ShieldCheck className="h-3.5 w-3.5" /> Security
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Security checks</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Scanned every day at 5 AM Central. This app gets a deep test (database access, sign-in, protected pages); client sites get outside-only
            checks (HTTPS, certificates, headers, exposed files, leaked keys).
          </p>
        </div>
        <RunScanButton />
      </header>

      <section aria-label="Open findings by severity" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {SEVERITIES.map((s) => {
          const count = active.filter((f) => f.severity === s.key).length;
          return (
            <article className="card px-4 py-3" key={s.key}>
              <small className="text-xs uppercase tracking-wider text-muted">{s.label}</small>
              <strong className={`mt-1 block text-3xl font-black tabular-nums ${count ? s.className : "text-white"}`}>{count}</strong>
            </article>
          );
        })}
        <article className="card col-span-2 px-4 py-3 sm:col-span-1">
          <small className="text-xs uppercase tracking-wider text-muted">Last scan</small>
          <strong className="mt-1 block text-sm font-semibold text-white">{when(lastScan?.finished_at ?? lastScan?.started_at ?? null)}</strong>
          <span className="text-xs text-muted">
            {lastScan ? (lastScan.status === "failed" ? `Failed: ${lastScan.error ?? "unknown error"}` : `${lastScan.checks_run} checks · ${lastScan.trigger}`) : "No scans yet"}
          </span>
        </article>
      </section>

      {!fixAutomationReady() ? (
        <p className="card mb-6 border-amber-700/50 p-4 text-sm text-neutral-300">
          <strong className="text-white">Claude fixes aren&apos;t connected yet.</strong> Fix copies a ready-to-paste prompt for now. To have Fix open a pull request
          automatically, add <code className="text-white">SECURITY_GITHUB_TOKEN</code> (a GitHub token that can create issues in {fixRepo()}) in Vercel, and
          connect GitHub to Claude so the fix routine can work on the repo.
        </p>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-black text-white">Open ({active.length})</h2>
        {active.length ? (
          <FindingList automation={fixAutomationReady()} findings={active} />
        ) : (
          <p className="card p-6 text-sm text-muted">{lastScan ? "Nothing open. Every check passed on the last scan." : "Run the first scan to see results."}</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-black text-white">Sites scanned</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {targets.map((t) => {
            const mine = active.filter((f) => f.target === t);
            const worst = mine.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0];
            const sev = SEVERITIES.find((s) => s.key === worst?.severity);
            return (
              <li className="card flex items-center justify-between gap-3 px-4 py-3 text-sm" key={t}>
                <span className="truncate text-white">{t}</span>
                <span className={`shrink-0 text-xs font-semibold ${sev ? sev.className : "text-emerald-400"}`}>
                  {mine.length ? `${mine.length} open · worst ${worst!.severity}` : "All clear"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {closed.length ? (
        <details className="mb-8">
          <summary className="cursor-pointer text-xl font-black text-white">Fixed and ignored ({closed.length})</summary>
          <div className="mt-3">
            <FindingList automation={false} findings={closed} />
          </div>
        </details>
      ) : null}

      <section>
        <h2 className="mb-3 text-xl font-black text-white">Recent scans</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left text-[0.65rem] uppercase tracking-wider text-muted">
                <th className="px-4 py-2 font-semibold" scope="col">Started</th>
                <th className="px-4 py-2 font-semibold" scope="col">How</th>
                <th className="px-4 py-2 font-semibold" scope="col">Result</th>
                <th className="px-4 py-2 text-right font-semibold" scope="col">Checks</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => (
                <tr className="border-t border-line" key={s.id}>
                  <td className="px-4 py-2 text-neutral-200">{when(s.started_at)}</td>
                  <td className="px-4 py-2 text-muted">{s.trigger === "manual" ? "Run now" : "Daily"}</td>
                  <td className={`px-4 py-2 ${s.status === "failed" ? "text-red-400" : "text-muted"}`}>{s.status === "failed" ? `Failed: ${s.error ?? ""}` : s.status}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{s.checks_run}</td>
                </tr>
              ))}
              {!scans.length ? (
                <tr>
                  <td className="px-4 py-4 text-muted" colSpan={4}>
                    No scans yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
