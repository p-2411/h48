import type { ReactNode } from "react";

/**
 * Centred text card that keeps copy readable over any part of the scene: near-opaque white,
 * a 1px hairline, no shadow. Blur only from md up, because large blurred areas over a moving
 * scene are costly on phones, and the near-opaque white already gives AA contrast without it.
 */
export function Panel({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "article" }) {
  return (
    <Tag
      className={`reveal rounded-2xl border border-line bg-white/[0.92] p-6 sm:p-10 md:bg-white/[0.86] md:backdrop-blur-md lg:p-14 [@media(prefers-reduced-transparency:reduce)]:bg-white ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * Section heading. Optional `then` adds the quieter continuation in grey, the two-part cadence:
 * a firm statement, then a softer line that pays it off.
 */
export function SectionHeading({ children, then, id, className = "" }: { children: ReactNode; then?: ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={`text-[32px] leading-[1.08] tracking-[-0.02em] text-balance text-ink sm:text-[clamp(32px,3.4vw,46px)] ${className}`}>
      {children}
      {then && (
        <>
          {" "}
          <span className="text-dim">{then}</span>
        </>
      )}
    </h2>
  );
}
