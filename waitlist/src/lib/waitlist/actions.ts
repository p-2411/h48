"use server";

import { headers } from "next/headers";

import { site } from "@/config/site";

import { clientKey, createRateLimiter } from "./rate-limit";
import { detailsSchema, field, HONEYPOT_FIELD, joinSchema } from "./schema";
import { getStore } from "./store";
import { createEditToken, createReferralCode, hashIp, hashToken } from "./tokens";

export type JoinState =
  | { status: "idle" }
  | { status: "error"; message: string; email: string }
  | { status: "joined"; email: string; referralCode: string; detailsToken: string | null; alreadyJoined: boolean };

export type DetailsState = { status: "idle" } | { status: "error"; message: string } | { status: "saved" };

const joinLimiter = createRateLimiter({ limit: 8, windowMs: 60_000 });
const detailsLimiter = createRateLimiter({ limit: 12, windowMs: 60_000 });

const SAVE_FAILED = "We couldn't save that just now. Try again in a minute.";
const TOO_MANY = "Too many tries from your connection. Wait a minute, then try again.";

export async function joinWaitlist(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const emailInput = field(formData, "email") ?? "";

  if (field(formData, HONEYPOT_FIELD)) {
    // Look successful so bots learn nothing, but store nothing.
    return { status: "joined", email: emailInput, referralCode: "", detailsToken: null, alreadyJoined: false };
  }

  const ip = clientKey(await headers());
  if (!joinLimiter(ip)) {
    return { status: "error", message: TOO_MANY, email: emailInput };
  }

  const parsed = joinSchema.safeParse({
    email: emailInput,
    referredBy: field(formData, "ref"),
    utmSource: field(formData, "utm_source"),
    utmMedium: field(formData, "utm_medium"),
    utmCampaign: field(formData, "utm_campaign"),
    landingPath: field(formData, "landing_path"),
    referrer: field(formData, "referrer"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues.find((i) => i.path[0] === "email")?.message ?? "Check your email address.";
    return { status: "error", message, email: emailInput };
  }

  const { email, referredBy, utmSource, utmMedium, utmCampaign, landingPath, referrer } = parsed.data;
  const { token, hash } = createEditToken();

  try {
    const store = await getStore();
    const result = await store.upsertSignup({
      email,
      referralCode: createReferralCode(),
      editTokenHash: hash,
      referredBy,
      utmSource,
      utmMedium,
      utmCampaign,
      landingPath,
      referrer,
      ipHash: hashIp(ip),
      privacyVersion: site.privacyVersion,
    });
    if (result.suppressed) {
      return { status: "joined", email, referralCode: "", detailsToken: null, alreadyJoined: false };
    }
    return {
      status: "joined",
      email,
      referralCode: result.referralCode,
      detailsToken: result.canAddDetails ? token : null,
      alreadyJoined: !result.created,
    };
  } catch (error) {
    console.error("[waitlist] join failed", error);
    return { status: "error", message: SAVE_FAILED, email: emailInput };
  }
}

export async function saveDetails(_prev: DetailsState, formData: FormData): Promise<DetailsState> {
  if (!detailsLimiter(clientKey(await headers()))) {
    return { status: "error", message: TOO_MANY };
  }

  const parsed = detailsSchema.safeParse({
    token: field(formData, "token"),
    homeType: field(formData, "homeType"),
    postcode: field(formData, "postcode"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.path[0] !== "token") ?? parsed.error.issues[0];
    return { status: "error", message: issue.path[0] === "token" ? SAVE_FAILED : issue.message };
  }

  try {
    const store = await getStore();
    const saved = await store.saveDetails(hashToken(parsed.data.token), {
      homeType: parsed.data.homeType,
      postcode: parsed.data.postcode,
    });
    // An unknown token means a stale tab or a tampered form. The email is already saved either way.
    return saved ? { status: "saved" } : { status: "error", message: SAVE_FAILED };
  } catch (error) {
    console.error("[waitlist] save details failed", error);
    return { status: "error", message: SAVE_FAILED };
  }
}
