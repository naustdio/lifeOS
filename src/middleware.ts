import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Sub-slice 1A ships only the matcher shape and a pass-through — the
 * exclusions are needed now so the service worker and manifest are never
 * gated (design.md §6, T-008). Real session-refresh logic (`@supabase/ssr`
 * `getUser()`, cookie propagation) lands in sub-slice 1B (T-014).
 */
export function middleware(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons|sw\\.js|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)).*)",
  ],
};
