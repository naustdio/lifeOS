import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RTL smoke render (tasks.md 4.8, standard mode). Spec `health-nutrition-visits` "A Visit Is a
// Composed Record" — event fields, metric grid, and photo input all present in one form.

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

  it("renders event fields, the metric grid, and a photo file input", () => {
    render(<VisitForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    expect(screen.getByLabelText("Título")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
    expect(screen.getByLabelText("Nutriólogo")).toBeInTheDocument();
    expect(screen.getByLabelText("Peso (kg)")).toBeInTheDocument();
    expect(screen.getByLabelText("Grasa (%)")).toBeInTheDocument();
    expect(screen.getByLabelText(/Fotos de avance/)).toBeInTheDocument();
  });

  it("checking 'tiene un costo' reveals account/category/amount fields", () => {
    render(<VisitForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    fireEvent.click(screen.getByLabelText("Esta visita tiene un costo"));

    expect(screen.getByLabelText("Cuenta")).toBeInTheDocument();
    expect(screen.getByLabelText("Categoría")).toBeInTheDocument();
    expect(screen.getByLabelText("Monto (MXN)")).toBeInTheDocument();
  });

  it("surfaces a client-side warning past the 6-file cap", () => {
    render(<VisitForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    const input = screen.getByLabelText(/Fotos de avance/) as HTMLInputElement;
    const files = Array.from({ length: 7 }, (_, i) => new File(["x"], `p${i}.jpg`, { type: "image/jpeg" }));
    Object.defineProperty(input, "files", { value: files });
    fireEvent.change(input);

    expect(screen.getByText("Máximo 6 fotos por visita.")).toBeInTheDocument();
  });
});
