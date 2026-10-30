import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Lets a signed-in user set their own display name. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Signed out" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { fullName?: unknown };
  const fullName = typeof body.fullName === "string" ? body.fullName.trim().slice(0, 120) : "";
  if (!fullName) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const { error } = await createAdminClient().from("profiles").update({ full_name: fullName }).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
