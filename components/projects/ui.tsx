"use client";

import { useSyncExternalStore } from "react";
import { Flag } from "lucide-react";
import type { Person } from "@/lib/projects/types";
import type { ProjectPriority, ProjectStatus, SubtaskStatus } from "@/lib/projects/constants";

export const STATUS_ACCENT: Record<ProjectStatus, string> = {
  inbox: "bg-neutral-400",
  in_progress: "bg-brand",
  review: "bg-amber-400",
  on_hold: "bg-sky-400",
  completed: "bg-emerald-500",
};

export const SUBTASK_STYLE: Record<SubtaskStatus, string> = {
  not_started: "bg-neutral-700 text-neutral-200",
  working_on_it: "bg-amber-500/90 text-black",
  stuck: "bg-brand text-white",
  done: "bg-emerald-600 text-white",
};

const PRIORITY_STYLE: Record<ProjectPriority, string> = {
  low: "text-neutral-400",
  normal: "text-neutral-300",
  high: "text-amber-400",
  urgent: "text-brand",
};

export function PriorityFlag({ priority, withLabel = false }: { priority: ProjectPriority; withLabel?: boolean }) {
  const label = priority[0].toUpperCase() + priority.slice(1);
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${PRIORITY_STYLE[priority]}`} title={`${label} priority`}>
      <Flag aria-hidden="true" className="h-3.5 w-3.5" fill={priority === "urgent" || priority === "high" ? "currentColor" : "none"} />
      {withLabel ? label : <span className="sr-only">{label} priority</span>}
    </span>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const AVATAR_TONES = ["bg-brand", "bg-neutral-600", "bg-red-900", "bg-neutral-800 ring-1 ring-brand", "bg-zinc-500"];

function tone(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export function Avatar({ person, size = "sm" }: { person: Person; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-panel ${tone(person.id)} ${size === "sm" ? "h-6 w-6 text-[0.6rem]" : "h-8 w-8 text-xs"}`}
      title={person.name}
    >
      {initials(person.name)}
    </span>
  );
}

export function AvatarStack({ people, max = 3 }: { people: Person[]; max?: number }) {
  if (!people.length) return <span className="text-xs text-neutral-600">Unassigned</span>;
  return (
    <span className="flex -space-x-1.5">
      {people.slice(0, max).map((person) => (
        <Avatar key={person.id} person={person} />
      ))}
      {people.length > max ? (
        <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-panel-2 text-[0.6rem] font-bold text-muted ring-2 ring-panel">
          +{people.length - max}
        </span>
      ) : null}
    </span>
  );
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const moneyExact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(cents: number, exact = false) {
  return (exact ? moneyExact : money).format(cents / 100);
}

export function formatDate(value: string | null) {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function localToday() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const noopSubscribe = () => () => {};

/** Local "YYYY-MM-DD" on the client; null during server render so markup matches. */
export function useToday() {
  return useSyncExternalStore(noopSubscribe, localToday, () => null);
}
