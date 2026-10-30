import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requestCode } from "./constants";
import type { Board, BoardAccess, Person, RequestItem, RequestType } from "./types";

type Row = Record<string, unknown>;

export class MissingSchemaError extends Error {}

function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205") throw new MissingSchemaError(error.message);
  throw new Error(error.message);
}

const REQUEST_SELECT = `id, board_id, number, title, description, status, priority, request_type, due_date, requester_id,
  created_by, sort_order, completed_at, archived_at, created_at, updated_at,
  request_assignees(user_id),
  request_comments(id, body, author_id, is_internal, kind, created_at),
  request_attachments(id, file_name, file_size, uploaded_by, created_at)`;

function mapRequest(row: Row): RequestItem {
  return {
    id: row.id as string,
    boardId: row.board_id as string,
    number: row.number as number,
    code: requestCode(row.number as number),
    title: row.title as string,
    description: (row.description as string) ?? null,
    status: row.status as RequestItem["status"],
    priority: row.priority as RequestItem["priority"],
    requestType: (row.request_type as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
    requesterId: (row.requester_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    completedAt: (row.completed_at as string) ?? null,
    archivedAt: (row.archived_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    assigneeIds: ((row.request_assignees as Row[]) ?? []).map((a) => a.user_id as string),
    comments: ((row.request_comments as Row[]) ?? [])
      .map((c) => ({
        id: c.id as string,
        body: c.body as string,
        authorId: (c.author_id as string) ?? null,
        isInternal: Boolean(c.is_internal),
        kind: (c.kind as "comment" | "status_change") ?? "comment",
        createdAt: c.created_at as string,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    attachments: ((row.request_attachments as Row[]) ?? [])
      .map((a) => ({
        id: a.id as string,
        fileName: a.file_name as string,
        fileSize: a.file_size === null || a.file_size === undefined ? null : Number(a.file_size),
        uploadedBy: (a.uploaded_by as string) ?? null,
        createdAt: a.created_at as string,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

/** Requests on a board visible to the signed-in user (RLS: the team sees all, requesters see their own). */
export async function listRequests(boardId: string, options: { requesterId?: string } = {}): Promise<RequestItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("requests")
    .select(REQUEST_SELECT)
    .eq("board_id", boardId)
    .order("created_at", { ascending: false });
  if (options.requesterId) query = query.eq("requester_id", options.requesterId);
  const { data, error } = await query;
  check(error);
  return (data ?? []).map(mapRequest);
}

export async function listPeople(): Promise<Person[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, role, is_active")
    .order("full_name", { ascending: true, nullsFirst: false });
  check(error);
  return (data ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    name: p.full_name || p.email.split("@")[0],
    phone: p.phone ?? null,
    role: p.role === "admin" ? "admin" : "member",
    isActive: p.is_active,
  }));
}

export async function listRequestTypes(): Promise<RequestType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("request_types")
    .select("key, name")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  check(error);
  return data ?? [];
}

const BOARD_SELECT = "id, name, slug, description";

/** Boards the signed-in user can open, with their access level on each. */
export async function listMyBoards(userId: string, isAdmin: boolean): Promise<(Board & { access: BoardAccess })[]> {
  const supabase = await createClient();
  const [{ data: boards, error }, { data: memberships, error: membershipError }] = await Promise.all([
    supabase.from("boards").select(BOARD_SELECT).order("name"),
    supabase.from("board_members").select("board_id, access").eq("user_id", userId),
  ]);
  check(error);
  check(membershipError);
  const accessByBoard = new Map((memberships ?? []).map((m) => [m.board_id, m.access as BoardAccess]));
  return (boards ?? []).map((board) => ({
    ...board,
    access: isAdmin ? "team" : (accessByBoard.get(board.id) ?? "requester"),
  }));
}

/** A board by its URL slug plus the signed-in user's access, or null when they can't see it. */
export async function getBoardContext(slug: string): Promise<{ board: Board; access: BoardAccess } | null> {
  const supabase = await createClient();
  const { data: board, error } = await supabase.from("boards").select(BOARD_SELECT).eq("slug", slug).maybeSingle();
  check(error);
  if (!board) return null;
  const { data: access, error: accessError } = await supabase.rpc("board_access", { target_board: board.id });
  check(accessError);
  if (access !== "team" && access !== "requester") return null;
  return { board, access };
}

/** People who can work a board: admins plus the board's team members. */
export async function listBoardTeam(boardId: string, people: Person[]): Promise<Person[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("board_members").select("user_id").eq("board_id", boardId).eq("access", "team");
  check(error);
  const teamIds = new Set((data ?? []).map((m) => m.user_id));
  return people.filter((person) => person.isActive && (person.role === "admin" || teamIds.has(person.id)));
}

/** People who can submit requests on a board (anyone with access), for "request on behalf of". */
export async function listBoardRequesters(boardId: string, people: Person[]): Promise<Person[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("board_members").select("user_id").eq("board_id", boardId);
  check(error);
  const memberIds = new Set((data ?? []).map((m) => m.user_id));
  return people.filter((person) => person.isActive && (person.role === "admin" || memberIds.has(person.id)));
}
