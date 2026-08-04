import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import boundaries from "eslint-plugin-boundaries";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: {
      boundaries,
    },
    settings: {
      "boundaries/include": ["src/**/*"],
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "design-system", pattern: "src/design-system/**" },
        { type: "shared", pattern: "src/shared/**" },
        {
          type: "module-api",
          pattern: "src/modules/*/api/**",
          capture: ["module"],
        },
        {
          type: "module-domain",
          pattern: "src/modules/*/domain/**",
          capture: ["module"],
        },
        {
          type: "module-data",
          pattern: "src/modules/*/data/**",
          capture: ["module"],
        },
        {
          type: "module-ui",
          pattern: "src/modules/*/ui/**",
          capture: ["module"],
        },
      ],
    },
    rules: {
      "boundaries/no-unknown": "error",
      // Gate A (design.md §2): only a module's `api/` barrel is a valid
      // cross-module door. Everything else cross-module is disallowed by
      // default.
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            {
              from: "app",
              allow: ["module-api", "design-system", "shared"],
            },
            { from: "design-system", allow: ["design-system", "shared"] },
            { from: "shared", allow: ["shared"] },
            {
              from: "module-api",
              allow: [
                ["module-domain", { module: "${from.module}" }],
                ["module-data", { module: "${from.module}" }],
                "shared",
              ],
            },
            {
              from: "module-ui",
              allow: [
                ["module-domain", { module: "${from.module}" }],
                ["module-data", { module: "${from.module}" }],
                "module-api",
                "design-system",
                "shared",
              ],
            },
            {
              from: "module-data",
              allow: [
                ["module-domain", { module: "${from.module}" }],
                "shared",
              ],
            },
            { from: "module-domain", allow: ["shared"] },
          ],
        },
      ],
      // Gate B (design.md §2): dependency direction. `finance` may depend on
      // `core`; `core` may never import `finance`; money-producing modules
      // depend on `finance`, never the reverse.
      "boundaries/external": [
        "off",
      ],
    },
  },
  {
    // Gate B, module-scoped dependency direction: `core` must never import
    // `finance` (any layer), even through the api barrel.
    files: ["src/modules/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/modules/finance/**", "@/modules/finance/**"],
              message:
                "core is the foundational kernel and must not depend on finance (design.md §2 Gate B).",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "public/sw.js",
      "tests/boundary-fixtures/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
