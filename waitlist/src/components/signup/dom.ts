/** Element ids shared between the sign-up components, the header and the page. */

/** The hero section that holds the main form. */
export const HERO_SECTION_ID = "join";
/** The hero email input. The header and the sticky bar focus it. */
export const HERO_INPUT_ID = "hero-email";

/** Every JoinForm root carries this attribute so the sticky bar can find them. */
export const JOIN_FORM_ATTR = "data-join-form";

/** The joined card that replaces a form's email bar. Focus goes here after sign-up. */
export function joinedCardId(inputId: string): string {
  return `${inputId}-joined`;
}

/** Focus the input that started the flow, or the card that replaced it. */
export function focusOrigin(inputId: string | null) {
  if (!inputId || typeof document === "undefined") return;
  const target = document.getElementById(inputId) ?? document.getElementById(joinedCardId(inputId));
  target?.focus();
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/** Scroll to the hero form and put the cursor in its email field. */
export function focusHeroEmail() {
  if (typeof document === "undefined") return;
  const input = document.getElementById(HERO_INPUT_ID);
  const target = input ?? document.getElementById(HERO_SECTION_ID);
  if (!target) return;
  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
  input?.focus({ preventScroll: true });
}
