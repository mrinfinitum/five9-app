"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useState } from "react";
import { change, formatDay, formatMetric } from "@/lib/google/format";
import type { MetricFormat, Row, Total, Trend } from "@/lib/google/reports";

const CURRENT = "#e10600";
const PREVIOUS = "var(--color-muted)";

/** ▲ 12.4% / ▼ 3.1%, green when it moved the good way. */
export function Delta({ current, previous, lowerIsBetter }: { current: number; previous: number; lowerIsBetter?: boolean }) {
  const delta = change(current, previous);
  if (delta === null) return <span className="text-xs text-muted">new</span>;
  if (Math.abs(delta) < 0.0005) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted">
        <Minus className="h-3 w-3" /> 0%
      </span>
    );
  }
  const up = delta > 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${good ? "text-emerald-400" : "text-red-400"}`}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span className="sr-only">{up ? "Up" : "Down"}</span>
      {Math.abs(delta * 100).toFixed(Math.abs(delta) < 0.1 ? 1 : 0)}%
    </span>
  );
}

export function TotalTiles({ totals }: { totals: Total[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {totals.map((t) => (
        <article className="card px-4 py-3" key={t.key}>
          <small className="text-xs uppercase tracking-wider text-muted">{t.label}</small>
          <strong className="mt-1 block text-2xl font-black tabular-nums text-white sm:text-3xl">{formatMetric(t.current, t.format, true)}</strong>
          <div className="mt-0.5 flex items-center gap-2">
            <Delta current={t.current} lowerIsBetter={t.lowerIsBetter} previous={t.previous} />
            <span className="truncate text-xs text-muted">vs {formatMetric(t.previous, t.format, true)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

/** Daily line for this period over the previous one, with a metric switcher and hover readout. */
export function TrendPanel({ trend, title }: { trend: Trend; title: string }) {
  const [metricKey, setMetricKey] = useState(trend.series[0]?.key);
  const series = trend.series.find((s) => s.key === metricKey) ?? trend.series[0];
  const [hover, setHover] = useState<number | null>(null);
  if (!series) return null;

  const width = 760;
  const height = 230;
  const padLeft = 44;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 28;
  const n = series.current.length;
  const max = Math.max(...series.current, ...series.previous, 0);
  const niceMax = niceCeil(max || 1);
  const x = (i: number) => (n === 1 ? (padLeft + width - padRight) / 2 : padLeft + (i / (n - 1)) * (width - padLeft - padRight));
  const y = (v: number) => height - padBottom - (v / niceMax) * (height - padTop - padBottom);
  const path = (values: number[]) => values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);
  const longRange = n > 120;
  const labelIdx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - padLeft) / (width - padLeft - padRight)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <section className="card p-5">
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="min-w-0 flex-1 text-base font-bold text-white">{title}</h3>
        <div aria-label="Metric" className="flex flex-wrap gap-1 rounded-lg bg-panel-2 p-1" role="tablist">
          {trend.series.map((s) => (
            <button
              aria-selected={s.key === series.key}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${s.key === series.key ? "bg-panel text-white shadow" : "text-muted hover:text-white"}`}
              key={s.key}
              onClick={() => setMetricKey(s.key)}
              role="tab"
              type="button"
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: CURRENT }} /> This period
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: PREVIOUS }} /> Previous period
        </span>
      </div>
      <div className="relative">
        <svg
          aria-label={`${series.label} per day, this period compared with the previous period`}
          className="w-full touch-none"
          onPointerLeave={() => setHover(null)}
          onPointerMove={onMove}
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          {grid.map((v) => (
            <g key={v}>
              <line stroke="var(--color-line)" strokeWidth="1" x1={padLeft} x2={width - padRight} y1={y(v)} y2={y(v)} />
              <text fill="var(--color-muted)" fontSize="11" textAnchor="end" x={padLeft - 6} y={y(v) + 4}>
                {formatMetric(v, series.format, true)}
              </text>
            </g>
          ))}
          <path d={path(series.previous)} fill="none" stroke={PREVIOUS} strokeDasharray="4 4" strokeLinejoin="round" strokeWidth="1.5" />
          <path d={path(series.current)} fill="none" stroke={CURRENT} strokeLinejoin="round" strokeWidth="2" />
          {hover !== null ? (
            <>
              <line stroke="var(--color-muted)" strokeWidth="1" x1={x(hover)} x2={x(hover)} y1={padTop} y2={height - padBottom} />
              <circle cx={x(hover)} cy={y(series.previous[hover])} fill="var(--color-panel)" r="4" stroke={PREVIOUS} strokeWidth="2" />
              <circle cx={x(hover)} cy={y(series.current[hover])} fill={CURRENT} r="5" stroke="var(--color-panel)" strokeWidth="2" />
            </>
          ) : null}
          {labelIdx.map((i) => (
            <text
              fill="var(--color-muted)"
              fontSize="11"
              key={i}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              x={x(i)}
              y={height - 8}
            >
              {formatDay(trend.dates[i], longRange)}
            </text>
          ))}
        </svg>
        {hover !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-md border border-line bg-ink px-3 py-2 text-xs shadow-lg"
            role="status"
            style={{ left: `${(x(hover) / width) * 100}%`, transform: `translateX(${hover > n / 2 ? "calc(-100% - 12px)" : "12px"})` }}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted">{formatDay(trend.dates[hover], longRange)}</span>
              <strong className="tabular-nums text-white">{formatMetric(series.current[hover], series.format)}</strong>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-4">
              <span className="text-muted">{formatDay(trend.previousDates[hover], longRange)}</span>
              <span className="tabular-nums text-neutral-300">{formatMetric(series.previous[hover], series.format)}</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function niceCeil(value: number) {
  if (value <= 0.0001) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (steps.find((s) => s * exp >= value) ?? 10) * exp;
}

/** Top-N list: a label, a thin bar for share of the leader, and the value (plus optional detail columns). */
export function RankedList({
  title,
  rows,
  unit,
  format = "number",
  empty = "No data for this period.",
  linkUrls = false,
}: {
  title: string;
  rows: Row[];
  unit: string;
  format?: MetricFormat;
  empty?: string;
  /** Make labels that are full web addresses (e.g. Search Console pages) clickable. */
  linkUrls?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const columns = rows[0]?.cells?.map((c) => c.label) ?? [];
  return (
    <section className="card min-w-0 p-5">
      <header className="mb-3 flex items-baseline gap-2">
        <h3 className="min-w-0 flex-1 text-base font-bold text-white">{title}</h3>
        <span className="text-xs uppercase tracking-wider text-muted">{unit}</span>
      </header>
      {rows.length ? (
        <>
          {columns.length ? (
            <div className="mb-1 hidden justify-end gap-4 pr-0.5 text-[0.65rem] uppercase tracking-wider text-muted sm:flex">
              {columns.map((c) => (
                <span className="w-16 text-right" key={c}>{c}</span>
              ))}
              <span className="w-14 text-right">{unit}</span>
            </div>
          ) : null}
          <ol className="space-y-2.5">
            {rows.map((row) => {
              const href = linkUrls && /^https?:\/\//.test(row.key) ? row.key : null;
              return (
                <li className="group" key={row.key} title={`${row.label}: ${formatMetric(row.value, format)} ${unit}`}>
                  <div className="flex items-baseline gap-4 text-sm">
                    {href ? (
                      <a className="min-w-0 flex-1 truncate text-neutral-200 hover:text-white hover:underline" href={href} rel="noopener noreferrer" target="_blank">
                        {row.label}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-neutral-200">{row.label}</span>
                    )}
                    {row.cells?.map((c) => (
                      <span className="hidden w-16 text-right text-xs tabular-nums text-muted sm:inline" key={c.label}>
                        {formatMetric(c.value, c.format, true)}
                      </span>
                    ))}
                    <strong className="w-14 text-right tabular-nums text-white">{formatMetric(row.value, format, true)}</strong>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-panel-2">
                    <div className="h-1.5 rounded-r-full transition-[filter] group-hover:brightness-125" style={{ width: `${(row.value / max) * 100}%`, background: CURRENT }} />
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="rounded-lg bg-panel-2 px-4 py-6 text-center text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}
