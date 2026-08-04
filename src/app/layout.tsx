import type { Metadata, Viewport } from "next";
import type * as React from "react";
import { ThemeProvider } from "@/design-system/theme-provider";
import { MANIFEST_COLORS } from "@/design-system/tokens/manifest-colors";
import { ServiceWorkerRegistration } from "./service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "LifeOS",
  description: "LifeOS — tu vida financiera y personal en un solo lugar.",
  manifest: "/manifest.webmanifest",
};

// Two `theme-color` meta tags (light/dark) keep the mobile browser chrome in
// sync with the active theme — the manifest's single static `theme_color`
// cannot do that alone (design.md §7).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: MANIFEST_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: MANIFEST_COLORS.dark },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
          <ServiceWorkerRegistration />
        </ThemeProvider>
      </body>
    </html>
  );
}
