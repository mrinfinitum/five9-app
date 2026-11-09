import "server-only";
import { isClockRunning, priorityName, requestCode, statusName } from "@/lib/requests/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "./send";
import { button, escapeHtml, layout } from "./templates";

/**
 * Monday-morning reminder: everyone holding open tickets gets one email listing
 * the tickets assigned to them and the ones they requested that are still open,
 * with a short summary (open, overdue, due this week) at the top.
 */

/** Due dates are calendar days; "today" is worked out in the team's time zone. */
const TIME_ZONE = process.env.DIGEST_TIME_ZONE || "America/Chicago";

type Ticket = {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  boardName: string;
  boardSlug: string;
  requesterId: string | null;
  assigneeIds: string[];
};

type Person = { id: string; email: string; name: string; firstName: string | null };

export type Digest = {
  person: Person;
  assigned: Ticket[];
  requested: Ticket[];
  subject: string;
  html: string;
};

function isoDay(date: Date) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function addDays(day: string, days: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Tue, Oct 28", with the year added when it isn't this year ("Sat, Dec 13, 2025"). */
function formatDay(day: string, today?: string) {
  const otherYear = today && day.slice(0, 4) !== today.slice(0, 4);
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(otherYear ? { year: "numeric" } : {}),
  });
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function isOverdue(ticket: Ticket, today: string) {
  return Boolean(ticket.dueDate && ticket.dueDate < today && isClockRunning(ticket.status));
}

/** Overdue first, then soonest due, then no due date; ties by priority. */
function sortTickets(tickets: Ticket[], today: string) {
  return [...tickets].sort((a, b) => {
    const overdue = Number(isOverdue(b, today)) - Number(isOverdue(a, today));
    if (overdue) return overdue;
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  });
}

function dueCell(ticket: Ticket, today: string) {
  if (!ticket.dueDate) return `<span style="color:#999">No due date</span>`;
  if (isOverdue(ticket, today)) return `<strong style="color:#c00">Overdue · ${escapeHtml(formatDay(ticket.dueDate, today))}</strong>`;
  if (ticket.dueDate === today) return `<strong style="color:#c00">Due today</strong>`;
  return escapeHtml(formatDay(ticket.dueDate, today));
}

