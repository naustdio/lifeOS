"use client";

import { Reorder, useDragControls } from "motion/react";
import { GripVertical, X } from "lucide-react";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";

/**
 * One numbered instruction row for `RecipeForm`, reordered by dragging a handle (via `motion`'s
 * `Reorder.Item`) and removed with the X button (recipes-module design.md File Changes). Locally-
 * declared props, zero module imports. `id` is a client-only stable identity for the drag/React
 * key — never persisted, `RecipeForm` derives the saved `position` from array order at submit.
 *
 * The drag handle uses `dragListener={false}` + `useDragControls` so dragging is opt-in from the
 * grip icon only — the instruction `Input` stays freely clickable/selectable without accidentally
 * starting a drag.
 */
export type StepDraft = { id: string; instruction: string };

export function StepRow({
  step,
  index,
  onChange,
  onRemove,
}: {
  step: StepDraft;
  index: number;
  onChange: (instruction: string) => void;
  onRemove: () => void;
}) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item value={step} dragListener={false} dragControls={dragControls} className="flex items-center gap-2">
      <button
        type="button"
        onPointerDown={(e) => dragControls.start(e)}
        className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
        aria-label={`Arrastrar para reordenar paso ${index + 1}`}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-secondary text-sm font-medium text-secondary-foreground">
        {index + 1}
      </span>
      <Input
        id={`step_${step.id}`}
        value={step.instruction}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Paso ${index + 1}`}
        required
        className="flex-1"
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-full"
        onClick={onRemove}
        aria-label={`Quitar paso ${index + 1}`}
      >
        <X className="h-4 w-4" aria-hidden />
      </Button>
    </Reorder.Item>
  );
}
