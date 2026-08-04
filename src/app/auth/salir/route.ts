import { NextResponse } from "next/server";
import { createClient } from "@/shared/supabase/server";

/** Sign-out (design.md §6, T-015). POST-only — a plain link/GET would let a
 * prefetch or crawler sign a user out unintentionally. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/entrar", request.url));
}
