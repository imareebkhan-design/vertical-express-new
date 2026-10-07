"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

const SCENES = [
  { title: "Build from the ground up.", detail: "Cement, steel & masonry", label: "Build", image: "/login/build-scene.webp", alt: "Illustrative construction scene with cement sacks, steel, bricks and building plans" },
  { title: "Make every room your own.", detail: "Tiles, paint, electrical & plumbing", label: "Finish", image: "/login/finish-scene.webp", alt: "Illustrative finishing materials with tiles, wood, paint, cable and fittings" },
  { title: "Equip every step of the work.", detail: "Power tools & accessories", label: "Equip", image: null, alt: "" },
] as const;
const TOOLS = [
  { slug: "xp-ic-002-angle-grinder-100mm", name: "HI-MAX IC-002 angle grinder" },
  { slug: "xp-ic-007-router-8-12mm", name: "HI-MAX IC-007 router" },
  { slug: "xp-xpt-413-marble-cutter-110mm", name: "XTRA POWER XPT-413 marble cutter" },
];

/**
 * Where a showcase tool photo is served from. These are official manufacturer
 * photographs (dealer use), so they are not committed to the public app
 * repository: deployed environments read them from the product-image bucket
 * (`<base>/login/<slug>.webp`); a local checkout without a bucket falls back to
 * the untracked copies in `public/login/`.
 */
export function toolImageSrc(slug: string, base = process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE): string {
  return base ? `${base.replace(/\/$/, "")}/login/${slug}.webp` : `/login/${slug}.webp`;
}

export function ProductShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReduced(media?.matches ?? true);
    const syncVisibility = () => setVisible(document.visibilityState === "visible");
    syncMotion(); syncVisibility();
    media?.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      media?.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);
  const playing = !paused && !hovered && !reduced && visible;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setActive(i => (i + 1) % SCENES.length), 6000);
    return () => window.clearInterval(timer);
  }, [playing]);
  const choose = (index: number) => {
    setPaused(true);
    setActive((index + SCENES.length) % SCENES.length);
  };
  return (
    <section className="ve-login-showcase" aria-label="Explore the construction catalogue" aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        if (!(event.target as HTMLElement).closest("[data-playback]")) setPaused(true);
      }}>
      <div className="ve-login-scene-window" aria-live={playing ? "off" : "polite"}>
        {SCENES.map((scene, index) => (
          <div key={scene.label} className="ve-login-scene" data-active={index === active}
            aria-hidden={index !== active} role="group" aria-roledescription="slide" aria-label={`${index + 1} of 3: ${scene.label}`}>
            {scene.image ? (
              <Image src={scene.image} alt={scene.alt} fill sizes="(max-width: 767px) 100vw, 60vw" priority={index === 0} className="ve-login-scene-image" />
            ) : (
              <div className="ve-login-tool-scene">
                {TOOLS.map((tool, i) => <div key={tool.slug} className={`ve-login-tool ve-login-tool-${i}`}>
                  <Image src={toolImageSrc(tool.slug)} alt={tool.name} fill sizes="(max-width: 767px) 40vw, 250px" className="ve-login-tool-image" />
                </div>)}
              </div>
            )}
            <div className="ve-login-scene-caption">
              <span>{scene.detail}</span>
              <h2>{scene.title}</h2>
            </div>
          </div>
        ))}
      </div>
      <div className="ve-login-carousel-bar">
        <div className="ve-login-scene-select" aria-label="Choose a catalogue scene">
          {SCENES.map((scene, index) => <button type="button" key={scene.label} aria-pressed={index === active}
            onClick={() => choose(index)}><span className="ve-login-indicator" aria-hidden />{scene.label}</button>)}
        </div>
        <div className="ve-login-transport">
          <button type="button" aria-label="Previous scene" onClick={() => choose(active - 1)}><ChevronLeft size={17} aria-hidden /></button>
          {!reduced && <button type="button" data-playback aria-label={paused ? "Play slideshow" : "Pause slideshow"} onClick={() => setPaused(p => !p)}>
            {paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
          </button>}
          <button type="button" aria-label="Next scene" onClick={() => choose(active + 1)}><ChevronRight size={17} aria-hidden /></button>
        </div>
      </div>
      <p className="ve-login-image-note">{active === 2 ? "Official tool photographs · catalogue preview" : "Illustrative material scene · explore the catalogue for product details"}</p>
    </section>
  );
}
