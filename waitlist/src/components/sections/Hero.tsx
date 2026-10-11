import { JoinForm } from "@/components/signup";
import { site } from "@/config/site";

// "Go Solar. Without a roof." → a firm first line, then the quieter payoff.
const [lead, ...rest] = site.tagline.split(". ");
const payoff = rest.join(". ");

export function Hero() {
  return (
    <section
      id="join"
      aria-labelledby="hero-title"
      className="relative flex min-h-[92svh] flex-col items-center justify-start px-5 pb-24 pt-[clamp(112px,19svh,210px)] text-center"
    >
      <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1 text-[13px] text-slate">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-sun" />
        Coming soon
      </p>

      <h1 id="hero-title" className="font-display mt-7 text-[clamp(44px,6.4vw,88px)] text-balance text-ink">
        {payoff ? (
          <>
            {lead}.<br />
            <span className="text-dim">{payoff}</span>
          </>
        ) : (
          site.tagline
        )}
      </h1>

      <p className="mt-7 max-w-[34em] text-[17px] leading-[1.55] text-slate text-pretty sm:text-[18px]">
        Own panels on a shared solar farm we&apos;re building. The power they sell goes toward your bill.
      </p>

      <div className="mt-10 w-full max-w-[600px]">
        <JoinForm variant="hero" inputId="hero-email" />
      </div>
    </section>
  );
}
