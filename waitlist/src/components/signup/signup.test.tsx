import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DetailsState, JoinState } from "@/lib/waitlist/actions";
import { HONEYPOT_FIELD } from "@/lib/waitlist/schema";

const actions = vi.hoisted(() => ({
  joinWaitlist: vi.fn<(prev: JoinState, formData: FormData) => Promise<JoinState>>(),
  saveDetails: vi.fn<(prev: DetailsState, formData: FormData) => Promise<DetailsState>>(),
}));
vi.mock("@/lib/waitlist/actions", () => actions);

const { JoinForm, SignupProvider, useSignup } = await import("./index");
const { STORAGE_KEY } = await import("./signup-store");

/* ------------------------------------------------------------------ */
/* jsdom has no showModal/close; a minimal polyfill is enough here.   */
/* ------------------------------------------------------------------ */

beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (typeof proto.close !== "function") {
    proto.close = function close(this: HTMLDialogElement) {
      if (!this.hasAttribute("open")) return;
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
});

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const TOKEN = "tok_0123456789abcdefghijklmnop";

function joined(email: string, detailsToken: string | null = TOKEN): JoinState {
  return { status: "joined", email, referralCode: "ABCD2345", detailsToken, alreadyJoined: false };
}

function Probe() {
  const s = useSignup();
  return <output data-testid="probe">{`${s.status}|${s.detailsStatus}|${s.modalOpen ? "open" : "closed"}`}</output>;
}

function renderForms() {
  const user = userEvent.setup();
  render(
    <SignupProvider>
      <section data-testid="hero">
        <JoinForm variant="hero" inputId="hero-email" />
      </section>
      <section data-testid="inline">
        <JoinForm variant="inline" inputId="inline-email" />
      </section>
      <Probe />
    </SignupProvider>,
  );
  const hero = screen.getByTestId("hero");
  const inline = screen.getByTestId("inline");
  return {
    user,
    hero,
    inline,
    heroInput: within(hero).getByRole("textbox", { name: "Your email" }) as HTMLInputElement,
    inlineInput: within(inline).getByRole("textbox", { name: "Your email" }) as HTMLInputElement,
    heroButton: within(hero).getByRole("button", { name: "Join the waitlist" }),
    probe: () => screen.getByTestId("probe").textContent,
  };
}

/** Joins through the hero form and waits for the modal (or the joined card when there is no token). */
async function joinFromHero(view: ReturnType<typeof renderForms>, email = "sam@example.com") {
  await view.user.type(view.heroInput, email);
  await view.user.click(view.heroButton);
}

async function findDialog() {
  return screen.findByRole("dialog", { name: "You're on the list ✓" }, { timeout: 2000 });
}

beforeEach(() => {
  window.sessionStorage.clear();
  actions.joinWaitlist.mockReset();
  actions.saveDetails.mockReset();
  actions.joinWaitlist.mockImplementation(async (_prev, formData) => joined(String(formData.get("email"))));
  actions.saveDetails.mockResolvedValue({ status: "saved" });
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  document.documentElement.removeAttribute("style");
});

/* ------------------------------------------------------------------ */
/* validation                                                          */
/* ------------------------------------------------------------------ */

