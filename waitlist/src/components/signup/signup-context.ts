"use client";

import { createContext, useContext } from "react";

import type { DetailsStatus, JoinResult, SignupSnapshot } from "./signup-store";

export type SignupContextValue = SignupSnapshot & {
  /** Called by a JoinForm after its success beat. Opens the details modal when there is a token. */
  completeJoin: (result: JoinResult, originId: string | null) => void;
  /** Closes the details modal as saved or skipped. */
  finishDetails: (outcome: Exclude<DetailsStatus, "pending">) => void;
  /** "Not you? Fix it": forget the sign-up on this device and show the forms again. */
  reset: () => void;
};

export const SignupContext = createContext<SignupContextValue | null>(null);

/** The shared sign-up state. Use inside <SignupProvider>. */
export function useSignup(): SignupContextValue {
  const value = useContext(SignupContext);
  if (!value) throw new Error("useSignup must be used inside <SignupProvider>.");
  return value;
}
