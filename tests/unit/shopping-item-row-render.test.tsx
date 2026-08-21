import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RED-first (tasks.md 3.2, RTL, strict TDD). Spec `shopping-list-continuous` "In-Place
// Strike-Through Check-Off". `ShoppingItemRow.tsx` did not exist when this was written.

const { ShoppingItemRow } = await import("@/design-system/patterns/ShoppingItemRow");

describe("ShoppingItemRow — smoke render (shopping-list Phase 3)", () => {
  afterEach(() => cleanup());

  it("renders the item name, quantity, and unit", () => {
    render(
      <ShoppingItemRow
        name="Manzana"
        unit="pieza"
        totalQuantity={3}
        estimatedCost={null}
        checked={false}
        contributors={[{ itemId: "1", originLabel: "manual", quantity: 3 }]}
        onToggle={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText("Manzana")).toBeInTheDocument();
    expect(screen.getByText(/3.*pieza/)).toBeInTheDocument();
  });

  it("checking the row strikes it through in place — no separate 'purchased' section, same node stays rendered", () => {
    const { rerender } = render(
      <ShoppingItemRow
        name="Manzana"
        unit="pieza"
        totalQuantity={3}
        estimatedCost={null}
        checked={false}
        contributors={[{ itemId: "1", originLabel: "manual", quantity: 3 }]}
        onToggle={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText("Manzana")).not.toHaveClass("line-through");

    rerender(
      <ShoppingItemRow
        name="Manzana"
        unit="pieza"
        totalQuantity={3}
        estimatedCost={null}
        checked={true}
        contributors={[{ itemId: "1", originLabel: "manual", quantity: 3 }]}
        onToggle={() => {}}
        onRemove={() => {}}
      />,
    );
    // Same element instance stays in the DOM (in-place), now struck through.
    expect(screen.getByText("Manzana")).toHaveClass("line-through");
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("clicking the checkbox control calls onToggle", () => {
    const onToggle = vi.fn();
    render(
      <ShoppingItemRow
        name="Manzana"
        unit="pieza"
        totalQuantity={3}
        estimatedCost={null}
        checked={false}
        contributors={[{ itemId: "1", originLabel: "manual", quantity: 3 }]}
        onToggle={onToggle}
        onRemove={() => {}}
      />,
    );
    screen.getByRole("checkbox").click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("the origin sub-line renders only when there is more than one contributor", () => {
    const { rerender } = render(
      <ShoppingItemRow
        name="Manzana"
        unit="pieza"
        totalQuantity={3}
        estimatedCost={null}
        checked={false}
        contributors={[{ itemId: "1", originLabel: "manual", quantity: 3 }]}
        onToggle={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(screen.queryByText(/manual/)).not.toBeInTheDocument();

    rerender(
      <ShoppingItemRow
        name="Manzana"
        unit="pieza"
        totalQuantity={5}
        estimatedCost={null}
        checked={false}
        contributors={[
          { itemId: "1", originLabel: "manual", quantity: 3 },
          { itemId: "2", originLabel: "Tacos al pastor", quantity: 2 },
        ]}
        onToggle={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText(/manual/)).toBeInTheDocument();
    expect(screen.getByText(/Tacos al pastor/)).toBeInTheDocument();
  });

  it("clicking the remove button calls onRemove", () => {
    const onRemove = vi.fn();
    render(
      <ShoppingItemRow
        name="Manzana"
        unit="pieza"
        totalQuantity={3}
        estimatedCost={null}
        checked={false}
        contributors={[{ itemId: "1", originLabel: "manual", quantity: 3 }]}
        onToggle={() => {}}
        onRemove={onRemove}
      />,
    );
    screen.getByRole("button", { name: /quitar/i }).click();
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
