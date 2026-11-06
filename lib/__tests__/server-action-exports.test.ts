import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every export from a "use server" file must be an async function.
 *
 * Next.js enforces this at build time — a synchronous export fails Turbopack
 * with "Server Actions must be async functions." It is not a type error, so
 * `tsc` passes; it is not a lint rule here, so `npm run lint` passes; and the
 * test suite never imports the route, so `npm test` passes.
 *
 * `actions/listing.ts` shipped exactly that: a plain `export function
 * parsePincodeList(...)` added alongside the express-delivery work. All four
 * local gates were green and `npm run build` failed with three errors. It would
 * have surfaced on Vercel as a failed deploy, because the dev server compiles
 * routes lazily and `/admin/listing` — the only importer — is behind the
 * owner's Google sign-in and had never been loaded.
 *
 * That is the trap this branch already hit once at a larger scale: gates green
 * on something that cannot ship. A full build is the only other thing that
 * catches it, and a build takes minutes and is not part of the gate loop.
 *
 * The helper now lives in `lib/pincode.ts`, which is where a pure function
 * belongs anyway.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Every .ts file under actions/, which is where "use server" files live. */
const ACTION_FILES = readdirSync(join(ROOT, "actions"))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => join("actions", f));

/** Source with comments and strings-in-comments removed, so prose about an
 *  export does not read as one. */
function code(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");
}

test("the action files are still being found", () => {
  /* Non-vacuity: if actions/ moves or the filter breaks, every assertion below
     passes by inspecting nothing. */
  assert.ok(ACTION_FILES.length >= 15, `only ${ACTION_FILES.length} action files found`);
  assert.ok(ACTION_FILES.includes("actions/listing.ts"), "actions/listing.ts has gone");
});

test('every export from a "use server" file is async', () => {
  for (const rel of ACTION_FILES) {
    const src = code(rel);

    /* Only files that actually declare it. A file without the directive is a
       plain module and may export whatever it likes. */
    if (!/^\s*["']use server["']/m.test(src)) continue;

    /* `export function foo` / `export const foo = (` with no `async`.
       Type-only exports are fine — they vanish at compile time. */
    for (const m of src.matchAll(/^export\s+(?!type\b|interface\b)(.+)$/gm)) {
      const line = m[1];

      if (/^async\s+function\b/.test(line)) continue;
      if (/^const\s+\w+\s*(:[^=]+)?=\s*async\b/.test(line)) continue;
      /* `export { a, b }` re-exports and `export * from` cannot be judged from
         this line alone; they are checked where they are declared. */
      if (/^[*{]/.test(line)) continue;

      assert.fail(
        `${rel} exports something that is not an async function, which fails ` +
          `the production build with "Server Actions must be async functions":\n` +
          `    export ${line.trim()}`
      );
    }
  }
});

test("the pincode parser is a pure module, not a server action", () => {
  /* Where it went, and why. A pure function in an actions file is the shape of
     the defect, so this pins the fix rather than only the symptom. */
  const pincode = code("lib/pincode.ts");
  assert.match(pincode, /export function parsePincodeList/, "the parser has gone");
  assert.ok(
    !/^\s*["']use server["']/m.test(pincode),
    "lib/pincode.ts declares use server, which would break it again"
  );
  assert.ok(
    !/parsePincodeList\s*\(/.test(code("actions/listing.ts").split("\n").filter((l) => l.startsWith("export")).join("\n")),
    "the parser is exported from the actions file again"
  );
});
