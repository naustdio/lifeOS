// Client-safe re-export of the pure category shape validator (change: finance-categories-icon-
// color C-016). Deliberately does NOT import "server-only" — unlike `./index.ts`, this file
// must be importable from a `"use client"` component (`CategoryEditor`) for the client-side
// preview of the depth/kind trigger. Still `module-api` under the ESLint boundary pattern
// `src/modules/*/api/**`, so `app` importing it satisfies Gate A. See `./index.ts`'s header
// comment for the full reasoning (same shape as `./budget-evaluation.ts`).
export { validateCategoryShape, type CategoryKind, type CategoryNode } from "../domain/category";
