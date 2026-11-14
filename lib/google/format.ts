import type { MetricFormat } from "./reports";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const money = new Map<string, Intl.NumberFormat>();
/** Money: compact past 10k when short ("$26.7K"), whole units when short ("$900"), else cents ("$899.50"). */
function formatMoney(value: number, code: string, short: boolean) {
  const mode = short ? (Math.abs(value) >= 10_000 ? "compact" : "whole") : "exact";
  const key = `${code}:${mode}`;
  let f = money.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
        ...(mode === "compact" ? { notation: "compact", maximumFractionDigits: 1 } : mode === "whole" ? { maximumFractionDigits: 0 } : {}),
      });
    } catch {
      f = new Intl.NumberFormat("en-US", { maximumFractionDigits: mode === "exact" ? 2 : 0 });
    }
    money.set(key, f);
  }
  return f.format(value);
}

export function formatMetric(value: number, format: MetricFormat, short = false) {
  if (format.startsWith("currency:")) return formatMoney(value, format.slice(9) || "USD", short);
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
