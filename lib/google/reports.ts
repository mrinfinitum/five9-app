import "server-only";
import { cached, googleFetch } from "./client";

/** Reporting windows. Each is compared with the same-length window just before it. */
export const RANGES = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "28d", label: "28 days", days: 28 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "12m", label: "12 months", days: 365 },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];

export function rangeFor(key: string | undefined) {
  return RANGES.find((r) => r.key === key) ?? RANGES[1];
}

/** `currency:USD` etc. formats as money in that currency. */
export type MetricFormat = "number" | "percent" | "duration" | "decimal" | `currency:${string}`;
export type Total = { key: string; label: string; current: number; previous: number; format: MetricFormat; lowerIsBetter?: boolean };
export type TrendSeries = { key: string; label: string; format: MetricFormat; current: number[]; previous: number[] };
export type Trend = { dates: string[]; previousDates: string[]; series: TrendSeries[] };
export type Row = { key: string; label: string; value: number; cells?: { label: string; value: number; format: MetricFormat }[] };
export type Window = { start: string; end: string; previousStart: string; previousEnd: string };

export type Ga4Report = { window: Window; currency: string; totals: Total[]; trend: Trend; products: Row[]; pages: Row[]; channels: Row[]; sources: Row[]; devices: Row[]; countries: Row[] };
export type SearchReport = { window: Window; totals: Total[]; trend: Trend; queries: Row[]; pages: Row[]; countries: Row[]; devices: Row[] };

const REPORT_TTL = 10 * 60_000;
const LIST_TTL = 5 * 60_000;

// ---------- dates ----------

