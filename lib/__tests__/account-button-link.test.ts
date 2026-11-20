import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { safeNextPath } from "@/lib/safe-next";

/**
 * The header account icon (signed-out branch) must carry next=/account. A
 * bare /login sends a server-signed-in visitor straight back to "/", which
 * reads as the icon doing nothing (staging, 15 Oct 2026).
 */
const SRC = readFileSync(join(process.cwd(), "components/auth/account-button.tsx"), "utf8");

test("the sign-in icon goes to /login?next=/account, never a bare /login", () => {
  assert.match(SRC, /href="\/login\?next=\/account"/);
  assert.doesNotMatch(SRC, /href="\/login"/);
  assert.equal(safeNextPath("/account"), "/account", "the login page honours it");
});
