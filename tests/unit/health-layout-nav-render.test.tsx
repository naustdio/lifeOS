import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import HealthLayout from "@/app/(app)/(health)/layout";

// RTL smoke render (tasks.md 5.4, standard mode). design.md Decision 6 — `/perfil` moves into an
// `OverflowMenu` alongside the new `/nutricion` destination, mirroring `(finance)/layout.tsx`.
describe("HealthLayout nav — smoke render (nutrition-submodule)", () => {
  afterEach(() => cleanup());

  it("the overflow menu offers both Nutrición and Perfil destinations", () => {
    render(<HealthLayout>{null}</HealthLayout>);

    fireEvent.click(screen.getByRole("button", { name: /más|more/i }));

    expect(screen.getByRole("link", { name: "Nutrición" })).toHaveAttribute("href", "/nutricion");
    expect(screen.getByRole("link", { name: "Perfil" })).toHaveAttribute("href", "/perfil");
  });

  it("still renders the direct Eventos and Signos vitales links", () => {
    render(<HealthLayout>{null}</HealthLayout>);

    expect(screen.getByLabelText("Eventos")).toHaveAttribute("href", "/salud");
    expect(screen.getByLabelText("Signos vitales")).toHaveAttribute("href", "/signos");
  });
});
