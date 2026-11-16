import "server-only";
import { cached, googleFetch } from "./client";
import { formatDay, formatMetric } from "./format";
import { propertyInfo, type MetricFormat, type Row } from "./reports";

/**
 * Weekly GA4 report: the last full Monday–Sunday week (in the property's time
 * zone) against the week before and against the average of the 26 weeks before
 * it. The average only counts weeks from the first one that has any data, so a
 * site that started tracking recently isn't dragged down by empty weeks.
 */

export const HISTORY_WEEKS = 26;

/** Short column label for the average, e.g. "26-wk avg" (fewer weeks for newer sites). */
export function averageLabel(weeks: number) {
  return `${weeks || HISTORY_WEEKS}-wk avg`;
}

export type WeekTotals = {
  start: string;
  sessions: number;
  users: number;
  engagedSessions: number;
  keyEvents: number;
  revenue: number;
  orders: number;
};

export type Scorecard = {
  key: string;
  label: string;
  format: MetricFormat;
  current: number;
  previous: number;
  /** Null when there are no earlier weeks with data. */
  average: number | null;
};

export type WeeklyChannel = {
  name: string;
  current: number;
  previous: number;
  average: number | null;
  /** Sessions per week, oldest first, the reported week last. */
  weekly: number[];
  engagementRate: number;
  averageDuration: number;
};

export type InsightTone = "bad" | "watch" | "good" | "info";
export type Insight = { tone: InsightTone; title: string; body: string };

export type WeeklyReport = {
  week: { start: string; end: string };
  previousWeek: { start: string; end: string };
  /** First week counted in the average, or null when there's no history. */
  averageFrom: string | null;
  weeksInAverage: number;
  /** The newest week that can be reported (the last full week). */
  latestWeek: string;
  currency: string;
  isStore: boolean;
  scorecards: Scorecard[];
  /** HISTORY_WEEKS + 1 weeks, oldest first; the reported week is last. */
  weeks: WeekTotals[];
  channels: WeeklyChannel[];
  pages: Row[];
  landingPages: Row[];
  countries: Row[];
  insights: Insight[];
};

// ---------- dates ----------

function today(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(day: string, days: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondayOf(day: string) {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

/** GA4's isoYearIsoWeek value for the week starting on this Monday, e.g. "202645". */
function isoWeekKey(monday: string) {
  const thursday = new Date(`${addDays(monday, 3)}T12:00:00Z`);
  const year = thursday.getUTCFullYear();
  const dayOfYear = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1, 12)) / 86_400_000);
  return `${year}${String(Math.floor(dayOfYear / 7) + 1).padStart(2, "0")}`;
}

/** The Monday of the last full week, or the requested week if it's an earlier Monday. */
function reportedWeek(timeZone: string, requested?: string) {
  const latest = addDays(mondayOf(today(timeZone)), -7);
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && !Number.isNaN(Date.parse(requested))) {
    const monday = mondayOf(requested);
    if (monday < latest) return { start: monday, latest };
  }
  return { start: latest, latest };
}

// ---------- GA ----------

type Ga4Response = { rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[] };

const WEEK_METRICS = ["sessions", "activeUsers", "engagedSessions", "keyEvents", "purchaseRevenue", "ecommercePurchases"] as const;
const CHANNEL_METRICS = ["sessions", "engagedSessions", "averageSessionDuration"] as const;

const REPORT_TTL = 30 * 60_000;

export function weeklyReport(propertyId: string, requestedWeek?: string): Promise<WeeklyReport> {
  if (!/^\d{1,20}$/.test(propertyId)) throw new Error("Invalid GA4 property ID.");
  return propertyInfo(propertyId).then((info) => {
    const { start, latest } = reportedWeek(info.timeZone, requestedWeek);
    return cached(`ga4:weekly:${propertyId}:${start}`, REPORT_TTL, () => build(propertyId, start, latest, info));
  });
}

