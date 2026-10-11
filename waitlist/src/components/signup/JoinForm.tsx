"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Button, Spinner } from "@/components/ui/button";
import { joinWaitlist, type JoinState } from "@/lib/waitlist/actions";
import { emailSchema, HONEYPOT_FIELD } from "@/lib/waitlist/schema";
import { suggestEmail } from "@/lib/waitlist/suggest";

import { useAttribution, type Attribution } from "./attribution";
import { joinFromClient } from "./client-actions";
import { joinedCardId } from "./dom";
import { AlertIcon, CheckIcon } from "./icons";
import { ShareButton } from "./ShareButton";
import { useSignup } from "./signup-context";

/** How long the button says "You're in ✓" before the modal or the joined card. */
export const SUCCESS_BEAT_MS = 700;
/** Fast saves never flash a spinner. */
export const SPINNER_DELAY_MS = 350;

const INITIAL_STATE: JoinState = { status: "idle" };
const ATTRIBUTION_FIELDS: (keyof Attribution)[] = ["ref", "utm_source", "utm_medium", "utm_campaign", "landing_path", "referrer"];

/**
 * The same zod schema as the server decides what is valid. The wording is
 * more specific for the most common slips (brief §2.7).
 */
export function emailError(value: string): string | null {
  const result = emailSchema.safeParse(value);
  if (result.success) return null;
  const trimmed = value.trim();
  if (trimmed && !trimmed.includes("@")) return "Add an @ and the part after it, like sam@gmail.com.";
  if (trimmed.startsWith("@")) return "Add the part before the @, like sam@gmail.com.";
  if (trimmed.endsWith("@")) return "Add the part after the @, like sam@gmail.com.";
  return result.error.issues[0]?.message ?? "Check your email address.";
}

const noopSubscribe = () => () => {};
/** False on the server and during hydration, true after. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export type JoinFormProps = {
  /** "hero" adds the trust line and centres the text; "inline" shows the consent line only. */
  variant: "hero" | "inline";
  /** Optional id for the wrapper element. */
  id?: string;
  /** Id for the email input. The hero form uses "hero-email" so the header can focus it. */
  inputId?: string;
  className?: string;
};

/**
 * The one email form used everywhere on the page. All instances share the
 * joined state: after a sign-up in any of them, every one shows the joined card.
 * Works without JavaScript as a plain form post to the server action.
 */
