"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isPresetAdmin } from "@/lib/env";
import { publicOrigin } from "@/lib/request-origin";
import { randomUUID } from "node:crypto";
import { refreshEmailLogo } from "@/lib/requests/email-logo";
import { ATTACHMENT_BUCKET, BOARD_LOGO_BUCKET, LOGO_TYPES, MAX_LOGO_BYTES } from "@/lib/requests/constants";
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

async function inviteRedirect() {
  return `${await publicOrigin()}/auth/callback?next=/account/set-password`;
}

export type BoardGrant = { boardId: string; access: "team" | "requester" };

export async function inviteUserAction(input: {
  email: string;
  fullName?: string;
  role?: string;
  boards?: BoardGrant[];
}): Promise<AdminResult> {
  return guard(async () => {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");
    const fullName = input.fullName?.trim().slice(0, 120) || undefined;
    const role = input.role === "admin" || isPresetAdmin(email) ? "admin" : "member";

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: fullName ? { full_name: fullName } : undefined,
      redirectTo: await inviteRedirect(),
    });
    if (error) {
      if (/already/i.test(error.message)) throw new Error(`${email} already has an account.`);
      throw new Error(error.message);
    }

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ id: data.user.id, email, full_name: fullName ?? null, role, is_active: true }, { onConflict: "id" });
    if (profileError) throw new Error(profileError.message);

    const grants = (input.boards ?? []).filter((g) => g.access === "team" || g.access === "requester");
    if (grants.length) {
      const { error: accessError } = await admin
        .from("board_members")
        .upsert(grants.map((g) => ({ board_id: g.boardId, user_id: data.user.id, access: g.access })));
      if (accessError) throw new Error(accessError.message);
    }
    return `Invite sent to ${email}.`;
  });
}

