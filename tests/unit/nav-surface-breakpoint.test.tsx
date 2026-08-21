import { cleanup, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NavPill } from "@/design-system/ui/nav-pill";
import { Sidebar } from "@/design-system/ui/sidebar";

/**
 * Breakpoint proxy tests (change: tablet-web-sidebar-layout, tasks.md PR2 2.4, design.md
 * "Testing Strategy"). jsdom cannot evaluate CSS media queries, so real viewport-based visibility
 * cannot be asserted here — this asserts the exact class strings that drive Tailwind's `md:`
 * (768px) breakpoint switch instead (adaptive-navigation spec: "Exactly One Nav Surface
 * Visible"). Manual visual verification at 375/768/1024/1280px covers the real behavior
 * (tasks.md PR2 3.1).
 */
describe("Nav surface breakpoint classes", () => {
  afterEach(() => cleanup());

  it("NavPill's rendered class string contains md:hidden (hides below md, i.e. hidden at md+)", () => {
    const { container } = render(<NavPill />);
    expect(container.firstElementChild).toHaveClass("md:hidden");
  });

  it("Sidebar's rendered class string contains hidden md:flex (hidden below md, visible at md+)", () => {
    const { container } = render(<Sidebar />);
    expect(container.firstElementChild).toHaveClass("hidden");
    expect(container.firstElementChild).toHaveClass("md:flex");
  });
});
