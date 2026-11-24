// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMON, RARE, NAMES, RARE_CHANCE, pickAnimal, drawRare, variantFor, pickName } from "../mods/flock/casting.js";

const FIRST = () => 0;
const LAST = () => 0.999;

test("there are 8 common animals, 3 rares and enough names", () => {
  assert.equal(COMMON.length, 8);
  assert.deepEqual(RARE, ["fox", "owl", "dragon"]);
  assert.ok(NAMES.length >= 24);
  assert.equal(new Set(NAMES).size, NAMES.length);
  assert.equal(RARE_CHANCE, 0.1);
});

test("picks only a free animal while one is free", () => {
  assert.equal(pickAnimal(COMMON, [], FIRST), COMMON[0]);
  assert.equal(pickAnimal(COMMON, [], LAST), COMMON[7]);
  assert.equal(pickAnimal(COMMON, [COMMON[0]], FIRST), COMMON[1]);
  for (let i = 0; i < 200; i++) assert.equal(pickAnimal(COMMON, COMMON.slice(0, 7)), COMMON[7]);
});

test("starts over among the least used when all are cast", () => {
  assert.equal(pickAnimal(COMMON, COMMON, FIRST), COMMON[0]);
  assert.equal(pickAnimal(COMMON, [...COMMON, COMMON[0]], FIRST), COMMON[1]);
  assert.equal(pickAnimal(COMMON, [...COMMON, ...COMMON, COMMON[3]].filter((a, i) => i !== 5), LAST), COMMON[5]);
});

test("a rare comes up 10% of the time", () => {
  assert.notEqual(drawRare(() => 0.099), null);
  assert.equal(drawRare(() => 0.1), null);
  assert.equal(drawRare(() => 0.9), null);
});

test("all three rares are reachable and the dragon is the rarest", () => {
  const rolls = (...v) => () => v.shift();
  assert.equal(drawRare(rolls(0.0, 0.0)), "fox");
  assert.equal(drawRare(rolls(0.0, 0.7)), "owl");
  assert.equal(drawRare(rolls(0.0, 0.95)), "dragon");
});

test("a repeated animal gets the alternate colour variant", () => {
  assert.equal(variantFor("cow", []), 0);
  assert.equal(variantFor("cow", ["sheep"]), 0);
  assert.equal(variantFor("cow", ["cow"]), 1);
  assert.equal(variantFor("cow", ["cow", "cow"]), 1);
});

test("names never repeat while the pool lasts", () => {
  for (let i = 0; i < 200; i++) assert.notEqual(pickName(["Clover"]), "Clover");
  assert.ok(NAMES.includes(pickName(NAMES)));
  assert.ok(NAMES.includes(pickName([])));
});

import { castAgents } from "../mods/flock/casting.js";

const NO_RARE = () => 0.5;
const agentsOf = (...addresses) => addresses.map((address) => ({ address }));
const liveOf = (...addresses) => addresses.map((address) => ({ address, state: "live" }));
const empty = () => ({ cast: {}, names: {}, variants: {} });

test("castAgents gives every new agent a distinct common animal, a unique name and variant 0", () => {
  const addrs = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const out = castAgents(agentsOf(...addrs), liveOf(...addrs), empty(), NO_RARE);
  assert.equal(new Set(Object.values(out.cast)).size, 8);
  assert.equal(new Set(Object.values(out.names)).size, 8);
  assert.ok(Object.values(out.variants).every((v) => v === 0));
  assert.equal(out.changed, true);
});

test("castAgents with nine agents repeats an animal in the alternate colours and never throws", () => {
  const addrs = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q"];
  const out = castAgents(agentsOf(...addrs), liveOf(...addrs), empty(), NO_RARE);
  assert.equal(Object.keys(out.cast).length, 17);
  assert.equal(Object.values(out.variants).filter((v) => v === 1).length, 9);
});

test("castAgents keeps what a terminal already has", () => {
  const state = { cast: { a: "cow" }, names: { a: "Clover" }, variants: { a: 1 } };
  const out = castAgents(agentsOf("a"), liveOf("a"), state, NO_RARE);
  assert.deepEqual(out.cast, { a: "cow" });
  assert.deepEqual(out.names, { a: "Clover" });
  assert.deepEqual(out.variants, { a: 1 });
  assert.equal(out.changed, false);
});

test("castAgents does not prune when terminals() is empty right after a start", () => {
  const state = { cast: { a: "cow", b: "duck" }, names: { a: "Clover", b: "Pepper" }, variants: { a: 0, b: 0 } };
  const out = castAgents(agentsOf("a", "b"), [], state, NO_RARE);
  assert.deepEqual(out.cast, { a: "cow", b: "duck" });
  assert.equal(out.changed, false);
});

test("castAgents drops a closed terminal and hands its animal to the next agent before any repeat", () => {
  const state = { cast: { a: "cow", b: "duck" }, names: { a: "Clover", b: "Pepper" }, variants: { a: 0, b: 0 } };
  // b closes; a stays; c is new and takes a free animal, never cow
  const out = castAgents(agentsOf("a", "c"), liveOf("a", "c"), state, () => 0.999);
  assert.equal(out.cast.b, undefined);
  assert.equal(out.names.b, undefined);
  assert.equal(out.variants.b, undefined);
  assert.notEqual(out.cast.c, "cow");
  assert.equal(out.variants.c, 0);
});

test("castAgents can cast a rare, which uses no common slot and never gets a variant", () => {
  const rolls = (...v) => () => (v.length ? v.shift() : 0.5);
  const out = castAgents(agentsOf("a", "b"), liveOf("a", "b"), empty(), rolls(0.0, 0.0));
  assert.equal(out.cast.a, "fox");
  assert.equal(out.variants.a, 0);
  assert.ok(COMMON.includes(out.cast.b));
});
