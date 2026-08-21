import Link from "next/link";
import * as React from "react";
import { cn } from "./utils";

/**
 * Tablet/desktop sidebar chrome (change: tablet-web-sidebar-layout, design.md decision 2).
 * Dumb, prop-driven — holds zero route/module data, matching `eslint-plugin-boundaries`
 * (`design-system` may only import `design-system`/`shared`). Hidden below `md` (768px);
 * `SidebarNav` (the pattern that owns `usePathname` and the registry) is the only caller.
 */
export const Sidebar = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, children, ...props }, ref) => (
  <nav
    ref={ref}
    className={cn(
      "hidden md:flex md:sticky md:top-0 md:h-screen w-60 shrink-0 flex-col gap-1.5 border-r border-border py-8 pr-3",
      className,
    )}
    {...props}
  >
    {children}
  </nav>
));
Sidebar.displayName = "Sidebar";

export interface SidebarNavItemProps {
  href: string;
  label: string;
  /** Whether this item matches the current route (design.md decision 2 — the caller resolves
   * this via `active-route.ts`; the primitive itself never inspects the pathname). */
  active?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A single sidebar destination. Active state is expressed via `aria-current="page"` plus
 * token-based highlighting (design-system spec: "Sidebar item highlights the active route").
 */
export function SidebarNavItem({
  href,
  label,
  active = false,
  icon,
  children,
}: SidebarNavItemProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-card px-3 py-2.5 text-sm font-medium transition-colors duration-200 ease-out",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
