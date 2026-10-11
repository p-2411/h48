import Link from "next/link";
import type { ReactNode } from "react";

import { JoinForm } from "@/components/signup";
import { site } from "@/config/site";

import { Panel, SectionHeading } from "./Panel";

const wrap = "relative mx-auto w-full max-w-[1200px] px-4 sm:px-5";
const gap = "pt-28 sm:pt-40";

export function Gap() {
  return (
    <section aria-labelledby="gap-title" className={`${wrap} pt-8 sm:pt-16`}>
      <Panel>
        <SectionHeading id="gap-title" then="Most renters don't have one." className="max-w-[22ch]">
          Rooftop solar needs a roof.
        </SectionHeading>
        <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
          {site.stats.map((stat) => (
            <figure key={stat.url} className="flex flex-col gap-4 border-t border-line pt-6">
              <blockquote className="text-[22px] leading-[1.3] tracking-[-0.015em] text-ink text-pretty sm:text-[26px]">{stat.text}</blockquote>
              <figcaption className="text-[14px] text-slate">
                Source:{" "}
                <a href={stat.url} className="link-sweep text-ink" rel="noopener">
                  {stat.source}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      </Panel>
    </section>
  );
}

const STEPS = [
  {
    title: "Own panels on a shared farm",
    body: ["Pick panels on a farm we're building in regional Australia."],
  },
  {
    title: "The farm sells the power",
    body: ["Their electricity is sold to the grid."],
  },
  {
    title: "The money goes toward your bill",
    // The surplus and shortfall sentences stay together at the same size (ASIC RG 234 balance).
    body: ["It goes toward your bill. If it's more, we plan to pay you the difference. If it's less, you pay the rest."],
  },
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className={`${wrap} scroll-mt-24 ${gap}`}>
      <Panel>
        <SectionHeading id="how-title">How it works</SectionHeading>
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-10">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-3 border-t border-line pt-6">
              <span aria-hidden="true" className="text-[15px] tabular-nums text-dim">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-[20px] leading-[1.25] tracking-[-0.01em] text-ink">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </h3>
              <p className="max-w-[34ch] text-[16px] text-slate">{step.body.join(" ")}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12 max-w-[600px] border-t border-line pt-10">
          <JoinForm variant="inline" />
        </div>
      </Panel>
    </section>
  );
}

const POINTS = [
  {
    title: "No roof needed",
    body: "Your panels live on the farm, not your house.",
  },
  {
    title: "Keep your retailer",
    body: "Designed to work alongside your current energy company.",
  },
  {
    title: "Moves when you move",
    body: "Your panels aren't tied to an address.",
  },
  {
    title: "Free to join",
    body: "No payment details. Leave any time.",
  },
];

export function Different() {
  return (
    <section aria-labelledby="different-title" className={`${wrap} ${gap}`}>
      <Panel>
        <SectionHeading id="different-title" then="without a roof." className="max-w-[18ch]">
          Built for people
        </SectionHeading>
        <ul className="mt-12 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {POINTS.map((point) => (
            <li key={point.title} className="flex flex-col gap-2 border-t border-line pt-6">
              <h3 className="text-[19px] leading-[1.3] tracking-[-0.01em] text-ink">{point.title}</h3>
              <p className="max-w-[40ch] text-[16px] text-slate">{point.body}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}

export function Vision() {
  return (
    <section aria-labelledby="vision-title" className={`${wrap} ${gap}`}>
      <Panel className="lg:px-20 lg:py-20">
        <h2 id="vision-title" className="font-display max-w-[18ch] text-[36px] leading-[1.04] text-balance text-ink sm:text-[clamp(40px,4.6vw,64px)]">
          Can&apos;t buy the house? <span className="text-dim">Own a piece of the power station.</span>
        </h2>
        <p className="mt-7 max-w-[46em] text-[17px] leading-[1.6] text-slate sm:text-[18px]">
          Energy is what everything runs on. More people should own a part of it.
        </p>
        <div className="mt-10 max-w-[600px]">
          <JoinForm variant="inline" />
        </div>
      </Panel>
    </section>
  );
}

export function Team() {
  return (
    <section aria-labelledby="team-title" className={`${wrap} ${gap}`}>
      <Panel className="mx-auto max-w-[860px]">
        <SectionHeading id="team-title">Who&apos;s building this</SectionHeading>
        <p className="mt-6 max-w-[56ch] text-[17px] leading-[1.6] text-slate">
          A small Australian team that started at the H48 hackathon in October 2026. Questions?{" "}
          <a href={`mailto:${site.contactEmail}`} className="link-sweep text-ink">
            Email us
          </a>
          .
        </p>
        {site.team.length > 0 && (
          <ul className="mt-8 flex flex-wrap gap-6">
            {site.team.map((person) => (
              <li key={person.name} className="flex items-center gap-3">
                {person.photo && (
                  // eslint-disable-next-line @next/next/no-img-element -- small local portraits, sized explicitly
                  <img src={person.photo} alt="" width={48} height={48} className="size-12 rounded-full object-cover" />
                )}
                <div>
                  <p className="font-medium text-ink">{person.name}</p>
                  <p className="text-[14px] text-slate">{person.role}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "How much will it cost?",
    a: "We haven't set prices yet. Joining the waitlist is free and needs no payment details. People on the list will hear about pricing first.",
  },
  {
    q: "Do I need my own roof or home?",
    a: "No. Your panels sit on a shared solar farm, so you can join if you rent, live in an apartment or move often.",
  },
  {
    q: "What if my panels make less than my bill?",
    a: "You pay the rest of your bill, as you do now. If they make more than your bill, we plan to pay you the difference.",
  },
  {
    q: "Do I have to switch energy retailer?",
    a: "We're designing Roofless to work alongside your current retailer. We'll confirm exactly how before launch.",
  },
  {
    q: "What happens when I move house?",
    a: "Your panels aren't tied to your address. The plan is that you update your address and the money goes toward your new bill.",
  },
  {
    q: "Where will the farm be?",
    a: "We're choosing a site in regional Australia now. People on the waitlist will hear first.",
  },
  {
    q: "How is this different from the Solar Sharer Offer?",
    a: "The Solar Sharer Offer is a retailer plan with free power at midday. It needs a smart meter and a plan switch, and many apartment buildings can't use it. With Roofless, you own panels, and the power they make all day goes toward your bill.",
  },
  {
    q: "What if Roofless shuts down?",
    a: "We'll publish exactly how ownership is held, and what happens in that case, before anyone pays anything.",
  },
  {
    q: "What do you do with my details?",
    a: (
      <>
        We use your email to tell you about the launch. If you give us your home type and postcode, we use them to plan where to
        build. We never sell the list. Read our{" "}
        <Link href="/privacy" className="link-sweep text-ink">
          Privacy Policy
        </Link>
        .
      </>
    ),
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className={`${wrap} scroll-mt-24 ${gap}`}>
      <Panel>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
          <SectionHeading id="faq-title">Questions</SectionHeading>
          <div className="border-b border-line">
            {FAQS.map((item) => (
              <details key={item.q} className="group border-t border-line">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-[17px] text-ink marker:content-none [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-[22px] leading-none text-dim transition-transform duration-200 group-open:rotate-45 group-hover:text-ink motion-reduce:transition-none"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-[62ch] pb-6 pr-10 text-[15px] leading-[1.7] text-slate">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
        <div className="mt-12 max-w-[600px] border-t border-line pt-10 lg:ml-[calc(33.333%+1.333rem)]">
          <JoinForm variant="inline" />
        </div>
      </Panel>
    </section>
  );
}

export function FinalCta() {
  return (
    <section aria-labelledby="final-title" className="relative px-5 pb-32 pt-40 text-center sm:pb-44 sm:pt-56">
      <h2 id="final-title" className="reveal font-display mx-auto max-w-[14ch] text-[44px] text-balance text-ink sm:text-[clamp(48px,6vw,80px)]">
        Be first on the farm.
      </h2>
      <p className="reveal mx-auto mt-6 max-w-[30em] text-[17px] text-ink/80 sm:text-[18px]">
        Free to join. Leave any time.
      </p>
      <div className="mx-auto mt-10 w-full max-w-[600px]">
        <JoinForm variant="hero" />
      </div>
    </section>
  );
}
