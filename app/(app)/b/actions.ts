"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { notify } from "@/lib/email/notify";
import { publicOrigin } from "@/lib/request-origin";
import {
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  isOneOf,
  requestCode,
} from "@/lib/requests/constants";
import { getRequest } from "@/lib/requests/data";
import type { RequestItem } from "@/lib/requests/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function date(value: unknown) {
  return typeof value === "string" && DATE_RE.test(value) ? value : null;
}

async function context() {
  const user = await getCurrentUser();
  if (!user) throw new Error("You are signed out. Please sign in again.");
  return { user, supabase: await createClient() };
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function check(error: { message: string } | null, friendly?: string) {
  if (error) throw new Error(friendly ?? error.message);
}

/** RLS hides requests you can't work on, so "no row" means no permission. */
async function requireWorkableRequest(supabase: Awaited<ReturnType<typeof createClient>>, requestId: string) {
  const { data, error } = await supabase.rpc("can_work_request", { target: requestId });
  check(error);
  if (!data) throw new Error("Only this board's team can do that.");
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type SubmitRequestInput = {
  boardId: string;
  title: string;
  requestType?: string;
  priority?: string;
  dueDate?: string;
  description?: string;
  /** Team only: create the request on someone else's behalf. */
  requesterId?: string;
};

export async function submitRequestAction(input: SubmitRequestInput): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    const { user, supabase } = await context();
    const title = text(input.title, 160);
    if (!title) throw new Error("Tell us what you need.");
    const description = text(input.description, 4000);
    if (!description) throw new Error("Add some details so the team knows what to make.");

    const { data: canWork } = await supabase.rpc("can_work_board", { target_board: input.boardId });
    const requesterId = canWork && input.requesterId ? input.requesterId : user.id;

    // New requests land at the top of Not Started.
    const { data: first } = await supabase
      .from("requests")
      .select("sort_order")
      .eq("board_id", input.boardId)
      .eq("status", "new")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("requests")
      .insert({
        board_id: input.boardId,
        title,
        description,
        priority: isOneOf(REQUEST_PRIORITIES, input.priority) && input.priority !== "urgent" ? input.priority : "normal",
        request_type: input.requestType || null,
        due_date: date(input.dueDate),
        requester_id: requesterId,
        created_by: user.id,
        sort_order: (first?.sort_order ?? 1024) - 1024,
      })
      .select("id, number")
      .single();
    check(error, error?.code === "42501" ? "You don't have access to submit requests on this board." : undefined);

    notify({ kind: "created", requestId: data!.id, actorId: user.id }, await publicOrigin());
    refresh();
    return { ok: true, id: data!.id as string, code: requestCode(data!.number as number) };
  } catch (error) {
    return fail(error);
  }
}

export type RequestPatch = Partial<{
  title: string;
  description: string;
  status: string;
  priority: string;
  requestType: string | null;
  dueDate: string | null;
  sortOrder: number;
  requesterId: string;
}>;

