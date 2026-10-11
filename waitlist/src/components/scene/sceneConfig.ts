/**
 * Numbers for the parallax scene. Pure data and helpers (no React), so the
 * component, its tests and the art-preview script all read the same values.
 *
 * Progress values are page scroll progress, 0 (top) to 1 (bottom).
 * Measured on the real page (1440x900 / 390x844), section centres sit at:
 * hero 0, the gap ~0.12, "How it works" ~0.24, built for you ~0.37,
 * vision ~0.5, team ~0.61, FAQ ~0.75, final CTA ~0.89-0.95. The footer starts
 * to cover the bottom of the scene from ~0.88 (phones) or ~0.92 (desktop).
 */

export type SceneLayerId = "ridge" | "hills" | "farm" | "city" | "foreground";

export interface Fade {
  input: number[];
  output: number[];
}

/** An image that sits inside a moving layer and only fades (opacity). */
export interface SceneOverlay {
  id: string;
  src: string;
  fade: Fade;
}

export interface SceneLayer {
  id: SceneLayerId;
  src: string;
  /** Share of the maximum travel. Nearer layers move down more (camera rising). */
  depth: number;
  /** Rendered below 720px. The far ridge and foreground are dropped on phones. */
  onMobile: boolean;
  overlays?: readonly SceneOverlay[];
}

/** Phones: below this width the scene drops two layers and halves its travel. */
export const MOBILE_QUERY = "(max-width: 719.98px)";
/** The same breakpoint from the other side. */
export const DESKTOP_QUERY = "(min-width: 720px)";

/** Every SVG layer shares this viewBox (xMidYMax slice). */
export const SCENE_VIEWBOX = { width: 1600, height: 1000 } as const;

/**
 * Total downward travel of the nearest layer, in vh. Each moving layer is a
 * "travel box" this tall (set in CSS per breakpoint) and its transform is a
 * percentage of that box, so phones get half the travel with the same
 * keyframes, the same server HTML and no JavaScript breakpoint check.
 */
export const MAX_TRAVEL_VH = { desktop: 30, mobile: 15 } as const;

/**
 * Rest offset, in vh at depth 1. Every layer sits this far down (scaled by its depth) before any
 * scroll, in the moving and the static scene alike. It keeps the first screen mostly sky, so the
 * hero headline and email bar have room, and lets a sliver of farm show behind the city from the start.
 * Applied with the CSS `translate` property, so it composes with the scroll-bound `transform`.
 */
export const REST_VH = { desktop: 22, mobile: 4 } as const;

/**
 * Scroll progress -> share of travel. Front-loaded, so the camera has risen
 * enough to show the farm behind the city by "How it works" (~25-35%). Near the
 * end the camera settles a little, so the city and its window lights are back
 * in frame for the golden-hour call to action.
 */
export const TRAVEL_INPUT = [0, 0.4, 0.8, 1];
export const TRAVEL_OUTPUT = [0, 0.85, 1, 0.62];

/** Sky crossfades (opacity only). Dawn is the always-on base layer. */
export const SKY_FADES = {
  day: { input: [0.06, 0.28], output: [0, 1] },
  golden: { input: [0.66, 0.92], output: [0, 1] },
} satisfies Record<string, Fade>;

/** City window lights fade in for the final call to action. */
export const LIGHTS_FADE: Fade = { input: [0.8, 0.93], output: [0, 1] };

export const SUN_SRC = "/scene/sun.svg";
export const SUN_DUSK_SRC = "/scene/sun-dusk.svg";
export const LIGHTS_SRC = "/scene/lights.svg";
export const RIDGE_DUSK_SRC = "/scene/ridge-dusk.svg";

/**
 * Back to front. Depth speeds follow the spec: ridge 12, hills 22, farm 38, city 60. The navy
 * foreground gums (foreground.svg, depth 100) are left out: the scene is a quiet backdrop, and they
 * were its loudest element.
 */
export const SCENE_LAYERS: readonly SceneLayer[] = [
  {
    id: "ridge",
    src: "/scene/ridge.svg",
    depth: 0.12,
    onMobile: false,
    // At golden hour the pale ridge would read as a white band against the orange sky.
    overlays: [{ id: "ridge-dusk", src: RIDGE_DUSK_SRC, fade: SKY_FADES.golden }],
  },
  { id: "hills", src: "/scene/hills.svg", depth: 0.22, onMobile: true },
  { id: "farm", src: "/scene/farm.svg", depth: 0.38, onMobile: true },
  {
    id: "city",
    src: "/scene/city.svg",
    depth: 0.6,
    onMobile: true,
    overlays: [{ id: "lights", src: LIGHTS_SRC, fade: LIGHTS_FADE }],
  },
];

/**
 * The sun rises from near the horizon (dawn) to high (midday), then lowers
 * again for golden hour. It moves vertically only: a sideways move would drag
 * the edge of its image box into view. On portrait screens CSS crops its image
 * further right, and on phones it starts lower, peeking over the hills, so it
 * stays clear of the hero text (see sceneCss()).
 */
export const SUN_MOTION = {
  input: [0, 0.5, 1],
  yVh: [0, -44, 1.5],
  /** Crossfade to the bigger, deeper golden-hour disc. */
  dusk: { input: [0.66, 0.92], output: [0, 1] },
  /** Index into yVh used for the static (reduced-motion) midday sun on wide screens. */
  middayIndex: 1,
};

