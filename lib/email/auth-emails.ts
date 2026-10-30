import "server-only";
import { publicOrigin } from "@/lib/request-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailProviderConfigured, sendEmail } from "./send";
import { escapeHtml } from "./templates";

/**
 * Account emails (invites, password links, sign-in links) sent by the app
 * through Resend/SMTP, from Five9 Media, instead of Supabase's mailer.
 * Supabase still creates the one-time link; we just deliver it.
 * Returns false when no email provider is set up, so callers can fall back
 * to having Supabase send the email.
 */

type Kind = "invite" | "recovery" | "magiclink";

const COPY: Record<Kind, { subject: string; line: string; button: string }> = {
  invite: { subject: "You're invited to Five9 Media", line: "Accept the invite to set your password and get started.", button: "Accept invitation" },
  recovery: { subject: "Set your Five9 Media password", line: "Use the button below to choose a password for your Five9 Media account.", button: "Set password" },
  magiclink: { subject: "Your Five9 Media sign-in link", line: "Tap the button below to sign in. This link works once.", button: "Sign in" },
};

function render(kind: Kind, heading: string, url: string, email: string, origin: string) {
  const copy = COPY[kind];
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light only" /><title>Five9 Media</title></head>
<body style="margin:0;padding:0;background:#f2f2f0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f0;"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:${font};color:#121212;">
    <tr><td align="center" style="background:#0a0a0a;padding:26px 24px;border-bottom:4px solid #e10600;">
      <img src="${escapeHtml(origin)}/five9-logo.png" alt="five9" width="110" style="display:block;width:110px;height:auto;border:0;" />
    </td></tr>
    <tr><td align="center" style="padding:36px 36px 40px 36px;">
      <h1 style="margin:0 0 12px 0;font-size:24px;line-height:30px;font-weight:800;color:#121212;">${escapeHtml(heading)}</h1>
      <p style="margin:0 0 28px 0;font-size:16px;line-height:24px;color:#4a4a4a;">${copy.line}</p>
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 32px;background:#e10600;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${copy.button}</a>
    </td></tr>
  </table>
  <p style="margin:16px 0 0 0;font-family:${font};font-size:12px;color:#9a9a9a;">Sent to ${escapeHtml(email)} &middot; Five9 Media</p>
</td></tr></table>
</body></html>`;
}

/**
 * Creates the link and emails it. For "invite" this also creates the account
 * (pass `data` for its metadata); the new user's id is returned.
 */
export async function sendAuthEmail(
  kind: Kind,
  rawEmail: string,
  options: { invitedBy?: string; data?: Record<string, unknown>; next?: string } = {},
): Promise<{ sent: false } | { sent: true; userId: string }> {
  if (!emailProviderConfigured()) return { sent: false };
  const email = rawEmail.trim().toLowerCase();
  const origin = await publicOrigin();
  const { data, error } = await createAdminClient().auth.admin.generateLink(
    kind === "invite" ? { type: "invite", email, options: { data: options.data } } : { type: kind, email },
  );
  if (error) throw error;

  const next = kind === "magiclink" ? (options.next ?? "/boards") : "/account/set-password";
  const url = `${origin}/auth/callback?${new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: data.properties.verification_type,
    next,
  })}`;
  const heading =
    kind === "invite"
      ? options.invitedBy
        ? `${options.invitedBy} invited you to Five9 Media`
        : "You're invited to Five9 Media"
      : kind === "recovery"
        ? "Set your password"
        : "Sign in to Five9 Media";

  await sendEmail({ to: [email], subject: COPY[kind].subject, html: render(kind, heading, url, email, origin) });
  return { sent: true, userId: data.user.id };
}

/**
 * Password-reset / sign-in links requested from the public login pages. Only
 * existing, active accounts get an email (invite only), at most one a minute,
 * and the caller never learns whether the address exists.
 */
export async function sendPublicAuthEmail(kind: "recovery" | "magiclink", rawEmail: string, next?: string): Promise<boolean> {
  if (!emailProviderConfigured()) return false;
  const email = rawEmail.trim().toLowerCase();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id, is_active").eq("email", email).maybeSingle();
  if (!profile?.is_active) return true;

  const { data: userData } = await admin.auth.admin.getUserById(profile.id);
  const last = Number(userData.user?.app_metadata?.last_auth_email_at ?? 0);
  if (Date.now() - last < 60_000) return true;
  await admin.auth.admin.updateUserById(profile.id, {
    app_metadata: { ...userData.user?.app_metadata, last_auth_email_at: Date.now() },
  });
  await sendAuthEmail(kind, email, { next });
  return true;
}
