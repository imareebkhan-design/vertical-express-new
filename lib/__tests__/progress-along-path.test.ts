import test from "node:test";
import assert from "node:assert/strict";
import { progressAlongPath, haversineM } from "@/lib/tracking/geo";

const A = { lat: 28.675, lng: 77.2225 };
const B = { lat: 28.6925, lng: 77.2225 }; // ~1.95 km north
const C = { lat: 28.6925, lng: 77.2045 }; // ~1.76 km west

test("remaining distance along a two-leg path from the rider's closest point", () => {
  const total = haversineM(A, B) + haversineM(B, C);
  const atStart = progressAlongPath(A, [A, B, C])!;
  assert.ok(Math.abs(atStart.totalM - total) < 5);
  assert.ok(Math.abs(atStart.remainingM - total) < 5, "at the start, all of it is ahead");
  const halfFirstLeg = { lat: (A.lat + B.lat) / 2, lng: A.lng };
  const mid = progressAlongPath(halfFirstLeg, [A, B, C])!;
  assert.ok(Math.abs(mid.remainingM - (haversineM(A, B) / 2 + haversineM(B, C))) < 5);
  assert.ok(mid.offPathM < 1, "on the path");
  const end = progressAlongPath(C, [A, B, C])!;
  assert.ok(end.remainingM < 1, "nothing left at the end");
});

test("off the path is reported, and a degenerate path is null", () => {
  const away = progressAlongPath({ lat: 28.68, lng: 77.24 }, [A, B])!;
  assert.ok(away.offPathM > 1500);
  assert.equal(progressAlongPath(A, [A]), null);
});
