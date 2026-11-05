import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Lets a signed-in user set their own display name. */
export async function POST(request: NextRequest) {
  // Active accounts only: deactivated users keep a valid session token until it expires.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Signed out" }, { status: 401 });
  const userId = user.id;

  const body = (await request.json().catch(() => ({}))) as { fullName?: unknown };
  const fullName = typeof body.fullName === "string" ? body.fullName.trim().slice(0, 120) : "";
  if (!fullName) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const { error } = await createAdminClient().from("profiles").update({ full_name: fullName }).eq("id", userId);
  if (error) {
    console.error("[profile] update failed", error.message);
    return NextResponse.json({ error: "Could not save your name" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
