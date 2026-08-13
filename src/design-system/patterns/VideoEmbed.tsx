// no module-domain imports (design.md Decision 5) — same zero-import-boundary constraint as
// MetricTrendChart.tsx / PhotoPickerGrid.tsx.

type EmbedKind = "youtube" | "tiktok" | "drive" | "link" | "invalid";
type EmbedResult = { kind: EmbedKind; src?: string; href?: string };

const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const TIKTOK_RE = /tiktok\.com\/.*\/video\/(\d+)/;
const DRIVE_RE = /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/;

/**
 * Classifies a user-supplied `video_url` into a renderable embed or a plain-link fallback.
 * Pure URL-pattern matching, no oEmbed network fetch (design.md Decision 5) — the app never
 * downloads or re-hosts video bytes. Rejects any scheme other than http/https as `invalid`
 * (design.md Threat Matrix "Executable-file classification / untrusted content rendering") so a
 * `javascript:`/`data:` URL never reaches an `iframe src` or `<a href>`.
 */
export function resolveEmbed(url: string): EmbedResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "invalid" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { kind: "invalid" };
  }

  const youtubeMatch = url.match(YOUTUBE_RE);
  if (youtubeMatch) {
    return { kind: "youtube", src: `https://www.youtube.com/embed/${youtubeMatch[1]}` };
  }

  const tiktokMatch = url.match(TIKTOK_RE);
  if (tiktokMatch) {
    return { kind: "tiktok", src: `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}` };
  }

  const driveMatch = url.match(DRIVE_RE);
  if (driveMatch) {
    return { kind: "drive", src: `https://drive.google.com/file/d/${driveMatch[1]}/preview` };
  }

  return { kind: "link", href: url };
}

/**
 * Renders a recognized-platform embed as a sandboxed iframe, an unrecognized-but-valid URL as a
 * plain external link, or nothing for an invalid URL. Locally-declared props, zero module
 * imports (design.md Decision 5).
 */
export function VideoEmbed({ url, title }: { url: string; title?: string }) {
  const embed = resolveEmbed(url);

  if (embed.kind === "invalid") {
    return null;
  }

  if (embed.kind === "link") {
    return (
      <a href={embed.href} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline underline-offset-2">
        Ver video
      </a>
    );
  }

  return (
    <iframe
      src={embed.src}
      title={title ?? "Video de la receta"}
      className="aspect-video w-full rounded-lg"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      allow="encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
