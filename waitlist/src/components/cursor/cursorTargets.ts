/**
 * Target classification for the custom cursor.
 *
 * The same selector lists drive both the runtime hit test (`classifyTarget`)
 * and the generated stylesheet (`cursorStyles.ts`), so the native cursor and
 * the custom cursor can never disagree about which zone the pointer is in.
 */

/** Input types that show a text caret (I-beam). Other input types are "interactive". */
const TEXT_INPUT_TYPES = [
  "text",
  "email",
  "password",
  "search",
  "tel",
  "url",
  "number",
] as const;

/** Text-entry elements: the custom cursor hides and the native I-beam shows. */
export const TEXT_ZONE_ROOTS: readonly string[] = [
  "input:not([type]):not(:disabled)",
  ...TEXT_INPUT_TYPES.map((type) => `input[type="${type}"]:not(:disabled)`),
  "textarea:not(:disabled)",
  '[contenteditable]:not([contenteditable="false"])',
  '[data-cursor="text"]',
];

/** Opt-out regions: the custom cursor hides and the site's own cursor shows. */
export const NATIVE_ZONE_ROOTS: readonly string[] = ['[data-cursor="native"]'];

/** Elements that switch the cursor to its hover state (unless disabled). */
export const INTERACTIVE_ROOTS: readonly string[] = [
  "a[href]",
  "area[href]",
  "button",
  "summary",
  "label",
  "select",
  // Non-text inputs (checkbox, radio, range, submit, file, colour, date ...).
  // Text-like inputs are matched first by TEXT_ZONE_ROOTS.
  "input",
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[data-cursor="hover"]',
];

const TEXT_SELECTOR = TEXT_ZONE_ROOTS.join(",");
const NATIVE_SELECTOR = NATIVE_ZONE_ROOTS.join(",");
const INTERACTIVE_SELECTOR = INTERACTIVE_ROOTS.join(",");

export type TargetKind = "native" | "text" | "interactive" | "default";

function isDisabled(element: Element): boolean {
  return (
    element.matches(":disabled") ||
    element.getAttribute("aria-disabled") === "true"
  );
}

/**
 * Classify the element under the pointer. Uses `closest()` only, so it never
 * forces layout. Priority: native opt-out, then text entry, then interactive.
 */
export function classifyTarget(target: EventTarget | null): TargetKind {
  if (!(target instanceof Element)) return "default";
  if (target.closest(NATIVE_SELECTOR)) return "native";
  if (target.closest(TEXT_SELECTOR)) return "text";
  const interactive = target.closest(INTERACTIVE_SELECTOR);
  if (interactive && !isDisabled(interactive)) return "interactive";
  return "default";
}
