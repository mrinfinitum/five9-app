"use client";

import { useMemo, useState } from "react";
import type { AnalyticsData, Completion } from "@/lib/requests/analytics";

type Period = "week" | "month" | "quarter" | "year" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

const BRAND = "#e10600";

function startOfPeriod(period: Period, now: Date, completions: Completion[]) {
  const result = new Date(now);
  result.setHours(0, 0, 0, 0);
  if (period === "all") {
    const earliest = completions.reduce((min, c) => Math.min(min, Date.parse(c.completedAt)), now.getTime());
    const start = new Date(earliest);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === "week") {
    const day = result.getDay();
    result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  } else if (period === "month") result.setDate(1);
  else if (period === "quarter") result.setMonth(Math.floor(result.getMonth() / 3) * 3, 1);
  else result.setMonth(0, 1);
  return result;
}

function localKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Buckets: days (week/month), weeks (quarter), months (year), years (all time). */
function buildTrend(completions: Completion[], period: Period, start: Date, end: Date) {
  const keyFor = (date: Date) => {
    if (period === "year") return `${date.getFullYear()}-${date.getMonth()}`;
    if (period === "all") return String(date.getFullYear());
    if (period === "quarter") {
      const monday = new Date(date);
      monday.setHours(0, 0, 0, 0);
      const day = monday.getDay();
      monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
      return localKey(monday);
    }
    return localKey(date);
  };
  const buckets: { key: string; label: string; count: number }[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    buckets.push({
      key: keyFor(cursor),
      label:
        period === "year"
          ? cursor.toLocaleDateString("en-US", { month: "short" })
          : period === "all"
            ? String(cursor.getFullYear())
            : period === "quarter"
              ? `Week of ${cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: 0,
    });
    if (period === "year") cursor.setMonth(cursor.getMonth() + 1, 1);
    else if (period === "all") cursor.setFullYear(cursor.getFullYear() + 1, 0, 1);
    else cursor.setDate(cursor.getDate() + (period === "quarter" ? 7 : 1));
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const c of completions) {
    const bucket = byKey.get(keyFor(new Date(c.completedAt)));
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

const average = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);

function formatDays(value: number | null) {
  if (value === null) return "—";
  if (value < 1) return "<1 day";
  return `${value.toFixed(value >= 10 ? 0 : 1)} days`;
}

export function BoardAnalytics({ data, boardSlug }: { data: AnalyticsData; boardSlug: string }) {
  const [period, setPeriod] = useState<Period>("month");

  const view = useMemo(() => {
    const now = new Date();
    const start = startOfPeriod(period, now, data.completions);
    const completions = data.completions.filter((c) => {
      const t = Date.parse(c.completedAt);
      return t >= start.getTime() && t <= now.getTime();
    });
    const agents = new Map<string, { id: string; name: string; count: number; days: number[] }>();
    for (const c of completions) {
      const id = c.agent?.id ?? "unattributed";
      const entry = agents.get(id) ?? { id, name: c.agent?.name ?? "Unattributed", count: 0, days: [] };
      entry.count += 1;
      if (c.activeDays !== null) entry.days.push(c.activeDays);
      agents.set(id, entry);
    }
    const types = new Map<string, number>();
    for (const c of completions) types.set(c.requestType, (types.get(c.requestType) ?? 0) + 1);
    const withDue = completions.filter((c) => c.onTime !== null);
    return {
      completions,
      agents: [...agents.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      types: [...types].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      trend: buildTrend(completions, period, start, now),
      averageDays: average(completions.flatMap((c) => (c.activeDays === null ? [] : [c.activeDays]))),
      onTimeRate: withDue.length ? Math.round((withDue.filter((c) => c.onTime).length / withDue.length) * 100) : null,
    };
  }, [data.completions, period]);

  const total = view.completions.length;

  return (
    <div className="space-y-6">
      <nav aria-label="Analytics period" className="flex flex-wrap gap-1 rounded-lg border border-line bg-panel p-1 sm:w-fit">
        {PERIODS.map((option) => (
          <button
            aria-pressed={period === option.key}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${period === option.key ? "bg-brand text-white" : "text-muted hover:text-white"}`}
            key={option.key}
            onClick={() => setPeriod(option.key)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </nav>

      <section aria-label="Pipeline summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Completed" note="requests" value={String(total)} />
        <Tile label="Contributors" note="people who closed work" value={String(view.agents.filter((a) => a.id !== "unattributed").length)} />
        <Tile label="Average turnaround" note="excludes On Hold time" value={formatDays(view.averageDays)} />
        <Tile label="On time" note={view.onTimeRate === null ? "no due dates measured" : "adjusted for On Hold"} value={view.onTimeRate === null ? "—" : `${view.onTimeRate}%`} />
      </section>
      <p className="text-xs text-muted">
        On Hold pauses the turnaround and on-time clocks. Completed work still counts toward each person&apos;s total.
      </p>

      <Panel eyebrow="Completion velocity" title="Requests completed over time" aside={String(total)}>
        {total ? <TrendChart buckets={view.trend} /> : <Empty>The trend appears after the first completion.</Empty>}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel eyebrow="Team output" title="Completed by person">
          {view.agents.length ? (
            <RankedBars
              rows={view.agents.map((a) => ({ key: a.id, label: a.name, value: a.count, note: `${formatDays(average(a.days))} avg.` }))}
              unit="completed"
            />
          ) : (
            <Empty>No completions in this period.</Empty>
          )}
        </Panel>
        <Panel eyebrow="Work mix" title="Completed by request type">
          {view.types.length ? (
            <RankedBars rows={view.types.map((t) => ({ key: t.name, label: t.name, value: t.count }))} unit="completed" />
          ) : (
            <Empty>No request types to report yet.</Empty>
          )}
        </Panel>
      </div>

      <Panel eyebrow="Audit trail" title="Recent completions" aside={`${Math.min(12, total)} of ${total}`}>
        {total ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Request</th>
                  <th className="px-3 py-2 font-semibold">Completed by</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Turnaround</th>
                  <th className="py-2 pl-3 text-right font-semibold">Completed</th>
                </tr>
              </thead>
              <tbody>
                {view.completions.slice(0, 12).map((c) => (
                  <tr className="border-t border-line" key={c.id}>
                    <td className="max-w-72 py-2 pr-3">
                      <a className="block hover:underline" href={`/b/${boardSlug}?request=${c.code}`}>
                        <small className="font-mono text-muted">{c.code}</small>
                        <strong className="block truncate text-white" title={c.title}>{c.title}</strong>
                      </a>
                    </td>
                    <td className="px-3 py-2 text-neutral-300">{c.agent?.name ?? "Unattributed"}</td>
                    <td className="px-3 py-2 text-neutral-300">{c.requestType}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-300" title={c.onHoldDays ? `${c.onHoldDays.toFixed(1)} days On Hold excluded` : undefined}>
                      {formatDays(c.activeDays)}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums text-neutral-300">
                      {new Date(c.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No recent completions in this period.</Empty>
        )}
      </Panel>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="card px-4 py-3">
      <small className="text-xs uppercase tracking-wider text-muted">{label}</small>
      <strong className="mt-1 block text-3xl font-black tabular-nums text-white">{value}</strong>
      <em className="text-xs not-italic text-muted">{note}</em>
    </article>
  );
}

function Panel({ eyebrow, title, aside, children }: { eyebrow: string; title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <header className="mb-4 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-brand">{eyebrow}</p>
          <h2 className="text-lg font-bold text-white">{title}</h2>
        </div>
        {aside ? <span className="text-sm tabular-nums text-muted">{aside}</span> : null}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-panel-2 px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

/** Horizontal ranked bars, one hue; values labelled at the end of each bar. */
function RankedBars({ rows, unit }: { rows: { key: string; label: string; value: number; note?: string }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="space-y-3">
      {rows.map((row) => (
        <li className="group" key={row.key} title={`${row.label}: ${row.value} ${unit}${row.note ? ` · ${row.note}` : ""}`}>
          <div className="mb-1 flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-neutral-200">{row.label}</span>
            {row.note ? <small className="text-xs text-muted">{row.note}</small> : null}
            <strong className="w-8 text-right tabular-nums text-white">{row.value}</strong>
          </div>
          <div className="h-2 rounded-full bg-panel-2">
            <div className="h-2 rounded-r-full transition-[filter] group-hover:brightness-125" style={{ width: `${(row.value / max) * 100}%`, background: BRAND }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Line chart with a hover crosshair and tooltip. */
function TrendChart({ buckets }: { buckets: { key: string; label: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 760;
  const height = 220;
  const padX = 28;
  const padTop = 16;
  const padBottom = 28;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const niceMax = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const points = buckets.map((bucket, index) => {
    const x = buckets.length === 1 ? width / 2 : padX + (index / (buckets.length - 1)) * (width - padX * 2);
    const y = height - padBottom - (bucket.count / niceMax) * (height - padTop - padBottom);
    return { ...bucket, x, y };
  });
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const gridValues = Array.from({ length: 5 }, (_, i) => (niceMax / 4) * i).filter((v, i, all) => all.indexOf(v) === i);
  const active = hover === null ? null : points[hover];

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    for (let i = 1; i < points.length; i += 1) if (Math.abs(points[i].x - x) < Math.abs(points[nearest].x - x)) nearest = i;
    setHover(nearest);
  }

  return (
    <div className="relative">
      <svg
        aria-label="Requests completed over time"
        className="w-full touch-none"
        onPointerLeave={() => setHover(null)}
        onPointerMove={onMove}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {gridValues.map((value) => {
          const y = height - padBottom - (value / niceMax) * (height - padTop - padBottom);
          return (
            <g key={value}>
              <line stroke="#262626" strokeWidth="1" x1={padX} x2={width - padX} y1={y} y2={y} />
              <text fill="#8a8a8a" fontSize="11" textAnchor="end" x={padX - 6} y={y + 4}>
                {Number.isInteger(value) ? value : value.toFixed(1)}
              </text>
            </g>
          );
        })}
        <polyline fill="none" points={line} stroke={BRAND} strokeLinejoin="round" strokeWidth="2" />
        {active ? (
          <>
            <line stroke="#666" strokeWidth="1" x1={active.x} x2={active.x} y1={padTop} y2={height - padBottom} />
            <circle cx={active.x} cy={active.y} fill={BRAND} r="5" stroke="#141414" strokeWidth="2" />
          </>
        ) : null}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1]
          .filter((v, i, all) => all.indexOf(v) === i)
          .map((index) => (
            <text
              fill="#8a8a8a"
              fontSize="11"
              key={index}
              textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
              x={points[index].x}
              y={height - 8}
            >
              {points[index].label}
            </text>
          ))}
      </svg>
      {active ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-line bg-ink px-2.5 py-1.5 text-xs shadow-lg"
          role="status"
          style={{ left: `${(active.x / width) * 100}%`, top: `${(active.y / height) * 100}%`, marginTop: -10 }}
        >
          <span className="text-muted">{active.label}</span>
          <strong className="ml-2 tabular-nums text-white">{active.count}</strong>
        </div>
      ) : null}
    </div>
  );
}
