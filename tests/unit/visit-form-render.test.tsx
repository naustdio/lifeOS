import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RTL smoke render (tasks.md 4.8, extended for nutrition-submodule fast-follow: collapsed
// behind a "+ Nueva visita" button, internal `<details>` sections). Spec `health-nutrition-visits`
// "A Visit Is a Composed Record" — event fields, metric grid, and photo input all present in one
// form, just not all visible at once by default (live-testing feedback: too long to scan flat).

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const createNutritionVisitAction = vi.fn();
vi.mock("@/app/(app)/(health)/nutricion/actions", () => ({ createNutritionVisitAction }));

const { VisitForm } = await import("@/app/(app)/(health)/nutricion/VisitForm");

const ACCOUNTS = [{ id: "acc-1", name: "Efectivo" }];
const CATEGORIES = [{ id: "cat-1", name: "Salud" }];

describe("VisitForm — smoke render (nutrition-submodule)", () => {
  afterEach(() => {
    cleanup();
    createNutritionVisitAction.mockReset();
  });

  it("is collapsed behind a '+ Nueva visita' button by default", () => {
    render(<VisitForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    expect(screen.getByRole("button", { name: "+ Nueva visita" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Título")).not.toBeInTheDocument();
  });

  it("opening the form reveals the 'Datos básicos' section expanded by default", () => {
    render(<VisitForm accounts={ACCOUNTS} categories={CATEGORIES} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Nueva visita" }));

    expect(screen.getByLabelText("Título")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
    expect(screen.getByLabelText("Nutriólogo")).toBeInTheDocument();
  });

  it("the metric grid lives inside its own collapsed section; photos is open by default", () => {
    render(<VisitForm accounts={ACCOUNTS} categories={CATEGORIES} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Nueva visita" }));

    fireEvent.click(screen.getByText("Métricas de esta visita"));
    expect(screen.getByLabelText("Peso (kg)")).toBeInTheDocument();
    expect(screen.getByLabelText("Grasa (%)")).toBeInTheDocument();

    // change: nutrition-submodule fast-follow (4th round) — "Fotos de avance" opens expanded by
    // default (live-testing: repeatedly reported as "can't add photos" — the real cause was this
    // section being collapsed and easy to miss, not a broken upload).
    expect(screen.getByLabelText(/Privadas, máx\. 6/)).toBeInTheDocument();
  });

  it("checking 'tiene un costo' inside the Costo section reveals account/category/amount fields", () => {
    render(<VisitForm accounts={ACCOUNTS} categories={CATEGORIES} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Nueva visita" }));
    fireEvent.click(screen.getByText("Costo"));

    fireEvent.click(screen.getByLabelText("Esta visita tiene un costo"));

    expect(screen.getByLabelText("Cuenta")).toBeInTheDocument();
    expect(screen.getByLabelText("Categoría")).toBeInTheDocument();
    expect(screen.getByLabelText("Monto (MXN)")).toBeInTheDocument();
  });

  it("surfaces a client-side warning past the 6-file cap", () => {
    render(<VisitForm accounts={ACCOUNTS} categories={CATEGORIES} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Nueva visita" }));

    const input = screen.getByLabelText(/Privadas, máx\. 6/) as HTMLInputElement;
    const files = Array.from({ length: 7 }, (_, i) => new File(["x"], `p${i}.jpg`, { type: "image/jpeg" }));
    Object.defineProperty(input, "files", { value: files });
    fireEvent.change(input);

    expect(screen.getByText("Máximo 6 fotos por visita.")).toBeInTheDocument();
  });
});
