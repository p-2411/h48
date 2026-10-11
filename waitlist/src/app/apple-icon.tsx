import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const SUN = "#FF6A13";
const INK = "#1D2433";

// The logo mark (see components/site/Logo.tsx, drawn on a 22-unit grid) scaled into a 180px tile.
// iOS rounds the corners itself, so the tile is a plain white square with the mark centred.
const UNIT = 5.4;
const OFFSET_X = (180 - 20 * UNIT) / 2 - UNIT; // the mark spans x 1→21
const OFFSET_Y = (180 - 17.5 * UNIT) / 2 - 2 * UNIT; // and y 2→19.5

function square(x: number) {
  return {
    position: "absolute" as const,
    left: OFFSET_X + x * UNIT,
    top: OFFSET_Y + 14 * UNIT,
    width: 5.5 * UNIT,
    height: 5.5 * UNIT,
    borderRadius: UNIT,
    background: INK,
  };
}

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", background: "#ffffff" }}>
        <div
          style={{
            position: "absolute",
            left: OFFSET_X + 11 * UNIT,
            top: OFFSET_Y + 2 * UNIT,
            width: 8 * UNIT,
            height: 8 * UNIT,
            borderRadius: 9999,
            background: SUN,
          }}
        />
        <div style={square(1)} />
        <div style={square(8.25)} />
        <div style={square(15.5)} />
      </div>
    ),
    size,
  );
}
