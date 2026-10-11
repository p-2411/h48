"use client";

import Link from "next/link";
import type { ComponentProps, PointerEvent, ReactNode } from "react";

type Variant = "primary" | "ink" | "quiet";
type Size = "md" | "lg";

/**
 * Buttons fill with a circle that grows from where the pointer enters and shrinks toward where it
 * leaves (after the Sirus landing page). The label sits above the fill. Pressing scales to 97%.
 */
const base =
  "group/btn relative isolate inline-flex shrink-0 select-none items-center justify-center gap-2 overflow-hidden rounded-full whitespace-nowrap " +
  "transition-transform duration-200 ease-[var(--ease-out-expo)] active:scale-[0.97] " +
  "disabled:pointer-events-none disabled:opacity-70 aria-disabled:pointer-events-none aria-disabled:opacity-70 " +
  "motion-reduce:transition-none motion-reduce:active:scale-100";

// Primary: white 19px bold on #FF6010 is 3:1, which WCAG accepts for large bold text. The hover fill is ink.
// Ink: white 15px on near-black; its hover fill is the deep orange, still 5.2:1 under white 15px text.
const variants: Record<Variant, { box: string; fill: string }> = {
  primary: { box: "bg-sun-cta text-white text-[19px] font-bold tracking-[-0.01em]", fill: "bg-ink" },
  ink: { box: "bg-ink text-white text-[15px] font-medium", fill: "bg-sun-deep" },
  // Quiet: a hairline pill for secondary actions; it only darkens its edge on hover.
  quiet: { box: "border border-line bg-white text-ink text-[15px] font-medium transition-colors hover:border-ink/40", fill: "" },
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5",
  lg: "h-14 px-8",
};

export function buttonClasses({ variant = "primary", size = "lg", className = "" }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return `${base} ${variants[variant].box} ${sizes[size]} ${className}`;
}

/** Puts the fill's origin where the pointer crossed the edge, sized to reach the farthest corner. */
function setFillOrigin(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return;
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const radius = Math.max(Math.hypot(x, y), Math.hypot(rect.width - x, y), Math.hypot(x, rect.height - y), Math.hypot(rect.width - x, rect.height - y));
  el.style.setProperty("--mx", `${x}px`);
  el.style.setProperty("--my", `${y}px`);
  el.style.setProperty("--fill-d", `${Math.ceil(radius * 2)}px`);
}

function Fill({ variant }: { variant: Variant }) {
  if (!variants[variant].fill) return null;
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute left-[var(--mx,50%)] top-[var(--my,50%)] -z-10 aspect-square w-[var(--fill-d,220%)] -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full transition-transform duration-300 ease-[var(--ease-out-expo)] [@media(hover:hover)]:group-hover/btn:scale-100 motion-reduce:transition-none ${variants[variant].fill}`}
    />
  );
}

type CommonProps = { variant?: Variant; size?: Size; className?: string; children: ReactNode };

export function Button({ variant = "primary", size = "lg", className, children, onPointerEnter, onPointerLeave, ...props }: CommonProps & ComponentProps<"button">) {
  return (
    <button
      className={buttonClasses({ variant, size, className })}
      onPointerEnter={(e) => {
        setFillOrigin(e);
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        setFillOrigin(e);
        onPointerLeave?.(e);
      }}
      {...props}
    >
      <Fill variant={variant} />
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "lg", className, children, onPointerEnter, onPointerLeave, ...props }: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link
      className={buttonClasses({ variant, size, className })}
      onPointerEnter={(e) => {
        setFillOrigin(e);
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        setFillOrigin(e);
        onPointerLeave?.(e);
      }}
      {...props}
    >
      <Fill variant={variant} />
      {children}
    </Link>
  );
}

/** Plain anchor with the same look, for in-page links (#join) that must work before hydration. */
export function ButtonAnchor({ variant = "primary", size = "lg", className, children, onPointerEnter, onPointerLeave, ...props }: CommonProps & ComponentProps<"a">) {
  return (
    <a
      className={buttonClasses({ variant, size, className })}
      onPointerEnter={(e) => {
        setFillOrigin(e);
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        setFillOrigin(e);
        onPointerLeave?.(e);
      }}
      {...props}
    >
      <Fill variant={variant} />
      {children}
    </a>
  );
}

/** Inline spinner for pending buttons. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`size-5 animate-spin motion-reduce:animate-none ${className}`} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
