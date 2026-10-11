import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { site } from "@/config/site";

vi.mock("@/lib/waitlist/actions", () => ({ joinWaitlist: vi.fn(), saveDetails: vi.fn() }));

const { ShareButton, SignupProvider, shareUrl } = await import("./index");

function renderShare(referralCode = "ABCD2345", props: { placement?: "top" | "bottom"; align?: "start" | "end" } = {}) {
  const user = userEvent.setup();
  render(
    <SignupProvider>
      <p>Outside</p>
      <ShareButton referralCode={referralCode} {...props} />
    </SignupProvider>,
  );
  return { user, trigger: screen.getByRole("button", { name: "Share" }) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // @ts-expect-error -- remove the test double so jsdom goes back to "no share sheet"
  delete navigator.share;
});

describe("shareUrl", () => {
  it("adds the referral code, and nothing else, to the site URL", () => {
    expect(shareUrl("ABCD2345")).toBe(`${site.url.replace(/\/+$/, "")}/?ref=ABCD2345`);
    expect(shareUrl("")).toBe(`${site.url.replace(/\/+$/, "")}/`);
  });
});

describe("ShareButton", () => {
  it("falls back to a panel when there is no share sheet, and copies the link", async () => {
    const { user, trigger } = renderShare();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("group", { name: "Share options" });
    expect(trigger).toHaveAttribute("aria-controls", panel.id);

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("button", { name: "Link copied" })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(shareUrl("ABCD2345"));
    // Announced politely for screen readers.
    expect(panel.querySelector("[aria-live='polite']")).toHaveTextContent("Link copied");
  });

  it("offers WhatsApp and email with the bare link and no promo text", async () => {
    const { user, trigger } = renderShare();
    await user.click(trigger);
    const url = encodeURIComponent(shareUrl("ABCD2345"));

    const whatsapp = screen.getByRole("link", { name: /WhatsApp/ });
    expect(whatsapp).toHaveAttribute("href", `https://wa.me/?text=${url}`);
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute(
      "href",
      `mailto:?subject=${encodeURIComponent(site.name)}&body=${url}`,
    );
  });

  it("closes on Escape and returns focus to the button, and closes on an outside click", async () => {
    const { user, trigger } = renderShare();

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Share options" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByText("Outside"));
    expect(screen.queryByRole("group", { name: "Share options" })).not.toBeInTheDocument();
  });

  it("shows the link to copy by hand when copying fails", async () => {
    const { user, trigger } = renderShare();
    await user.click(trigger);
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    document.execCommand = vi.fn(() => false);

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    const manual = await screen.findByRole("textbox", { name: /Couldn't copy/ });
    expect(manual).toHaveValue(shareUrl("ABCD2345"));
  });

  it("uses the system share sheet when there is one, with only the title and link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    const { user, trigger } = renderShare();

    // With a system share sheet the button opens no panel, so it is not announced as expandable.
    expect(trigger).not.toHaveAttribute("aria-expanded");

    await user.click(trigger);
    expect(share).toHaveBeenCalledWith({ title: site.name, url: shareUrl("ABCD2345") });
    expect(screen.queryByRole("group", { name: "Share options" })).not.toBeInTheDocument();
  });

  it("stays quiet when the visitor closes the share sheet", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Share canceled", "AbortError"));
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    const { user, trigger } = renderShare();

    await user.click(trigger);
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByRole("group", { name: "Share options" })).not.toBeInTheDocument();
  });

  it("falls back to the panel when the share sheet fails for another reason", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Not allowed", "NotAllowedError"));
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    const { user, trigger } = renderShare();

    await user.click(trigger);
    expect(await screen.findByRole("group", { name: "Share options" })).toBeInTheDocument();
  });

  it("keeps the panel on a narrow screen, and opens it on the side that has room", async () => {
    const width = window.innerWidth;
    window.innerWidth = 320;
    try {
      // Preferred side "top", but the button is near the top of the screen: it opens below.
      const { user, trigger } = renderShare("ABCD2345", { placement: "top" });
      vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 200, y: 100, width: 100, height: 48 }));
      await user.click(trigger);
      const panel = screen.getByRole("group", { name: "Share options" });
      expect(panel).toHaveClass("top-full");
      // 264px wide from x=200 would end at 464px; shifted to end 8px inside the 320px screen.
      expect(panel.style.left).toBe("-152px");
      await user.keyboard("{Escape}");

      // Lower down there is room above, so it keeps the preferred side.
      vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 16, y: 600, width: 100, height: 48 }));
      await user.click(trigger);
      expect(screen.getByRole("group", { name: "Share options" })).toHaveClass("bottom-full");
      expect(screen.getByRole("group", { name: "Share options" }).style.left).toBe("");
    } finally {
      window.innerWidth = width;
    }
  });
});
