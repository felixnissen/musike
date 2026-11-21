import assert from "node:assert/strict";
import { parseLrc, lyricAt } from "../../web/src/lib/lyrics.js";

const content = [
  "[ar:Example Artist]",
  "[offset:+100]",
  "[00:01.25][00:02.500]First line",
  "[00:03.1]Second line",
  "[00:05.00]",
  "[offset:-200]",
  "[00:06.000]Last line",
  "[not valid] do not render",
].join("\n");
const lines = parseLrc(content);
assert.equal(lines.length, 5);
assert.equal(lines[0].text, "First line");
assert.ok(Math.abs(lines[0].time - 1.35) < 0.001);
assert.ok(Math.abs(lines[1].time - 2.60) < 0.001);
assert.equal(lines[2].text, "Second line");
assert.ok(Math.abs(lines[4].time - 5.80) < 0.001);
assert.equal(lyricAt(lines, 0), -1);
assert.equal(lyricAt(lines, 1.40), 0);
assert.equal(lyricAt(lines, 2.72), 1);
assert.equal(lyricAt(lines, 100), 4);
assert.deepEqual(parseLrc("this is plain text"), []);
assert.deepEqual(parseLrc("x".repeat(512001)), []);
console.log("LRC parser and active-line tests passed");
