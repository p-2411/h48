"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type SVGProps,
} from "react";

import { Button, Spinner } from "@/components/ui/button";
import type { DetailsState } from "@/lib/waitlist/actions";
import { HOME_TYPE_LABELS, HOME_TYPES, type HomeType } from "@/lib/waitlist/schema";

import { saveDetailsFromClient } from "./client-actions";
import styles from "./DetailsModal.module.css";
import { AlertIcon, CheckIcon, CloseIcon } from "./icons";
import { SPINNER_DELAY_MS } from "./JoinForm";
import { useSignup } from "./signup-context";

const INITIAL_STATE: DetailsState = { status: "idle" };
const POSTCODE = /^\d{4}$/;

type FieldError = { field: "homeType" | "postcode" | null; message: string };

/**
 * The optional second step: home type and postcode. Opens only after the
 * email is saved, and only when the server handed back a details token.
 * Native <dialog> + showModal() gives the focus trap and Esc; Esc, ✕ and the
 * backdrop all count as Skip.
 */
export function DetailsModal() {
  const { modalOpen, detailsToken, finishDetails } = useSignup();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  // Set when we close the dialog ourselves, so the close event doesn't count as Skip.
  const closingQuietly = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  // Next keeps visited pages mounted but hidden (<Activity>), and runs effect cleanups when
  // it hides them. A modal left open would stay in the top layer and make the next page
  // inert, so the cleanup closes it. The store keeps modalOpen, so it opens again on return.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !modalOpen) return;
    if (!dialog.open) {
      dialog.showModal();
      // Start on the question rather than the close button.
      const radio =
        dialog.querySelector<HTMLInputElement>('input[type="radio"]:checked') ??
        dialog.querySelector<HTMLInputElement>('input[type="radio"]');
      radio?.focus();
    }
    return () => {
      if (!dialog.open) return;
      closingQuietly.current = true;
      dialog.close();
    };
  }, [modalOpen]);

  // Lock page scroll while open. Keep the scrollbar's space so the page doesn't jump sideways.
  useEffect(() => {
    if (!modalOpen) return;
    const root = document.documentElement;
    const hadScrollbar = window.innerWidth > root.clientWidth;
    const previous = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
    root.style.overflow = "hidden";
    if (hadScrollbar) root.style.scrollbarGutter = "stable";
    return () => {
      root.style.overflow = previous.overflow;
      root.style.scrollbarGutter = previous.gutter;
    };
  }, [modalOpen]);

  const skip = () => finishDetails("skipped");

  // A press that starts and ends outside the dialog's box is a click on the backdrop.
  // (The target alone isn't enough: the dialog's own scrollbar also targets the dialog.)
  function onBackdrop(event: MouseEvent<HTMLDialogElement>): boolean {
    if (event.target !== event.currentTarget) return false;
    const box = event.currentTarget.getBoundingClientRect();
    const inside =
      event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    return !inside;
  }
  function onPointerDown(event: MouseEvent<HTMLDialogElement>) {
    pressedBackdrop.current = onBackdrop(event);
  }
  function onClick(event: MouseEvent<HTMLDialogElement>) {
    if (pressedBackdrop.current && onBackdrop(event)) skip();
    pressedBackdrop.current = false;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        skip();
      }}
      // Covers closes we didn't start (for example a second Esc the browser won't let us cancel).
      onClose={() => {
        if (closingQuietly.current) closingQuietly.current = false;
        else skip();
      }}
      onPointerDown={onPointerDown}
      onClick={onClick}
      // The custom cursor draws below the top layer, so the modal uses the system cursor.
      data-cursor="native"
      className={
        `${styles.dialog} fixed inset-x-0 top-auto bottom-0 m-0 max-h-[calc(100dvh-1rem)] w-full max-w-none overflow-y-auto overscroll-contain ` +
        "rounded-t-[28px] bg-white p-0 text-ink shadow-[0_-16px_48px_-16px_rgb(29_36_51/0.35)] " +
        "sm:inset-0 sm:m-auto sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-2rem)] sm:max-w-[480px] sm:rounded-[28px] " +
        "sm:shadow-[0_32px_80px_-24px_rgb(29_36_51/0.45)]"
      }
    >
      {detailsToken && (
        <DetailsForm
          key={detailsToken}
          token={detailsToken}
          titleId={titleId}
          descriptionId={descriptionId}
          onFinish={finishDetails}
        />
      )}
    </dialog>
  );
}

