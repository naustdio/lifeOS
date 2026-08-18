/**
 * Longest-prefix active-route resolver (change: tablet-web-sidebar-layout,
 * design.md decision 3). Pure function — no route data, no React, no
 * `usePathname` — callers own the pathname source. A `href` matches when
 * the pathname equals it exactly or is nested under it (`href + "/"`
 * prefix). When multiple hrefs match, the longest (most specific) one wins.
 */
export function resolveActiveHref(
  pathname: string,
  hrefs: readonly string[],
): string | null {
  let best: string | null = null;

  for (const href of hrefs) {
    const isMatch = pathname === href || pathname.startsWith(`${href}/`);
    if (isMatch && (best === null || href.length > best.length)) {
      best = href;
    }
  }

  return best;
}
