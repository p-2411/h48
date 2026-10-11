import { describe, expect, it } from "vitest";

import { readAttribution } from "./attribution";

const at = (href: string) => {
  const url = new URL(href);
  return { search: url.search, pathname: url.pathname, origin: url.origin };
};

describe("readAttribution", () => {
  it("reads the referral code and UTM tags, and records the landing path with its query", () => {
    expect(readAttribution(at("https://roofless.au/?ref=ABCD2345&utm_source=qr&utm_medium=slide&utm_campaign=h48"), "")).toEqual({
      ref: "ABCD2345",
      utm_source: "qr",
      utm_medium: "slide",
      utm_campaign: "h48",
      landing_path: "/?ref=ABCD2345&utm_source=qr&utm_medium=slide&utm_campaign=h48",
      referrer: "",
    });
  });

  it("leaves missing values empty", () => {
    expect(readAttribution(at("https://roofless.au/"), "")).toMatchObject({ ref: "", utm_source: "", landing_path: "/" });
  });

  it("keeps the referrer only when it is an absolute URL from another site", () => {
    const page = at("https://roofless.au/");
    expect(readAttribution(page, "https://www.google.com/").referrer).toBe("https://www.google.com/");
    expect(readAttribution(page, "https://roofless.au/privacy").referrer).toBe("");
    expect(readAttribution(page, "not a url").referrer).toBe("");
    expect(readAttribution(page, "android-app://com.google.android.gm/").referrer).toBe("");
    expect(readAttribution(page, "").referrer).toBe("");
  });
});
