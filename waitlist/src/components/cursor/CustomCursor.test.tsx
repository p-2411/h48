import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomCursor from "./CustomCursor";
import { HTML_CLASS } from "./cursorStyles";
import { classifyTarget } from "./cursorTargets";
import {
  FINE_POINTER_QUERY,
  FORCED_COLORS_QUERY,
  REDUCED_MOTION_QUERY,
} from "./useCustomCursorSupport";

/* ------------------------------------------------------------------ */
/* matchMedia mock with change events                                  */
/* ------------------------------------------------------------------ */

type Listener = (event: MediaQueryListEvent) => void;
const mediaState = new Map<string, boolean>();
const mediaListeners = new Map<string, Set<Listener>>();

function installMatchMedia() {
  window.matchMedia = vi.fn((query: string): MediaQueryList => {
    const listeners = mediaListeners.get(query) ?? new Set<Listener>();
    mediaListeners.set(query, listeners);
    return {
      media: query,
      get matches() {
        return mediaState.get(query) ?? false;
      },
      onchange: null,
      addEventListener: (_type: string, cb: Listener) => listeners.add(cb),
      removeEventListener: (_type: string, cb: Listener) =>
        listeners.delete(cb),
      addListener: (cb: Listener) => listeners.add(cb),
      removeListener: (cb: Listener) => listeners.delete(cb),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

function setMedia(query: string, matches: boolean) {
  mediaState.set(query, matches);
  act(() => {
    for (const cb of mediaListeners.get(query) ?? []) {
      cb({ matches, media: query } as MediaQueryListEvent);
    }
  });
}

/* ------------------------------------------------------------------ */
/* requestAnimationFrame mock: frames run only when flushed            */
/* ------------------------------------------------------------------ */

let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

function installRaf() {
  frames = new Map();
  nextFrameId = 1;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    const id = nextFrameId++;
    frames.set(id, cb);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
}

function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
  for (const cb of pending) cb(performance.now());
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function getCursor(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".rf-cursor");
}

function move(target: Element, x = 120, y = 80, pointerType = "mouse") {
  fireEvent.pointerMove(target, { clientX: x, clientY: y, pointerType });
  flushFrames();
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  fireEvent(document, new Event("visibilitychange"));
}

beforeEach(() => {
  mediaState.clear();
  mediaListeners.clear();
  mediaState.set(FINE_POINTER_QUERY, true);
  mediaState.set(FORCED_COLORS_QUERY, false);
  mediaState.set(REDUCED_MOTION_QUERY, false);
  installMatchMedia();
  installRaf();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document.documentElement.className = "";
  setVisibility("visible");
});

/* ------------------------------------------------------------------ */
/* tests                                                               */
/* ------------------------------------------------------------------ */

describe("CustomCursor enablement", () => {
  it("renders nothing on the server", () => {
    expect(renderToString(<CustomCursor />)).toBe("");
  });

  it("renders nothing when the fine-pointer query is false", () => {
    mediaState.set(FINE_POINTER_QUERY, false);
    const { container } = render(<CustomCursor />);
    expect(container).toBeEmptyDOMElement();
    expect(getCursor()).toBeNull();

    move(document.body);
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);
  });

  it("is disabled entirely when reduced motion is preferred", () => {
    mediaState.set(REDUCED_MOTION_QUERY, true);
    const { container } = render(<CustomCursor />);
    expect(container).toBeEmptyDOMElement();
    expect(getCursor()).toBeNull();

    move(document.body);
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);
  });

  it("turns off and back on when the reduced-motion preference changes", () => {
    render(<CustomCursor />);
    move(document.body);
    expect(document.documentElement).toHaveClass(HTML_CLASS);

    setMedia(REDUCED_MOTION_QUERY, true);
    expect(getCursor()).toBeNull();
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);

    setMedia(REDUCED_MOTION_QUERY, false);
    expect(getCursor()).not.toBeNull();
    // The native cursor stays until the new instance has been positioned.
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);
    move(document.body);
    expect(document.documentElement).toHaveClass(HTML_CLASS);
  });

  it("is disabled entirely in forced-colors mode", () => {
    mediaState.set(FORCED_COLORS_QUERY, true);
    render(<CustomCursor />);
    expect(getCursor()).toBeNull();

    move(document.body);
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);
  });

  it("turns off when forced colors become active at runtime", () => {
    render(<CustomCursor />);
    move(document.body);
    expect(document.documentElement).toHaveClass(HTML_CLASS);

    setMedia(FORCED_COLORS_QUERY, true);
    expect(getCursor()).toBeNull();
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);
  });

  it("reacts to pointer capability changes", () => {
    mediaState.set(FINE_POINTER_QUERY, false);
    render(<CustomCursor />);
    expect(getCursor()).toBeNull();

    setMedia(FINE_POINTER_QUERY, true);
    expect(getCursor()).not.toBeNull();

    move(document.body);
    expect(document.documentElement).toHaveClass(HTML_CLASS);

    setMedia(FINE_POINTER_QUERY, false);
    expect(getCursor()).toBeNull();
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);
  });
});