function ticketTable(tickets: Ticket[], today: string, origin: string) {
  const rows = tickets
    .map((t) => {
      const link = `${origin}/b/${encodeURIComponent(t.boardSlug)}?request=${encodeURIComponent(t.code)}`;
      const priority = t.priority === "high" || t.priority === "urgent" ? `<strong style="color:#c00">${escapeHtml(priorityName(t.priority))}</strong>` : escapeHtml(priorityName(t.priority));
      return `<tr>
<td style="padding:10px 8px;border-top:1px solid #eee;vertical-align:top">
  <a href="${escapeHtml(link)}" style="color:#111;font-weight:700;text-decoration:none">${escapeHtml(t.title)}</a>
  <div style="margin-top:2px;color:#888;font-size:12px">${escapeHtml(t.code)} · ${escapeHtml(t.boardName)}</div>
</td>
<td style="padding:10px 8px;border-top:1px solid #eee;vertical-align:top;font-size:13px;white-space:nowrap">${escapeHtml(statusName(t.status))}<div style="color:#888;font-size:12px">${priority}</div></td>
<td style="padding:10px 8px;border-top:1px solid #eee;vertical-align:top;font-size:13px;white-space:nowrap;text-align:right">${dueCell(t, today)}</td>
</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">${rows}</table>`;
}

function stat(value: number, label: string, alert = false) {
  return `<td style="padding:12px 8px;text-align:center;border:1px solid #eee;border-radius:8px;background:${alert && value ? "#fff5f5" : "#fafafa"}">
<div style="font-size:24px;font-weight:900;color:${alert && value ? "#c00" : "#111"}">${value}</div>
<div style="font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.05em">${label}</div></td>`;
}

function render(person: Person, assigned: Ticket[], requested: Ticket[], today: string, origin: string) {
  const all = [...assigned, ...requested];
  const weekEnd = addDays(today, 7);
  const overdue = all.filter((t) => isOverdue(t, today)).length;
  const dueThisWeek = all.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate < weekEnd && isClockRunning(t.status)).length;
  const notStarted = assigned.filter((t) => t.status === "new").length;

  const summary = `<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:16px 0 8px"><tr>
${stat(all.length, "Open")}${stat(overdue, "Overdue", true)}${stat(dueThisWeek, "Due this week")}${stat(notStarted, "Not started")}
</tr></table>`;

  const sections = [
    assigned.length
      ? `<h2 style="margin:24px 0 4px;font-size:16px">Assigned to you (${assigned.length})</h2>${ticketTable(assigned, today, origin)}`
      : "",
    requested.length
      ? `<h2 style="margin:24px 0 4px;font-size:16px">Your open requests (${requested.length})</h2><p style="margin:0 0 4px;color:#777;font-size:13px">Requests you submitted that the team is still working on.</p>${ticketTable(requested, today, origin)}`
      : "",
  ].join("");

  const html = layout(
    `<p>${person.firstName ? `Good morning ${escapeHtml(person.firstName)},` : "Good morning,"}</p>
<p>Here's where your open tickets stand for the week of ${escapeHtml(formatDay(today))}.</p>
${summary}${sections}${button(`${origin}/boards`, "Open your boards")}`,
    origin,
  );

  const parts = [`${all.length} open`];
  if (overdue) parts.push(`${overdue} overdue`);
  if (dueThisWeek) parts.push(`${dueThisWeek} due this week`);
  return { html, subject: `Your open tickets this week — ${parts.join(", ")}` };
}

/** Builds one digest per active person who is assigned to, or requested, an open ticket. */
export async function buildWeeklyDigests(origin: string, now = new Date()): Promise<Digest[]> {
  const admin = createAdminClient();
  const today = isoDay(now);

  const { data: rows, error } = await admin
    .from("requests")
    .select("id, number, title, status, priority, due_date, requester_id, boards(name, slug), request_assignees(user_id)")
    .is("archived_at", null)
    .not("status", "in", "(completed,cancelled)");
  if (error) throw new Error(error.message);

  const tickets: Ticket[] = (rows ?? []).map((r) => {
    const board = (Array.isArray(r.boards) ? r.boards[0] : r.boards) as { name: string; slug: string } | null;
    return {
      id: r.id as string,
      code: requestCode(r.number as number),
      title: r.title as string,
      status: r.status as string,
      priority: r.priority as string,
      dueDate: (r.due_date as string | null) ?? null,
      boardName: board?.name ?? "",
      boardSlug: board?.slug ?? "",
      requesterId: (r.requester_id as string | null) ?? null,
      assigneeIds: ((r.request_assignees as { user_id: string }[]) ?? []).map((a) => a.user_id),
    };
  });

  const ids = [...new Set(tickets.flatMap((t) => [...t.assigneeIds, ...(t.requesterId ? [t.requesterId] : [])]))];
  if (!ids.length) return [];
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, email, full_name, is_active")
    .in("id", ids)
    .eq("is_active", true);
  if (profileError) throw new Error(profileError.message);

  const digests: Digest[] = [];
  for (const p of profiles ?? []) {
    const name = (p.full_name as string | null)?.trim() || String(p.email).split("@")[0];
    const person: Person = { id: p.id, email: p.email, name, firstName: (p.full_name as string | null)?.trim().split(/\s+/)[0] || null };
    const assigned = sortTickets(tickets.filter((t) => t.assigneeIds.includes(p.id)), today);
    // Requests they're also assigned to are already listed above.
    const requested = sortTickets(tickets.filter((t) => t.requesterId === p.id && !t.assigneeIds.includes(p.id)), today);
    if (!assigned.length && !requested.length) continue;
    digests.push({ person, assigned, requested, ...render(person, assigned, requested, today, origin) });
  }
  return digests.sort((a, b) => a.person.name.localeCompare(b.person.name));
}

/** Sends every digest, one at a time to stay inside the email provider's rate limit. */
export async function sendWeeklyDigests(digests: Digest[]) {
  const results: { email: string; ok: boolean; error?: string }[] = [];
  for (const digest of digests) {
    try {
      await sendEmail({ to: [digest.person.email], subject: digest.subject, html: digest.html });
      results.push({ email: digest.person.email, ok: true });
    } catch (error) {
      results.push({ email: digest.person.email, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return results;
}
