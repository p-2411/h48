import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import type { HomeType } from "./schema";
import type { NewSignup, UpsertResult, WaitlistStore } from "./store";
import { createReferralCode, hashEmail } from "./tokens";

const UNIQUE_VIOLATION = "23505";

function isReferralCodeClash(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string } | null;
  return e?.code === UNIQUE_VIOLATION && (e.constraint ?? "").includes("referral_code");
}

export class NeonStore implements WaitlistStore {
  private readonly sql: NeonQueryFunction<false, false>;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  async upsertSignup(signup: NewSignup): Promise<UpsertResult> {
    // People who asked to be removed are never added back, even if they (or someone) submit again.
    const suppressed = await this.sql`SELECT 1 FROM waitlist_suppressions WHERE email_hash = ${hashEmail(signup.email)}`;
    if (suppressed.length > 0) return { suppressed: true, referralCode: "", created: false, canAddDetails: false };

    // A referral code clash is about one in a trillion; retry with a fresh code just in case.
    for (let attempt = 0; attempt < 3; attempt++) {
      const referralCode = attempt === 0 ? signup.referralCode : createReferralCode();
      try {
        return await this.insert({ ...signup, referralCode });
      } catch (error) {
        if (!isReferralCodeClash(error) || attempt === 2) throw error;
      }
    }
    throw new Error("unreachable");
  }

  private async insert(s: NewSignup): Promise<UpsertResult> {
    // On a repeat email, keep the original row. Refresh the edit token only while details are empty.
    // `xmax = 0` is true for a freshly inserted row and false for one updated by ON CONFLICT.
    const rows = (await this.sql`
      INSERT INTO waitlist_signups
        (email, referral_code, edit_token_hash, referred_by, utm_source, utm_medium, utm_campaign,
         landing_path, referrer, ip_hash, privacy_version)
      VALUES
        (${s.email}, ${s.referralCode}, ${s.editTokenHash}, ${s.referredBy ?? null},
         ${s.utmSource ?? null}, ${s.utmMedium ?? null}, ${s.utmCampaign ?? null},
         ${s.landingPath ?? null}, ${s.referrer ?? null}, ${s.ipHash ?? null}, ${s.privacyVersion})
      ON CONFLICT (email) DO UPDATE SET
        edit_token_hash = CASE
          WHEN waitlist_signups.home_type IS NULL THEN EXCLUDED.edit_token_hash
          ELSE waitlist_signups.edit_token_hash
        END,
        updated_at = now()
      RETURNING referral_code, (xmax = 0) AS created, (home_type IS NULL) AS can_add_details
    `) as { referral_code: string; created: boolean; can_add_details: boolean }[];

    const row = rows[0];
    return { referralCode: row.referral_code, created: row.created, canAddDetails: row.can_add_details };
  }

  async saveDetails(editTokenHash: string, details: { homeType: HomeType; postcode: string }): Promise<boolean> {
    const rows = await this.sql`
      UPDATE waitlist_signups
      SET home_type = ${details.homeType}, postcode = ${details.postcode}, details_at = now(), updated_at = now()
      WHERE edit_token_hash = ${editTokenHash}
      RETURNING id
    `;
    return rows.length > 0;
  }
}
