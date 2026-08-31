"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Check, Home, Ruler } from "lucide-react";
import { setBuyerType } from "@/actions/profile";
import { triggerHaptic } from "@/lib/native/haptics";

/**
 * "I'm a…" — artboard 3, the third step of the app's way in.
 *
 * One question, and it decides what the home screen leads with: a contractor
 * gets reorder and bulk quantities, a homeowner gets rooms and the quantity
 * helpers. It is not a permission — everyone may do exactly the same things —
 * which is why it writes `Profile.buyerType` and not `User.role`.
 *
 * Skippable on purpose. Nobody should be unable to buy cement because they did
 * not want to say what they do for a living, so the column is nullable and the
 * screen has a way past it.
 */
type Choice = "contractor" | "homeowner" | "designer";

const OPTIONS: { value: Choice; title: string; note: string; tint: string; Icon: typeof Home }[] = [
  {
    value: "contractor",
    title: "Contractor / Site supervisor",
    note: "Reorder, saved lists and bulk quantities first.",
    tint: "bg-tint-civil",
    Icon: ClipboardList,
  },
  {
    value: "homeowner",
    title: "Homeowner renovating",
    note: "Browse by room, with help working out quantities.",
    tint: "bg-tint-furniture",
    Icon: Home,
  },
  {
    value: "designer",
    title: "Interior designer or architect",
    note: "Finishes, samples and per-client project lists.",
    tint: "bg-tint-plumbing",
    Icon: Ruler,
  },
];

export function RoleSelectView({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!choice) return;
    triggerHaptic("medium");
    start(async () => {
      const res = await setBuyerType({ buyerType: choice });
      /* A failure here must not trap somebody in onboarding. The answer is a
         preference; losing it costs a slightly worse home screen, not access. */
      if (!res.ok) setError("We couldn't save that. You can set it later in Account.");
      router.push(next);
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* Three steps: number, code, this. */}
      <div className="flex items-center justify-center gap-1.5 pt-4" aria-hidden>
        <span className="h-[5px] w-[22px] rounded-[3px] bg-ink" />
        <span className="h-[5px] w-[22px] rounded-[3px] bg-ink" />
        <span className="h-[5px] w-[22px] rounded-[3px] bg-chip" />
      </div>

      <div className="px-5 pt-9">
        <p className="text-[14px] font-medium text-ink-500">One question, then you&apos;re in.</p>
        <h1 className="mt-1.5 text-[32px] font-extrabold leading-[36px] tracking-[-0.03em] text-ink">
          <span className="font-light text-ink-500">I&apos;m a</span>…
        </h1>
        <p className="mt-2.5 max-w-[305px] text-[14px] font-medium leading-5 text-ink-700">
          This sets what your home screen leads with. You can change it any time in Account.
        </p>
      </div>

      <div className="flex flex-col gap-3 px-5 pt-6">
        {OPTIONS.map(({ value, title, note, tint, Icon }) => {
          const selected = choice === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                triggerHaptic("light");
                setChoice(value);
              }}
              className={
                "flex items-center gap-3.5 rounded-[26px] bg-paper p-4 text-left shadow-card transition-shadow " +
                (selected ? "ring-[2.5px] ring-ink" : "")
              }
            >
              <span
                className={`flex size-14 flex-none items-center justify-center rounded-[19px] ${tint}`}
                aria-hidden
              >
                <Icon className="size-7 text-ink/50" strokeWidth={1.5} />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-extrabold leading-5 text-ink">{title}</span>
                <span className="mt-1 block text-[13px] font-medium leading-[17px] text-ink-700">
                  {note}
                </span>
              </span>
              <span
                className={
                  "flex size-7 flex-none items-center justify-center rounded-full " +
                  (selected ? "bg-ink text-white" : "bg-chip text-transparent")
                }
                aria-hidden
              >
                <Check className="size-[15px]" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="px-5 pt-4 text-[13px] font-semibold text-ink">
          {error}
        </p>
      )}

      <div className="flex-1" />

      <div className="space-y-3 px-5 pb-8 pt-6">
        <button
          type="button"
          onClick={submit}
          disabled={!choice || pending}
          className="h-[54px] w-full rounded-full bg-ink text-[15px] font-bold text-white disabled:opacity-50"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={() => router.push(next)}
          className="w-full text-[13px] font-bold text-ink-500"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
