import { timingSafeEqual } from "node:crypto";
import { connection, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildWeeklyDigests, sendWeeklyDigests } from "@/lib/email/weekly-digest";
import { publicOrigin } from "@/lib/request-origin";

// Sending runs one email at a time; give it room.
export const maxDuration = 300;

function cronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Monday-morning open-ticket reminders (scheduled in vercel.json).
 * - Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET` and every
 *   digest is sent. Add `?dry=1` to list who would get one without sending.
 * - `?preview=1` (optionally `&email=someone@…`) shows one digest in the
 *   browser, for a signed-in admin or a cron-secret caller. Nothing is sent.
 */
export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const origin = await publicOrigin();

  const cron = cronAuthorized(request);
  const user = cron ? null : await getCurrentUser();

  // Preview one person's digest in the browser (admins, or with the cron secret). Nothing is sent.
  if (params.get("preview") === "1" && (cron || user?.isAdmin)) {
    const email = (params.get("email") ?? user?.email ?? "").toLowerCase();
    const digests = await buildWeeklyDigests(origin);
    const digest = digests.find((d) => d.person.email.toLowerCase() === email);
    if (!digest) {
      const people = digests.map((d) => d.person.email).join(", ") || "nobody";
      return new Response(`No open tickets for ${email || "that person"}. Digests this week: ${people}`, {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(digest.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  if (!cron) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const digests = await buildWeeklyDigests(origin);
  const summary = digests.map((d) => ({ email: d.person.email, assigned: d.assigned.length, requested: d.requested.length, subject: d.subject }));
  if (params.get("dry") === "1") return Response.json({ dryRun: true, count: digests.length, digests: summary });
  const results = await sendWeeklyDigests(digests);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) console.error("[digest] Some digests failed", failed);
  return Response.json({ sent: results.length - failed.length, failed });
}
