import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requestCode } from "./constants";

const DAY_MS = 86_400_000;

export type Completion = {
  id: string;
  code: string;
  title: string;
  createdAt: string;
  completedAt: string;
  /** Working days from submission to completion, excluding time On Hold. */
  activeDays: number | null;
  onHoldDays: number | null;
  onTime: boolean | null;
  agent: { id: string; name: string } | null;
  requestType: string;
};

export type AnalyticsData = { totalItems: number; completions: Completion[] };

type StatusEvent = { created_at: string; author_id: string | null; metadata: { from?: string; to?: string } | null };

/** On Hold time never counts toward turnaround or on-time performance. */
export function calculateTiming(createdAt: string, endedAt: string, dueDate: string | null, events: StatusEvent[]) {
  const start = Date.parse(createdAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return { activeDays: null, onHoldDays: null, onTime: null };

  const changes = events
    .map((event) => ({ time: Date.parse(event.created_at), from: event.metadata?.from, to: event.metadata?.to }))
    .filter((change) => Number.isFinite(change.time) && typeof change.to === "string")
    .sort((a, b) => a.time - b.time);

  let holdStart: number | null = null;
  let heldMs = 0;
  for (const change of changes) {
    if (change.time > end && change.to !== "completed") continue;
    const at = Math.max(start, Math.min(end, change.time));
    if (change.to === "waiting") holdStart ??= at;
    else if (holdStart !== null) {
      heldMs += at - holdStart;
      holdStart = null;
    }
  }
  if (holdStart !== null) heldMs += end - holdStart;
  heldMs = Math.max(0, Math.min(end - start, heldMs));
  // A due date covers the whole day it falls on.
  const due = dueDate ? Date.parse(`${dueDate}T23:59:59`) : NaN;
  return {
    activeDays: (end - start - heldMs) / DAY_MS,
    onHoldDays: heldMs / DAY_MS,
    onTime: Number.isFinite(due) ? end - heldMs <= due : null,
  };
}

/**
 * Completed requests on a board with turnaround timing. Credit goes to whoever
 * moved the request to Completed; failing that, the sole assignee.
 */
export async function getBoardAnalytics(boardId: string): Promise<AnalyticsData> {
  const supabase = await createClient();
  const { data: requests, error } = await supabase
    .from("requests")
    .select("id, number, title, created_at, completed_at, due_date, status, request_type, request_types(name), request_assignees(user_id)")
    .eq("board_id", boardId);
  if (error) throw new Error(error.message);

  const completed = (requests ?? []).filter((r) => r.status === "completed" && r.completed_at);
  if (!completed.length) return { totalItems: requests?.length ?? 0, completions: [] };

  const ids = completed.map((r) => r.id);
  const events: (StatusEvent & { request_id: string })[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: eventsError } = await supabase
      .from("request_comments")
      .select("request_id, created_at, author_id, metadata")
      .in("request_id", ids.slice(i, i + 200))
      .eq("kind", "status_change");
    if (eventsError) throw new Error(eventsError.message);
    events.push(...((data ?? []) as typeof events));
  }

  const eventsByRequest = new Map<string, typeof events>();
  for (const event of events) {
    const list = eventsByRequest.get(event.request_id) ?? [];
    list.push(event);
    eventsByRequest.set(event.request_id, list);
  }

  const { data: profiles } = await supabase.from("profiles").select("id, email, full_name");
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));

  const completions = completed.map((request) => {
    const requestEvents = (eventsByRequest.get(request.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const closer = requestEvents.find((e) => e.metadata?.to === "completed")?.author_id ?? null;
    const assignees = (request.request_assignees as { user_id: string }[]) ?? [];
    const agentId = closer ?? (assignees.length === 1 ? assignees[0].user_id : null);
    const type = Array.isArray(request.request_types) ? request.request_types[0] : request.request_types;
    return {
      id: request.id,
      code: requestCode(request.number),
      title: request.title,
      createdAt: request.created_at,
      completedAt: request.completed_at!,
      ...calculateTiming(request.created_at, request.completed_at!, request.due_date, requestEvents),
      agent: agentId && nameById.has(agentId) ? { id: agentId, name: nameById.get(agentId)! } : null,
      requestType: (type as { name?: string } | null)?.name ?? "Other",
    };
  });

  completions.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return { totalItems: requests?.length ?? 0, completions };
}

// ---------------------------------------------------------------------------
// Admin analytics across every board
// ---------------------------------------------------------------------------

export type OverallCompletion = Completion & {
  boardId: string;
  boardName: string;
  boardSlug: string;
  typeKey: string | null;
  assigneeIds: string[];
};

export type OpenItem = {
  id: string;
  boardId: string;
  status: string;
  typeKey: string | null;
  dueDate: string | null;
  assigneeIds: string[];
};

export type OverallAnalytics = {
  boards: { id: string; name: string; slug: string }[];
  types: { key: string; name: string }[];
  people: { id: string; name: string }[];
  completions: OverallCompletion[];
  open: OpenItem[];
  ratings: { boardId: string; rating: number; respondedAt: string }[];
};

/** Everything the admin analytics page filters on the client. Admin only (callers must check). */
export async function getOverallAnalytics(): Promise<OverallAnalytics> {
  const supabase = await createClient();
  const [boardsRes, typesRes, profilesRes, requestsRes] = await Promise.all([
    supabase.from("boards").select("id, name, slug").order("name"),
    supabase.from("request_types").select("key, name").order("sort_order").order("name"),
    supabase.from("profiles").select("id, email, full_name"),
    supabase
      .from("requests")
      .select("id, board_id, number, title, status, request_type, due_date, created_at, completed_at, request_assignees(user_id)"),
  ]);
  for (const res of [boardsRes, typesRes, profilesRes, requestsRes]) if (res.error) throw new Error(res.error.message);

  const boards = boardsRes.data ?? [];
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const typeName = new Map((typesRes.data ?? []).map((t) => [t.key, t.name]));
  const nameById = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));
  const requests = requestsRes.data ?? [];
  const assigneesOf = (r: (typeof requests)[number]) => ((r.request_assignees as { user_id: string }[]) ?? []).map((a) => a.user_id);

  const completed = requests.filter((r) => r.status === "completed" && r.completed_at);
  const events: (StatusEvent & { request_id: string })[] = [];
  const ids = completed.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("request_comments")
      .select("request_id, created_at, author_id, metadata")
      .in("request_id", ids.slice(i, i + 200))
      .eq("kind", "status_change");
    if (error) throw new Error(error.message);
    events.push(...((data ?? []) as typeof events));
  }
  const eventsByRequest = new Map<string, typeof events>();
  for (const e of events) {
    const list = eventsByRequest.get(e.request_id) ?? [];
    list.push(e);
    eventsByRequest.set(e.request_id, list);
  }

  const completions: OverallCompletion[] = completed.map((r) => {
    const requestEvents = (eventsByRequest.get(r.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const closer = requestEvents.find((e) => e.metadata?.to === "completed")?.author_id ?? null;
    const assignees = assigneesOf(r);
    const agentId = closer ?? (assignees.length === 1 ? assignees[0] : null);
    const board = boardById.get(r.board_id);
    return {
      id: r.id,
      code: requestCode(r.number),
      title: r.title,
      createdAt: r.created_at,
      completedAt: r.completed_at!,
      ...calculateTiming(r.created_at, r.completed_at!, r.due_date, requestEvents),
      agent: agentId && nameById.has(agentId) ? { id: agentId, name: nameById.get(agentId)! } : null,
      requestType: (r.request_type && typeName.get(r.request_type)) || "Other",
      typeKey: r.request_type,
      assigneeIds: assignees,
      boardId: r.board_id,
      boardName: board?.name ?? "Board",
      boardSlug: board?.slug ?? "",
    };
  });
  completions.sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  const open: OpenItem[] = requests
    .filter((r) => r.status !== "completed" && r.status !== "cancelled")
    .map((r) => ({ id: r.id, boardId: r.board_id, status: r.status, typeKey: r.request_type, dueDate: r.due_date, assigneeIds: assigneesOf(r) }));

  // Survey answers live behind the service role; only rating, date, and board leave the server.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data: surveys } = await createAdminClient()
    .from("request_surveys")
    .select("rating, responded_at, requests!inner(board_id)")
    .not("rating", "is", null);
  const ratings = (surveys ?? []).flatMap((s) => {
    const req = (Array.isArray(s.requests) ? s.requests[0] : s.requests) as { board_id: string } | null;
    return s.responded_at && req ? [{ boardId: req.board_id, rating: s.rating as number, respondedAt: s.responded_at }] : [];
  });

  const usedPeople = new Set(completions.flatMap((c) => [c.agent?.id, ...c.assigneeIds]).concat(open.flatMap((o) => o.assigneeIds)));
  const people = [...usedPeople]
    .filter((id): id is string => Boolean(id) && nameById.has(id!))
    .map((id) => ({ id, name: nameById.get(id)! }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const usedTypes = new Set([...completions.map((c) => c.typeKey), ...open.map((o) => o.typeKey)]);
  const types = (typesRes.data ?? []).filter((t) => usedTypes.has(t.key));

  return { boards, types, people, completions, open, ratings };
}