function DetailsForm({
  token,
  titleId,
  descriptionId,
  onFinish,
}: {
  token: string;
  titleId: string;
  descriptionId: string;
  /** Stable: the provider's finishDetails. */
  onFinish: (outcome: "saved" | "skipped") => void;
}) {
  const [state, formAction, pending] = useActionState(saveDetailsFromClient, INITIAL_STATE);
  const [homeType, setHomeType] = useState<HomeType | "">("");
  const [postcode, setPostcode] = useState("");
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [dismissedState, setDismissedState] = useState<DetailsState | null>(null);
  const [submitCount, setSubmitCount] = useState(0);
  const [slowSubmit, setSlowSubmit] = useState(-1);

  const postcodeRef = useRef<HTMLInputElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const arrowKeyDown = useRef(false);

  const ids = useId();
  const postcodeId = `${ids}-postcode`;
  const helpId = `${ids}-help`;
  const errorId = `${ids}-error`;

  const serverError = state.status === "error" && dismissedState !== state ? state.message : null;
  const error = fieldError?.message ?? serverError;
  const slow = pending && slowSubmit === submitCount;

  const onSkip = () => onFinish("skipped");

  useEffect(() => {
    if (state.status === "saved") onFinish("saved");
  }, [state, onFinish]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setSlowSubmit(submitCount), SPINNER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending, submitCount]);

  function clearErrors(field: FieldError["field"]) {
    if (fieldError && (fieldError.field === field || fieldError.field === null)) setFieldError(null);
    if (state.status === "error") setDismissedState(state);
  }

  function pickHomeType(type: HomeType) {
    setHomeType(type);
    clearErrors("homeType");
  }

  // A tap, click or Space on a card moves on to the postcode. Arrow keys only move between cards.
  function onCardClick() {
    if (arrowKeyDown.current) return;
    postcodeRef.current?.focus();
  }
  function onCardKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    arrowKeyDown.current = event.key.startsWith("Arrow");
  }

  // The modal needs JavaScript anyway, so the action is dispatched by hand. That also skips
  // React's automatic form reset, which would clear the chosen card after a server error.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const code = postcode.trim();
    if (!homeType && !code) {
      // Nothing to save: same as Skip.
      onSkip();
      return;
    }
    let problem: FieldError | null = null;
    if (!homeType) problem = { field: "homeType", message: "Choose your home type too, or choose Skip." };
    else if (!code) problem = { field: "postcode", message: "Add your postcode too, or choose Skip." };
    else if (!POSTCODE.test(code)) problem = { field: "postcode", message: "Enter your 4-digit postcode." };

    if (problem) {
      setFieldError(problem);
      if (problem.field === "homeType") firstRadioRef.current?.focus();
      else postcodeRef.current?.focus();
      return;
    }
    setFieldError(null);
    setDismissedState(state);
    setSubmitCount((count) => count + 1);
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <div className="relative px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] min-[360px]:px-6 sm:px-8 sm:pt-8 sm:pb-8">
      <span aria-hidden="true" className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-ink/15 sm:hidden" />

      <button
        type="button"
        onClick={onSkip}
        aria-label="Close"
        className="absolute top-3 right-3 grid size-11 cursor-pointer place-items-center rounded-full text-ink transition-colors duration-150 hover:bg-blush sm:top-4 sm:right-4"
      >
        <CloseIcon className="size-5" />
      </button>

      <h2 id={titleId} className="pr-12 text-[22px] leading-[1.15] font-normal tracking-[-0.02em] min-[400px]:text-[24px] sm:text-[28px]">
        You&apos;re on the list ✓
      </h2>
      <p id={descriptionId} className="mt-1.5 text-[16px] leading-snug text-slate sm:mt-2">
        2 quick questions to help us plan farms near you. Both optional.
      </p>

      <Progress />

      <form onSubmit={onSubmit} noValidate className="mt-5 sm:mt-6">
        <input type="hidden" name="token" value={token} />

        <fieldset>
          <legend className="text-[15px] font-semibold text-ink">
            Your home <span className="font-normal text-slate">(optional)</span>
          </legend>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {HOME_TYPES.map((type, index) => (
              <label
                key={type}
                className={
                  "relative flex min-h-[76px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-ink/20 bg-white px-1 py-3 " +
                  "text-center text-[14px] leading-tight font-semibold text-ink select-none min-[360px]:text-[15px] min-[400px]:text-[16px] " +
                  "transition-[border-color,background-color,transform] duration-150 hover:border-ink/40 active:scale-[0.98] motion-reduce:active:scale-100 " +
                  "has-checked:border-sun-cta has-checked:bg-blush " +
                  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
                }
              >
                <input
                  ref={index === 0 ? firstRadioRef : undefined}
                  type="radio"
                  name="homeType"
                  value={type}
                  checked={homeType === type}
                  onChange={() => pickHomeType(type)}
                  onClick={onCardClick}
                  onKeyDown={onCardKeyDown}
                  onKeyUp={() => (arrowKeyDown.current = false)}
                  aria-invalid={fieldError?.field === "homeType" ? true : undefined}
                  aria-describedby={fieldError?.field === "homeType" ? errorId : undefined}
                  className="peer sr-only"
                />
                <HomeTypeIcon type={type} className="size-6 text-slate peer-checked:text-sun-cta" />
                {HOME_TYPE_LABELS[type]}
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 hidden size-5 place-items-center rounded-full bg-sun-cta text-white peer-checked:grid"
                >
                  <CheckIcon className="size-3" />
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 sm:mt-5">
          <label htmlFor={postcodeId} className="block text-[15px] font-semibold text-ink">
            Postcode <span className="font-normal text-slate">(optional)</span>
          </label>
          <input
            ref={postcodeRef}
            id={postcodeId}
            name="postcode"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            pattern="[0-9]{4}"
            maxLength={4}
            enterKeyHint="done"
            value={postcode}
            onChange={(event) => {
              setPostcode(event.target.value);
              clearErrors("postcode");
            }}
            aria-invalid={fieldError?.field === "postcode" ? true : undefined}
            aria-describedby={fieldError?.field === "postcode" ? `${helpId} ${errorId}` : helpId}
            className={
              "mt-2 h-13 w-full max-w-[10rem] rounded-2xl border-2 border-ink/20 bg-white px-4 text-[18px] tracking-[0.18em] text-ink tabular-nums " +
              "transition-colors duration-150 hover:border-ink/40 focus-visible:border-ink aria-[invalid=true]:border-error"
            }
          />
          <p id={helpId} className="mt-2 text-[14px] leading-snug text-slate">
            So we can tell you when a farm opens near you, and see where demand is.
          </p>
        </div>

        <p className="mt-4 text-[13px] leading-normal text-slate sm:mt-5">
          We use your home type and postcode only for research and launch planning.{" "}
          <Link
            href="/privacy"
            className="rounded-sm font-semibold text-ink underline decoration-ink/40 underline-offset-2 hover:decoration-ink"
          >
            Privacy Policy
          </Link>
        </p>

        {error && (
          <p id={errorId} role="alert" className="mt-4 flex items-start gap-1.5 text-[15px] leading-snug font-medium text-error">
            <AlertIcon className="mt-px size-[18px] shrink-0" />
            <span>{error}</span>
          </p>
        )}
        <span role="status" className="sr-only">
          {slow ? "Saving…" : ""}
        </span>

        <div className="mt-5 flex items-center gap-3 sm:mt-6 sm:gap-5">
          <Button type="submit" className="flex-1 cursor-pointer sm:min-w-[9rem] sm:flex-none">
            {slow ? (
              <>
                <Spinner />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
          <button
            type="button"
            onClick={onSkip}
            className="min-h-12 cursor-pointer rounded-full px-4 text-[17px] font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
          >
            Skip
          </button>
        </div>
      </form>
    </div>
  );
}

/** Email ✓ → Your home → Done, with step 1 done and step 2 current. */
function Progress() {
  return (
    <ol aria-label="Progress" className="mt-4 flex w-full sm:mt-5 items-center gap-1.5 text-[13px] leading-none">
      <li className="flex shrink-0 items-center gap-1.5 font-medium text-ink">
        <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-sun-cta text-white">
          <CheckIcon className="size-3" />
        </span>
        Email
        <span className="sr-only">, done</span>
      </li>
      <li aria-hidden="true" className="h-0.5 min-w-3 flex-1 rounded-full bg-sun-cta" />
      <li aria-current="step" className="flex shrink-0 items-center gap-1.5 font-semibold text-ink">
        <span aria-hidden="true" className="grid size-5 place-items-center rounded-full border-2 border-sun-cta bg-white">
          <span className="size-2 rounded-full bg-sun-cta" />
        </span>
        Your home
      </li>
      <li aria-hidden="true" className="h-0.5 min-w-3 flex-1 rounded-full bg-ink/15" />
      <li className="flex shrink-0 items-center gap-1.5 text-slate">
        <span aria-hidden="true" className="size-5 rounded-full border-2 border-ink/20" />
        Done
      </li>
    </ol>
  );
}

function HomeTypeIcon({ type, ...props }: { type: HomeType } & SVGProps<SVGSVGElement>) {
  const common = {
    "aria-hidden": true,
    focusable: false,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
  if (type === "rent") {
    // A key
    return (
      <svg {...common}>
        <circle cx="8" cy="15" r="4" />
        <path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" />
      </svg>
    );
  }
  if (type === "own") {
    // A house
    return (
      <svg {...common}>
        <path d="M3.5 11L12 4l8.5 7" />
        <path d="M6 9.5V20h12V9.5" />
        <path d="M10 20v-5h4v5" />
      </svg>
    );
  }
  // An apartment block
  return (
    <svg {...common}>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h1.5M13.5 7H15M9 11h1.5M13.5 11H15M9 15h1.5M13.5 15H15M10.5 21v-2.5h3V21" />
    </svg>
  );
}
