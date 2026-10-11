"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { buttonClasses } from "@/components/ui/button";
import { site } from "@/config/site";

import { ChatIcon, CheckIcon, LinkIcon, MailIcon, ShareIcon } from "./icons";
import { shareUrl } from "./share-url";
import { useSignup } from "./signup-context";

type CopyState = "idle" | "copied" | "failed";
type Side = "top" | "bottom";

/** Rough height of the open panel (three 44px rows and padding), used to pick a side before it renders. */
const PANEL_HEIGHT = 168;
/** Panel width in px: w-[min(16.5rem,calc(100vw-2rem))]. */
const panelWidth = (viewport: number) => Math.min(264, viewport - 32);
/** Keep the panel this far from the screen edges, and clear of the fixed header at the top. */
const EDGE = 8;
const HEADER_CLEARANCE = 72;

const noopSubscribe = () => () => {};
/** True after hydration when the browser has a system share sheet. False on the server. */
function useCanShare(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
}

/**
 * Where the panel goes: the preferred side unless only the other side has room on screen,
 * and a sideways shift (px) that keeps the whole panel inside the viewport.
 */
function panelPosition(trigger: HTMLElement, placement: Side, align: "start" | "end"): { side: Side; shift: number } {
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = window.innerHeight;
  const roomAbove = rect.top - HEADER_CLEARANCE;
  const roomBelow = viewportHeight - rect.bottom - EDGE;
  let side = placement;
  if (placement === "top" && roomAbove < PANEL_HEIGHT && roomBelow > roomAbove) side = "bottom";
  if (placement === "bottom" && roomBelow < PANEL_HEIGHT && roomAbove > roomBelow) side = "top";

  const width = panelWidth(viewportWidth);
  let shift: number;
  if (align === "start") {
    // Panel spans rect.left + shift … + width.
    shift = Math.min(0, viewportWidth - EDGE - width - rect.left);
    shift = Math.max(shift, EDGE - rect.left);
  } else {
    // Panel spans rect.right + shift - width … rect.right + shift.
    shift = Math.max(0, EDGE + width - rect.right);
    shift = Math.min(shift, viewportWidth - EDGE - rect.right);
  }
  return { side, shift: Math.round(shift) };
}

/**
 * Copies with the Clipboard API, or the legacy textarea trick where that is denied.
 * The textarea goes inside `container` so the panel's "focus left" check doesn't close it,
 * and focus goes back to where it was.
 */
async function copyText(text: string, container: HTMLElement): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path (permission denied, older Safari, insecure origins).
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement("textarea");
  try {
    area.value = text;
    area.setAttribute("readonly", "");
    area.setAttribute("aria-hidden", "true");
    area.tabIndex = -1;
    Object.assign(area.style, { position: "absolute", left: "-10000px", top: "0", opacity: "0" });
    container.appendChild(area);
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    previous?.focus({ preventScroll: true });
  }
}

const itemClass =
  "flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold text-ink " +
  "transition-colors duration-150 hover:bg-blush focus-visible:bg-blush focus-visible:outline-offset-0";

/**
 * Shares the page link. Uses the system share sheet where there is one;
 * otherwise opens a small panel with Copy link, WhatsApp and Email.
 */
export function ShareButton({
  className = "",
  placement = "bottom",
  align = "start",
  referralCode: referralCodeProp,
}: {
  className?: string;
  /** The side the fallback panel prefers. It flips when only the other side has room on screen. */
  placement?: "top" | "bottom";
  /** The edge of the button the panel lines up with. It shifts sideways if needed to stay on screen. */
  align?: "start" | "end";
  /** Defaults to the code from the shared sign-up state. */
  referralCode?: string;
}) {
  const signup = useSignup();
  const url = shareUrl(referralCodeProp ?? signup.referralCode);

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ side: Side; shift: number }>({ side: placement, shift: 0 });
  const [copy, setCopy] = useState<CopyState>("idle");
  const canShare = useCanShare();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const manualRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  // Close on Escape (focus back to the trigger), on a click outside and when focus leaves.
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };
    const onFocus = (event: FocusEvent) => {
      if (root && event.target instanceof Node && !root.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);

  // "Link copied" fades back to "Copy link" after a moment.
  useEffect(() => {
    if (copy !== "copied") return;
    const timer = window.setTimeout(() => setCopy("idle"), 2400);
    return () => window.clearTimeout(timer);
  }, [copy]);

  // If copying failed, select the link so the visitor can copy it by hand.
  useEffect(() => {
    if (copy === "failed") manualRef.current?.select();
  }, [copy]);

  async function onShare() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: site.name, url });
        return;
      } catch (error) {
        // The visitor closed the sheet: nothing to do.
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Anything else (not allowed, unsupported data): offer the fallback panel.
      }
    }
    setCopy("idle");
    if (!open && triggerRef.current) setPosition(panelPosition(triggerRef.current, placement, align));
    setOpen(!open);
  }

  async function onCopy() {
    const ok = await copyText(url, rootRef.current ?? document.body);
    setCopy(ok ? "copied" : "failed");
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(url)}`;
  const email = `mailto:?subject=${encodeURIComponent(site.name)}&body=${encodeURIComponent(url)}`;

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={onShare}
        // Only a disclosure when it opens our panel. With a system share sheet it is a plain button.
        aria-expanded={open || !canShare ? open : undefined}
        aria-controls={open ? panelId : undefined}
        className={buttonClasses({ variant: "quiet", size: "md" })}
      >
        <ShareIcon className="size-[18px]" />
        Share
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Share options"
          // Nudged sideways when the button sits close to a screen edge.
          style={position.shift ? (align === "end" ? { right: -position.shift } : { left: position.shift }) : undefined}
          className={
            "absolute z-50 w-[min(16.5rem,calc(100vw-2rem))] rounded-[22px] border border-line bg-white p-2 text-left " +
            "shadow-[0_18px_48px_-12px_rgb(29_36_51/0.28)] " +
            (position.side === "top" ? "bottom-full mb-2 " : "top-full mt-2 ") +
            (align === "end" ? "right-0" : "left-0")
          }
        >
          <button type="button" onClick={onCopy} className={itemClass}>
            {copy === "copied" ? <CheckIcon className="size-5 text-sun-cta" /> : <LinkIcon className="size-5 text-slate" />}
            {copy === "copied" ? "Link copied" : "Copy link"}
          </button>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={itemClass}>
            <ChatIcon className="size-5 text-slate" />
            WhatsApp
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <a href={email} className={itemClass}>
            <MailIcon className="size-5 text-slate" />
            Email
          </a>

          {copy === "failed" && (
            <div className="px-3 pt-2 pb-1">
              <label htmlFor={`${panelId}-link`} className="block text-[13px] text-slate">
                Couldn&apos;t copy. Select the link and copy it:
              </label>
              <input
                ref={manualRef}
                id={`${panelId}-link`}
                readOnly
                value={url}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-1 w-full rounded-xl border border-line bg-blush px-3 py-2 text-[15px] text-ink"
              />
            </div>
          )}

          {/* Announces the copy result to screen readers. */}
          <p aria-live="polite" className="sr-only">
            {copy === "copied" ? "Link copied" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
