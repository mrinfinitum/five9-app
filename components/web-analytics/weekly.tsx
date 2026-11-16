import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Delta } from "@/components/web-analytics/charts";
import { change, formatDay, formatMetric } from "@/lib/google/format";
import type { MetricFormat } from "@/lib/google/reports";
import type { Insight, Scorecard, WeekTotals, WeeklyChannel } from "@/lib/google/weekly";

const CURRENT = "#e10600";

function AvgDelta({ current, average }: { current: number; average: number | null }) {
  if (average === null) return <span className="text-xs text-muted">no history</span>;
  return <Delta current={current} previous={average} />;
}

/** This week, then last week and the multi-week average, each with its change. */
export function WeeklyScorecards({ cards, averageLabel }: { cards: Scorecard[]; averageLabel: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <article className="card px-4 py-3" key={c.key}>
          <small className="text-xs uppercase tracking-wider text-muted">{c.label}</small>
          <strong className="mt-1 block text-2xl font-black tabular-nums text-white sm:text-3xl">{formatMetric(c.current, c.format, true)}</strong>
          <dl className="mt-1 space-y-0.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <dt className="truncate text-muted">Last week {formatMetric(c.previous, c.format, true)}</dt>
              <dd>
                <Delta current={c.current} previous={c.previous} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="truncate text-muted">
                {averageLabel} {c.average === null ? "–" : formatMetric(c.average, c.format, true)}
              </dt>
              <dd>
                <AvgDelta average={c.average} current={c.current} />
              </dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

const TONES = {
  bad: { icon: CircleAlert, className: "text-red-400", label: "Problem" },
  watch: { icon: TriangleAlert, className: "text-amber-400", label: "Watch" },
  good: { icon: CircleCheck, className: "text-emerald-400", label: "Good" },
  info: { icon: Info, className: "text-sky-400", label: "Note" },
} as const;

export function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <section className="card p-5">
      <h3 className="mb-3 text-base font-bold text-white">What stood out</h3>
      {insights.length ? (
        <ul className="space-y-3">
          {insights.map((insight, i) => {
            const tone = TONES[insight.tone];
            const Icon = tone.icon;
            return (
              <li className="flex gap-3" key={i}>
                <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${tone.className}`} />
                <p className="text-sm text-neutral-300">
                  <span className="sr-only">{tone.label}: </span>
                  <strong className="font-semibold text-white">{insight.title}</strong> {insight.body}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing unusual this week: traffic, engagement and channels are all close to normal.</p>
      )}
    </section>
  );
}

/** Weekly sessions as bars, the reported week in brand red, with the average as a dashed line. */
export function WeeklyTrend({ weeks, average, averageLabel }: { weeks: WeekTotals[]; average: number | null; averageLabel: string }) {
  const width = 760;
  const height = 220;
  const padLeft = 44;
  const padRight = 8;
  const padTop = 14;
  const padBottom = 26;
  const values = weeks.map((w) => w.sessions);
  const max = niceCeil(Math.max(1, ...values, average ?? 0));
  const slot = (width - padLeft - padRight) / weeks.length;
  const barWidth = Math.max(4, slot - 4);
  const y = (v: number) => height - padBottom - (v / max) * (height - padTop - padBottom);
  const grid = [0, 0.5, 1].map((f) => f * max);
  const labelIdx = [0, Math.floor(weeks.length / 2), weeks.length - 1];

  return (
    <section className="card p-5">
      <header className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="min-w-0 flex-1 text-base font-bold text-white">Sessions per week</h3>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className="h-3 w-2 rounded-t-sm" style={{ background: CURRENT }} /> This week
        </span>
        {average !== null ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className="h-0 w-4 border-t-2 border-dashed border-neutral-400" /> {averageLabel} ({formatMetric(Math.round(average), "number")})
          </span>
        ) : null}
      </header>
      <svg aria-label={`Sessions per week for the last ${weeks.length} weeks`} className="w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
        {grid.map((v) => (
          <g key={v}>
            <line stroke="var(--color-line)" strokeWidth="1" x1={padLeft} x2={width - padRight} y1={y(v)} y2={y(v)} />
            <text fill="var(--color-muted)" fontSize="11" textAnchor="end" x={padLeft - 6} y={y(v) + 4}>
              {formatMetric(v, "number", true)}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const last = i === weeks.length - 1;
          const top = y(w.sessions);
          const x = padLeft + i * slot + (slot - barWidth) / 2;
          const h = height - padBottom - top;
          return (
            <g key={w.start}>
              <title>{`Week of ${formatDay(w.start, true)}: ${formatMetric(w.sessions, "number")} sessions`}</title>
              {/* Full-height hit area so thin bars are easy to hover. */}
              <rect fill="transparent" height={height - padTop - padBottom} width={slot} x={padLeft + i * slot} y={padTop} />
              {h > 0 ? (
                <path
                  d={`M${x},${top + Math.min(3, h)} q0,-${Math.min(3, h)} ${Math.min(3, barWidth / 2)},-${Math.min(3, h)} h${barWidth - 2 * Math.min(3, barWidth / 2)} q${Math.min(3, barWidth / 2)},0 ${Math.min(3, barWidth / 2)},${Math.min(3, h)} V${height - padBottom} H${x} Z`}
                  fill={last ? CURRENT : "var(--color-muted)"}
                  opacity={last ? 1 : 0.45}
                />
              ) : null}
            </g>
          );
        })}
        {average !== null ? (
          <line stroke="var(--color-neutral-400)" strokeDasharray="5 4" strokeWidth="1.5" x1={padLeft} x2={width - padRight} y1={y(average)} y2={y(average)} />
        ) : null}
        {labelIdx.map((i) => (
          <text
            fill="var(--color-muted)"
            fontSize="11"
            key={i}
            textAnchor={i === 0 ? "start" : i === weeks.length - 1 ? "end" : "middle"}
            x={i === 0 ? padLeft : i === weeks.length - 1 ? width - padRight : padLeft + i * slot + slot / 2}
            y={height - 8}
          >
            {formatDay(weeks[i].start)}
          </text>
        ))}
      </svg>
    </section>
  );
}

function niceCeil(value: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (steps.find((s) => s * exp >= value) ?? 10) * exp;
}

function Pct({ current, base }: { current: number; base: number | null }) {
  if (base === null) return <span className="text-muted">–</span>;
  const delta = change(current, base);
  if (delta === null) return <span className="text-muted">new</span>;
  const rounded = Math.round(delta * 100);
  if (!rounded) return <span className="text-muted">0%</span>;
  return <span className={rounded > 0 ? "text-emerald-400" : "text-red-400"}>{`${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%`}</span>;
}

export function ChannelTable({ channels, averageLabel }: { channels: WeeklyChannel[]; averageLabel: string }) {
  const shown = channels.filter((c) => c.current || (c.average ?? 0) >= 1);
  const num = (v: number, format: MetricFormat = "number") => formatMetric(v, format, true);
  return (
    <section className="card min-w-0 p-5">
      <h3 className="mb-3 text-base font-bold text-white">Traffic by channel</h3>
      {shown.length ? (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-[0.65rem] uppercase tracking-wider text-muted">
                <th className="pb-2 font-semibold" scope="col">Channel</th>
                <th className="pb-2 text-right font-semibold" scope="col">Sessions</th>
                <th className="pb-2 text-right font-semibold" scope="col">vs last week</th>
                <th className="pb-2 text-right font-semibold" scope="col">{averageLabel}</th>
                <th className="pb-2 text-right font-semibold" scope="col">vs avg</th>
                <th className="pb-2 text-right font-semibold" scope="col">Engaged</th>
                <th className="pb-2 text-right font-semibold" scope="col">Avg. visit</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {shown.map((c) => (
                <tr className="border-t border-line" key={c.name}>
                  <th className="py-2 pr-3 text-left font-normal text-neutral-200" scope="row">{c.name}</th>
                  <td className="py-2 text-right font-semibold text-white">{num(c.current)}</td>
                  <td className="py-2 text-right text-xs">
                    <Pct base={c.previous} current={c.current} />
                  </td>
                  <td className="py-2 text-right text-muted">{c.average === null ? "–" : num(Math.round(c.average))}</td>
                  <td className="py-2 text-right text-xs">
                    <Pct base={c.average === null ? null : Math.round(c.average)} current={c.current} />
                  </td>
                  <td className="py-2 text-right text-muted">{c.current ? num(c.engagementRate, "percent") : "–"}</td>
                  <td className="py-2 text-right text-muted">{c.current ? num(c.averageDuration, "duration") : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg bg-panel-2 px-4 py-6 text-center text-sm text-muted">No traffic this week.</p>
      )}
    </section>
  );
}
