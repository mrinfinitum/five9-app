import "server-only";
import { listWebSites, type WebSite } from "@/lib/google/access";
import { change, formatDay, formatMetric } from "@/lib/google/format";
import type { Row } from "@/lib/google/reports";
import { averageLabel, weeklyReport, type InsightTone, type WeeklyReport } from "@/lib/google/weekly";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "./send";
import { button, escapeHtml, layout } from "./templates";

/**
 * Monday web report: one email per client board with a GA4 property, built
 * from the same weekly report as /web/weekly. Email clients strip SVG, so the
 * trend is drawn with table cells.
 */

export type WebWeeklyEmail = { site: WebSite; to: string[]; subject: string; html: string; report: WeeklyReport };

/**
 * Who gets the reports: WEB_WEEKLY_EMAILS (comma-separated) when set, else
 * everyone on the web analytics allow-list.
 */
export async function webWeeklyRecipients() {
  const configured = (process.env.WEB_WEEKLY_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length) return configured;
  const admin = createAdminClient();
  const { data: viewers, error } = await admin.from("web_analytics_viewers").select("user_id");
  if (error) throw new Error(error.message);
  const ids = (viewers ?? []).map((v) => v.user_id);
  if (!ids.length) return [];
  const { data: people, error: peopleError } = await admin.from("profiles").select("email, is_active").in("id", ids);
  if (peopleError) throw new Error(peopleError.message);
  return (people ?? []).filter((p) => p.is_active !== false && p.email).map((p) => p.email.toLowerCase());
}

export async function buildWebWeeklyEmails(origin: string, only?: { slug?: string; week?: string }): Promise<WebWeeklyEmail[]> {
  const sites = (await listWebSites()).filter((s) => s.ga4PropertyId && (!only?.slug || s.slug === only.slug));
  const to = await webWeeklyRecipients();
  const emails: WebWeeklyEmail[] = [];
  for (const site of sites) {
    const report = await weeklyReport(site.ga4PropertyId!, only?.week);
    const range = `${formatDay(report.week.start)}–${formatDay(report.week.end)}`;
    emails.push({ site, to, report, subject: `${site.name} web report · ${range}`, html: renderEmail(site, report, origin) });
  }
  return emails;
}

