# Recipes Video Reference Specification

## Purpose

One optional video URL per recipe, rendered as a native embed for recognized platforms with a plain-link fallback otherwise; the app never stores, downloads, transcodes, or re-hosts video bytes.

## Requirements

### Requirement: At Most One Optional Video URL Per Recipe

A recipe MAY have at most one `video_url` value, stored as plain text. A recipe MUST be creatable and valid with no video URL at all.

#### Scenario: A recipe is saved without a video URL

- GIVEN a household member creates a recipe and leaves the video field empty
- WHEN they save
- THEN the recipe is persisted with no video reference and no error

#### Scenario: A recipe is saved with one video URL

- GIVEN a household member pastes a video URL into the recipe form
- WHEN they save
- THEN the recipe is persisted with that single `video_url` value

### Requirement: Recognized-Platform URLs Render as a Native Embed

A `video_url` matching a recognized platform pattern (TikTok, YouTube, or a Google Drive `/preview` link) MUST render as a native embed on the recipe detail page.

#### Scenario: A YouTube URL renders as an embed

- GIVEN a recipe has a `video_url` pointing to a YouTube video
- WHEN the recipe detail page is viewed
- THEN the video renders as a native embedded player, not a plain link

#### Scenario: A TikTok URL renders as an embed

- GIVEN a recipe has a `video_url` pointing to a TikTok video
- WHEN the recipe detail page is viewed
- THEN the video renders as a native embed

#### Scenario: A Google Drive preview URL renders as an embed

- GIVEN a recipe has a `video_url` in Google Drive `/preview` format
- WHEN the recipe detail page is viewed
- THEN the video renders as a native embed

### Requirement: Unrecognized URLs Render as a Plain Clickable Link

A `video_url` that does not match any recognized platform pattern MUST render as a plain clickable link, opening in a new context, without attempting an embed.

#### Scenario: An unrecognized URL falls back to a link

- GIVEN a recipe has a `video_url` from a platform not in the recognized set
- WHEN the recipe detail page is viewed
- THEN the URL renders as a plain clickable link rather than an embed attempt

#### Scenario: A recognized-platform URL in an unsupported shape falls back gracefully

- GIVEN a recipe has a URL from a recognized domain but in a format the embed pattern does not match (e.g. a malformed or non-video path)
- WHEN the recipe detail page is viewed
- THEN it renders as a plain clickable link instead of a broken embed

### Requirement: No Video Byte Storage or Re-Hosting

The system MUST NOT download, transcode, store, or re-host video bytes for any `video_url`; only the URL string is persisted.

#### Scenario: Saving a video URL creates no storage artifact

- GIVEN a household member saves a recipe with a video URL
- WHEN the save completes
- THEN no file, blob, or storage bucket object is created for that video — only the `video_url` text column is written

## Key Learnings

1. Embed-vs-link is a pure client-side URL-pattern decision with zero backend/storage involvement, matching the proposal's zero-infrastructure constraint for Phase 1 video.
2. A recognized domain with an unmatched path shape must still fall back to a link rather than attempt a broken embed, so the fallback rule covers near-miss URLs, not only wholly unrecognized ones.
