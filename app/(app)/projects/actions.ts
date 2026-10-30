"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  EXPENSE_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  SUBTASK_STATUSES,
  isOneOf,
} from "@/lib/projects/constants";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function date(value: unknown) {
  return typeof value === "string" && DATE_RE.test(value) ? value : null;
}

function cents(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

async function authed() {
  const user = await getCurrentUser();
  if (!user) throw new Error("You are signed out. Please sign in again.");
  return { user, supabase: await createClient() };
}

async function run(fn: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const id = await fn();
    refresh();
    return { ok: true, id: id ?? undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type NewProjectInput = {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  projectType?: string;
  client?: string;
  startDate?: string;
  dueDate?: string;
  assigneeIds?: string[];
};

export async function createProjectAction(input: NewProjectInput): Promise<ActionResult> {
  return run(async () => {
    const { user, supabase } = await authed();
    const title = text(input.title, 200);
    if (!title) throw new Error("Give the project a title.");
    const status = isOneOf(PROJECT_STATUSES, input.status) ? input.status : "inbox";

    // New projects go to the top of their column.
    const { data: first } = await supabase
      .from("projects")
      .select("sort_order")
      .eq("status", status)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("projects")
      .insert({
        title,
        description: text(input.description, 20000),
        status,
        priority: isOneOf(PROJECT_PRIORITIES, input.priority) ? input.priority : "normal",
        project_type: isOneOf(PROJECT_TYPES, input.projectType) ? input.projectType : null,
        client: text(input.client, 200),
        start_date: date(input.startDate),
        due_date: date(input.dueDate),
        sort_order: (first?.sort_order ?? 1000) - 1000,
        created_by: user.id,
      })
      .select("id")
      .single();
    check(error);

    const assignees = [...new Set(input.assigneeIds ?? [])];
    if (assignees.length) {
      const { error: assignError } = await supabase
        .from("project_assignees")
        .insert(assignees.map((user_id) => ({ project_id: data!.id, user_id })));
      check(assignError);
    }
    return data!.id as string;
  });
}

export type ProjectPatch = Partial<{
  title: string;
  description: string;
  status: string;
  priority: string;
  projectType: string;
  client: string;
  startDate: string;
  dueDate: string;
  budgetCents: number;
  sortOrder: number;
}>;

export async function updateProjectAction(projectId: string, patch: ProjectPatch): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await authed();
    const update: Record<string, unknown> = {};
    if ("title" in patch) {
      const title = text(patch.title, 200);
      if (!title) throw new Error("Title can't be empty.");
      update.title = title;
    }
    if ("description" in patch) update.description = text(patch.description, 20000);
    if ("status" in patch) {
      if (!isOneOf(PROJECT_STATUSES, patch.status)) throw new Error("Unknown status.");
      update.status = patch.status;
    }
    if ("priority" in patch) {
      if (!isOneOf(PROJECT_PRIORITIES, patch.priority)) throw new Error("Unknown priority.");
      update.priority = patch.priority;
    }
    if ("projectType" in patch) update.project_type = isOneOf(PROJECT_TYPES, patch.projectType) ? patch.projectType : null;
    if ("client" in patch) update.client = text(patch.client, 200);
    if ("startDate" in patch) update.start_date = date(patch.startDate);
    if ("dueDate" in patch) update.due_date = date(patch.dueDate);
    if ("budgetCents" in patch) update.budget_cents = cents(patch.budgetCents);
    if ("sortOrder" in patch && Number.isFinite(patch.sortOrder)) update.sort_order = patch.sortOrder;
    if (!Object.keys(update).length) return;

    const { error } = await supabase.from("projects").update(update).eq("id", projectId);
    check(error);
  });
}

export async function setProjectArchivedAction(projectId: string, archived: boolean): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await authed();
    const { error } = await supabase
      .from("projects")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", projectId);
    check(error);
  });
}

