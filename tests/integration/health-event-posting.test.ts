// @vitest-environment node
//
// health-tracking Phase 4 — closes the integration-test gap Phase 3 deliberately deferred here
// (see `tests/integration/health-events-repository.test.ts`'s header note): verifies the actual
// `app`-layer composition in `src/app/(app)/(health)/salud/actions.ts` — a costed health event
// posts a real `finance.transactions` row with `origin_module = 'health'`, a bounded recurring
// event creates a bounded `finance.recurring_transactions` definition and attaches it back onto
// the event, and deleting a one-off costed event voids its linked transaction (design.md Testing
// Strategy: "One post per costed event with origin_module='health'"; spec `health-events`
// "Deleting an event voids its transaction").

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let activeClient: SupabaseClient;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const actions = await import("@/app/(app)/(health)/salud/actions");
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
    name: "Health Posting Test Account",
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

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("salud/actions — Finance composition (health-tracking Phase 4)", () => {
  let householdId: string;
  let accountId: string;
  let categoryId: string;

  beforeAll(async () => {
    const session = await signUpAndSignIn("health-posting");
    const space = await bootstrapSpace(session);
    householdId = space.householdId;
    accountId = space.accountId;
    categoryId = space.categoryId;
  }, 30000);

  it("a one-off costed event posts a finance.transactions row with origin_module='health'", async () => {
    const result = await actions.createHealthEventAction(
      { error: null },
      formData({
        eventType: "consultation",
        title: "Chequeo anual",
        occurredOn: "2026-08-10",
        visibility: "shared",
        hasCost: "on",
        accountId,
        categoryId,
        amount: "450.00",
        recurrenceMode: "none",
      }),
    );
    expect(result.error).toBeNull();

    const events = await (await import("@/modules/health/api")).listEvents(activeClient, householdId);
    const created = events.find((e) => e.title === "Chequeo anual");
    expect(created).toBeTruthy();
    expect(created?.amountCents).toBe(45000);

    const found = await financeApi.findByOrigin({ householdId, module: "health", entityId: created!.id });
    expect(found.ok).toBe(true);
    if (found.ok) {
      expect(found.value).not.toBeNull();
      expect(found.value?.status).toBe("posted");
    }
  });

  it("a costed nutrition event posts a finance.transactions row with origin_module='health' (change: nutrition-tracking)", async () => {
    const result = await actions.createHealthEventAction(
      { error: null },
      formData({
        eventType: "nutrition",
        title: "Consulta nutriologo",
        occurredOn: "2026-08-10",
        visibility: "shared",
        hasCost: "on",
        accountId,
        categoryId,
        amount: "900.00",
        recurrenceMode: "none",
      }),
    );
    expect(result.error).toBeNull();

    const events = await (await import("@/modules/health/api")).listEvents(activeClient, householdId);
    const created = events.find((e) => e.title === "Consulta nutriologo");
    expect(created).toBeTruthy();
    expect(created?.eventType).toBe("nutrition");
    expect(created?.amountCents).toBe(90000);

    const found = await financeApi.findByOrigin({ householdId, module: "health", entityId: created!.id });
    expect(found.ok).toBe(true);
    if (found.ok) {
      expect(found.value).not.toBeNull();
      expect(found.value?.status).toBe("posted");
    }
  });

  it("a retried submission (same clientEventId) creates exactly one event and one transaction (spec health-events)", async () => {
    const clientEventId = crypto.randomUUID();
    const submission = formData({
      clientEventId,
      eventType: "consultation",
      title: "Retry test",
      occurredOn: "2026-08-10",
      visibility: "shared",
      hasCost: "on",
      accountId,
      categoryId,
      amount: "200.00",
      recurrenceMode: "none",
    });

    const first = await actions.createHealthEventAction({ error: null }, submission);
    const second = await actions.createHealthEventAction({ error: null }, submission);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    const events = await (await import("@/modules/health/api")).listEvents(activeClient, householdId);
    const matches = events.filter((e) => e.title === "Retry test");
    expect(matches.length).toBe(1);

    const found = await financeApi.findByOrigin({ householdId, module: "health", entityId: matches[0]!.id });
    expect(found.ok && found.value?.status).toBe("posted");
  });

  it("a bounded recurring event creates a bounded recurring definition (0 occurrences posted yet) and attaches it to the event", async () => {
    const result = await actions.createHealthEventAction(
      { error: null },
      formData({
        eventType: "vaccine",
        title: "Serie de 3 dosis",
        occurredOn: "2026-08-10",
        visibility: "shared",
        hasCost: "on",
        accountId,
        categoryId,
        amount: "500.00",
        recurrenceMode: "bounded",
        totalOccurrences: "3",
      }),
    );
    expect(result.error).toBeNull();

    const events = await (await import("@/modules/health/api")).listEvents(activeClient, householdId);
    const created = events.find((e) => e.title === "Serie de 3 dosis");
    expect(created).toBeTruthy();
    expect(created?.recurringTransactionId).not.toBeNull();

    // Decision 3: "definition-only for recurring" — unlike "compra a meses" (which posts
    // installment #1 atomically via its own RPC), createRecurringDefinition only inserts the
    // definition row. Nothing posts until the user confirms it through the normal Recurrentes
    // confirm/discard seam, same as any other recurring definition.
    const occurrences = await financeApi.listTransactionsByRecurring(activeClient, householdId, created!.recurringTransactionId as string);
    expect(occurrences.length).toBe(0);

    const definitions = await financeApi.listRecurringDefinitions(activeClient, householdId);
    const definition = definitions.find((d) => d.id === created!.recurringTransactionId);
    expect(definition?.installmentTotal).toBe(3);
    expect(definition?.installmentsRemaining).toBe(3);
  });

  it("deleting a one-off costed event voids its linked transaction", async () => {
    const create = await actions.createHealthEventAction(
      { error: null },
      formData({
        eventType: "study",
        title: "Análisis de sangre a eliminar",
        occurredOn: "2026-08-10",
        visibility: "shared",
        hasCost: "on",
        accountId,
        categoryId,
        amount: "300.00",
        recurrenceMode: "none",
      }),
    );
    expect(create.error).toBeNull();

    const events = await (await import("@/modules/health/api")).listEvents(activeClient, householdId);
    const created = events.find((e) => e.title === "Análisis de sangre a eliminar");
    expect(created).toBeTruthy();

    const beforeDelete = await financeApi.findByOrigin({ householdId, module: "health", entityId: created!.id });
    expect(beforeDelete.ok && beforeDelete.value?.status).toBe("posted");

    const del = await actions.deleteHealthEventAction({ error: null }, formData({ id: created!.id }));
    expect(del.error).toBeNull();

    const afterDelete = await financeApi.findByOrigin({ householdId, module: "health", entityId: created!.id });
    expect(afterDelete.ok && afterDelete.value?.status).toBe("void");
  });

  it("editing a one-off costed event's amount updates the linked transaction (spec health-events)", async () => {
    const create = await actions.createHealthEventAction(
      { error: null },
      formData({
        eventType: "consultation",
        title: "Consulta a editar",
        occurredOn: "2026-08-10",
        visibility: "shared",
        hasCost: "on",
        accountId,
        categoryId,
        amount: "100.00",
        recurrenceMode: "none",
      }),
    );
    expect(create.error).toBeNull();

    const events = await (await import("@/modules/health/api")).listEvents(activeClient, householdId);
    const created = events.find((e) => e.title === "Consulta a editar");
    expect(created).toBeTruthy();

    const edit = await actions.updateHealthEventAction(
      { error: null },
      formData({
        id: created!.id,
        title: "Consulta editada",
        occurredOn: "2026-08-11",
        visibility: "shared",
        amount: "150.00",
      }),
    );
    expect(edit.error).toBeNull();

    const updatedEvent = await (await import("@/modules/health/api")).getEventById(activeClient, householdId, created!.id);
    expect(updatedEvent?.title).toBe("Consulta editada");

    const found = await financeApi.findByOrigin({ householdId, module: "health", entityId: created!.id });
    expect(found.ok).toBe(true);
    if (found.ok && found.value) {
      const tx = await financeApi.getTransactionById(activeClient, householdId, found.value.id);
      expect(tx?.amountCents).toBe(-15000);
      expect(tx?.description).toBe("Consulta editada");
    }
  });
});
