import Scene from "@/components/scene/Scene";
import { Hero } from "@/components/sections/Hero";
import { Different, Faq, FinalCta, Gap, HowItWorks, Team, Vision } from "@/components/sections/Story";
import { SignupProvider, StickyCta } from "@/components/signup";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

export default function Home() {
  return (
    <SignupProvider>
      <a href="#join" className="sr-only-focusable left-4 top-4 z-[60] rounded-full bg-ink px-4 py-2 text-white">
        Skip to the waitlist form
      </a>
      <Scene />
      <SiteHeader />
      <main className="relative z-10">
        <Hero />
        <Gap />
        <HowItWorks />
        <Different />
        <Vision />
        <Team />
        <Faq />
        <FinalCta />
      </main>
      <div className="relative z-10">
        <SiteFooter />
      </div>
      <StickyCta />
    </SignupProvider>
  );
}
