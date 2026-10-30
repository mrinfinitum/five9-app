export const REQUEST_STATUSES = [
  { key: "new", name: "Inbox" },
  { key: "waiting", name: "On Hold" },
  { key: "in_progress", name: "In Progress" },
  { key: "creative_review", name: "Creative Review" },
  { key: "completed", name: "Completed" },
  { key: "cancelled", name: "Cancelled" },
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number]["key"];

export const REQUEST_PRIORITIES = [
  { key: "low", name: "Low" },
  { key: "normal", name: "Normal" },
  { key: "high", name: "High" },
  { key: "urgent", name: "Urgent" },
] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number]["key"];

/** Urgent is set by the team, not chosen when submitting. */
export const SUBMIT_PRIORITIES = REQUEST_PRIORITIES.filter((p) => p.key !== "urgent");

/** Progress shown to requesters on their own requests. */
export const STATUS_PROGRESS: Record<RequestStatus, number> = {
  new: 15,
  waiting: 35,
  in_progress: 55,
  creative_review: 80,
  completed: 100,
  cancelled: 100,
};

export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const ATTACHMENT_BUCKET = "request-files";

export function isOneOf<T extends readonly { key: string }[]>(list: T, value: unknown): value is T[number]["key"] {
  return typeof value === "string" && list.some((item) => item.key === value);
}

export function statusName(key: string) {
  return REQUEST_STATUSES.find((s) => s.key === key)?.name ?? key;
}

export function priorityName(key: string) {
  return REQUEST_PRIORITIES.find((p) => p.key === key)?.name ?? key;
}

export function isClosedStatus(status: string) {
  return status === "completed" || status === "cancelled";
}

/** On Hold, Completed and Cancelled pause the due-date clock. */
export function isClockRunning(status: string) {
  return status !== "waiting" && status !== "completed" && status !== "cancelled";
}

export function requestCode(number: number) {
  return `F9-${number}`;
}
