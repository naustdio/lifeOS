import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for `EventList` (change: health-tracking): `EmptyState` on zero events, a
 * costed event shows its formatted amount, a private event shows a lock affordance, and a
 * recurring-linked event is labelled "Recurrente".
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const deleteHealthEventAction = vi.fn();
const updateHealthEventAction = vi.fn();
vi.mock("@/app/(app)/(health)/salud/actions", () => ({ deleteHealthEventAction, updateHealthEventAction }));

const { EventList } = await import("@/app/(app)/(health)/salud/EventList");

describe("EventList — smoke render (health-tracking)", () => {
  afterEach(() => {
    cleanup();
    deleteHealthEventAction.mockReset();
  });

  it("renders EmptyState when there are zero events", () => {
    render(<EventList events={[]} />);

    expect(screen.getByText("Aún no registraste eventos de salud")).toBeInTheDocument();
  });

  it("renders a costed event with its formatted amount and title", () => {
    render(
      <EventList
        events={[
          {
            id: "evt-1",
            eventType: "consultation",
            title: "Chequeo anual",
            occurredOn: "2026-08-10",
            notes: "",
            visibility: "shared",
            amountCents: 45000,
            recurringTransactionId: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("Chequeo anual")).toBeInTheDocument();
    expect(screen.getByText(/-\$450\.00/)).toBeInTheDocument();
  });

  it("a private event shows the lock affordance; a recurring-linked event is labelled 'Recurrente'", () => {
    render(
      <EventList
        events={[
          {
            id: "evt-2",
            eventType: "medication",
            title: "Receta privada",
            occurredOn: "2026-08-10",
            notes: "",
            visibility: "private",
            amountCents: null,
            recurringTransactionId: "rec-1",
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Privado")).toBeInTheDocument();
    expect(screen.getByText(/Recurrente/)).toBeInTheDocument();
  });

  it("renders the 'Nutrición' label for a nutrition event (change: nutrition-tracking)", () => {
    render(
      <EventList
        events={[
          {
            id: "evt-3",
            eventType: "nutrition",
            title: "Consulta nutriologo",
            occurredOn: "2026-08-10",
            notes: "",
            visibility: "shared",
            amountCents: 90000,
            recurringTransactionId: null,
          },
        ]}
      />,
    );

    expect(screen.getByText(/Nutrición/)).toBeInTheDocument();
  });

  it("clicking Editar on a one-off costed event opens EditEventSheet with the amount field; a recurring event's sheet hides it", () => {
    render(
      <EventList
        events={[
          {
            id: "evt-1",
            eventType: "consultation",
            title: "Chequeo anual",
            occurredOn: "2026-08-10",
            notes: "",
            visibility: "shared",
            amountCents: 45000,
            recurringTransactionId: null,
          },
          {
            id: "evt-2",
            eventType: "vaccine",
            title: "Serie de dosis",
            occurredOn: "2026-08-10",
            notes: "",
            visibility: "shared",
            amountCents: 50000,
            recurringTransactionId: "rec-1",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]!);
    expect(screen.getByText("Editar evento")).toBeInTheDocument();
    expect(screen.getByLabelText("Monto (MXN)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("Editar evento")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[1]!);
    expect(screen.queryByLabelText("Monto (MXN)")).not.toBeInTheDocument();
    expect(screen.getByText(/se administra desde Recurrentes/)).toBeInTheDocument();
  });
});
