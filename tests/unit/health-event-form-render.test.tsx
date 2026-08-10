import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for `EventForm` (change: health-tracking): the event-type/visibility pickers
 * are the design-system `Select` (standing `finance-ui-polish` convention), the cost fieldset is
 * hidden until "Este evento tiene un costo" is checked, and the recurrence sub-fields follow the
 * chosen recurrence mode — mirroring `transaction-form-render.test.tsx`'s tab-conditional-fields
 * coverage shape.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const createHealthEventAction = vi.fn();
vi.mock("@/app/(app)/(health)/salud/actions", () => ({ createHealthEventAction }));

const { EventForm } = await import("@/app/(app)/(health)/salud/EventForm");

const ACCOUNTS = [{ id: "acc-1", name: "Efectivo" }];
const CATEGORIES = [{ id: "cat-1", name: "Salud" }];

describe("EventForm — smoke render (health-tracking)", () => {
  afterEach(() => {
    cleanup();
    createHealthEventAction.mockReset();
  });

  it("renders type, title, date, visibility fields, and no cost fieldset by default", () => {
    render(<EventForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    expect(screen.getByLabelText("Tipo")).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
    expect(screen.getByLabelText("Visibilidad")).toBeInTheDocument();
    expect(screen.queryByLabelText("Monto (MXN)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cuenta")).not.toBeInTheDocument();
  });

  it("checking 'tiene un costo' reveals account/category/amount/recurrence fields", () => {
    render(<EventForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    fireEvent.click(screen.getByLabelText("Este evento tiene un costo"));

    expect(screen.getByLabelText("Cuenta")).toBeInTheDocument();
    expect(screen.getByLabelText("Categoría")).toBeInTheDocument();
    expect(screen.getByLabelText("Monto (MXN)")).toBeInTheDocument();
    expect(screen.getByLabelText("Recurrencia")).toBeInTheDocument();
  });

  it("choosing bounded recurrence shows the total-occurrences field, unbounded shows frequency", () => {
    render(<EventForm accounts={ACCOUNTS} categories={CATEGORIES} />);
    fireEvent.click(screen.getByLabelText("Este evento tiene un costo"));

    fireEvent.click(screen.getByLabelText("Recurrencia"));
    fireEvent.click(screen.getByRole("option", { name: "Recurrente con número fijo de veces" }));
    expect(screen.getByLabelText("Número de veces")).toBeInTheDocument();
    expect(screen.queryByLabelText("Frecuencia")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Recurrencia"));
    fireEvent.click(screen.getByRole("option", { name: "Recurrente sin fin" }));
    expect(screen.getByLabelText("Frecuencia")).toBeInTheDocument();
    expect(screen.queryByLabelText("Número de veces")).not.toBeInTheDocument();
  });

  it("selecting 'Estudio médico' shows the Resultado field; 'Medicamento' shows Dosis instead", () => {
    render(<EventForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    fireEvent.click(screen.getByLabelText("Tipo"));
    fireEvent.click(screen.getByRole("option", { name: "Estudio médico" }));
    expect(screen.getByLabelText("Resultado")).toBeInTheDocument();
    expect(screen.queryByLabelText("Dosis")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Tipo"));
    fireEvent.click(screen.getByRole("option", { name: "Medicamento" }));
    expect(screen.getByLabelText("Dosis")).toBeInTheDocument();
    expect(screen.queryByLabelText("Resultado")).not.toBeInTheDocument();
  });

  it("offers 'Nutrición' as its own event type, distinct from 'Consulta médica' (change: nutrition-tracking)", () => {
    render(<EventForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    fireEvent.click(screen.getByLabelText("Tipo"));
    expect(screen.getByRole("option", { name: "Nutrición" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Consulta médica" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "Nutrición" }));
    // Same shape as consultation — no Resultado/Dosis field for this type either.
    expect(screen.queryByLabelText("Resultado")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Dosis")).not.toBeInTheDocument();
  });
});
