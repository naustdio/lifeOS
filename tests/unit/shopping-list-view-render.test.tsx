import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RED-first (tasks.md 3.4, RTL, strict TDD). Spec `shopping-list-continuous` "Loose Manual
// Items", "Explicit Clear via 'Finalizar compra'" both scenarios. `ShoppingListView.tsx` and
// `AddLooseItemForm.tsx` did not exist when this was written.

const { ShoppingListView } = await import("@/app/(app)/(shopping-list)/lista-de-compras/ShoppingListView");

function noopAsync<T extends unknown[]>(): (...args: T) => Promise<{ error: string | null }> {
  return async () => ({ error: null });
}

function noopCreateStoreType(): (name: string) => Promise<{ storeType: { id: string; name: string } | null; error: string | null }> {
  return async () => ({ storeType: null, error: null });
}

describe("ShoppingListView — smoke render (shopping-list Phase 3)", () => {
  afterEach(() => cleanup());

  it("submitting the loose-item form calls onAddItem with a null recipe origin", async () => {
    const onAddItem = vi.fn(async () => ({ error: null }));
    render(
      <ShoppingListView
        initialLines={[]}
        storeTypes={[]}
        estimatedTotal={null}
        onAddItem={onAddItem}
        onToggleItem={noopAsync()}
        onRemoveItem={noopAsync()}
        onFinalize={noopAsync()}
        onCreateStoreType={noopCreateStoreType()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Papel higiénico" } });
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Unidad"), { target: { value: "pieza" } });
    fireEvent.click(screen.getByRole("button", { name: /agregar/i }));

    expect(onAddItem).toHaveBeenCalledTimes(1);
    expect(onAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Papel higiénico",
        quantity: 2,
        unit: "pieza",
        originRecipeId: null,
        originRecipeTitle: null,
      }),
    );
  });

  it("'Finalizar compra' is the only clear trigger present on the page", () => {
    render(
      <ShoppingListView
        initialLines={[
          {
            key: "manzana|pieza",
            name: "Manzana",
            unit: "pieza",
            totalQuantity: 3,
            estimatedCost: null,
            storeTypeId: null,
            checked: false,
            contributors: [{ itemId: "1", originLabel: "manual", quantity: 3 }],
          },
        ]}
        storeTypes={[]}
        estimatedTotal={null}
        onAddItem={noopAsync()}
        onToggleItem={noopAsync()}
        onRemoveItem={noopAsync()}
        onFinalize={noopAsync()}
        onCreateStoreType={noopCreateStoreType()}
      />,
    );

    expect(screen.getByRole("button", { name: "Finalizar compra" })).toBeInTheDocument();
    // No other clear/reset control exists on the page.
    expect(screen.queryByRole("button", { name: /limpiar|vaciar|clear/i })).not.toBeInTheDocument();
  });

  it("checking every item does not clear the list — items remain visible", () => {
    render(
      <ShoppingListView
        initialLines={[
          {
            key: "manzana|pieza",
            name: "Manzana",
            unit: "pieza",
            totalQuantity: 3,
            estimatedCost: null,
            storeTypeId: null,
            checked: true,
            contributors: [{ itemId: "1", originLabel: "manual", quantity: 3 }],
          },
        ]}
        storeTypes={[]}
        estimatedTotal={null}
        onAddItem={noopAsync()}
        onToggleItem={noopAsync()}
        onRemoveItem={noopAsync()}
        onFinalize={noopAsync()}
        onCreateStoreType={noopCreateStoreType()}
      />,
    );

    expect(screen.getByText("Manzana")).toBeInTheDocument();
  });

  it("clicking 'Finalizar compra' calls onFinalize", () => {
    const onFinalize = vi.fn(async () => ({ error: null }));
    render(
      <ShoppingListView
        initialLines={[]}
        storeTypes={[]}
        estimatedTotal={null}
        onAddItem={noopAsync()}
        onToggleItem={noopAsync()}
        onRemoveItem={noopAsync()}
        onFinalize={onFinalize}
        onCreateStoreType={noopCreateStoreType()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Finalizar compra" }));
    expect(onFinalize).toHaveBeenCalledTimes(1);
  });
});