async function build(propertyId: string, start: string, latestWeek: string, info: { timeZone: string; currency: string }): Promise<WeeklyReport> {
  const mondays = Array.from({ length: HISTORY_WEEKS + 1 }, (_, i) => addDays(start, (i - HISTORY_WEEKS) * 7));
  const end = addDays(start, 6);
  const history = [{ startDate: mondays[0], endDate: end }];
  const thisWeek = [{ startDate: start, endDate: end }];
  const ranked = (dimension: string, metrics: string[], limit = 10) => ({
    dateRanges: thisWeek,
    dimensions: [{ name: dimension }],
    metrics: metrics.map((name) => ({ name })),
    orderBys: [{ metric: { metricName: metrics[0] }, desc: true }],
    limit,
  });

  // One batch: GA allows 5 requests per batch and 10 metrics per request.
  const { reports } = await googleFetch<{ reports: Ga4Response[] }>(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`,
    {
      method: "POST",
      body: {
        requests: [
          { dateRanges: history, dimensions: [{ name: "isoYearIsoWeek" }], metrics: WEEK_METRICS.map((name) => ({ name })), limit: 100 },
          {
            dateRanges: history,
            dimensions: [{ name: "isoYearIsoWeek" }, { name: "sessionDefaultChannelGroup" }],
            metrics: CHANNEL_METRICS.map((name) => ({ name })),
            limit: 2000,
          },
          ranked("pagePath", ["screenPageViews"]),
          ranked("landingPage", ["sessions", "engagementRate"]),
          ranked("country", ["activeUsers"]),
        ],
      },
    },
  );
  const [weeksRes, channelsRes, pagesRes, landingRes, countriesRes] = reports;

  const index = new Map(mondays.map((m, i) => [isoWeekKey(m), i]));
  const num = (v: { value: string } | undefined) => Number(v?.value ?? 0);

  // Weekly totals, zero-filled.
  const weeks: WeekTotals[] = mondays.map((m) => ({ start: m, sessions: 0, users: 0, engagedSessions: 0, keyEvents: 0, revenue: 0, orders: 0 }));
  for (const row of weeksRes.rows ?? []) {
    const i = index.get(row.dimensionValues?.[0]?.value ?? "");
    if (i === undefined) continue;
    const v = row.metricValues ?? [];
    weeks[i] = { start: mondays[i], sessions: num(v[0]), users: num(v[1]), engagedSessions: num(v[2]), keyEvents: num(v[3]), revenue: num(v[4]), orders: num(v[5]) };
  }

  const current = weeks[HISTORY_WEEKS];
  const previous = weeks[HISTORY_WEEKS - 1];
  const firstData = weeks.findIndex((w) => w.sessions > 0);
  // The weeks before the reported one, from the first with data.
  const past = firstData >= 0 && firstData < HISTORY_WEEKS ? weeks.slice(firstData, HISTORY_WEEKS) : [];
  const mean = (pick: (w: WeekTotals) => number) => (past.length ? past.reduce((s, w) => s + pick(w), 0) / past.length : null);
  const rate = (list: WeekTotals[]) => {
    const sessions = list.reduce((s, w) => s + w.sessions, 0);
    return sessions ? list.reduce((s, w) => s + w.engagedSessions, 0) / sessions : 0;
  };

  const isStore = weeks.some((w) => w.orders > 0);
  const money: MetricFormat = `currency:${info.currency}`;
  const card = (key: string, label: string, format: MetricFormat, pick: (w: WeekTotals) => number): Scorecard => ({
    key,
    label,
    format,
    current: pick(current),
    previous: pick(previous),
    average: mean(pick),
  });
  const scorecards: Scorecard[] = [
    card("sessions", "Sessions", "number", (w) => w.sessions),
    card("users", "Users", "number", (w) => w.users),
    card("engagedSessions", "Engaged sessions", "number", (w) => w.engagedSessions),
    {
      key: "engagementRate",
      label: "Engagement rate",
      format: "percent",
      current: rate([current]),
      previous: rate([previous]),
      average: past.length ? rate(past) : null,
    },
    ...(isStore
      ? [card("orders", "Purchases", "number", (w) => w.orders), card("revenue", "Revenue", money, (w) => w.revenue)]
      : [card("keyEvents", "Key events", "number", (w) => w.keyEvents)]),
  ];

  // Channels by week.
  type Acc = { weekly: number[]; engaged: number[]; duration: number[] };
  const byChannel = new Map<string, Acc>();
  for (const row of channelsRes.rows ?? []) {
    const [week, name] = (row.dimensionValues ?? []).map((d) => d.value);
    const i = index.get(week);
    if (i === undefined) continue;
    const acc = byChannel.get(name) ?? { weekly: Array(HISTORY_WEEKS + 1).fill(0), engaged: Array(HISTORY_WEEKS + 1).fill(0), duration: Array(HISTORY_WEEKS + 1).fill(0) };
    const v = row.metricValues ?? [];
    acc.weekly[i] = num(v[0]);
    acc.engaged[i] = num(v[1]);
    acc.duration[i] = num(v[2]);
    byChannel.set(name, acc);
  }
  const pastFrom = past.length ? firstData : HISTORY_WEEKS;
  const channels: WeeklyChannel[] = [...byChannel]
    .map(([name, acc]) => {
      const pastValues = acc.weekly.slice(pastFrom, HISTORY_WEEKS);
      const sessions = acc.weekly[HISTORY_WEEKS];
      return {
        name: name || "(not set)",
        current: sessions,
        previous: acc.weekly[HISTORY_WEEKS - 1],
        average: pastValues.length ? pastValues.reduce((s, n) => s + n, 0) / pastValues.length : null,
        weekly: acc.weekly,
        engagementRate: sessions ? acc.engaged[HISTORY_WEEKS] / sessions : 0,
        averageDuration: acc.duration[HISTORY_WEEKS],
      };
    })
    .filter((c) => c.current || c.previous || c.average)
    .sort((a, b) => b.current - a.current || (b.average ?? 0) - (a.average ?? 0));

  const rows = (res: Ga4Response, cells?: (v: { value: string }[]) => Row["cells"]): Row[] =>
    (res.rows ?? []).map((r) => {
      const key = r.dimensionValues?.[0]?.value ?? "";
      return { key, label: key || "(not set)", value: num(r.metricValues?.[0]), cells: cells?.(r.metricValues ?? []) };
    });

  const report: Omit<WeeklyReport, "insights"> = {
    week: { start, end },
    previousWeek: { start: mondays[HISTORY_WEEKS - 1], end: addDays(start, -1) },
    averageFrom: past.length ? past[0].start : null,
    weeksInAverage: past.length,
    latestWeek,
    currency: info.currency,
    isStore,
    scorecards,
    weeks,
    channels,
    pages: rows(pagesRes),
    landingPages: rows(landingRes, (v) => [{ label: "Engaged", value: num(v[1]), format: "percent" }]),
    countries: rows(countriesRes),
  };
  return { ...report, insights: insights(report) };
}

// ---------- insights ----------

const pct = (value: number) => `${Math.round(Math.abs(value) * 100)}%`;
const rel = (now: number, then: number) => (then ? (now - then) / then : 0);
const n = (value: number) => formatMetric(value, "number");
const weekOf = (day: string) => `the week of ${formatDay(day)}`;

/** Earliest week from which every week up to the reported one passes the test. */
function streakStart(weeks: string[], test: (i: number) => boolean) {
  let i = weeks.length - 1;
  if (!test(i)) return null;
  while (i > 0 && test(i - 1)) i--;
  return i;
}

/**
 * Plain-English notes for the things worth a look: tracking that stopped,
 * engagement collapsing, bot-like surges, channels falling off or appearing.
 * Rule-based and conservative, so small sites don't get noise.
 */
export function insights(r: Omit<WeeklyReport, "insights">): Insight[] {
  const out: Insight[] = [];
  const last = HISTORY_WEEKS;
  const cur = r.weeks[last];
  const mondays = r.weeks.map((w) => w.start);
  const sessions = r.scorecards.find((s) => s.key === "sessions")!;
  const avgSessions = sessions.average;
  const average = `${r.weeksInAverage}-week average`;

  // Nothing recorded at all.
  if (!cur.sessions) {
    const lastData = r.weeks.findLastIndex((w) => w.sessions > 0);
    out.push(
      lastData >= 0
        ? {
            tone: "bad",
            title: "Google Analytics recorded no visits this week.",
            body: `The last week with data was ${weekOf(mondays[lastData])}. The tracking tag may have been removed or broken; check that it still loads on the site.`,
          }
        : { tone: "bad", title: "No visits recorded in the last 27 weeks.", body: "This property isn't receiving data. Check that the GA4 tag is installed on the site." },
    );
    return out;
  }

  // A gap last week makes week-on-week changes meaningless.
  if (!r.weeks[last - 1].sessions && avgSessions) {
    out.push({
      tone: "watch",
      title: "No visits were recorded last week.",
      body: "Tracking was probably off for part of the period, so compare this week with the average rather than with last week.",
    });
  }

  const rateOf = (i: number) => (r.weeks[i].sessions ? r.weeks[i].engagedSessions / r.weeks[i].sessions : 0);
  const engagement = r.scorecards.find((s) => s.key === "engagementRate")!;

  // Bot-like surges: a channel well above its usual level with short, unengaged visits.
  const surges = r.channels.filter(
    (c) => c.average !== null && c.average >= 5 && c.current >= 50 && c.current >= 1.5 * c.average && c.averageDuration < 45 && c.engagementRate < 0.3,
  );
  for (const c of surges) {
    const since = streakStart(mondays, (i) => c.weekly[i] >= 1.5 * (c.average ?? 0));
    out.push({
      tone: "bad",
      title: `${c.name} traffic looks automated.`,
      body: `${n(c.current)} sessions against a ${n(Math.round(c.average!))} average (+${pct(rel(c.current, c.average!))}), with about ${Math.round(c.averageDuration)} s per visit and only ${pct(c.engagementRate)} engaged. That pattern is typical of bots rather than people${since !== null && since < last ? `; it started ${weekOf(mondays[since])}` : ""}.`,
    });
  }

  // Engagement rate falling well below normal.
  if (engagement.average !== null && engagement.average - engagement.current >= 0.15) {
    const since = streakStart(mondays, (i) => i >= (r.weeksInAverage ? last - r.weeksInAverage : last) && rateOf(i) <= engagement.average! - 0.1);
    // Compare with the weeks before the slump, when there are enough of them.
    const before = since !== null ? r.weeks.slice(last - r.weeksInAverage, since).filter((w) => w.sessions) : [];
    const usual = before.length >= 4 ? before.reduce((s, w) => s + w.engagedSessions, 0) / before.reduce((s, w) => s + w.sessions, 0) : engagement.average;
    out.push({
      tone: "bad",
      title: `Only ${pct(engagement.current)} of sessions were engaged, against ${pct(usual)} normally.`,
      body: `Fewer visits are lasting 10 seconds or more, viewing two pages or converting${since !== null && since < last ? `. It has been low since ${weekOf(mondays[since])}` : ""}. Unless a known change explains it, check for bot traffic or a tracking problem.`,
    });
  }

  // Overall traffic vs normal (skipped when a surge already explains it).
  if (avgSessions && !surges.length) {
    const change = rel(cur.sessions, avgSessions);
    if (change <= -0.3) {
      out.push({
        tone: "watch",
        title: `Traffic is down ${pct(change)} on the ${average}.`,
        body: `${n(cur.sessions)} sessions this week against a usual ${n(Math.round(avgSessions))}.`,
      });
    } else if (change >= 0.3) {
      out.push({
        tone: "good",
        title: `Traffic is up ${pct(change)} on the ${average}.`,
        body: `${n(cur.sessions)} sessions this week against a usual ${n(Math.round(avgSessions))}${engagement.current >= 0.4 ? `, and ${pct(engagement.current)} of them were engaged` : ""}.`,
      });
    }
  }

  // Channels that fell well below their usual level.
  for (const c of r.channels) {
    if (c.average === null || c.average < 30 || c.current > (c.average >= 100 ? 0.75 : 0.6) * c.average) continue;
    const since = streakStart(mondays, (i) => c.weekly[i] <= 0.7 * c.average!);
    out.push({
      tone: "watch",
      title: `${c.name} is down ${pct(rel(c.current, c.average))} on its average.`,
      body: `${n(c.current)} sessions against a usual ${n(Math.round(c.average))}${c.previous ? ` (${n(c.previous)} last week)` : ""}${since !== null && since < last ? `. It has been below normal since ${weekOf(mondays[since])}` : ""}.`,
    });
  }

  // Real growth in a channel (engaged visits, not a bot surge).
  for (const c of r.channels) {
    if (c.average === null || c.average < 10 || c.current < 30 || c.current < 1.5 * c.average || surges.includes(c) || c.engagementRate < 0.4) continue;
    out.push({
      tone: "good",
      title: `${c.name} is up ${pct(rel(c.current, c.average))} on its average.`,
      body: `${n(c.current)} sessions against a usual ${n(Math.round(c.average))}, with ${pct(c.engagementRate)} engaged.`,
    });
  }

  // A channel that wasn't there before.
  for (const c of r.channels) {
    const before = c.weekly.slice(0, last).reduce((s, v) => s + v, 0);
    if (c.current < 10 || before > 2) continue;
    out.push({
      tone: "info",
      title: `New this week: ${c.name}.`,
      body: `${n(c.current)} sessions, with ${before ? `only ${before}` : "none"} in the previous ${HISTORY_WEEKS} weeks${c.engagementRate ? ` (${pct(c.engagementRate)} engaged)` : ""}.`,
    });
  }

  // Sales or conversions vs normal.
  const revenue = r.scorecards.find((s) => s.key === "revenue");
  const orders = r.scorecards.find((s) => s.key === "orders");
  if (revenue && orders && revenue.average) {
    const change = rel(revenue.current, revenue.average);
    const money = (v: number) => formatMetric(v, revenue.format, true);
    if (!orders.current && orders.average && orders.average >= 0.5) {
      out.push({
        tone: "watch",
        title: "No purchases were recorded this week.",
        body: `The store usually brings in about ${money(revenue.average)} a week (${orders.average.toFixed(1)} purchases). Check the store's own sales report to confirm it's a slow week rather than a tracking gap.`,
      });
    } else if (orders.current && Math.abs(change) >= 0.25) {
      out.push({
        tone: change > 0 ? "good" : "watch",
        title: `Revenue is ${change > 0 ? "up" : "down"} ${pct(change)} on the ${average}.`,
        body: `${n(orders.current)} purchase${orders.current === 1 ? "" : "s"} worth ${money(revenue.current)}, against a usual ${money(revenue.average)} a week. The store's own sales report remains the true number.`,
      });
    }
  } else {
    const keyEvents = r.scorecards.find((s) => s.key === "keyEvents");
    if (keyEvents?.average && keyEvents.average >= 5 && Math.abs(rel(keyEvents.current, keyEvents.average)) >= 0.4) {
      const change = rel(keyEvents.current, keyEvents.average);
      out.push({
        tone: change > 0 ? "good" : "watch",
        title: `Key events are ${change > 0 ? "up" : "down"} ${pct(change)} on the ${average}.`,
        body: `${n(keyEvents.current)} this week against a usual ${n(Math.round(keyEvents.average))}.`,
      });
    }
  }

  // Where visits started, when it's not just the home page.
  const landing = r.landingPages.find((p) => p.key && p.key !== "/" && p.key !== "(not set)");
  if (landing && landing.value >= 10) {
    out.push({ tone: "info", title: `Top landing page after the home page: ${landing.label}`, body: `${n(landing.value)} sessions started there this week.` });
  }

  const order: Record<InsightTone, number> = { bad: 0, watch: 1, good: 2, info: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 7);
}
