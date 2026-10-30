"use server";

import { isPresetAdmin } from "@/lib/env";
import { publicOrigin } from "@/lib/request-origin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * First-time sign-in for preset admins (ADMIN_EMAILS): if they don't have an
 * account yet, email them an invite. Everyone else must be invited by an admin.
 */
export async function requestPresetAdminInvite(rawEmail: string): Promise<"invited" | "not_preset" | "exists"> {
  const email = rawEmail.trim().toLowerCase();
  if (!isPresetAdmin(email)) return "not_preset";

  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return "exists";

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${await publicOrigin()}/auth/callback?next=/account/set-password`,
  });
  if (error) {
    if (/already/i.test(error.message)) return "exists";
    throw new Error(error.message);
  }
  await admin.from("profiles").upsert({ id: data.user.id, email, role: "admin", is_active: true }, { onConflict: "id" });
  return "invited";
}
