"use client";

import React from "react";

/**
 * The line-glyph set the app design uses on category tiles and product panels.
 *
 * Drawings of the material itself, at a consistent 2px stroke in translucent
 * ink — never a filled icon, never a photograph. The tile behind carries the
 * L1 group tint; the glyph stays neutral so one drawing works on all four.
 */
export type GlyphName =
  | "bag"
  | "tile"
  | "paint"
  | "wire"
  | "ply"
  | "pipe"
  | "tools"
  | "bulb"
  | "switch"
  | "clip";

const PATHS: Record<GlyphName, React.ReactNode> = {
  bag: (
    <>
      <path d="M6 3h12l2 6v12H4V9z" />
      <path d="M10 3v6h4V3" />
    </>
  ),
  tile: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </>
  ),
  paint: (
    <>
      <path d="M19 11V4a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v7" />
      <path d="M5 11h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
    </>
  ),
  wire: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  ply: (
    <>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 12l9 4 9-4" />
      <path d="M3 17l9 4 9-4" />
    </>
  ),
  pipe: (
    <>
      <path d="M4 6h16v12H4z" />
      <path d="M8 6v12" />
      <path d="M16 6v12" />
    </>
  ),
  tools: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  bulb: (
    <>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 5.5v1.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V14.5c1.5-1 3-3 3-5.5a7 7 0 0 0-7-7z" />
    </>
  ),
  switch: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  clip: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v3H9z" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </>
  ),
};

export function CategoryGlyph({
  name,
  className = "size-8",
}: {
  name: GlyphName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="rgba(17,17,17,.5)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
