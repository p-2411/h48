#!/usr/bin/env node
/**
 * Roofless parallax scene generator.
 *
 *   node scripts/generate-scene.mjs
 *
 * Writes the layered landscape used by `src/components/scene/Scene.tsx` to
 * `public/scene/*.svg`. Every layer shares viewBox "0 0 1600 1000" and
 * preserveAspectRatio "xMidYMax slice", so the horizon stays anchored to the
 * bottom edge on any screen.
 *
 * Plain Node ESM, no dependencies. A seeded PRNG makes the output
 * deterministic: the same SEED always gives byte-identical files, so the
 * generated SVGs can be committed and re-generated safely. Each layer draws
 * from its own random stream, so changing one layer does not reshuffle the
 * others.
 *
 * Art rules: flat fills and linear/radial gradients only. No filters, no blur,
 * no masks. Haze is baked into the colours (far layers are lighter and lower
 * contrast). Coordinates are rounded to 1 decimal. Keep each file < ~50 kB.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SEED = 20261010;
const W = 1600;
const H = 1000;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "scene");

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const C = {
  navy: "#1D2433",
  navySoft: "#2B3449",
  sun: "#FF6A13",
  sunDeep: "#EC4A0C",
  glow: "#FFB27A",
  peach: "#FFD3B8",
  white: "#FFFFFF",
};

/* ------------------------------------------------------------------ */
/* Seeded randomness                                                   */
/* ------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFor(name) {
  const next = mulberry32(SEED ^ hashString(name));
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

/* ------------------------------------------------------------------ */
/* Numbers and paths                                                   */
/* ------------------------------------------------------------------ */

/** Round to 1 decimal and drop redundant characters ("0.5" -> ".5"). */
function f(value) {
  let r = Math.round(value * 10) / 10;
  if (Object.is(r, -0)) r = 0;
  let s = String(r);
  if (s.startsWith("0.")) s = s.slice(1);
  else if (s.startsWith("-0.")) s = `-${s.slice(2)}`;
  return s;
}

const p = (x, y) => `${f(x)} ${f(y)}`;

/** Catmull-Rom spline through the points, written as cubic Beziers. */
function spline(points, closed = false, tension = 1) {
  const n = points.length;
  const at = (i) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${p(points[0][0], points[0][1])}`;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[0] + ((p2[0] - p0[0]) * tension) / 6;
    const c1y = p1[1] + ((p2[1] - p0[1]) * tension) / 6;
    const c2x = p2[0] - ((p3[0] - p1[0]) * tension) / 6;
    const c2y = p2[1] - ((p3[1] - p1[1]) * tension) / 6;
    d += `C${p(c1x, c1y)} ${p(c2x, c2y)} ${p(p2[0], p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

function rect(x, y, w, h) {
  return `M${p(x, y)}h${f(w)}v${f(h)}h${f(-w)}z`;
}

function poly(points) {
  return `M${points.map(([x, y]) => p(x, y)).join("L")}Z`;
}

/** Smooth 1D value noise in [-1, 1]. */
function noise1D(rng, scale) {
  const values = Array.from({ length: 512 }, () => rng.next() * 2 - 1);
  return (x) => {
    const xs = x / scale + 1000;
    const i = Math.floor(xs);
    const t = xs - i;
    const s = t * t * (3 - 2 * t);
    return values[i & 511] * (1 - s) + values[(i + 1) & 511] * s;
  };
}

/** Fractal noise: several octaves of value noise, roughly in [-1, 1]. */
function fbm(rng, scale, octaves = 4) {
  const layers = Array.from({ length: octaves }, (_, k) => noise1D(rng, scale / 2 ** k));
  const norm = layers.reduce((sum, _, k) => sum + 0.5 ** k, 0);
  return (x) => layers.reduce((sum, layer, k) => sum + layer(x) * 0.5 ** k, 0) / norm;
}

/** Smooth curve through designed anchor points (cubic Hermite, Catmull-Rom tangents). */
function anchored(anchors) {
  const n = anchors.length;
  const slope = (i) => {
    const a = anchors[Math.max(0, i - 1)];
    const b = anchors[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  };
  return (x) => {
    if (x <= anchors[0][0]) return anchors[0][1];
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = anchors[i];
      const [x1, y1] = anchors[i + 1];
      if (x > x1) continue;
      const dx = x1 - x0;
      const t = (x - x0) / dx;
      const t2 = t * t;
      const t3 = t2 * t;
      return (
        (2 * t3 - 3 * t2 + 1) * y0 +
        (t3 - 2 * t2 + t) * slope(i) * dx +
        (-2 * t3 + 3 * t2) * y1 +
        (t3 - t2) * slope(i + 1) * dx
      );
    }
    return anchors[n - 1][1];
  };
}

/** A landform contour: designed anchors plus layered noise. */
function contour(rng, anchors, amplitude, scale = 260) {
  const base = anchored(anchors);
  const noise = fbm(rng, scale, 4);
  return (x) => base(x) + noise(x) * amplitude;
}

/** Closed ground band under a contour, filled to below the bottom edge. */
function groundPath(fn, step = 32, x0 = -48, x1 = W + 48) {
  const points = [];
  for (let x = x0; x <= x1; x += step) points.push([x, fn(x)]);
  return `${spline(points)}L${p(x1, H + 12)}L${p(x0, H + 12)}Z`;
}

/** Thin band between two offsets below a contour (used for earth streaks and tracks). */
function bandPath(fn, xa, xb, topOffset, bottomOffset, step = 24) {
  const top = [];
  const bottom = [];
  for (let x = xa; x <= xb + 0.01; x += step) {
    const t = (x - xa) / (xb - xa);
    const taper = Math.sin(Math.PI * t);
    top.push([x, fn(x) + topOffset(t)]);
    bottom.push([x, fn(x) + topOffset(t) + bottomOffset * taper]);
  }
  bottom.reverse();
  return `${spline(top)}L${spline(bottom).slice(1)}Z`;
}

function linear(id, stops, vertical = true) {
  const dir = vertical ? 'x2="0" y2="1"' : 'x2="1" y2="0"';
  const s = stops
    .map(([offset, color, opacity]) => {
      const op = opacity === undefined || opacity === 1 ? "" : ` stop-opacity="${opacity}"`;
      return `<stop offset="${offset}" stop-color="${color}"${op}/>`;
    })
    .join("");
  return `<linearGradient id="${id}" x1="0" y1="0" ${dir}>${s}</linearGradient>`;
}

function radial(id, stops, cx, cy, r) {
  const s = stops
    .map(([offset, color, opacity]) => {
      const op = opacity === undefined || opacity === 1 ? "" : ` stop-opacity="${opacity}"`;
      return `<stop offset="${offset}" stop-color="${color}"${op}/>`;
    })
    .join("");
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}">${s}</radialGradient>`;
}

/**
 * Rewrites absolute path data (M L H V C Q Z, plus the relative h/v that rect()
 * emits) as compact relative commands. Works in integer tenths, so relative
 * steps never drift from the rounded absolute coordinates.
 */
function compactPath(d) {
  const tokens = d.match(/[MLHVCQZmlhvcqz]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const tenths = (t) => Math.round(Number(t) * 10);
  const fmt = (v) => {
    if (v === 0) return "0";
    const neg = v < 0;
    const a = Math.abs(v);
    const int = Math.floor(a / 10);
    const frac = a % 10;
    const body = frac ? `${int === 0 ? "" : int}.${frac}` : String(int);
    return neg ? `-${body}` : body;
  };
  let out = "";
  let last = "";
  let prevNum = "";
  const emit = (cmd, values) => {
    if (cmd !== last || cmd === "m") {
      out += cmd;
      prevNum = "";
    }
    for (const v of values) {
      const s = fmt(v);
      const needsSep = prevNum !== "" && !(s.startsWith("-") || (s.startsWith(".") && prevNum.includes(".")));
      out += (needsSep ? " " : "") + s;
      prevNum = s;
    }
    last = cmd === "m" ? "l" : cmd;
    if (cmd === "z") last = "z";
  };
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let cmd = "";
  const next = () => tenths(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case "M": {
        const x = next();
        const y = next();
        emit("m", [x - cx, y - cy]);
        cx = sx = x;
        cy = sy = y;
        cmd = "L";
        break;
      }
      case "L": {
        const x = next();
        const y = next();
        if (x === cx) emit("v", [y - cy]);
        else if (y === cy) emit("h", [x - cx]);
        else emit("l", [x - cx, y - cy]);
        cx = x;
        cy = y;
        break;
      }
      case "H": {
        const x = next();
        emit("h", [x - cx]);
        cx = x;
        break;
      }
      case "V": {
        const y = next();
        emit("v", [y - cy]);
        cy = y;
        break;
      }
      case "h": {
        const dx = next();
        emit("h", [dx]);
        cx += dx;
        break;
      }
      case "v": {
        const dy = next();
        emit("v", [dy]);
        cy += dy;
        break;
      }
      case "C": {
        const v = [next(), next(), next(), next(), next(), next()];
        emit("c", [v[0] - cx, v[1] - cy, v[2] - cx, v[3] - cy, v[4] - cx, v[5] - cy]);
        cx = v[4];
        cy = v[5];
        break;
      }
      case "Q": {
        const v = [next(), next(), next(), next()];
        emit("q", [v[0] - cx, v[1] - cy, v[2] - cx, v[3] - cy]);
        cx = v[2];
        cy = v[3];
        break;
      }
      case "Z":
      case "z":
        emit("z", []);
        cx = sx;
        cy = sy;
        break;
      default:
        throw new Error(`compactPath: unsupported command ${cmd}`);
    }
  }
  return out;
}

function svg(body, defs = "") {
  const compact = (markup) => markup.replace(/ d="([^"]+)"/g, (_, d) => ` d="${compactPath(d)}"`);
  body = compact(body);
  defs = compact(defs);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">` +
    (defs ? `<defs>${defs}</defs>` : "") +
    body +
    "</svg>\n"
  );
}

