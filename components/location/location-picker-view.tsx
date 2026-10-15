"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Loader2, LocateFixed, MapPin, Search, X } from "lucide-react";
import type { ActionResult } from "@/lib/validators";
import { useDeliveryPincode } from "@/hooks/use-delivery-pincode";
import { APPROXIMATE_ABOVE_M, getBrowserPosition, messageFor, type PositionOutcome } from "@/lib/location/browser-position";
import type { DeliveryCandidate } from "@/lib/location/delivery-candidate";
import { loadGoogleMaps, type GMaps } from "@/lib/tracking/maps-loader";
import { PinPreview } from "./pin-preview";

/**
 * "Where should we deliver?" — the one location sheet, for desktop and phone web.
 *
 * Three ways in, all optional, none forced: the device's position (asked for
 * only when this button is pressed), an address search, or a typed pincode.
 * Whatever is found is shown back for confirmation — the customer can always
 * say "not right" and search instead — and only a place the server says we
 * deliver to can be saved. Nothing is saved without an explicit "Deliver here".
 *
 * The address form uses the same view in pick mode (`onPick`): the confirmed
 * place goes back to the form rather than becoming the site's delivery location.
 */

type Found = DeliveryCandidate & { source: "gps" | "search"; accuracyM: number | null };

/** `main`/`secondary` are Google's own split of the line ("19 Raj Niwas Marg" / "Civil Lines, Delhi"). */
export type PlaceSuggestion = { id: string; text: string; main?: string; secondary?: string | null };

/** Typing pause before a suggest call: short enough to feel immediate, long enough not to bill every keystroke. */
export const SUGGEST_DEBOUNCE_MS = 250;

/** The server calls, passed in so the view can be driven in a test without a server. */
export interface LocationPickerDeps {
  locate: (lat: number, lng: number) => Promise<ActionResult<DeliveryCandidate>>;
  search: (input: unknown) => Promise<ActionResult<{ suggestions: PlaceSuggestion[] } | { candidate: DeliveryCandidate }>>;
  position?: () => Promise<PositionOutcome>;
  /** The pin preview's map. No key, or a failed load: no map, and the address text stands alone. */
  loadMaps?: () => Promise<GMaps | null>;
}

