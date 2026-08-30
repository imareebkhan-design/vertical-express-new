"use client";

import React from "react";
import Image from "next/image";
import { Zap, Truck } from "lucide-react";
import { speedLabel, type SpeedClass } from "@/components/ui/speed-chip";

/**
 * Login hero — six products on one seamless 15-second loop.
 *
 * Ported from the `HeroEmbed` half of the Claude Design `Login Hero Animation`
 * artboard ("bare loop for the login screen — no stage chrome, own clock"). The
 * artboard's other export, `HeroStage`, wraps this in the design tool's
 * timeline and tweaks panel; none of that runtime ships here.
 *
 * Every dimension is a fraction of the stage height, so the scene scales to
 * whatever box the parent gives it — a wide panel beside the desktop form, a
 * short band above the mobile one.
 *
 * The delivery chips take their wording from `speedLabel`, the same source the
 * real `SpeedChip` uses. The authored design captioned the cement bag
 * "Tomorrow, 8 AM"; slot selection does not exist, so that window would be a
 * promise the backend cannot keep, and it renders as "Heavy — by truck" like
 * every other surface.
 */

const TOK = {
  canvas: "#F3F2F0",
  ink: "#111111",
  amber: "#EDAF1C",
  muted: "#8B8781",
  chip: "#EDEBE7",
} as const;

interface HeroProduct {
  src: string;
  /** Intrinsic width ÷ height, so the cutout never distorts. */
  ar: number;
  /** Share of the panel height the cutout occupies. */
  fill: number;
  brand: string;
  name: string;
  speed: SpeedClass;
}

const PLACEHOLDER = "/placeholder-product.webp";

/**
 * Material categories, not products (ISS-044).
 *
 * This carousel previously showed six manufacturer product photographs and named
 * them in text — ACC Suraksha Power, Dr. Fixit Pidiproof LW+ 101, Polycab Optima+,
 * Asian Paints Tractor Uno and SmartCare, Loctite General Purpose Sealant. None of
 * those products exist in our catalogue, and we hold no authorization for the marks
 * or the photography, so the login screen was advertising other companies' goods.
 *
 * What is left is deliberately generic: a material category and a neutral shape. No
 * brand is named, no specific product is claimed, and the delivery speeds are the
 * ones the catalogue already models. The scales vary per slot so the sequence still
 * reads as a composition rather than a repeat.
 */
const PRODUCTS: HeroProduct[] = [
  { src: PLACEHOLDER, ar: 1, fill: 0.62, brand: "CEMENT", name: "Bagged cement", speed: "scheduled" },
  { src: PLACEHOLDER, ar: 1, fill: 0.5, brand: "WATERPROOFING", name: "Waterproofing compounds", speed: "express" },
  { src: PLACEHOLDER, ar: 1, fill: 0.7, brand: "ELECTRICAL", name: "Wires & cables", speed: "express" },
  { src: PLACEHOLDER, ar: 1, fill: 0.55, brand: "PAINT", name: "Interior & exterior paint", speed: "express" },
  { src: PLACEHOLDER, ar: 1, fill: 0.66, brand: "HARDWARE", name: "Adhesives & sealants", speed: "express" },
  { src: PLACEHOLDER, ar: 1, fill: 0.58, brand: "PLUMBING", name: "Pipes & fittings", speed: "scheduled" },
];

const TOTAL_SECONDS = 15;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const wave = (period: number, phase = 0) => (t: number) =>
  Math.sin((t / period + phase) * Math.PI * 2);
const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

function Chip({ speed, h }: { speed: SpeedClass; h: number }) {
  const express = speed === "express";
  const Icon = express ? Zap : Truck;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: h * 0.013,
        borderRadius: 999,
        padding: `${h * 0.017}px ${h * 0.04}px`,
        background: express ? TOK.ink : TOK.chip,
        color: express ? "#fff" : TOK.ink,
        fontSize: h * 0.042,
        fontWeight: 700,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        boxShadow: `0 ${h * 0.008}px ${h * 0.026}px rgba(17,17,17,0.05)`,
      }}
    >
      <Icon
        aria-hidden
        style={{
          width: h * 0.05,
          height: h * 0.05,
          color: express ? TOK.amber : "currentColor",
          fill: express ? TOK.amber : "none",
        }}
      />
      {speedLabel(speed)}
    </div>
  );
}

