import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DueRecurringBanner } from "@/design-system/patterns/DueRecurringBanner";

/**
 * RTL smoke-render for `DueRecurringBanner` (design.md §11, change: finance-recurring R-022):
 * renders only when `count > 0`, pluralizes correctly, and links to `/recurrentes`.
 */

describe("DueRecurringBanner — smoke render (R-022)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when count is 0", () => {
    const { container } = render(<DueRecurringBanner count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("singularizes the copy for exactly one due item", () => {
    render(<DueRecurringBanner count={1} />);
    expect(screen.getByText("1 recurrente por confirmar")).toBeInTheDocument();
  });

  it("pluralizes the copy for multiple due items", () => {
    render(<DueRecurringBanner count={3} />);
    expect(screen.getByText("3 recurrentes por confirmar")).toBeInTheDocument();
  });

  it("links the whole row to /recurrentes", () => {
    render(<DueRecurringBanner count={2} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/recurrentes");
  });
});
