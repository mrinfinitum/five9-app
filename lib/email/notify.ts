import "server-only";
import { after } from "next/server";
import { boardLogoUrl, requestCode, statusName } from "@/lib/requests/constants";
import { SATISFACTION_FACES, createSurvey } from "@/lib/requests/survey";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, teamNotificationEmails } from "./send";
import { button, escapeHtml, layout as baseLayout, quote } from "./templates";

export type RequestEvent =
  | { kind: "created"; requestId: string; actorId: string }
  | { kind: "comment"; requestId: string; actorId: string; body: string }
  | { kind: "completed"; requestId: string; actorId: string }
  | { kind: "attachments"; requestId: string; actorId: string; fileNames: string[] }
  | { kind: "assigned"; requestId: string; actorId: string; assigneeId: string };

type Profile = { id: string; email: string; full_name: string | null; role: string; is_active: boolean };

function nameOf(profile: Profile | undefined | null) {
  return profile?.full_name?.trim() || profile?.email.split("@")[0] || "Someone";
}

function firstName(profile: Profile | undefined | null) {
  return profile?.full_name?.trim().split(/\s+/)[0] ?? null;
}

function greeting(profile: Profile | undefined | null) {
  const first = firstName(profile);
  return `<p>${first ? `Hi ${escapeHtml(first)},` : "Hi,"}</p>`;
}


/**
 * Schedules a notification to send after the response is returned, so a slow
 * mail server never holds up the person clicking the button. `origin` is the
 * site URL used for links in the email.
 */
export function notify(event: RequestEvent, origin: string) {
  try {
    after(async () => {
      try {
        await deliver(event, origin);
      } catch (error) {
        console.error("[email] Notification failed", event.kind, error instanceof Error ? error.message : error);
      }
    });
  } catch (error) {
    console.error("[email] Could not schedule notification", error instanceof Error ? error.message : error);
  }
}

