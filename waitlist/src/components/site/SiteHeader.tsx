"use client";

import { useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { useState, type MouseEvent } from "react";

import { focusHeroEmail, useSignup } from "@/components/signup";
import { ButtonAnchor } from "@/components/ui/button";
import { site } from "@/config/site";

import { LogoMark } from "./Logo";

/** The header button is a plain #join link without JS; with JS it also puts the cursor in the field. */
function onJoinClick(event: MouseEvent) {
  if (!document.getElementById("hero-email")) return;
  event.preventDefault();
  focusHeroEmail();
}

export function SiteHeader() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const { status } = useSignup();

  // Hide while scrolling down past the hero, show again on any scroll up.
  useMotionValueEvent(scrollY, "change", (y) => {
    const previous = scrollY.getPrevious() ?? 0;
    const goingDown = y > previous;
    if (goingDown && y > 240 && !hidden) setHidden(true);
    else if (!goingDown && hidden) setHidden(false);
  });

  return (
    <header
      data-hidden={hidden}
      className="fixed inset-x-0 top-0 z-50 border-b border-line/80 bg-white/72 backdrop-blur-[12px] backdrop-saturate-[1.4] transition-transform duration-300 ease-[var(--ease-out-expo)] data-[hidden=true]:-translate-y-full motion-reduce:transition-none supports-[not(backdrop-filter:blur(1px))]:bg-white/95 [@media(prefers-reduced-transparency:reduce)]:bg-white"
      onFocusCapture={() => setHidden(false)}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-5">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-lg text-ink" aria-label={`${site.name} home`}>
          <LogoMark />
          <span className="text-[17px] font-medium tracking-[-0.02em]">{site.name}</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-8 text-[15px] md:flex">
          <a href="#how" className="link-sweep text-slate">
            How it works
          </a>
          <a href="#faq" className="link-sweep text-slate">
            FAQ
          </a>
        </nav>

        {status === "joined" ? (
          <span className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full px-2 text-[15px] font-medium text-ink sm:px-4">
            <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-sun text-[11px] text-white">
              ✓
            </span>
            You&apos;re on the list
          </span>
        ) : (
          <ButtonAnchor href="#join" onClick={onJoinClick} variant="ink" size="md">
            Join the waitlist
          </ButtonAnchor>
        )}
      </div>
    </header>
  );
}
