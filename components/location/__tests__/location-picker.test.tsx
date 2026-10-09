import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LocationPickerView, SUGGEST_DEBOUNCE_MS, type LocationPickerDeps } from "../location-picker-view";
import type { DeliveryCandidate } from "@/lib/location/delivery-candidate";
import { getBrowserPosition, messageFor, reasonForCode } from "@/lib/location/browser-position";
import { formattedFor, labelFor } from "@/lib/location/delivery-candidate";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const RAJBAGH: DeliveryCandidate = {
  label: "Rajbagh",
  formattedAddress: "12 Bund Road, Rajbagh, Srinagar 190008",
  pincode: "190008",
  locality: "Rajbagh",
  city: "Srinagar",
  state: "Jammu and Kashmir",
  lat: 34.0681,
  lng: 74.8275,
  placeId: null,
  serviceable: true,
};

function deps(over: Partial<LocationPickerDeps> = {}): LocationPickerDeps {
  return {
    locate: async () => ({ ok: true, data: RAJBAGH }),
    search: async () => ({ ok: true, data: { suggestions: [] } }),
    position: async () => ({ ok: true, lat: 34.0681, lng: 74.8275, accuracyM: 20 }),
    loadMaps: async () => null,
    ...over,
  };
}

const flush = () => act(async () => {});
const typingPause = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, SUGGEST_DEBOUNCE_MS + 50));
  });

test("current location: permission granted → address shown for confirmation → saved only on 'Deliver here'", async () => {
  let done = 0;
  render(<LocationPickerView onDone={() => done++} {...deps()} />);
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  await flush();
  assert.ok(screen.getByText("Rajbagh"));
  assert.ok(screen.getByText("We deliver here."));
  assert.equal(localStorage.getItem("ve_pincode"), null, "nothing saved before the customer confirms");

  fireEvent.click(screen.getByRole("button", { name: "Deliver here" }));
  assert.equal(done, 1);
  assert.equal(localStorage.getItem("ve_pincode"), "190008");
  const place = JSON.parse(localStorage.getItem("ve_delivery_place") ?? "{}");
  assert.deepEqual([place.source, place.label, place.lat, place.lng], ["gps", "Rajbagh", 34.0681, 74.8275]);
});

test("permission denied: a clear message, nothing saved, and search stays usable", async () => {
  let located = 0;
  render(
    <LocationPickerView
      onDone={() => {}}
      {...deps({ position: async () => ({ ok: false, reason: "denied" }), locate: async () => (located++, { ok: true, data: RAJBAGH }) })}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  await flush();
  assert.match(screen.getByRole("alert").textContent ?? "", /Location access is off/);
  assert.equal(located, 0, "no billed lookup without a position");
  assert.equal(localStorage.getItem("ve_pincode"), null);
  const box = screen.getByLabelText("Or search for your address") as HTMLInputElement;
  assert.equal(box.disabled, false);
});

test("an unserviceable place cannot be saved", async () => {
  render(<LocationPickerView onDone={() => {}} {...deps({ locate: async () => ({ ok: true, data: { ...RAJBAGH, serviceable: false, pincode: "110001" } }) })} />);
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  await flush();
  assert.match(screen.getByRole("alert").textContent ?? "", /don.t deliver to 110001/);
  assert.equal(screen.queryByRole("button", { name: "Deliver here" }), null);
});

test("manual search: suggestion → resolve → confirm saves the searched place, replacing a GPS one", async () => {
  localStorage.setItem("ve_pincode", "190008");
  localStorage.setItem("ve_delivery_place", JSON.stringify({ source: "gps", label: "Rajbagh", formattedAddress: "x", lat: 1, lng: 1, placeId: null }));
  const calls: unknown[] = [];
  const search: LocationPickerDeps["search"] = async (input) => {
    calls.push(input);
    const i = input as { action: string };
    return i.action === "suggest"
      ? { ok: true, data: { suggestions: [{ id: "place-1", text: "Hyderpora, Srinagar" }] } }
      : { ok: true, data: { candidate: { ...RAJBAGH, label: "Hyderpora", pincode: "190014", placeId: "place-1", lat: 34.05, lng: 74.79 } } };
  };
  render(<LocationPickerView onDone={() => {}} {...deps({ search })} />);
  fireEvent.change(screen.getByLabelText("Or search for your address"), { target: { value: "Hyder" } });
  await typingPause();
  fireEvent.click(screen.getByRole("option", { name: /Hyderpora, Srinagar/ }));
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "Deliver here" }));
  const place = JSON.parse(localStorage.getItem("ve_delivery_place") ?? "{}");
  assert.deepEqual([place.source, place.label, place.placeId], ["search", "Hyderpora", "place-1"]);
  assert.equal(localStorage.getItem("ve_pincode"), "190014");
  assert.equal((calls[0] as { action: string }).action, "suggest");
});

