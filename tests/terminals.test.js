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
