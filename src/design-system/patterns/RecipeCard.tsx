import { BookOpen, Clock } from "lucide-react";
import Link from "next/link";

/**
 * Photo-forward recipe card — image, title, category subtitle, and (where a reference component
 * had an arrow button) a prep-duration badge instead, since this card links to the recipe detail
 * rather than triggering an action inline. Adapted from a pasted reference (a location card with
 * a progressive-blur gradient over a photo) onto this design system's tokens — no raw hex, no
 * price/counter (out of scope, the reference was a shopping-cart pattern). Falls back to a plain
 * icon tile when the recipe has no photo yet, rather than a broken/empty image.
 *
 * The blur/gradient is a plain CSS mask (`design.md`'s existing convention for effects that don't
 * need JS), not `ProgressiveBlur`'s two-layer DOM split — one image, one gradient overlay, is
 * enough here since there's no text sitting independently in front of a blurred backdrop.
 */
export function RecipeCard({
  href,
  title,
  categoryLabel,
  photoUrl,
  prepMinutes,
}: {
  href: string;
  title: string;
  categoryLabel: string;
  photoUrl: string | null;
  prepMinutes: number | null;
}) {
  return (
    <Link
      href={href}
      className="group relative block aspect-[4/5] overflow-hidden rounded-card border-4 border-card bg-secondary shadow-soft transition-all duration-300 hover:shadow-soft-lg hover:scale-[1.02]"
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed private-bucket URL, not an optimizable static asset
        <img
          src={photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <BookOpen className="h-10 w-10 text-muted-foreground" aria-hidden />
        </div>
      )}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
        style={{
          background: "linear-gradient(to top, rgb(0 0 0 / 0.75), rgb(0 0 0 / 0.35) 60%, transparent)",
        }}
      />

      {prepMinutes !== null && (
        <span className="absolute top-3 right-3 flex shrink-0 items-center gap-1 rounded-pill bg-card px-2.5 py-1.5 text-xs font-medium text-card-foreground shadow-soft">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {prepMinutes} min
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-col p-3">
        <span className="truncate text-sm font-semibold text-white">{title}</span>
        <span className="truncate text-xs text-white/85">{categoryLabel}</span>
      </div>
    </Link>
  );
}