test("browser outcomes map to their own messages; the API is not Google's", async () => {
  assert.equal(reasonForCode(1), "denied");
  assert.equal(reasonForCode(2), "unavailable");
  assert.equal(reasonForCode(3), "timeout");
  for (const r of ["denied", "unavailable", "timeout", "unsupported"] as const) assert.match(messageFor(r), /search|Search/);
  assert.deepEqual(await getBrowserPosition(undefined), { ok: false, reason: "unsupported" });
  const geo = {
    getCurrentPosition: (_ok: PositionCallback, err: PositionErrorCallback) => err({ code: 3 } as GeolocationPositionError),
  } as unknown as Geolocation;
  assert.deepEqual(await getBrowserPosition(geo), { ok: false, reason: "timeout" });
});

test("labels: locality first, then street, then city", () => {
  assert.equal(labelFor({ line1: "12 Bund Road", locality: "Rajbagh", city: "Srinagar", pincode: "190008" }), "Rajbagh");
  assert.equal(labelFor({ line1: "", locality: null, city: "Srinagar", pincode: "190008" }), "Srinagar");
  assert.equal(formattedFor({ line1: "Srinagar", locality: null, city: "Srinagar", pincode: "190001" }), "Srinagar 190001");
});

/* ---------------------------------------------------------------- type-ahead */

const SUGGESTIONS = [
  { id: "p-1", text: "19 Raj Niwas Marg, Civil Lines, Delhi", main: "19 Raj Niwas Marg", secondary: "Civil Lines, Delhi" },
  { id: "p-2", text: "Rajbagh, Srinagar", main: "Rajbagh", secondary: "Srinagar" },
];

function recordingSearch(resolveTo: Partial<DeliveryCandidate> = {}) {
  const calls: Record<string, unknown>[] = [];
  const search: LocationPickerDeps["search"] = async (input) => {
    const i = input as Record<string, unknown>;
    calls.push(i);
    return i.action === "suggest"
      ? { ok: true, data: { suggestions: SUGGESTIONS } }
      : { ok: true, data: { candidate: { ...RAJBAGH, placeId: String(i.placeId), ...resolveTo } } };
  };
  return { calls, search };
}

test("typing '19 Raj' shows Google's two-line suggestions as listbox options", async () => {
  const { calls, search } = recordingSearch();
  render(<LocationPickerView onDone={() => {}} {...deps({ search })} />);
  const box = screen.getByRole("combobox");
  fireEvent.change(box, { target: { value: "19 Raj" } });
  await typingPause();
  const options = screen.getAllByRole("option");
  assert.equal(options.length, 2);
  assert.match(options[0].textContent ?? "", /19 Raj Niwas Marg/);
  assert.match(options[0].textContent ?? "", /Civil Lines, Delhi/);
  assert.equal(box.getAttribute("aria-expanded"), "true");
  assert.deepEqual(calls.map((c) => c.action), ["suggest"]);
});

test("under three characters: no request at all", async () => {
  const { calls, search } = recordingSearch();
  render(<LocationPickerView onDone={() => {}} {...deps({ search })} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Ra" } });
  await typingPause();
  assert.equal(calls.length, 0);
  assert.equal(screen.queryAllByRole("option").length, 0);
});

test("fast typing is debounced into one request for the final text", async () => {
  const { calls, search } = recordingSearch();
  render(<LocationPickerView onDone={() => {}} {...deps({ search })} />);
  const box = screen.getByRole("combobox");
  for (const v of ["Raj", "Rajb", "Rajba", "Rajbag", "Rajbagh"]) fireEvent.change(box, { target: { value: v } });
  await typingPause();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query, "Rajbagh");
});

