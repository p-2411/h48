import { useSyncExternalStore } from "react";

export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
export const FORCED_COLORS_QUERY = "(forced-colors: active)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function hasMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const lists = [FINE_POINTER_QUERY, FORCED_COLORS_QUERY, REDUCED_MOTION_QUERY].map((query) =>
    window.matchMedia(query),
  );
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

function getSnapshot(): boolean {
  if (!hasMatchMedia()) return false;
  return (
    window.matchMedia(FINE_POINTER_QUERY).matches &&
    !window.matchMedia(FORCED_COLORS_QUERY).matches &&
    !window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/** The server never renders the cursor, so hydration always starts from `false`. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * True when the primary pointer can hover and is precise (mouse, trackpad,
 * pen), Windows High Contrast / forced colours is off, and the user has not
 * asked for reduced motion (WCAG 2.3.3: fall back to the native cursor
 * entirely). Reacts to changes,
 * for example when a tablet is docked or a mouse is connected.
 */
export function useCustomCursorSupport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
