import { describe, expect, it } from "vitest";

import { detailsSchema, emailSchema, field, joinSchema } from "./schema";

describe("emailSchema", () => {
  it("trims and lowercases a valid address", () => {
    expect(emailSchema.parse("  Sam@Example.COM ")).toBe("sam@example.com");
  });

  it.each(["", "sam", "sam@", "@example.com", "sam@example"])("rejects %j", (value) => {
    expect(emailSchema.safeParse(value).success).toBe(false);
  });

  it("asks for an email when empty", () => {
    const result = emailSchema.safeParse("   ");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Enter your email address.");
  });

  it("rejects addresses longer than 254 characters", () => {
    expect(emailSchema.safeParse(`${"a".repeat(250)}@x.io`).success).toBe(false);
  });
});

describe("joinSchema", () => {
  it("keeps a well-formed referral code, uppercased", () => {
    const result = joinSchema.parse({ email: "sam@example.com", referredBy: "abcd2345" });
    expect(result.referredBy).toBe("ABCD2345");
  });

  it("drops a malformed referral code instead of failing the sign-up", () => {
    const result = joinSchema.parse({ email: "sam@example.com", referredBy: "not a code!" });
    expect(result.referredBy).toBeUndefined();
  });

  it("drops over-long UTM values instead of failing", () => {
    const result = joinSchema.parse({ email: "sam@example.com", utmSource: "x".repeat(500) });
    expect(result.utmSource).toBeUndefined();
  });
});

describe("detailsSchema", () => {
  const token = "t".repeat(32);

  it("accepts a home type and a 4-digit postcode", () => {
    expect(detailsSchema.parse({ token, homeType: "rent", postcode: "2150" })).toEqual({
      token,
      homeType: "rent",
      postcode: "2150",
    });
  });

  it("keeps the leading zero of NT postcodes", () => {
    expect(detailsSchema.parse({ token, homeType: "own", postcode: "0800" }).postcode).toBe("0800");
  });

  it("explains a missing home type", () => {
    const result = detailsSchema.safeParse({ token, postcode: "2150" });
    expect(result.error?.issues[0].message).toBe("Choose the option that fits your home.");
  });

  it.each(["215", "21500", "abcd", ""])("rejects postcode %j", (postcode) => {
    const result = detailsSchema.safeParse({ token, homeType: "rent", postcode });
    expect(result.success).toBe(false);
  });
});

describe("field", () => {
  it("returns strings and treats empty values as missing", () => {
    const data = new FormData();
    data.set("a", "x");
    data.set("b", "");
    expect(field(data, "a")).toBe("x");
    expect(field(data, "b")).toBeUndefined();
    expect(field(data, "c")).toBeUndefined();
  });
});
