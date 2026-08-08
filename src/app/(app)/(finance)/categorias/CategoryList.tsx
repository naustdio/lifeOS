"use client";

import { useActionState, useState } from "react";
import { Layers } from "lucide-react";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { CategoryChip } from "@/design-system/patterns/CategoryChip";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import type { CategoryTreeItem } from "@/modules/finance/api";
import { archiveCategoryAction, type CategoryFormState } from "./actions";
import { CategoryEditor } from "./CategoryEditor";

const INITIAL_STATE: CategoryFormState = { error: null };

type EditorTarget =
  | { mode: "create" }
  | { mode: "edit"; category: CategoryTreeItem };

/**
 * Client list for the `/categorias` management screen (design.md §5, change:
 * finance-categories-icon-color C-017): two-level tree grouped by kind (Ingresos/Gastos), row
 * renders `<CategoryChip iconKey colorKey name />` plus rename/archive actions, "Nueva
 * categoría" opens `CategoryEditor` in create mode.
 */
export function CategoryList({ tree }: { tree: CategoryTreeItem[] }) {
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);

  const topLevel = tree.filter((c) => c.parentId === null);
  const incomeRoots = topLevel.filter((c) => c.kind === "income");
  const expenseRoots = topLevel.filter((c) => c.kind === "expense");

  const parentOptions = topLevel.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parentId,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Categorías</h2>
        <Button size="sm" onClick={() => setEditorTarget({ mode: "create" })}>
          Nueva categoría
        </Button>
      </div>

      {tree.length === 0 ? (
        <EmptyState
          icon={Layers}
          heading="Aún no hay categorías"
          description="Crea tu primera categoría para empezar a organizar tus movimientos."
        />
      ) : (
        <>
          <CategoryGroup
            heading="Ingresos"
            roots={incomeRoots}
            onEdit={(category) => setEditorTarget({ mode: "edit", category })}
          />
          <CategoryGroup
            heading="Gastos"
            roots={expenseRoots}
            onEdit={(category) => setEditorTarget({ mode: "edit", category })}
          />
        </>
      )}

      {editorTarget && (
        <CategoryEditor
          mode={editorTarget.mode}
          initial={
            editorTarget.mode === "edit"
              ? {
                  id: editorTarget.category.id,
                  name: editorTarget.category.name,
                  kind: editorTarget.category.kind,
                  parentId: editorTarget.category.parentId,
                  icon: editorTarget.category.icon,
                  color: editorTarget.category.color,
                }
              : null
          }
          parentOptions={parentOptions}
          onClose={() => setEditorTarget(null)}
        />
      )}
    </div>
  );
}

function CategoryGroup({
  heading,
  roots,
  onEdit,
}: {
  heading: string;
  roots: CategoryTreeItem[];
  onEdit: (category: CategoryTreeItem) => void;
}) {
  if (roots.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{heading}</h3>
      <Card>
        <CardContent className="divide-y divide-border/60 py-2">
          {roots.map((category) => (
            <div key={category.id} className="flex flex-col gap-2 py-2">
              <CategoryRow category={category} onEdit={onEdit} />
              {category.children.length > 0 && (
                <div className="flex flex-col gap-2 pl-6">
                  {category.children.map((child) => (
                    <CategoryRow key={child.id} category={child} onEdit={onEdit} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryRow({
  category,
  onEdit,
}: {
  category: CategoryTreeItem;
  onEdit: (category: CategoryTreeItem) => void;
}) {
  const [archiveState, archiveAction, archivePending] = useActionState(archiveCategoryAction, INITIAL_STATE);

  return (
    <div className="flex items-center justify-between gap-2">
      <CategoryChip
        name={category.name + (category.archivedAt ? " (inactiva)" : "")}
        iconKey={category.icon}
        colorKey={category.color}
      />
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(category)}>
          Editar
        </Button>
        {!category.archivedAt && (
          <form
            action={(formData) => {
              formData.set("id", category.id);
              archiveAction(formData);
            }}
          >
            <Button type="submit" variant="ghost" size="sm" disabled={archivePending}>
              {archivePending ? "Desactivando…" : "Desactivar"}
            </Button>
          </form>
        )}
      </div>
      {archiveState.error && <p className="text-xs text-expense">{archiveState.error}</p>}
    </div>
  );
}
