import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";

// RED-first (tasks.md 4.1, RTL, strict TDD). Spec `shopping-list-store-types` "Items Grouped by
// Store Type in the UI" both scenarios. `StoreTypeGroupHeader.tsx` did not exist when this was
// written, and `ShoppingListView.tsx` did not yet group by store type — MUST fail.

const { StoreTypeGroupHeader } = await import("@/design-system/patterns/StoreTypeGroupHeader");
const { ShoppingListView } = await import("@/app/(app)/(shopping-list)/lista-de-compras/ShoppingListView");

function noopAsync<T extends unknown[]>(): (...args: T) => Promise<{ error: string | null }> {
  return async () => ({ error: null });
}

function noopCreateStoreType(): (name: string) => Promise<{ storeType: { id: string; name: string } | null; error: string | null }> {
  return async () => ({ storeType: null, error: null });
}

describe("StoreTypeGroupHeader — smoke render (shopping-list Phase 4)", () => {
  afterEach(() => cleanup());

  it("renders the group name and, when priced, the subtotal", () => {
    render(<StoreTypeGroupHeader name="Carnicería" subtotal={125.5} />);
    expect(screen.getByText("Carnicería")).toBeInTheDocument();
    expect(screen.getByText("$125.50")).toBeInTheDocument();
  });

  it("renders no subtotal when nothing in the group is priced", () => {
    render(<StoreTypeGroupHeader name="Sin categoría" subtotal={null} />);
    expect(screen.getByText("Sin categoría")).toBeInTheDocument();
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });
});

describe("ShoppingListView — grouping by store type (shopping-list Phase 4)", () => {
  afterEach(() => cleanup());

  const carniceria = { id: "st-1", name: "Carnicería" };
  const cremeria = { id: "st-2", name: "Cremería" };

  it("items appear grouped under each respective store-type header — spec 'Items render under their store-type header'", () => {
    render(
      <ShoppingListView
        initialLines={[
          {
            key: "bistec|kg",
            name: "Bistec",
            unit: "kg",
            totalQuantity: 1,
            estimatedCost: null,
            storeTypeId: carniceria.id,
            checked: false,
            contributors: [{ itemId: "1", originLabel: "manual", quantity: 1 }],
          },
          {
            key: "queso|pieza",
            name: "Queso",
            unit: "pieza",
            totalQuantity: 1,
            estimatedCost: null,
            storeTypeId: cremeria.id,
            checked: false,
            contributors: [{ itemId: "2", originLabel: "manual", quantity: 1 }],
          },
        ]}
        storeTypes={[carniceria, cremeria]}
        estimatedTotal={null}
        onAddItem={noopAsync()}
        onToggleItem={noopAsync()}
        onRemoveItem={noopAsync()}
        onFinalize={noopAsync()}
        onCreateStoreType={noopCreateStoreType()}
      />,
    );

    // Radix's `<Select>` also renders a hidden native `<select>`/`<option>` fallback carrying the
    // same option text (for form autofill), so scope the group-header assertions to the actual
    // heading role to disambiguate from that duplicate text node.
    expect(screen.getByRole("heading", { name: "Carnicería" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cremería" })).toBeInTheDocument();
    expect(screen.getByText("Bistec")).toBeInTheDocument();
    expect(screen.getByText("Queso")).toBeInTheDocument();
  });

  it("an item with no store type still appears, under a distinct 'Sin categoría' group rather than being hidden — spec 'Unassigned items are not hidden'", () => {
    render(
      <ShoppingListView
        initialLines={[
          {
            key: "papel|pieza",
            name: "Papel higiénico",
            unit: "pieza",
            totalQuantity: 2,
            estimatedCost: null,
            storeTypeId: null,
            checked: false,
            contributors: [{ itemId: "3", originLabel: "manual", quantity: 2 }],
          },
        ]}
        storeTypes={[carniceria]}
        estimatedTotal={null}
        onAddItem={noopAsync()}
        onToggleItem={noopAsync()}
        onRemoveItem={noopAsync()}
        onFinalize={noopAsync()}
        onCreateStoreType={noopCreateStoreType()}
      />,
    );

    // "Sin categoría" also appears as the AddLooseItemForm store-type select's placeholder text,
    // so scope to the group header specifically (an <h3>) to disambiguate.
    expect(screen.getByRole("heading", { name: "Sin categoría" })).toBeInTheDocument();
    expect(screen.getByText("Papel higiénico")).toBeInTheDocument();
  });
});
