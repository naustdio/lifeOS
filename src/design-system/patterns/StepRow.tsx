"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";

/**
 * One numbered instruction row for `RecipeForm`, with reorder handles (up/down) and a remove
 * button (recipes-module design.md File Changes). Locally-declared props, zero module imports.
 */
export function StepRow({
  index,
  instruction,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  instruction: string;
  isFirst: boolean;
  isLast: boolean;
  onChange: (instruction: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-secondary text-sm font-medium text-secondary-foreground">
        {index + 1}
      </span>
      <Input
        id={`step_${index}`}
        value={instruction}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Paso ${index + 1}`}
        required
        className="flex-1"
      />
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label={`Subir paso ${index + 1}`}
        >
          <ChevronUp className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label={`Bajar paso ${index + 1}`}
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
        </Button>
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
      </div>
    </div>
  );
}
