"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isPresetAdmin, siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAN_FOREVER = "876000h"; // ~100 years

async function guard(fn: (ctx: { actorId: string }) => Promise<string | void>): Promise<AdminResult> {
  try {
    const actor = await getCurrentUser();
    if (!actor?.isAdmin) throw new Error("Admins only.");
    const message = await fn({ actorId: actor.id });
    refresh();
    return { ok: true, message: message ?? undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

async function targetEmail(userId: string) {
  const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error("User not found.");
  return (data.user.email ?? "").toLowerCase();
}

function inviteRedirect() {
  return `${siteUrl()}/auth/callback?next=/account/set-password`;
}

export async function inviteUserAction(input: { email: string; fullName?: string; role?: string }): Promise<AdminResult> {
  return guard(async () => {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");
    const fullName = input.fullName?.trim().slice(0, 120) || undefined;
    const role = input.role === "admin" || isPresetAdmin(email) ? "admin" : "member";

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: fullName ? { full_name: fullName } : undefined,
      redirectTo: inviteRedirect(),
    });
    if (error) {
      if (/already/i.test(error.message)) throw new Error(`${email} already has an account.`);
      throw new Error(error.message);
    }

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ id: data.user.id, email, full_name: fullName ?? null, role, is_active: true }, { onConflict: "id" });
    if (profileError) throw new Error(profileError.message);
    return `Invite sent to ${email}.`;
  });
}

export async function resendInviteAction(userId: string): Promise<AdminResult> {
  return guard(async () => {
    const email = await targetEmail(userId);
    const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email, { redirectTo: inviteRedirect() });
    if (error) throw new Error(error.message);
    return `Invite re-sent to ${email}.`;
  });
}

export async function setRoleAction(userId: string, role: "admin" | "member"): Promise<AdminResult> {
  return guard(async ({ actorId }) => {
    if (role !== "admin" && role !== "member") throw new Error("Unknown role.");
    const email = await targetEmail(userId);
    if (role === "member" && isPresetAdmin(email)) throw new Error("Preset admins can't be changed here. Edit ADMIN_EMAILS instead.");
    if (role === "member" && userId === actorId) throw new Error("You can't remove your own admin access.");
    const { error } = await createAdminClient().from("profiles").update({ role }).eq("id", userId);
    if (error) throw new Error(error.message);
  });
}

export async function setActiveAction(userId: string, active: boolean): Promise<AdminResult> {
  return guard(async ({ actorId }) => {
    const email = await targetEmail(userId);
    if (!active && isPresetAdmin(email)) throw new Error("Preset admins can't be deactivated.");
    if (!active && userId === actorId) throw new Error("You can't deactivate yourself.");
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : BAN_FOREVER });
    if (authError) throw new Error(authError.message);
    const { error } = await admin.from("profiles").update({ is_active: active }).eq("id", userId);
    if (error) throw new Error(error.message);
  });
}

export async function renameUserAction(userId: string, fullName: string): Promise<AdminResult> {
  return guard(async () => {
    const name = fullName.trim().slice(0, 120);
    const { error } = await createAdminClient().from("profiles").update({ full_name: name || null }).eq("id", userId);
    if (error) throw new Error(error.message);
  });
}

export async function deleteUserAction(userId: string): Promise<AdminResult> {
  return guard(async ({ actorId }) => {
    const email = await targetEmail(userId);
    if (isPresetAdmin(email)) throw new Error("Preset admins can't be deleted.");
    if (userId === actorId) throw new Error("You can't delete yourself.");
    const { error } = await createAdminClient().auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return `${email} was removed.`;
  });
}
