// Run with: node --test tests/ranch.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { lifeOf, treeStage, worked, MINUTE } from "../mods/flock/ranch.js";

test("an idle animal rests, naps after 2 minutes, then gets the alarm after 5", () => {
  assert.equal(lifeOf("idle", 0), "rest");
  assert.equal(lifeOf("idle", 2 * MINUTE - 1), "rest");
  assert.equal(lifeOf("idle", 2 * MINUTE), "nap");
  assert.equal(lifeOf("idle", 5 * MINUTE), "alarm");
});

test("other states are not changed by waiting", () => {
  for (const s of ["working", "blocked", "done"]) assert.equal(lifeOf(s, 99 * MINUTE), s);
});

test("the tree grows at 1, 4, 8, 13, 19, 26 and blossoms at 30", () => {
  const stages = [0, 1, 3, 4, 7, 8, 12, 13, 18, 19, 25, 26, 29, 30, 99].map(treeStage);
  assert.deepEqual(stages, [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
});

test("work time reads as minutes then hours", () => {
  assert.equal(worked(0), "0m");
  assert.equal(worked(42 * MINUTE), "42m");
  assert.equal(worked(125 * MINUTE), "2h 5m");
});

import { countsAsTask, needsRead, MIN_TASK } from "../mods/flock/ranch.js";

test("a task shorter than 20 seconds does not count", () => {
  assert.equal(MIN_TASK, 20000);
  assert.equal(countsAsTask(5000), false);
  assert.equal(countsAsTask(19999), false);
  assert.equal(countsAsTask(20000), true);
});

test("only working, focused, newly changed or stale agents are read", () => {
  const now = 1_000_000;
  const base = { status: "idle", focused: false };
  assert.equal(needsRead({ ...base, status: "working" }, now, now - 1000, false), true);
  assert.equal(needsRead({ ...base, focused: true }, now, now - 1000, false), true);
  assert.equal(needsRead(base, now, now - 1000, true), true);
  assert.equal(needsRead(base, now, undefined, false), true);
  assert.equal(needsRead(base, now, now - 60 * 1000, false), false);
  assert.equal(needsRead(base, now, now - 121 * 1000, false), true);
});

import { migrateCost, COST_VERSION } from "../mods/flock/ranch.js";

test("spend counted by the old reader is dropped once, and kept afterwards", () => {
  const old = { day: "2026-11-23", shipped: 3, cost: { t1: 15, t2: 30 }, costBase: { t1: 5 } };
  const fresh = migrateCost(old);
  assert.deepEqual(fresh.cost, {});
  assert.deepEqual(fresh.costBase, {});
  assert.equal(fresh.costV, COST_VERSION);
  assert.equal(fresh.shipped, 3);
  const again = migrateCost({ ...fresh, cost: { t1: 2 } });
  assert.deepEqual(again.cost, { t1: 2 });
});
