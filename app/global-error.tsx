"use client";

import { useEffect } from "react";

/**
 * global-error.tsx — catches errors in the root layout itself.
 * Must render its own <html> and <body> since the layout may be broken.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          background: "#f9f9f9",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <span style={{ fontSize: "3rem" }}>⚠️</span>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#111" }}>
          Something went wrong
        </h1>
        <p style={{ maxWidth: "24rem", fontSize: "0.875rem", color: "#666" }}>
          A critical error occurred. Please try again or contact support.
        </p>
        {error?.digest && (
          <p style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#999" }}>
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            padding: "0.6rem 1.5rem",
            background: "#FFD600",
            border: "none",
            borderRadius: "9999px",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
