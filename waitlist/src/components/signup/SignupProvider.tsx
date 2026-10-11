"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { DetailsModal } from "./DetailsModal";
import { focusOrigin } from "./dom";
import { SignupContext, type SignupContextValue } from "./signup-context";
import { createSignupStore, type DetailsStatus, type JoinResult } from "./signup-store";

/**
 * Shares one sign-up state across every JoinForm, the sticky bar and the
 * details modal. Wrap the page once; it renders the modal itself.
 */
export function SignupProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createSignupStore);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  // Set when a join finishes; cleared once focus has gone back to where the flow started.
  const focusDue = useRef(false);

  const actions = useMemo(
    () => ({
      completeJoin(result: JoinResult, originId: string | null) {
        focusDue.current = true;
        store.join(result, originId);
      },
      finishDetails(outcome: Exclude<DetailsStatus, "pending">) {
        store.finishDetails(outcome);
      },
      reset() {
        focusDue.current = false;
        store.reset();
      },
    }),
    [store],
  );

  // After the success beat (no modal) or after the modal closes, put focus back
  // where the visitor started: the form's joined card replaces its input.
  useEffect(() => {
    if (!focusDue.current || snapshot.status !== "joined" || snapshot.modalOpen) return;
    focusDue.current = false;
    focusOrigin(snapshot.originId);
  }, [snapshot]);

  const value = useMemo<SignupContextValue>(() => ({ ...snapshot, ...actions }), [snapshot, actions]);

  return (
    <SignupContext.Provider value={value}>
      {children}
      <DetailsModal />
    </SignupContext.Provider>
  );
}
