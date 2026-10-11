import { classifyTarget } from "./cursorTargets";
import { HTML_CLASS } from "./cursorStyles";

export type CursorState = "default" | "hover" | "press" | "hidden";

const PRIMARY_BUTTON = 0;

/**
 * Wire the cursor element to pointer input. Returns a cleanup function that
 * removes every listener, cancels any pending frame and removes the `<html>`
 * class.
 *
 * Position is written straight to `style.transform` inside
 * requestAnimationFrame. React state is never touched per move.
 */
export function attachCursor(element: HTMLElement): () => void {
  const doc = element.ownerDocument;
  const win = doc.defaultView ?? window;
  const htmlElement = doc.documentElement;

  let x = 0;
  let y = 0;
  let target: EventTarget | null = null;
  /** A non-touch pointermove has given us real coordinates. */
  let positioned = false;
  /** Position changed since the last frame. */
  let positionDirty = false;
  /** Pointer left the window (or entered an iframe). */
  let outside = false;
  /** Touch input, or the tab was hidden: wait for the next mouse move. */
  let suspended = false;
  let pressed = false;
  /** Re-run the hit test at the stored coordinates (after scroll). */
  let needsHitTest = false;
  let frame = 0;

  const render = () => {
    frame = 0;

    if (needsHitTest) {
      needsHitTest = false;
      if (typeof doc.elementFromPoint === "function") {
        target = doc.elementFromPoint(x, y) ?? target;
      }
    }

    if (positionDirty) {
      positionDirty = false;
      element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    const active =
      positioned && !outside && !suspended && doc.visibilityState !== "hidden";

    // Checked against the live DOM, not a flag, so the class comes back on
    // the next frame if something else rewrites <html class>.
    if (htmlElement.classList.contains(HTML_CLASS) !== active) {
      htmlElement.classList.toggle(HTML_CLASS, active);
    }

    let next: CursorState = "hidden";
    if (active) {
      const kind = classifyTarget(target);
      if (kind === "native" || kind === "text") next = "hidden";
      else if (pressed) next = "press";
      else if (kind === "interactive") next = "hover";
      else next = "default";
    }
    if (element.dataset.state !== next) element.dataset.state = next;
  };

  const schedule = () => {
    if (!frame) frame = win.requestAnimationFrame(render);
  };

  /** Apply now. Used when frames may not run (tab hidden). */
  const renderNow = () => {
    if (frame) win.cancelAnimationFrame(frame);
    render();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    x = event.clientX;
    y = event.clientY;
    target = event.target;
    positioned = true;
    positionDirty = true;
    outside = false;
    suspended = false;
    needsHitTest = false;
    // Recover if a pointerup was lost (released outside the window, etc.).
    if (pressed && event.buttons === 0) pressed = false;
    schedule();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      // Hybrid device: a finger tap should not leave a stale arrow behind.
      suspended = true;
      pressed = false;
      schedule();
      return;
    }
    if (event.button !== PRIMARY_BUTTON) return;
    pressed = true;
    target = event.target;
    schedule();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    if (!pressed) return;
    pressed = false;
    schedule();
  };

  const release = () => {
    if (!pressed) return;
    pressed = false;
    schedule();
  };

  const onPointerOut = (event: PointerEvent) => {
    if (event.relatedTarget === null && event.pointerType !== "touch") {
      outside = true;
      schedule();
    }
  };

  const onPointerLeave = () => {
    outside = true;
    schedule();
  };

  const onVisibilityChange = () => {
    if (doc.visibilityState === "hidden") {
      // The pointer may move while we are away, so wait for a fresh move.
      suspended = true;
      pressed = false;
      renderNow();
    }
  };

  const onScroll = () => {
    if (!positioned) return;
    needsHitTest = true;
    schedule();
  };

  const passive: AddEventListenerOptions = { passive: true };
  const passiveCapture: AddEventListenerOptions = { passive: true, capture: true };

  doc.addEventListener("pointermove", onPointerMove, passive);
  doc.addEventListener("pointerdown", onPointerDown, passive);
  doc.addEventListener("pointerup", onPointerUp, passive);
  doc.addEventListener("pointercancel", release, passive);
  doc.addEventListener("pointerout", onPointerOut, passive);
  doc.addEventListener("pointerleave", onPointerLeave, passive);
  doc.addEventListener("visibilitychange", onVisibilityChange);
  win.addEventListener("blur", release);
  win.addEventListener("contextmenu", release);
  win.addEventListener("scroll", onScroll, passiveCapture);

  return () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    doc.removeEventListener("pointermove", onPointerMove, passive);
    doc.removeEventListener("pointerdown", onPointerDown, passive);
    doc.removeEventListener("pointerup", onPointerUp, passive);
    doc.removeEventListener("pointercancel", release, passive);
    doc.removeEventListener("pointerout", onPointerOut, passive);
    doc.removeEventListener("pointerleave", onPointerLeave, passive);
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    win.removeEventListener("blur", release);
    win.removeEventListener("contextmenu", release);
    win.removeEventListener("scroll", onScroll, passiveCapture);
    htmlElement.classList.remove(HTML_CLASS);
    element.dataset.state = "hidden";
  };
}