export async function archiveCompletedProjectsAction(): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await authed();
    const { error } = await supabase
      .from("projects")
      .update({ archived_at: new Date().toISOString() })
      .eq("status", "completed")
      .is("archived_at", null);
    check(error);
  });
}

export async function deleteProjectAction(projectId: string): Promise<ActionResult> {
  return run(async () => {
    const { user, supabase } = await authed();
    if (!user.isAdmin) throw new Error("Only admins can delete projects.");
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    check(error);
  });
}

export async function toggleAssigneeAction(projectId: string, userId: string, assigned: boolean): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await authed();
    const { error } = assigned
      ? await supabase.from("project_assignees").upsert({ project_id: projectId, user_id: userId })
      : await supabase.from("project_assignees").delete().eq("project_id", projectId).eq("user_id", userId);
    check(error);
  });
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

export async function addSubtaskAction(projectId: string, title: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await authed();
    const clean = text(title, 240);
    if (!clean) throw new Error("Subtask needs a title.");
    const { data: last } = await supabase
      .from("project_subtasks")
      .select("sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase
      .from("project_subtasks")
      .insert({ project_id: projectId, title: clean, sort_order: (last?.sort_order ?? 0) + 1 });
    check(error);
  });
}

export async function updateSubtaskAction(
  subtaskId: string,
  patch: Partial<{ title: string; status: string; assigneeId: string | null; dueDate: string | null }>,
): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await authed();
    const update: Record<string, unknown> = {};
    if ("title" in patch) {
      const title = text(patch.title, 240);
      if (!title) throw new Error("Subtask needs a title.");
      update.title = title;
    }
    if ("status" in patch) {
      if (!isOneOf(SUBTASK_STATUSES, patch.status)) throw new Error("Unknown subtask status.");
      update.status = patch.status;
    }
    if ("assigneeId" in patch) update.assignee_id = patch.assigneeId || null;
    if ("dueDate" in patch) update.due_date = date(patch.dueDate);
    const { error } = await supabase.from("project_subtasks").update(update).eq("id", subtaskId);
    check(error);
  });
}

export async function deleteSubtaskAction(subtaskId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await authed();
    const { error } = await supabase.from("project_subtasks").delete().eq("id", subtaskId);
    check(error);
  });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addCommentAction(projectId: string, body: string): Promise<ActionResult> {
  return run(async () => {
    const { user, supabase } = await authed();
    const clean = text(body, 10000);
    if (!clean) throw new Error("Write something first.");
    const { error } = await supabase
      .from("project_comments")
      .insert({ project_id: projectId, body: clean, author_id: user.id });
    check(error);
  });
}

export async function deleteCommentAction(commentId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await authed();
    const { error } = await supabase.from("project_comments").delete().eq("id", commentId);
    check(error);
  });
}

// ---------------------------------------------------------------------------
// Budget & expenses
// ---------------------------------------------------------------------------

export async function addExpenseAction(
  projectId: string,
  input: { description: string; vendor?: string; status?: string; amountCents: number; expenseDate?: string },
): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await authed();
    const description = text(input.description, 200);
    if (!description) throw new Error("Describe the expense.");
    const { error } = await supabase.from("project_expenses").insert({
      project_id: projectId,
      description,
      vendor: text(input.vendor, 200),
      status: isOneOf(EXPENSE_STATUSES, input.status) ? input.status : "planned",
      amount_cents: cents(input.amountCents),
      expense_date: date(input.expenseDate),
    });
    check(error);
  });
}

export async function updateExpenseStatusAction(expenseId: string, status: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await authed();
    if (!isOneOf(EXPENSE_STATUSES, status)) throw new Error("Unknown expense status.");
    const { error } = await supabase.from("project_expenses").update({ status }).eq("id", expenseId);
    check(error);
  });
}

export async function deleteExpenseAction(expenseId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await authed();
    const { error } = await supabase.from("project_expenses").delete().eq("id", expenseId);
    check(error);
  });
}
