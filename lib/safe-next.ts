/** Only allow same-site relative redirects. */
export function safeNext(value: string | null | undefined, fallback = "/boards") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
