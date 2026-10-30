import "server-only";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/env";

/** Public URL for links in emails: NEXT_PUBLIC_SITE_URL if set, else the current request's host. */
export async function publicOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return siteUrl();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return siteUrl();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
