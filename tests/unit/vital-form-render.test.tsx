import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for `VitalForm` (change: nutrition-tracking): the 14 new body-composition
 * metric options are present alongside the original 5, and every new label carries its unit in
 * parentheses (design.md Decision 3's binding follow-on).
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const createVitalReadingAction = vi.fn();
vi.mock("@/app/(app)/(health)/signos/actions", () => ({ createVitalReadingAction }));

const { VitalForm } = await import("@/app/(app)/(health)/signos/VitalForm");

describe("VitalForm — smoke render (nutrition-tracking)", () => {
  afterEach(() => {
    cleanup();
    createVitalReadingAction.mockReset();
  });

  it("renders the original 5 metrics plus the 14 new body-composition options, each with a unit in parentheses", () => {
    render(<VitalForm />);

    fireEvent.click(screen.getByLabelText("Métrica"));

    const original = ["Peso (kg)", "Presión sistólica", "Presión diastólica", "Glucosa (mg/dL)", "Frecuencia cardiaca"];
    for (const label of original) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }

    const newMetrics = [
      "Grasa (%)",
      "Grasa (kg)",
      "Músculo (%)",
      "Músculo (kg)",
      "Pliegue bíceps (mm)",
      "Pliegue tríceps (mm)",
      "Pliegue subescapular (mm)",
      "Pliegue cresta ilíaca (mm)",
      "Pliegue supraespinal (mm)",
      "Pliegue abdominal (mm)",
      "Cintura (cm)",
      "Cadera (cm)",
      "Muslo (cm)",
      "Brazo contraído (cm)",
    ];
    for (const label of newMetrics) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
      expect(label).toMatch(/\([a-zA-Z%/]+\)$/);
    }
  });
});
