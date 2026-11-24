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

import { parseCommands, trackGone } from "../mods/meadows/servers.js";
import { parsePr } from "../mods/meadows/worktrees.js";
import { portClash, watchAgent } from "../mods/flock/watch.js";

test("commands are read per pid", () => {
  assert.deepEqual(parseCommands("  101 node server.js --port 3000\n202 /usr/bin/python3 -m http.server\n"), { 101: "node server.js --port 3000", 202: "/usr/bin/python3 -m http.server" });
});

test("a server that ends by itself is reported once and kept for a minute; one you stopped is not", () => {
  const a = { pid: 1, port: 3000, command: "node", cmd: "node a.js", place: { id: "s1" } };
  const b = { pid: 2, port: 4000, command: "node", cmd: "node b.js", place: { id: "s1" } };
  const r = trackGone([a, b], [b], new Set(), [], 1000);
  assert.deepEqual(r.fresh.map((s) => s.pid), [1]);
  assert.deepEqual(r.gone.map((s) => s.pid), [1]);
  const quiet = trackGone([a, b], [b], new Set([1]), [], 1000);
  assert.deepEqual(quiet.fresh, []);
  assert.deepEqual(quiet.gone, []);
  assert.deepEqual(trackGone([b], [b], new Set(), r.gone, 1000 + 30000).gone.map((s) => s.pid), [1]);
  assert.deepEqual(trackGone([b], [b], new Set(), r.gone, 1000 + 61000).gone, []);
  const back = trackGone([b], [b, { ...a, pid: 9 }], new Set(), r.gone, 2000);
  assert.deepEqual(back.gone, []);
});

test("a pull request is read for its state and CI", () => {
  const pr = (o) => JSON.stringify([{ number: 7, state: "OPEN", url: "https://github.com/o/r/pull/7", isDraft: false, statusCheckRollup: [], ...o }]);
  assert.deepEqual(parsePr(pr({})), { number: 7, state: "open", ci: null, url: "https://github.com/o/r/pull/7" });
  assert.equal(parsePr(pr({ isDraft: true })).state, "draft");
  assert.equal(parsePr(pr({ state: "MERGED" })).state, "merged");
  assert.equal(parsePr(pr({ state: "CLOSED" })).state, "closed");
  assert.equal(parsePr(pr({ statusCheckRollup: [{ conclusion: "SUCCESS", status: "COMPLETED" }, { conclusion: "SKIPPED", status: "COMPLETED" }] })).ci, "pass");
  assert.equal(parsePr(pr({ statusCheckRollup: [{ conclusion: "SUCCESS", status: "COMPLETED" }, { conclusion: "FAILURE", status: "COMPLETED" }] })).ci, "fail");
  assert.equal(parsePr(pr({ statusCheckRollup: [{ conclusion: "", status: "IN_PROGRESS" }] })).ci, "pending");
  assert.equal(parsePr(pr({ statusCheckRollup: [{ state: "FAILURE" }] })).ci, "fail");
  assert.equal(parsePr("[]"), null);
  assert.equal(parsePr("not json"), null);
  assert.equal(parsePr(""), null);
});

test("a port that is already in use is spotted on a screen, once", () => {
  assert.equal(portClash("Error: listen EADDRINUSE: address already in use :::3000"), 3000);
  assert.equal(portClash("OSError: [Errno 98] address already in use 127.0.0.1:8000"), 8000);
  assert.equal(portClash("Port 5173 is already in use"), 5173);
  assert.equal(portClash("Something is already running on port 3000"), null);
  assert.equal(portClash("all fine on port 3000"), null);
  assert.equal(portClash(""), null);
  let r = watchAgent({}, { status: "working", screen: "listen EADDRINUSE :::3000" }, 0);
  assert.deepEqual(r.fire, ["port"]);
  assert.equal(r.state.clash, 3000);
  r = watchAgent(r.state, { status: "working", screen: "listen EADDRINUSE :::3000" }, 1000);
  assert.deepEqual(r.fire, []);
  r = watchAgent(r.state, { status: "working", screen: "ready" }, 2000);
  assert.equal(r.state.clash, null);
  r = watchAgent(r.state, { status: "working", screen: "listen EADDRINUSE :::3000" }, 3000);
  assert.deepEqual(r.fire, ["port"]);
});
