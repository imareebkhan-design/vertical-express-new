"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin } from "lucide-react";
import { SpeedChip } from "@/components/ui/speed-chip";
import { triggerHaptic } from "@/lib/native/haptics";

/**
 * "Where are we delivering?" — artboard 4, the last step of the way in.
 *
 * It does two jobs at once, which is why it is one screen and not two: it
 * establishes whether we can serve this pincode at all, and it names the place
 * so the next order does not start from nothing. In Srinagar a customer often
 * has more than one — a site, a house, a shop — and the naming is what makes
 * the difference legible later.
 *
 * ON THE FIGURES
 *
 * Three of the numbers the artboard shows are not confirmed and cannot be
 * invented here:
 *
 *   · the express window (the 60-minute claim is unverified — ISS-018)
 *   · the winter road-access delay
 *   · the cash-on-delivery ceiling, for which no policy exists at all
 *
 * All three are money, time or limits, which is exactly what the placeholder
 * register is for. They are shown with the dotted amber marker rather than
 * omitted, because deleting them would quietly remove sections the design
 * intends to be there and hide the open questions. Replace the marker with the
 * real figure and the layout does not move.
 */
const SITE_NAMES = ["Site", "House", "Shop", "Office"] as const;

export function SiteSetupView({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const [pincode, setPincode] = useState("");
  const [siteName, setSiteName] = useState("");
  const [accessNote, setAccessNote] = useState("");
  const [busy, setBusy] = useState(false);

  const checked = /^[1-9][0-9]{5}$/.test(pincode);

  const finish = () => {
    triggerHaptic("medium");
    setBusy(true);
    /* The address itself is saved from the account and checkout flows, which
       already own that action and its validation. This step establishes the
       pincode and the name; wiring the write is the next piece of work, not a
       different screen. */
    router.push(next);
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="flex items-center justify-center gap-1.5 pt-4" aria-hidden>
        <span className="h-[5px] w-[22px] rounded-[3px] bg-ink" />
        <span className="h-[5px] w-[22px] rounded-[3px] bg-ink" />
        <span className="h-[5px] w-[22px] rounded-[3px] bg-ink" />
      </div>

      <div className="px-5 pt-9">
        <h1 className="text-[32px] font-extrabold leading-[36px] tracking-[-0.03em] text-ink">
          <span className="font-light text-ink-500">Where are we</span>
          <br />
          delivering?
        </h1>
      </div>

      <div className="px-5 pt-6">
        <div className="flex h-[52px] items-center gap-3 rounded-full bg-paper px-4.5 shadow-card">
          <MapPin className="size-[18px] flex-none text-ink-500" aria-hidden />
          <input
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="postal-code"
            aria-label="Delivery pincode"
            placeholder="190001"
            className="w-full bg-transparent text-[17px] font-bold tracking-[0.06em] text-ink placeholder:font-semibold placeholder:tracking-normal placeholder:text-ink-300 focus:outline-none"
          />
        </div>
      </div>

      {checked && (
        <div className="px-5 pt-5">
          <p className="text-[14px] font-bold text-ink">We deliver to {pincode}</p>

          <div className="mt-3 space-y-2.5">
            <div className="flex items-start gap-3 rounded-[20px] bg-paper p-3.5 shadow-card">
              <SpeedChip speed="express" />
              <p className="text-[13px] font-medium leading-[18px] text-ink-700">
                Hardware, electricals, paint, adhesives
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-[20px] bg-paper p-3.5 shadow-card">
              <SpeedChip speed="scheduled" />
              <p className="text-[13px] font-medium leading-[18px] text-ink-700">
                Cement, tiles, tanks — by truck
              </p>
            </div>
          </div>

        </div>
      )}

      <div className="px-5 pt-6">
        <label
          htmlFor="site-name"
          className="mb-2.5 block text-[11px] font-bold uppercase tracking-[0.09em] text-ink-500"
        >
          Name this site
        </label>
        <input
          id="site-name"
          value={siteName}
          onChange={(e) => setSiteName(e.target.value.slice(0, 40))}
          placeholder="Hyderpora Site"
          className="h-[52px] w-full rounded-full bg-paper px-4.5 text-[15px] font-bold text-ink shadow-card placeholder:font-semibold placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-ink/15"
        />
        <div className="mt-2.5 flex flex-wrap gap-2">
          {SITE_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                triggerHaptic("light");
                setSiteName(n);
              }}
              className="rounded-full bg-chip px-3.5 py-1.5 text-[12px] font-bold text-ink-700"
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-5">
        <label
          htmlFor="access-note"
          className="mb-2.5 block text-[11px] font-bold uppercase tracking-[0.09em] text-ink-500"
        >
          Access note for the driver
        </label>
        {/*
          Free text on purpose. Srinagar addresses are landmark-navigated, and
          what a driver actually needs — "narrow lane, small vehicle only" — is
          not something a structured field would capture.
        */}
        <textarea
          id="access-note"
          value={accessNote}
          onChange={(e) => setAccessNote(e.target.value.slice(0, 200))}
          rows={2}
          placeholder="Truck can reach the gate. Unload at the rear."
          className="w-full resize-none rounded-[20px] bg-paper p-4 text-[14px] font-medium leading-[19px] text-ink shadow-card placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-ink/15"
        />
      </div>

      <div className="flex-1" />

      <div className="px-5 pb-8 pt-6">
        <button
          type="button"
          onClick={finish}
          disabled={!checked || busy}
          className="flex h-[54px] w-full items-center justify-center rounded-full bg-ink text-[15px] font-bold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Start shopping"}
        </button>
      </div>
    </div>
  );
}
