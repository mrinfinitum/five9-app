import type { MetricFormat } from "./reports";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatMetric(value: number, format: MetricFormat, short = false) {
  switch (format) {
    case "percent":
      return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
    case "decimal":
      return value.toFixed(1);
    case "duration": {
      const seconds = Math.round(value);
      return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
    }
    default:
      return short && Math.abs(value) >= 10_000 ? compact.format(value) : whole.format(value);
  }
}

/** Relative change, or null when there's nothing to compare against. */
export function change(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return (current - previous) / previous;
}

export function formatDay(day: string, withYear = false) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}