/* ------------------------------------------------------------------ */
/* Eucalypts                                                           */
/* ------------------------------------------------------------------ */

/** Tapered, slightly bent limb. Wound clockwise to match the canopy blobs (nonzero fill). */
function limb(rng, a, b, w0, w1, bendAmount = 0.1) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = rng.range(-bendAmount, bendAmount) * len;
  const cx = (a[0] + b[0]) / 2 + nx * bend;
  const cy = (a[1] + b[1]) / 2 + ny * bend;
  const wm = (w0 + w1) / 2;
  return (
    `M${p(a[0] - (nx * w0) / 2, a[1] - (ny * w0) / 2)}` +
    `Q${p(cx - (nx * wm) / 2, cy - (ny * wm) / 2)} ${p(b[0] - (nx * w1) / 2, b[1] - (ny * w1) / 2)}` +
    `L${p(b[0] + (nx * w1) / 2, b[1] + (ny * w1) / 2)}` +
    `Q${p(cx + (nx * wm) / 2, cy + (ny * wm) / 2)} ${p(a[0] + (nx * w0) / 2, a[1] + (ny * w0) / 2)}Z`
  );
}

/** Irregular leaf clump: lumpy top, flatter underside, like a drooping gum canopy. */
function clump(rng, cx, cy, rx, ry, points = 10, jag = 0.26) {
  const pts = [];
  const offset = rng.next() * Math.PI * 2;
  for (let i = 0; i < points; i++) {
    const a = offset + (i / points) * Math.PI * 2 + rng.range(-0.18, 0.18);
    const r = 1 + rng.range(-jag, jag);
    const s = Math.sin(a);
    pts.push([cx + Math.cos(a) * rx * r, cy + s * ry * r * (s > 0 ? 0.62 : 1)]);
  }
  return spline(pts, true);
}

/**
 * Procedural eucalypt: a leaning trunk that forks low into crooked, mostly
 * upright limbs. Leaves sit in irregular clumps at the limb tips, with gaps
 * between them and smaller clumps drooping below, which reads as a gum tree
 * rather than a round lollipop or a flat-topped acacia.
 * Returns { wood, leaves } path data, both wound clockwise.
 */
