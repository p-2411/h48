/**
 * One shared sign-up state for the whole page, kept outside React so every
 * JoinForm, the modal and the sticky bar read the same snapshot, and updates
 * land in one render (no half-joined frames).
 */

export type DetailsStatus = "pending" | "saved" | "skipped";

export type SignupSnapshot = {
  status: "idle" | "joined";
  email: string;
  referralCode: string;
  /** One-time token for the details step. Kept in memory only, never persisted. */
  detailsToken: string | null;
  detailsStatus: DetailsStatus;
  modalOpen: boolean;
  /** The `inputId` of the JoinForm that started the flow, for returning focus. */
  originId: string | null;
};

export type JoinResult = { email: string; referralCode: string; detailsToken: string | null };

export const IDLE: SignupSnapshot = Object.freeze({
  status: "idle",
  email: "",
  referralCode: "",
  detailsToken: null,
  detailsStatus: "pending",
  modalOpen: false,
  originId: null,
});

export const STORAGE_KEY = "roofless.signup";

type Persisted = { joined: true; email: string; referralCode: string };

function readPersisted(): SignupSnapshot {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return IDLE;
    const data = JSON.parse(raw) as Partial<Persisted> | null;
    if (!data || data.joined !== true || typeof data.email !== "string" || data.email === "") return IDLE;
    return {
      ...IDLE,
      status: "joined",
      email: data.email,
      referralCode: typeof data.referralCode === "string" ? data.referralCode : "",
      // A restored visit has no token, so there is nothing left to ask.
      detailsStatus: "skipped",
    };
  } catch {
    return IDLE;
  }
}

function writePersisted(state: SignupSnapshot) {
  try {
    if (state.status === "joined") {
      const data: Persisted = { joined: true, email: state.email, referralCode: state.referralCode };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private mode or blocked storage: the state still works for this page view.
  }
}

export type SignupStore = ReturnType<typeof createSignupStore>;

export function createSignupStore() {
  let state: SignupSnapshot = typeof window === "undefined" ? IDLE : readPersisted();
  const listeners = new Set<() => void>();

  function set(next: SignupSnapshot) {
    if (next === state) return;
    const persistChanged =
      next.status !== state.status || next.email !== state.email || next.referralCode !== state.referralCode;
    state = next;
    if (persistChanged) writePersisted(next);
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => state,
    /** The server and the first client render always see idle, so hydration matches. */
    getServerSnapshot: () => IDLE,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    join(result: JoinResult, originId: string | null) {
      const hasToken = Boolean(result.detailsToken);
      set({
        status: "joined",
        email: result.email,
        referralCode: result.referralCode,
        detailsToken: result.detailsToken,
        detailsStatus: hasToken ? "pending" : "skipped",
        modalOpen: hasToken,
        originId,
      });
    },

    finishDetails(outcome: Exclude<DetailsStatus, "pending">) {
      // A save that lands after the visitor chose Skip (or closed the sheet) still counts as saved.
      const lateSave = outcome === "saved" && state.status === "joined" && state.detailsStatus === "skipped";
      if (!state.modalOpen && !lateSave) return;
      // The token stays until the next join so the closing sheet keeps its content.
      set({ ...state, modalOpen: false, detailsStatus: outcome });
    },

    reset() {
      set(IDLE);
    },
  };
}
