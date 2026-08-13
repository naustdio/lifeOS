import { describe, expect, it } from "vitest";

// RED-first (tasks.md 5.1, threat-matrix row per design.md's Threat Matrix "Executable-file
// classification / untrusted content rendering"). `VideoEmbed.tsx` did not exist when this was
// written. Spec `recipes-video-reference` all four requirements.

const { resolveEmbed } = await import("@/design-system/patterns/VideoEmbed");

describe("resolveEmbed — video URL classification (recipes-module Phase 5)", () => {
  it("classifies a YouTube watch URL", () => {
    expect(resolveEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "youtube",
      src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });
  });

  it("classifies a YouTube embed URL", () => {
    expect(resolveEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual({
      kind: "youtube",
      src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });
  });

  it("classifies a youtu.be short URL", () => {
    expect(resolveEmbed("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      kind: "youtube",
      src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });
  });

  it("classifies a TikTok video URL", () => {
    expect(resolveEmbed("https://www.tiktok.com/@someuser/video/7123456789012345678")).toEqual({
      kind: "tiktok",
      src: "https://www.tiktok.com/embed/v2/7123456789012345678",
    });
  });

  it("classifies a Google Drive preview-eligible URL", () => {
    expect(resolveEmbed("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view")).toEqual({
      kind: "drive",
      src: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/preview",
    });
  });

  it("falls back to a plain link for an unrecognized-but-valid http(s) URL", () => {
    expect(resolveEmbed("https://example.com/some/recipe/video.mp4")).toEqual({
      kind: "link",
      href: "https://example.com/some/recipe/video.mp4",
    });
  });

  it("falls back to a plain link for a recognized-domain URL with an unmatched path shape", () => {
    expect(resolveEmbed("https://www.youtube.com/channel/UCabc123")).toEqual({
      kind: "link",
      href: "https://www.youtube.com/channel/UCabc123",
    });
  });

  it("rejects a javascript: URL as invalid", () => {
    expect(resolveEmbed("javascript:alert(1)")).toEqual({ kind: "invalid" });
  });

  it("rejects a data: URL as invalid", () => {
    expect(resolveEmbed("data:text/html,<script>alert(1)</script>")).toEqual({ kind: "invalid" });
  });
});
