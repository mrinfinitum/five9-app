import type { MetadataRoute } from "next";

/** Previews and local dev: keep crawlers out entirely (X-Robots-Tag noindex is also sent; see next.config.ts). */
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" } };
}
