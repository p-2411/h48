import { cleanup, render } from "@testing-library/react";
import { useReducedMotion } from "motion/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Scene, { SCENE_CSS } from "./Scene";
import {
  DESKTOP_QUERY,
  MAX_TRAVEL_VH,
  MOBILE_QUERY,
  SCENE_LAYERS,
  TRAVEL_INPUT,
  TRAVEL_OUTPUT,
  layerKeyframes,
  layerOffsetVh,
  layersFor,
  sceneCss,
  sunKeyframes,
} from "./sceneConfig";

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: vi.fn(() => false) };
});

/* ------------------------------------------------------------------ */
/* Browser API mocks                                                   */
/* ------------------------------------------------------------------ */

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        media: query,
        matches: false,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  vi.stubGlobal("ResizeObserver", NoopObserver);
  vi.mocked(useReducedMotion).mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const scene = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-scene]");
const parallaxLayers = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[data-parallax]")];
const imageSources = (container: HTMLElement) =>
  [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
const desktopSources = (container: HTMLElement) =>
  [...container.querySelectorAll("source")].map((source) => [source.getAttribute("media"), source.getAttribute("srcset")]);

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

describe("Scene", () => {
  it("renders a decorative, fixed, non-interactive container", () => {
    const { container } = render(<Scene />);
    const root = scene(container);
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveClass("fixed", "pointer-events-none", "overflow-hidden", "z-0", "h-lvh");
    for (const img of container.querySelectorAll("img")) {
      expect(img).toHaveAttribute("alt", "");
      expect(img).toHaveAttribute("decoding", "async");
      expect(img).toHaveAttribute("loading", "eager");
      expect(img).toHaveAttribute("draggable", "false");
      expect(img).toHaveAttribute("width", "1600");
      expect(img).toHaveAttribute("height", "1000");
    }
  });

  it("binds a translate3d transform to every moving layer, at most 8", () => {
    const { container } = render(<Scene />);
    expect(scene(container)).toHaveAttribute("data-scene", "parallax");
    const layers = parallaxLayers(container);
    expect(layers.map((el) => el.dataset.parallax)).toEqual(["sun", "ridge", "hills", "farm", "city"]);
    expect(layers.length).toBeLessThanOrEqual(8);
    for (const layer of layers) {
      expect(layer.style.transform).toMatch(/^translate3d\(/);
      expect(layer).toHaveClass("will-change-transform");
    }
    // Landscape layers are travel boxes; their transforms are a share of the box.
    for (const layer of layers.slice(1)) {
      expect(layer).toHaveAttribute("data-travel");
      expect(layer.style.transform).toMatch(/%/);
    }
  });

  it("fades the city lights and the dusk ridge in with opacity only", () => {
    const { container } = render(<Scene />);
    const lights = container.querySelector<HTMLElement>('[data-parallax="city"] [data-overlay="lights"]');
    const dusk = container.querySelector<HTMLElement>('[data-parallax="ridge"] [data-overlay="ridge-dusk"]');
    for (const overlay of [lights, dusk]) {
      expect(overlay).not.toBeNull();
      expect(overlay).toHaveAttribute("data-late");
      expect(overlay?.style.opacity).toBe("0");
      expect(overlay?.style.transform).toBe("");
    }
    expect(imageSources(container)).toContain("/scene/lights.svg");
  });

  it("marks the ridge desktop-only, so phones neither show nor download it", () => {
    const { container } = render(<Scene />);
    const desktopOnly = [...container.querySelectorAll<HTMLElement>("[data-parallax][data-desktop-only]")];
    expect(desktopOnly.map((el) => el.dataset.parallax)).toEqual(["ridge"]);
    // Phones get a 1x1 placeholder; the real file only loads at the desktop breakpoint.
    expect(imageSources(container)).not.toContain("/scene/ridge.svg");
    expect(desktopSources(container)).toEqual(
      expect.arrayContaining([
        [DESKTOP_QUERY, "/scene/ridge.svg"],
        [DESKTOP_QUERY, "/scene/ridge-dusk.svg"],
      ]),
    );
    expect(SCENE_CSS).toContain(`@media ${MOBILE_QUERY}{[data-scene] [data-desktop-only]{display:none}`);
  });

  it("renders a still midday scene with no bound transforms under reduced motion", () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const { container } = render(<Scene />);
    expect(scene(container)).toHaveAttribute("data-scene", "static");
    expect(parallaxLayers(container)).toHaveLength(0);
    for (const el of container.querySelectorAll<HTMLElement>("[data-scene] div")) {
      expect(el.style.transform).toBe("");
    }
    // Midday sky only, and no late-day overlays.
    expect(container.querySelector('[data-sky="day"]')).not.toBeNull();
    expect(container.querySelector('[data-sky="golden"]')).toBeNull();
    expect(container.querySelector("[data-late]")).toBeNull();
    expect(imageSources(container)).not.toContain("/scene/lights.svg");
    // The sun's midday height comes from CSS (wide screens only).
    expect(container.querySelector("[data-scene-sun]")).not.toBeNull();
    expect(SCENE_CSS).toContain(`@media ${DESKTOP_QUERY}{[data-scene="static"] [data-scene-sun]{transform:translate3d(0vw,-44vh,0)}}`);
  });

  it("ships the CSS fallback that holds the scene still under reduced motion", () => {
    const { container } = render(<Scene />);
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toBe(SCENE_CSS);
    expect(css).toContain("@media (prefers-reduced-motion: reduce){");
    expect(css).toContain("[data-scene] [data-parallax]{transform:none!important;animation:none!important}");
    expect(css).toContain('[data-scene] [data-sky="day"]{opacity:1!important}');
    expect(css).toContain("[data-scene] [data-late]{opacity:0!important}");
  });

  it("server-renders the same parallax markup for every screen and motion setting", () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const html = renderToString(<Scene />);
    expect(html).toContain('data-scene="parallax"');
    expect(html).toContain('data-parallax="ridge"');
    expect(html).toContain('data-parallax="city"');
    expect(html).not.toContain("data-scene-mode");
  });
});

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

