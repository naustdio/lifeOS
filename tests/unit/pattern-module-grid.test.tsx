import { cleanup, render, screen } from "@testing-library/react";
import { CalendarDays, Wallet } from "lucide-react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ModuleGrid } from "@/design-system/patterns/ModuleGrid";

describe("ModuleGrid", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders one card per item with the expected href", () => {
    render(
      <ModuleGrid
        items={[
          { label: "Finanzas", icon: Wallet, href: "/finance" },
          { label: "Calendario", icon: CalendarDays, href: "/calendario" },
        ]}
      />,
    );

    const finance = screen.getByRole("link", { name: "Finanzas" });
    expect(finance).toHaveAttribute("href", "/finance");
    const calendar = screen.getByRole("link", { name: "Calendario" });
    expect(calendar).toHaveAttribute("href", "/calendario");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("renders no links for an empty array", () => {
    render(<ModuleGrid items={[]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
