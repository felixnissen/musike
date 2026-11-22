import assert from "node:assert/strict";
import {
  mcAnnouncement, readMCCadence, saveMCCadence,
  shouldMCAnnounce, isMCEligibleTrack,
} from "../../web/src/lib/maestroMC.js";

const storage = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
} as Storage;

assert.equal(readMCCadence(), 0, "MC defaults to silent");
saveMCCadence(3);
assert.equal(readMCCadence(), 3, "MC setting persists");
saveMCCadence(8);
assert.equal(readMCCadence(), 8);
storage.set("musike:maestro-mc:v1", "2");
assert.equal(readMCCadence(), 0, "Invalid persisted choice fails closed");
for (const n of [0, 3, 5, 8] as const) {
  assert.equal(shouldMCAnnounce(n, 1), false, "No talking on first track");
  assert.equal(shouldMCAnnounce(n, 2), false, "No talking on second track");
}
for (const n of [3, 5, 8] as const) {
  assert.equal(shouldMCAnnounce(n, n), true, "Every N completed starts");
  assert.equal(shouldMCAnnounce(n, n + 1), false, "No immediate repeat");
  assert.equal(shouldMCAnnounce(n, 2*n), true, "Repeated frequency");
  for (let i=0; i<30; i++) assert.equal(shouldMCAnnounce(0, i), false, "Off means silent");
}
assert.equal(isMCEligibleTrack({ title: "Midnight City", artist: "M83" }), true);
assert.equal(isMCEligibleTrack({ title: " ", artist: "M83" }), false);
assert.equal(mcAnnouncement({ title: "Midnight City", artist: "M83" }),
  "Nu spelar vi Midnight City, med M83.");
console.log("Maestro MC cadence, disabled mode, source-based script and persistence: OK");
