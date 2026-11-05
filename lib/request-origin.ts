import "server-only";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/env";

/**
 * Public URL for links in emails: NEXT_PUBLIC_SITE_URL if set, else the
 * current request's host. On Vercel the Host header is never trusted: email
 * links carry one-time sign-in tokens, so a spoofed host could send them to an
 * attacker's site. Production uses its production URL, previews their own.
 */
export async function publicOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return siteUrl();
  if (process.env.VERCEL) {
    if (process.env.VERCEL_ENV !== "production") {
      const preview = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
      if (preview) return `https://${preview}`;
    }
    return siteUrl();
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return siteUrl();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
