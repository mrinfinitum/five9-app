import { connection } from "next/server";

/** The version currently deployed, so open tabs can tell when they're out of date. */
export async function GET() {
  await connection();
  return Response.json(
    { version: process.env.VERCEL_GIT_COMMIT_SHA ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
