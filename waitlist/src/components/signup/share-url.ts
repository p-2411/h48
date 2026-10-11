import { site } from "@/config/site";

/**
 * The page link with the visitor's referral code. No email or other personal data goes in it.
 * Kept out of the "use client" ShareButton module so server code can call it too.
 */
export function shareUrl(referralCode: string): string {
  const base = site.url.replace(/\/+$/, "");
  return referralCode ? `${base}/?ref=${encodeURIComponent(referralCode)}` : `${base}/`;
}