export async function sendWebWeeklyEmails(emails: WebWeeklyEmail[]) {
  const results: { board: string; ok: boolean; error?: string }[] = [];
  for (const email of emails) {
    try {
      await sendEmail({ to: email.to, subject: email.subject, html: email.html });
      results.push({ board: email.site.slug, ok: true });
    } catch (error) {
      results.push({ board: email.site.slug, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

// ---------- rendering ----------

const RED = "#e10600";
const GREEN = "#15803d";
const MUTED = "#777";
const LINE = "#e5e5e5";

function delta(current: number, base: number | null) {
  if (base === null) return `<span style="color:${MUTED}">–</span>`;
  const d = change(current, base);
  if (d === null) return `<span style="color:${MUTED}">new</span>`;
  const rounded = Math.round(d * 100);
  if (!rounded) return `<span style="color:${MUTED}">0%</span>`;
  return `<span style="color:${rounded > 0 ? GREEN : RED};font-weight:700">${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%</span>`;
}

const TONE: Record<InsightTone, { color: string; mark: string }> = {
  bad: { color: RED, mark: "●" },
  watch: { color: "#d97706", mark: "●" },
  good: { color: GREEN, mark: "●" },
  info: { color: "#0284c7", mark: "●" },
};

function renderEmail(site: WebSite, r: WeeklyReport, origin: string) {
  const label = averageLabel(r.weeksInAverage);
  const range = `${formatDay(r.week.start)} – ${formatDay(r.week.end, true)}`;
  const link = `${origin}/web/weekly?client=${encodeURIComponent(site.slug)}&week=${r.week.start}`;

  // Scorecards, two per row.
  const cards = r.scorecards.map(
    (c) => `<td width="50%" valign="top" style="padding:6px">
<div style="border:1px solid ${LINE};border-radius:8px;padding:10px 12px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${MUTED}">${escapeHtml(c.label)}</div>
<div style="font-size:24px;font-weight:900;margin:2px 0">${formatMetric(c.current, c.format, true)}</div>
<div style="font-size:12px;color:${MUTED}">Last week ${formatMetric(c.previous, c.format, true)} ${delta(c.current, c.previous)}</div>
<div style="font-size:12px;color:${MUTED}">${escapeHtml(label)} ${c.average === null ? "–" : formatMetric(c.average, c.format, true)} ${delta(c.current, c.average)}</div>
</div></td>`,
  );
  const cardRows = [];
  for (let i = 0; i < cards.length; i += 2) cardRows.push(`<tr>${cards[i]}${cards[i + 1] ?? '<td width="50%"></td>'}</tr>`);

  const insights = r.insights.length
    ? r.insights
        .map(
          (i) =>
            `<tr><td valign="top" style="padding:4px 8px 4px 0;color:${TONE[i.tone].color};font-size:12px">${TONE[i.tone].mark}</td><td style="padding:4px 0;font-size:14px"><strong>${escapeHtml(i.title)}</strong> ${escapeHtml(i.body)}</td></tr>`,
        )
        .join("")
    : `<tr><td style="font-size:14px;color:${MUTED}">Nothing unusual this week: traffic, engagement and channels are all close to normal.</td></tr>`;

  // Trend as table bars (no SVG in email).
  const average = r.scorecards[0].average;
  const max = Math.max(1, ...r.weeks.map((w) => w.sessions), average ?? 0);
  const barHeight = 80;
  const bars = r.weeks
    .map((w, i) => {
      const h = Math.max(w.sessions ? 2 : 0, Math.round((w.sessions / max) * barHeight));
      const color = i === r.weeks.length - 1 ? RED : "#c8c8c8";
      return `<td valign="bottom" style="padding:0 1px;height:${barHeight}px" title="${escapeHtml(formatDay(w.start))}: ${w.sessions}">${
        h ? `<div style="height:${h}px;background:${color};border-radius:2px 2px 0 0;font-size:0;line-height:0">&nbsp;</div>` : ""
      }</td>`;
    })
    .join("");
  const trend = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${bars}</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:11px;color:${MUTED};margin-top:4px"><tr>
<td>${formatDay(r.weeks[0].start)}</td><td align="right">${formatDay(r.week.start)}</td></tr></table>
<p style="font-size:12px;color:${MUTED};margin:6px 0 0">Red is this week (${formatMetric(r.weeks.at(-1)!.sessions, "number")}).${
    average !== null ? ` Usual week: ${formatMetric(Math.round(average), "number")} sessions.` : ""
  }</p>`;

  const th = (text: string, align = "right") =>
    `<th align="${align}" style="padding:6px 4px;font-size:11px;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${LINE}">${text}</th>`;
  const td = (html: string, align = "right") => `<td align="${align}" style="padding:6px 4px;font-size:13px;border-bottom:1px solid ${LINE}">${html}</td>`;
  const channels = r.channels
    .filter((c) => c.current || (c.average ?? 0) >= 1)
    .map(
      (c) =>
        `<tr>${td(escapeHtml(c.name), "left")}${td(`<strong>${formatMetric(c.current, "number")}</strong>`)}${td(delta(c.current, c.previous))}${td(
          c.average === null ? "–" : formatMetric(Math.round(c.average), "number"),
        )}${td(delta(c.current, c.average === null ? null : Math.round(c.average)))}</tr>`,
    )
    .join("");

  const list = (title: string, unit: string, rows: Row[]) =>
    rows.length
      ? `<h3 style="font-size:15px;margin:22px 0 6px">${title}</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${th("", "left")}${th(unit)}</tr>${rows
          .slice(0, 8)
          .map((row) => `<tr>${td(escapeHtml(row.label), "left")}${td(formatMetric(row.value, "number"))}</tr>`)
          .join("")}</table>`
      : "";

  const content = `
<p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${RED};font-weight:700">Weekly web report</p>
<h1 style="margin:4px 0 2px;font-size:22px">${escapeHtml(site.name)}</h1>
<p style="margin:0 0 14px;color:${MUTED};font-size:13px">${range} · vs the week before${
    r.averageFrom ? ` and the ${r.weeksInAverage}-week average since ${formatDay(r.averageFrom, true)}` : ""
  } · Google Analytics</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px">${cardRows.join("")}</table>
<h3 style="font-size:15px;margin:22px 0 6px">What stood out</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${insights}</table>
<h3 style="font-size:15px;margin:22px 0 8px">Sessions per week</h3>
${trend}
${
  channels
    ? `<h3 style="font-size:15px;margin:22px 0 6px">Traffic by channel</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${th("Channel", "left")}${th("Sessions")}${th("vs last wk")}${th(escapeHtml(label))}${th("vs avg")}</tr>${channels}</table>`
    : ""
}
${list("Top pages", "Views", r.pages)}
${list("Landing pages", "Sessions", r.landingPages)}
${list("Countries", "Users", r.countries)}
${button(link, "Open the full report")}
${r.isStore ? `<p style="font-size:12px;color:${MUTED}">Purchases and revenue are what Google Analytics recorded; the store's own sales report is the true number.</p>` : ""}`;
  return layout(content, origin);
}
