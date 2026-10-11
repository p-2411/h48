"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { focusHeroEmail, HERO_SECTION_ID, JOIN_FORM_ATTR } from "./dom";
import { ShareButton } from "./ShareButton";
import { useSignup } from "./signup-context";

/** Fields that bring up the on-screen keyboard (or otherwise mean "the visitor is busy typing"). */
const FIELD_SELECTOR =
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"]), textarea, select, [contenteditable]:not([contenteditable="false"])';

function isField(target: EventTarget | null): boolean {
  return target instanceof Element && target.matches(FIELD_SELECTOR);
}

/**
 * Phones only (< 720px): a slim bar at the bottom of the screen with the
 * main button. It appears after the hero form scrolls away, and stays out of
 * the way while any email form is on screen, a field has focus or the
 * details modal is open (brief §2.11). IntersectionObserver only; no scroll listeners.
 *
 * Render it last on the page: it also leaves a bar-high gap after the footer so the
 * bar never covers the last lines of the page.
 */
export function StickyCta() {
  const { status, modalOpen } = useSignup();
  const barRef = useRef<HTMLDivElement>(null);
  const [heroPassed, setHeroPassed] = useState(false);
  const [formInView, setFormInView] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const forms = Array.from(document.querySelectorAll<HTMLElement>(`[${JOIN_FORM_ATTR}]`));
    const hero =
      document.querySelector<HTMLElement>(`#${HERO_SECTION_ID} [${JOIN_FORM_ATTR}]`) ??
      document.getElementById(HERO_SECTION_ID) ??
      document.querySelector<HTMLElement>(`[${JOIN_FORM_ATTR}][data-variant="hero"]`);

    const onScreen = new Set<Element>();
    const formObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      }
      setFormInView(onScreen.size > 0);
    });
    for (const form of forms) formObserver.observe(form);

    // "Passed" means the hero form is off screen above the viewport, not still below it.
    const heroObserver = new IntersectionObserver(([entry]) => {
      if (entry) setHeroPassed(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    if (hero) heroObserver.observe(hero);

    return () => {
      formObserver.disconnect();
      heroObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => setTyping(isField(event.target));
    const onFocusOut = (event: FocusEvent) => setTyping(isField(event.relatedTarget));
    // Focus moved while the window was in the background fires no focus events; catch up on return.
    const onWindowFocus = () => setTyping(isField(document.activeElement));
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, []);

  const visible = heroPassed && !formInView && !typing && !modalOpen;

  // While the bar shows, keep focused elements clear of it (WCAG 2.4.11): the browser
  // scrolls a focused link or button above the bar instead of leaving it underneath.
  useEffect(() => {
    const bar = barRef.current;
    // offsetHeight is 0 from 720px up, where the bar is display: none.
    if (!visible || !bar || bar.offsetHeight === 0) return;
    const root = document.documentElement;
    const previous = root.style.scrollPaddingBottom;
    root.style.scrollPaddingBottom = `${bar.offsetHeight + 8}px`;
    return () => {
      root.style.scrollPaddingBottom = previous;
    };
  }, [visible]);

  return (
    <>
      <div aria-hidden="true" className="h-[calc(3.75rem+max(0.75rem,env(safe-area-inset-bottom)))] min-[720px]:hidden" />
      <div
        ref={barRef}
        data-sticky-cta=""
        data-visible={visible}
        inert={!visible}
        className={
          // `glass` sets its own background and border, so these overrides need the important modifier.
          "glass fixed inset-x-0 bottom-0 z-40 rounded-none border-x-0! border-b-0! bg-white/80! px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] " +
          "transition-[translate,opacity,visibility] duration-300 ease-[var(--ease-out-expo)] motion-reduce:transition-none min-[720px]:hidden " +
          (visible ? "visible translate-y-0 opacity-100" : "invisible translate-y-full opacity-0")
        }
      >
        {status === "joined" ? (
          <div className="mx-auto flex max-w-[34rem] items-center justify-between gap-3">
            <p className="min-w-0 text-[15px] leading-tight font-semibold text-ink">You&apos;re on the list ✓</p>
            <ShareButton placement="top" align="end" />
          </div>
        ) : (
          <div className="mx-auto max-w-[34rem]">
            <Button type="button" onClick={focusHeroEmail} size="md" className="w-full">
              Join the waitlist
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
