import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * No unvetted third-party script reaches a customer's browser.
 *
 * Two <script> tags for static.rocket.new sat in `app/layout.tsx` — the root
 * layout, so every page, checkout included. A scaffolding tool put them there
 * and they arrived here on a merge with main. They pointed at
 * appanalytics.rocket.new.
 *
 * Nobody noticed because the CSP blocked them, and that is exactly the wrong
 * thing to have been relying on. The policy carries a deliberate wildcard for
 * Razorpay's checkout hosts, so it is a file people widen; the next person to
 * widen it switches these back on. A script in the checkout DOM can read the
 * delivery address, the phone number, the basket and the totals — card entry is
 * inside Razorpay's iframe, but everything around it is ours, and none of it
 * appears in the privacy page's list of what we collect.
 *
 * Defence in depth: the CSP stops them executing, this stops them being
 * shipped.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Hosts a script tag may legitimately name. Razorpay Checkout is loaded by
 *  their own SDK, not by a tag we write, so this list is empty on purpose. */
const ALLOWED_SCRIPT_HOSTS: string[] = [];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "generated") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = [join(ROOT, "app"), join(ROOT, "components")].flatMap((d) => walk(d));

test("there are source files to scan", () => {
  /* Non-vacuity: a broken walk would make every assertion below pass. */
  assert.ok(FILES.length > 100, `only found ${FILES.length} files`);
});

test("no script tag loads from a third-party host", () => {
  const offenders: string[] = [];

  for (const file of FILES) {
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

    /* Any <script> whose src is an absolute URL. A relative src is our own
       bundle and is fine. */
    for (const m of src.matchAll(/<script[^>]*\ssrc=["']?(https?:\/\/[^"'\s>]+)/gi)) {
      const url = m[1];
      const host = (() => {
        try {
          return new URL(url).host;
        } catch {
          return url;
        }
      })();
      if (!ALLOWED_SCRIPT_HOSTS.includes(host)) {
        offenders.push(`${file.replace(ROOT, "")} → ${host}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "A third-party script is being shipped to customers:\n  " +
      offenders.join("\n  ") +
      "\nThe CSP may block it today, but the CSP is a file people widen."
  );
});

test("the scaffolding tool's telemetry specifically is gone", () => {
  /* Named because this is the one that actually shipped, and because it can
     return the same way it arrived — on a merge. */
  for (const file of FILES) {
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
    assert.ok(
      !/rocket\.new|builtwithrocket/.test(src),
      `${file.replace(ROOT, "")} references the rocket.new scaffolding telemetry`
    );
  }
});