describe("JoinForm validation", () => {
  it("validates on blur only when the field has text, and clears the error once fixed", async () => {
    const { user, heroInput } = renderForms();

    await user.click(heroInput);
    await user.tab();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(heroInput);
    await user.type(heroInput, "sam");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // never while typing
    await user.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent("Add an @ and the part after it, like sam@gmail.com.");
    expect(heroInput).toHaveAttribute("aria-invalid", "true");
    expect(heroInput).toHaveAccessibleDescription(/Add an @/);

    await user.type(heroInput, "@example.com");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(heroInput).not.toHaveAttribute("aria-invalid");
  });

  it("validates on submit with the server's schema and never calls the server with a bad address", async () => {
    const { user, heroInput, heroButton } = renderForms();

    await user.click(heroButton);
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your email address.");
    expect(heroInput).toHaveFocus();
    expect(heroButton).toBeEnabled();

    await user.type(heroInput, "sam@example");
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter an email address, like sam@example.com.");
    expect(actions.joinWaitlist).not.toHaveBeenCalled();
  });

  it("shows the server's message and keeps what was typed", async () => {
    actions.joinWaitlist.mockResolvedValue({
      status: "error",
      message: "Too many tries from your connection. Wait a minute, then try again.",
      email: "sam@example.com",
    });
    const { user, heroInput, heroButton } = renderForms();

    await user.type(heroInput, "sam@example.com");
    await user.click(heroButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many tries from your connection.");
    expect(heroInput).toHaveValue("sam@example.com");

    await user.type(heroInput, "m");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("turns a failed request into a message under the form instead of the page-wide error screen", async () => {
    actions.joinWaitlist.mockRejectedValue(new TypeError("Failed to fetch"));
    const { user, heroInput, heroButton } = renderForms();

    await user.type(heroInput, "sam@example.com");
    await user.click(heroButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't reach our server. Refresh the page, then try again.");
    expect(heroInput).toHaveValue("sam@example.com");
    expect(heroButton).toHaveTextContent("Join the waitlist");

    // A second try goes through once the connection is back.
    actions.joinWaitlist.mockImplementation(async (_prev, formData) => joined(String(formData.get("email"))));
    await user.click(heroButton);
    await findDialog();
  });

  it("offers a typo fix that fills the field when chosen, and never changes it by itself", async () => {
    const { user, heroInput } = renderForms();

    await user.type(heroInput, "sam@gmial.com");
    await user.tab();
    expect(heroInput).toHaveValue("sam@gmial.com");

    const fix = await screen.findByRole("button", { name: "sam@gmail.com" });
    expect(fix.closest("p")).toHaveTextContent("Did you mean sam@gmail.com?");

    await user.click(fix);
    expect(heroInput).toHaveValue("sam@gmail.com");
    expect(heroInput).toHaveFocus();
    expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
  });

  it("shows the spinner only when the save is slow", async () => {
    let resolve: (state: JoinState) => void = () => {};
    actions.joinWaitlist.mockImplementation(() => new Promise<JoinState>((r) => (resolve = r)));
    const { user, heroInput, heroButton } = renderForms();

    await user.type(heroInput, "sam@example.com");
    await user.click(heroButton);
    expect(heroButton).toHaveTextContent("Join the waitlist");
    await waitFor(() => expect(heroButton).toHaveTextContent("Joining…"));
    expect(heroButton).toBeEnabled();

    await act(async () => resolve(joined("sam@example.com")));
    await waitFor(() => expect(heroButton).toHaveTextContent("You're in ✓"));
  });
});

/* ------------------------------------------------------------------ */
/* hidden fields                                                       */
/* ------------------------------------------------------------------ */

describe("JoinForm hidden fields", () => {
  it("sends attribution from the URL and referrer, plus an empty honeypot", async () => {
    window.history.replaceState(null, "", "/?ref=ABCD2345&utm_source=instagram&utm_medium=social&utm_campaign=launch");
    const referrer = vi.spyOn(document, "referrer", "get").mockReturnValue("https://news.example.com/story");
    const { user, heroInput, heroButton } = renderForms();

    await user.type(heroInput, "sam@example.com");
    await user.click(heroButton);
    await waitFor(() => expect(actions.joinWaitlist).toHaveBeenCalledTimes(1));

    const data = actions.joinWaitlist.mock.calls[0][1];
    expect(Object.fromEntries([...data.entries()].filter(([key]) => !key.startsWith("$ACTION")))).toEqual({
      email: "sam@example.com",
      [HONEYPOT_FIELD]: "",
      ref: "ABCD2345",
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "launch",
      landing_path: "/?ref=ABCD2345&utm_source=instagram&utm_medium=social&utm_campaign=launch",
      referrer: "https://news.example.com/story",
    });
    referrer.mockRestore();
  });

  it("keeps the honeypot out of reach: off screen, not tabbable, hidden from assistive tech", () => {
    renderForms();
    const trap = document.querySelector<HTMLInputElement>(`input[name="${HONEYPOT_FIELD}"]`)!;
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap).toHaveAttribute("autocomplete", "off");
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
    expect(trap.type).toBe("text"); // not type=hidden or display:none, so naive bots still fill it
  });
});

/* ------------------------------------------------------------------ */
/* joined state                                                        */
/* ------------------------------------------------------------------ */

describe("joined state", () => {
  it("shows the success beat, then switches every form to the joined view and opens the modal", async () => {
    const view = renderForms();
    await joinFromHero(view);

    await waitFor(() => expect(view.heroButton).toHaveTextContent("You're in ✓"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await findDialog();
    for (const section of [view.hero, view.inline]) {
      expect(within(section).getByText("You're on the list ✓")).toBeInTheDocument();
      expect(within(section).getByText("sam@example.com").parentElement).toHaveTextContent("We'll email sam@example.com.");
      expect(within(section).getByRole("button", { name: "Share" })).toBeInTheDocument();
      expect(within(section).queryByRole("textbox", { name: "Your email" })).not.toBeInTheDocument();
    }
    expect(view.probe()).toBe("joined|pending|open");
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)!)).toEqual({
      joined: true,
      email: "sam@example.com",
      referralCode: "ABCD2345",
    });
  });

  it("does not open the modal without a details token, and moves focus to the joined card", async () => {
    actions.joinWaitlist.mockImplementation(async (_prev, formData) => joined(String(formData.get("email")), null));
    const view = renderForms();
    await joinFromHero(view);

    const card = await within(view.hero).findByText("You're on the list ✓", {}, { timeout: 2000 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(view.probe()).toBe("joined|skipped|closed");
    await waitFor(() => expect(document.getElementById("hero-email-joined")).toHaveFocus());
    expect(document.getElementById("hero-email-joined")).toContainElement(card);
  });

  it("works from any form: joining in the inline form updates the hero form too", async () => {
    const view = renderForms();
    await view.user.type(view.inlineInput, "alex@example.com");
    await view.user.click(within(view.inline).getByRole("button", { name: "Join the waitlist" }));

    await findDialog();
    expect(within(view.hero).getByText("alex@example.com")).toBeInTheDocument();
  });

  it("'Not you? Fix it' forgets the sign-up and puts the old address back in that form's input", async () => {
    actions.joinWaitlist.mockImplementation(async (_prev, formData) => joined(String(formData.get("email")), null));
    const view = renderForms();
    await joinFromHero(view, "sam@exmaple.com");
    await within(view.inline).findByText("You're on the list ✓", {}, { timeout: 2000 });

    await view.user.click(within(view.inline).getByRole("button", { name: "Not you? Fix it" }));

    const inlineInput = within(view.inline).getByRole("textbox", { name: "Your email" });
    expect(inlineInput).toHaveValue("sam@exmaple.com");
    await waitFor(() => expect(inlineInput).toHaveFocus());
    expect(within(view.hero).getByRole("textbox", { name: "Your email" })).toBeInTheDocument();
    expect(within(view.hero).getByRole("button", { name: "Join the waitlist" })).toBeInTheDocument();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(view.probe()).toBe("idle|pending|closed");
  });

  it("renders idle on the server and first client render, then restores a saved sign-up without a hydration mismatch", async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ joined: true, email: "sam@example.com", referralCode: "ABCD2345" }));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const tree = (
      <SignupProvider>
        <JoinForm variant="hero" inputId="hero-email" />
      </SignupProvider>
    );

    const html = renderToString(tree);
    expect(html).toContain("Join the waitlist");
    expect(html).not.toContain("on the list");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const recoverable: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError: (error) => recoverable.push(error) });
    });

    expect(within(container).getByText("You're on the list ✓")).toBeInTheDocument();
    expect(within(container).getByText("sam@example.com")).toBeInTheDocument();
    expect(recoverable).toEqual([]);
    expect(errors).not.toHaveBeenCalled();

    act(() => root?.unmount());
    container.remove();
    errors.mockRestore();
  });

  it("ignores broken or blocked session storage", async () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{not json");
    const view = renderForms();
    expect(view.heroInput).toBeInTheDocument();

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    actions.joinWaitlist.mockImplementation(async (_prev, formData) => joined(String(formData.get("email")), null));
    await joinFromHero(view);
    expect(await within(view.hero).findByText("You're on the list ✓", {}, { timeout: 2000 })).toBeInTheDocument();
    setItem.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/* details modal                                                       */
/* ------------------------------------------------------------------ */

describe("DetailsModal", () => {
  it("has the spec content: progress, three home cards, postcode attributes, notice and actions", async () => {
    const view = renderForms();
    await joinFromHero(view);
    const dialog = await findDialog();

    expect(dialog).toHaveAccessibleDescription("2 quick questions to help us plan farms near you. Both optional.");
    const progress = within(dialog).getByRole("list", { name: "Progress" });
    expect(progress).toHaveTextContent(/Email.*Your home.*Done/);
    expect(within(progress).getByText("Your home").closest("li")).toHaveAttribute("aria-current", "step");

    const group = within(dialog).getByRole("group", { name: "Your home (optional)" });
    expect(within(group).getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual(["rent", "own", "apartment"]);
    for (const name of ["I rent", "I own", "Apartment"]) expect(within(group).getByRole("radio", { name })).toBeInTheDocument();
    // Focus starts on the first question, not on the close button.
    expect(within(group).getByRole("radio", { name: "I rent" })).toHaveFocus();

    const postcode = within(dialog).getByRole("textbox", { name: "Postcode (optional)" });
    expect(postcode).toHaveAttribute("type", "text");
    expect(postcode).toHaveAttribute("inputmode", "numeric");
    expect(postcode).toHaveAttribute("autocomplete", "postal-code");
    expect(postcode).toHaveAttribute("pattern", "[0-9]{4}");
    expect(postcode).toHaveAttribute("maxlength", "4");
    expect(postcode).toHaveAttribute("enterkeyhint", "done");
    expect(postcode).toHaveAccessibleDescription("So we can tell you when a farm opens near you, and see where demand is.");

    expect(within(dialog).getByText(/We use your home type and postcode only for research and launch planning\./)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(document.documentElement.style.overflow).toBe("hidden");
    // The custom cursor draws below the top layer, so the modal asks for the system cursor.
    expect(dialog).toHaveAttribute("data-cursor", "native");
  });

  it("a click on the backdrop is Skip, but a click on the sheet's own scrollbar is not", async () => {
    const view = renderForms();
    await joinFromHero(view);
    const dialog = await findDialog();
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 0, y: 100, width: 400, height: 600 }));

    // The scrollbar is inside the dialog's box, and its events target the dialog itself.
    fireEvent.pointerDown(dialog, { clientX: 395, clientY: 300 });
    fireEvent.click(dialog, { clientX: 395, clientY: 300 });
    expect(dialog).toHaveAttribute("open");

    fireEvent.pointerDown(dialog, { clientX: 200, clientY: 40 });
    fireEvent.click(dialog, { clientX: 200, clientY: 40 });
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(view.probe()).toBe("joined|skipped|closed");
  });

  it("closes quietly while navigation hides the page, and opens again on return", async () => {
    // Next keeps visited pages mounted inside <Activity mode="hidden">.
    function Page({ mode }: { mode: "visible" | "hidden" }) {
      return (
        <Activity mode={mode}>
          <SignupProvider>
            <JoinForm variant="hero" inputId="hero-email" />
            <Probe />
          </SignupProvider>
        </Activity>
      );
    }
    const user = userEvent.setup();
    const { rerender } = render(<Page mode="visible" />);
    await user.type(screen.getByRole("textbox", { name: "Your email" }), "sam@example.com");
    await user.click(screen.getByRole("button", { name: "Join the waitlist" }));
    const dialog = await findDialog();
    await user.click(within(dialog).getByRole("radio", { name: "I own" }));

    rerender(<Page mode="hidden" />);
    // A modal dialog left open would make the next page inert.
    expect(dialog).not.toHaveAttribute("open");
    expect(document.documentElement.style.overflow).toBe("");
    expect(screen.getByTestId("probe").textContent).toBe("joined|pending|open");

    rerender(<Page mode="visible" />);
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByRole("radio", { name: "I own" })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "I own" })).toHaveFocus();
  });

  it.each([
    ["Skip", async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => user.click(within(dialog).getByRole("button", { name: "Skip" }))],
    ["✕", async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => user.click(within(dialog).getByRole("button", { name: "Close" }))],
    ["Esc", async (_user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => {
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
    }],
  ])("%s completes the flow as skipped and returns focus to where it started", async (_label, dismiss) => {
    const view = renderForms();
    await joinFromHero(view);
    const dialog = await findDialog();

    await dismiss(view.user, dialog);

    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(view.probe()).toBe("joined|skipped|closed");
    expect(actions.saveDetails).not.toHaveBeenCalled();
    expect(document.getElementById("hero-email-joined")).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("a card tap moves focus to the postcode; a half-filled form asks for the other answer instead of calling the server", async () => {
    const view = renderForms();
    await joinFromHero(view);
    const dialog = await findDialog();
    const postcode = within(dialog).getByRole("textbox", { name: "Postcode (optional)" });

    await view.user.click(within(dialog).getByRole("radio", { name: "I rent" }));
    expect(within(dialog).getByRole("radio", { name: "I rent" })).toBeChecked();
    expect(postcode).toHaveFocus();

    await view.user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Add your postcode too, or choose Skip.");
    expect(postcode).toHaveFocus();
    expect(postcode).toHaveAttribute("aria-invalid", "true");
    expect(actions.saveDetails).not.toHaveBeenCalled();
    expect(dialog).toHaveAttribute("open");

    await view.user.type(postcode, "30");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    await view.user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Enter your 4-digit postcode.");
    expect(actions.saveDetails).not.toHaveBeenCalled();
  });

  it("asks for the home type when only the postcode is filled", async () => {
    const view = renderForms();
    await joinFromHero(view);
    const dialog = await findDialog();

    await view.user.type(within(dialog).getByRole("textbox", { name: "Postcode (optional)" }), "3000");
    await view.user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Choose your home type too, or choose Skip.");
    expect(within(dialog).getByRole("radio", { name: "I rent" })).toHaveFocus();
    expect(actions.saveDetails).not.toHaveBeenCalled();
  });

  it("arrow keys move between cards without jumping to the postcode", async () => {
    const view = renderForms();
    await joinFromHero(view);
    const dialog = await findDialog();

    const rent = within(dialog).getByRole("radio", { name: "I rent" });
    rent.focus();
    fireEvent.keyDown(rent, { key: "ArrowRight" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "I own" }));
    fireEvent.keyUp(rent, { key: "ArrowRight" });
    expect(within(dialog).getByRole("radio", { name: "I own" })).toBeChecked();
    expect(within(dialog).getByRole("textbox", { name: "Postcode (optional)" })).not.toHaveFocus();
  });

  it("saves both answers with the token, closes and marks the details saved", async () => {
    const view = renderForms();
    await joinFromHero(view);
    const dialog = await findDialog();

    await view.user.click(within(dialog).getByRole("radio", { name: "Apartment" }));
    await view.user.type(within(dialog).getByRole("textbox", { name: "Postcode (optional)" }), "2000");
    await view.user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    const data = actions.saveDetails.mock.calls[0][1];
    expect(data.get("token")).toBe(TOKEN);
    expect(data.get("homeType")).toBe("apartment");
    expect(data.get("postcode")).toBe("2000");
    expect(view.probe()).toBe("joined|saved|closed");
    expect(document.getElementById("hero-email-joined")).toHaveFocus();
  });

  it("keeps the answers and shows the server's message when saving fails", async () => {
    actions.saveDetails.mockResolvedValue({ status: "error", message: "We couldn't save that just now. Try again in a minute." });
    const view = renderForms();
    await joinFromHero(view);
    const dialog = await findDialog();

    await view.user.click(within(dialog).getByRole("radio", { name: "I own" }));
    await view.user.type(within(dialog).getByRole("textbox", { name: "Postcode (optional)" }), "4000");
    await view.user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("We couldn't save that just now.");
    expect(within(dialog).getByRole("radio", { name: "I own" })).toBeChecked();
    expect(within(dialog).getByRole("textbox", { name: "Postcode (optional)" })).toHaveValue("4000");
    expect(dialog).toHaveAttribute("open");
  });

  it("shows a message and keeps the answers when the request fails", async () => {
    actions.saveDetails.mockRejectedValue(new TypeError("Failed to fetch"));
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const view = renderForms();
    await joinFromHero(view);
    const dialog = await findDialog();

    await view.user.click(within(dialog).getByRole("radio", { name: "I rent" }));
    await view.user.type(within(dialog).getByRole("textbox", { name: "Postcode (optional)" }), "3000");
    await view.user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("You're offline. Check your connection, then try again.");
    expect(within(dialog).getByRole("radio", { name: "I rent" })).toBeChecked();
    expect(dialog).toHaveAttribute("open");
    onLine.mockRestore();
  });

  it("counts a save that finishes after Skip as saved", async () => {
    let resolve: (state: DetailsState) => void = () => {};
    actions.saveDetails.mockImplementation(() => new Promise<DetailsState>((r) => (resolve = r)));
    const view = renderForms();
    await joinFromHero(view);
    const dialog = await findDialog();

    await view.user.click(within(dialog).getByRole("radio", { name: "I rent" }));
    await view.user.type(within(dialog).getByRole("textbox", { name: "Postcode (optional)" }), "3000");
    await view.user.click(within(dialog).getByRole("button", { name: "Save" }));
    await view.user.click(within(dialog).getByRole("button", { name: "Skip" }));
    expect(view.probe()).toBe("joined|skipped|closed");

    await act(async () => resolve({ status: "saved" }));
    expect(view.probe()).toBe("joined|saved|closed");
  });

  it("treats Save with nothing chosen as Skip", async () => {
    const view = renderForms();
    await joinFromHero(view);
    const dialog = await findDialog();

    await view.user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(view.probe()).toBe("joined|skipped|closed");
    expect(actions.saveDetails).not.toHaveBeenCalled();
  });
});
