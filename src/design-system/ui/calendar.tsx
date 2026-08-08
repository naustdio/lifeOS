"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { DayPicker } from "react-day-picker";
import { es } from "date-fns/locale/es";
import { buttonVariants } from "./button";
import { cn } from "./utils";

/**
 * Retokenized shadcn/originui Calendar (react-day-picker v9) — value swap: `originui`'s own
 * `Button`/`buttonVariants` replaced with this design system's `../ui/button`'s ghost/icon
 * variant, every color traces back to a `--*` semantic token (no raw hex), and the locale is
 * pinned to `es` (this app is Spanish-only) rather than left to the browser default.
 */
export type CalendarProps = React.ComponentProps<typeof DayPicker>;

const defaultClassNames = {
  months: "relative flex flex-col gap-4",
  month: "w-full",
  month_caption: "relative mx-10 mb-1 flex h-9 items-center justify-center",
  caption_label: "text-sm font-medium",
  nav: "absolute top-0 flex w-full justify-between",
  button_previous: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-9 p-0"),
  button_next: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-9 p-0"),
  weekday: "size-9 p-0 text-xs font-medium text-muted-foreground",
  day_button:
    "relative flex size-9 items-center justify-center whitespace-nowrap rounded-pill p-0 text-foreground outline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-accent group-data-[selected]:bg-primary group-data-[selected]:text-primary-foreground group-data-[disabled]:text-muted-foreground/40 group-data-[outside]:text-muted-foreground/40",
  day: "group size-9 px-0 text-sm",
  today: "font-semibold [&>button]:underline [&>button]:decoration-primary [&>button]:decoration-2 [&>button]:underline-offset-4",
  outside: "text-muted-foreground/40",
  hidden: "invisible",
};

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const mergedClassNames = { ...defaultClassNames, ...classNames };

  return (
    <DayPicker
      locale={es}
      showOutsideDays={showOutsideDays}
      className={cn("w-fit", className)}
      classNames={mergedClassNames}
      components={{
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" aria-hidden {...chevronProps} />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden {...chevronProps} />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
