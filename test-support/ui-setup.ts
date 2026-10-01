/**
 * DOM for component tests (`npm run test:ui`).
 *
 * The service suite (`npm test`) runs under `--conditions=react-server`, where
 * client components cannot render, and against a real database. Component
 * tests need neither: they run in a separate process with a jsdom window, on
 * the same Node test runner, and never touch a database. Components under test
 * take their server actions as props, so no module mocking is needed.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
const g = globalThis as Record<string, unknown>;

for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in g) continue;
  try {
    g[key] = (dom.window as unknown as Record<string, unknown>)[key];
  } catch {
    /* A few window accessors throw outside a browsing context; not needed. */
  }
}
g.window = dom.window;
g.document = dom.window.document;
/* Node has its own navigator; the DOM's is the one components expect. */
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.IS_REACT_ACT_ENVIRONMENT = true;
