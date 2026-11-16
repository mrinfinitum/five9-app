import { timingSafeEqual } from "node:crypto";
import { connection, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildWebWeeklyEmails, sendWebWeeklyEmails } from "@/lib/email/web-weekly";
import { hasWebAnalyticsAccess } from "@/lib/google/access";
import { publicOrigin } from "@/lib/request-origin";

// One GA report per client, built one after another.
export const maxDuration = 300;

function cronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Monday web report emails, one per client board with a GA4 property.
 * - `?preview=1` (optionally `&client=slug&week=YYYY-MM-DD`) shows one email in
 *   the browser, for a signed-in web analytics viewer or a cron-secret caller.
 * - With `Authorization: Bearer $CRON_SECRET`: `?dry=1` lists what would be
 *   sent. Without it, emails go out only when WEB_WEEKLY_EMAIL_SEND=1;
 *   otherwise it behaves like a dry run. Runs Mondays at 14:15 UTC (vercel.json).
 *   Recipients are set in lib/email/web-weekly.ts.
 */
export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const origin = await publicOrigin();

  const cron = cronAuthorized(request);
  const user = cron ? null : await getCurrentUser();

  if (params.get("preview") === "1" && (cron || (user && (await hasWebAnalyticsAccess(user.id))))) {
    const emails = await buildWebWeeklyEmails(origin, { slug: params.get("client") ?? undefined, week: params.get("week") ?? undefined });
    const email = emails[0];
    if (!email) {
      return new Response("No client with a GA4 property matches.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    return new Response(email.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  if (!cron) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const emails = await buildWebWeeklyEmails(origin);
  const summary = emails.map((e) => ({ board: e.site.slug, to: e.to, subject: e.subject, insights: e.report.insights.length }));
  const sendingEnabled = process.env.WEB_WEEKLY_EMAIL_SEND === "1";
  if (params.get("dry") === "1" || !sendingEnabled) {
    return Response.json({ dryRun: true, sendingEnabled, count: emails.length, emails: summary });
  }
  const results = await sendWebWeeklyEmails(emails);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) console.error("[web-weekly] Some reports failed", failed);
  return Response.json({ sent: results.length - failed.length, failed });
}
