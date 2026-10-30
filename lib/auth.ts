import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isPresetAdmin } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  isPresetAdmin: boolean;
};

/**
 * Reads the signed-in user and their profile. Returns null when signed out
 * or when the account has been deactivated. Preset admins (ADMIN_EMAILS) are
 * promoted and re-activated automatically.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return null;

  const userId = claims.sub;
  const email = String(claims.email ?? "").toLowerCase();
  const preset = isPresetAdmin(email);

  let { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (preset && (!profile || profile.role !== "admin" || !profile.is_active)) {
    const admin = createAdminClient();
    const { data: upserted } = await admin
      .from("profiles")
      .upsert({ id: userId, email, role: "admin", is_active: true }, { onConflict: "id" })
      .select("id, email, full_name, role, is_active")
      .single();
    profile = upserted;
  }

  if (!profile || !profile.is_active) return null;

  return {
    id: userId,
    email,
    name: profile.full_name || email.split("@")[0],
    isAdmin: profile.role === "admin",
    isPresetAdmin: preset,
  };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?error=no_access");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/projects");
  return user;
}
