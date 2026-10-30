import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Person, Project } from "./types";

type Row = Record<string, unknown>;

export class MissingSchemaError extends Error {}

function isMissingTable(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));
}

export async function listProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      `id, number, title, description, status, priority, project_type, client, start_date, due_date,
       sort_order, budget_cents, completed_at, archived_at, created_by, created_at,
       project_assignees(user_id),
       project_subtasks(id, title, status, assignee_id, due_date, sort_order),
       project_comments(id, body, author_id, created_at),
       project_expenses(id, description, vendor, status, amount_cents, expense_date, created_at)`,
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (isMissingTable(error)) throw new MissingSchemaError("Database tables are missing");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: Row) => ({
    id: row.id as string,
    number: row.number as number,
    title: row.title as string,
    description: (row.description as string) ?? null,
    status: row.status as Project["status"],
    priority: row.priority as Project["priority"],
    projectType: (row.project_type as string) ?? null,
    client: (row.client as string) ?? null,
    startDate: (row.start_date as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    budgetCents: Number(row.budget_cents ?? 0),
    completedAt: (row.completed_at as string) ?? null,
    archivedAt: (row.archived_at as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    createdAt: row.created_at as string,
    assigneeIds: ((row.project_assignees as Row[]) ?? []).map((a) => a.user_id as string),
    subtasks: ((row.project_subtasks as Row[]) ?? [])
      .map((s) => ({
        id: s.id as string,
        title: s.title as string,
        status: s.status as Project["subtasks"][number]["status"],
        assigneeId: (s.assignee_id as string) ?? null,
        dueDate: (s.due_date as string) ?? null,
        sortOrder: Number(s.sort_order ?? 0),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    comments: ((row.project_comments as Row[]) ?? [])
      .map((c) => ({
        id: c.id as string,
        body: c.body as string,
        authorId: (c.author_id as string) ?? null,
        createdAt: c.created_at as string,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    expenses: ((row.project_expenses as Row[]) ?? [])
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((e) => ({
        id: e.id as string,
        description: e.description as string,
        vendor: (e.vendor as string) ?? null,
        status: e.status as Project["expenses"][number]["status"],
        amountCents: Number(e.amount_cents ?? 0),
        expenseDate: (e.expense_date as string) ?? null,
      })),
  }));
}

export async function listTeam(): Promise<Person[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("is_active", true)
    .order("full_name", { ascending: true, nullsFirst: false });
  if (isMissingTable(error)) throw new MissingSchemaError("Database tables are missing");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    name: p.full_name || p.email.split("@")[0],
  }));
}
