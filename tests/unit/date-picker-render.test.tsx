import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DatePicker } from "@/design-system/patterns/DatePicker";

/**
 * RTL smoke-render for `DatePicker` (design-system, change: finance-date-picker): the trigger
 * shows a placeholder when unset and a formatted date when a `defaultValue` is provided, the
 * hidden input carries the ISO value a plain `<form action={serverAction}>` reads by `name`
 * (same "hidden native input" contract `Select` already establishes), and picking a day updates
 * both the visible trigger text and the hidden input's value.
 */
describe("DatePicker — smoke render", () => {
  afterEach(() => cleanup());

  it("shows a placeholder and an empty hidden input value when unset", () => {
    const { container } = render(<DatePicker name="occurredOn" />);

    expect(screen.getByText("Selecciona una fecha")).toBeInTheDocument();
    const hidden = container.querySelector('input[name="occurredOn"]');
    expect(hidden).toHaveValue("");
  });

  it("shows the formatted date and the ISO hidden value when defaultValue is set", () => {
    const { container } = render(<DatePicker name="occurredOn" defaultValue="2026-08-08" />);

    expect(screen.getByText(/8 de agosto de 2026/i)).toBeInTheDocument();
    const hidden = container.querySelector('input[name="occurredOn"]');
    expect(hidden).toHaveValue("2026-08-08");
  });

  it("opens the calendar popover and picking a day updates the trigger text and the hidden input", () => {
    const { container } = render(<DatePicker name="occurredOn" defaultValue="2026-08-08" />);

    fireEvent.click(screen.getByText(/8 de agosto de 2026/i));
    // react-day-picker renders each day as a grid cell button labelled with its full date.
    fireEvent.click(screen.getByRole("gridcell", { name: /15/ }).querySelector("button")!);

    expect(screen.getByText(/15 de agosto de 2026/i)).toBeInTheDocument();
    const hidden = container.querySelector('input[name="occurredOn"]');
    expect(hidden).toHaveValue("2026-08-15");
  });
});
