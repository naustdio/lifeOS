// @vitest-environment node
//
// health-tracking Phase 3 — round-trip + RLS test for `health/data`'s repositories against the
// real local Supabase stack (same real-round-trip pattern as `tests/integration/finance-facade.test.ts`
// / `tests/integration/finance-health-recurring.test.ts`, per this repo's own convention that a
// repository's DB-round-trip and RLS behavior belongs under `tests/integration/`, not
// `tests/unit/` — `tests/unit/` here is reserved for pure domain logic and RTL renders (see e.g.
// `tests/unit/health-domain.test.ts`, `tests/unit/finance-recurring-domain.test.ts`).
//
// DEVIATION FROM tasks.md's literal path (`tests/unit/health-repository.test.ts`), documented in
// apply-progress: this test does NOT assert "costed event posts via origin_module='health'" /
// "retry idempotent" / "bounded auto-deactivates" — those behaviors require the Finance-posting
// composition that design.md Decision 5 places at the `app` Server Action layer (`health/api`
// structurally cannot import `finance/api` — no `module-api` -> `module-api` ESLint allowance
// exists), which is Phase 4 scope (`salud/actions.ts`), not this phase's `data`/`domain`/`api`
// scaffold. What IS this phase's own critical-logic surface — the RLS privacy boundary
// (spec `health-privacy`) and the `events_cost_all_or_none`/private-account trigger this
// repository's inserts run through — is covered here instead.

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));

// `financeApi.createAccount` is an api-layer RPC wrapper that resolves its own client via the
// internal `client()` helper (backed by `@/shared/supabase/server`'s `createClient()`), unlike
// the data-layer functions used elsewhere in this file that take a client explicitly — same mock
// shape `tests/integration/finance-health-recurring.test.ts` already establishes.
let activeClient: SupabaseClient;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const healthApi = await import("@/modules/health/api");
const financeApi = await import("@/modules/finance/api");

async function bootstrapSpace(session: TestSession): Promise<{ householdId: string; accountId: string; categoryId: string }> {
  activeClient = session.client;
  const { error: bootstrapErr } = await session.client.schema("app").rpc("bootstrap_user");
  if (bootstrapErr) {
    throw new Error(`app.bootstrap_user() failed for ${session.email}: ${bootstrapErr.message}`);
  }

  const { data: household, error: hhErr } = await session.client
    .schema("core")
    .from("households")
    .select("id")
    .eq("personal_owner_user_id", session.userId)
    .single();
  if (hhErr || !household) {
    throw new Error(`could not resolve bootstrapped household for ${session.email}: ${hhErr?.message}`);
  }

  const { data: category, error: catErr } = await session.client
    .schema("finance")
    .from("categories")
    .select("id")
    .eq("household_id", household.id)
    .eq("kind", "expense")
    .limit(1)
    .single();
  if (catErr || !category) {
    throw new Error(`could not resolve a seeded expense category for ${session.email}: ${catErr?.message}`);
  }

  const account = await financeApi.createAccount({
    householdId: household.id as string,
    name: "Health Repo Test Account",
    type: "checking",
    openingBalanceCents: 0,
    visibility: "household",
    sortOrder: 0,
  });
  if (!account.ok) {
    throw new Error(`could not create test account: ${account.error.message}`);
  }

  return { householdId: household.id as string, accountId: account.value.id, categoryId: category.id as string };
}

