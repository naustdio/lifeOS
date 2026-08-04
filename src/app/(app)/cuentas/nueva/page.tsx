import Link from "next/link";
import { AccountForm } from "../AccountForm";

export default function NewAccountPage() {
  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Nueva cuenta</h2>
        <Link href="/cuentas" className="text-sm text-muted-foreground underline underline-offset-2">
          Cancelar
        </Link>
      </div>
      <AccountForm />
    </main>
  );
}
