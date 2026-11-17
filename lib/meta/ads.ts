import "server-only";
import { createHmac } from "node:crypto";
import { cached } from "@/lib/google/client";
import { dayList, windowFor, type MetricFormat, type Row, type Total, type TrendSeries, type Trend, type Window } from "@/lib/google/reports";

/**
 * Meta (Facebook/Instagram) ad results, read-only, through the Marketing API.
 *
 * META_ACCESS_TOKEN is a Business Manager system-user token with the ads_read
 * permission, assigned "View performance" on each client's ad account.
 * META_APP_SECRET is optional; when set, every call carries an appsecret_proof
 * (needed only if the app has "Require app secret" turned on).
 */

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v24.0"}`;
const REPORT_TTL = 10 * 60_000;

export class MetaNotConfiguredError extends Error {
  constructor() {
    super("Meta isn't connected yet. Add META_ACCESS_TOKEN in the Vercel project settings.");
  }
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function metaConfigured() {
  return Boolean(process.env.META_ACCESS_TOKEN?.trim());
}

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number } };

async function graph<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  if (!token) throw new MetaNotConfiguredError();
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const secret = process.env.META_APP_SECRET?.trim();
  if (secret) url.searchParams.set("appsecret_proof", createHmac("sha256", secret).update(token).digest("hex"));
  return graphUrl<T>(url.toString(), token);
}

async function graphUrl<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as T & GraphError;
  if (!response.ok || body.error) {
    const code = body.error?.code;
    const message =
      code === 190
        ? "The Meta token has expired or was revoked. Generate a new system-user token and update META_ACCESS_TOKEN."
        : code === 4 || code === 17 || code === 613 || code === 80004
          ? "Meta is rate-limiting requests right now. Try again in a few minutes."
          : code === 10 || code === 200 || (code === 100 && body.error?.error_subcode === 33)
            ? "The Meta token can't see this ad account. Assign the ad account to the system user (View performance)."
            : (body.error?.message ?? response.statusText);
    throw new MetaApiError(message, response.status);
  }
  return body;
}

/** Follows `paging.next` (a few pages at most) and returns every row. */
async function allRows<T>(path: string, params: Record<string, string | number>, maxPages = 6): Promise<T[]> {
  type Page = { data?: T[]; paging?: { next?: string } };
  let page = await graph<Page>(path, params);
  const rows = [...(page.data ?? [])];
  for (let i = 1; i < maxPages && page.paging?.next; i++) {
    page = await graphUrl<Page>(page.paging.next, process.env.META_ACCESS_TOKEN!.trim());
    rows.push(...(page.data ?? []));
  }
  return rows;
}

// ---------- ad accounts (for the admin picker) ----------

export type MetaAdAccount = { id: string; name: string; business: string | null };

