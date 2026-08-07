import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/design-system/tokens/category-style";

/**
 * RTL coverage for `CategoryEditor`/`IconPicker`/`ColorPicker` (design.md §5, change:
 * finance-categories-icon-color C-013). RED-first: these components do not exist yet, so this
 * file fails to resolve its own imports below until C-014/C-015/C-016 land. Covers the two
 * named critical-logic surfaces for this task: (1) the pickers offer ONLY registry values, no
 * free-text/hex input, and (2) `validateCategoryShape`'s depth/kind rejection is previewed
 * client-side before submit.
 */

const createCategoryAction = vi.fn();
const updateCategoryAction = vi.fn();
const archiveCategoryAction = vi.fn();

vi.mock("@/app/(app)/categorias/actions", () => ({
  createCategoryAction,
  updateCategoryAction,
  archiveCategoryAction,
}));

const { CategoryEditor } = await import("@/app/(app)/categorias/CategoryEditor");
const { IconPicker } = await import("@/app/(app)/categorias/IconPicker");
const { ColorPicker } = await import("@/app/(app)/categorias/ColorPicker");

describe("IconPicker / ColorPicker — registry-only options", () => {
  afterEach(() => {
    cleanup();
  });

  it("IconPicker renders exactly the CATEGORY_ICONS keys, radio semantics, no free-text input", () => {
    render(<IconPicker value={null} onChange={() => {}} />);
    const group = screen.getByRole("radiogroup");
    const options = within(group).getAllByRole("radio");
    expect(options).toHaveLength(Object.keys(CATEGORY_ICONS).length);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("ColorPicker renders exactly the CATEGORY_COLORS keys, radio semantics, no hex input", () => {
    render(<ColorPicker value={null} onChange={() => {}} />);
    const group = screen.getByRole("radiogroup");
    const options = within(group).getAllByRole("radio");
    expect(options).toHaveLength(Object.keys(CATEGORY_COLORS).length);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="color"]')).toBeNull();
  });

  it("clicking an IconPicker option calls onChange with that registry key", () => {
    const onChange = vi.fn();
    render(<IconPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "utensils" }));
    expect(onChange).toHaveBeenCalledWith("utensils");
  });

  it("clicking a ColorPicker option calls onChange with that registry key", () => {
    const onChange = vi.fn();
    render(<ColorPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "blue" }));
    expect(onChange).toHaveBeenCalledWith("blue");
  });
});

describe("CategoryEditor — create mode", () => {
  afterEach(() => {
    cleanup();
    createCategoryAction.mockReset();
  });

  const PARENT_OPTIONS = [{ id: "p-1", name: "Comida", kind: "expense" as const, parentId: null }];

  it("submits with icon/color left unset as null (empty hidden field)", () => {
    render(<CategoryEditor mode="create" initial={null} parentOptions={PARENT_OPTIONS} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Renta" } });

    expect(document.querySelector('input[name="icon"]')).toHaveValue("");
    expect(document.querySelector('input[name="color"]')).toHaveValue("");
  });

  it("selecting a registry icon/color updates the hidden fields used by the form action", () => {
    render(<CategoryEditor mode="create" initial={null} parentOptions={PARENT_OPTIONS} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("radio", { name: "utensils" }));
    fireEvent.click(screen.getByRole("radio", { name: "orange" }));

    expect(document.querySelector('input[name="icon"]')).toHaveValue("utensils");
    expect(document.querySelector('input[name="color"]')).toHaveValue("orange");
  });

  it("only offers top-level categories as parent options, filtering out a depth-2 item defensively", () => {
    const mixedOptions = [
      { id: "p-1", name: "Comida", kind: "expense" as const, parentId: null },
      { id: "p-2", name: "Restaurantes", kind: "expense" as const, parentId: "p-1" },
    ];
    render(<CategoryEditor mode="create" initial={null} parentOptions={mixedOptions} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Categoría padre" }));
    expect(screen.getByRole("option", { name: "Comida" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Restaurantes" })).not.toBeInTheDocument();
  });

  it("rejects a kind-mismatched child consistent with validateCategoryShape and disables submit", () => {
    render(<CategoryEditor mode="create" initial={null} parentOptions={PARENT_OPTIONS} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Salario" } });

    // Kind defaults to "expense"; pick the "expense" top-level parent, then flip kind to
    // "income" so the child no longer shares its parent's kind — an illegal shape.
    fireEvent.click(screen.getByRole("combobox", { name: "Categoría padre" }));
    fireEvent.click(screen.getByRole("option", { name: "Comida" }));

    fireEvent.click(screen.getByRole("combobox", { name: "Tipo" }));
    fireEvent.click(screen.getByRole("option", { name: "Ingreso" }));

    expect(screen.getByText("child category must share kind with its parent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
  });
});
