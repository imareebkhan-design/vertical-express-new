import { after, before } from "node:test";
import { db } from "@/lib/db";
import { SETTING_KEYS } from "@/lib/services/settings";

/**
 * Turns cash on delivery on for the test file that calls this, and puts the
 * setting back exactly as it was afterwards.
 *
 * COD is off unless the `cod.enabled` setting is "true" (`computeTotals`), and a
 * freshly migrated test database has no such row. Files that place COD orders
 * through `placeOrder` / `handlePlaceOrder` used to pass only when an earlier
 * file in the run had left the setting on; run alone, or in another order,
 * they failed with COD_UNAVAILABLE. Call it once at the top level of the file,
 * before any test that places a COD order.
 *
 * Test databases only: it writes the setting row, and the db-guard refuses
 * any database not marked disposable. Production COD is untouched.
 */
export function enableCodForThisFile(): void {
  guardCodSetting({ enable: true });
}

/**
 * Saves the `cod.enabled` row before the calling file runs and puts it back
 * exactly afterwards (value, note, updatedBy), or removes it if it was absent.
 * For files that switch COD on and off themselves.
 */
export function preserveCodSettingForThisFile(): void {
  guardCodSetting({ enable: false });
}

function guardCodSetting({ enable }: { enable: boolean }): void {
  let saved: Awaited<ReturnType<typeof db.setting.findUnique>> = null;
  /* Only restore what was actually read: if the read failed, after() must not
     delete a setting it never saw. */
  let captured = false;
  /* One hook, read first and then write: Node does not run two top-level
     before() hooks in the order they were registered, so a separate "enable"
     hook could write before the original row was read. */
  before(async () => {
    saved = await db.setting.findUnique({ where: { key: SETTING_KEYS.codEnabled } });
    captured = true;
    if (enable) {
      await db.setting.upsert({
        where: { key: SETTING_KEYS.codEnabled },
        create: { key: SETTING_KEYS.codEnabled, value: "true" },
        update: { value: "true" },
      });
    }
  });
  after(async () => {
    if (!captured) return;
    if (saved) {
      const { key, value, note, updatedBy } = saved;
      await db.setting.upsert({ where: { key }, create: { key, value, note, updatedBy }, update: { value, note, updatedBy } });
    } else {
      await db.setting.deleteMany({ where: { key: SETTING_KEYS.codEnabled } });
    }
  });
}
