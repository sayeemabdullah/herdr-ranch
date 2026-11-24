// Run with: node --test tests/servers.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListeners, parseCwds, parseUptimes, pickServers } from "../mods/meadows/servers.js";
import { parseWorktrees, worktreeGroups } from "../mods/meadows/worktrees.js";

const LSOF = "p101\ncnode\nn*:3000\nn[::1]:3000\np202\ncPython\nn127.0.0.1:8000\nn*:8001\np303\ncControlCe\nn*:7000\n";

test("listeners are read per process and port, without repeats", () => {
  assert.deepEqual(parseListeners(LSOF), [
    { pid: 101, command: "node", port: 3000 },
    { pid: 202, command: "Python", port: 8000 },
    { pid: 202, command: "Python", port: 8001 },
    { pid: 303, command: "ControlCe", port: 7000 },
  ]);
  assert.deepEqual(parseListeners(""), []);
  assert.deepEqual(parseListeners(undefined), []);
});

test("folders and uptimes are read", () => {
  assert.deepEqual(parseCwds("p101\nn/Users/me/api\np202\nn/Users/me/web\n"), { 101: "/Users/me/api", 202: "/Users/me/web" });
  assert.deepEqual(parseUptimes("  101       05:12\n  202  1-02:03:04\n  303    03:00:09\n  404       00:07\n"), { 101: "5m", 202: "1d", 303: "3h", 404: "now" });
});

test("only servers running inside a space or worktree are kept, the deepest place wins, lowest port per process", () => {
  const places = [
    { id: "s1", name: "api", path: "/Users/me/api" },
    { id: "s2", name: "api-fix", path: "/Users/me/api/.worktrees/fix" },
    { id: "s3", name: "apix", path: "/Users/me/apix" },
  ];
  const cwds = { 101: "/Users/me/api/server", 202: "/Users/me/api/.worktrees/fix", 303: "/", 404: "/Users/me/apixx" };
  const got = pickServers(parseListeners(LSOF + "p404\ncnode\nn*:9000\n"), cwds, places);
  assert.deepEqual(got.map((s) => [s.pid, s.port, s.place.id]), [[101, 3000, "s1"], [202, 8000, "s2"]]);
});

test("worktrees are parsed, main first, dropping bare and prunable ones", () => {
  const out = "worktree /r/app\nHEAD abc\nbranch refs/heads/main\n\nworktree /r/app-fix\nHEAD def\nbranch refs/heads/fix/login\n\nworktree /r/old\nHEAD 000\ndetached\nprunable gitdir file points to non-existent location\n\nworktree /r/det\nHEAD 111\ndetached\n";
  assert.deepEqual(parseWorktrees(out), [
    { path: "/r/app", branch: "main", detached: false, main: true },
    { path: "/r/app-fix", branch: "fix/login", detached: false, main: false },
    { path: "/r/det", branch: "(detached)", detached: true, main: false },
  ]);
  assert.deepEqual(parseWorktrees(""), []);
});

test("only repos with more than one worktree are listed, each marked with its open space", () => {
  const repos = [
    { name: "app", trees: [{ path: "/r/app", branch: "main", main: true }, { path: "/r/app-fix", branch: "fix", main: false }] },
    { name: "solo", trees: [{ path: "/r/solo", branch: "main", main: true }] },
  ];
  const got = worktreeGroups(repos, [{ id: "s1", path: "/r/app/" }]);
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].trees.map((t) => t.space), ["s1", null]);
});