describe("CustomCursor element", () => {
  it("is a hidden, aria-hidden, single element before the first move", () => {
    render(<CustomCursor />);
    const cursor = getCursor();
    expect(cursor).not.toBeNull();
    expect(document.querySelectorAll(".rf-cursor")).toHaveLength(1);
    expect(cursor).toHaveAttribute("aria-hidden", "true");
    expect(cursor).toHaveAttribute("data-state", "hidden");
    expect(cursor?.querySelector("svg path")).toHaveAttribute(
      "fill",
      "#FF6A13",
    );
    // The native cursor stays until the custom one has been positioned.
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);
  });

  it("ships its own stylesheet, including the global cursor: none rule", () => {
    render(<CustomCursor />);
    const css = document.querySelector("style")?.textContent ?? "";
    expect(css).toContain(`html.${HTML_CLASS}`);
    expect(css).toContain("cursor: none !important");
    expect(css).toContain("pointer-events: none");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});

describe("CustomCursor positioning", () => {
  it("positions the tip on the pointer and adds the html class after the first move", () => {
    render(<CustomCursor />);
    const cursor = getCursor()!;

    fireEvent.pointerMove(document.body, {
      clientX: 321,
      clientY: 654,
      pointerType: "mouse",
    });
    // Nothing is written outside a frame.
    expect(cursor.style.transform).toBe("");
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);

    flushFrames();
    expect(cursor.style.transform).toBe("translate3d(321px, 654px, 0)");
    expect(cursor).toHaveAttribute("data-state", "default");
    expect(document.documentElement).toHaveClass(HTML_CLASS);
  });

  it("coalesces several moves into one frame and uses the latest coordinates", () => {
    render(<CustomCursor />);
    const cursor = getCursor()!;
    const rafCalls = vi.mocked(window.requestAnimationFrame).mock.calls.length;

    fireEvent.pointerMove(document.body, { clientX: 1, clientY: 1, pointerType: "mouse" });
    fireEvent.pointerMove(document.body, { clientX: 2, clientY: 2, pointerType: "mouse" });
    fireEvent.pointerMove(document.body, { clientX: 3, clientY: 4, pointerType: "mouse" });
    expect(vi.mocked(window.requestAnimationFrame).mock.calls.length).toBe(
      rafCalls + 1,
    );

    flushFrames();
    expect(cursor.style.transform).toBe("translate3d(3px, 4px, 0)");
  });

  it("ignores touch pointer moves", () => {
    render(<CustomCursor />);
    move(document.body, 50, 50, "touch");
    expect(getCursor()?.style.transform).toBe("");
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);
  });
});