export function LocationPickerView({
  onDone,
  onPick,
  locate,
  search,
  position = getBrowserPosition,
  loadMaps = loadGoogleMaps,
}: {
  onDone: () => void;
  /** Pick mode: hand the confirmed place back instead of making it the site-wide delivery location. */
  onPick?: (place: DeliveryCandidate) => void;
} & LocationPickerDeps) {
  const delivery = useDeliveryPincode();
  const [busy, setBusy] = useState<"locating" | "resolving" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const [pin, setPin] = useState(delivery.pincode ?? "");
  /* One Places session per search: created here, carried by every suggest and
     by the resolve that ends it, then replaced. Google prices the session as
     one unit only when the resolve carries the same token. */
  const session = useRef<string>("");
  /* Only the newest request may write: a slow answer for "Raj" must not
     replace the list for "Rajbagh". */
  const latest = useRef(0);
  /* The device's fix, once the customer has shared it — a tighter bias than the city. */
  const near = useRef<{ lat: number; lng: number } | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    session.current = crypto.randomUUID();
  }, []);

  /* Debounced autocomplete: 3+ characters, SUGGEST_DEBOUNCE_MS after the last keystroke. */
  useEffect(() => {
    const q = query.trim();
    const seq = ++latest.current;
    if (q.length < 3) {
      setSuggestions([]);
      setSearching(false);
      setActive(-1);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      const res = await search({ action: "suggest", query: q, session: session.current, ...(near.current ? { near: near.current } : {}) }).catch(() => null);
      if (seq !== latest.current) return;
      setSearching(false);
      setActive(-1);
      if (res?.ok && "suggestions" in res.data) {
        setSuggestions(res.data.suggestions);
        setMessage(res.data.suggestions.length ? null : "No matches. Try a landmark or locality, or enter your pincode.");
      } else {
        setSuggestions([]);
        setMessage(res && !res.ok ? res.error.message : "Address search isn't responding. Check your connection, or enter your pincode.");
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `search` is a stable server action
  }, [query]);

  function clearSearch() {
    latest.current++;
    setQuery("");
    setSuggestions([]);
    setSearching(false);
    setMessage(null);
    setActive(-1);
    searchBox.current?.focus();
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      /* Never submits an enclosing form (the address form hosts this view): Enter picks a row or does nothing. */
      e.preventDefault();
      const row = suggestions[active >= 0 ? active : 0];
      if (row && busy === null) void pickSuggestion(row);
    } else if (e.key === "Escape" && (suggestions.length || query)) {
      e.preventDefault();
      if (suggestions.length) {
        setSuggestions([]);
        setActive(-1);
      } else clearSearch();
    }
  }

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
    near.current = { lat: pos.lat, lng: pos.lng };
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
    latest.current++;
    const res = await search({ action: "resolve", placeId: s.id, session: session.current }).catch(() => null);
    setBusy(null);
    /* A Places session ends with its resolve; the next search starts a new one. */
    session.current = crypto.randomUUID();
    if (res?.ok && "candidate" in res.data) {
      setFound({ ...res.data.candidate, source: "search", accuracyM: null });
      setSuggestions([]);
      setActive(-1);
    } else {
      setMessage(res && !res.ok ? res.error.message : "We couldn't open that place. Try another.");
    }
  }

  function confirmFound() {
    if (!found) return;
    if (onPick) {
      onPick({
        label: found.label,
        formattedAddress: found.formattedAddress,
        pincode: found.pincode,
        locality: found.locality,
        city: found.city,
        state: found.state,
        lat: found.lat,
        lng: found.lng,
        placeId: found.placeId,
        serviceable: found.serviceable,
      });
      onDone();
      return;
    }
    if (delivery.choose({ ...found })) onDone();
  }

  async function confirmPin(e: React.FormEvent) {
    e.preventDefault();
    if (await delivery.confirm(pin.replace(/\D/g, ""))) onDone();
  }

  if (found) {
    return (
      <div className="space-y-4">
        <h3 className="text-[16px] font-extrabold text-ink">Deliver here?</h3>
        <PinPreview lat={found.lat} lng={found.lng} loadMaps={loadMaps} />
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
            Sorry, we don&apos;t deliver to {found.pincode} yet.
          </p>
        )}

        <div className="flex gap-2">
          {found.serviceable ? (
            <button
              type="button"
              onClick={confirmFound}
              className="flex h-12 flex-1 items-center justify-center rounded-full bg-ink text-[14px] font-bold text-white active:scale-95"
            >
              {onPick ? "Use this location" : "Deliver here"}
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
            onKeyDown={onSearchKey}
            placeholder="Search for area, street, building…"
            autoComplete="off"
            enterKeyHint="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls={listId}
            aria-activedescendant={active >= 0 && suggestions[active] ? `${listId}-${active}` : undefined}
            className="w-full bg-transparent text-[14px] font-semibold text-ink outline-none placeholder:text-ink-300"
          />
          {searching ? <Loader2 className="size-4 flex-none animate-spin text-ink-500" aria-label="Searching" /> : null}
          {query && !searching ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="-m-1.5 flex size-8 flex-none items-center justify-center rounded-full text-ink-500 hover:bg-hush"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label="Address suggestions"
          hidden={suggestions.length === 0}
          className="mt-2 overflow-hidden rounded-2xl bg-paper shadow-card"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={busy !== null}
              /* Keep focus in the input while a row is pressed, so the list does not shut before the pick lands. */
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => busy === null && pickSuggestion(s)}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-12 cursor-pointer items-start gap-2.5 px-3.5 py-3 text-left ${i === active ? "bg-hush" : ""}`}
            >
              <MapPin className="mt-0.5 size-4 flex-none text-ink-500" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-bold text-ink">{s.main ?? s.text}</span>
                {s.main && s.secondary ? <span className="block truncate text-[12.5px] font-medium text-ink-500">{s.secondary}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        {/* Google's terms: autocomplete results shown without a Google map carry its attribution. */}
        {suggestions.length > 0 ? <p className="mt-1.5 px-1 text-right text-[11px] font-medium text-ink-500">Google Maps</p> : null}
      </div>

      {message ? (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] font-semibold leading-[18px] text-ink-700">
          <AlertCircle className="mt-0.5 size-4 flex-none" aria-hidden />
          {message}
        </p>
      ) : null}

      {onPick ? null : (
        <>
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
        </>
      )}
    </div>
  );
}