export async function updateRequestAction(requestId: string, patch: RequestPatch): Promise<ActionResult> {
  try {
    const { user, supabase } = await context();
    const update: Record<string, unknown> = {};
    if ("title" in patch) {
      const title = text(patch.title, 160);
      if (!title) throw new Error("Title can't be empty.");
      update.title = title;
    }
    if ("description" in patch) update.description = text(patch.description, 4000);
    if ("status" in patch) {
      if (!isOneOf(REQUEST_STATUSES, patch.status)) throw new Error("Unknown status.");
      update.status = patch.status;
    }
    if ("priority" in patch) {
      if (!isOneOf(REQUEST_PRIORITIES, patch.priority)) throw new Error("Unknown priority.");
      update.priority = patch.priority;
    }
    if ("requestType" in patch) update.request_type = patch.requestType || null;
    if ("dueDate" in patch) update.due_date = date(patch.dueDate);
    if ("sortOrder" in patch && Number.isFinite(patch.sortOrder)) update.sort_order = patch.sortOrder;
    if ("requesterId" in patch && patch.requesterId) update.requester_id = patch.requesterId;
    if (!Object.keys(update).length) return { ok: true };

    const { data: before } = await supabase.from("requests").select("status").eq("id", requestId).maybeSingle();
    const { data: updated, error } = await supabase.from("requests").update(update).eq("id", requestId).select("id");
    check(error);
    if (!updated?.length) throw new Error("Only this board's team can change requests.");

    // Completion is the one status change the requester is waiting on.
    if (update.status === "completed" && before?.status !== "completed") {
      notify({ kind: "completed", requestId, actorId: user.id }, await publicOrigin());
    }
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleAssigneeAction(requestId: string, userId: string, assign: boolean): Promise<ActionResult> {
  try {
    const { user, supabase } = await context();
    if (assign) {
      const { error } = await supabase.from("request_assignees").insert({ request_id: requestId, user_id: userId, assigned_by: user.id });
      if (error?.code === "23505") return { ok: true }; // already assigned
      check(error, error?.code === "42501" ? "Only this board's team can assign people." : undefined);
      notify({ kind: "assigned", requestId, actorId: user.id, assigneeId: userId }, await publicOrigin());
    } else {
      const { error } = await supabase.from("request_assignees").delete().eq("request_id", requestId).eq("user_id", userId);
      check(error);
    }
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setArchivedAction(requestId: string, archived: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await context();
    const { data, error } = await supabase
      .from("requests")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", requestId)
      .select("id");
    check(error);
    if (!data?.length) throw new Error("Only this board's team can archive requests.");
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Moves every completed or cancelled request on the board into the archive. */
export async function archiveClosedAction(boardId: string): Promise<ActionResult<{ count: number }>> {
  try {
    const { supabase } = await context();
    const { data, error } = await supabase
      .from("requests")
      .update({ archived_at: new Date().toISOString() })
      .eq("board_id", boardId)
      .in("status", ["completed", "cancelled"])
      .is("archived_at", null)
      .select("id");
    check(error);
    refresh();
    return { ok: true, count: data?.length ?? 0 };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteRequestAction(requestId: string): Promise<ActionResult> {
  try {
    const { supabase } = await context();
    await requireWorkableRequest(supabase, requestId);
    const { data: files } = await supabase.from("request_attachments").select("storage_path").eq("request_id", requestId);
    const { error } = await supabase.from("requests").delete().eq("id", requestId);
    check(error);
    if (files?.length) {
      await createAdminClient().storage.from(ATTACHMENT_BUCKET).remove(files.map((f) => f.storage_path));
    }
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Full details (conversation, files) for a request the board loaded as a summary. */
export async function getRequestAction(requestId: string): Promise<ActionResult<{ request: RequestItem }>> {
  try {
    await context();
    const request = await getRequest(requestId);
    if (!request) throw new Error("That request isn't available.");
    return { ok: true, request };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

export async function addCommentAction(requestId: string, body: string, isInternal = false): Promise<ActionResult> {
  try {
    const { user, supabase } = await context();
    const clean = text(body, 4000);
    if (!clean) throw new Error("Write a comment first.");
    const { error } = await supabase
      .from("request_comments")
      .insert({ request_id: requestId, author_id: user.id, body: clean, is_internal: isInternal });
    check(error, error?.code === "42501" ? "You can't post on this request." : undefined);
    if (!isInternal) notify({ kind: "comment", requestId, actorId: user.id, body: clean }, await publicOrigin());
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export async function createRequestTypeAction(name: string): Promise<ActionResult<{ key: string; name: string }>> {
  try {
    const { supabase } = await context();
    const clean = text(name, 60);
    if (!clean || clean.length < 2) throw new Error("Category names need at least 2 characters.");
    const key = clean
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
    if (!key) throw new Error("Use letters or numbers in the category name.");

    const { data: existing } = await supabase.from("request_types").select("key, name, is_active").eq("key", key).maybeSingle();
    if (existing) {
      if (!existing.is_active) await supabase.from("request_types").update({ is_active: true }).eq("key", key);
      refresh();
      return { ok: true, key: existing.key, name: existing.name };
    }
    const { error } = await supabase.from("request_types").insert({ key, name: clean, sort_order: 500 });
    check(error, error?.code === "42501" ? "Only board members can add categories." : undefined);
    refresh();
    return { ok: true, key, name: clean };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export async function updatePhoneAction(userId: string, phone: string): Promise<ActionResult<{ phone: string | null }>> {
  try {
    const { user } = await context();
    if (!user.isAdmin && user.id !== userId) throw new Error("Only admins can edit someone else's phone number.");
    const clean = text(phone, 40);
    if (clean && !/^[0-9+().\-\s x]{7,40}$/i.test(clean)) throw new Error("Enter a phone number like 503-555-0100.");
    const { error } = await createAdminClient().from("profiles").update({ phone: clean }).eq("id", userId);
    check(error);
    refresh();
    return { ok: true, phone: clean };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const storage = createAdminClient().storage;
  const { data } = await storage.getBucket(ATTACHMENT_BUCKET);
  if (!data) {
    const { error } = await storage.createBucket(ATTACHMENT_BUCKET, { public: false, fileSizeLimit: MAX_ATTACHMENT_BYTES });
    if (error && !/already exists/i.test(error.message)) throw new Error(error.message);
  }
  bucketReady = true;
}

/** Returns a one-time upload URL after checking the user can see the request. */
export async function createUploadTargetAction(
  requestId: string,
  fileName: string,
  fileSize: number,
): Promise<ActionResult<{ path: string; token: string }>> {
  try {
    const { supabase } = await context();
    if (fileSize > MAX_ATTACHMENT_BYTES) throw new Error(`${fileName} is larger than 50 MB.`);
    const { data: canView } = await supabase.rpc("can_view_request", { target: requestId });
    if (!canView) throw new Error("You can't add files to this request.");
    const { count } = await supabase
      .from("request_attachments")
      .select("id", { count: "exact", head: true })
      .eq("request_id", requestId);
    if ((count ?? 0) >= MAX_ATTACHMENTS) throw new Error(`Requests can have up to ${MAX_ATTACHMENTS} files.`);

    await ensureBucket();
    const safeName = fileName.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
    const path = `${requestId}/${randomUUID()}-${safeName}`;
    const { data, error } = await createAdminClient().storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path);
    check(error);
    return { ok: true, path, token: data!.token };
  } catch (error) {
    return fail(error);
  }
}

export async function registerAttachmentAction(input: {
  requestId: string;
  path: string;
  fileName: string;
  fileSize: number;
  contentType: string | null;
}): Promise<ActionResult> {
  try {
    const { user, supabase } = await context();
    if (!input.path.startsWith(`${input.requestId}/`)) throw new Error("Upload path doesn't match the request.");
    const { error } = await supabase.from("request_attachments").insert({
      request_id: input.requestId,
      file_name: input.fileName.slice(0, 255),
      file_size: input.fileSize,
      content_type: input.contentType,
      storage_path: input.path,
      uploaded_by: user.id,
    });
    check(error);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** One email per upload batch, sent after all files are in. */
export async function notifyAttachmentsAction(requestId: string, fileNames: string[]): Promise<ActionResult> {
  try {
    const { user } = await context();
    if (fileNames.length) {
      notify({ kind: "attachments", requestId, actorId: user.id, fileNames: fileNames.slice(0, 10) }, await publicOrigin());
    }
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteAttachmentAction(attachmentId: string): Promise<ActionResult> {
  try {
    const { supabase } = await context();
    const { data, error } = await supabase.from("request_attachments").delete().eq("id", attachmentId).select("storage_path");
    check(error);
    if (!data?.length) throw new Error("Only this board's team can delete files.");
    await createAdminClient().storage.from(ATTACHMENT_BUCKET).remove(data.map((row) => row.storage_path));
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
