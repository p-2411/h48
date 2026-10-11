import { describe, expect, it } from "vitest";

import { damerauLevenshtein, POPULAR_DOMAINS, suggestEmail } from "./suggest";

describe("damerauLevenshtein", () => {
  it.each([
    ["", "", 0],
    ["", "abc", 3],
    ["abc", "", 3],
    ["gmail.com", "gmail.com", 0],
    ["gmial.com", "gmail.com", 1], // swap
    ["gmai.com", "gmail.com", 1], // missing letter
    ["gmaill.com", "gmail.com", 1], // extra letter
    ["gnail.com", "gmail.com", 1], // wrong letter
    ["gmial.con", "gmail.com", 2],
    ["kitten", "sitting", 3],
    ["ca", "abc", 3], // optimal string alignment, not unrestricted
  ])("%s → %s is %i", (a, b, expected) => {
    expect(damerauLevenshtein(a, b)).toBe(expected);
    expect(damerauLevenshtein(b, a)).toBe(expected);
  });
});

describe("suggestEmail", () => {
  it.each([
    // Swaps, missing and extra letters on the popular domains
    ["sam@gmial.com", "sam@gmail.com"],
    ["sam@gamil.com", "sam@gmail.com"],
    ["sam@gmai.com", "sam@gmail.com"],
    ["sam@gmaill.com", "sam@gmail.com"],
    ["sam@gnail.com", "sam@gmail.com"],
    ["sam@gmail.co", "sam@gmail.com"],
    ["sam@gmail.cmo", "sam@gmail.com"],
    ["sam@gmial.con", "sam@gmail.com"],
    ["sam@hotmial.com", "sam@hotmail.com"],
    ["sam@hotmail.con", "sam@hotmail.com"],
    ["sam@outlok.com", "sam@outlook.com"],
    ["sam@outloo.com.au", "sam@outlook.com.au"],
    ["sam@icloud.co", "sam@icloud.com"],
    ["sam@iclod.com", "sam@icloud.com"],
    ["sam@yaho.com", "sam@yahoo.com"],
    ["sam@yahoo.com.u", "sam@yahoo.com.au"],
    ["sam@bigpnd.com", "sam@bigpond.com"],
    ["sam@bigpond.net.u", "sam@bigpond.net.au"],
    ["sam@optusnet.com.a", "sam@optusnet.com.au"],
    ["sam@optisnet.com.au", "sam@optusnet.com.au"],
    ["sam@live.co.au", "sam@live.com.au"],
    // Missing ".au" on Australian-only providers
    ["sam@optusnet.com", "sam@optusnet.com.au"],
    ["sam@bigpond.net", "sam@bigpond.net.au"],
    // Providers that never had a .com.au address
    ["sam@gmail.com.au", "sam@gmail.com"],
    ["sam@icloud.com.au", "sam@icloud.com"],
    // No dot at all
    ["sam@gmail", "sam@gmail.com"],
    ["sam@gmial", "sam@gmail.com"],
    ["sam@hotmail", "sam@hotmail.com"],
    ["sam@optusnet", "sam@optusnet.com.au"],
    // Punctuation slips
    ["sam@gmail,com", "sam@gmail.com"],
    ["sam@gmail..com", "sam@gmail.com"],
    ["sam@gmail.com.", "sam@gmail.com"],
    // TLD slips on any domain
    ["sam@company.con", "sam@company.com"],
    ["sam@company.cpm", "sam@company.com"],
    ["sam@company.comm", "sam@company.com"],
    ["sam@company.com.ua", "sam@company.com.au"],
    ["sam@company.comau", "sam@company.com.au"],
    ["sam@company.con.au", "sam@company.com.au"],
    ["sam@company.net.ua", "sam@company.net.au"],
    // A TLD slip that lands on a whole-domain fix
    ["sam@gmail.con.au", "sam@gmail.com"],
    // Short names: the ending can be fixed when the name matches exactly
    ["sam@me.con", "sam@me.com"],
    ["sam@aol.co", "sam@aol.com"],
    ["sam@gmx.co", "sam@gmx.com"],
    // Near a known non-popular domain: suggest that one, not the popular neighbour
    ["sam@ymail.con", "sam@ymail.com"],
    ["sam@hotmail.co.u", "sam@hotmail.co.uk"],
    ["sam@yahoo.com.s", "sam@yahoo.com.sg"],
    ["sam@yaho.ca", "sam@yahoo.ca"],
  ])("%s → %s", (input, expected) => {
    expect(suggestEmail(input)).toBe(expected);
  });

  it("keeps the part before the @ exactly as typed", () => {
    expect(suggestEmail("Sam.O'Neil+solar@gmial.com")).toBe("Sam.O'Neil+solar@gmail.com");
  });

  it("ignores surrounding spaces and the case of the domain", () => {
    expect(suggestEmail("  sam@GMIAL.COM ")).toBe("sam@gmail.com");
    expect(suggestEmail("sam@GMAIL.COM")).toBeNull();
  });

  it("returns null for every popular domain spelled correctly", () => {
    for (const domain of POPULAR_DOMAINS) {
      expect(suggestEmail(`sam@${domain}`)).toBeNull();
    }
  });

  it.each([
    "sam@ymail.com",
    "sam@mail.com",
    "sam@email.com",
    "sam@live.com",
    "sam@me.com",
    "sam@gmx.com",
    "sam@aol.com",
    "sam@proton.me",
    "sam@tpg.com.au",
    "sam@iinet.net.au",
    "sam@y7mail.com",
    "sam@hotmail.co.uk",
    // Regional inboxes of the popular providers
    "sam@yahoo.ca",
    "sam@yahoo.co.nz",
    "sam@yahoo.co.in",
    "sam@yahoo.co.jp",
    "sam@yahoo.com.sg",
    "sam@yahoo.com.hk",
    "sam@hotmail.ca",
  ])("never corrects a real domain that sits close to a popular one: %s", (input) => {
    expect(suggestEmail(input)).toBeNull();
  });

  it.each([
    "sam@abc.com", // two edits from aol.com, but short names only get one edit
    "sam@example.com",
    "sam@company.com.au",
    "sam@unimelb.edu.au",
    "sam@roofless.au",
    "sam@company.co", // .co is a real TLD
    "sam@ge.com", // one letter from me.com, but a different short name
    "sam@ms.com", // one letter from me.com and msn.com
  ])("leaves unrelated custom domains alone: %s", (input) => {
    expect(suggestEmail(input)).toBeNull();
  });

  it.each(["", "   ", "sam", "@gmail.com", "sam@", "sam@@gmial.com", "sam smith@gmial.com", "sam@gm ail.com"])(
    "returns null for input that is not shaped like an email: %j",
    (input) => {
      expect(suggestEmail(input)).toBeNull();
    },
  );

  it("returns null for very long input without doing the work", () => {
    expect(suggestEmail(`${"a".repeat(300)}@gmial.com`)).toBeNull();
  });
});
