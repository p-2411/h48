"use client";

import { useEffect, useRef } from "react";

import { attachCursor } from "./cursorController";
import {
  CURSOR_CLASS,
  CURSOR_CSS,
  SHAPE,
  SHAPE_CLASS,
  SHAPE_FILL,
} from "./cursorStyles";
import { useCustomCursorSupport } from "./useCustomCursorSupport";

export type { CursorState } from "./cursorController";

/**
 * Brand cursor: an orange, tilted triangle whose tip is the hotspot.
 *
 * Mount once, for example in the root layout. It renders nothing on the
 * server, on touch or coarse pointers, in forced-colours mode and when
 * `prefers-reduced-motion: reduce` matches. The native cursor is hidden (via
 * `html.has-custom-cursor`) only after the first pointermove has positioned
 * the custom one.
 */
export default function CustomCursor() {
  const enabled = useCustomCursorSupport();
  if (!enabled) return null;
  return <CursorLayer />;
}

function CursorLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return attachCursor(element);
  }, []);

  return (
    <>
      <style>{CURSOR_CSS}</style>
      <div
        ref={ref}
        className={CURSOR_CLASS}
        data-state="hidden"
        aria-hidden="true"
      >
        <svg
          className={SHAPE_CLASS}
          width={SHAPE.width}
          height={SHAPE.height}
          viewBox={`${-SHAPE.tipX} ${-SHAPE.tipY} ${SHAPE.width} ${SHAPE.height}`}
          focusable="false"
          shapeRendering="geometricPrecision"
        >
          <path
            d={SHAPE.path}
            fill={SHAPE_FILL}
            stroke="#FFFFFF"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </>
  );
}
