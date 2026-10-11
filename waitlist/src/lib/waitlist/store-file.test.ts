// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileStore } from "./store-file";

const base = { privacyVersion: "test" };

describe("FileStore", () => {
  let dir: string;
  let store: FileStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "waitlist-"));
    store = new FileStore(path.join(dir, "waitlist.json"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("adds a new email and allows details", async () => {
    const result = await store.upsertSignup({ ...base, email: "a@x.io", referralCode: "AAAA1111", editTokenHash: "h1" });
    expect(result).toEqual({ referralCode: "AAAA1111", created: true, canAddDetails: true });
  });

  it("keeps the original referral code for a repeat email and refreshes the token", async () => {
    await store.upsertSignup({ ...base, email: "a@x.io", referralCode: "AAAA1111", editTokenHash: "h1" });
    const again = await store.upsertSignup({ ...base, email: "a@x.io", referralCode: "BBBB2222", editTokenHash: "h2" });
    expect(again).toEqual({ referralCode: "AAAA1111", created: false, canAddDetails: true });
    expect(await store.saveDetails("h1", { homeType: "rent", postcode: "2000" })).toBe(false);
    expect(await store.saveDetails("h2", { homeType: "rent", postcode: "2000" })).toBe(true);
  });

  it("stops issuing new tokens once details are saved", async () => {
    await store.upsertSignup({ ...base, email: "a@x.io", referralCode: "AAAA1111", editTokenHash: "h1" });
    await store.saveDetails("h1", { homeType: "own", postcode: "3000" });
    const again = await store.upsertSignup({ ...base, email: "a@x.io", referralCode: "BBBB2222", editTokenHash: "h2" });
    expect(again.canAddDetails).toBe(false);
    expect(await store.saveDetails("h2", { homeType: "rent", postcode: "2000" })).toBe(false);
  });

  it("serialises concurrent writes without losing rows", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.upsertSignup({ ...base, email: `p${i}@x.io`, referralCode: `CODE${String(i).padStart(4, "0")}`, editTokenHash: `h${i}` }),
      ),
    );
    const rows = JSON.parse(await readFile(path.join(dir, "waitlist.json"), "utf8"));
    expect(rows).toHaveLength(20);
  });
});
