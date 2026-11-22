import assert from "node:assert/strict";
import {
  mcAnnouncement, readMCCadence, saveMCCadence, readMCSettings, saveMCSettings,
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

assert.equal(readMCSettings().language, "en-US", "New MC voice language defaults to English");
assert.equal(readMCSettings().duckPercent, 9, "Voice gets strong 9% music bed");
saveMCSettings({ language: "sv-SE", duckPercent: 19, voiceId: "sv-test" });
assert.deepEqual(readMCSettings(), { language: "sv-SE", duckPercent: 19, voiceId: "sv-test" });
saveMCSettings({ language: "en-US", duckPercent: 1, voiceId: "en-test" });
assert.equal(readMCSettings().duckPercent, 5, "Ducking lower bound");
saveMCSettings({ language: "en-US", duckPercent: 100, voiceId: "en-test" });
assert.equal(readMCSettings().duckPercent, 45, "Ducking upper bound");
assert.equal(mcAnnouncement({title:"Midnight City",artist:"M83",album:"Hurry Up, We're Dreaming"}, "en-US", 4),
  "From the album Hurry Up, We're Dreaming, this is Midnight City by M83.");
assert.equal(mcAnnouncement({title:"Midnight City",artist:"M83"}, "en-US", 0),
  "Here's Midnight City, by M83.");
assert.equal(new Set(Array.from({length: 5}, (_, i) =>
  mcAnnouncement({title:"Midnight City",artist:"M83"}, "en-US", i))).size, 5, "Varied verified phrases");
console.log("MC English/Swedish voices, configurable ducking and non-repeating intros: OK");
