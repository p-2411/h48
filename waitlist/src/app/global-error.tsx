"use client";

// Catches errors thrown by the root layout itself, where error.tsx can't help.
// It replaces the whole document, so it carries its own <html>, <body> and styles.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-AU">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#ffffff",
          color: "#1D2433",
          fontFamily: '"Helvetica Neue", Arial, sans-serif',
          padding: 24,
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ color: "#5B6372", margin: "0 0 24px", lineHeight: 1.5 }}>
            The page didn&apos;t load. Try again, and if it keeps happening, come back in a few minutes.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 52,
              padding: "0 28px",
              border: 0,
              borderRadius: 999,
              background: "#FF6010",
              color: "#ffffff",
              fontSize: 19,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