/** On phones the sun image sits this share of its box lower, so at dawn it only peeks over the hills. */
export const MOBILE_SUN_DROP = 0.085;

/** White scrim behind text sections. The hero stays clear. */
export const SCRIM_FADE: Fade = { input: [0, 0.05, 0.16, 0.86, 1], output: [0, 0, 0.62, 0.62, 0.42] };

/** Constant white veil over the lower landscape, so the art stays a soft backdrop behind the content. */
export const LANDSCAPE_VEIL =
  "linear-gradient(180deg, rgb(255 255 255 / 0) 35%, rgb(255 255 255 / 0.28) 70%, rgb(255 255 255 / 0.42) 100%)";

export const SKY_GRADIENTS = {
  /** Pale peach -> pink-cream -> white. */
  dawn: "linear-gradient(180deg, #FFE5D3 0%, #FFEFE5 38%, #FFF7F2 66%, #FFFFFF 100%)",
  /** White -> very pale warm blue-white. */
  day: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 42%, #F2F4F6 76%, #EDF1F4 100%)",
  /** Deep orange -> peach -> cream. */
  golden: "linear-gradient(180deg, #FF8A3D 0%, #FFAD72 28%, #FFD3B8 58%, #FFF1E6 100%)",
} as const;

export const SCRIM_GRADIENT =
  "linear-gradient(180deg, rgb(255 255 255 / 0.92) 0%, rgb(255 255 255 / 0.78) 42%, rgb(255 255 255 / 0.34) 70%, rgb(255 255 255 / 0) 88%)";

function num(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Viewport-based translate, used by the sun. One template, so Motion and WAAPI can interpolate it. */
export function translate(xVw: number, yVh: number): string {
  return `translate3d(${num(xVw)}vw,${num(yVh)}vh,0)`;
}

/** Translate in percent of the element's own box (the layer's travel box). */
export function translatePercent(yPercent: number): string {
  return `translate3d(0%,${num(yPercent)}%,0)`;
}

/** Transform keyframes for a parallax layer, matching TRAVEL_INPUT. 100% = one full travel box. */
export function layerKeyframes(depth: number): string[] {
  return TRAVEL_OUTPUT.map((share) => translatePercent(share * depth * 100));
}

/** Layer offset in vh at a given travel share, for previews and tests. */
export function layerOffsetVh(depth: number, share: number, mode: keyof typeof MAX_TRAVEL_VH): number {
  return share * depth * MAX_TRAVEL_VH[mode];
}

/** Transform keyframes for the sun, matching SUN_MOTION.input. */
export function sunKeyframes(): string[] {
  return SUN_MOTION.yVh.map((y) => translate(0, y));
}

/**
 * CSS the scene needs beyond utilities. Breakpoints and reduced motion live in
 * CSS, not JavaScript, so the server HTML is already right for every screen and
 * nothing re-renders after hydration.
 *
 * 1. Travel boxes: 30vh tall on wide screens, 15vh on phones.
 * 2. Phones hide the far ridge and the foreground.
 * 3. Portrait screens crop the sun image further right; phones also drop it
 *    lower, so at dawn it peeks over the hills below the hero text.
 * 4. Reduced motion (brief §3.7), which also covers the moments before
 *    hydration and a setting changed while the page is open: author
 *    `!important` beats inline styles and the scroll-linked WAAPI animations
 *    Motion creates. Layers rest, the midday sky shows, late-day overlays hide,
 *    and on wide screens the sun sits at its midday height.
 */
export function sceneCss(): string {
  const scope = "[data-scene]";
  const midday = translate(0, SUN_MOTION.yVh[SUN_MOTION.middayIndex]);
  return [
    `${scope} [data-rest]{translate:0 calc(var(--depth) * ${REST_VH.mobile}vh)}`,
    `@media ${DESKTOP_QUERY}{${scope} [data-rest]{translate:0 calc(var(--depth) * ${REST_VH.desktop}vh)}}`,
    `${scope} [data-travel]{height:${MAX_TRAVEL_VH.mobile}vh}`,
    `@media ${DESKTOP_QUERY}{${scope} [data-travel]{height:${MAX_TRAVEL_VH.desktop}vh}}`,
    `@media ${MOBILE_QUERY}{${scope} [data-desktop-only]{display:none}${scope} [data-scene-sun] img{translate:0 ${num(MOBILE_SUN_DROP * 100)}%}}`,
    `@media (max-aspect-ratio: 1/1){${scope} [data-scene-sun] img{object-position:80% 100%}}`,
    `@media ${DESKTOP_QUERY}{[data-scene="static"] [data-scene-sun]{transform:${midday}}}`,
    `@media (prefers-reduced-motion: reduce){${scope} [data-parallax]{transform:none!important;animation:none!important}` +
      `${scope} [data-sky="day"]{opacity:1!important}${scope} [data-late]{opacity:0!important}}`,
    `@media (prefers-reduced-motion: reduce) and ${DESKTOP_QUERY}{${scope} [data-scene-sun]{transform:${midday}!important}}`,
  ].join("");
}

export function layersFor(mode: "desktop" | "mobile"): readonly SceneLayer[] {
  return mode === "mobile" ? SCENE_LAYERS.filter((layer) => layer.onMobile) : SCENE_LAYERS;
}
