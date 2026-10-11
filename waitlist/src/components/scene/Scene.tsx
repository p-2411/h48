"use client";

import {
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useSyncExternalStore, type CSSProperties } from "react";

import {
  DESKTOP_QUERY,
  LANDSCAPE_VEIL,
  SCENE_LAYERS,
  SCENE_VIEWBOX,
  SCRIM_FADE,
  SCRIM_GRADIENT,
  SKY_FADES,
  SKY_GRADIENTS,
  SUN_DUSK_SRC,
  SUN_MOTION,
  SUN_SRC,
  TRAVEL_INPUT,
  layerKeyframes,
  sceneCss,
  sunKeyframes,
  type Fade,
  type SceneLayer,
  type SceneOverlay,
} from "./sceneConfig";

/**
 * The scene's CSS (breakpoints, portrait sun crop, reduced-motion fallback).
 * It is an inline <style> rather than a CSS module because the project pipes
 * every *.css file through the Tailwind loader, and this keeps the scene
 * self-contained. Built from sceneConfig, so the numbers live in one place.
 */
export const SCENE_CSS = sceneCss();

/** 1x1 transparent GIF: phones load this instead of the desktop-only layers. */
const BLANK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/* ------------------------------------------------------------------ */
/* Client-only state that must not differ during hydration             */
/* ------------------------------------------------------------------ */

const noopSubscribe = () => () => {};

/** False on the server and during hydration, true after. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** Every layer image is bottom-anchored to the scene. On narrow portrait screens it is
 *  capped at 125vw tall, so phones show a wider slice of the landscape, low on screen. */
const ART_CLASS =
  "pointer-events-none absolute bottom-0 left-0 h-[min(100lvh,125vw)] w-full max-w-none select-none object-cover object-bottom";

function Art({ src, desktopOnly = false }: { src: string; desktopOnly?: boolean }) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- decorative SVG layer: next/image serves SVG unoptimised anyway, and the scene needs exact absolute sizing with no wrapper.
    <img
      src={desktopOnly ? BLANK_IMAGE : src}
      alt=""
      width={SCENE_VIEWBOX.width}
      height={SCENE_VIEWBOX.height}
      loading="eager"
      decoding="async"
      draggable={false}
      className={ART_CLASS}
    />
  );
  if (!desktopOnly) return img;
  // Phones hide this layer, so they skip the download too.
  return (
    <picture>
      <source media={DESKTOP_QUERY} srcSet={src} />
      {img}
    </picture>
  );
}

const FILL = "absolute inset-0";
/** A moving layer is a bottom-anchored travel box (height set in SCENE_CSS); its art overflows upward. */
const TRAVEL_BOX = "absolute inset-x-0 bottom-0 will-change-transform";

/** Optional attribute: present (empty string) or absent. */
const flag = (on: boolean) => (on ? "" : undefined);

function useFade(progress: MotionValue<number>, fade: Fade) {
  return useTransform(progress, fade.input, fade.output);
}

function FadingArt({ overlay, desktopOnly, progress }: { overlay: SceneOverlay; desktopOnly: boolean; progress: MotionValue<number> }) {
  const opacity = useFade(progress, overlay.fade);
  return (
    <m.div data-overlay={overlay.id} data-late="" className={FILL} style={{ opacity }}>
      <Art src={overlay.src} desktopOnly={desktopOnly} />
    </m.div>
  );
}

function ParallaxLayer({ layer, progress }: { layer: SceneLayer; progress: MotionValue<number> }) {
  const transform = useTransform(progress, TRAVEL_INPUT, layerKeyframes(layer.depth));
  const desktopOnly = !layer.onMobile;
  return (
    <m.div
      data-parallax={layer.id}
      data-travel=""
      data-desktop-only={flag(desktopOnly)}
      className={TRAVEL_BOX}
      style={{ transform }}
    >
      <div data-rest="" className={FILL} style={{ "--depth": layer.depth } as CSSProperties}>
        <Art src={layer.src} desktopOnly={desktopOnly} />
        {layer.overlays?.map((overlay) => (
          <FadingArt key={overlay.id} overlay={overlay} desktopOnly={desktopOnly} progress={progress} />
        ))}
      </div>
    </m.div>
  );
}

