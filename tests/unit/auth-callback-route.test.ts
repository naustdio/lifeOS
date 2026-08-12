import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/shared/supabase/server", () => ({ createClient }));

import { GET } from "@/app/auth/callback/route";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project-ref.supabase.co/private/path?token=never-log";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  });

  it.each([
    ["PKCE code verifier not found", "missing_verifier"],
    ["flow state already used", "expired_or_used_code"],
    ["flow state expired", "expired_or_used_code"],
    ["Invalid API key", "invalid_api_key"],
    ["sensitive provider details code=secret-code@example.com", "unknown"],
  ])("redirects and logs only the %s failure category", async (message, category) => {
    const error = { message };
    createClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          error,
        }),
      },
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new Request("https://lifeos.example/auth/callback?code=secret-code"));

    expect(response.headers.get("location")).toBe(
      `https://lifeos.example/entrar?error=auth&reason=${category}`,
    );
    expect(errorSpy).toHaveBeenCalledWith("oauth_code_exchange_failed", {
      category,
      supabaseUrlHost: "project-ref.supabase.co",
      supabasePublishableKeySha256Prefix: "4a590a9731df",
    });
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining(message), expect.anything());
  });

  it("bootstraps and redirects successfully after a code exchange", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    createClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
      schema: vi.fn().mockReturnValue({ rpc }),
    });

    const response = await GET(
      new Request("https://lifeos.example/auth/callback?code=valid-code&next=/finanzas"),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(rpc).toHaveBeenCalledWith("bootstrap_user");
    expect(response.headers.get("location")).toBe("https://lifeos.example/finanzas");
  });

  // A silently-ignored bootstrap failure used to land the user on `next` fully signed in but
  // with no personal space, surfacing later as the unrelated "No tienes acceso a este espacio."
  // on the first write — this locks in that the callback now stops and reports it instead.
  it("does not redirect to `next` and logs the failure when bootstrap_user errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "permission denied", code: "42501" } });
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    createClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
      schema: vi.fn().mockReturnValue({ rpc }),
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(
      new Request("https://lifeos.example/auth/callback?code=valid-code&next=/finanzas"),
    );

    expect(response.headers.get("location")).toBe(
      "https://lifeos.example/entrar?error=auth&reason=bootstrap_failed",
    );
    expect(errorSpy).toHaveBeenCalledWith("bootstrap_user_failed", {
      message: "permission denied",
      code: "42501",
      supabaseUrlHost: "project-ref.supabase.co",
      supabasePublishableKeySha256Prefix: "4a590a9731df",
    });
  });
});
