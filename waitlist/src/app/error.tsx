"use client";

import Link from "next/link";
import { useEffect } from "react";

import { LogoMark } from "@/components/site/Logo";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";

/** Route-level error boundary. `retry` re-fetches and re-renders the segment. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <title>{`Something went wrong · ${site.name}`}</title>
      <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center px-5">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-lg text-ink" aria-label={`${site.name} home`}>
          <LogoMark />
          <span className="text-[17px] font-medium tracking-[-0.02em]">{site.name}</span>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5 pb-24 pt-10 text-center">
        <span aria-hidden="true" className="size-14 rounded-full bg-sun/90 shadow-[0_0_0_10px_rgb(255_106_19/0.12),0_0_0_22px_rgb(255_106_19/0.06)]" />
        <h1 className="mt-10 max-w-[16ch] text-[clamp(32px,5vw,48px)] font-normal leading-[1.05] tracking-[-0.02em] text-ink text-balance">
          Something went wrong.
        </h1>
        <p className="mt-4 max-w-[34em] text-[17px] leading-[1.6] text-slate text-pretty">
          This page didn&apos;t load properly. Try again, or go back to the home page.
        </p>
        <div className="mt-9 flex flex-col items-center gap-5 sm:flex-row">
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <Link
            href="/"
            className="rounded-sm text-[17px] font-semibold text-ink underline decoration-sun decoration-2 underline-offset-[5px] hover:decoration-ink"
          >
            Back to home
          </Link>
        </div>
        <p className="mt-10 max-w-[34em] text-[14px] text-slate">
          If it keeps happening, email{" "}
          <a href={`mailto:${site.contactEmail}`} className="rounded-sm text-ink underline decoration-ink/30 underline-offset-4">
            {site.contactEmail}
          </a>
          {error.digest ? ` and quote reference ${error.digest}.` : "."}
        </p>
      </main>
    </div>
  );
}