async function deliver(event: RequestEvent, origin: string) {
  let layout = (content: string) => baseLayout(content, origin);
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("requests")
    .select("id, board_id, number, title, status, requester_id, description, boards(slug, name, logo_path, logo_light_path)")
    .eq("id", event.requestId)
    .maybeSingle();
  if (!request) return;

  const ids = [request.requester_id, event.actorId, event.kind === "assigned" ? event.assigneeId : null].filter(
    (id): id is string => Boolean(id),
  );
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .in("id", [...new Set(ids)]);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
  const actor = byId.get(event.actorId);
  const { data: actorMembership } = await admin
    .from("board_members")
    .select("access")
    .eq("board_id", request.board_id)
    .eq("user_id", event.actorId)
    .maybeSingle();
  // The board team (admins + team members) vs. the person who asked.
  const actorIsTeam = actor?.role === "admin" || actorMembership?.access === "team";
  const board = (Array.isArray(request.boards) ? request.boards[0] : request.boards) as {
    slug: string;
    name: string;
    logo_path: string | null;
    logo_light_path: string | null;
  } | null;
  // Emails have a white body: use the light-mode logo, or the dark-mode one on a black tile.
  const lightLogo = boardLogoUrl(board?.logo_light_path);
  const logoUrl = lightLogo ?? boardLogoUrl(board?.logo_path);
  if (logoUrl) {
    const tile = lightLogo ? "transparent" : "#0a0a0a";
    const banner = `<div style="margin:0 0 18px"><span style="display:inline-block;padding:8px 12px;border-radius:8px;background:${tile}"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(board?.name ?? "")}" height="40" style="display:block;height:40px;width:auto;border:0" /></span></div>`;
    const plain = layout;
    layout = (content: string) => plain(banner + content);
  }
  const boardPath = `/b/${encodeURIComponent(board?.slug ?? "")}`;
  const requester = request.requester_id ? byId.get(request.requester_id) : undefined;
  const actorEmail = actor?.email.toLowerCase() ?? null;

  const code = requestCode(request.number);
  const label = `<strong>${escapeHtml(code)}</strong> — ${escapeHtml(request.title)}`;
  const shortTitle = request.title.slice(0, 120).replace(/[\r\n]/g, " ");
  // Same URL for both: the board page shows the team view or the requester's view.
  const requesterLink = `${origin}${boardPath}?request=${encodeURIComponent(code)}`;
  const boardLink = requesterLink;
  const boardName = board?.name ? ` on ${escapeHtml(board.name)}` : "";
  const team = teamNotificationEmails();
  const exceptActor = (emails: string[]) => emails.filter((email) => email !== actorEmail);
  const requesterEmail = requester?.is_active ? [requester.email] : [];

  const sends: Promise<void>[] = [];

  if (event.kind === "created") {
    // Team: a new request needs triage.
    sends.push(
      sendEmail({
        to: exceptActor(team),
        subject: `New request ${code}: ${shortTitle}`,
        replyTo: requester?.email,
        html: layout(
          `<p>${escapeHtml(nameOf(requester))} submitted a new request${boardName}: ${label}</p>` +
            (request.description ? quote(request.description.slice(0, 2000)) : "") +
            button(boardLink, "Open on the board"),
        ),
      }),
    );
    // Requester: confirmation (always sent — it's a receipt).
    const onBehalf = requester && actor && requester.id !== actor.id;
    sends.push(
      sendEmail({
        to: requesterEmail,
        subject: `Request received — ${code}: ${shortTitle}`,
        html: layout(
          greeting(requester) +
            `<p>${onBehalf ? `${escapeHtml(nameOf(actor))} created request ${label} for you.` : `Your request ${label} has been received.`}</p>` +
            `<p>You can follow its progress, add details, or attach files from your requests page.</p>` +
            button(requesterLink, "View your request"),
        ),
      }),
    );
  }

  if (event.kind === "comment") {
    if (actorIsTeam) {
      // Team replied: tell the requester (unless they wrote it).
      sends.push(
        sendEmail({
          to: requesterEmail.filter((email) => email.toLowerCase() !== actorEmail),
          subject: `New reply on ${code}: ${shortTitle}`,
          html: layout(
            greeting(requester) +
              `<p>${escapeHtml(nameOf(actor))} replied on ${label}:</p>` +
              quote(event.body) +
              button(requesterLink, "Reply or view the request"),
          ),
        }),
      );
    } else {
      // Requester replied: tell the team.
      sends.push(
        sendEmail({
          to: exceptActor(team),
          subject: `${nameOf(actor)} replied on ${code}: ${shortTitle}`,
          replyTo: actor?.email,
          html: layout(`<p>${escapeHtml(nameOf(actor))} replied on ${label}:</p>` + quote(event.body) + button(boardLink, "Open on the board")),
        }),
      );
    }
  }

  if (event.kind === "attachments" && event.fileNames.length) {
    const names = event.fileNames.slice(0, 10);
    const list = `<ul>${names.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>`;
    const noun = names.length === 1 ? "file" : "files";
    if (actorIsTeam) {
      sends.push(
        sendEmail({
          to: requesterEmail.filter((email) => email.toLowerCase() !== actorEmail),
          subject: `You have files to review on ${code}: ${shortTitle}`,
          html: layout(
            greeting(requester) +
              `<p>${escapeHtml(nameOf(actor))} added ${names.length} ${noun} for you to review on ${label}.</p>` +
              list +
              button(requesterLink, `Review the ${noun}`),
          ),
        }),
      );
    } else {
      sends.push(
        sendEmail({
          to: exceptActor(team),
          subject: `New ${noun} on ${code}: ${shortTitle}`,
          html: layout(`<p>${escapeHtml(nameOf(actor))} added ${names.length} ${noun} to ${label}.</p>` + list + button(boardLink, "Open on the board")),
        }),
      );
    }
  }

  if (event.kind === "completed" && requester?.is_active) {
    const token = await createSurvey(request.id, event.actorId);
    const faces = token
      ? SATISFACTION_FACES.map(
          (face) =>
            `<td style="padding:0 4px;text-align:center"><a href="${escapeHtml(`${origin}/survey/${token}?rating=${face.rating}`)}" style="display:inline-block;min-width:52px;padding:8px 6px;border:1px solid #f1c6c4;border-radius:12px;background:#fff5f5;font-size:30px;line-height:1;text-decoration:none">${face.emoji}</a><div style="margin-top:6px;color:#666;font-size:10px">${face.label}</div></td>`,
        ).join("")
      : "";
    sends.push(
      sendEmail({
        to: [requester.email],
        subject: `${code} is complete: ${shortTitle}`,
        html: layout(
          greeting(requester) +
            `<p>Your request ${label} is complete. ${escapeHtml(nameOf(actor))} marked it done.</p>` +
            button(requesterLink, "See the finished request") +
            (faces
              ? `<div style="margin:24px 0 8px;padding:18px;border:1px solid #f1c6c4;border-radius:16px;background:#fffafa"><p style="margin:0 0 12px;font-weight:700;text-align:center">How happy are you with the support you received?</p><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>${faces}</tr></table><p style="margin:12px 0 0;color:#888;font-size:11px;text-align:center">One click records your answer. Your response is anonymous.</p></div>`
              : ""),
        ),
      }),
    );
  }

  if (event.kind === "assigned") {
    const assignee = byId.get(event.assigneeId);
    if (assignee?.is_active && assignee.id !== event.actorId) {
      sends.push(
        sendEmail({
          to: [assignee.email],
          subject: `Assigned to you — ${code}: ${shortTitle}`,
          html: layout(
            greeting(assignee) +
              `<p>${actor ? `${escapeHtml(nameOf(actor))} assigned ${label} to you.` : `You have been assigned ${label}.`}</p>` +
              `<p>Status: ${escapeHtml(statusName(request.status))}. Open it to review the details, due date, and next steps.</p>` +
              button(boardLink, "Open the request"),
          ),
        }),
      );
    }
  }

  const results = await Promise.allSettled(sends);
  for (const result of results) {
    if (result.status === "rejected") console.error("[email] Send failed:", result.reason instanceof Error ? result.reason.message : result.reason);
  }
}
