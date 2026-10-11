// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WaitlistStore } from "./store";

let requestHeaders = new Headers({ "x-forwarded-for": "1.1.1.1" });
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const { joinWaitlist, saveDetails } = await import("./actions");
const { setStoreForTests } = await import("./store");
const { hashEmail, hashToken } = await import("./tokens");
const { HONEYPOT_FIELD } = await import("./schema");

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

function fakeStore(overrides: Partial<WaitlistStore> = {}): WaitlistStore {
  return {
    upsertSignup: vi.fn(async (s) => ({ referralCode: s.referralCode, created: true, canAddDetails: true })),
    saveDetails: vi.fn(async () => true),
    ...overrides,
  };
}

let ip = 0;
beforeEach(() => {
  // A fresh IP per test keeps the in-memory rate limiter out of the way.
  requestHeaders = new Headers({ "x-forwarded-for": `10.0.0.${++ip}` });
});
afterEach(() => setStoreForTests(null));

describe("joinWaitlist", () => {
  it("stores a normalised email with attribution and returns a details token", async () => {
    const store = fakeStore();
    setStoreForTests(store);
    const state = await joinWaitlist(
      { status: "idle" },
      form({ email: " Sam@Example.com ", ref: "abcd2345", utm_source: "instagram" }),
    );
    expect(state.status).toBe("joined");
    if (state.status !== "joined") return;
    expect(state.email).toBe("sam@example.com");
    expect(state.detailsToken).toMatch(/^[\w-]{20,}$/);
    expect(state.referralCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    const saved = vi.mocked(store.upsertSignup).mock.calls[0][0];
    expect(saved).toMatchObject({ email: "sam@example.com", referredBy: "ABCD2345", utmSource: "instagram" });
    expect(saved.editTokenHash).toBe(hashToken(state.detailsToken!));
  });

  it("returns a field message for an invalid email and keeps what was typed", async () => {
    setStoreForTests(fakeStore());
    const state = await joinWaitlist({ status: "idle" }, form({ email: "sam@" }));
    expect(state).toEqual({ status: "error", message: "Enter an email address, like sam@example.com.", email: "sam@" });
  });

  it("pretends to succeed for bots that fill the honeypot, and stores nothing", async () => {
    const store = fakeStore();
    setStoreForTests(store);
    const state = await joinWaitlist({ status: "idle" }, form({ email: "bot@x.io", [HONEYPOT_FIELD]: "spam.example" }));
    expect(state.status).toBe("joined");
    expect(store.upsertSignup).not.toHaveBeenCalled();
  });

  it("hides the details step for someone who already gave details", async () => {
    setStoreForTests(fakeStore({ upsertSignup: vi.fn(async () => ({ referralCode: "AAAA1111", created: false, canAddDetails: false })) }));
    const state = await joinWaitlist({ status: "idle" }, form({ email: "sam@example.com" }));
    expect(state).toMatchObject({ status: "joined", detailsToken: null, alreadyJoined: true, referralCode: "AAAA1111" });
  });

  it("shows a retry message when the store fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setStoreForTests(fakeStore({ upsertSignup: vi.fn(async () => Promise.reject(new Error("db down"))) }));
    const state = await joinWaitlist({ status: "idle" }, form({ email: "sam@example.com" }));
    expect(state).toMatchObject({ status: "error", message: "We couldn't save that just now. Try again in a minute." });
  });

  it("rate-limits repeated attempts from one connection", async () => {
    setStoreForTests(fakeStore());
    const results = [];
    for (let i = 0; i < 9; i++) results.push(await joinWaitlist({ status: "idle" }, form({ email: `p${i}@x.io` })));
    expect(results.slice(0, 8).every((r) => r.status === "joined")).toBe(true);
    expect(results[8]).toMatchObject({ status: "error", message: expect.stringContaining("Too many tries") });
  });
});

describe("saveDetails", () => {
  const token = "t".repeat(32);

  it("saves details against the token's hash", async () => {
    const store = fakeStore();
    setStoreForTests(store);
    const state = await saveDetails({ status: "idle" }, form({ token, homeType: "apartment", postcode: "2150" }));
    expect(state).toEqual({ status: "saved" });
    expect(store.saveDetails).toHaveBeenCalledWith(hashToken(token), { homeType: "apartment", postcode: "2150" });
  });

  it("explains a missing choice before checking the token", async () => {
    setStoreForTests(fakeStore());
    const state = await saveDetails({ status: "idle" }, form({ token, postcode: "2150" }));
    expect(state).toEqual({ status: "error", message: "Choose the option that fits your home." });
  });

  it("explains an invalid postcode", async () => {
    setStoreForTests(fakeStore());
    const state = await saveDetails({ status: "idle" }, form({ token, homeType: "rent", postcode: "21" }));
    expect(state).toEqual({ status: "error", message: "Enter your 4-digit postcode." });
  });

  it("fails gently when the token matches nothing", async () => {
    setStoreForTests(fakeStore({ saveDetails: vi.fn(async () => false) }));
    const state = await saveDetails({ status: "idle" }, form({ token, homeType: "rent", postcode: "2150" }));
    expect(state).toMatchObject({ status: "error" });
  });
});

describe("joinWaitlist consent record", () => {
  it("stores the landing path, referrer and a hashed IP, never the raw IP", async () => {
    requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7" });
    const store = fakeStore();
    setStoreForTests(store);
    await joinWaitlist(
      { status: "idle" },
      form({ email: "sam@example.com", landing_path: "/?utm_source=qr", referrer: "https://www.google.com/" }),
    );
    const saved = vi.mocked(store.upsertSignup).mock.calls[0][0];
    expect(saved.landingPath).toBe("/?utm_source=qr");
    expect(saved.referrer).toBe("https://www.google.com/");
    expect(saved.ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(saved)).not.toContain("203.0.113.7");
  });

  it("drops a landing path that isn't a site path", async () => {
    const store = fakeStore();
    setStoreForTests(store);
    await joinWaitlist({ status: "idle" }, form({ email: "sam@example.com", landing_path: "https://evil.example/" }));
    expect(vi.mocked(store.upsertSignup).mock.calls[0][0].landingPath).toBeUndefined();
  });
});

describe("joinWaitlist suppression", () => {
  it("shows the usual success for a removed email but offers no details step", async () => {
    setStoreForTests(fakeStore({ upsertSignup: vi.fn(async () => ({ suppressed: true, referralCode: "", created: false, canAddDetails: false })) }));
    const state = await joinWaitlist({ status: "idle" }, form({ email: "gone@example.com" }));
    expect(state).toEqual({ status: "joined", email: "gone@example.com", referralCode: "", detailsToken: null, alreadyJoined: false });
  });

  it("hashes emails the same way as the SQL convention in the README", () => {
    // echo -n "sam@example.com" | shasum -a 256
    expect(hashEmail(" Sam@Example.com ")).toBe("cd25a6171969f2a3c6e35c7667e3908ef1bd2424241db04411a0eec454ca6c16");
  });
});