describe("health/data repositories — CRUD + RLS privacy (health-tracking Phase 3)", () => {
  let memberA: TestSession;
  let memberB: TestSession;
  let householdId: string;
  let accountId: string;
  let categoryId: string;

  beforeAll(async () => {
    memberA = await signUpAndSignIn("health-repo-a");
    const space = await bootstrapSpace(memberA);
    householdId = space.householdId;
    accountId = space.accountId;
    categoryId = space.categoryId;

    // Add memberB to the SAME household so RLS's `core.is_member` gate is satisfied — membership
    // is what separates "invisible because private" from "invisible because not a member", the
    // latter not being the assertion this file makes. No invite/accept RPC exists in this schema
    // (verified: no `invite_member`/`accept_invite`/`join_household` function in
    // supabase/migrations) — same fixture-setup pattern `120_health_rls.sql`'s pgTAP suite uses
    // (direct `insert into core.household_members`), done here via the admin (service-role)
    // client so it bypasses RLS as pure fixture setup, not the flow under test.
    memberB = await signUpAndSignIn("health-repo-b");
    const { error: joinErr } = await adminClient()
      .schema("core")
      .from("household_members")
      .insert({ household_id: householdId, user_id: memberB.userId, role: "member" });
    if (joinErr) {
      throw new Error(`failed to add memberB to household: ${joinErr.message}`);
    }
  }, 30000);

  it("creates a household-visibility costed event and both members can read it", async () => {
    const { id, error } = await healthApi.createEvent(memberA.client, {
      householdId,
      ownerUserId: memberA.userId,
      eventType: "consultation",
      title: "Annual checkup",
      occurredOn: "2026-08-10",
      visibility: "household",
      amountCents: 45000,
      accountId,
      categoryId,
      providerName: "Dr. Ramirez",
    });
    expect(error).toBeNull();
    expect(id).not.toBeNull();

    const seenByA = await healthApi.getEventById(memberA.client, householdId, id as string);
    const seenByB = await healthApi.getEventById(memberB.client, householdId, id as string);
    expect(seenByA?.title).toBe("Annual checkup");
    expect(seenByB?.title).toBe("Annual checkup");
    expect(seenByB?.amountCents).toBe(45000);
  });

  it("a private event is invisible to another member, both via list and direct id lookup (health-privacy RLS)", async () => {
    const { id, error } = await healthApi.createEvent(memberA.client, {
      householdId,
      ownerUserId: memberA.userId,
      eventType: "medication",
      title: "Private prescription",
      occurredOn: "2026-08-10",
      visibility: "private",
      dosage: "10mg daily",
    });
    expect(error).toBeNull();
    expect(id).not.toBeNull();

    // Direct id lookup by member B returns null — RLS-enforced, not UI filtering.
    const seenByB = await healthApi.getEventById(memberB.client, householdId, id as string);
    expect(seenByB).toBeNull();

    // Member A's own list-view includes it; member B's list-view excludes it.
    const listA = await healthApi.listEvents(memberA.client, householdId);
    const listB = await healthApi.listEvents(memberB.client, householdId);
    expect(listA.some((e) => e.id === id)).toBe(true);
    expect(listB.some((e) => e.id === id)).toBe(false);
  });

  it("rejects a private event funded from a household (non-private) account (enforce_private_event_account trigger)", async () => {
    const { id, error } = await healthApi.createEvent(memberA.client, {
      householdId,
      ownerUserId: memberA.userId,
      eventType: "study",
      title: "Blood panel",
      occurredOn: "2026-08-10",
      visibility: "private",
      amountCents: 8000,
      accountId, // household-visibility account — must be rejected for a private event
      categoryId,
      resultSummary: "pending",
    });
    expect(id).toBeNull();
    expect(error).toMatch(/private/i);
  });

  it("rejects cost fields that are partially set (events_cost_all_or_none CHECK)", async () => {
    const { id, error } = await healthApi.createEvent(memberA.client, {
      householdId,
      ownerUserId: memberA.userId,
      eventType: "consultation",
      title: "Malformed cost",
      occurredOn: "2026-08-10",
      amountCents: 5000,
      accountId: null,
      categoryId: null,
    });
    expect(id).toBeNull();
    expect(error).not.toBeNull();
  });

  it("updateEvent and deleteEvent are RLS-scoped to the space (mirrors the finance repository shape)", async () => {
    const { id } = await healthApi.createEvent(memberA.client, {
      householdId,
      ownerUserId: memberA.userId,
      eventType: "vaccine",
      title: "Flu shot",
      occurredOn: "2026-08-10",
      dosage: "0.5mL",
    });

    const { error: updateErr } = await healthApi.updateEvent(memberA.client, householdId, id as string, { title: "Flu shot (annual)" });
    expect(updateErr).toBeNull();
    const updated = await healthApi.getEventById(memberA.client, householdId, id as string);
    expect(updated?.title).toBe("Flu shot (annual)");

    const { error: deleteErr } = await healthApi.deleteEvent(memberA.client, householdId, id as string);
    expect(deleteErr).toBeNull();
    const afterDelete = await healthApi.getEventById(memberA.client, householdId, id as string);
    expect(afterDelete).toBeNull();
  });

  it("creates a vital reading that never touches finance.transactions, and it forms a chronological trend", async () => {
    const before = await financeApi.listRecentTransactions(memberA.client, householdId, 500);

    await healthApi.createVitalReading(memberA.client, {
      householdId,
      ownerUserId: memberA.userId,
      metric: "weight_kg",
      valueNumeric: 80.5,
      measuredAt: "2026-06-01T00:00:00.000Z",
    });
    await healthApi.createVitalReading(memberA.client, {
      householdId,
      ownerUserId: memberA.userId,
      metric: "weight_kg",
      valueNumeric: 79.1,
      measuredAt: "2026-07-01T00:00:00.000Z",
    });

    const after = await financeApi.listRecentTransactions(memberA.client, householdId, 500);
    expect(after.length).toBe(before.length);

    const readings = await healthApi.listVitalReadings(memberA.client, householdId, "weight_kg");
    expect(readings.map((r) => r.valueNumeric)).toEqual([80.5, 79.1]);
    expect(readings[0]!.measuredAt < readings[1]!.measuredAt).toBe(true);
  });

  it("creates a profile fact that never touches finance.transactions, and enforces one blood_type per owner", async () => {
    const before = await financeApi.listRecentTransactions(memberA.client, householdId, 500);

    const { id: bloodTypeId, error: firstErr } = await healthApi.createProfileFact(memberA.client, {
      householdId,
      ownerUserId: memberA.userId,
      factType: "blood_type",
      label: "O+",
    });
    expect(firstErr).toBeNull();
    expect(bloodTypeId).not.toBeNull();

    const { id: secondId, error: secondErr } = await healthApi.createProfileFact(memberA.client, {
      householdId,
      ownerUserId: memberA.userId,
      factType: "blood_type",
      label: "A+",
    });
    expect(secondId).toBeNull();
    expect(secondErr).not.toBeNull();

    const after = await financeApi.listRecentTransactions(memberA.client, householdId, 500);
    expect(after.length).toBe(before.length);

    const facts = await healthApi.listProfileFacts(memberA.client, householdId);
    expect(facts.filter((f) => f.factType === "blood_type").map((f) => f.label)).toEqual(["O+"]);
  });
});