test("one Places session: every suggest and the resolve share a token, and the next search gets a new one", async () => {
  const { calls, search } = recordingSearch();
  render(<LocationPickerView onDone={() => {}} {...deps({ search })} />);
  const box = screen.getByRole("combobox");
  fireEvent.change(box, { target: { value: "19 Raj" } });
  await typingPause();
  fireEvent.change(box, { target: { value: "19 Raj Niwas" } });
  await typingPause();
  fireEvent.click(screen.getAllByRole("option")[0]);
  await flush();
  const [a, b, resolve] = calls;
  assert.deepEqual([a.action, b.action, resolve.action], ["suggest", "suggest", "resolve"]);
  assert.equal(a.session, b.session);
  assert.equal(b.session, resolve.session, "the resolve closes the same session");

  fireEvent.click(screen.getByRole("button", { name: "Not right? Search" }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Hyderpora" } });
  await typingPause();
  assert.notEqual(calls[3].session, resolve.session, "a new search, a new session");
});

test("keyboard: arrow down then Enter picks the highlighted row; Enter never submits a form around it", async () => {
  const { calls, search } = recordingSearch();
  render(<LocationPickerView onDone={() => {}} {...deps({ search })} />);
  const box = screen.getByRole("combobox");
  /* Implicit submission is the browser's default action for Enter; jsdom does
     not perform it, so what is checked is that the default is cancelled. */
  assert.equal(fireEvent.keyDown(box, { key: "Enter" }), false, "Enter with nothing typed is swallowed");
  fireEvent.change(box, { target: { value: "Raj" } });
  await typingPause();
  fireEvent.keyDown(box, { key: "ArrowDown" });
  fireEvent.keyDown(box, { key: "ArrowDown" });
  assert.equal(screen.getAllByRole("option")[1].getAttribute("aria-selected"), "true");
  assert.ok(box.getAttribute("aria-activedescendant"));
  assert.equal(fireEvent.keyDown(box, { key: "Enter" }), false, "Enter on a row is swallowed too");
  await flush();
  assert.equal(calls.at(-1)?.placeId, "p-2");
});

test("a slow answer for an earlier query never replaces the list for a later one", async () => {
  const pending: Record<string, (v: Awaited<ReturnType<LocationPickerDeps["search"]>>) => void> = {};
  const search: LocationPickerDeps["search"] = (input) =>
    new Promise((resolve) => {
      pending[(input as { query: string }).query] = resolve;
    });
  render(<LocationPickerView onDone={() => {}} {...deps({ search })} />);
  const box = screen.getByRole("combobox");
  fireEvent.change(box, { target: { value: "Raj" } });
  await typingPause();
  fireEvent.change(box, { target: { value: "Rajbagh" } });
  await typingPause();
  await act(async () => pending["Rajbagh"]({ ok: true, data: { suggestions: [SUGGESTIONS[1]] } }));
  await act(async () => pending["Raj"]({ ok: true, data: { suggestions: [SUGGESTIONS[0]] } }));
  const options = screen.getAllByRole("option");
  assert.equal(options.length, 1);
  assert.match(options[0].textContent ?? "", /Rajbagh/);
});

test("no results and a dead network are both said out loud; clear empties the box", async () => {
  let mode: "empty" | "offline" = "empty";
  const search: LocationPickerDeps["search"] = async () => {
    if (mode === "offline") throw new Error("Failed to fetch");
    return { ok: true, data: { suggestions: [] } };
  };
  render(<LocationPickerView onDone={() => {}} {...deps({ search })} />);
  const box = screen.getByRole("combobox") as HTMLInputElement;
  fireEvent.change(box, { target: { value: "zzzz" } });
  await typingPause();
  assert.match(screen.getByRole("alert").textContent ?? "", /No matches/);

  mode = "offline";
  fireEvent.change(box, { target: { value: "zzzzz" } });
  await typingPause();
  assert.match(screen.getByRole("alert").textContent ?? "", /isn't responding/);

  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  assert.equal(box.value, "");
  assert.equal(screen.queryByRole("alert"), null);
});

test("once the customer has shared their position, suggestions are biased around it", async () => {
  const { calls, search } = recordingSearch();
  render(<LocationPickerView onDone={() => {}} {...deps({ search, locate: async () => ({ ok: true, data: { ...RAJBAGH, serviceable: false } }) })} />);
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "Search another place" }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Rajbagh" } });
  await typingPause();
  assert.deepEqual(calls[0].near, { lat: 34.0681, lng: 74.8275 });
});

test("a searched place that we do not deliver to is selectable but cannot be confirmed", async () => {
  const { search } = recordingSearch({ serviceable: false, pincode: "110054" });
  render(<LocationPickerView onDone={() => {}} {...deps({ search })} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "19 Raj" } });
  await typingPause();
  fireEvent.click(screen.getAllByRole("option")[0]);
  await flush();
  assert.match(screen.getByRole("alert").textContent ?? "", /don.t deliver to 110054/);
  assert.equal(screen.queryByRole("button", { name: "Deliver here" }), null);
  assert.equal(localStorage.getItem("ve_pincode"), null);
});

test("pick mode (the address form): the confirmed place goes back with coordinates and place id; nothing site-wide changes", async () => {
  const { search } = recordingSearch();
  const picked: DeliveryCandidate[] = [];
  let done = 0;
  render(<LocationPickerView onDone={() => done++} onPick={(p) => picked.push(p)} {...deps({ search })} />);
  assert.equal(screen.queryByPlaceholderText("Or enter a 6-digit pincode"), null, "an address needs a place, not just a pincode");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Rajbagh" } });
  await typingPause();
  fireEvent.click(screen.getAllByRole("option")[1]);
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "Use this location" }));
  assert.equal(done, 1);
  assert.deepEqual([picked[0].placeId, picked[0].lat, picked[0].lng, picked[0].pincode], ["p-2", 34.0681, 74.8275, "190008"]);
  assert.equal(localStorage.getItem("ve_pincode"), null);
  assert.equal(localStorage.getItem("ve_delivery_place"), null);
});
