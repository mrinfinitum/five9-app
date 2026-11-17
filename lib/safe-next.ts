/**
 * Only allow same-site relative redirects. Parsed with the URL parser rather
 * than prefix checks, because browsers strip tabs and newlines and treat "\"
 * like "/", so values like "/\t/evil.com" would otherwise become "//evil.com".
 */
export function safeNext(value: string | null | undefined, fallback = "/boards") {
  if (!value || !value.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  try {
    const base = "https://same-site.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
