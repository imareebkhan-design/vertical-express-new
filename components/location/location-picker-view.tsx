"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import type { ActionResult } from "@/lib/validators";
import { useDeliveryPincode } from "@/hooks/use-delivery-pincode";
import { APPROXIMATE_ABOVE_M, getBrowserPosition, messageFor, type PositionOutcome } from "@/lib/location/browser-position";
import type { DeliveryCandidate } from "@/lib/location/delivery-candidate";

/**
 * "Where should we deliver?" — the one location sheet, for desktop and phone web.
 *
 * Three ways in, all optional, none forced: the device's position (asked for
 * only when this button is pressed), an address search, or a typed pincode.
 * Whatever is found is shown back for confirmation — the customer can always
 * say "not right" and search instead — and only a place the server says we
 * deliver to can be saved. Nothing is saved without an explicit "Deliver here".
 */

type Found = DeliveryCandidate & { source: "gps" | "search"; accuracyM: number | null };

export type PlaceSuggestion = { id: string; text: string };

/** The server calls, passed in so the view can be driven in a test without a server. */
export interface LocationPickerDeps {
  locate: (lat: number, lng: number) => Promise<ActionResult<DeliveryCandidate>>;
  search: (input: unknown) => Promise<ActionResult<{ suggestions: PlaceSuggestion[] } | { candidate: DeliveryCandidate }>>;
  position?: () => Promise<PositionOutcome>;
}

export function LocationPickerView({ onDone, locate, search, position = getBrowserPosition }: { onDone: () => void } & LocationPickerDeps) {
  const delivery = useDeliveryPincode();
  const [busy, setBusy] = useState<"locating" | "resolving" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [pin, setPin] = useState(delivery.pincode ?? "");
  const session = useRef<string>("");
  const searchBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    session.current = crypto.randomUUID();
  }, []);

  /* Debounced autocomplete: 3+ characters, 450 ms after the last keystroke. */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      const res = await search({ action: "suggest", query: q, session: session.current }).catch(() => null);
      setSearching(false);
      if (res?.ok && "suggestions" in res.data) {
        setSuggestions(res.data.suggestions);
        setMessage(res.data.suggestions.length ? null : "No matches. Try a landmark or locality, or enter your pincode.");
      } else if (res && !res.ok) {
        setMessage(res.error.message);
      }
    }, 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `search` is a stable server action
  }, [query]);

  async function useMyLocation() {
    setMessage(null);
    setFound(null);
    setBusy("locating");
    const pos = await position();
    if (!pos.ok) {
      setBusy(null);
      setMessage(messageFor(pos.reason));
      searchBox.current?.focus();
      return;
    }
    setBusy("resolving");
    const res = await locate(pos.lat, pos.lng).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMessage(res?.error.message ?? "We couldn't look up your location. Search for your address below.");
      return;
    }
    setFound({ ...res.data, source: "gps", accuracyM: pos.accuracyM });
  }

  async function pickSuggestion(s: PlaceSuggestion) {
    setMessage(null);
    setBusy("resolving");
    const res = await search({ action: "resolve", placeId: s.id, session: session.current }).catch(() => null);
    setBusy(null);
    /* A Places session ends with its resolve; the next search starts a new one. */
    session.current = crypto.randomUUID();
    if (res?.ok && "candidate" in res.data) {
      setFound({ ...res.data.candidate, source: "search", accuracyM: null });
      setSuggestions([]);
    } else {
      setMessage(res && !res.ok ? res.error.message : "We couldn't open that place. Try another.");
    }
  }

  function confirmFound() {
    if (!found) return;
    if (delivery.choose({ ...found })) onDone();
  }

  async function confirmPin(e: React.FormEvent) {
    e.preventDefault();
    if (await delivery.confirm(pin.replace(/\D/g, ""))) onDone();
  }

  if (found) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-paper p-4 shadow-card">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-5 flex-none text-ink" aria-hidden />
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-ink">{found.label}</p>
              <p className="mt-0.5 text-[13px] font-medium leading-[18px] text-ink-700">{found.formattedAddress}</p>
              {found.source === "gps" && found.accuracyM !== null && found.accuracyM > APPROXIMATE_ABOVE_M ? (
                <p className="mt-1.5 text-[12px] font-semibold text-ink-500">
                  Your location is approximate (±{found.accuracyM} m) — check this is right.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {found.serviceable ? (
          <p role="status" className="text-[13px] font-semibold text-ink">We deliver here.</p>
        ) : (
          <p role="alert" className="flex items-start gap-1.5 text-[13px] font-semibold text-danger">
            <AlertCircle className="mt-0.5 size-4 flex-none" aria-hidden />
            We don&apos;t deliver to {found.pincode} yet.
          </p>
        )}

        <div className="flex gap-2">
          {found.serviceable ? (
            <button
              type="button"
              onClick={confirmFound}
              className="flex h-12 flex-1 items-center justify-center rounded-full bg-ink text-[14px] font-bold text-white active:scale-95"
            >
              Deliver here
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setFound(null);
              setTimeout(() => searchBox.current?.focus(), 0);
            }}
            className="flex h-12 flex-1 items-center justify-center rounded-full bg-chip text-[14px] font-bold text-ink active:scale-95"
          >
            {found.serviceable ? "Not right? Search" : "Search another place"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={useMyLocation}
        disabled={busy !== null}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-[14px] font-bold text-white active:scale-95 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
        {busy === "locating" ? "Finding you…" : busy === "resolving" ? "Looking up the address…" : "Use my current location"}
      </button>

      <div>
        <label htmlFor="ve-location-search" className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">
          Or search for your address
        </label>
        <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-line bg-paper px-3.5 py-3 focus-within:border-ink">
          <Search className="size-4 flex-none text-ink-500" aria-hidden />
          <input
            id="ve-location-search"
            ref={searchBox}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Area, street or landmark"
            autoComplete="off"
            className="w-full bg-transparent text-[14px] font-semibold text-ink outline-none placeholder:text-ink-300"
          />
          {searching ? <Loader2 className="size-4 flex-none animate-spin text-ink-500" aria-hidden /> : null}
        </div>
        {suggestions.length > 0 ? (
          <ul className="mt-2 overflow-hidden rounded-2xl bg-paper shadow-card" aria-label="Suggestions">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  disabled={busy !== null}
                  className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left text-[13.5px] font-semibold text-ink hover:bg-hush"
                >
                  <MapPin className="mt-0.5 size-4 flex-none text-ink-500" aria-hidden />
                  {s.text}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {message ? (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] font-semibold leading-[18px] text-ink-700">
          <AlertCircle className="mt-0.5 size-4 flex-none" aria-hidden />
          {message}
        </p>
      ) : null}

      <form onSubmit={confirmPin} className="flex items-center gap-2 border-t border-line pt-4">
        <label htmlFor="ve-location-pin" className="sr-only">
          Delivery pincode
        </label>
        <input
          id="ve-location-pin"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="Or enter a 6-digit pincode"
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-[14px] font-semibold text-ink outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={pin.length !== 6 || delivery.checking}
          className="h-11 rounded-full bg-chip px-4 text-[13px] font-bold text-ink disabled:opacity-50"
        >
          {delivery.checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Check"}
        </button>
      </form>
      {delivery.error ? (
        <p role="alert" className="text-[12.5px] font-semibold text-danger">
          {delivery.error}
        </p>
      ) : null}
    </div>
  );
}
