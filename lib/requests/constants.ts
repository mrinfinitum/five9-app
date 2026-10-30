export const REQUEST_STATUSES = [
  { key: "new", name: "Not Started" },
  { key: "waiting", name: "On Hold" },
  { key: "in_progress", name: "In Progress" },
  { key: "creative_review", name: "In Review" },
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

export const BOARD_LOGO_BUCKET = "board-logos";
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES = ["image/svg+xml", "image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** Public URL for a file in the board-logos bucket. */
export function boardLogoUrl(path: string | null | undefined) {
  if (!path) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${BOARD_LOGO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
