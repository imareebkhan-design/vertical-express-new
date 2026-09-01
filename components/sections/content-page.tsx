import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";

export interface ContentSection {
  id: string;
  heading: string;
  /** Paragraphs. `**bold**` at the start of a paragraph renders as a lead-in. */
  body: string[];
  /**
   * Optional grouping, used by the FAQ.
   *
   * Ten questions in one undifferentiated list is a wall. The artboard sorts
   * them into Delivery, Payment, Material and genuineness, and Account and
   * business — because somebody arrives wondering about one of those four
   * things, not reading top to bottom.
   *
   * Optional on purpose: the policy pages are short enough to read straight
   * through and would be worse for being carved up.
   */
  group?: string;
}

/**
 * Shared shell for policy and informational pages.
 *
 * `pending` renders a prominent notice at the top. Several of these documents
 * contain values the owner has not confirmed — the return window, the COD
 * ceiling, the refund timeline. Rather than invent them or leave the footer
 * pointing at dead links, the structure is published with the unsettled parts
 * named openly. Anything in [square brackets] still needs a decision before the
 * page is fit to be relied on.
 */
export function ContentPage({
  title,
  intro,
  updated,
  sections,
  pending,
}: {
  title: string;
  intro?: string;
  updated?: string;
  sections: ContentSection[];
  pending?: string;
}) {
  /* Preserves author order and collapses runs of the same group, so the file
     stays the source of sequence rather than an alphabetical accident. */
  const grouped: { group?: string; items: ContentSection[] }[] = [];
  for (const section of sections) {
    const last = grouped[grouped.length - 1];
    if (last && last.group === section.group) last.items.push(section);
    else grouped.push({ group: section.group, items: [section] });
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 pb-4 pt-10 sm:px-6">
        <header className="max-w-3xl">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-[2.5rem] sm:leading-tight">
            {title}
          </h1>
          {intro && (
            <p className="mt-4 text-[15px] leading-relaxed font-medium text-ink-700">{intro}</p>
          )}
          {updated && (
            <p className="mt-4 inline-block rounded-full bg-chip px-3 py-1 text-[11px] font-bold text-ink-700">
              Last updated {updated}
            </p>
          )}
        </header>

        {pending && (
          <div className="mt-7 flex max-w-3xl items-start gap-3 rounded-[1.25rem] bg-amber-soft p-5">
            <AlertTriangle className="mt-0.5 size-5 flex-none" aria-hidden />
            <div>
              <p className="text-sm font-extrabold">This document is not final</p>
              <p className="mt-1.5 text-[13px] leading-relaxed font-medium text-ink-700">{pending}</p>
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr]">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24 rounded-[1.25rem] bg-white p-4 shadow-card">
              <p className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
                On this page
              </p>
              <ul>
                {grouped.map(({ group, items }) => (
                  <li key={group ?? "_"}>
                    {group && (
                      <p className="px-2 pb-1 pt-3 text-[10px] font-extrabold uppercase tracking-[0.09em] text-ink-300 first:pt-0">
                        {group}
                      </p>
                    )}
                    <ul>
                      {items.map((s) => (
                        <li key={s.id}>
                          <Link
                            href={`#${s.id}`}
                            className="block rounded-full px-2 py-1.5 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-hush"
                          >
                            {s.heading}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="max-w-3xl">
            {grouped.map(({ group, items }) => (
              <div key={group ?? "_"}>
                {group && (
                  <h2 className="mb-1 mt-2 text-[11px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
                    {group}
                  </h2>
                )}
                {items.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-28 pb-9">
                <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{s.heading}</h2>
                {s.body.map((p, i) => (
                  <p
                    key={i}
                    className="mt-4 text-[15px] leading-relaxed font-medium text-ink-700"
                  >
                    {p}
                  </p>
                ))}
              </section>
                ))}
              </div>
            ))}
          </div>
        </div>

        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}