export async function resendInviteAction(userId: string): Promise<AdminResult> {
  return guard(async () => {
    const email = await targetEmail(userId);
    const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email, { redirectTo: await inviteRedirect() });
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

// ---------------------------------------------------------------------------
// Board access
// ---------------------------------------------------------------------------

/** Gives a user team/requester access to a board, or removes it (access = null). */
export async function setBoardAccessAction(boardId: string, userId: string, access: "team" | "requester" | null): Promise<AdminResult> {
  return guard(async () => {
    const admin = createAdminClient();
    const { error } = access
      ? await admin.from("board_members").upsert({ board_id: boardId, user_id: userId, access })
      : await admin.from("board_members").delete().eq("board_id", boardId).eq("user_id", userId);
    if (error) throw new Error(error.message);
  });
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "board"
  );
}

export async function createBoardAction(input: { name: string; description?: string }): Promise<AdminResult> {
  return guard(async () => {
    const name = input.name.trim().slice(0, 80);
    if (name.length < 2) throw new Error("Board names need at least 2 characters.");
    const admin = createAdminClient();
    const base = slugify(name).padEnd(2, "0");
    const { data: taken } = await admin.from("boards").select("slug").like("slug", `${base}%`);
    const used = new Set((taken ?? []).map((b) => b.slug));
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    const { error } = await admin
      .from("boards")
      .insert({ name, slug, description: input.description?.trim().slice(0, 300) || null });
    if (error) throw new Error(error.message);
    return `Board “${name}” created.`;
  });
}

export async function updateBoardAction(
  boardId: string,
  input: { name?: string; description?: string },
): Promise<AdminResult> {
  return guard(async () => {
    const update: Record<string, string | null> = {};
    if (input.name !== undefined) {
      const name = input.name.trim().slice(0, 80);
      if (name.length < 2) throw new Error("Board names need at least 2 characters.");
      update.name = name;
    }
    if (input.description !== undefined) update.description = input.description.trim().slice(0, 300) || null;
    const { error } = await createAdminClient().from("boards").update(update).eq("id", boardId);
    if (error) throw new Error(error.message);
  });
}

/** Deletes a board with all of its requests, conversations, and files. */
export async function deleteBoardAction(boardId: string): Promise<AdminResult> {
  return guard(async () => {
    const admin = createAdminClient();
    const { data: board } = await admin.from("boards").select("name, logo_path, logo_light_path, email_logo_path").eq("id", boardId).maybeSingle();
    if (!board) throw new Error("Board not found.");
    const logos = [board.logo_path, board.logo_light_path, board.email_logo_path].filter((p): p is string => Boolean(p));
    if (logos.length) await admin.storage.from(BOARD_LOGO_BUCKET).remove(logos);
    const { data: files } = await admin
      .from("request_attachments")
      .select("storage_path, requests!inner(board_id)")
      .eq("requests.board_id", boardId);
    const { error } = await admin.from("boards").delete().eq("id", boardId);
    if (error) throw new Error(error.message);
    const paths = (files ?? []).map((f) => f.storage_path);
    for (let i = 0; i < paths.length; i += 100) {
      await admin.storage.from(ATTACHMENT_BUCKET).remove(paths.slice(i, i + 100));
    }
    return `Board “${board.name}” was deleted.`;
  });
}

// ---------------------------------------------------------------------------
// Board logos
// ---------------------------------------------------------------------------

async function ensureLogoBucket() {
  const storage = createAdminClient().storage;
  const settings = { public: true, fileSizeLimit: MAX_LOGO_BYTES, allowedMimeTypes: [...LOGO_TYPES] };
  const { data } = await storage.getBucket(BOARD_LOGO_BUCKET);
  if (!data) {
    const { error } = await storage.createBucket(BOARD_LOGO_BUCKET, settings);
    if (error && !/already exists/i.test(error.message)) throw new Error(error.message);
  } else if (!LOGO_TYPES.every((type) => data.allowed_mime_types?.includes(type))) {
    // Older buckets were created before SVG was allowed.
    const { error } = await storage.updateBucket(BOARD_LOGO_BUCKET, settings);
    if (error) throw new Error(error.message);
  }
}

/**
 * SVGs can carry scripts and links. Logos only need shapes and colours, so
 * anything active is refused outright rather than cleaned up.
 */
function svgProblem(svg: string) {
  if (!/<svg[\s>]/i.test(svg)) return "That file isn't a valid SVG.";
  if (/<script|<foreignObject|<iframe|<embed|<object|<use[^>]+href\s*=\s*["']?(?!#)/i.test(svg)) return "This SVG contains scripts or embedded content. Export it as a plain SVG.";
  if (/\son[a-z]+\s*=/i.test(svg) || /javascript:/i.test(svg)) return "This SVG contains scripts. Export it as a plain SVG.";
  if (/<!ENTITY/i.test(svg)) return "This SVG uses entities, which aren't allowed.";
  return null;
}

/** One-time upload URL for a board logo (PNG, JPG, WebP, or GIF up to 2 MB). */
export async function createBoardLogoUploadAction(
  boardId: string,
  contentType: string,
  size: number,
): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  try {
    const actor = await getCurrentUser();
    if (!actor?.isAdmin) throw new Error("Admins only.");
    if (!(LOGO_TYPES as readonly string[]).includes(contentType)) throw new Error("Use an SVG, PNG, JPG, WebP, or GIF image.");
    if (size > MAX_LOGO_BYTES) throw new Error("Logos can be up to 2 MB.");
    await ensureLogoBucket();
    const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/svg+xml" ? "svg" : contentType.split("/")[1];
    const path = `${boardId}/${randomUUID()}.${ext}`;
    const { data, error } = await createAdminClient().storage.from(BOARD_LOGO_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? "Couldn't start the upload.");
    return { ok: true, path, token: data.token };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

/**
 * Saves an uploaded logo for dark or light mode (or clears it with null) and
 * deletes the replaced file. Each mode's logo is independent (any format,
 * SVG included); with only one set, it's used in both modes.
 */
export async function setBoardLogoAction(boardId: string, path: string | null, mode: "dark" | "light"): Promise<AdminResult> {
  return guard(async () => {
    if (path && !path.startsWith(`${boardId}/`)) throw new Error("That file doesn't belong to this board.");
    const admin = createAdminClient();
    const isSvg = Boolean(path?.endsWith(".svg"));
    if (isSvg) {
      const { data: file } = await admin.storage.from(BOARD_LOGO_BUCKET).download(path!);
      const problem = file ? svgProblem(await file.text()) : "Couldn't read the uploaded SVG.";
      if (problem) {
        await admin.storage.from(BOARD_LOGO_BUCKET).remove([path!]);
        throw new Error(problem);
      }
    }
    const { data: board } = await admin.from("boards").select("logo_path, logo_light_path").eq("id", boardId).maybeSingle();
    const column = mode === "light" ? "logo_light_path" : "logo_path";
    const update = { [column]: path };
    const { error } = await admin.from("boards").update(update).eq("id", boardId);
    if (error) throw new Error(error.message);

    const previous = board?.[column];
    if (previous && previous !== path) await admin.storage.from(BOARD_LOGO_BUCKET).remove([previous]);
    await refreshEmailLogo(boardId).catch((e) => console.error("[logo] email PNG failed", e instanceof Error ? e.message : e));

    const label = mode === "light" ? "Light-mode logo" : "Dark-mode logo";
    return path ? `${label} updated.` : `${label} removed.`;
  });
}

/** Paints a logo slot in one colour (e.g. white for dark mode), or back to its original colours with null. */
export async function setBoardLogoTintAction(boardId: string, mode: "dark" | "light", color: string | null): Promise<AdminResult> {
  return guard(async () => {
    if (color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("Pick a colour like #ffffff.");
    const column = mode === "light" ? "logo_light_tint" : "logo_dark_tint";
    const { error } = await createAdminClient().from("boards").update({ [column]: color?.toLowerCase() ?? null }).eq("id", boardId);
    if (error) throw new Error(error.message);
    await refreshEmailLogo(boardId).catch((e) => console.error("[logo] email PNG failed", e instanceof Error ? e.message : e));
  });
}
