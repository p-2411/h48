import { describe, expect, it } from "vitest";

import { clientKey, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit within a window, then blocks", () => {
    const take = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(take("ip", 0)).toBe(true);
    expect(take("ip", 10)).toBe(true);
    expect(take("ip", 20)).toBe(false);
  });

  it("resets after the window", () => {
    const take = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(take("ip", 0)).toBe(true);
    expect(take("ip", 999)).toBe(false);
    expect(take("ip", 1000)).toBe(true);
  });

  it("tracks keys separately", () => {
    const take = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(take("a", 0)).toBe(true);
    expect(take("b", 0)).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first x-forwarded-for address", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then a shared bucket", () => {
    expect(clientKey(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
