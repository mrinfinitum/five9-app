import type { MetadataRoute } from "next";

/** Lets Android "Add to Home screen" use the full Five9 logo (tabs keep the compact red 9). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Five9 Media",
    short_name: "Five9",
    start_url: "/boards",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [{ src: "/icon-full-512.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
