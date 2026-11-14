import { Globe, Search, Settings, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { RankedList, TotalTiles, TrendPanel } from "@/components/web-analytics/charts";
import { SiteSwitcher } from "@/components/web-analytics/site-switcher";
import { requireUser } from "@/lib/auth";
import { hasWebAnalyticsAccess, listWebSites, type WebSite } from "@/lib/google/access";
import { GoogleApiError, GoogleNotConfiguredError } from "@/lib/google/client";
import { formatDay } from "@/lib/google/format";
import { RANGES, ga4Report, rangeFor, searchReport, type Window } from "@/lib/google/reports";

export const metadata = { title: "Web analytics" };

export default function WebAnalyticsPage({ searchParams }: PageProps<"/web">) {
  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-xl bg-panel" />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/web">["searchParams"] }) {
  const user = await requireUser();
  if (!(await hasWebAnalyticsAccess(user.id))) redirect(user.isAdmin ? "/web/settings" : "/boards");

  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = rangeFor(one(params.range));
  const sites = (await listWebSites()).filter((s) => s.ga4PropertyId || s.searchConsoleSite);
  const site = sites.find((s) => s.slug === one(params.client)) ?? sites[0];

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-brand">
            <Globe className="h-3.5 w-3.5" /> Web analytics
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">{site?.name ?? "Client sites"}</h1>
          <p className="mt-1 text-sm text-muted">Google Analytics and Search Console for every client, in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {site ? (
            <nav aria-label="Date range" className="flex gap-1 rounded-lg bg-panel p-1">
              {RANGES.map((r) => (
                <Link
                  aria-current={r.key === range.key ? "true" : undefined}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ${r.key === range.key ? "bg-brand text-on-brand" : "text-muted hover:text-white"}`}
                  href={`/web?client=${encodeURIComponent(site.slug)}&range=${r.key}`}
                  key={r.key}
                >
                  {r.label}
                </Link>
              ))}
            </nav>
          ) : null}
          {user.isAdmin ? (
            <Link className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs" href="/web/settings">
              <Settings className="h-3.5 w-3.5" /> Settings
            </Link>
          ) : null}
        </div>
      </header>

      {!site ? (
        <div className="card p-8 text-center">
          <p className="text-white">No client sites are connected yet.</p>
          <p className="mt-1 text-sm text-muted">
            {user.isAdmin ? (
              <>
                Link a board to its GA4 property or Search Console site in <Link className="text-brand hover:underline" href="/web/settings">settings</Link>.
              </>
            ) : (
              "Ask an admin to link client sites."
            )}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <SiteSwitcher
              range={range.key}
              selected={site.slug}
              sites={sites.map((s) => ({ slug: s.slug, name: s.name, hasGa4: Boolean(s.ga4PropertyId), hasSearch: Boolean(s.searchConsoleSite) }))}
            />
          </aside>
          <div className="min-w-0 space-y-10">
            <Suspense fallback={<SectionSkeleton title="Google Analytics" />} key={`ga:${site.boardId}:${range.key}`}>
              <Ga4Section days={range.days} site={site} />
            </Suspense>
            <Suspense fallback={<SectionSkeleton title="Search Console" />} key={`sc:${site.boardId}:${range.key}`}>
              <SearchSection days={range.days} site={site} />
            </Suspense>
          </div>
        </div>
      )}
    </>
  );
}

function SectionHeader({ icon, title, window, note }: { icon: React.ReactNode; title: string; window?: Window; note?: string }) {
  return (
    <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="flex items-center gap-2 text-xl font-black text-white">
        {icon} {title}
      </h2>
      {window ? (
        <span className="text-xs text-muted">
          {formatDay(window.start, true)} – {formatDay(window.end, true)} vs {formatDay(window.previousStart)} – {formatDay(window.previousEnd, true)}
        </span>
      ) : null}
      {note ? <span className="text-xs text-muted">· {note}</span> : null}
    </header>
  );
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <section aria-busy="true">
      <h2 className="mb-3 text-xl font-black text-white">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div className="h-24 animate-pulse rounded-xl bg-panel" key={i} />
        ))}
      </div>
      <div className="mt-3 h-72 animate-pulse rounded-xl bg-panel" />
    </section>
  );
}

function Problem({ error }: { error: unknown }) {
  const message =
    error instanceof GoogleNotConfiguredError || error instanceof GoogleApiError || error instanceof Error ? error.message : "Couldn't load this report.";
  return (
    <div className="card flex items-start gap-3 border-amber-700/50 p-4 text-sm">
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <p className="text-neutral-200">{message}</p>
    </div>
  );
}

async function Ga4Section({ site, days }: { site: WebSite; days: number }) {
  const icon = <span className="rounded bg-[#f9ab00] px-1.5 py-0.5 text-[0.65rem] font-black text-[#111]">GA4</span>;
  if (!site.ga4PropertyId) {
    return (
      <section>
        <SectionHeader icon={icon} title="Google Analytics" />
        <p className="card p-4 text-sm text-muted">No GA4 property linked for {site.name}.</p>
      </section>
    );
  }
  let report;
  try {
    report = await ga4Report(site.ga4PropertyId, days);
  } catch (error) {
    return (
      <section>
        <SectionHeader icon={icon} title="Google Analytics" />
        <Problem error={error} />
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <SectionHeader icon={icon} title="Google Analytics" window={report.window} />
      <TotalTiles totals={report.totals} />
      <TrendPanel title="Traffic over time" trend={report.trend} />
      <div className="grid gap-3 xl:grid-cols-2">
        <RankedList rows={report.pages} title="Top pages" unit="Views" />
        <RankedList rows={report.channels} title="Channels" unit="Sessions" />
        <RankedList rows={report.sources} title="Source / medium" unit="Sessions" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <RankedList rows={report.devices} title="Devices" unit="Sessions" />
          <RankedList rows={report.countries} title="Countries" unit="Users" />
        </div>
      </div>
    </section>
  );
}

async function SearchSection({ site, days }: { site: WebSite; days: number }) {
  const icon = <Search aria-hidden="true" className="h-5 w-5 text-[#4285f4]" />;
  const siteUrl = site.searchConsoleSite;
  if (!siteUrl) {
    return (
      <section>
        <SectionHeader icon={icon} title="Search Console" />
        <p className="card p-4 text-sm text-muted">No Search Console site linked for {site.name}.</p>
      </section>
    );
  }
  let report;
  try {
    report = await searchReport(siteUrl, days);
  } catch (error) {
    return (
      <section>
        <SectionHeader icon={icon} title="Search Console" />
        <Problem error={error} />
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <SectionHeader icon={icon} note="The last 2–3 days are still filling in" title="Search Console" window={report.window} />
      <TotalTiles totals={report.totals} />
      <TrendPanel title="Search performance over time" trend={report.trend} />
      <div className="grid gap-3 xl:grid-cols-2">
        <RankedList rows={report.queries} title="Top queries" unit="Clicks" />
        <RankedList link={(row) => (/^https?:\/\//.test(row.key) ? row.key : null)} rows={report.pages} title="Top pages" unit="Clicks" />
        <RankedList rows={report.countries} title="Countries" unit="Clicks" />
        <RankedList rows={report.devices} title="Devices" unit="Clicks" />
      </div>
    </section>
  );
}
