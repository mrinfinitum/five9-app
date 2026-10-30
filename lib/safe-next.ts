/** Only allow same-site relative redirects. */
export function safeNext(value: string | null | undefined, fallback = "/projects") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