function eucalypt(rng, o) {
  const wood = [];
  const leaves = [];
  const forkH = o.h * rng.range(0.32, 0.46);
  const fork = [o.x + o.lean * forkH + rng.range(-0.04, 0.04) * o.h, o.y - forkH];
  wood.push(limb(rng, [o.x, o.y], fork, o.trunk, o.trunk * 0.7, 0.08));
  const reach = o.h - forkH;

  const leaf = (x, y, size) => {
    const rx = size * rng.range(0.8, 1.2);
    leaves.push(clump(rng, x, y, rx, rx * rng.range(0.62, 0.86), o.points, o.jag));
    // Drooping sub-clumps hang below and to the side.
    const droop = rng.int(0, 2);
    for (let i = 0; i < droop; i++) {
      const r = rx * rng.range(0.42, 0.62);
      leaves.push(clump(rng, x + rng.range(-1, 1) * rx * 0.75, y + rx * rng.range(0.35, 0.7), r, r * 0.8, o.points, o.jag));
    }
  };

  const grow = (from, angle, len, width, depth) => {
    // Crooked limb: two segments with a kink.
    const kinkT = rng.range(0.4, 0.6);
    const kinkA = angle + rng.range(-0.28, 0.28);
    const mid = [from[0] + Math.cos(kinkA) * len * kinkT, from[1] + Math.sin(kinkA) * len * kinkT];
    const end = [mid[0] + Math.cos(angle) * len * (1 - kinkT), mid[1] + Math.sin(angle) * len * (1 - kinkT)];
    const wMid = width * 0.8;
    wood.push(limb(rng, from, mid, width, wMid, 0.12), limb(rng, mid, end, wMid, width * 0.6, 0.12));
    if (depth === 0) {
      leaf(end[0], end[1], o.clump);
      return;
    }
    const kids = rng.int(2, 3);
    for (let k = 0; k < kids; k++) {
      const side = k === 0 ? -1 : k === 1 ? 1 : rng.range(-0.4, 0.4);
      const spread = side * rng.range(0.22, 0.5);
      grow(end, angle + spread, len * rng.range(0.55, 0.72), width * 0.6, depth - 1);
    }
    if (rng.chance(0.5)) leaf(mid[0] + rng.range(-0.3, 0.3) * o.clump, mid[1], o.clump * rng.range(0.55, 0.75));
  };

  const mains = rng.int(2, 4);
  for (let i = 0; i < mains; i++) {
    const t = i / (mains - 1) - 0.5;
    const angle = -Math.PI / 2 + o.lean * 0.5 + t * rng.range(0.55, 0.85) + rng.range(-0.1, 0.1);
    grow(fork, angle, reach * rng.range(0.42, 0.56), o.trunk * 0.62, o.depth);
  }
  return { wood: wood.join(""), leaves: leaves.join("") };
}

/* ------------------------------------------------------------------ */
/* Layer: sun                                                          */
/* ------------------------------------------------------------------ */

const SUN = { x: 1300, y: 690, r: 60 };

function sunLayer(deep = false) {
  const r = deep ? SUN.r * 1.32 : SUN.r;
  const defs = radial(
    deep ? "hd" : "h",
    deep
      ? [
          [0, "#FF7A2E", 0.5],
          [0.35, "#FF8A3D", 0.32],
          [0.7, C.glow, 0.12],
          [1, C.peach, 0],
        ]
      : [
          [0, "#FF8A3D", 0.42],
          [0.32, C.glow, 0.26],
          [0.66, C.peach, 0.12],
          [1, C.peach, 0],
        ],
    SUN.x,
    SUN.y,
    r * 4.6,
  );
  const body =
    `<circle cx="${SUN.x}" cy="${SUN.y}" r="${f(r * 4.6)}" fill="url(#${deep ? "hd" : "h"})"/>` +
    `<circle cx="${SUN.x}" cy="${SUN.y}" r="${f(r * 1.55)}" fill="none" stroke="${C.glow}" stroke-opacity=".38" stroke-width="1.5"/>` +
    `<circle cx="${SUN.x}" cy="${SUN.y}" r="${f(r * 1.22)}" fill="${deep ? "#FF7A2E" : C.glow}" fill-opacity=".28"/>` +
    `<circle cx="${SUN.x}" cy="${SUN.y}" r="${f(r)}" fill="${deep ? C.sunDeep : C.sun}"/>`;
  return svg(body, defs);
}

/* ------------------------------------------------------------------ */
/* Layer: far ridge                                                    */
/* ------------------------------------------------------------------ */

/**
 * Far ridge. The dusk variant has the same contours in warm rose tones; the
 * component fades it in with the golden sky, so the pale ridge never reads as
 * a white band against the orange sky.
 */
function ridgeLayer(dusk = false) {
  const rng = rngFor("ridge");
  // Old, rounded Australian ranges with a flat-topped escarpment on the left.
  const far = contour(
    rng,
    [
      [-60, 628],
      [120, 602],
      [260, 590],
      [420, 588],
      [520, 596],
      [580, 632],
      [760, 646],
      [940, 650],
      [1070, 662],
      [1200, 676],
      [1310, 684],
      [1430, 656],
      [1550, 616],
      [1660, 626],
    ],
    7,
    220,
  );
  const near = contour(
    rng,
    [
      [-60, 690],
      [180, 672],
      [380, 684],
      [600, 700],
      [820, 708],
      [1000, 700],
      [1140, 704],
      [1300, 712],
      [1440, 700],
      [1560, 682],
      [1660, 676],
    ],
    6,
    180,
  );
  const defs = dusk
    ? linear("a", [
        [0, "#F4CDBF"],
        [0.5, "#F8DCD0"],
        [1, "#FBE8DF"],
      ]) +
      linear("b", [
        [0, "#EFC0AE"],
        [0.6, "#F5D3C5"],
        [1, "#F9E3D9"],
      ])
    : // Kept light on purpose: small slate text (#5B6372) over either band stays above 4.5:1.
      linear("a", [
        [0, "#F7EBE4"],
        [0.5, "#FAF1EC"],
        [1, "#FDF7F3"],
      ]) +
      linear("b", [
        [0, "#F2DFD5"],
        [0.6, "#F7EAE2"],
        [1, "#FBF2EC"],
      ]);
  const body = `<path fill="url(#a)" d="${groundPath(far)}"/><path fill="url(#b)" d="${groundPath(near)}"/>`;
  return svg(body, defs);
}

/* ------------------------------------------------------------------ */
/* Layer: hills (red earth, ochre, sparse gums)                        */
/* ------------------------------------------------------------------ */

