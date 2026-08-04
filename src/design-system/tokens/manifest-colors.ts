/**
 * The Web App Manifest (`src/app/manifest.ts`) and the `<meta
 * name="theme-color">` tags Next's Viewport API generates (`src/app/layout.tsx`)
 * are both static values that CANNOT consume a CSS custom property — they
 * are evaluated outside any stylesheet. This is therefore the ONE sanctioned
 * place hex literals may live outside `tokens/*.css`, and it lives inside
 * `tokens/` specifically so `scripts/check-tokens.mjs`'s directory-based
 * exemption still covers it without a special case in the script itself.
 *
 * These values MUST stay in sync with `--background`/`--neutral-050` (light)
 * and `--ink-950` (dark) in `tokens/semantic.css` and `tokens/primitives.css`.
 */
export const MANIFEST_COLORS = {
  light: "#F0F0F0",
  dark: "#111111",
} as const;
