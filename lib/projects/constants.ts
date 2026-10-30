export const PROJECT_STATUSES = [
  { key: "inbox", name: "Inbox" },
  { key: "in_progress", name: "In Progress" },
  { key: "review", name: "Client Review" },
  { key: "on_hold", name: "On Hold" },
  { key: "completed", name: "Completed" },
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["key"];

export const PROJECT_PRIORITIES = [
  { key: "low", name: "Low" },
  { key: "normal", name: "Normal" },
  { key: "high", name: "High" },
  { key: "urgent", name: "Urgent" },
] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number]["key"];

export const PROJECT_TYPES = [
  { key: "video", name: "Video Production" },
  { key: "photo", name: "Photography" },
  { key: "social", name: "Social Media" },
  { key: "web", name: "Web / Digital" },
  { key: "design", name: "Branding / Design" },
  { key: "ads", name: "Paid Advertising" },
  { key: "event", name: "Event" },
  { key: "other", name: "Other" },
] as const;

export const SUBTASK_STATUSES = [
  { key: "not_started", name: "Not started" },
  { key: "working_on_it", name: "Working on it" },
  { key: "stuck", name: "Stuck" },
  { key: "done", name: "Done" },
] as const;
export type SubtaskStatus = (typeof SUBTASK_STATUSES)[number]["key"];

export const EXPENSE_STATUSES = [
  { key: "planned", name: "Planned" },
  { key: "committed", name: "Committed" },
  { key: "paid", name: "Paid" },
  { key: "cancelled", name: "Cancelled" },
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number]["key"];

export function isOneOf<T extends readonly { key: string }[]>(list: T, value: unknown): value is T[number]["key"] {
  return typeof value === "string" && list.some((item) => item.key === value);
}

export function labelFor(list: readonly { key: string; name: string }[], key: string | null | undefined) {
  return list.find((item) => item.key === key)?.name ?? "";
}