function hillsLayer() {
  const rng = rngFor("hills");
  const back = contour(
    rng,
    [
      [-60, 706],
      [140, 690],
      [330, 712],
      [520, 748],
      [720, 766],
      [900, 770],
      [1080, 758],
      [1260, 728],
      [1430, 706],
      [1660, 716],
    ],
    6,
    200,
  );
  const front = contour(
    rng,
    [
      [-60, 752],
      [160, 740],
      [380, 768],
      [600, 792],
      [820, 806],
      [1040, 798],
      [1260, 772],
      [1450, 752],
      [1660, 760],
    ],
    5,
    170,
  );
  const defs =
    linear("c", [
      [0, "#EAC1A6"],
      [0.45, "#F2D4C1"],
      [1, "#F8E6DA"],
    ]) +
    linear("d", [
      [0, "#E3AC8D"],
      [0.4, "#EDC6AF"],
      [1, "#F5DDCD"],
    ]);

  // Red-earth streaks and an ochre paddock follow the slopes.
  const streaksBack = [
    bandPath(back, 120, 420, (t) => 10 + t * 8, 7),
    bandPath(back, 1180, 1520, (t) => 9 + (1 - t) * 6, 6),
  ].join("");
  const streaksFront = [
    bandPath(front, -40, 300, (t) => 12 + t * 5, 9),
    bandPath(front, 1250, 1640, (t) => 11 + t * 3, 8),
  ].join("");
  const ochre = [bandPath(front, 420, 760, (t) => 16 + t * 6, 10), bandPath(back, 640, 980, (t) => 8 + t * 3, 5)].join("");

  const trees = (fn, spots, scale, rngName, depth) => {
    const r = rngFor(rngName);
    const wood = [];
    const leaves = [];
    for (const [x, size] of spots) {
      const h = size * scale * r.range(0.85, 1.15);
      const t = eucalypt(r, {
        x,
        y: fn(x) + h * 0.06,
        h,
        lean: r.range(-0.18, 0.18),
        trunk: Math.max(1.4, h * 0.05),
        clump: h * (depth ? 0.15 : 0.22),
        depth,
        points: 7,
        jag: 0.26,
      });
      wood.push(t.wood);
      leaves.push(t.leaves);
    }
    return { wood: wood.join(""), leaves: leaves.join("") };
  };
  const backTrees = trees(
    back,
    [
      [96, 0.9],
      [128, 1.1],
      [168, 0.8],
      [236, 1],
      [1262, 0.85],
      [1300, 1.05],
      [1338, 0.9],
      [1396, 1.15],
      [1452, 0.8],
    ],
    34,
    "hills-back-trees",
    0,
  );
  // The centre band stays clear of trees: the hero form and its consent line sit over it.
  const frontTrees = trees(
    front,
    [
      [44, 1.1],
      [84, 0.85],
      [1210, 1],
      [1488, 1.15],
      [1530, 0.9],
    ],
    50,
    "hills-front-trees",
    1,
  );

  const body =
    `<path fill="url(#c)" d="${groundPath(back)}"/>` +
    `<path fill="#D98A62" fill-opacity=".22" d="${streaksBack}"/>` +
    `<path fill="#E9B57A" fill-opacity=".28" d="${ochre}"/>` +
    `<g fill="#B4AE98"><path d="${backTrees.wood}"/><path d="${backTrees.leaves}"/></g>` +
    `<path fill="url(#d)" d="${groundPath(front)}"/>` +
    `<path fill="#D4825A" fill-opacity=".22" d="${streaksFront}"/>` +
    `<g fill="#9C9C84"><path d="${frontTrees.wood}"/><path d="${frontTrees.leaves}"/></g>`;
  return svg(body, defs);
}

/* ------------------------------------------------------------------ */
/* Layer: solar farm + transmission line                               */
/* ------------------------------------------------------------------ */