function Scene({ T, width: W, height: H }: { T: number; width: number; height: number }) {
  const N = PRODUCTS.length;
  const seg = TOTAL_SECONDS / N;
  const f = T / seg;
  const hold = 0.66; // fraction of a segment parked at centre
  const frac = f - Math.floor(f);
  const shift = Math.floor(f) + easeInOut(clamp((frac - hold) / (1 - hold), 0, 1));

  const slots = PRODUCTS.map((p, i) => {
    const half = N / 2;
    const raw = (((i - shift + half) % N) + N) % N - half;
    const a = Math.abs(raw);
    return { p, i, raw, a, near: clamp(1 - a, 0, 1) };
  })
    .filter((s) => s.a < 1.6)
    .sort((s1, s2) => s2.a - s1.a);

  const turn = wave(seg, -0.25)(T) * 10;
  const breathe = 1 + wave(seg / 2, 0.1)(T) * 0.009;
  const panelH = H * 0.62;
  const panelW = panelH * 0.92;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: TOK.canvas }}>
      <div
        style={{
          position: "absolute", left: "50%", top: "42%",
          width: H * 1.5, height: H * 1.5,
          marginLeft: -H * 0.75, marginTop: -H * 0.75, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0) 62%)",
        }}
      />

      {slots.map(({ p, i, raw, a, near }) => {
        const imgH = panelH * p.fill;
        const imgW = imgH * p.ar;
        const centred = clamp((near - 0.8) / 0.2, 0, 1);
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: "50%", top: "50%",
              width: panelW, height: panelH,
              marginLeft: -panelW / 2, marginTop: -panelH / 2 - H * 0.055,
              transform: `translateX(${raw * W * 0.46}px) scale(${
                (1 - Math.min(a, 1.5) * 0.26) * (0.99 + centred * (breathe - 0.99))
              })`,
              opacity: clamp(1 - a * 0.8, 0, 1),
              filter: near > 0.72 ? "none" : `blur(${(1 - near) * 1.8}px)`,
            }}
          >
            <div
              style={{
                position: "absolute", left: "50%", bottom: panelH * 0.14,
                width: imgW * 1.05, height: imgH * 0.11, marginLeft: -imgW * 0.525,
                borderRadius: "50%", filter: `blur(${H * 0.02}px)`, opacity: 0.5 + near * 0.5,
                background: "radial-gradient(ellipse, rgba(17,17,17,0.32) 0%, rgba(17,17,17,0) 70%)",
              }}
            />
            <div
              style={{
                position: "absolute", left: "50%", top: "50%",
                width: imgW, height: imgH,
                marginLeft: -imgW / 2, marginTop: -imgH / 2 - panelH * 0.03,
                transform: `perspective(${H * 3}px) rotateY(${turn * centred}deg)`,
                filter: `drop-shadow(0 ${H * 0.028}px ${H * 0.032}px rgba(17,17,17,0.16))`,
              }}
            >
              <Image
                src={p.src}
                alt=""
                fill
                sizes="(max-width: 768px) 40vw, 320px"
                priority={i === 0}
                style={{ objectFit: "contain" }}
              />
            </div>
            <div
              style={{
                position: "absolute", left: "50%", bottom: -H * 0.025,
                transform: "translateX(-50%)",
                opacity: clamp((near - 0.78) / 0.16, 0, 1),
              }}
            >
              <Chip speed={p.speed} h={H} />
            </div>
          </div>
        );
      })}

      {slots.map(({ p, i, near }) => (
        <div
          key={"t" + i}
          style={{
            position: "absolute", left: 0, right: 0, bottom: H * 0.045,
            display: "flex", flexDirection: "column", alignItems: "center", gap: H * 0.012,
            opacity: clamp((near - 0.86) / 0.1, 0, 1),
            textAlign: "center", pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: H * 0.036, fontWeight: 700, letterSpacing: "0.1em", color: TOK.muted }}>
            {p.brand}
          </div>
          <div
            style={{
              fontSize: H * 0.052, fontWeight: 700, color: TOK.ink,
              letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums",
            }}
          >
            {p.name}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoginHero({ className }: { className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const [T, setT] = React.useState(0);

  // The scene sizes everything off its box, so it has to measure rather than
  // assume the authored 780×520.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure once up front so the first commit already has a box; the observer
    // then only handles resizes.
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setBox({ w: r.width, h: r.height });
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The global reduced-motion rule collapses CSS animations but cannot stop a
  // rAF loop, so the clock checks for itself and holds on the first frame.
  // It also parks while the tab is hidden — this runs on mid-tier Android.
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let start: number | null = null;

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      start = null;
    };

    const tick = (ts: number) => {
      if (start === null) start = ts;
      setT(((ts - start) / 1000) % TOTAL_SECONDS);
      raf = requestAnimationFrame(tick);
    };

    const sync = () => {
      stop();
      if (mq.matches) {
        setT(0);
        return;
      }
      if (document.visibilityState === "visible") raf = requestAnimationFrame(tick);
    };

    sync();
    mq.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      mq.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      aria-hidden
      style={{ position: "relative", overflow: "hidden", background: TOK.canvas }}
    >
      {box.w > 0 && box.h > 0 && <Scene T={T} width={box.w} height={box.h} />}
    </div>
  );
}
