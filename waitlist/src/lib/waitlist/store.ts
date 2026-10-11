import "server-only";

import type { HomeType } from "./schema";

export type NewSignup = {
  email: string;
  referralCode: string;
  editTokenHash: string;
  referredBy?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  landingPath?: string;
  referrer?: string;
  ipHash?: string;
  privacyVersion: string;
};

export type UpsertResult = {
  /** The email asked to be removed earlier. Nothing was stored; the visitor sees the usual success. */
  suppressed?: boolean;
  /** True while the signup has no home details yet, so the new edit token is live. */
  canAddDetails: boolean;
  referralCode: string;
  created: boolean;
};

export interface WaitlistStore {
  /**
   * Adds the email, or finds it if it is already on the list. For an existing email whose
   * details are still empty, the new edit token replaces the old one.
   */
  upsertSignup(signup: NewSignup): Promise<UpsertResult>;
  /** Saves home details for the signup that owns this edit token. Returns false if no row matches. */
  saveDetails(editTokenHash: string, details: { homeType: HomeType; postcode: string }): Promise<boolean>;
}

export class StoreNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set. Sign-ups cannot be stored in production without a database.");
    this.name = "StoreNotConfiguredError";
  }
}

let store: WaitlistStore | null = null;

/**
 * Neon when DATABASE_URL is set; a local JSON file in development (or when WAITLIST_STORE=file,
 * which e2e tests and CI use against a production build); otherwise a hard error.
 * Never set WAITLIST_STORE=file on a real deployment: serverless disks are not persistent.
 */
export async function getStore(): Promise<WaitlistStore> {
  if (store) return store;
  if (process.env.DATABASE_URL) {
    const { NeonStore } = await import("./store-neon");
    store = new NeonStore(process.env.DATABASE_URL);
  } else if (process.env.NODE_ENV !== "production" || process.env.WAITLIST_STORE === "file") {
    const { FileStore } = await import("./store-file");
    store = new FileStore();
  } else {
    throw new StoreNotConfiguredError();
  }
  return store;
}

/** Test hook: swap the store for a fake. */
export function setStoreForTests(next: WaitlistStore | null) {
  store = next;
}
