"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Clock, Truck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/magnetic";
import { cn } from "@/lib/utils";

interface Slide {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  theme: "yellow" | "dark" | "light";
  bgImage?: string;
  /** Foreground product photo shown on slides without a full-bleed bgImage. */
  productImage?: string;
}

/* Placeholder slides standing in for the original banner artwork. */
const SLIDES: Slide[] = [
  {
    id: "delivery",
    eyebrow: "Srinagar's fastest",
    title: "Construction materials in 60 minutes",
    subtitle: "Cement, ply, hardware, paint & more — delivered to your site, superfast.",
    cta: "Shop now",
    theme: "yellow",
    bgImage: "/banner-delivery.jpg",
  },
  {
    id: "wires",
    eyebrow: "Wiring week",
    title: "Genuine wires & cables, trade prices",
    subtitle: "Top electrical brands in stock. Order by the coil or by the box.",
    cta: "Explore electrical",
    theme: "dark",
    bgImage: "/banner-wires.png",
  },
  {
    id: "kitchen",
    eyebrow: "New arrivals",
    title: "Kitchen sinks & fittings that last",
    subtitle: "Premium stainless steel sinks with 60-minute doorstep delivery.",
    cta: "Browse kitchen",
    theme: "light",
    productImage: "/products/ss-kitchen-sink.webp",
  },
];

const themeClasses: Record<Slide["theme"], string> = {
  yellow: "bg-gradient-to-br from-brand via-brand to-brand-dark text-ink",
  dark: "bg-gradient-to-br from-ink via-neutral-900 to-navy text-white",
  light: "bg-gradient-to-br from-surface via-white to-surface text-ink",
};

const AUTOPLAY_MS = 5000;

export function Hero() {
  const [[index, direction], setIndex] = useState<[number, number]>([0, 0]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback((dir: number) => {
    setIndex(([i]) => [(i + dir + SLIDES.length) % SLIDES.length, dir]);
  }, []);

  const resetTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    // Respect prefers-reduced-motion — stop autoplay for users who opted out of animations.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timer.current = setInterval(() => {
      // Skip autoplay while hidden: rAF is throttled, so animations would pile up frozen.
      if (!document.hidden) go(1);
    }, AUTOPLAY_MS);
  }, [go]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [resetTimer]);

  const slide = SLIDES[index];

  return (
    <section aria-label="Featured offers" className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={slide.id}
            custom={direction}
            initial={{ x: direction >= 0 ? "100%" : "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: direction >= 0 ? "-100%" : "100%" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => {
              if (slide.bgImage && window.innerWidth >= 768) {
                document.getElementById("deals")?.scrollIntoView({ behavior: "smooth" });
              }
            }}
            className={cn(
              "relative flex min-h-[320px] flex-col justify-center px-6 py-12 sm:min-h-[380px] sm:px-12 lg:min-h-[440px] lg:px-16 overflow-hidden",
              slide.bgImage && "md:cursor-pointer",
              themeClasses[slide.theme]
            )}
          >
            {slide.bgImage && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={slide.bgImage}
                alt={slide.title}
                className="hidden md:block absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            )}

            {/* Foreground product photo (slides without a full-bleed banner) */}
            {!slide.bgImage && (
              <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 items-center justify-center md:flex" aria-hidden>
                <div className="relative">
                  <div className="absolute -inset-10 rounded-full bg-white/30 blur-2xl" />
                  {slide.productImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={slide.productImage}
                      alt=""
                      className="relative max-h-72 w-auto object-contain drop-shadow-xl lg:max-h-96"
                      draggable={false}
                    />
                  ) : (
                    <Truck className="relative size-40 opacity-25 lg:size-56" strokeWidth={1} />
                  )}
                </div>
              </div>
            )}

            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
              }}
              className={cn("relative max-w-xl", slide.bgImage && "md:hidden")}
            >
              <motion.p
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
                }}
                className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1 text-xs font-extrabold uppercase tracking-widest backdrop-blur-sm"
              >
                <Zap className="size-3.5" aria-hidden /> {slide.eyebrow}
              </motion.p>
              <motion.h1
                variants={{
                  hidden: { opacity: 0, y: 28 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
                }}
                className="text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl"
              >
                {slide.title}
              </motion.h1>
              <motion.p
                variants={{
                  hidden: { opacity: 0, y: 24 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
                }}
                className="mt-4 max-w-md text-sm font-semibold opacity-80 sm:text-base"
              >
                {slide.subtitle}
              </motion.p>
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
                }}
                className="mt-7 flex flex-wrap items-center gap-4"
              >
                <Magnetic>
                  <Button
                    size="lg"
                    variant={slide.theme === "yellow" ? "dark" : "primary"}
                    onClick={() =>
                      document.getElementById("deals")?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    {slide.cta}
                  </Button>
                </Magnetic>
                <span className="inline-flex items-center gap-1.5 text-sm font-bold opacity-80">
                  <Clock className="size-4" aria-hidden /> Avg. delivery 60 min
                </span>
              </motion.div>
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {/* Controls */}
        <button
          onClick={() => {
            go(-1);
            resetTimer();
          }}
          aria-label="Previous slide"
          className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/80 text-ink shadow-card backdrop-blur transition-all hover:scale-110 hover:bg-white active:scale-95"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          onClick={() => {
            go(1);
            resetTimer();
          }}
          aria-label="Next slide"
          className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/80 text-ink shadow-card backdrop-blur transition-all hover:scale-110 hover:bg-white active:scale-95"
        >
          <ChevronRight className="size-5" />
        </button>

        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => {
                setIndex([i, i > index ? 1 : -1]);
                resetTimer();
              }}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              className={cn(
                "h-2 cursor-pointer rounded-full transition-all duration-300 ease-[var(--ease-brand)]",
                i === index ? "w-8 bg-ink" : "w-2 bg-ink/30 hover:bg-ink/50"
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
