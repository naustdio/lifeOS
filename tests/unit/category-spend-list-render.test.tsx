import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CategorySpendList } from "@/design-system/patterns/CategorySpendList";

/**
 * RTL render for `CategorySpendList` (design.md §8, change: finance-dashboard-feed F-012).
 */
describe("CategorySpendList", () => {
  afterEach(() => {
    cleanup();
  });

  const items = [
    { categoryId: "cat-1", categoryName: "Comida", spentCents: 100000, formattedAmount: "$1,000.00" },
    { categoryId: "cat-2", categoryName: "Transporte", spentCents: 50000, formattedAmount: "$500.00" },
    { categoryId: "cat-3", categoryName: "Renta", spentCents: 10000, formattedAmount: "$100.00" },
  ];

  it("renders items highest-first with descending bar widths, top bar at 100%", () => {
    const { container } = render(<CategorySpendList items={items} />);

    expect(screen.getByText("Comida")).toBeInTheDocument();
    expect(screen.getByText("Transporte")).toBeInTheDocument();
    expect(screen.getByText("Renta")).toBeInTheDocument();

    const bars = container.querySelectorAll<HTMLDivElement>('[aria-hidden] > div');
    expect(bars).toHaveLength(3);
    const widths = Array.from(bars).map((bar) => parseInt(bar.style.width, 10));

    expect(widths[0]).toBe(100);
    expect(widths[1]).toBeLessThanOrEqual(widths[0]);
    expect(widths[2]).toBeLessThanOrEqual(widths[1]);

    for (const bar of Array.from(bars)) {
      expect(bar.style.width).not.toContain("NaN");
      expect(bar.style.width).not.toContain("undefined");
    }
  });

  it("assigns the same category id the same class across two separate renders", () => {
    const { container: containerA } = render(<CategorySpendList items={items} />);
    const barsA = containerA.querySelectorAll<HTMLDivElement>('[aria-hidden] > div');
    const classA = barsA[0].className;
    cleanup();

    const { container: containerB } = render(<CategorySpendList items={items} />);
    const barsB = containerB.querySelectorAll<HTMLDivElement>('[aria-hidden] > div');
    const classB = barsB[0].className;

    expect(classB).toBe(classA);
  });

  it("renders the EmptyState (never a bar) when the item list is empty", () => {
    const { container } = render(<CategorySpendList items={[]} />);

    expect(screen.getByText("Sin gastos por categoría")).toBeInTheDocument();
    expect(container.querySelectorAll('.h-2.w-full.overflow-hidden')).toHaveLength(0);
  });
});
