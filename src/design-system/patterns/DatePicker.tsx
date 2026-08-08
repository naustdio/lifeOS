"use client";

import { CalendarIcon } from "lucide-react";
import * as React from "react";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../ui/utils";

function isoToLocalDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function dateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface DatePickerProps {
  id?: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}

/**
 * Styled replacement for `<input type="date">` (design-system, change: finance-date-picker).
 * The browser's native date popup cannot be restyled with CSS in any browser — this composes
 * `Calendar` (react-day-picker) inside `Popover` behind a trigger styled to match `Input`
 * exactly, with a hidden `<input type="hidden">` carrying the ISO value so it keeps working
 * inside a plain `<form action={serverAction}>` exactly like every other field in this app —
 * same "hidden native input for form-action compatibility" pattern `Select` already uses.
 */
export function DatePicker({ id, name, defaultValue, required, className }: DatePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(() => isoToLocalDate(defaultValue));
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input type="hidden" name={name} value={date ? dateToISO(date) : ""} required={required} />
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-card border border-input bg-surface px-4 py-2 text-sm text-foreground transition-colors duration-200 ease-out hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !date && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {date ? date.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "Selecciona una fecha"}
          </span>
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(selected) => {
            setDate(selected);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
