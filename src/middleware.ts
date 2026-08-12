import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/shared/supabase/middleware";

/**
 * `/entrar` and `/auth/*` are reachable without a session; everything else
 * behind this matcher requires one (design.md §6, T-014/T-015).
 */
function isPublicPath(pathname: string) {
  return pathname === "/entrar" || pathname.startsWith("/auth/");
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // 303, not the default 307: a POST landing here (e.g. a Server Action submitted with an
  // invalid/expired session) must become a GET on redirect, or the browser replays the POST
  // against `/entrar` — which has no POST handler — and fails with a confusing 405 instead of
  // ever reaching the sign-in screen.
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    return NextResponse.redirect(url, { status: 303 });
  }

  if (user && pathname === "/entrar") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url, { status: 303 });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons|sw\\.js|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)).*)",
  ],
};