function farmLayer() {
  const rng = rngFor("farm");
  const ground = contour(
    rng,
    [
      [-60, 846],
      [200, 832],
      [420, 812],
      [640, 796],
      [860, 790],
      [1060, 794],
      [1260, 808],
      [1460, 826],
      [1660, 836],
    ],
    4,
    240,
  );
  const defs =
    linear("g", [
      [0, "#F0CCB2"],
      [0.18, "#F3D6C1"],
      [0.6, "#F8E5D8"],
      [1, "#FBEEE5"],
    ]) +
    linear("t", [
      [0, C.white, 0.98],
      [1, "#FFF6F0", 0.98],
    ]);

  const panels = [];
  const edges = [];
  const mids = [];
  const shadows = [];
  const glints = [];
  let highlight = null;

  const ROWS = 7;
  const centre = 900;
  const boundary = noise1D(rngFor("farm-boundary"), 2.2);
  let offset = 10;
  for (let r = 0; r < ROWS; r++) {
    const spacing = 8.6 * 1.22 ** r;
    if (r > 0) offset += spacing;
    const h = 0.6 * spacing;
    const w = 13.5 * 1.1 ** r;
    const gap = w * 0.12;
    const skew = 0.22 * h;
    const half = 238 + 30 * r;
    const left = centre - half + boundary(r) * 26;
    const right = centre + half + boundary(r + 40) * 22;
    const track = [1010 + r * 3, 1010 + r * 3 + 14 + r * 3]; // access track splits the field
    const placeModule = (x) => {
      const y1 = ground(x) + offset;
      const y2 = ground(x + w) + offset;
      const quad = [
        [x + skew, y1 - h],
        [x + w + skew, y2 - h],
        [x + w, y2],
        [x, y1],
      ];
      const isHighlight = r === ROWS - 2 && highlight === null && x + w / 2 >= 712;
      if (isHighlight) highlight = { quad, x, w, y1, y2, h, skew };
      else panels.push(poly(quad));
      edges.push(`M${p(quad[0][0], quad[0][1])}L${p(quad[1][0], quad[1][1])}`);
      if (r >= 3) {
        mids.push(`M${p(x + skew / 2, y1 - h / 2)}L${p(x + w + skew / 2, y2 - h / 2)}`);
      }
      if (!isHighlight && r >= 2 && rng.chance(0.06)) {
        glints.push(`M${p(quad[0][0] + w * 0.15, quad[0][1] + h * 0.18)}L${p(quad[1][0] - w * 0.25, quad[1][1] + h * 0.18)}`);
      }
    };
    // Tables of up to 6 modules on each side of the track. A table needs at least
    // 3 modules, so no stray single panels sit at the row ends.
    let x = left;
    for (const [from, to] of [
      [left, track[0]],
      [track[1], right],
    ]) {
      x = Math.max(x, from);
      for (;;) {
        const fit = Math.floor((to - x + gap) / (w + gap));
        if (fit < 3) break;
        const tableStart = x;
        for (let k = 0; k < Math.min(6, fit); k++) {
          placeModule(x);
          x += w + gap;
        }
        // Ground shadow under each table, falling away from the sun.
        const end = x - gap;
        const sy1 = ground(tableStart) + offset;
        const sy2 = ground(end) + offset;
        shadows.push(
          poly([
            [tableStart, sy1],
            [end, sy2],
            [end - h * 0.5, sy2 + h * 0.42],
            [tableStart - h * 0.5, sy1 + h * 0.42],
          ]),
        );
        x += w * 0.9;
      }
    }
  }

  // Transmission line: from the farm's substation toward the city.
  const subX = 640;
  const subY = ground(subX) + 16;
  const poles = [
    [604, 22, 26],
    [548, 54, 36],
    [470, 104, 50],
    [366, 176, 70],
    [226, 276, 96],
  ].map(([x, dy, h]) => ({ x, base: ground(x) + dy, h }));
  let poleD = "";
  let wireD = "";
  const arms = [];
  for (const pole of poles) {
    const top = pole.base - pole.h;
    const pw = Math.max(1.2, pole.h * 0.035);
    poleD += rect(pole.x - pw / 2, top, pw, pole.h);
    const armW = pole.h * 0.46;
    poleD += rect(pole.x - armW / 2, top + pole.h * 0.06, armW, Math.max(1, pole.h * 0.03));
    arms.push([-0.42, 0, 0.42].map((k) => [pole.x + k * armW, top + pole.h * 0.06]));
  }
  for (let i = 0; i < poles.length - 1; i++) {
    for (let k = 0; k < 3; k++) {
      const a = arms[i][k];
      const b = arms[i + 1][k];
      const sag = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.07;
      wireD += `M${p(a[0], a[1])}Q${p((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag)} ${p(b[0], b[1])}`;
    }
  }
  // First span from the substation to the first pole.
  for (let k = 0; k < 3; k++) {
    const b = arms[0][k];
    wireD += `M${p(subX - 6 + k * 6, subY - 12)}Q${p((subX + b[0]) / 2, (subY - 12 + b[1]) / 2 + 2)} ${p(b[0], b[1])}`;
  }
  const substation =
    rect(subX - 16, subY - 9, 32, 9) +
    rect(subX - 10, subY - 14, 6, 5) +
    rect(subX + 2, subY - 14, 6, 5) +
    rect(subX - 7, subY - 18, 1.2, 9) +
    rect(subX + 5, subY - 18, 1.2, 9);

  // "Your panel": one orange module with a small annotation tag.
  let tag = "";
  let hi = "";
  if (highlight) {
    const { quad, x, w, skew } = highlight;
    hi =
      `<path fill="${C.sun}" d="${poly(quad)}"/>` +
      `<path fill="none" stroke="#FFC9A3" stroke-width="1.1" d="M${p(quad[0][0], quad[0][1])}L${p(quad[1][0], quad[1][1])}"/>`;
    const ax = x + w / 2 + skew;
    const ay = quad[0][1] - 2;
    const tagW = 168;
    const tagH = 26;
    const tx = ax - 26;
    const ty = ay - 46;
    tag =
      `<path fill="none" stroke="${C.navy}" stroke-opacity=".55" stroke-width="1" d="M${p(ax, ay)}V${f(ty + tagH)}"/>` +
      `<circle cx="${f(ax)}" cy="${f(ay)}" r="2.2" fill="${C.navy}"/>` +
      `<rect x="${f(tx + 1.5)}" y="${f(ty + 2.5)}" width="${tagW}" height="${tagH}" rx="13" fill="${C.navy}" fill-opacity=".1"/>` +
      `<rect x="${f(tx)}" y="${f(ty)}" width="${tagW}" height="${tagH}" rx="13" fill="url(#t)" stroke="#FFD3B8"/>` +
      `<circle cx="${f(tx + 14)}" cy="${f(ty + tagH / 2)}" r="4" fill="${C.sun}"/>` +
      `<text x="${f(tx + 25)}" y="${f(ty + 17.4)}" font-family="Archivo,'Helvetica Neue',Helvetica,Arial,sans-serif" font-size="12.5" font-weight="600" fill="${C.navy}" textLength="${tagW - 37}" lengthAdjust="spacingAndGlyphs">Panel A-0142 · yours</text>`;
  }

  const body =
    `<path fill="url(#g)" d="${groundPath(ground)}"/>` +
    `<path fill="#E6BEA2" fill-opacity=".75" d="${shadows.join("")}"/>` +
    `<path fill="${C.navy}" d="${panels.join("")}"/>` +
    `<path fill="none" stroke="#33405C" stroke-width=".6" d="${mids.join("")}"/>` +
    `<path fill="none" stroke="#8494B4" stroke-width=".8" d="${edges.join("")}"/>` +
    `<path fill="none" stroke="#FFD9C0" stroke-width=".9" stroke-linecap="round" d="${glints.join("")}"/>` +
    hi +
    `<path fill="#6A7184" d="${substation}"/>` +
    `<path fill="none" stroke="#5C6478" stroke-opacity=".55" stroke-width=".8" d="${wireD}"/>` +
    `<path fill="#4C556A" d="${poleD}"/>` +
    tag;
  return svg(body, defs);
}

/* ------------------------------------------------------------------ */
/* Layer: city skyline (+ window lights)                               */
/* ------------------------------------------------------------------ */

const STREET_Y = 962;
/**
 * Glazing by depth (baked haze): far blocks get a softer slate, only the
 * nearest keep the deep navy. Each tone has a lighter "sky reflection" shade,
 * used on a few vertical strips of panes so the grids read as glass, not as
 * flat dark squares.
 */
const GLAZING = {
  far: { glass: "#56627E", sky: "#8E98AF" },
  mid: { glass: "#3E4965", sky: "#75809A" },
  near: { glass: "#2E3850", sky: "#5F6A85" },
};