export function JoinForm({ variant, id, inputId: inputIdProp, className = "" }: JoinFormProps) {
  const signup = useSignup();
  const { completeJoin, reset } = signup;
  const autoId = useId();
  const inputId = inputIdProp ?? `email${autoId}`;
  const errorId = `${inputId}-error`;
  const suggestionId = `${inputId}-suggestion`;

  // The server action stays on <form action> so the form still posts without JavaScript.
  // With JavaScript, onSubmit sends the same fields through joinFromClient, which turns a
  // dropped connection into a message instead of the page-wide error boundary.
  const [serverState, serverAction] = useActionState(joinWaitlist, INITIAL_STATE);
  const [clientState, clientAction, pending] = useActionState(joinFromClient, INITIAL_STATE);
  const state = clientState.status === "idle" ? serverState : clientState;
  const hydrated = useHydrated();
  const attribution = useAttribution();

  // Without JavaScript the server re-renders with an error state; keep what was typed.
  const [value, setValue] = useState(() => (state.status === "error" ? state.email : ""));
  const [clientError, setClientError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  // The server error stays until the visitor edits or submits again.
  const [dismissedState, setDismissedState] = useState<JoinState | null>(null);
  // A joined state already handed to the provider, so it never replays (for example after "Fix it").
  const [consumedState, setConsumedState] = useState<JoinState | null>(null);
  const [submitCount, setSubmitCount] = useState(0);
  const [slowSubmit, setSlowSubmit] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const refocusInput = useRef(false);

  const serverError = state.status === "error" && dismissedState !== state ? state.message : null;
  const error = clientError ?? serverError;
  // A plain form post (no JavaScript yet) comes back from the server already joined.
  const serverJoined = clientState.status === "idle" && serverState.status === "joined" && consumedState !== serverState;
  const showJoined = signup.status === "joined" || serverJoined;
  const justJoined = state.status === "joined" && consumedState !== state && !showJoined;
  const slow = pending && slowSubmit === submitCount;

  // Spinner only when the save is slow.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setSlowSubmit(submitCount), SPINNER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending, submitCount]);

  // Success beat: "You're in ✓" on the button, then share the result with every form.
  // A sign-up that arrived with the server render already shows its card, so it skips the beat.
  useEffect(() => {
    if (state.status !== "joined" || consumedState === state) return;
    const timer = window.setTimeout(
      () => {
        setConsumedState(state);
        completeJoin(
          { email: state.email, referralCode: state.referralCode, detailsToken: state.detailsToken },
          inputId,
        );
      },
      state === serverState ? 0 : SUCCESS_BEAT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state, serverState, consumedState, completeJoin, inputId]);

  // After "Fix it", the bar comes back: focus the input with the old address selected.
  useEffect(() => {
    if (signup.status !== "idle" || !refocusInput.current) return;
    refocusInput.current = false;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [signup.status]);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setValue(next);
    setSuggestion(null);
    // Never add an error while typing, but clear it as soon as the address is fixed.
    if (clientError && emailError(next) === null) setClientError(null);
    if (state.status === "error") setDismissedState(state);
  }

  function onBlur() {
    if (value.trim() === "") {
      setClientError(null);
      setSuggestion(null);
      return;
    }
    setClientError(emailError(value));
    setSuggestion(suggestEmail(value));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // JavaScript is running, so skip the plain form post and send through joinFromClient.
    event.preventDefault();
    // One request at a time. The button stays enabled so focus never jumps.
    if (pending) return;
    const form = event.currentTarget;
    const current = inputRef.current?.value ?? value;
    const problem = emailError(current);
    if (problem) {
      setClientError(problem);
      setSuggestion(suggestEmail(current));
      inputRef.current?.focus();
      return;
    }
    setClientError(null);
    setDismissedState(state);
    setSubmitCount((count) => count + 1);
    startTransition(() => clientAction(new FormData(form)));
  }

  function applySuggestion() {
    if (!suggestion) return;
    setValue(suggestion);
    setSuggestion(null);
    setClientError(null);
    if (state.status === "error") setDismissedState(state);
    inputRef.current?.focus();
  }

  function onFix() {
    // Keep the old address in the field so a typo is a quick fix.
    setValue(signup.status === "joined" ? signup.email : state.status === "joined" ? state.email : "");
    setClientError(null);
    setSuggestion(null);
    setDismissedState(state);
    refocusInput.current = true;
    reset();
  }

  const centred = variant === "hero";
  const describedBy = [error ? errorId : null, suggestion ? suggestionId : null].filter(Boolean).join(" ");

  return (
    <div
      id={id}
      data-join-form=""
      data-variant={variant}
      className={`w-full ${centred ? "mx-auto max-w-[36rem] text-center" : "max-w-[34rem] text-left"} ${className}`}
    >
      {showJoined ? (
        <JoinedCard
          id={joinedCardId(inputId)}
          email={signup.status === "joined" ? signup.email : state.status === "joined" ? state.email : ""}
          onFix={onFix}
        />
      ) : (
        <form action={serverAction} onSubmit={onSubmit} noValidate={hydrated} className="relative">
          <div
            className={
              // `glass` sets its own background, so the stronger white needs the important modifier.
              "glass flex flex-col gap-2 rounded-[30px] bg-white/80! p-2 " +
              "min-[480px]:h-16 min-[480px]:flex-row min-[480px]:items-center min-[480px]:rounded-full min-[480px]:pl-6 " +
              "focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-ink " +
              "has-[[aria-invalid=true]]:border-error/50"
            }
          >
            <label htmlFor={inputId} className="sr-only">
              Your email
            </label>
            <input
              ref={inputRef}
              id={inputId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              placeholder="you@example.com"
              required
              value={value}
              onChange={onChange}
              onBlur={onBlur}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
              className={
                "h-12 w-full min-w-0 rounded-full bg-transparent px-4 text-left text-[17px] text-ink outline-none " +
                "placeholder:text-slate autofill:shadow-[inset_0_0_0_100px_white] min-[480px]:h-full min-[480px]:flex-1 min-[480px]:px-0"
              }
            />
            <Button
              type="submit"
              size="md"
              className={
                // min-h (not h) so it doesn't fight the Button's own h-12: 52px stacked, 48px in the pill.
                "min-h-[52px] w-full min-[480px]:min-h-0 min-[480px]:w-auto min-[480px]:min-w-[12.75rem] " +
                "focus-visible:outline-2 focus-visible:-outline-offset-[5px] focus-visible:outline-white"
              }
            >
              {slow ? (
                <>
                  <Spinner />
                  Joining…
                </>
              ) : justJoined ? (
                "You're in ✓"
              ) : (
                "Join the waitlist"
              )}
            </Button>
          </div>

          {/* Bots fill every field; people never see this one. */}
          <div aria-hidden="true" className="absolute top-0 -left-[10000px] size-px overflow-hidden">
            <label>
              Leave this field empty
              <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>
          {ATTRIBUTION_FIELDS.map((name) => (
            <input key={name} type="hidden" name={name} value={attribution[name]} />
          ))}

          <span role="status" className="sr-only">
            {slow ? "Joining…" : justJoined ? "You're in." : ""}
          </span>

          <div>
            {error && (
              <p
                id={errorId}
                role="alert"
                className={`flex items-start gap-1.5 text-left text-[15px] leading-snug font-medium text-error ${centred ? "mt-2 justify-center" : "mt-2.5"}`}
              >
                <AlertIcon className="mt-px size-[18px] shrink-0" />
                <span>{error}</span>
              </p>
            )}
            <div aria-live="polite">
              {suggestion && (
                <p id={suggestionId} className="mt-2 text-[15px] leading-snug text-ink [overflow-wrap:anywhere]">
                  Did you mean{" "}
                  <button
                    type="button"
                    onClick={applySuggestion}
                    className="rounded-md font-semibold text-ink underline decoration-sun-cta decoration-2 underline-offset-4 hover:decoration-ink"
                  >
                    {suggestion}
                  </button>
                  ?
                </p>
              )}
            </div>

            {/* The short notice the Spam Act and APP 5 expect at the point of sign-up; the policy holds the rest. */}
            <p className="mt-3 text-[13px] leading-[1.5] text-slate">
              We&apos;ll only email you about the launch. Unsubscribe any time.{" "}
              <Link href="/privacy" className="text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
                Privacy Policy
              </Link>
            </p>
          </div>
        </form>
      )}
    </div>
  );
}

function JoinedCard({ id, email, onFix }: { id: string; email: string; onFix: () => void }) {
  return (
    <div id={id} tabIndex={-1} className="glass rounded-[28px] bg-white/80! p-4 text-left outline-none min-[480px]:p-5">
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-sun text-white shadow-[0_6px_16px_-6px_rgb(255_106_19/0.8)]"
        >
          <CheckIcon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[19px] leading-tight font-normal text-ink">You&apos;re on the list ✓</p>
          <p className="mt-1 text-[15px] leading-snug text-slate [overflow-wrap:anywhere]">
            We&apos;ll email <span className="font-semibold text-ink">{email}</span>.
          </p>
          <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2">
            {/* Opens upward by default: below the card is often the next section, which would cover it. */}
            <ShareButton placement="top" />
            <button
              type="button"
              onClick={onFix}
              className="min-h-11 rounded-md text-[15px] font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
            >
              Not you? Fix it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
