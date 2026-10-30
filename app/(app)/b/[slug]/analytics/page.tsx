import { ArrowLeft, ChartNoAxesCombined, Smile } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BoardAnalytics } from "@/components/requests/analytics";
import { requireUser } from "@/lib/auth";
import { getBoardAnalytics } from "@/lib/requests/analytics";
import { getBoardContext } from "@/lib/requests/data";
import { getSatisfactionPulse } from "@/lib/requests/survey";

export const metadata = { title: "Analytics" };

export default function AnalyticsPage({ params }: PageProps<"/b/[slug]/analytics">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-panel" />}>
        <AnalyticsLoader params={params} />
      </Suspense>
    </main>
  );
}

async function AnalyticsLoader({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }] = await Promise.all([params, requireUser()]);
  const context = await getBoardContext(slug);
  if (!context || context.access !== "team") notFound();
  const { board } = context;
  const [data, pulse] = await Promise.all([getBoardAnalytics(board.id), getSatisfactionPulse(board.id)]);

  const periods = [
    ["This week", pulse.week],
    ["This month", pulse.month],
    ["Year to date", pulse.ytd],
  ] as const;

  return (
    <>
      <Link className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white" href={`/b/${board.slug}`}>
        <ArrowLeft className="h-4 w-4" /> Back to {board.name}
      </Link>
      <header className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-brand">
            <ChartNoAxesCombined className="h-3.5 w-3.5" /> Request intelligence
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Pipeline analytics</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Completed volume, team output, turnaround time, delivery trends, and the mix of requests on {board.name}.
          </p>
        </div>
        <div className="card px-4 py-3 text-right">
          <strong className="block text-3xl font-black tabular-nums text-white">{data.totalItems}</strong>
          <span className="text-xs text-muted">requests tracked</span>
        </div>
      </header>

      <section aria-labelledby="happiness-title" className="card mb-6 p-5">
        <header className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand/15 text-brand"><Smile className="h-5 w-5" /></span>
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-brand">Customer feedback</p>
            <h2 className="text-lg font-bold text-white" id="happiness-title">Requester happiness</h2>
            <span className="text-xs text-muted">Anonymous one-click ratings sent when requests are completed.</span>
          </div>
        </header>
        <div className="grid gap-3 sm:grid-cols-3">
          {periods.map(([label, period]) => (
            <article className="rounded-lg bg-panel-2 px-4 py-3" key={label} title={`${period.responses} response${period.responses === 1 ? "" : "s"}`}>
              <small className="text-xs uppercase tracking-wider text-muted">{label}</small>
              <strong className="mt-1 block text-2xl font-black tabular-nums text-white">
                {period.average === null ? "—" : period.average.toFixed(1)}
                <em className="ml-0.5 text-sm font-semibold not-italic text-muted">/5</em>
              </strong>
              <p className="text-xs text-muted">{period.responses} response{period.responses === 1 ? "" : "s"}</p>
            </article>
          ))}
        </div>
      </section>

      <BoardAnalytics boardSlug={board.slug} data={data} />
    </>
  );
}