function shade(hex, amount) {
  // Mix toward a warm shadow tone.
  const target = [214, 170, 148];
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const m = c.map((v, i) => Math.round(v + (target[i] - v) * amount));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function cityLayers() {
  const rng = rngFor("city");
  const parts = [];
  const windows = []; // { x, y, w, h, b } candidates for the lights layer, b = draw order
  const occluders = []; // { x0, y0, x1, y1, b }
  let index = 0;

  const addWindow = (x, y, w, h, b, list) => {
    list.push(rect(x, y, w, h));
    windows.push({ x, y, w, h, b });
  };

  /** Modern apartment tower: white balcony slabs, glass balustrades, navy glazing. */
  /** Picks a few pane columns that catch the sky; the rest stay dark. */
  const reflectingColumns = (count) => {
    const strips = new Set();
    const n = Math.max(1, Math.round(count * 0.25));
    while (strips.size < n) strips.add(rng.int(0, count - 1));
    return strips;
  };

  const balconyTower = ({ x, w, top, facade, floorH = 18, tone = "far" }) => {
    const b = index++;
    const { glass, sky } = GLAZING[tone];
    const side = Math.round(w * 0.17);
    const front = x + side;
    const fw = w - side;
    const glaze = [];
    const reflect = [];
    const slabs = [];
    const rails = [];
    const sideGlaze = [];
    let y = top + 16;
    const panes = Math.max(3, Math.round(fw / 21));
    const paneGap = 2.4;
    const margin = 6;
    const paneW = (fw - margin * 2 - paneGap * (panes - 1)) / panes;
    const strips = reflectingColumns(panes);
    while (y + floorH < STREET_Y - 8) {
      slabs.push(rect(front - 1.5, y + floorH - 2.6, fw + 5, 2.6));
      for (let i = 0; i < panes; i++) {
        const lit = strips.has(i) ? rng.chance(0.7) : rng.chance(0.05);
        addWindow(front + margin + i * (paneW + paneGap), y + 2.5, paneW, floorH - 7, b, lit ? reflect : glaze);
      }
      rails.push(rect(front - 1.5, y + floorH - 8.5, fw + 5, 5.9));
      sideGlaze.push(rect(x + 2.5, y + 3, side - 5, floorH - 8));
      y += floorH;
    }
    const plant = rect(front + fw * 0.18, top - 8, fw * 0.32, 8);
    parts.push(
      `<path fill="${shade(facade, 0.34)}" d="${rect(x, top, side, H + 10 - top)}${rect(front + fw * 0.18 - 3, top - 8, 3, 8)}"/>` +
        `<path fill="${facade}" d="${rect(front, top, fw, H + 10 - top)}${plant}"/>` +
        `<path fill="${glass}" fill-opacity=".34" d="${sideGlaze.join("")}"/>` +
        `<path fill="${glass}" d="${glaze.join("")}"/>` +
        `<path fill="${sky}" d="${reflect.join("")}"/>` +
        `<path fill="#FFFFFF" fill-opacity=".5" d="${rails.join("")}"/>` +
        `<path fill="#FFFFFF" d="${slabs.join("")}"/>` +
        `<path fill="${shade(facade, 0.18)}" d="${rect(front, top, fw, 3)}"/>`,
    );
    occluders.push({ x0: x, y0: top - 8, x1: x + w + 4, y1: H, b });
  };

  /** Rendered block with punched windows and white sills. */
  const punchedBlock = ({ x, w, top, facade, floorH = 24, cols, tone = "near" }) => {
    const b = index++;
    const { glass, sky } = GLAZING[tone];
    const side = Math.round(w * 0.15);
    const front = x + side;
    const fw = w - side;
    const glaze = [];
    const reflect = [];
    const sills = [];
    const sideWin = [];
    const n = cols ?? Math.max(3, Math.round(fw / 26));
    const cellW = (fw - 10) / n;
    const strips = reflectingColumns(n);
    let y = top + 13;
    while (y + floorH < STREET_Y - 6) {
      for (let i = 0; i < n; i++) {
        const ww = cellW * 0.46;
        const wx = front + 5 + i * cellW + (cellW - ww) / 2;
        const wh = floorH * 0.5;
        const lit = strips.has(i) ? rng.chance(0.6) : rng.chance(0.06);
        addWindow(wx, y + floorH * 0.18, ww, wh, b, lit ? reflect : glaze);
        sills.push(rect(wx - 1.2, y + floorH * 0.18 + wh, ww + 2.4, 1.6));
      }
      sideWin.push(rect(x + side * 0.32, y + floorH * 0.2, side * 0.36, floorH * 0.46));
      y += floorH;
    }
    parts.push(
      `<path fill="${shade(facade, 0.32)}" d="${rect(x, top, side, H + 10 - top)}"/>` +
        `<path fill="${facade}" d="${rect(front, top, fw, H + 10 - top)}"/>` +
        `<path fill="${shade(facade, 0.15)}" d="${rect(front, top, fw, 4)}"/>` +
        `<path fill="${glass}" fill-opacity=".32" d="${sideWin.join("")}"/>` +
        `<path fill="${glass}" d="${glaze.join("")}"/>` +
        `<path fill="${sky}" d="${reflect.join("")}"/>` +
        `<path fill="#FFFFFF" d="${sills.join("")}"/>`,
    );
    occluders.push({ x0: x, y0: top, x1: x + w, y1: H, b });
  };

  /** A row of two-storey Victorian terraces with iron-lace balconies. */
  const terraces = ({ x, count, w = 46, top }) => {
    const colours = ["#FFF6EE", "#F8DCC9", "#FDEDE1", "#F4D2BE", "#FFFAF5", "#F7DACA"];
    const facades = [];
    const recess = [];
    const glaze = [];
    const lace = [];
    const rails = [];
    const walls = [];
    const trims = [];
    const roofs = [];
    const b = index++;
    for (let i = 0; i < count; i++) {
      const hx = x + i * w;
      const colour = colours[(i * 2 + rng.int(0, 1)) % colours.length];
      facades.push(
        `<path fill="${colour}" d="${rect(hx, top, w, H + 10 - top)}${poly([
          [hx + w * 0.3, top],
          [hx + w / 2, top - 8],
          [hx + w * 0.7, top],
        ])}"/>`,
      );
      roofs.push(poly([[hx + 1, top + 1], [hx + w - 1, top + 1], [hx + w - 7, top - 6], [hx + 7, top - 6]]));
      // First-floor balcony (recessed verandah) with French doors.
      const by = top + 15;
      recess.push(rect(hx + 4, by, w - 8, 27));
      addWindow(hx + 9, by + 6, 10, 21, b, glaze);
      addWindow(hx + w - 19, by + 6, 10, 21, b, glaze);
      lace.push(`M${p(hx + 4, by + 2.5)}h${f(w - 8)}`);
      rails.push(`M${p(hx + 4, by + 22.5)}h${f(w - 8)}`);
      // Ground floor: door and window under the verandah roof.
      const gy = by + 33;
      recess.push(rect(hx + 3, gy, w - 6, STREET_Y - gy));
      addWindow(hx + 8, gy + 8, 12, 17, b, glaze);
      glaze.push(rect(hx + w - 17, gy + 6, 10, STREET_Y - gy - 6));
      lace.push(`M${p(hx + 3, gy + 2.5)}h${f(w - 6)}`);
      trims.push(rect(hx + w * 0.3, top + 4, w * 0.4, 1.8), rect(hx, by - 3, w, 2));
      // Party walls rise above the parapet; some carry chimneys.
      walls.push(rect(hx - 2, top - 9, 4, 13));
      if (i % 2 === 1) walls.push(rect(hx + w * 0.76, top - 15, 6, 10));
    }
    walls.push(rect(x + count * w - 2, top - 9, 4, 13));
    parts.push(
      `<path fill="#D9BBAD" d="${roofs.join("")}"/>` +
        facades.join("") +
        `<path fill="#7A4A35" fill-opacity=".08" d="${recess.join("")}"/>` +
        `<path fill="${C.navy}" d="${glaze.join("")}"/>` +
        `<path fill="none" stroke="${C.navy}" stroke-opacity=".5" stroke-width="3" stroke-dasharray="1.6 1.4" d="${lace.join("")}"/>` +
        `<path fill="none" stroke="#FFFFFF" stroke-width="6" stroke-dasharray="1 2.2" d="${rails.join("")}"/>` +
        `<path fill="#EACFBF" d="${walls.join("")}"/>` +
        `<path fill="#FFFFFF" fill-opacity=".85" d="${trims.join("")}"/>`,
    );
    occluders.push({ x0: x - 2, y0: top - 15, x1: x + count * w + 2, y1: H, b });
  };

  /** Backyard with a paling fence and a Hills Hoist rotary clothesline. */
  const backyard = ({ x0, x1, hoistX }) => {
    const b = index++;
    const base = STREET_Y - 2;
    const poleTop = base - 88;
    const cx = hoistX;
    const rx = 62;
    const ry = 13;
    const lift = 9; // arms angle upward from the pole top
    const armAngles = [0.42, 2.0, 3.56, 5.13];
    const armEnd = (a, k = 1) => [cx + Math.cos(a) * rx * k, poleTop + 3 + Math.sin(a) * ry * k - lift * k];
    let lines = "";
    for (const k of [0.4, 0.62, 0.82, 1]) {
      const pts = armAngles.map((a) => armEnd(a, k));
      for (let i = 0; i < 4; i++) {
        const a = pts[i];
        const c = pts[(i + 1) % 4];
        lines += `M${p(a[0], a[1])}Q${p((a[0] + c[0]) / 2, (a[1] + c[1]) / 2 + 1.8)} ${p(c[0], c[1])}`;
      }
    }
    const arms = armAngles.map((a) => {
      const e = armEnd(a);
      return `M${p(cx, poleTop + 3)}L${p(e[0], e[1])}`;
    });
    const stays = armAngles.map((a) => {
      const e = armEnd(a, 0.55);
      return `M${p(cx, poleTop + 18)}L${p(e[0], e[1])}`;
    });
    // Laundry pegged on the front lines.
    const pa = armEnd(armAngles[0], 1);
    const pb = armEnd(armAngles[1], 1);
    const lerpPt = (t) => [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t + Math.sin(Math.PI * t) * 1.8];
    const [t1x, t1y] = lerpPt(0.22);
    const [t2x, t2y] = lerpPt(0.5);
    const [t3x, t3y] = lerpPt(0.78);
    const laundry =
      `<path fill="#7F8CA8" d="${rect(t1x - 8, t1y, 15, 20)}"/>` +
      `<path fill="#FFFFFF" d="${rect(t2x - 10, t2y, 21, 25)}"/>` +
      `<path fill="#FFD3B8" d="${rect(t3x - 6, t3y, 12, 14)}"/>`;
    const fenceY = base - 24;
    parts.push(
      `<path fill="#F8E9DF" d="${rect(x0, 846, x1 - x0, base - 842)}"/>` +
        `<path fill="#EDD5C6" d="${rect(x0, 846, x1 - x0, 3)}${rect(x1 - 30, 858, 12, 15)}"/>` +
        `<path fill="none" stroke="#6E7588" stroke-width="2.4" d="M${p(cx, base)}V${f(poleTop)}"/>` +
        `<path fill="none" stroke="#6E7588" stroke-width="1.4" d="${arms.join("")}"/>` +
        `<path fill="none" stroke="#6E7588" stroke-width=".9" d="${stays.join("")}"/>` +
        `<path fill="none" stroke="#959BAA" stroke-width=".7" d="${lines}"/>` +
        laundry +
        `<path fill="#ECCBB7" d="${rect(x0, fenceY, x1 - x0, base - fenceY + 4)}"/>` +
        `<path fill="none" stroke="#DDB49E" stroke-width="${f(base - fenceY)}" stroke-dasharray="1.2 3.6" d="M${p(x0 + 1, (fenceY + base) / 2)}H${f(x1)}"/>`,
    );
    occluders.push({ x0, y0: 846, x1, y1: H, b });
  };

  /** Street trees in muted gum greens. */
  const streetTrees = (spots) => {
    const b = index++;
    const r = rngFor("street-trees");
    const wood = [];
    const leaves = [];
    for (const [x, h] of spots) {
      const t = eucalypt(r, { x, y: STREET_Y + 2, h, lean: r.range(-0.12, 0.12), trunk: h * 0.055, clump: h * 0.17, depth: 1, points: 8, jag: 0.26 });
      wood.push(t.wood);
      leaves.push(t.leaves);
      occluders.push({ x0: x - h * 0.5, y0: STREET_Y - h * 1.1, x1: x + h * 0.5, y1: H, b });
    }
    parts.push(`<g fill="#A2A48C"><path d="${wood.join("")}"/><path d="${leaves.join("")}"/></g>`);
  };

  /* --- skyline, far to near. Tall towers stay at the edges; the centre stays
     low so the hero text sits on clear sky; a gap at x≈1300 lets the sun rise. */
  balconyTower({ x: -44, w: 122, top: 560, facade: "#FCF2EB", tone: "far" });
  balconyTower({ x: 1470, w: 120, top: 568, facade: "#FAEADF", tone: "far" });
  punchedBlock({ x: 66, w: 112, top: 636, facade: "#F6DECF", floorH: 23, tone: "far" });
  punchedBlock({ x: 1566, w: 100, top: 616, facade: "#F4D9C8", floorH: 23, tone: "far" });
  balconyTower({ x: 170, w: 104, top: 694, facade: "#FFF7F1", tone: "mid" });
  balconyTower({ x: 1384, w: 108, top: 646, facade: "#FFF5EE", tone: "mid" });
  punchedBlock({ x: 266, w: 118, top: 770, facade: "#F3D6C3", floorH: 25, tone: "mid" });
  punchedBlock({ x: 1176, w: 104, top: 792, facade: "#FBEBE0", floorH: 25, cols: 3, tone: "mid" });
  punchedBlock({ x: 378, w: 132, top: 824, facade: "#FFF6F0", floorH: 26, cols: 4 });
  punchedBlock({ x: 1062, w: 120, top: 814, facade: "#F7DCCB", floorH: 26, cols: 4 });
  punchedBlock({ x: 900, w: 168, top: 852, facade: "#FFF5EE", floorH: 27, cols: 6 });
  terraces({ x: 1280, count: 2, w: 48, top: 884 });
  backyard({ x0: 786, x1: 904, hoistX: 846 });
  terraces({ x: 510, count: 6, top: 882 });
  streetTrees([
    [500, 70],
    [1084, 64],
    [1252, 80],
    [1392, 74],
    [30, 84],
  ]);

  // Street, kerb and lamp posts.
  const lamps = [612, 990, 1226, 352];
  let lampD = "";
  const lampHeads = [];
  for (const x of lamps) {
    lampD += rect(x - 0.8, STREET_Y - 46, 1.6, 48) + rect(x - 0.8, STREET_Y - 46, 9, 1.6);
    lampHeads.push([x + 9, STREET_Y - 44]);
  }
  parts.push(
    `<path fill="#F6E5DA" d="${rect(-10, STREET_Y, W + 20, H - STREET_Y + 12)}"/>` +
      `<path fill="#EACFBF" d="${rect(-10, STREET_Y, W + 20, 2.5)}"/>` +
      `<path fill="#6C7385" d="${lampD}${lampHeads.map(([x, y]) => rect(x - 3, y - 1, 6, 3)).join("")}"/>`,
  );

  // Lights: a stable subset of the windows nothing nearer covers, plus street lamps.
  const visible = windows.filter(
    (win) =>
      !occluders.some(
        (o) => o.b > win.b && win.x + win.w > o.x0 && win.x < o.x1 && win.y + win.h > o.y0 && win.y < o.y1,
      ),
  );
  const lightRng = rngFor("city-lights");
  const warm = [];
  const amber = [];
  for (const win of visible) {
    const roll = lightRng.next();
    if (roll < 0.3) warm.push(rect(win.x, win.y, win.w, win.h));
    else if (roll < 0.42) amber.push(rect(win.x, win.y, win.w, win.h));
  }
  const glow = lampHeads.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y + 5)}" r="18" fill="url(#lg)"/>`).join("");
  const lightsSvg = svg(
    `<path fill="#FFD48F" d="${warm.join("")}"/><path fill="#FFB561" d="${amber.join("")}"/>` +
      glow +
      `<path fill="#FFE2B0" d="${lampHeads.map(([x, y]) => rect(x - 3, y + 1, 6, 2)).join("")}"/>`,
    `<radialGradient id="lg"><stop offset="0" stop-color="#FFD48F" stop-opacity=".75"/><stop offset="1" stop-color="#FFD48F" stop-opacity="0"/></radialGradient>`,
  );

  return { city: svg(parts.join("")), lights: lightsSvg };
}

