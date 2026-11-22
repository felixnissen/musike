import assert from "node:assert/strict";
import { en } from "../../web/src/i18n/en.js";
import { sv } from "../../web/src/i18n/sv.js";
import { isLang, tr, msg, youtubeLang } from "../src/i18n.js";

const structure = (obj: Record<string, unknown>, prefix = ""): string[] => Object.entries(obj)
  .flatMap(([k, v]) => v && typeof v === "object" && !Array.isArray(v)
    ? structure(v as Record<string, unknown>, prefix + k + ".") : [prefix + k])
  .sort();
assert.deepEqual(structure(sv as unknown as Record<string, unknown>),
  structure(en as unknown as Record<string, unknown>), "Swedish translation must have every English key");
assert.equal(sv.locale, "sv-SE");
assert.equal(sv.common.songs(1), "1 låt");
assert.equal(sv.common.songs(2), "2 låtar");
assert.equal(sv.time.greeting(8), "God morgon");
assert.equal(sv.settings.title, "Inställningar");
assert.equal(isLang("sv"), true);
assert.equal(youtubeLang("sv"), "sv");
assert.equal(tr("sv", msg("noFreePort", { from: 1, to: 5 })), "Ingen ledig port mellan 1 och 5.");
assert.equal(tr("sv", msg("downloadFailed", { tool: "FFmpeg", status: 404 })),
  "Nedladdning av FFmpeg misslyckades (HTTP 404).");
console.log("Swedish frontend/backend language coverage and placeholders passed", structure(sv as unknown as Record<string, unknown>).length);
