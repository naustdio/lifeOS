import { BalanceHero } from "@/design-system/patterns/BalanceHero";
import { FabMenu } from "@/design-system/patterns/FabMenu";
import { NavPill } from "@/design-system/ui/nav-pill";
import { ThemeToggle } from "@/design-system/ui/theme-toggle";

/**
 * Scaffold placeholder home screen for sub-slice 1A — proves the design
 * system tokens/components/theme mechanism render end to end. The real
 * authenticated shell, sign-in flow, and balance data land in sub-slices
 * 1B and 2C.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 pb-28 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">LifeOS</h1>
        <ThemeToggle />
      </div>
      <BalanceHero formatted="$0.00" />
      <NavPill>
        <span className="text-sm">Inicio</span>
        <FabMenu />
        <span className="text-sm">Cuentas</span>
      </NavPill>
    </main>
  );
}
