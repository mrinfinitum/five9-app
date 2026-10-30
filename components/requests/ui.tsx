"use client";

import { ChevronUp, ChevronsUp } from "lucide-react";
import { useSyncExternalStore } from "react";
import { isClockRunning, type RequestPriority, type RequestStatus } from "@/lib/requests/constants";
import type { Person, RequestItem } from "@/lib/requests/types";

export const STATUS_DOT: Record<RequestStatus, string> = {
  new: "bg-neutral-400",
  waiting: "bg-sky-400",
  in_progress: "bg-brand",
  creative_review: "bg-amber-400",
  completed: "bg-emerald-500",
  cancelled: "bg-neutral-600",
};

export const STATUS_CHIP: Record<RequestStatus, string> = {
  new: "bg-neutral-700 text-neutral-100",
  waiting: "bg-sky-900/70 text-sky-200",
  in_progress: "bg-brand/25 text-red-100 ring-1 ring-brand/50",
  creative_review: "bg-amber-900/60 text-amber-200",
  completed: "bg-emerald-900/60 text-emerald-200",
  cancelled: "bg-neutral-800 text-neutral-400",
};

export const PRIORITY_CHIP: Record<RequestPriority, string> = {
  low: "bg-neutral-800 text-neutral-400",
  normal: "bg-neutral-700 text-neutral-200",
  high: "bg-amber-900/60 text-amber-200",
  urgent: "bg-brand text-on-brand",
};

export function PriorityLabel({ priority, name }: { priority: RequestPriority; name: string }) {
  const Icon = priority === "urgent" ? ChevronsUp : priority === "high" ? ChevronUp : null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Icon ? <Icon aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      {name}
    </span>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const AVATAR_TONES = [
  "bg-brand text-on-brand",
  "bg-neutral-600 text-white",
  "bg-red-900 text-white",
  "bg-zinc-500 text-white",
  "bg-neutral-800 text-white ring-1 ring-brand",
];

function tone(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export function Avatar({ person, size = "sm" }: { person: Pick<Person, "id" | "name">; size?: "xs" | "sm" | "md" | "lg" }) {
  const sizes = { xs: "h-5 w-5 text-[0.55rem]", sm: "h-6 w-6 text-[0.6rem]", md: "h-8 w-8 text-xs", lg: "h-11 w-11 text-sm" };
  return (
    <span className={`inline-grid shrink-0 place-items-center rounded-full font-bold ring-2 ring-panel ${tone(person.id)} ${sizes[size]}`} title={person.name}>
      {initials(person.name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4 }: { people: Person[]; max?: number }) {
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

export function formatDate(value: string | null) {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function localToday() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const noopSubscribe = () => () => {};

/** Local "YYYY-MM-DD" in the browser; null during server render so markup matches. */
export function useToday() {
  return useSyncExternalStore(noopSubscribe, localToday, () => null);
}

/** "overdue" | "soon" (within 3 days) | null. On Hold and closed requests aren't on the clock. */
export function dueState(request: Pick<RequestItem, "dueDate" | "status">, today: string | null) {
  if (!today || !request.dueDate || !isClockRunning(request.status)) return null;
  if (request.dueDate < today) return "overdue";
  const due = new Date(`${request.dueDate}T00:00:00`).getTime();
  const now = new Date(`${today}T00:00:00`).getTime();
  return due - now <= 3 * 86_400_000 ? "soon" : null;
}

export const DUE_TEXT = { overdue: "text-brand font-semibold", soon: "text-amber-300 font-semibold" } as const;
