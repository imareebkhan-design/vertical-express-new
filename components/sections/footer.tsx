"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Mail, MapPin, Zap } from "lucide-react";
import { CONTACT, FOOTER_LINKS } from "@/lib/data";
import { Reveal } from "@/components/reveal";

function LinkColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <nav aria-label={title}>
      <h2 className="mb-4 text-sm font-extrabold uppercase tracking-widest text-brand">
        {title}
      </h2>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="group inline-flex items-center gap-1 text-sm font-semibold text-white/70 transition-colors duration-200 hover:text-white"
            >
              <span className="block h-px w-0 bg-brand transition-all duration-300 ease-[var(--ease-brand)] group-hover:w-3" />
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  return (
    <footer id="contact" className="bg-ink text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <Reveal direction="up" delay={0}>
          <LinkColumn title="Company" links={FOOTER_LINKS.company} />
        </Reveal>
        <Reveal direction="up" delay={0.08}>
          <LinkColumn title="Policy" links={FOOTER_LINKS.policy} />
        </Reveal>
        <Reveal direction="up" delay={0.16}>
          <div>
            <h2 className="mb-4 text-sm font-extrabold uppercase tracking-widest text-brand">
              Contact Information
            </h2>
            <address className="space-y-3 text-sm font-semibold not-italic text-white/70">
              <p className="flex items-start gap-2">
                <Mail className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <a href={`mailto:${CONTACT.email}`} className="hover:text-white">
                  {CONTACT.email}
                </a>
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                {CONTACT.address}
              </p>
            </address>
          </div>
        </Reveal>
        <Reveal direction="up" delay={0.24}>
          <div>
            <h2 className="mb-4 text-sm font-extrabold leading-snug">
              Get a first peek at New Products, Special Offers, and so much more.
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) setSubscribed(true);
              }}
              className="relative"
            >
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                disabled={subscribed}
                className="h-12 w-full rounded-full border border-white/20 bg-white/5 pl-5 pr-14 text-sm font-semibold placeholder:text-white/40 transition-colors focus:border-brand focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                aria-label="Subscribe"
                disabled={subscribed}
                className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-brand text-ink transition-transform duration-200 hover:scale-110 active:scale-95"
              >
                {subscribed ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
              </button>
            </form>
            <p aria-live="polite" className="mt-2 h-4 text-xs font-bold text-brand">
              {subscribed && "You're on the list! 🎉"}
            </p>
          </div>
        </Reveal>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs font-semibold text-white/50 sm:flex-row sm:px-6">
          <p className="flex items-center gap-1.5">
            <span className="grid size-5 place-items-center rounded bg-brand">
              <Zap className="size-3 fill-ink text-ink" aria-hidden />
            </span>
            © {new Date().getFullYear()}, Vertical Express — recreated for educational purposes
          </p>
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {FOOTER_LINKS.policy.slice(0, 4).map((link) => (
              <li key={link.label}>
                <Link href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
