"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { REQUEST_STATUSES, isClockRunning } from "@/lib/requests/constants";
import type { OverallAnalytics } from "@/lib/requests/analytics";
import {
  Empty,
  PERIODS,
  Panel,
  RankedBars,
  Tile,
  TrendChart,
  average,
  buildTrend,
  formatDays,
  startOfPeriod,
  type Period,
} from "./requests/analytics";

/** Analytics across every board, filterable by board, request type, person, and period. Admin only. */
export function AdminAnalytics({ data }: { data: OverallAnalytics }) {
  const [period, setPeriod] = useState<Period>("month");
  const [boardId, setBoardId] = useState("all");
  const [typeKey, setTypeKey] = useState("all");
  const [personId, setPersonId] = useState("all");
  const filtered = boardId !== "all" || typeKey !== "all" || personId !== "all";

  const view = useMemo(() => {
    const now = new Date();
    const matchesFilters = (item: { boardId: string; typeKey: string | null; assigneeIds: string[] }, agentId?: string | null) =>
      (boardId === "all" || item.boardId === boardId) &&
      (typeKey === "all" || item.typeKey === typeKey) &&
      (personId === "all" || item.assigneeIds.includes(personId) || agentId === personId);

    const scoped = data.completions.filter((c) => matchesFilters(c, c.agent?.id));
    const start = startOfPeriod(period, now, scoped);
    const completions = scoped.filter((c) => {
      const t = Date.parse(c.completedAt);
      return t >= start.getTime() && t <= now.getTime();
    });

    const count = <T,>(items: T[], key: (item: T) => { id: string; label: string }) => {
      const map = new Map<string, { key: string; label: string; value: number }>();
      for (const item of items) {
        const { id, label } = key(item);
        const entry = map.get(id) ?? { key: id, label, value: 0 };
        entry.value += 1;
        map.set(id, entry);
      }
      return [...map.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    };

    const people = new Map<string, { key: string; label: string; value: number; days: number[] }>();
    for (const c of completions) {
      const id = c.agent?.id ?? "unattributed";
      const entry = people.get(id) ?? { key: id, label: c.agent?.name ?? "Unattributed", value: 0, days: [] };
      entry.value += 1;
      if (c.activeDays !== null) entry.days.push(c.activeDays);
      people.set(id, entry);
    }

    // Open work is a snapshot of right now (not limited by period).
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const open = data.open.filter((o) => matchesFilters(o));
    const overdue = open.filter((o) => o.dueDate && isClockRunning(o.status) && o.dueDate < todayKey).length;

    const ratings = data.ratings.filter(
      (r) => (boardId === "all" || r.boardId === boardId) && Date.parse(r.respondedAt) >= start.getTime(),
    );
    const withDue = completions.filter((c) => c.onTime !== null);

    return {
      completions,
      trend: buildTrend(completions, period, start, now),
      byBoard: count(completions, (c) => ({ id: c.boardId, label: c.boardName })),
      byType: count(completions, (c) => ({ id: c.typeKey ?? "other", label: c.requestType })),
      byPerson: [...people.values()]
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
        .map((p) => ({ key: p.key, label: p.label, value: p.value, note: `${formatDays(average(p.days))} avg.` })),
      averageDays: average(completions.flatMap((c) => (c.activeDays === null ? [] : [c.activeDays]))),
      onTimeRate: withDue.length ? Math.round((withDue.filter((c) => c.onTime).length / withDue.length) * 100) : null,
      openCount: open.length,
      overdue,
      openByStatus: REQUEST_STATUSES.filter((s) => s.key !== "completed" && s.key !== "cancelled").map((s) => ({
        key: s.key,
        label: s.name,
        value: open.filter((o) => o.status === s.key).length,
      })),
      happiness: ratings.length ? average(ratings.map((r) => r.rating)) : null,
      ratingsCount: ratings.length,
    };
  }, [data, period, boardId, typeKey, personId]);

  const total = view.completions.length;
  const boardName = (id: string) => data.boards.find((b) => b.id === id)?.name ?? "";

  return (
    <div className="space-y-6">
      {/* Filters */}
      <section aria-label="Filters" className="card flex flex-wrap items-end gap-3 p-4">
        <Filter label="Board" onChange={setBoardId} value={boardId}>
          <option value="all">All boards</option>
          {data.boards.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Filter>
        <Filter label="Request type" onChange={setTypeKey} value={typeKey}>
          <option value="all">All types</option>
          {data.types.map((t) => (
            <option key={t.key} value={t.key}>{t.name}</option>
          ))}
        </Filter>
        <Filter label="Person" onChange={setPersonId} value={personId}>
          <option value="all">Everyone</option>
          {data.people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Filter>
        {filtered ? (
          <button
            className="btn-ghost"
            onClick={() => {
              setBoardId("all");
              setTypeKey("all");
              setPersonId("all");
            }}
            type="button"
          >
            <X className="h-4 w-4" /> Clear
          </button>
        ) : null}
        <nav aria-label="Period" className="flex flex-wrap gap-1 rounded-lg border border-line bg-panel-2 p-1 sm:ml-auto">
          {PERIODS.map((option) => (
            <button
              aria-pressed={period === option.key}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${period === option.key ? "bg-brand text-on-brand" : "text-muted hover:text-white"}`}
              key={option.key}
              onClick={() => setPeriod(option.key)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </nav>
      </section>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Tile label="Completed" note={PERIODS.find((p) => p.key === period)!.label.toLowerCase()} value={String(total)} />
        <Tile label="Avg. turnaround" note="excludes On Hold" value={formatDays(view.averageDays)} />
        <Tile label="On time" note={view.onTimeRate === null ? "no due dates" : "of those with due dates"} value={view.onTimeRate === null ? "—" : `${view.onTimeRate}%`} />
        <Tile label="Open now" note="not completed" value={String(view.openCount)} />
        <Tile label="Overdue now" note="past due, on the clock" value={String(view.overdue)} />
        <Tile
          label="Happiness"
          note={`${view.ratingsCount} rating${view.ratingsCount === 1 ? "" : "s"}`}
          value={view.happiness === null ? "—" : `${view.happiness.toFixed(1)}/5`}
        />
      </section>

      <Panel aside={String(total)} eyebrow="Completion velocity" title="Requests completed over time">
        {total ? <TrendChart buckets={view.trend} /> : <Empty>No completions match these filters in this period.</Empty>}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel eyebrow="Clients" title="Completed by board">
          {view.byBoard.length ? <RankedBars rows={view.byBoard} unit="completed" /> : <Empty>Nothing yet.</Empty>}
        </Panel>
        <Panel eyebrow="Team output" title="Completed by person">
          {view.byPerson.length ? <RankedBars rows={view.byPerson} unit="completed" /> : <Empty>Nothing yet.</Empty>}
        </Panel>
        <Panel eyebrow="Work mix" title="Completed by type">
          {view.byType.length ? <RankedBars rows={view.byType} unit="completed" /> : <Empty>Nothing yet.</Empty>}
        </Panel>
      </div>

      <Panel aside={`${view.openCount} open`} eyebrow="Right now" title="Open work by status">
        {view.openCount ? <RankedBars rows={view.openByStatus} unit="open" /> : <Empty>No open requests match these filters.</Empty>}
      </Panel>

      <Panel aside={`${Math.min(15, total)} of ${total}`} eyebrow="Audit trail" title="Recent completions">
        {total ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Request</th>
                  <th className="px-3 py-2 font-semibold">Board</th>
                  <th className="px-3 py-2 font-semibold">Completed by</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Turnaround</th>
                  <th className="py-2 pl-3 text-right font-semibold">Completed</th>
                </tr>
              </thead>
              <tbody>
                {view.completions.slice(0, 15).map((c) => (
                  <tr className="border-t border-line" key={c.id}>
                    <td className="max-w-72 py-2 pr-3">
                      <a className="block hover:underline" href={`/b/${c.boardSlug}?request=${c.code}`}>
                        <small className="font-mono text-muted">{c.code}</small>
                        <strong className="block truncate text-white" title={c.title}>{c.title}</strong>
                      </a>
                    </td>
                    <td className="px-3 py-2 text-neutral-300">{boardName(c.boardId)}</td>
                    <td className="px-3 py-2 text-neutral-300">{c.agent?.name ?? "Unattributed"}</td>
                    <td className="px-3 py-2 text-neutral-300">{c.requestType}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-300">{formatDays(c.activeDays)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-neutral-300">
                      {new Date(c.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No completions match these filters in this period.</Empty>
        )}
      </Panel>
      <p className="text-xs text-muted">On Hold pauses the turnaround and on-time clocks. “Open now” and “Overdue now” ignore the period filter.</p>
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-40 flex-1 sm:flex-none">
      <span className="label">{label}</span>
      <select className="field sm:w-48" onChange={(e) => onChange(e.target.value)} value={value}>
        {children}
      </select>
    </label>
  );
}
