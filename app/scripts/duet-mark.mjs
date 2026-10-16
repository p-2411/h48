// The Duet mark, as geometry. One definition shared by the icon generator and the design pages.
//
// Locked design: pill eyes with smiling (lifted) lower lids, short pupils converged slightly toward
// the nose so the face looks at you, and a soft pen-stroke smile set 3 units left of centre. Every
// shape carries small deliberate imperfections so it reads as drawn: a slow wobble on the outlines,
// the two eyes and pupils a little different, the smile heavier where the pen lands.
//
// Everything is drawn in a 100 × 100 box. Each shape is one closed outline, sampled evenly along its
// length and joined with a centripetal Catmull-Rom spline, so curves stay smooth at any size and
// shapes never overlap themselves (no seams, kinks or facets).

export const PALETTES = {
  light: { bg: '#F6F7F6', eyeL: '#17211F', eyeR: '#18221F', pupil: '#F6F7F6', mouth: '#3A4644', rim: ['#1D3F46', 0.08, 1] },
  dark: { bg: '#080D0D', eyeL: '#EDF6F4', eyeR: '#EFF7F5', pupil: '#080D0D', mouth: '#C6DDD9', rim: ['#FFFFFF', 0.09, 1.2] }
}

const n2 = (n) => (Math.round(n * 100) / 100).toString()

// ---------- Curves ----------

