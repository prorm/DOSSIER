"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#05070A", color: "#D7E4F0", fontFamily: "ui-monospace, monospace", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <p style={{ color: "#7F93A8", letterSpacing: "0.12em", fontSize: 12 }}>{"// SYSTEM FAULT"}</p>
          <h1 style={{ fontSize: 22, letterSpacing: "0.06em" }}>DOSSIER could not start this page</h1>
          <button onClick={reset} style={{ marginTop: 16, background: "#39FF88", color: "#03140b", border: 0, padding: "10px 16px", fontFamily: "inherit", cursor: "pointer" }}>
            RETRY
          </button>
        </div>
      </body>
    </html>
  );
}
