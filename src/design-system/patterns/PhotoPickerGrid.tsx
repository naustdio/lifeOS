"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Staged photo picker — thumbnail grid + "+" tile, adapted from a pasted UploadThing-style
 * component (nutrition-submodule fast-follow, 5th live-testing round) but native to this repo's
 * upload path: files stay purely client-side (`URL.createObjectURL` previews only) until the
 * surrounding form submits as a whole — no separate upload step, no UploadThing dependency. The
 * real `<input type="file" name={name}>` stays ALWAYS mounted (never conditionally rendered) so
 * `FormData` on submit always finds it under `name`, even once the max is reached and the "+"
 * tile itself stops rendering — an earlier draft hid the whole `<label>` (input included) once
 * `maxImages` was hit, which would have silently dropped every already-picked file from the
 * submission. `.files` are kept in sync with the staged array via `DataTransfer` on every add or
 * remove, since native file inputs replace rather than append on each pick.
 */
export function PhotoPickerGrid({
  name,
  maxImages,
  accept = "image/jpeg,image/png,image/webp",
}: {
  name: string;
  maxImages: number;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only, not re-run per photos change
  }, []);

  function syncInputFiles(next: { file: File }[]) {
    // `DataTransfer` is unavailable in jsdom (test environment) — real browsers always have it.
    if (typeof DataTransfer === "undefined" || !inputRef.current) return;
    const dt = new DataTransfer();
    next.forEach((p) => dt.items.add(p.file));
    inputRef.current.files = dt.files;
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    const room = maxImages - photos.length;
    const accepted = incoming.slice(0, Math.max(room, 0));

    setWarning(incoming.length > accepted.length ? `Solo se agregaron ${accepted.length} — máximo ${maxImages} fotos por visita.` : null);

    const next = [...photos, ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))];
    setPhotos(next);
    syncInputFiles(next);
  }

  function handleRemove(index: number) {
    const removed = photos[index];
    const next = photos.filter((_, i) => i !== index);
    setPhotos(next);
    syncInputFiles(next);
    URL.revokeObjectURL(removed.previewUrl);
    setWarning(null);
  }

  const canAddMore = photos.length < maxImages;

  return (
    <div className="flex flex-col gap-2">
      {/* Always mounted — see header note. Visually hidden; the "+" tile below triggers it. */}
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        multiple
        onChange={(e) => handleFilesSelected(e.target.files)}
        className="hidden"
        aria-label="Agregar fotos"
      />

      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <div key={p.previewUrl} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not an optimizable static asset */}
            <img src={p.previewUrl} alt="Foto seleccionada" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => handleRemove(i)}
              className="absolute top-1 right-1 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Quitar foto"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {canAddMore && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border transition-colors hover:border-primary/50 hover:bg-accent/50"
          >
            <Plus className="h-6 w-6 text-muted-foreground" aria-hidden />
            <span className="text-xs text-muted-foreground">
              {photos.length}/{maxImages}
            </span>
          </button>
        )}
      </div>
      {warning && <p className="text-xs text-expense">{warning}</p>}
    </div>
  );
}