describe("CustomCursor states", () => {
  it("sets hover over a button, and back to default elsewhere", () => {
    render(<CustomCursor />);
    const button = document.createElement("button");
    button.innerHTML = "<span>Join</span>";
    document.body.append(button);

    move(button.querySelector("span")!);
    expect(getCursor()).toHaveAttribute("data-state", "hover");

    move(document.body);
    expect(getCursor()).toHaveAttribute("data-state", "default");
  });

  it("does not hover disabled controls", () => {
    render(<CustomCursor />);
    const button = document.createElement("button");
    button.disabled = true;
    const link = document.createElement("a");
    link.href = "#x";
    link.setAttribute("aria-disabled", "true");
    document.body.append(button, link);

    move(button);
    expect(getCursor()).toHaveAttribute("data-state", "default");
    move(link);
    expect(getCursor()).toHaveAttribute("data-state", "default");
  });

  it("hides over a text input and keeps the html class for the native I-beam rules", () => {
    render(<CustomCursor />);
    const input = document.createElement("input");
    input.type = "email";
    document.body.append(input);

    move(input);
    expect(getCursor()).toHaveAttribute("data-state", "hidden");
    expect(document.documentElement).toHaveClass(HTML_CLASS);

    move(document.body);
    expect(getCursor()).toHaveAttribute("data-state", "default");
  });

  it("hides over textarea, contenteditable, data-cursor=text and data-cursor=native", () => {
    render(<CustomCursor />);
    const zones = document.createElement("div");
    document.body.append(zones);
    zones.innerHTML = `
      <textarea id="ta"></textarea>
      <div contenteditable="true"><p id="ce">Edit</p></div>
      <div data-cursor="text"><span id="dt">Copy</span></div>
      <div data-cursor="native"><button id="dn">Map</button></div>
    `;
    for (const id of ["ta", "ce", "dt", "dn"]) {
      move(document.getElementById(id)!);
      expect(getCursor(), id).toHaveAttribute("data-state", "hidden");
    }
  });

  it("sets press on pointerdown and returns on pointerup", () => {
    render(<CustomCursor />);
    const button = document.createElement("button");
    document.body.append(button);

    move(button);
    fireEvent.pointerDown(button, { button: 0, pointerType: "mouse" });
    flushFrames();
    expect(getCursor()).toHaveAttribute("data-state", "press");

    fireEvent.pointerUp(button, { button: 0, pointerType: "mouse" });
    flushFrames();
    expect(getCursor()).toHaveAttribute("data-state", "hover");
  });

  it("ignores non-primary buttons for the press state", () => {
    render(<CustomCursor />);
    move(document.body);
    fireEvent.pointerDown(document.body, { button: 2, pointerType: "mouse" });
    flushFrames();
    expect(getCursor()).toHaveAttribute("data-state", "default");
  });

  it("fades out when the pointer leaves the window and back in on return", () => {
    render(<CustomCursor />);
    move(document.body);

    fireEvent.pointerOut(document.body, { relatedTarget: null, pointerType: "mouse" });
    flushFrames();
    expect(getCursor()).toHaveAttribute("data-state", "hidden");
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);

    move(document.body, 10, 10);
    expect(getCursor()).toHaveAttribute("data-state", "default");
    expect(document.documentElement).toHaveClass(HTML_CLASS);
  });

  it("does not hide on pointerout between elements", () => {
    render(<CustomCursor />);
    const a = document.createElement("div");
    const b = document.createElement("div");
    document.body.append(a, b);
    move(a);

    fireEvent.pointerOut(a, { relatedTarget: b, pointerType: "mouse" });
    flushFrames();
    expect(getCursor()).toHaveAttribute("data-state", "default");
  });

  it("hides on pointerleave of the document", () => {
    render(<CustomCursor />);
    move(document.body);
    fireEvent(document, new PointerEvent("pointerleave", { pointerType: "mouse" }));
    flushFrames();
    expect(getCursor()).toHaveAttribute("data-state", "hidden");
  });

  it("hides immediately when the tab becomes hidden, until the next move", () => {
    render(<CustomCursor />);
    move(document.body);

    setVisibility("hidden");
    // Applied synchronously: frames do not run in hidden tabs.
    expect(getCursor()).toHaveAttribute("data-state", "hidden");
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);

    setVisibility("visible");
    flushFrames();
    expect(getCursor()).toHaveAttribute("data-state", "hidden");

    move(document.body);
    expect(getCursor()).toHaveAttribute("data-state", "default");
  });

  it("hides after a touch tap on a hybrid device", () => {
    render(<CustomCursor />);
    move(document.body);
    fireEvent.pointerDown(document.body, { pointerType: "touch" });
    flushFrames();
    expect(getCursor()).toHaveAttribute("data-state", "hidden");
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);
  });

  it("restores the html class if something else rewrites it", () => {
    render(<CustomCursor />);
    move(document.body);
    document.documentElement.className = "font-sans";
    move(document.body, 5, 5);
    expect(document.documentElement).toHaveClass(HTML_CLASS, "font-sans");
  });
});