describe("sceneConfig", () => {
  it("orders layers back to front with rising depth speeds", () => {
    const depths = SCENE_LAYERS.map((layer) => layer.depth);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
    expect(depths.at(-1)).toBeLessThanOrEqual(1);
  });

  it("uses one transform template per keyframe list so it can be interpolated", () => {
    const template = (value: string) => value.replace(/-?\d+(\.\d+)?/g, "#");
    for (const layer of SCENE_LAYERS) {
      const frames = layerKeyframes(layer.depth);
      expect(frames).toHaveLength(TRAVEL_INPUT.length);
      expect(new Set(frames.map(template)).size).toBe(1);
      expect(frames[0]).toBe("translate3d(0%,0%,0)");
    }
    expect(new Set(sunKeyframes().map(template)).size).toBe(1);
    expect(TRAVEL_OUTPUT).toHaveLength(TRAVEL_INPUT.length);
  });

  it("moves nearer layers further, and phones travel half as far", () => {
    const peak = (depth: number) =>
      Math.max(...layerKeyframes(depth).map((frame) => Number(/,(-?[\d.]+)%/.exec(frame)?.[1])));
    expect(peak(1)).toBe(100);
    expect(peak(0.6)).toBeGreaterThan(peak(0.38));
    expect(layerOffsetVh(1, 1, "desktop")).toBe(MAX_TRAVEL_VH.desktop);
    expect(MAX_TRAVEL_VH.mobile).toBe(MAX_TRAVEL_VH.desktop / 2);
    // The travel box heights that the percentages resolve against.
    const css = sceneCss();
    expect(css).toContain(`[data-scene] [data-travel]{height:${MAX_TRAVEL_VH.mobile}vh}`);
    expect(css).toContain(`@media ${DESKTOP_QUERY}{[data-scene] [data-travel]{height:${MAX_TRAVEL_VH.desktop}vh}}`);
    expect(layersFor("mobile").map((layer) => layer.id)).toEqual(["hills", "farm", "city"]);
  });
});
