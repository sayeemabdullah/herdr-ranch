// Run with: node --test tests/reviewer.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrPanel, reviewerSpaces } from "../mods/meadows/reviewer.js";

const panel = { address: "t1f", title: "pr-panel", argv: ["/bin/zsh", "-l"],
  foreground: { name: "node", argv: ["node", "/Users/me/.config/herdr/plugins/github/pr-reviewer-d6dceeadf7b2/src/panel.js"] } };
const shell = { address: "t13", title: "me@Mac:~", argv: ["/bin/zsh", "-l"], foreground: { name: "zsh", argv: ["/bin/zsh", "-l"] } };
const claude = { address: "t5", title: "Plugin - PR Reviewer for herdr", argv: ["claude"], foreground: { name: "claude", argv: ["claude"] } };

test("the panel is recognised by its title, or by the script it runs", () => {
  assert.equal(isPrPanel({ title: "pr-panel" }, undefined), true);
  assert.equal(isPrPanel({ title: "PR Panel" }, undefined), true);
  assert.equal(isPrPanel({ title: "PR watcher" }, undefined), true);
  assert.equal(isPrPanel({ title: "Node" }, panel), true);
  assert.equal(isPrPanel({ title: "x" }, { foreground: { argv: ["node", "/x/pr-reviewer-abc/src/watcher.js"] } }), true);
  assert.equal(isPrPanel({ title: "x" }, { argv: ["/home/me/.local/bin/pr-panel"] }), true);
});

test("a shell, an agent, or a plain title that only mentions the reviewer is not the panel", () => {
  assert.equal(isPrPanel({ title: "sayeem@Mac:~" }, shell), false);
  assert.equal(isPrPanel({ title: "Plugin - PR Reviewer for herdr" }, claude), false);
  assert.equal(isPrPanel({ title: "PR Reviewer" }, undefined), false);
  assert.equal(isPrPanel({ title: "pr-panels notes" }, undefined), false);
  assert.equal(isPrPanel({}, undefined), false);
});

test("only a space with a panel pane in one of its tabs is the Reviewer, whatever its name", () => {
  const spaces = [
    { id: "s1", name: "PR Reviewer", tabs: [{ id: "a" }] },
    { id: "s2", name: "PR Reviewer for herdr", tabs: [{ id: "b" }] },
    { id: "s3", name: "reviews", tabs: [{ id: "c" }] },
  ];
  const panes = [
    { pane: "p1", tab: "a", terminal: "t13", title: "me@Mac:~" },
    { pane: "p2", tab: "b", terminal: "t5", title: "Plugin - PR Reviewer for herdr" },
    { pane: "p3", tab: "c", terminal: "t1f", title: "pr-panel" },
  ];
  assert.deepEqual([...reviewerSpaces(spaces, panes, [panel, shell, claude])], ["s3"]);
  assert.deepEqual([...reviewerSpaces([], [], [])], []);
  assert.deepEqual([...reviewerSpaces(undefined, undefined, undefined)], []);
});
