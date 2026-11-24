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