/** Ad accounts the token can read. */
export function listMetaAdAccounts(): Promise<MetaAdAccount[]> {
  return cached("meta:accounts", 5 * 60_000, async () => {
    const rows = await allRows<{ account_id: string; name?: string; business_name?: string }>("me/adaccounts", {
      fields: "account_id,name,business_name",
      limit: 200,
    });
    return rows
      .map((a) => ({ id: a.account_id, name: a.name || a.account_id, business: a.business_name || null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** "act_123", "123" or a pasted URL with act=123 → "123"; null when it isn't an account number. */
export function normalizeAdAccountId(value: string | null | undefined) {
  const v = (value ?? "").trim();
  if (!v) return null;
  const match = /(?:^|act[=_])(\d{1,25})$/.exec(v) ?? /[?&]act=(\d{1,25})/.exec(v);
  return match ? match[1] : undefined;
}

// ---------- report ----------

export type MetaAdsReport = {
  window: Window;
  currency: string;
  accountName: string;
  hasPurchases: boolean;
  totals: Total[];
  trend: Trend;
  campaigns: Row[];
  ads: Row[];
};

type Action = { action_type: string; value: string };
type InsightRow = {
  date_start: string;
  date_stop: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  actions?: Action[];
  action_values?: Action[];
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
};

// Purchases are reported under several action types; the first one present wins.
// omni_purchase is Meta's de-duplicated total across website, app and offline.
const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

function pick(list: Action[] | undefined) {
  if (!list?.length) return 0;
  for (const type of PURCHASE_TYPES) {
    const hit = list.find((a) => a.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

const num = (v: string | undefined) => Number(v ?? 0) || 0;

type Sums = { spend: number; impressions: number; reach: number; clicks: number; purchases: number; value: number };

function sums(row: InsightRow | undefined): Sums {
  return {
    spend: num(row?.spend),
    impressions: num(row?.impressions),
    reach: num(row?.reach),
    clicks: num(row?.inline_link_clicks),
    purchases: pick(row?.actions),
    value: pick(row?.action_values),
  };
}

const ratio = (a: number, b: number, scale = 1) => (b ? (a / b) * scale : 0);

export function metaAdsReport(adAccountId: string, days: number): Promise<MetaAdsReport> {
  if (!/^\d{1,25}$/.test(adAccountId)) throw new Error("Invalid Meta ad account ID.");
  const act = `act_${adAccountId}`;
  return cached(`meta:${adAccountId}:${days}`, REPORT_TTL, async () => {
    const info = await cached(`meta:info:${adAccountId}`, 24 * 60 * 60_000, () =>
      graph<{ name?: string; currency?: string; timezone_name?: string }>(act, { fields: "name,currency,timezone_name" }),
    );
    const currency = info.currency || "USD";
    const win = windowFor(days, info.timezone_name || "America/Chicago");
    const current = JSON.stringify({ since: win.start, until: win.end });
    const ranked = (level: "campaign" | "ad", fields: string, limit: number) =>
      graph<{ data?: InsightRow[] }>(`${act}/insights`, {
        level,
        fields: `${fields},spend,actions,action_values`,
        time_range: current,
        sort: JSON.stringify(["spend_descending"]),
        limit,
      }).then((r) => (r.data ?? []).filter((row) => num(row.spend) > 0));

    const [totalsRows, dailyRows, campaignRows, adRows] = await Promise.all([
      graph<{ data?: InsightRow[] }>(`${act}/insights`, {
        level: "account",
        fields: "spend,impressions,reach,inline_link_clicks,actions,action_values",
        time_ranges: JSON.stringify([
          { since: win.start, until: win.end },
          { since: win.previousStart, until: win.previousEnd },
        ]),
      }).then((r) => r.data ?? []),
      allRows<InsightRow>(`${act}/insights`, {
        level: "account",
        fields: "spend,impressions,inline_link_clicks,actions,action_values",
        time_range: JSON.stringify({ since: win.previousStart, until: win.end }),
        time_increment: 1,
        limit: 500,
      }),
      ranked("campaign", "campaign_id,campaign_name", 15),
      ranked("ad", "ad_id,ad_name", 10),
    ]);

    const now = sums(totalsRows.find((r) => r.date_start === win.start));
    const before = sums(totalsRows.find((r) => r.date_start === win.previousStart));
    const hasPurchases = Boolean(now.purchases || before.purchases);
    const money: MetricFormat = `currency:${currency}`;
    const tile = (key: string, label: string, format: MetricFormat, get: (s: Sums) => number, lowerIsBetter?: boolean): Total => ({
      key,
      label,
      format,
      current: get(now),
      previous: get(before),
      ...(lowerIsBetter ? { lowerIsBetter } : {}),
    });

    const totals: Total[] = [tile("spend", "Spend", money, (s) => s.spend)];
    if (hasPurchases) {
      totals.push(
        tile("value", "Purchase value", money, (s) => s.value),
        tile("roas", "ROAS", "multiple", (s) => ratio(s.value, s.spend)),
        tile("purchases", "Purchases", "number", (s) => s.purchases),
        tile("cpa", "Cost per purchase", money, (s) => ratio(s.spend, s.purchases), true),
      );
    } else {
      totals.push(tile("reach", "Reach", "number", (s) => s.reach), tile("cpm", "CPM", money, (s) => ratio(s.spend, s.impressions, 1000), true));
    }
    totals.push(
      tile("impressions", "Impressions", "number", (s) => s.impressions),
      tile("ctr", "Link CTR", "percent", (s) => ratio(s.clicks, s.impressions)),
      tile("cpc", "Cost per link click", money, (s) => ratio(s.spend, s.clicks), true),
    );

    // Daily trend, zero-filled so the two windows line up day by day.
    const dates = dayList(win.start, days);
    const previousDates = dayList(win.previousStart, days);
    const index = new Map<string, ["current" | "previous", number]>();
    dates.forEach((d, i) => index.set(d, ["current", i]));
    previousDates.forEach((d, i) => index.set(d, ["previous", i]));
    const defs: { key: keyof Sums; label: string; format: MetricFormat; store?: boolean }[] = [
      { key: "spend", label: "Spend", format: money },
      { key: "value", label: "Purchase value", format: money, store: true },
      { key: "purchases", label: "Purchases", format: "number", store: true },
      { key: "clicks", label: "Link clicks", format: "number" },
      { key: "impressions", label: "Impressions", format: "number" },
    ];
    const series: TrendSeries[] = defs
      .filter((d) => hasPurchases || !d.store)
      .map((d) => ({ key: d.key, label: d.label, format: d.format, current: Array(days).fill(0), previous: Array(days).fill(0) }));
    for (const row of dailyRows) {
      const slot = index.get(row.date_start);
      if (!slot) continue;
      const s = sums(row);
      for (const line of series) line[slot[0]][slot[1]] = s[line.key as keyof Sums];
    }

    const rankedRow = (key: string, label: string, row: InsightRow): Row => {
      const s = sums(row);
      return {
        key,
        label,
        value: s.spend,
        ...(hasPurchases
          ? {
              cells: [
                { label: "Purch.", value: s.purchases, format: "number" as MetricFormat },
                { label: "ROAS", value: ratio(s.value, s.spend), format: "multiple" as MetricFormat },
              ],
            }
          : {}),
      };
    };

    return {
      window: win,
      currency,
      accountName: info.name || act,
      hasPurchases,
      totals,
      trend: { dates, previousDates, series },
      campaigns: campaignRows.map((r) => rankedRow(r.campaign_id ?? r.campaign_name ?? "", r.campaign_name || "(unnamed campaign)", r)),
      ads: adRows.map((r) => rankedRow(r.ad_id ?? r.ad_name ?? "", r.ad_name || "(unnamed ad)", r)),
    };
  });
}
