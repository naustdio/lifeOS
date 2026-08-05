"use client";

import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { centsToPesos } from "@/shared/money";

/**
 * Non-blocking over-budget confirmation shell (B-006). Presentational only:
 * props in, `onConfirm`/`onCancel` out, no data access, no domain import
 * beyond the plain numeric fields it needs to render the copy.
 */
export function OverBudgetDialog({
  limitCents,
  projectedSpentCents,
  onConfirm,
  onCancel,
}: {
  limitCents: number;
  projectedSpentCents: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 pt-6">
          <h3 className="text-base font-semibold">Vas a superar tu presupuesto</h3>
          <p className="text-sm text-muted-foreground">
            Con este movimiento llegarías a {centsToPesos(projectedSpentCents).toFixed(2)} MXN de un
            límite de {centsToPesos(limitCents).toFixed(2)} MXN este mes. ¿Deseas continuar de todos
            modos?
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="button" className="flex-1" onClick={onConfirm}>
              Continuar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
