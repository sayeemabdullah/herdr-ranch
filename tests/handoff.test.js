// Run with: node --test tests/handoff.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickContext, buildHandoff, CAP } from "../mods/flock/handoff.js";

const screen = [
  "Added rate limiting to the signup route.",
  "",
  "Changed:",
  "- src/routes/signup.js: 10 requests a minute",
  "- test/signup.test.js: one test for the limit",
  "✻ Brewed for 24s",
  "────────────────────────────────────────",
  "❯",
  "────────────────────────────────────────",
  "/x · main · Opus 5.5 · ctx 9% 91k/1000k · $1.25 · 5h 21%",
  "▸▸ auto mode on (shift+tab to cycle)",
].join("\n");

test("pickContext keeps the conversation and drops the footer (status line, prompt box, separators)", () => {
  const out = pickContext(screen, 40);
  assert.match(out, /Added rate limiting/);
  assert.match(out, /test\/signup\.test\.js/);
  assert.doesNotMatch(out, /ctx 9%|auto mode|────|^❯$/m);
});

test("pickContext keeps only the last n lines and trims trailing spaces", () => {
  const long = Array.from({ length: 100 }, (_, i) => `line ${i}   `).join("\n");
  const out = pickContext(long, 20).split("\n");
  assert.equal(out.length, 20);
  assert.equal(out[0], "line 80");
  assert.equal(out.at(-1), "line 99");
});

test("pickContext never goes over the cap and keeps the end", () => {
  const huge = Array.from({ length: 400 }, (_, i) => `row ${i} ${"x".repeat(60)}`).join("\n");
  const out = pickContext(huge, 400);
  assert.ok(out.length <= CAP + 2, String(out.length));
  assert.match(out, /row 399 /);
  assert.ok(out.startsWith("…"));
});

test("buildHandoff says who it is from, shows the intro and wraps the context", () => {
  const text = buildHandoff({ from: "Basil", intro: "  Pick this up, please.  ", context: "did a thing" });
  assert.equal(text, "Pick this up, please.\n\n--- Basil's recent screen ---\ndid a thing\n--- end ---");
  assert.match(buildHandoff({ from: "Basil", intro: "", context: "x" }), /^Context from Basil/);
});
