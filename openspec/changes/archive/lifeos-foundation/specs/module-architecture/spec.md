# Module Architecture Specification

## Purpose

Defines the modular-monolith boundary rules — schema-per-module, folder structure, allowed dependency direction, and automated enforcement — so module isolation is established before Finance code exists, not retrofitted.

## Requirements

### Requirement: Schema-Per-Module
Each module MUST own a dedicated Postgres schema (`core`, `finance`, and later modules), and MUST NOT create tables inside another module's schema.

#### Scenario: Finance tables live in the finance schema
- GIVEN the Finance module's migrations run
- WHEN the resulting tables are inspected
- THEN all Finance tables exist under the `finance` schema, and none exist under `core`

### Requirement: Module Folder Structure
Each module's application code MUST live under `src/modules/{name}/` with `domain/`, `data/`, `ui/` subfolders, and MUST expose exactly one public barrel at `src/modules/{name}/api/` as its only cross-module entry point.

#### Scenario: Module exposes a single api barrel
- GIVEN the `finance` module's folder structure
- WHEN its exported public surface is inspected
- THEN only `src/modules/finance/api/` is importable by other modules; `domain/`, `data/`, and `ui/` are internal

### Requirement: Import Boundary Enforcement
An automated lint rule MUST forbid any module from importing another module's `domain/`, `data/`, or `ui/` files directly; only a target module's `api/` barrel MAY be imported cross-module. Violations MUST fail the build.

#### Scenario: Cross-module internal import is rejected
- GIVEN module A imports a file from `src/modules/finance/domain/` directly
- WHEN lint/build runs
- THEN the build fails with a boundary violation error

#### Scenario: Cross-module api import is allowed
- GIVEN module A imports from `src/modules/finance/api/`
- WHEN lint/build runs
- THEN no boundary violation is reported

### Requirement: Allowed Dependency Direction
`core` MUST be a foundational kernel with no dependency on any other module. `finance` MAY depend on `core`. Other future modules (e.g., `shopping_list`) MAY depend on `finance` and `core`, but `core` and `finance` MUST NOT depend on modules that depend on them.

#### Scenario: Finance may depend on core
- GIVEN `finance` module code imports from `src/modules/core/api/`
- WHEN lint/build runs
- THEN no violation is reported

#### Scenario: Core may not depend on finance
- GIVEN `core` module code imports from `src/modules/finance/api/`
- WHEN lint/build runs
- THEN the build fails with a boundary violation error (reverse dependency forbidden)

### Requirement: Boundary Rules Ship Before Feature Code
The ESLint import-boundary configuration MUST be present in the first commit that introduces the module folder structure, not added after Finance module code exists.

#### Scenario: Boundary lint exists at scaffold time
- GIVEN the initial app scaffold commit
- WHEN the ESLint configuration is inspected
- THEN the module-boundary import rule is already active, before any Finance domain code is added
