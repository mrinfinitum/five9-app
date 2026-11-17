import { CalendarDays, ChevronLeft, ChevronRight, LayoutDashboard, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { RankedList } from "@/components/web-analytics/charts";
import { SiteSwitcher } from "@/components/web-analytics/site-switcher";
import { ChannelTable, InsightList, WeeklyScorecards, WeeklyTrend } from "@/components/web-analytics/weekly";
import { requireUser } from "@/lib/auth";
import { hasWebAnalyticsAccess, visibleWebSites, type WebSite } from "@/lib/google/access";
import { formatDay } from "@/lib/google/format";
import { averageLabel, weeklyReport } from "@/lib/google/weekly";

export const metadata = { title: "Weekly web report" };

export default function WeeklyWebReportPage({ searchParams }: PageProps<"/web/weekly">) {
  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-xl bg-panel" />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Report({ searchParams }: { searchParams: PageProps<"/web/weekly">["searchParams"] }) {
  const user = await requireUser();
  if (!(await hasWebAnalyticsAccess(user.id))) redirect(user.isAdmin ? "/web/settings" : "/boards");

  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const sites = (await visibleWebSites(user.id)).filter((s) => s.canWeb && s.ga4PropertyId);
  const site = sites.find((s) => s.slug === one(params.client)) ?? sites[0];
  const week = one(params.week);

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-brand">
            <CalendarDays className="h-3.5 w-3.5" /> Weekly web report
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">{site?.name ?? "Client sites"}</h1>
          <p className="mt-1 text-sm text-muted">Last full week (Monday to Sunday) against the week before and the average of the 26 weeks before it.</p>
        </div>
        <Link
          className="btn-ghost inline-flex items-center gap-1.5 self-start px-3 py-1.5 text-xs sm:self-auto"
          href={site ? `/web?client=${encodeURIComponent(site.slug)}` : "/web"}
        >
          <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
        </Link>
      </header>

      {!site ? (
        <div className="card p-8 text-center">
          <p className="text-white">No client has a GA4 property linked yet.</p>
          <p className="mt-1 text-sm text-muted">The weekly report uses Google Analytics; link a property in web analytics settings.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <SiteSwitcher
              basePath="/web/weekly"
              selected={site.slug}
              sites={sites.map((s) => ({ slug: s.slug, name: s.name, hasGa4: true, hasSearch: Boolean(s.searchConsoleSite) }))}
            />
          </aside>
          <div className="min-w-0">
            <Suspense fallback={<div className="h-[40rem] animate-pulse rounded-xl bg-panel" />} key={`${site.boardId}:${week ?? ""}`}>
              <WeekSection site={site} week={week} />
            </Suspense>
          </div>
        </div>
      )}
    </>
  );
}

async function WeekSection({ site, week }: { site: WebSite; week?: string }) {
  let report;
  try {
    report = await weeklyReport(site.ga4PropertyId!, week);
  } catch (error) {
    return (
      <div className="card flex items-start gap-3 border-amber-700/50 p-4 text-sm">
        <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-neutral-200">{error instanceof Error ? error.message : "Couldn't load this report."}</p>
      </div>
    );
  }

  const label = averageLabel(report.weeksInAverage);
  const href = (start: string) => `/web/weekly?client=${encodeURIComponent(site.slug)}${start === report.latestWeek ? "" : `&week=${start}`}`;
  const addWeeks = (day: string, weeks: number) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
  };
  const isLatest = report.week.start === report.latestWeek;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav aria-label="Week" className="flex items-center gap-1 rounded-lg bg-panel p-1">
          <Link aria-label="Previous week" className="rounded-md p-1.5 text-muted hover:text-white" href={href(addWeeks(report.week.start, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="px-2 text-sm font-semibold text-white">
            {formatDay(report.week.start)} – {formatDay(report.week.end, true)}
          </span>
          {isLatest ? (
            <span aria-hidden="true" className="p-1.5 text-muted opacity-30">
              <ChevronRight className="h-4 w-4" />
            </span>
          ) : (
            <Link aria-label="Next week" className="rounded-md p-1.5 text-muted hover:text-white" href={href(addWeeks(report.week.start, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </nav>
        <p className="text-xs text-muted">
          vs {formatDay(report.previousWeek.start)} – {formatDay(report.previousWeek.end)}
          {report.averageFrom
            ? ` and the ${report.weeksInAverage} weeks from ${formatDay(report.averageFrom, true)}`
            : " · no earlier weeks to average yet"}
          {isLatest ? null : (
            <>
              {" · "}
              <Link className="text-brand hover:underline" href={href(report.latestWeek)}>
                Latest week
              </Link>
            </>
          )}
        </p>
      </div>

      <WeeklyScorecards averageLabel={label} cards={report.scorecards} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <InsightList insights={report.insights} />
        <WeeklyTrend average={report.scorecards[0].average} averageLabel={label} weeks={report.weeks} />
      </div>
      <ChannelTable averageLabel={label} channels={report.channels} />
      <div className="grid gap-4 xl:grid-cols-3">
        <RankedList rows={report.pages} title="Top pages" unit="Views" />
        <RankedList rows={report.landingPages} title="Landing pages" unit="Sessions" />
        <RankedList rows={report.countries} title="Countries" unit="Users" />
      </div>
      {report.isStore ? <p className="text-xs text-muted">Purchases and revenue are what Google Analytics recorded; the store&apos;s own sales report is the true number.</p> : null}
    </div>
  );
}
