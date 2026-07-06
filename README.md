# Vertical Express — High-Fidelity Storefront

A production-quality recreation of a 60-minute construction-materials delivery storefront (layout and UX modeled on [home-run.co](https://home-run.co/)), rebranded as **Vertical Express**, serving Srinagar, Jammu & Kashmir. Built for educational purposes.

All proprietary imagery (banner artwork, product photos, brand logos, customer videos) is replaced with dimension-matched placeholders so real assets can drop in later. Marketing copy is original.

## Tech Stack

- **Next.js 15** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (CSS-first `@theme` configuration in `app/globals.css`)
- **Framer Motion** — reveals, staggers, carousels, popups, micro-interactions
- **GSAP + ScrollTrigger** — registered and synced with Lenis for scroll-driven work
- **Lenis** — smooth scrolling
- **Lucide Icons** — iconography and image fallbacks
- **shadcn/ui-style primitives** — `components/ui/*` built with `cva` + `tailwind-merge`

## Getting Started

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build
npm start         # serve production build
```

## Category Images

Category tiles load real product images from `public/categories/<slug>.webp`
(e.g. `cement.webp`, `tiling.webp`, `painting.webp` — full manifest in
`public/categories/README.txt`). **Missing images fall back to a clean
placeholder automatically**, so the layout never breaks. Drop in `.webp`
files with transparent or white backgrounds for best results.

## Project Structure

```
app/
  layout.tsx            # Karla font, metadata/SEO, Lenis + Cart providers
  page.tsx              # Homepage section order
  globals.css           # Design tokens (@theme), keyframes, base styles
components/
  sections/
    announcement-bar.tsx  # Rotating store messages (3.5s cycle)
    navbar.tsx            # Sticky header, search, pincode chip, cart, dropdowns, mobile drawer
    hero.tsx              # Autoplaying banner slideshow w/ directional slide transitions
    deals.tsx             # "Deals Of The Week" snap carousel w/ arrow controls
    categories.tsx        # "Top Categories" 20-tile product-image grid (6/4/2 cols)
    funding-banner.tsx    # Series-A milestone banner w/ scroll parallax
    app-banner.tsx        # App download CTA w/ store badges + phone mockup
    testimonials.tsx      # "Customers love Vertical Express" 9:16 video-reel cards
    trust-badges.tsx      # 4.9 rating / quality / pay-on-delivery
    footer.tsx            # Link columns, contact, newsletter form
  ui/                     # shadcn-style Button, Input, Badge
  category-card.tsx       # Image tile w/ Bulk Prices badge + missing-image fallback
  product-card.tsx        # Discount badge, prices, qty stepper, ADD
  floating-cart.tsx       # Springs in once cart has items
  welcome-popup.tsx       # One-time promo modal (sessionStorage)
  page-loader.tsx         # Brand loading screen, slides away on load
  reveal.tsx              # Reveal / Stagger / StaggerItem scroll animations
  magnetic.tsx            # Magnetic hover wrapper for CTAs
  placeholder-image.tsx   # Accessible stand-in for proprietary imagery
hooks/
  use-lenis.tsx           # Lenis provider wired to GSAP ScrollTrigger
  use-cart.tsx            # Cart context (lines, count, total)
  use-scrolled.ts         # Header shadow-on-scroll
lib/
  data.ts                 # Nav, categories, deals, testimonials, footer content
  utils.ts                # cn(), INR formatting
public/
  categories/             # Drop category product images here (<slug>.webp)
```

## Design Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--color-brand` | `#EFC41A` | Primary yellow (buttons, badges, accents) |
| `--color-brand-deep` | `#816809` | Yellow-contrast text |
| `--color-ink` | `#0A0A0A` | Foreground / dark surfaces |
| `--color-navy` | `#0E1B4D` | Secondary accent (funding banner) |
| `--color-surface` | `#EFF0F5` | Light section backgrounds |
| `--color-tile` | `#EEF9FB` | Category tile background |

**Font:** [Karla](https://fonts.google.com/specimen/Karla) (weights 300–800) via `next/font`.

**Motion:** primary easing `cubic-bezier(0.22, 1, 0.36, 1)`; reveals 0.55–0.7s; card hovers 300ms; carousel slides 0.6s; all animation respects `prefers-reduced-motion`.

## Responsive Behavior

- **Desktop (lg+):** full search bar, pincode chip, category nav with hover dropdowns, 6-col category grid
- **Tablet (md):** hamburger drawer, 4-col category grid, carousels with snap scrolling
- **Mobile:** 2-col category grid, edge-to-edge snap carousels, full-width floating cart
