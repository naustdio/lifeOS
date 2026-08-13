"use client";

import { useActionState, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/design-system/ui/select";
import { flipsClass, transitionLoss, type AccountType } from "@/modules/finance/api/account-shape";
import { formatCentsAsMXN } from "@/shared/money";
import {
  deleteAccountAction,
  setAccountArchivedAction,
  updateAccountAction,
  type AccountFormState,
} from "../../actions";
import { AccountTypeFields } from "../../AccountTypeFields";

const TYPE_LABELS: Record<string, string> = {
  cash: "Efectivo",
  checking: "Cuenta de cheques",
  savings: "Ahorros",
  credit_card: "Tarjeta de crédito",
  liability: "Préstamo / deuda",
  savings_goal: "Meta de ahorro",
  investment: "Inversiones",
  loaned: "Prestado",
};

const INITIAL_STATE: AccountFormState = { error: null };

export type EditAccountDetail = {
  id: string;
  name: string;
  type: AccountType;
  class: "asset" | "liability";
  balanceCents: number;
  archivedAt: string | null;
  liability?: {
    interestRateBp: number;
    termMonths: number;
    monthlyPaymentCents: number;
    startDate: string;
  };
  goal?: { targetAmountCents: number; targetDate: string | null };
  investment?: { costBasisCents: number; currentValueCents: number; valuedOn: string };
  loaned?: {
    counterpartyName: string;
    originalAmountCents: number;
    termMonths: number | null;
    expectedReturnDate: string | null;
  };
  // CRITICAL-1 fix (sdd-verify finance-account-edit): the account's REAL saved card terms, so
  // `AccountTypeFields` can prefill them instead of rendering blanks for an existing card.
  card?: {
    creditLimitCents: number | null;
    statementDay: number | null;
    dueDay: number | null;
    minPaymentCents: number | null;
  };
};

/**
 * Edit form for an existing account (change: finance-account-edit T4.2/T4.4/T4.5). Reuses
 * `AccountTypeFields.tsx` (Slice 3 extraction) so the create and edit flows stay byte-identical
 * per field. Three independent sub-forms, each its own `useActionState`:
 *  - "Guardar" (rename/retype), gated by an inline confirmation panel when the type change
 *    discards detail fields and/or flips `class` (design.md Decision 6).
 *  - Pause/reactivate, gated by `window.confirm` (matches `RecurringList.tsx`'s convention).
 *  - Delete, gated by typing the account's exact name (higher-stakes than pause, so no
 *    `window.confirm` — design.md Decision 6).
 */
export function EditAccountForm({ account }: { account: EditAccountDetail }) {
  const [editState, editAction, editPending] = useActionState(updateAccountAction, INITIAL_STATE);
  const [archiveState, archiveAction, archivePending] = useActionState(setAccountArchivedAction, INITIAL_STATE);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteAccountAction, INITIAL_STATE);
  const [, startTransition] = useTransition();

  const [type, setType] = useState<AccountType>(account.type);
  const [pendingSave, setPendingSave] = useState<FormData | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const loss = transitionLoss(account.type, type);
  const flip = flipsClass(account.type, type);
  const hasTypeChange = type !== account.type;

  function handleSaveSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    if (hasTypeChange && (loss.length > 0 || flip)) {
      event.preventDefault();
      setPendingSave(formData);
    }
  }

  function confirmSave() {
    if (!pendingSave) return;
    const formData = pendingSave;
    setPendingSave(null);
    startTransition(() => editAction(formData));
  }

  function cancelSave() {
    setPendingSave(null);
  }

  function handlePauseClick(nextArchived: boolean) {
    const message = nextArchived
      ? "¿Pausar esta cuenta? Se ocultará de las listas activas y del balance; sus movimientos se conservan y podrás reactivarla cuando quieras."
      : "¿Reactivar esta cuenta?";
    if (nextArchived && !window.confirm(message)) return;
    const formData = new FormData();
    formData.set("accountId", account.id);
    formData.set("archived", String(nextArchived));
    startTransition(() => archiveAction(formData));
  }

  const deleteEnabled = deleteConfirmText.trim() === account.name;

  function handleDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    if (!deleteEnabled) {
      event.preventDefault();
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {!pendingSave ? (
        <form action={editAction} onSubmit={handleSaveSubmit} className="flex flex-col gap-4">
          <h3 className="text-sm font-medium text-muted-foreground">Datos de la cuenta</h3>
          <input type="hidden" name="accountId" value={account.id} />

          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium">
              Nombre
            </label>
            <Input id="name" name="name" required maxLength={60} defaultValue={account.name} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="type" className="text-sm font-medium">
              Tipo de cuenta
            </label>
            <Select name="type" value={type} onValueChange={(v) => setType(v as AccountType)}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Live inline detail-loss warning — informational, updates as the Select changes,
                not a separate confirm step (design.md Decision 2/6, spec: Change Account Type
                With Detail-Loss Warning). */}
            {hasTypeChange && loss.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Al cambiar el tipo se van a borrar: {loss.map((l) => l.label).join(", ")}.
              </p>
            )}
          </div>

          <AccountTypeFields
            type={type}
            defaults={{
              liability: account.liability,
              goal: account.goal,
              investment: account.investment,
              loaned: account.loaned,
              card: account.card,
            }}
          />

          {editState.error && <p className="text-sm text-expense">{editState.error}</p>}
          <Button type="submit" disabled={editPending}>
            {editPending ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      ) : (
        // Inline confirmation panel (design.md Decision 6): ONE panel, two clearly separated
        // blocks when both apply, single "Confirmar" button — not two stacked dialogs.
        <div className="flex flex-col gap-4 rounded-card border border-border p-4">
          <h3 className="text-sm font-medium">Confirmar cambio de tipo</h3>
          {loss.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Se van a borrar estos datos:</p>
              <p className="text-sm text-muted-foreground">{loss.map((l) => l.label).join(", ")}</p>
            </div>
          )}
          {flip && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Esto mueve dinero entre disponible y deuda:</p>
              <p className="text-sm text-muted-foreground">
                {account.class === "asset"
                  ? `${formatCentsAsMXN(Math.abs(account.balanceCents))} se van a mover de tu disponible a tu deuda.`
                  : `${formatCentsAsMXN(Math.abs(account.balanceCents))} se van a mover de tu deuda a tu disponible.`}
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={confirmSave} disabled={editPending}>
              {editPending ? "Guardando…" : "Confirmar"}
            </Button>
            <Button type="button" variant="secondary" onClick={cancelSave}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <h3 className="text-sm font-medium text-muted-foreground">
          {account.archivedAt ? "Cuenta pausada" : "Pausar cuenta"}
        </h3>
        <p className="text-xs text-muted-foreground">
          {account.archivedAt
            ? "Esta cuenta está pausada: no aparece en las listas activas ni en el balance. Sus movimientos se conservan."
            : "Pausar oculta la cuenta de las listas activas y del balance sin borrar su historial. Puedes reactivarla cuando quieras."}
        </p>
        {archiveState.error && <p className="text-sm text-expense">{archiveState.error}</p>}
        <Button
          type="button"
          variant="secondary"
          disabled={archivePending}
          onClick={() => handlePauseClick(!account.archivedAt)}
        >
          {archivePending ? "Guardando…" : account.archivedAt ? "Reactivar cuenta" : "Pausar cuenta"}
        </Button>
      </div>

      <form
        action={deleteAction}
        onSubmit={handleDeleteSubmit}
        className="flex flex-col gap-3 border-t border-border pt-6"
      >
        <h3 className="text-sm font-medium text-muted-foreground">Eliminar cuenta</h3>
        <p className="text-xs text-muted-foreground">
          Esta acción es permanente y solo funciona si la cuenta no tiene movimientos registrados.
          Si tiene historial, pausarla es la alternativa.
        </p>
        <input type="hidden" name="accountId" value={account.id} />
        <label htmlFor="deleteConfirmName" className="text-sm font-medium">
          Escribe &quot;{account.name}&quot; para confirmar
        </label>
        <Input
          id="deleteConfirmName"
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          placeholder={account.name}
        />
        {deleteState.error && <p className="text-sm text-expense">{deleteState.error}</p>}
        <Button type="submit" variant="destructive" disabled={!deleteEnabled || deletePending}>
          {deletePending ? "Eliminando…" : "Eliminar cuenta"}
        </Button>
      </form>
    </div>
  );
}
