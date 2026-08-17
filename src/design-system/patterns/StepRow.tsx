"use client";

import { Reorder, useDragControls } from "motion/react";
import { GripVertical, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
 *
 * Ingredient @mentions (UI-polish fast-follow): typing "@" starts a lookup against this recipe's
 * own ingredient names (`ingredientNames`, live from `RecipeForm`'s ingredient rows). Picking a
 * suggestion inserts "@Name " as plain text — no structured data model change, no new step field.
 * `RecipeDetail` re-matches "@Name" substrings against the recipe's ingredients at render time to
 * turn them into clickable chips, so a later rename just stops matching instead of breaking.
 */
export type StepDraft = { id: string; instruction: string };

export function StepRow({
  step,
  index,
  ingredientNames,
  onChange,
  onRemove,
}: {
  step: StepDraft;
  index: number;
  ingredientNames: string[];
  onChange: (instruction: string) => void;
  onRemove: () => void;
}) {
  const dragControls = useDragControls();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return ingredientNames.filter((name) => name.toLowerCase().includes(query)).slice(0, 5);
  }, [ingredientNames, mentionQuery]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    onChange(value);

    const cursor = e.target.selectionStart ?? value.length;
    const uptoCursor = value.slice(0, cursor);
    const atIndex = uptoCursor.lastIndexOf("@");
    if (atIndex === -1 || /\s/.test(uptoCursor.slice(atIndex + 1))) {
      setMentionStart(null);
      setMentionQuery(null);
      return;
    }
    setMentionStart(atIndex);
    setMentionQuery(uptoCursor.slice(atIndex + 1));
  }

  function pickMention(name: string) {
    if (mentionStart === null) return;
    const cursor = inputRef.current?.selectionStart ?? step.instruction.length;
    const before = step.instruction.slice(0, mentionStart);
    const after = step.instruction.slice(cursor);
    const next = `${before}@${name} ${after}`;
    onChange(next);
    setMentionStart(null);
    setMentionQuery(null);

    const nextCursor = before.length + name.length + 2;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

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
      <div className="relative min-w-0 flex-1">
        <Input
          ref={inputRef}
          id={`step_${step.id}`}
          value={step.instruction}
          onChange={handleChange}
          onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
          placeholder={`Paso ${index + 1} (usa @ para citar un ingrediente)`}
          required
          className="w-full"
        />
        {mentionQuery !== null && suggestions.length > 0 && (
          <ul className="absolute top-full left-0 z-10 mt-1 flex w-full flex-col overflow-hidden rounded-card border border-border bg-card shadow-soft-lg">
            {suggestions.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickMention(name)}
                  className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
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