function today(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(day: string, days: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Ends yesterday (today is still incomplete), in the property's own time zone. */
function windowFor(days: number, timeZone: string): Window {
  const end = addDays(today(timeZone), -1);
  const start = addDays(end, -(days - 1));
  const previousEnd = addDays(start, -1);
  return { start, end, previousStart: addDays(previousEnd, -(days - 1)), previousEnd };
}

function dayList(start: string, days: number) {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

// ---------- account lists (for the admin picker) ----------

export type Ga4Property = { id: string; name: string; account: string };
export type SearchSite = { siteUrl: string; permission: string };

export function listGa4Properties(): Promise<Ga4Property[]> {
  return cached("ga4:properties", LIST_TTL, async () => {
    const properties: Ga4Property[] = [];
    let pageToken = "";
    do {
      const page = await googleFetch<{
        accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[];
        nextPageToken?: string;
      }>(`https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      for (const account of page.accountSummaries ?? []) {
        for (const p of account.propertySummaries ?? []) {
          properties.push({ id: p.property.replace("properties/", ""), name: p.displayName, account: account.displayName });
        }
      }
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
    return properties.sort((a, b) => a.name.localeCompare(b.name));
  });
}

export function listSearchSites(): Promise<SearchSite[]> {
  return cached("gsc:sites", LIST_TTL, async () => {
    const data = await googleFetch<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>("https://www.googleapis.com/webmasters/v3/sites");
    return (data.siteEntry ?? [])
      .filter((s) => s.permissionLevel !== "siteUnverifiedUser")
      .map((s) => ({ siteUrl: s.siteUrl, permission: s.permissionLevel }))
      .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
  });
}

// ---------- GA4 ----------

type Ga4Response = { rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[] };

// GA4 allows at most 10 metrics per request, so site and store totals are fetched separately.
const GA_TOTALS: { key: string; label: string; format: MetricFormat }[] = [
  { key: "activeUsers", label: "Users", format: "number" },
  { key: "newUsers", label: "New users", format: "number" },
  { key: "sessions", label: "Sessions", format: "number" },
  { key: "screenPageViews", label: "Page views", format: "number" },
  { key: "engagementRate", label: "Engagement rate", format: "percent" },
  { key: "averageSessionDuration", label: "Avg. session", format: "duration" },
  { key: "keyEvents", label: "Key events", format: "number" },
];
/** Fetched for store totals; the average order is computed from these (revenue ÷ orders). */
const STORE_METRICS = ["purchaseRevenue", "ecommercePurchases", "sessionKeyEventRate:purchase"] as const;
const GA_TREND: { key: string; label: string; format: MetricFormat; store?: boolean }[] = [
  { key: "activeUsers", label: "Users", format: "number" },
  { key: "sessions", label: "Sessions", format: "number" },
  { key: "screenPageViews", label: "Page views", format: "number" },
  { key: "keyEvents", label: "Key events", format: "number" },
  { key: "purchaseRevenue", label: "Revenue", format: "currency:", store: true },
  { key: "ecommercePurchases", label: "Orders", format: "number", store: true },
];

function propertyInfo(propertyId: string) {
  return cached(`ga4:info:${propertyId}`, 24 * 60 * 60_000, async () => {
    const property = await googleFetch<{ timeZone?: string; currencyCode?: string }>(`https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}`);
    return { timeZone: property.timeZone || "America/Chicago", currency: property.currencyCode || "USD" };
  });
}

export function ga4Report(propertyId: string, days: number): Promise<Ga4Report> {
  if (!/^\d{1,20}$/.test(propertyId)) throw new Error("Invalid GA4 property ID.");
  return cached(`ga4:${propertyId}:${days}`, REPORT_TTL, async () => {
    const info = await propertyInfo(propertyId);
    const win = windowFor(days, info.timeZone);
    const both = [
      { startDate: win.start, endDate: win.end, name: "current" },
      { startDate: win.previousStart, endDate: win.previousEnd, name: "previous" },
    ];
    const current = [both[0]];
    const ranked = (dimension: string, metric: string, limit = 10) => ({
      dateRanges: current,
      dimensions: [{ name: dimension }],
      metrics: [{ name: metric }],
      orderBys: [{ metric: { metricName: metric }, desc: true }],
      limit,
    });

    const [batch, extra] = await Promise.all([
      googleFetch<{ reports: Ga4Response[] }>(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`, {
        method: "POST",
        body: {
          requests: [
            { dateRanges: both, metrics: GA_TOTALS.map((m) => ({ name: m.key })) },
            { dateRanges: both, dimensions: [{ name: "date" }], metrics: GA_TREND.map((m) => ({ name: m.key })), limit: 1000 },
            ranked("pagePath", "screenPageViews"),
            ranked("sessionDefaultChannelGroup", "sessions"),
            ranked("sessionSourceMedium", "sessions"),
          ],
        },
      }),
      googleFetch<{ reports: Ga4Response[] }>(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`, {
        method: "POST",
        body: {
          requests: [
            ranked("deviceCategory", "sessions", 5),
            ranked("country", "activeUsers"),
            ranked("itemName", "itemRevenue"),
            { dateRanges: both, metrics: STORE_METRICS.map((name) => ({ name })) },
          ],
        },
      }),
    ]);
    const [totalsRes, trendRes, pagesRes, channelsRes, sourcesRes] = batch.reports;
    const [devicesRes, countriesRes, productsRes, storeRes] = extra.reports;

    // Totals: one row per date range (the range name is the last dimension).
    const rangeValues = (res: Ga4Response) => {
      const byRange = new Map((res.rows ?? []).map((r) => [r.dimensionValues?.at(-1)?.value, r.metricValues ?? []]));
      return (range: "current" | "previous", i: number) => Number(byRange.get(range)?.[i]?.value ?? 0);
    };
    const site = rangeValues(totalsRes);
    const store = rangeValues(storeRes);
    const totals: Total[] = GA_TOTALS.map((m, i) => ({ ...m, current: site("current", i), previous: site("previous", i) }));

    // Store metrics only show for sites that have had an order in either window.
    const isStore = Boolean(store("current", 1) || store("previous", 1));
    if (isStore) {
      const money: MetricFormat = `currency:${info.currency}`;
      const aov = (range: "current" | "previous") => (store(range, 1) ? store(range, 0) / store(range, 1) : 0);
      totals.push(
        { key: "purchaseRevenue", label: "Revenue", format: money, current: store("current", 0), previous: store("previous", 0) },
        { key: "ecommercePurchases", label: "Orders", format: "number", current: store("current", 1), previous: store("previous", 1) },
        { key: "averageOrderValue", label: "Avg. order", format: money, current: aov("current"), previous: aov("previous") },
        { key: "purchaseRate", label: "Conversion rate", format: "percent", current: store("current", 2), previous: store("previous", 2) },
      );
    }

    // Trend: zero-fill every day so the two windows line up day by day.
    const dates = dayList(win.start, days);
    const previousDates = dayList(win.previousStart, days);
    const index = new Map<string, number>();
    dates.forEach((d, i) => index.set(`current:${d.replace(/-/g, "")}`, i));
    previousDates.forEach((d, i) => index.set(`previous:${d.replace(/-/g, "")}`, i));
    const series: TrendSeries[] = GA_TREND.map((m) => ({
      key: m.key,
      label: m.label,
      format: m.format === "currency:" ? `currency:${info.currency}` : m.format,
      current: Array(days).fill(0),
      previous: Array(days).fill(0),
    }));
    for (const row of trendRes.rows ?? []) {
      const [date, range] = (row.dimensionValues ?? []).map((v) => v.value);
      const i = index.get(`${range}:${date}`);
      if (i === undefined) continue;
      series.forEach((s, m) => (s[range === "current" ? "current" : "previous"][i] = Number(row.metricValues?.[m]?.value ?? 0)));
    }

    const rows = (res: Ga4Response, label?: (value: string) => string): Row[] =>
      (res.rows ?? []).map((r) => {
        const key = r.dimensionValues?.[0]?.value ?? "";
        return { key, label: label ? label(key) : key || "(not set)", value: Number(r.metricValues?.[0]?.value ?? 0) };
      });

    return {
      window: win,
      currency: info.currency,
      totals,
      trend: { dates, previousDates, series: isStore ? series : series.filter((t) => !GA_TREND.find((m) => m.key === t.key)?.store) },
      products: isStore ? rows(productsRes, (v) => (!v || v === "(not set)" ? "Unnamed (store didn't send a product name)" : v)) : [],
      pages: rows(pagesRes),
      channels: rows(channelsRes),
      sources: rows(sourcesRes),
      devices: rows(devicesRes, (v) => v.charAt(0).toUpperCase() + v.slice(1)),
      countries: rows(countriesRes),
    };
  });
}

// ---------- Search Console ----------

type SearchRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

export function searchReport(siteUrl: string, days: number): Promise<SearchReport> {
  if (!/^(sc-domain:|https?:\/\/)/.test(siteUrl) || siteUrl.length > 300) throw new Error("Invalid Search Console site.");
  return cached(`gsc:${siteUrl}:${days}`, REPORT_TTL, async () => {
    // Search Console reports in Pacific time.
    const win = windowFor(days, "America/Los_Angeles");
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    const query = (startDate: string, endDate: string, dimensions: string[], rowLimit = 10) =>
      googleFetch<{ rows?: SearchRow[] }>(url, {
        method: "POST",
        body: { startDate, endDate, dimensions, rowLimit, type: "web", dataState: "all" },
      }).then((r) => r.rows ?? []);

    const [cur, prev, trendCur, trendPrev, queries, pages, countries, devices] = await Promise.all([
      query(win.start, win.end, []),
      query(win.previousStart, win.previousEnd, []),
      query(win.start, win.end, ["date"], 1000),
      query(win.previousStart, win.previousEnd, ["date"], 1000),
      query(win.start, win.end, ["query"], 15),
      query(win.start, win.end, ["page"], 15),
      query(win.start, win.end, ["country"], 10),
      query(win.start, win.end, ["device"], 5),
    ]);

    const c = cur[0];
    const p = prev[0];
    const totals: Total[] = [
      { key: "clicks", label: "Clicks", format: "number", current: c?.clicks ?? 0, previous: p?.clicks ?? 0 },
      { key: "impressions", label: "Impressions", format: "number", current: c?.impressions ?? 0, previous: p?.impressions ?? 0 },
      { key: "ctr", label: "CTR", format: "percent", current: c?.ctr ?? 0, previous: p?.ctr ?? 0 },
      { key: "position", label: "Avg. position", format: "decimal", current: c?.position ?? 0, previous: p?.position ?? 0, lowerIsBetter: true },
    ];

    const dates = dayList(win.start, days);
    const previousDates = dayList(win.previousStart, days);
    const metrics = [
      { key: "clicks", label: "Clicks", format: "number" as const },
      { key: "impressions", label: "Impressions", format: "number" as const },
      { key: "ctr", label: "CTR", format: "percent" as const },
      { key: "position", label: "Avg. position", format: "decimal" as const },
    ];
    const fill = (list: string[], rows: SearchRow[], key: keyof SearchRow) => {
      const byDate = new Map(rows.map((r) => [r.keys?.[0], r]));
      return list.map((d) => Number(byDate.get(d)?.[key] ?? 0));
    };
    const series: TrendSeries[] = metrics.map((m) => ({
      ...m,
      current: fill(dates, trendCur, m.key as keyof SearchRow),
      previous: fill(previousDates, trendPrev, m.key as keyof SearchRow),
    }));

    const detail = (r: SearchRow) => [
      { label: "Impressions", value: r.impressions, format: "number" as const },
      { label: "CTR", value: r.ctr, format: "percent" as const },
      { label: "Position", value: r.position, format: "decimal" as const },
    ];
    const country = (code: string) => {
      try {
        return COUNTRY_NAMES.of(code.toUpperCase()) ?? code;
      } catch {
        return code;
      }
    };
    // Search Console uses ISO 3166-1 alpha-3 codes; show alpha-3 when no name maps.
    return {
      window: win,
      totals,
      trend: { dates, previousDates, series },
      queries: queries.map((r) => ({ key: r.keys?.[0] ?? "", label: r.keys?.[0] ?? "", value: r.clicks, cells: detail(r) })),
      pages: pages.map((r) => ({ key: r.keys?.[0] ?? "", label: r.keys?.[0] ?? "", value: r.clicks, cells: detail(r) })),
      countries: countries.map((r) => ({ key: r.keys?.[0] ?? "", label: alpha3Name(r.keys?.[0] ?? "", country), value: r.clicks })),
      devices: devices.map((r) => {
        const key = r.keys?.[0] ?? "";
        return { key, label: key.charAt(0) + key.slice(1).toLowerCase(), value: r.clicks };
      }),
    };
  });
}

/** Common alpha-3 → alpha-2 so country names read nicely; anything else shows its code. */
const ALPHA3: Record<string, string> = {
  usa: "US", can: "CA", gbr: "GB", aus: "AU", ind: "IN", deu: "DE", fra: "FR", mex: "MX", bra: "BR", esp: "ES", ita: "IT",
  nld: "NL", irl: "IE", nzl: "NZ", phl: "PH", jpn: "JP", zaf: "ZA", sgp: "SG", swe: "SE", che: "CH", pak: "PK", nga: "NG",
  chn: "CN", kor: "KR", arg: "AR", col: "CO", pol: "PL", bel: "BE", aut: "AT", dnk: "DK", nor: "NO", fin: "FI", prt: "PT",
  are: "AE", isr: "IL", tur: "TR", idn: "ID", mys: "MY", tha: "TH", vnm: "VN", egy: "EG", ken: "KE", chl: "CL", per: "PE",
};
function alpha3Name(code: string, name: (alpha2: string) => string) {
  const alpha2 = ALPHA3[code.toLowerCase()];
  return alpha2 ? name(alpha2) : code.toUpperCase();
}
