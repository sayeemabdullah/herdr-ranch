// Run with: node --test tests/terminals.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { terminalRows, shortPath } from "../mods/meadows/terminals.js";

const spaces = [
  { id: "s1", name: "api-server", tabs: [{ id: "a" }] },
  { id: "s2", name: "web-app", tabs: [{ id: "b" }, { id: "c" }] },
  { id: "s3", name: "PR Reviewer", tabs: [{ id: "d" }] },
];
const shell = { key: "shell", name: "zsh", shell: true, agent: false, icon: null };
const node = { key: "program", name: "node", shell: false, agent: false, icon: "icons/node.svg", tint: false };
const claude = { key: "claude", name: "Claude Code", shell: false, agent: true, icon: null };
const panes = [
  { pane: "p1", tab: "a", terminal: "t1", title: "me@Mac:~/work", name: null, cwd: "/Users/me/work/api", program: shell },
  { pane: "p2", tab: "b", terminal: "t2", title: "vite", name: null, cwd: "/Users/me", program: node },
  { pane: "p3", tab: "a", terminal: "t3", title: "Claude Code", name: null, cwd: "/Users/me/work/api", program: claude },
  { pane: "p4", tab: "c", terminal: null, mod: "files", title: "Files", name: null, cwd: null, program: shell },
  { pane: "p5", tab: "d", terminal: "t5", title: "pr-panel", name: null, cwd: "/Users/me", program: node },
  { pane: "p6", tab: "c", terminal: "t6", title: "dev server", name: "web dev", cwd: "/Users/me/work/web", program: node },
];

test("shortPath shows the home folder as ~ and keeps the last two parts of a long path", () => {
  assert.equal(shortPath("/Users/me", "/Users/me"), "~");
  assert.equal(shortPath("/Users/me/work", "/Users/me"), "~/work");
  assert.equal(shortPath("/Users/me/a/b/c/d", "/Users/me"), "…/c/d");
  assert.equal(shortPath("/opt/x", "/Users/me"), "/opt/x");
  assert.equal(shortPath(null, "/Users/me"), "");
});

test("only plain terminals are listed: no agents, no mod panes, no PR Panel", () => {
  const rows = terminalRows(spaces, panes, "/Users/me", new Set(["s3"]));
  assert.deepEqual(rows.map((r) => r.pane).sort(), ["p1", "p2", "p6"]);
});

test("something running comes before a bare shell; each row names its space, program and folder", () => {
  const rows = terminalRows(spaces, panes, "/Users/me", new Set(["s3"]));
  assert.deepEqual(rows.map((r) => r.pane), ["p2", "p6", "p1"]);
  const vite = rows[0];
  assert.deepEqual({ name: vite.name, space: vite.space, folder: vite.folder, running: vite.running }, { name: "node", space: "web-app", folder: "~", running: true });
  assert.equal(rows[1].name, "web dev");
  assert.equal(rows[2].name, "zsh");
  assert.equal(rows[2].running, false);
});

test("nothing to list gives an empty list, and bad input does not throw", () => {
  assert.deepEqual(terminalRows(spaces, [], "/Users/me", new Set()), []);
  assert.deepEqual(terminalRows(undefined, undefined, undefined, undefined), []);
});

import { nameTerminals, TERMINAL_NAMES } from "../mods/meadows/terminals.js";

test("there are enough unique terminal names", () => {
  assert.ok(TERMINAL_NAMES.length >= 24);
  assert.equal(new Set(TERMINAL_NAMES).size, TERMINAL_NAMES.length);
});

test("each new terminal gets its own random name from the pool, and keeps it", () => {
  let n = 0;
  const random = () => [0.0, 0.5, 0.99][n++ % 3];
  const first = nameTerminals(["t1", "t2", "t3"], {}, random);
  const names = Object.values(first.names);
  assert.equal(names.length, 3);
  assert.equal(new Set(names).size, 3);
  for (const name of names) assert.ok(TERMINAL_NAMES.includes(name), name);
  assert.equal(first.changed, true);
  const again = nameTerminals(["t1", "t2", "t3", "t4"], first.names, random);
  for (const a of ["t1", "t2", "t3"]) assert.equal(again.names[a], first.names[a]);
  assert.ok(!names.includes(again.names.t4));
});

test("a closed terminal's name is dropped, but an empty list (right after a start) drops nothing", () => {
  const start = { t1: "Shelly", t2: "Mossy" };
  assert.deepEqual(nameTerminals(["t1"], start, Math.random).names, { t1: "Shelly" });
  const empty = nameTerminals([], start, Math.random);
  assert.deepEqual(empty.names, start);
  assert.equal(empty.changed, false);
});

test("terminalRows uses the pet name, says what is running, and marks a bare shell as resting", () => {
  const names = { t2: "Mossy", t1: "Shelly" };
  const rows = terminalRows(spaces, panes, "/Users/me", new Set(["s3"]), names);
  const vite = rows.find((r) => r.pane === "p2");
  assert.deepEqual({ name: vite.name, program: vite.program, state: vite.state }, { name: "Mossy", program: "node", state: "running" });
  const sh = rows.find((r) => r.pane === "p1");
  assert.deepEqual({ name: sh.name, program: sh.program, state: sh.state }, { name: "Shelly", program: "zsh", state: "resting" });
  const noName = rows.find((r) => r.pane === "p6");
  assert.equal(noName.name, "web dev");
});
