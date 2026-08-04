import type { MetadataRoute } from "next";
import { MANIFEST_COLORS } from "@/design-system/tokens/manifest-colors";

/**
 * Serves `/manifest.webmanifest` (design.md §8). PWA shell only — NOT wired
 * for offline data sync or push (proposal: out of scope/deferred).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LifeOS",
    short_name: "LifeOS",
    description: "Tu vida financiera y personal en un solo lugar.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: MANIFEST_COLORS.light,
    theme_color: MANIFEST_COLORS.dark,
    lang: "es-MX",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
