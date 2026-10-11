import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";

import { site } from "@/config/site";

export const alt = `${site.name}: ${site.tagline} Coming soon. Join the waitlist.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SUN = "#FF6A13";
const INK = "#111111";
const SLATE = "#5f5f5f";
const LINE = "#e8e8e8";

const LABEL = "Coming soon · Join the waitlist";

/**
 * Fetches a static Archivo instance (TTF, the format the renderer needs) subset to `text`.
 * Any failure falls back to the renderer's built-in font, so the build never depends on
 * Google Fonts being reachable.
 */
async function loadArchivo(axes: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const query = `family=Archivo:${axes}&text=${encodeURIComponent(text)}`;
    const css = await fetch(`https://fonts.googleapis.com/css2?${query}`, { signal: AbortSignal.timeout(8000) }).then((r) =>
      r.ok ? r.text() : "",
    );
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    const font = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return font.ok ? await font.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/**
 * A network fetch is uncached data under Cache Components. At module scope it never settles during
 * prerendering, and every page that reads this file's metadata waits on it, so `next build` hangs.
 * `use cache` lets the fetch finish during the build, so the image stays static.
 */
async function loadFonts() {
  "use cache";
  cacheLife("max");

  const [wideBold, regular] = await Promise.all([
    loadArchivo("wght@600", `${site.name}${site.tagline}`),
    loadArchivo("wght@500", LABEL),
  ]);
  return [
    ...(wideBold ? [{ name: "Archivo", data: wideBold, weight: 600 as const, style: "normal" as const }] : []),
    ...(regular ? [{ name: "Archivo", data: regular, weight: 500 as const, style: "normal" as const }] : []),
  ];
}

/** "Go Solar. Without a roof." → ["Go Solar.", "Without a roof."] so each sentence gets its own line. */
const headlineLines = site.tagline.split(/(?<=\.)\s+/);

/** The logo mark (components/site/Logo.tsx, a 22-unit grid) drawn with boxes at `unit` px per grid unit. */
function Mark({ unit }: { unit: number }) {
  const square = (x: number) => (
    <div
      style={{
        position: "absolute",
        left: x * unit,
        top: 14 * unit,
        width: 5.5 * unit,
        height: 5.5 * unit,
        borderRadius: unit,
        background: INK,
      }}
    />
  );
  return (
    <div style={{ position: "relative", display: "flex", width: 22 * unit, height: 22 * unit }}>
      <div
        style={{
          position: "absolute",
          left: 11 * unit,
          top: 2 * unit,
          width: 8 * unit,
          height: 8 * unit,
          borderRadius: 9999,
          background: SUN,
        }}
      />
      {square(1)}
      {square(8.25)}
      {square(15.5)}
    </div>
  );
}

/** A sun disc centred at (1060, 90): mostly off the top-right corner, with two soft halo rings. */
function Sun() {
  const disc = (diameter: number, color: string) => (
    <div
      style={{
        position: "absolute",
        left: 1060 - diameter / 2,
        top: 90 - diameter / 2,
        width: diameter,
        height: diameter,
        borderRadius: 9999,
        background: color,
      }}
    />
  );
  return (
    <>
      {disc(900, "rgba(255, 106, 19, 0.07)")}
      {disc(700, "rgba(255, 106, 19, 0.12)")}
      {disc(500, SUN)}
    </>
  );
}

export default async function OpengraphImage() {
  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: "#ffffff",
          backgroundImage: "linear-gradient(180deg, #ffffff 55%, #fff4ec 100%)",
          fontFamily: "Archivo",
          color: INK,
        }}
      >
        <Sun />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: "64px 80px 72px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Mark unit={2.2} />
            <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.7 }}>{site.name}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", fontSize: 104, fontWeight: 600, lineHeight: 1.0, letterSpacing: -3.6 }}>
            {headlineLines.map((line, i) => (
              <div key={line} style={{ display: "flex", color: i === 0 ? INK : "#8a8a8a" }}>
                {line}
              </div>
            ))}
          </div>

          <div style={{ display: "flex" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 26px 12px 20px",
                borderRadius: 9999,
                border: `2px solid ${LINE}`,
                background: "#ffffff",
                fontSize: 28,
                fontWeight: 500,
                color: SLATE,
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: 9999, background: SUN }} />
              {LABEL}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
