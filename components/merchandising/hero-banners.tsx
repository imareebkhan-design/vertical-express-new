"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { HERO_BANNERS, type HeroBanner } from "@/lib/merchandising/home";
import { MerchPicture } from "./merch-picture";

const ROTATE_MS = 6500;
/** Horizontal travel, in px, that counts as a swipe rather than a tap. */
const SWIPE_PX = 40;

/**
 * The homepage banner carousel.
 *
 * Copy and pictures come from `lib/merchandising/home.ts`. Behaviour follows
 * the login showcase's rules: it rotates only while nobody is engaging with it
 * — hover, keyboard focus, a hidden tab, a press of pause, or a reduced-motion
 * preference all stop it — and once somebody picks a slide it stays put.
 * Inactive slides are `inert`, so their links are neither focusable nor read.
 */
export function HeroBanners({ banners = HERO_BANNERS, compact = false }: { banners?: readonly HeroBanner[]; compact?: boolean }) {
  const count = banners.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Until the preference is read, assume reduced motion: never animate by default.
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(true);
  const swipeFrom = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReduced(media?.matches ?? true);
    const syncVisibility = () => setVisible(document.visibilityState === "visible");
    syncMotion();
    syncVisibility();
    media?.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      media?.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  const playing = count > 1 && !paused && !hovered && !focused && !reduced && visible;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setActive((i) => (i + 1) % count), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [playing, count]);

  const go = (index: number) => {
    setPaused(true);
    setActive(((index % count) + count) % count);
  };

  if (count === 0) return null;

  return (
    <section
      className="ve-hero"
      data-compact={compact}
      aria-roledescription="carousel"
      aria-label="Featured at Vertical Express"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(e) => {
        if (!(e.target as HTMLElement).closest("[data-playback]")) setFocused(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(active - 1);
        else if (e.key === "ArrowRight") go(active + 1);
      }}
    >
      <div
        className="ve-hero-window"
        aria-live={playing ? "off" : "polite"}
        onPointerDown={(e) => {
          swipeFrom.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const from = swipeFrom.current;
          swipeFrom.current = null;
          if (from === null) return;
          const dx = e.clientX - from;
          if (Math.abs(dx) >= SWIPE_PX) go(active + (dx < 0 ? 1 : -1));
        }}
        onPointerCancel={() => {
          swipeFrom.current = null;
        }}
      >
        {banners.map((b, i) => (
          <div
            key={b.id}
            className="ve-hero-slide"
            data-active={i === active}
            data-visual={b.visual.kind}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}: ${b.eyebrow}`}
            aria-hidden={i !== active}
            inert={i !== active}
          >
            <div className="ve-hero-visual">
              {b.visual.kind === "photo" ? (
                <MerchPicture
                  image={b.visual.image}
                  sizes="(max-width: 767px) 100vw, 1200px"
                  priority={i === 0}
                  fallback="var(--color-ink-700)"
                  className="ve-hero-photo"
                />
              ) : (
                <div className="ve-hero-collage">
                  {b.visual.images.map((img, n) => (
                    <div key={img.src} className={`ve-hero-card ve-hero-card-${n}`}>
                      <MerchPicture image={img} sizes="(max-width: 767px) 40vw, 260px" fit="contain" fallback="var(--color-ink-700)" />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="ve-hero-copy">
              <span className="ve-hero-eyebrow">{b.eyebrow}</span>
              <h2 className="ve-hero-title">{b.title}</h2>
              <p className="ve-hero-body">{b.body}</p>
              {b.offer ? <span className="ve-hero-offer">{b.offer}</span> : null}
              <div className="ve-hero-ctas">
                <Link href={b.primary.href} className="ve-hero-cta ve-hero-cta-primary">
                  {b.primary.label}
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
                {b.secondary ? (
                  <Link href={b.secondary.href} className="ve-hero-cta ve-hero-cta-secondary">
                    {b.secondary.label}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {count > 1 ? (
        <div className="ve-hero-controls">
          <div className="ve-hero-dots">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Show slide ${i + 1}: ${b.eyebrow}`}
                aria-current={i === active}
                onClick={() => go(i)}
              >
                <span aria-hidden />
              </button>
            ))}
          </div>
          <div className="ve-hero-transport">
            <button type="button" aria-label="Previous slide" onClick={() => go(active - 1)}>
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            {!reduced ? (
              <button
                type="button"
                data-playback
                aria-label={paused ? "Play slideshow" : "Pause slideshow"}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
              </button>
            ) : null}
            <button type="button" aria-label="Next slide" onClick={() => go(active + 1)}>
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
