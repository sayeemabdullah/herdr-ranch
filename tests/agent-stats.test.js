// Run with: node --test tests/agent-stats.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseContext, parseModel, parseCost } from "../mods/flock/agent-stats.js";

const screen = (...lines) => ["some chat output", "", ...lines].join("\n");

test("custom Claude statusline", () => {
  const text = screen("  ~/dev/app · main · Opus 5.5 · ctx 9% 91k/1000k · $1.25 · 5h 21%");
  assert.equal(parseContext(text), 9);
  assert.equal(parseModel(text), "Opus 5.5");
});

test("bar statusline", () => {
  assert.equal(parseContext(screen("~/dev/app ▓▓░░░░░░░░ 27% · Sonnet 5.5")), 27);
  assert.equal(parseModel(screen("~/dev/app ▓▓░░░░░░░░ 27% · Sonnet 5.5")), "Sonnet 5.5");
});

test("pi footer", () => {
  const text = screen("12.6%/500k", "(openai-codex) gpt-6.1-sol • medium");
  assert.equal(parseContext(text), 13);
  assert.equal(parseModel(text), "gpt-6.1-sol");
});

test("context left converts to used", () => {
  assert.equal(parseContext(screen("Context left until auto-compact: 12%")), 88);
  assert.equal(parseContext(screen("gpt-5.5 high · 85% context left")), 15);
  assert.equal(parseModel(screen("gpt-5.5 high · 85% context left")), "gpt-5.5");
});

test("bottom line wins over older ones", () => {
  assert.equal(parseContext(screen("ctx 40%", "chat", "ctx 42%")), 42);
});

test("start banner is the model fallback", () => {
  const text = ["Opus 5.5 with medium effort · Claude Max", ...Array(20).fill("chat line"), "> "].join("\n");
  assert.equal(parseModel(text), "Opus 5.5");
});

test("nothing to read", () => {
  assert.equal(parseContext(screen("> ")), null);
  assert.equal(parseModel(screen("> ")), null);
  assert.equal(parseContext(""), null);
  assert.equal(parseModel(null), null);
});

import { parseQuota } from "../mods/flock/agent-stats.js";
test("parseQuota reads the 5h window used", () => {
  assert.equal(parseQuota("/x · master · Haiku 5.5 · ctx 5% · $0.01 · 5h 32% 7d 80% · [AD…"), 32);
  assert.equal(parseQuota("nothing here"), null);
  assert.equal(parseQuota("5h 250%"), 100);
});

test("parseCost reads only the status-line row, not a dollar amount in chat text", () => {
  assert.equal(parseCost("Our plan costs $15 per month, said the page.\nmore text"), null);
  assert.equal(parseCost("The bill was $15.00 for the month\n/x · main · Opus 5.5 · ctx 9% · $1.25 · 5h 21%"), 1.25);
  assert.equal(parseCost("/x · Haiku 5.5 · $0.01 last $0.00 32s"), 0.01);
});
