import "server-only";

export type FindingRow = {
  id: string;
  target: string;
  check_key: string;
  severity: string;
  title: string;
  detail: string;
  fix_hint: string;
  fixable: boolean;
};

/** Repo the fix PRs go to, e.g. "mrinfinitum/five9-app". */
export function fixRepo() {
  return process.env.SECURITY_FIX_REPO || "mrinfinitum/five9-app";
}

/** True when the app can open GitHub issues that start a Claude fix. */
export function fixAutomationReady() {
  return Boolean(process.env.SECURITY_GITHUB_TOKEN);
}

/** Self-contained instructions for Claude (the issue body, or a prompt to paste). */
export function fixPrompt(f: FindingRow) {
  return [
    `Fix this security finding in the Five9 Media request tracker (${fixRepo()}).`,
    "",
    `Severity: ${f.severity}`,
    `Where: ${f.target}`,
    `Check: ${f.check_key}`,
    `Problem: ${f.title}`,
    `Details: ${f.detail}`,
    `Suggested fix: ${f.fix_hint}`,
    "",
    "Steps:",
    "1. Read AGENTS.md first (this Next.js version differs from older ones; docs are in node_modules/next/dist/docs/).",
    "2. Reproduce or confirm the problem in the code. If it isn't real, say why in the PR and change nothing.",
    "3. Make the smallest change that fixes it. Database changes go in a new numbered file in supabase/migrations/ (they run on deploy).",
    "4. Run `npm run typecheck` and `npm run lint`.",
    "5. Open a pull request titled \"Security: <short description>\" explaining the risk, the fix and how you checked it. Don't merge it.",
  ].join("\n");
}

/** Opens a GitHub issue labelled security-fix, which starts the Claude fix routine. */
export async function openFixIssue(f: FindingRow) {
  const token = process.env.SECURITY_GITHUB_TOKEN;
  if (!token) throw new Error("Fix automation isn't connected yet.");
  const res = await fetch(`https://api.github.com/repos/${fixRepo()}/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ title: `[security/${f.severity}] ${f.title}`.slice(0, 250), body: fixPrompt(f), labels: ["security-fix"] }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { html_url?: string; message?: string };
  if (!res.ok || !body.html_url) throw new Error(`GitHub didn't create the issue: ${body.message ?? res.statusText}`);
  return body.html_url;
}
