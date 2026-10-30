import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets open tabs compare themselves with the deployed version (see VersionWatcher).
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "" },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Board logos are served from Supabase Storage.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },
  async redirects() {
    return [{ source: "/", destination: "/boards", permanent: false }];
  },
};

export default nextConfig;
