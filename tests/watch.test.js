// Run with: node --test tests/watch.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeScreen, watchAgent, parseShortstat, changeSince, formatChange, STUCK_AFTER } from "../mods/flock/watch.js";
import { parseCost } from "../mods/flock/agent-stats.js";

const fresh = () => ({ ctx80: false, sp10: false, hash: null, sameSince: null, stuckFired: false });
const MIN = 60000;

test("parseCost reads the session cost, not the 'last' one", () => {
  assert.equal(parseCost("x · ctx 5% 45k/1000k · $0.01 last $0.00 32s"), 0.01);
  assert.equal(parseCost("· $12.5 ·"), 12.5);
  assert.equal(parseCost("nothing here"), null);
});

test("normalizeScreen ignores counters and spinners so a hung screen compares equal", () => {
  assert.equal(normalizeScreen("✻ Cogitating… (3m 8s · ↓ 4.2k tokens)"), normalizeScreen("✶ Cogitating… (3m 9s · ↓ 4.3k tokens)"));
  assert.notEqual(normalizeScreen("Reading file a.js"), normalizeScreen("Reading file b.js"));
});

test("context warning fires once at 80% and again only after it falls below 70%", () => {
  let r = watchAgent(fresh(), { status: "idle", ctx: 85, quota: null, screen: "a" }, 0);
  assert.deepEqual(r.fire, ["context"]);
  r = watchAgent(r.state, { status: "idle", ctx: 90, quota: null, screen: "a" }, 1);
  assert.deepEqual(r.fire, []);
  r = watchAgent(r.state, { status: "idle", ctx: 40, quota: null, screen: "a" }, 2);
  r = watchAgent(r.state, { status: "idle", ctx: 82, quota: null, screen: "a" }, 3);
  assert.deepEqual(r.fire, ["context"]);
});

test("quota warning fires at 10% left (90% used) and resets above 20% left", () => {
  let r = watchAgent(fresh(), { status: "idle", ctx: null, quota: 91, screen: "a" }, 0);
  assert.deepEqual(r.fire, ["quota"]);
  r = watchAgent(r.state, { status: "idle", ctx: null, quota: 95, screen: "a" }, 1);
  assert.deepEqual(r.fire, []);
  r = watchAgent(r.state, { status: "idle", ctx: null, quota: 10, screen: "a" }, 2);
  r = watchAgent(r.state, { status: "idle", ctx: null, quota: 92, screen: "a" }, 3);
  assert.deepEqual(r.fire, ["quota"]);
});

test("stuck fires after 5 unchanged minutes of working, once, and not while idle", () => {
  let r = watchAgent(fresh(), { status: "working", ctx: null, quota: null, screen: "same" }, 0);
  r = watchAgent(r.state, { status: "working", ctx: null, quota: null, screen: "same" }, STUCK_AFTER - 1);
  assert.deepEqual(r.fire, []);
  r = watchAgent(r.state, { status: "working", ctx: null, quota: null, screen: "same" }, STUCK_AFTER);
  assert.deepEqual(r.fire, ["stuck"]);
  r = watchAgent(r.state, { status: "working", ctx: null, quota: null, screen: "same" }, STUCK_AFTER + MIN);
  assert.deepEqual(r.fire, []);
  r = watchAgent(r.state, { status: "working", ctx: null, quota: null, screen: "moved" }, STUCK_AFTER + 2 * MIN);
  r = watchAgent(r.state, { status: "working", ctx: null, quota: null, screen: "moved" }, 2 * STUCK_AFTER + 2 * MIN);
  assert.deepEqual(r.fire, ["stuck"]);
  const idle = watchAgent(fresh(), { status: "idle", ctx: null, quota: null, screen: "same" }, 0);
  assert.deepEqual(watchAgent(idle.state, { status: "idle", ctx: null, quota: null, screen: "same" }, 99 * MIN).fire, []);
});

test("parseShortstat reads files, insertions and deletions", () => {
  assert.deepEqual(parseShortstat(" 4 files changed, 120 insertions(+), 30 deletions(-)\n"), { files: 4, add: 120, del: 30 });
  assert.deepEqual(parseShortstat(" 1 file changed, 2 insertions(+)"), { files: 1, add: 2, del: 0 });
  assert.deepEqual(parseShortstat(""), { files: 0, add: 0, del: 0 });
});

test("changeSince is the work done between two snapshots and formats for a card", () => {
  const d = changeSince({ files: 2, add: 10, del: 5 }, { files: 5, add: 130, del: 35 });
  assert.deepEqual(d, { files: 3, add: 120, del: 30 });
  assert.equal(formatChange(d), "3 files +120 −30");
  assert.equal(formatChange({ files: 1, add: 4, del: 0 }), "1 file +4 −0");
  assert.equal(formatChange({ files: 0, add: 0, del: 0 }), null);
  assert.deepEqual(changeSince({ files: 5, add: 100, del: 50 }, { files: 1, add: 3, del: 1 }), { files: 0, add: 0, del: 0 });
});
