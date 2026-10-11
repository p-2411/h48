import type { Metadata } from "next";
import Link from "next/link";

import { LogoMark } from "@/components/site/Logo";
import { ButtonLink } from "@/components/ui/button";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Page not found",
};

/** A sun that has set: half a disc on the horizon. Decorative. */
function SetSun() {
  return (
    <div aria-hidden="true" className="flex flex-col items-center">
      {/* Wide enough for the halo rings, cut off only at the horizon. */}
      <div className="flex h-[86px] w-[172px] justify-center overflow-hidden pt-[30px]">
        <div className="size-28 shrink-0 rounded-full bg-sun shadow-[0_0_0_14px_rgb(255_106_19/0.12),0_0_0_30px_rgb(255_106_19/0.06)]" />
      </div>
      <div className="h-px w-56 bg-line" />
    </div>
  );
}

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center px-5">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-lg text-ink" aria-label={`${site.name} home`}>
          <LogoMark />
          <span className="text-[17px] font-medium tracking-[-0.02em]">{site.name}</span>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5 pb-24 pt-10 text-center">
        <SetSun />
        <p className="mt-10 text-[15px] font-medium text-slate">Error 404</p>
        <h1 className="mt-3 max-w-[16ch] text-[clamp(32px,5vw,48px)] font-normal leading-[1.05] tracking-[-0.02em] text-ink text-balance">
          We can&apos;t find that page.
        </h1>
        <p className="mt-4 max-w-[34em] text-[17px] leading-[1.6] text-slate text-pretty">
          The link may be out of date, or the address may have a typo. The waitlist is on the home page.
        </p>
        <ButtonLink href="/" className="mt-9">
          Back to home
        </ButtonLink>
      </main>
    </div>
  );
}