/* ------------------------------------------------------------------ */
/* Layer: foreground                                                   */
/* ------------------------------------------------------------------ */

function foregroundLayer() {
  // Two gums frame the outer edges only; their crowns stay below the hero text.
  const left = eucalypt(rngFor("fg-left"), {
    x: 36,
    y: H + 30,
    h: 520,
    lean: 0.1,
    trunk: 22,
    clump: 35,
    depth: 2,
    points: 10,
    jag: 0.3,
  });
  const right = eucalypt(rngFor("fg-right"), {
    x: 1572,
    y: H + 30,
    h: 470,
    lean: -0.12,
    trunk: 20,
    clump: 32,
    depth: 2,
    points: 10,
    jag: 0.3,
  });

  // Tussock grass at the corners.
  const rng = rngFor("fg-grass");
  const tufts = [];
  const tuft = (x, y, h, spread) => {
    const blades = rng.int(7, 11);
    const pts = [];
    for (let i = 0; i < blades; i++) {
      const t = i / (blades - 1) - 0.5;
      const bx = x + t * spread * 0.5;
      const tip = [x + t * spread * 1.6 + rng.range(-6, 6), y - h * (1 - Math.abs(t) * 0.8) * rng.range(0.75, 1.1)];
      pts.push([bx - 2.2, y], tip, [bx + 2.2, y]);
    }
    tufts.push(poly(pts));
  };
  for (let x = -20; x < 290; x += rng.range(28, 46)) tuft(x, H + 4, rng.range(30, 62) * (1 - x / 520), rng.range(24, 36));
  for (let x = 1330; x < 1640; x += rng.range(28, 46)) tuft(x, H + 4, rng.range(30, 62) * (1 - (1600 - x) / 520), rng.range(24, 36));

  const defs =
    `<path id="L" d="${left.leaves}${right.leaves}"/>` +
    `<path id="T" d="${left.wood}${right.wood}"/>` +
    linear("fg", [
      [0, "#2A334B"],
      [1, C.navy],
    ]);
  const body =
    `<use href="#L" fill="#FF9455" fill-opacity=".8" transform="translate(3 -2.5)"/>` +
    `<use href="#T" fill="#FF9455" fill-opacity=".55" transform="translate(2.5 0)"/>` +
    `<g fill="url(#fg)"><use href="#T"/><use href="#L"/></g>` +
    `<path fill="${C.navy}" d="${tufts.join("")}"/>`;
  return svg(body, defs);
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { city, lights } = cityLayers();
  const files = {
    "sun.svg": sunLayer(false),
    "sun-dusk.svg": sunLayer(true),
    "ridge.svg": ridgeLayer(false),
    "ridge-dusk.svg": ridgeLayer(true),
    "hills.svg": hillsLayer(),
    "farm.svg": farmLayer(),
    "city.svg": city,
    "lights.svg": lights,
    "foreground.svg": foregroundLayer(),
  };
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(OUT_DIR, name), content);
    const kb = (Buffer.byteLength(content) / 1024).toFixed(1);
    const flag = Buffer.byteLength(content) > 50 * 1024 ? "  <-- over 50 kB" : "";
    console.log(`public/scene/${name.padEnd(15)} ${kb.padStart(6)} kB${flag}`);
  }
}

main();
