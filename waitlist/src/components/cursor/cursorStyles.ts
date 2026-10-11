import { NATIVE_ZONE_ROOTS, TEXT_ZONE_ROOTS } from "./cursorTargets";

/** Class added to `<html>` while the custom cursor is positioned and visible. */
export const HTML_CLASS = "has-custom-cursor";

/** Class names used by the cursor element. Prefixed to avoid collisions. */
export const CURSOR_CLASS = "rf-cursor";
export const SHAPE_CLASS = "rf-cursor__shape";

/**
 * Triangle geometry, in CSS px. The path tip is at (0, 0) in SVG user space.
 * The SVG box is offset so that this tip sits exactly on the cursor element's
 * origin, which is translated to the pointer coordinates. Scale and rotation
 * use the tip as their origin, so the hotspot never moves.
 */
export const SHAPE = {
  width: 20,
  height: 24,
  /** Distance from the SVG box's top-left corner to the tip. */
  tipX: 10,
  tipY: 2,
  /** Upright isosceles triangle, 19 px high and 13 px wide, tip at the origin. */
  path: "M0 0L6.5 19H-6.5Z",
} as const;

const BRAND_ORANGE = "#FF6A13";
const NAVY_RGB = "29 36 51";

export const SHAPE_FILL = BRAND_ORANGE;

/** Selectors that keep (or restore) a native cursor, including descendants. */
const nativeCursorZones = [
  ...TEXT_ZONE_ROOTS,
  ...NATIVE_ZONE_ROOTS,
  '[contenteditable]:not([contenteditable="false"]) *',
  '[data-cursor="text"] *',
  '[data-cursor="native"] *',
].join(",");

const html = `html.${HTML_CLASS}`;
const root = `.${CURSOR_CLASS}`;
const shape = `.${SHAPE_CLASS}`;

/**
 * Stylesheet rendered by <CustomCursor />. It is self-contained, so nothing
 * needs to be added to globals.css.
 *
 * - `cursor: none` applies only while `html.has-custom-cursor` is set.
 * - Text fields and `[data-cursor="native"]` regions are excluded from it.
 *   Because `cursor` is inherited, those zones get an explicit value. That
 *   value lives in `@layer base`, so the site's own cursor rules (unlayered
 *   CSS or Tailwind utilities) still win inside those zones.
 */
export const CURSOR_CSS = `
${html},
${html} *:not(:where(${nativeCursorZones})) {
  cursor: none !important;
}
@layer base {
  ${html} :where(${TEXT_ZONE_ROOTS.join(",")}) { cursor: text; }
  ${html} :where(${NATIVE_ZONE_ROOTS.join(",")}) { cursor: auto; }
}
${root} {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483647;
  width: 0;
  height: 0;
  pointer-events: none;
  user-select: none;
  will-change: transform;
  opacity: 0;
  transition: opacity 140ms ease-out;
}
${root}:not([data-state="hidden"]) {
  opacity: 1;
}
${shape} {
  position: absolute;
  left: ${-SHAPE.tipX}px;
  top: ${-SHAPE.tipY}px;
  display: block;
  overflow: visible;
  transform-origin: ${SHAPE.tipX}px ${SHAPE.tipY}px;
  transform: rotate(-24deg) scale(1);
  transition: transform 160ms cubic-bezier(0.34, 1.45, 0.64, 1);
  filter: drop-shadow(0 1px 1px rgb(${NAVY_RGB} / 0.35))
    drop-shadow(0 3px 6px rgb(${NAVY_RGB} / 0.2));
}
${root}[data-state="hover"] ${shape} {
  transform: rotate(-34deg) scale(1.35);
}
${root}[data-state="press"] ${shape} {
  transform: rotate(-26deg) scale(0.85);
  transition-duration: 90ms;
  transition-timing-function: cubic-bezier(0.3, 0, 0.6, 1);
}
${root}[data-state="hidden"] ${shape} {
  transform: rotate(-24deg) scale(0.7);
}
@media (prefers-reduced-motion: reduce) {
  ${root} { display: none; }
}
@media (forced-colors: active) {
  ${root} { display: none; }
}
@media print {
  ${root} { display: none; }
}
`;
