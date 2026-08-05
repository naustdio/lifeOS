import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ProgressBar } from "@/design-system/patterns/ProgressBar";

describe("ProgressBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("clamps to 100% and formats the value/limit label", () => {
    render(<ProgressBar valueCents={500000} limitCents={300000} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("5000.00 / 3000.00 MXN")).toBeInTheDocument();
  });

  it("flags at-or-over-limit spend with the expense color class", () => {
    render(<ProgressBar valueCents={300000} limitCents={300000} />);
    const label = screen.getByText("3000.00 / 3000.00 MXN");
    expect(label.className).toContain("text-expense");
  });

  it("does not flag under-limit spend as at/over", () => {
    render(<ProgressBar valueCents={100000} limitCents={300000} />);
    const label = screen.getByText("1000.00 / 3000.00 MXN");
    expect(label.className).toContain("text-muted-foreground");
  });

  it("survives limitCents === 0 without NaN or a divide-by-zero crash", () => {
    render(<ProgressBar valueCents={0} limitCents={0} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("0.00 / 0.00 MXN")).toBeInTheDocument();
  });

  it("renders a custom label when provided", () => {
    render(<ProgressBar valueCents={100} limitCents={200} label="custom label" />);
    expect(screen.getByText("custom label")).toBeInTheDocument();
  });
});