describe("CustomCursor cleanup", () => {
  it("removes the html class, listeners and pending frames on unmount", () => {
    const addDoc = vi.spyOn(document, "addEventListener");
    const removeDoc = vi.spyOn(document, "removeEventListener");
    const addWin = vi.spyOn(window, "addEventListener");
    const removeWin = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<CustomCursor />);
    move(document.body);
    expect(document.documentElement).toHaveClass(HTML_CLASS);

    // Leave a frame pending at unmount time.
    fireEvent.pointerMove(document.body, { clientX: 9, clientY: 9, pointerType: "mouse" });
    expect(frames.size).toBe(1);

    const cursorEvents = [
      "pointermove",
      "pointerdown",
      "pointerup",
      "pointercancel",
      "pointerout",
      "pointerleave",
      "visibilitychange",
    ];
    const added = addDoc.mock.calls.filter(([type]) => cursorEvents.includes(type));
    const addedWin = addWin.mock.calls.filter(([type]) =>
      ["blur", "contextmenu", "scroll"].includes(type),
    );
    expect(added).toHaveLength(cursorEvents.length);
    expect(addedWin).toHaveLength(3);

    unmount();

    expect(document.documentElement).not.toHaveClass(HTML_CLASS);
    expect(frames.size).toBe(0);
    for (const [type, fn] of added) {
      expect(removeDoc.mock.calls.some(([t, f]) => t === type && f === fn)).toBe(true);
    }
    for (const [type, fn] of addedWin) {
      expect(removeWin.mock.calls.some(([t, f]) => t === type && f === fn)).toBe(true);
    }

    // No more work after unmount.
    const rafCalls = vi.mocked(window.requestAnimationFrame).mock.calls.length;
    fireEvent.pointerMove(document.body, { clientX: 1, clientY: 1, pointerType: "mouse" });
    expect(vi.mocked(window.requestAnimationFrame).mock.calls.length).toBe(rafCalls);
    expect(document.documentElement).not.toHaveClass(HTML_CLASS);
  });
});

describe("classifyTarget", () => {
  it("classifies common targets", () => {
    document.body.innerHTML = `
      <a id="link" href="/x">x</a>
      <a id="anchor">no href</a>
      <label id="label"><input id="check" type="checkbox"> Agree</label>
      <input id="text">
      <input id="pw" type="password">
      <input id="disabledText" disabled>
      <summary id="summary">More</summary>
      <select id="select"></select>
      <div id="role" role="button">R</div>
      <div id="opt" data-cursor="hover"><span id="optChild">C</span></div>
      <div id="plain">Plain</div>
    `;
    const kind = (id: string) => classifyTarget(document.getElementById(id));
    expect(kind("link")).toBe("interactive");
    expect(kind("anchor")).toBe("default");
    expect(kind("label")).toBe("interactive");
    expect(kind("check")).toBe("interactive");
    expect(kind("text")).toBe("text");
    expect(kind("pw")).toBe("text");
    expect(kind("disabledText")).toBe("default");
    expect(kind("summary")).toBe("interactive");
    expect(kind("select")).toBe("interactive");
    expect(kind("role")).toBe("interactive");
    expect(kind("optChild")).toBe("interactive");
    expect(kind("plain")).toBe("default");
    expect(classifyTarget(null)).toBe("default");
    expect(classifyTarget(document)).toBe("default");
  });
});
