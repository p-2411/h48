import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JoinState } from "@/lib/waitlist/actions";

const actions = vi.hoisted(() => ({
  joinWaitlist: vi.fn<(prev: JoinState, formData: FormData) => Promise<JoinState>>(),
  saveDetails: vi.fn(),
}));
vi.mock("@/lib/waitlist/actions", () => actions);

const { JoinForm, SignupProvider, StickyCta } = await import("./index");

/* ------------------------------------------------------------------ */
/* IntersectionObserver double: the test decides what is on screen.   */
/* ------------------------------------------------------------------ */

type Callback = (entries: IntersectionObserverEntry[]) => void;
const observers: { callback: Callback; targets: Set<Element> }[] = [];

class FakeIntersectionObserver {
  private record: { callback: Callback; targets: Set<Element> };
  constructor(callback: Callback) {
    this.record = { callback, targets: new Set() };
    observers.push(this.record);
  }
  observe(target: Element) {
    this.record.targets.add(target);
  }
  unobserve(target: Element) {
    this.record.targets.delete(target);
  }
  disconnect() {
    this.record.targets.clear();
  }
  takeRecords() {
    return [];
  }
}

/** Reports `target` as on screen or not. `above` means it has scrolled off the top. */
function setOnScreen(target: Element, isIntersecting: boolean, above = !isIntersecting) {
  act(() => {
    for (const { callback, targets } of observers) {
      if (!targets.has(target)) continue;
      callback([
        {
          target,
          isIntersecting,
          boundingClientRect: { top: above ? -500 : 500 } as DOMRectReadOnly,
        } as IntersectionObserverEntry,
      ]);
    }
  });
}

function renderPage() {
  const user = userEvent.setup();
  render(
    <SignupProvider>
      <section id="join">
        <JoinForm variant="hero" inputId="hero-email" />
      </section>
      <section>
        <JoinForm variant="inline" inputId="inline-email" />
      </section>
      <StickyCta />
    </SignupProvider>,
  );
  const forms = Array.from(document.querySelectorAll("[data-join-form]"));
  const bar = document.querySelector<HTMLElement>("[data-sticky-cta]")!;
  return { user, heroForm: forms[0], inlineForm: forms[1], bar };
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  window.sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StickyCta", () => {
  it("starts hidden and inert while the hero form is on screen", () => {
    const { heroForm, bar } = renderPage();
    setOnScreen(heroForm, true);
    expect(bar).toHaveAttribute("data-visible", "false");
    expect(bar).toHaveAttribute("inert");
  });

  it("appears once the hero form has scrolled away and no other form is on screen", () => {
    const { heroForm, inlineForm, bar } = renderPage();
    setOnScreen(heroForm, false, true);
    setOnScreen(inlineForm, false, false);
    expect(bar).toHaveAttribute("data-visible", "true");
    expect(bar).not.toHaveAttribute("inert");

    setOnScreen(inlineForm, true);
    expect(bar).toHaveAttribute("data-visible", "false");
  });

  it("does not appear when the hero form is below the viewport", () => {
    const { heroForm, bar } = renderPage();
    setOnScreen(heroForm, false, false);
    expect(bar).toHaveAttribute("data-visible", "false");
  });

  it("hides while any field has focus", async () => {
    const { heroForm, bar } = renderPage();
    setOnScreen(heroForm, false, true);
    expect(bar).toHaveAttribute("data-visible", "true");

    act(() => document.getElementById("inline-email")!.focus());
    expect(bar).toHaveAttribute("data-visible", "false");
    act(() => document.getElementById("inline-email")!.blur());
    expect(bar).toHaveAttribute("data-visible", "true");
  });

  it("keeps focused elements clear of the bar while it shows, and leaves room for it after the footer", () => {
    const { heroForm, bar } = renderPage();
    Object.defineProperty(bar, "offsetHeight", { value: 72, configurable: true });

    setOnScreen(heroForm, false, true);
    expect(document.documentElement.style.scrollPaddingBottom).toBe("80px");
    setOnScreen(heroForm, true);
    expect(document.documentElement.style.scrollPaddingBottom).toBe("");

    const spacer = bar.previousElementSibling;
    expect(spacer).toHaveAttribute("aria-hidden", "true");
    expect(spacer).toHaveClass("min-[720px]:hidden");
  });

  it("scrolls to the hero form and focuses its email field", async () => {
    const { user, heroForm, bar } = renderPage();
    setOnScreen(heroForm, false, true);

    const button = bar.querySelector("button")!;
    expect(button).toHaveTextContent("Join the waitlist");
    await user.click(button);

    expect(document.getElementById("hero-email")).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("after sign-up, says so and offers Share", async () => {
    window.sessionStorage.setItem("roofless.signup", JSON.stringify({ joined: true, email: "sam@example.com", referralCode: "ABCD2345" }));
    const { heroForm, bar } = renderPage();
    setOnScreen(heroForm, false, true);

    expect(bar).toHaveTextContent("You're on the list ✓");
    expect(bar.querySelector("button")).toHaveTextContent("Share");
    expect(screen.queryByRole("button", { name: "Join the waitlist" })).not.toBeInTheDocument();
  });
});
