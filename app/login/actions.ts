"use server";

import { isPresetAdmin } from "@/lib/env";
import { publicOrigin } from "@/lib/request-origin";
import { sendAuthEmail, sendPublicAuthEmail } from "@/lib/email/auth-emails";
import { safeNext } from "@/lib/safe-next";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Emails a sign-in link or password link from Five9 Media. Returns false when
 * no email provider is set up, in which case the page asks Supabase instead.
 */
export async function requestAuthEmail(kind: "recovery" | "magiclink", email: string, next?: string): Promise<boolean> {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return true;
  return sendPublicAuthEmail(kind, email, kind === "magiclink" ? safeNext(next ?? null) : undefined);
}

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

  let userId: string;
  try {
    const sent = await sendAuthEmail("invite", email);
    if (sent.sent) userId = sent.userId;
    else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${await publicOrigin()}/auth/callback?next=/account/set-password`,
      });
      if (error) throw error;
      userId = data.user.id;
    }
  } catch (error) {
    if (/already/i.test(error instanceof Error ? error.message : String(error))) return "exists";
    throw error;
  }
  await admin.from("profiles").upsert({ id: userId, email, role: "admin", is_active: true }, { onConflict: "id" });
  return "invited";
}