function Sun({ progress }: { progress: MotionValue<number> }) {
  const transform = useTransform(progress, SUN_MOTION.input, sunKeyframes());
  const duskOpacity = useFade(progress, SUN_MOTION.dusk);
  return (
    <m.div data-parallax="sun" data-scene-sun="" className={`${FILL} will-change-transform`} style={{ transform }}>
      <Art src={SUN_SRC} />
      <m.div data-late="" className={FILL} style={{ opacity: duskOpacity }}>
        <Art src={SUN_DUSK_SRC} />
      </m.div>
    </m.div>
  );
}

function Skies({ progress }: { progress: MotionValue<number> }) {
  const day = useFade(progress, SKY_FADES.day);
  const golden = useFade(progress, SKY_FADES.golden);
  return (
    <>
      <div data-sky="dawn" className={FILL} style={{ background: SKY_GRADIENTS.dawn }} />
      <m.div data-sky="day" className={FILL} style={{ background: SKY_GRADIENTS.day, opacity: day }} />
      <m.div data-sky="golden" data-late="" className={FILL} style={{ background: SKY_GRADIENTS.golden, opacity: golden }} />
    </>
  );
}

/** White scrim behind text sections; opacity only, so it also runs under reduced motion. */
function Scrim({ progress }: { progress: MotionValue<number> }) {
  const opacity = useFade(progress, SCRIM_FADE);
  return <m.div data-scene-scrim="" className={FILL} style={{ background: SCRIM_GRADIENT, opacity }} />;
}

/** Page-level scroll drives everything. No offsets, so Motion can hand it to a native ScrollTimeline. */
function ParallaxScene() {
  const { scrollYProgress } = useScroll();
  return (
    <>
      <Skies progress={scrollYProgress} />
      <Sun progress={scrollYProgress} />
      {SCENE_LAYERS.map((layer) => (
        <ParallaxLayer key={layer.id} layer={layer} progress={scrollYProgress} />
      ))}
      <div data-scene-veil="" className={FILL} style={{ background: LANDSCAPE_VEIL }} />
      <Scrim progress={scrollYProgress} />
    </>
  );
}

function StaticScrim() {
  const { scrollYProgress } = useScroll();
  return <Scrim progress={scrollYProgress} />;
}

/**
 * Reduced motion: a still midday scene with no transforms bound to scroll.
 * Day sky, layers at rest, no late-day overlays. SCENE_CSS puts the sun at its
 * midday height on wide screens; on phones it stays low, clear of the hero text.
 */
function StaticScene() {
  return (
    <>
      <div data-sky="day" className={FILL} style={{ background: SKY_GRADIENTS.day }} />
      <div data-scene-sun="" className={FILL}>
        <Art src={SUN_SRC} />
      </div>
      {SCENE_LAYERS.map((layer) => (
        <div
          key={layer.id}
          data-scene-layer={layer.id}
          data-desktop-only={flag(!layer.onMobile)}
          data-rest=""
          className={FILL}
          style={{ "--depth": layer.depth } as CSSProperties}
        >
          <Art src={layer.src} desktopOnly={!layer.onMobile} />
        </div>
      ))}
      <div data-scene-veil="" className={FILL} style={{ background: LANDSCAPE_VEIL }} />
      <StaticScrim />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

/**
 * The parallax landscape behind the whole page (spec "Scene", brief §3).
 *
 * Render once in page.tsx, before the content; content sits above it with
 * `relative z-10`. Fixed, full large-viewport height, aria-hidden, no pointer
 * events. Scroll progress moves the layers down at depth-scaled speeds (the
 * camera rises and the farm appears behind the city), raises and sets the sun,
 * crossfades dawn/day/golden skies, warms the far ridge and lights the city
 * near the end, and raises a white scrim behind text sections.
 *
 * Phones (< 720px) drop the far ridge and foreground and halve the travel.
 * That is all CSS, so the server HTML fits every screen. Reduced motion shows a
 * still midday scene: CSS gives it from the first paint, and after hydration
 * useReducedMotion() swaps in a tree with no scroll-bound transforms.
 */
export default function Scene() {
  const hydrated = useHydrated();
  const prefersReducedMotion = useReducedMotion();
  const reduced = hydrated && prefersReducedMotion === true;

  return (
    <div
      aria-hidden="true"
      data-scene={reduced ? "static" : "parallax"}
      className="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh select-none overflow-hidden [contain:strict]"
    >
      <style>{SCENE_CSS}</style>
      <LazyMotion features={domAnimation} strict>
        {reduced ? <StaticScene /> : <ParallaxScene />}
      </LazyMotion>
    </div>
  );
}
