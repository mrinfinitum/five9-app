import { timingSafeEqual } from "node:crypto";
import { connection, type NextRequest } from "next/server";
import { runSecurityScan } from "@/lib/security/scan";

// Checks every site in parallel; the slowest site sets the pace.
export const maxDuration = 300;

function cronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Daily security scan (vercel.json). Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  await connection();
  if (!cronAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runSecurityScan("schedule");
  return Response.json(result);
}
