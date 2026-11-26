import test from "node:test";
import assert from "node:assert/strict";
import { STATES, filterByState, pairUp, nextIndex } from "../mods/flock/agentview.js";

const list = [{ status: "blocked" }, { status: "working" }, { status: "idle" }, { status: "blocked" }];

test("filterByState keeps one state", () => {
  assert.equal(filterByState(list, "blocked").length, 2);
  assert.equal(filterByState(list, "done").length, 0);
});

test("filterByState keeps everyone for all, nothing set or an unknown value", () => {
  for (const s of ["all", undefined, null, "bogus"]) assert.equal(filterByState(list, s), list);
});

test("the states start with everyone and name Needs you", () => {
  assert.equal(STATES[0].id, "all");
  assert.equal(STATES.find((s) => s.id === "blocked").label, "Needs you");
});

test("pairUp makes rows of two and leaves a lone last one", () => {
  assert.deepEqual(pairUp([1, 2, 3, 4, 5]), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(pairUp([]), []);
  assert.deepEqual(pairUp([1, 2]), [[1, 2]]);
});

test("nextIndex walks the waiting agents and wraps", () => {
  assert.equal(nextIndex(0, null), null);
  assert.equal(nextIndex(3, null), 0);
  assert.equal(nextIndex(3, 0), 1);
  assert.equal(nextIndex(3, 2), 0);
  assert.equal(nextIndex(2, 5), 0);
});
