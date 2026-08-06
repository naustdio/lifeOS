import {
  Baby,
  Banknote,
  Book,
  Briefcase,
  Bus,
  Car,
  ChefHat,
  CircleDashed,
  Clapperboard,
  Coffee,
  Coins,
  CreditCard,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Key,
  Landmark,
  type LucideIcon,
  PawPrint,
  Plane,
  Shirt,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Tag,
  TrendingUp,
  Utensils,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";

/**
 * Icon + color registries for category styling (design.md §3, change:
 * finance-categories-icon-color). Bounded, curated sets — explicit named Lucide imports only
 * (no dynamic import), full literal Tailwind class strings only (no interpolated names, which
 * Tailwind v4 cannot statically extract). Both key lists MUST stay in lockstep with the CHECK
 * constraints in supabase/migrations/20260804090017_finance_category_style.sql — the
 * registry/database parity test in tests/unit/category-style-registry.test.ts enforces this.
 */

export const CATEGORY_ICONS = {
  banknote: Banknote,
  briefcase: Briefcase,
  "trending-up": TrendingUp,
  gift: Gift,
  coins: Coins,
  utensils: Utensils,
  car: Car,
  house: House,
  "heart-pulse": HeartPulse,
  clapperboard: Clapperboard,
  "graduation-cap": GraduationCap,
  shirt: Shirt,
  sparkles: Sparkles,
  landmark: Landmark,
  tag: Tag,
  "shopping-cart": ShoppingCart,
  "chef-hat": ChefHat,
  fuel: Fuel,
  bus: Bus,
  wrench: Wrench,
  key: Key,
  zap: Zap,
  wifi: Wifi,
  plane: Plane,
  dumbbell: Dumbbell,
  baby: Baby,
  "paw-print": PawPrint,
  smartphone: Smartphone,
  book: Book,
  "gamepad-2": Gamepad2,
  coffee: Coffee,
  "credit-card": CreditCard,
  "circle-dashed": CircleDashed,
} as const satisfies Record<string, LucideIcon>;

export type CategoryIconKey = keyof typeof CATEGORY_ICONS;

/** Full literal class strings — Tailwind v4 cannot see an interpolated name. */
export const CATEGORY_COLORS = {
  neutral: { text: "text-muted-foreground", surface: "bg-muted" },
  red: { text: "text-category-red", surface: "bg-category-red-surface" },
  orange: { text: "text-category-orange", surface: "bg-category-orange-surface" },
  amber: { text: "text-category-amber", surface: "bg-category-amber-surface" },
  green: { text: "text-category-green", surface: "bg-category-green-surface" },
  teal: { text: "text-category-teal", surface: "bg-category-teal-surface" },
  blue: { text: "text-category-blue", surface: "bg-category-blue-surface" },
  violet: { text: "text-category-violet", surface: "bg-category-violet-surface" },
  pink: { text: "text-category-pink", surface: "bg-category-pink-surface" },
} as const satisfies Record<string, { text: string; surface: string }>;

export type CategoryColorKey = keyof typeof CATEGORY_COLORS;

export const FALLBACK_ICON_KEY = "circle-dashed" satisfies CategoryIconKey;
export const FALLBACK_COLOR_KEY = "neutral" satisfies CategoryColorKey;

function isCategoryIconKey(key: string): key is CategoryIconKey {
  return Object.hasOwn(CATEGORY_ICONS, key);
}

function isCategoryColorKey(key: string): key is CategoryColorKey {
  return Object.hasOwn(CATEGORY_COLORS, key);
}

/** Total function: any string (or null/undefined) in, a renderable icon component out. */
export function resolveCategoryIcon(key: string | null | undefined): LucideIcon {
  if (key && isCategoryIconKey(key)) {
    return CATEGORY_ICONS[key];
  }
  return CATEGORY_ICONS[FALLBACK_ICON_KEY];
}

/** Total function: any string (or null/undefined) in, a renderable class pair out. */
export function resolveCategoryColor(
  key: string | null | undefined,
): (typeof CATEGORY_COLORS)[CategoryColorKey] {
  if (key && isCategoryColorKey(key)) {
    return CATEGORY_COLORS[key];
  }
  return CATEGORY_COLORS[FALLBACK_COLOR_KEY];
}
