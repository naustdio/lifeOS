import "@testing-library/jest-dom/vitest";

// Vitest global setup (sub-slice 2C, RTL component smoke tests / T-036-T-038):
// registers @testing-library/jest-dom's matchers (toBeInTheDocument, etc.)
// against vitest's `expect`. Kept as a single shared setup file rather than
// per-test imports so every RTL suite gets the same matchers.

// jsdom implements neither PointerEvent capture nor scrollIntoView (finance-ui-polish,
// Radix Select adoption): Radix's Trigger/Content/Item internals call
// hasPointerCapture/releasePointerCapture/scrollIntoView unconditionally, and an
// unpolyfilled jsdom throws "not a function" the moment a Select is opened in a test.
if (typeof window !== "undefined") {
  Object.defineProperty(window.HTMLElement.prototype, "hasPointerCapture", {
    value: () => false,
    writable: true,
  });
  Object.defineProperty(window.HTMLElement.prototype, "releasePointerCapture", {
    value: () => {},
    writable: true,
  });
  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    value: () => {},
    writable: true,
  });
}