// A closed centripetal Catmull-Rom spline through the points, as cubic Béziers. Centripetal
// parametrisation never overshoots or loops, even where the points are unevenly spaced.
function closedPath(pts) {
  const n = pts.length
  const d = (a, b) => Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5, 1e-6)
  let s = `M${n2(pts[0][0])} ${n2(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    const A = d(p0, p1), B = d(p1, p2), C = d(p2, p3)
    const c1 = [0, 1].map((k) => (A * A * p2[k] - B * B * p0[k] + (2 * A * A + 3 * A * B + B * B) * p1[k]) / (3 * A * (A + B)))
    const c2 = [0, 1].map((k) => (C * C * p1[k] - B * B * p3[k] + (2 * C * C + 3 * C * B + B * B) * p2[k]) / (3 * C * (C + B)))
    s += ` C${n2(c1[0])} ${n2(c1[1])} ${n2(c2[0])} ${n2(c2[1])} ${n2(p2[0])} ${n2(p2[1])}`
  }
  return s + 'Z'
}

// Resample a dense closed polyline to `m` points spaced evenly along its length.
function resample(dense, m) {
  const len = [0]
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length]
    len.push(len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  const total = len[dense.length], out = []
  let j = 0
  for (let k = 0; k < m; k++) {
    const target = (k / m) * total
    while (len[j + 1] < target) j++
    const a = dense[j], b = dense[(j + 1) % dense.length], t = (target - len[j]) / (len[j + 1] - len[j] || 1)
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return out
}

// A superellipse with a slow wobble along its edge. `cheek` lifts the lower half (smiling eyes);
// it fades in from the sides, so the outline has no kink where the lift starts.
function eye(cx, cy, a, b, rot, seed, cheek, n = 3.1, amp = 0.012) {
  const dense = [], r = (rot * Math.PI) / 180
  for (let i = 0; i < 720; i++) {
    const t = (i / 720) * Math.PI * 2, co = Math.cos(t), si = Math.sin(t)
    const w = 1 + amp * (0.6 * Math.sin(2 * t + seed) + 0.3 * Math.sin(3 * t + seed * 1.7) + 0.2 * Math.sin(5 * t + seed * 2.3))
    const lift = si > 0 ? 1 - cheek * si : 1
    const x = a * w * Math.sign(co) * Math.abs(co) ** (2 / n), y = b * w * Math.sign(si) * Math.abs(si) ** (2 / n) * lift
    dense.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)])
  }
  return resample(dense, 96)
}

// How a stroke swells from its ends (0) to its middle (1). Shaped like sin(πu)^0.7, but eased so
// its slope is zero at the ends; otherwise the outline turns a corner where it meets the round
// cap and the cap reads as a knob.
const EASE = 0.3, E0 = EASE ** 0.7, E1 = (1 + EASE ** 2) ** 0.35
const swell = (u) => (((Math.sin(Math.PI * u) ** 2 + EASE ** 2) ** 0.35) - E0) / (E1 - E0)

// A pen stroke along a quadratic centre line, as one closed outline: fullest in the middle,
// tapering toward round ends, heavier where the pen lands (bias > 0 means the start is heavier).
function stroke(P0, P1, P2, base, endRatio, bias) {
  const N = 40, L = [], R = [], C = []
  for (let i = 0; i <= N; i++) {
    const u = i / N, v = 1 - u
    const x = v * v * P0[0] + 2 * u * v * P1[0] + u * u * P2[0], y = v * v * P0[1] + 2 * u * v * P1[1] + u * u * P2[1]
    const dx = 2 * v * (P1[0] - P0[0]) + 2 * u * (P2[0] - P1[0]), dy = 2 * v * (P1[1] - P0[1]) + 2 * u * (P2[1] - P1[1])
    const len = Math.hypot(dx, dy)
    const w = (base * (endRatio + (1 - endRatio) * swell(u)) * (1 + (bias / 2) * Math.cos(Math.PI * u))) / 2
    C.push([x, y, dx / len, dy / len, w])
    L.push([x - (dy / len) * w, y + (dx / len) * w])
    R.push([x + (dy / len) * w, y - (dx / len) * w])
  }
  // Round caps: a half circle around each end. The outline runs down the left side, around the far
  // end, back up the right side and around the near end, so both caps turn the same way.
  const cap = ([x, y, tx, ty, w], start) => {
    const pts = [], a0 = Math.atan2(ty, tx) + start
    for (let k = 1; k < 12; k++) {
      const a = a0 - (k / 12) * Math.PI
      pts.push([x + Math.cos(a) * w, y + Math.sin(a) * w])
    }
    return pts
  }
  return [...L, ...cap(C[N], Math.PI / 2), ...R.reverse(), ...cap(C[0], -Math.PI / 2)]
}

// ---------- The face ----------

// The face's shapes, centred in the 100 box. `small` is the version for 32 px and below: thicker
// pupils and smile, and slightly larger. `scale` enlarges the whole face.
export function faceShapes(c, { small = false, scale = 1 } = {}) {
  const cy = 45.5, cheek = 0.22
  const lift = cheek * 14.5 * 0.45 // the pupils follow the eyes' new optical centre
  const converge = 1.5
  const pw = small ? 6 : 5, pc = (small ? 10.5 : 9) / 2 - pw / 2
  // Pupils are shorter than they are wide, so a middle swell would bulge past the round ends; they
  // stay nearly even, and get their hand-drawn feel from the heavier end, the tilt and the arch.
  const dab = (x, y, len, w, tilt, arch, bias) => stroke([x - len, y + tilt], [x, y - arch], [x + len, y - tilt], w, 0.97, bias)
  const mx = 47, y0 = 67.5
  const shapes = [
    // Eyes: the right one is 1.5% wider, a hair shorter, a little lower and tilted the other way.
    { part: 'eyes', fill: c.eyeL, pts: eye(30.5, cy, 17.5, 14.5, -0.3, 1.3, cheek) },
    { part: 'eyes', fill: c.eyeR, pts: eye(69.6, cy + 0.15, 17.5 * 1.015, 14.5 * 0.992, 0.8, 4.1, cheek) },
    // Pupils: marker dabs, converged toward the nose, differing slightly in length, weight and angle.
    { part: 'features', fill: c.pupil, pts: dab(30.5 + converge, cy - lift, pc * 0.97, pw, 0.1, 0.12, 0.1) },
    { part: 'features', fill: c.pupil, pts: dab(69.6 + 0.12 - converge, cy - lift - 0.1, pc * 1.06, pw * 1.04, -0.08, 0.04, -0.08) },
    // Smile: 3 units left of centre, lands heavier on the left and lifts off higher on the right.
    { part: 'features', fill: c.mouth, pts: stroke([mx - 4.8, y0 + 0.1], [mx - 0.4, y0 + 4.02], [mx + 4.6, y0 - 0.42], small ? 4.3 : 3.3, 0.5, 0.28) }
  ]
  // Centre the whole face on (50, 50) and scale it, baked into the coordinates.
  const all = shapes.flatMap((s) => s.pts)
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1])
  const bx = (Math.min(...xs) + Math.max(...xs)) / 2, by = (Math.min(...ys) + Math.max(...ys)) / 2
  const s = 1.07 * (small ? 1.08 : 1) * scale
  return shapes.map((sh) => ({ ...sh, d: closedPath(sh.pts.map(([x, y]) => [50 + (x - bx) * s, 50 + (y - by) * s])) }))
}

export const face = (c, opts) => faceShapes(c, opts).map((s) => `<path d="${s.d}" fill="${s.fill}"/>`).join('')

// ---------- Tiles ----------

// macOS: a continuous-curve squircle. Windows: a plain rounded square, since Windows 11 doesn't
// mask app icons to one shape.
export const SQUIRCLE = (() => {
  const dense = []
  for (let i = 0; i < 1440; i++) {
    const t = (i / 1440) * Math.PI * 2, co = Math.cos(t), si = Math.sin(t)
    dense.push([50 + 50 * Math.sign(co) * Math.abs(co) ** 0.4, 50 + 50 * Math.sign(si) * Math.abs(si) ** 0.4])
  }
  return closedPath(resample(dense, 128))
})()
export const ROUNDED = 'M19 0H81A19 19 0 0 1 100 19V81A19 19 0 0 1 81 100H19A19 19 0 0 1 0 81V19A19 19 0 0 1 19 0Z'

export function tile(c, { shape = SQUIRCLE, small = false } = {}) {
  const [rimColour, rimOpacity, rimWidth] = c.rim
  return `<path d="${shape}" fill="${c.bg}"/>` +
    `<path d="${shape}" fill="none" stroke="${rimColour}" stroke-opacity="${rimOpacity}" stroke-width="${rimWidth}"/>` +
    face(c, { small, scale: shape === ROUNDED ? 1.04 : 1 })
}
