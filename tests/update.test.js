// Run with: node --test tests/update.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVersion, isNewer, parseRelease, updateScript } from "../mods/flock-status/update.js";

test("versions are read with or without the v", () => {
  assert.deepEqual(parseVersion("v0.1.0"), [0, 1, 0]);
  assert.deepEqual(parseVersion(" 1.12.3\n"), [1, 12, 3]);
  assert.equal(parseVersion("0.1"), null);
  assert.equal(parseVersion("latest"), null);
  assert.equal(parseVersion(null), null);
});

test("only a higher release counts as newer, compared number by number", () => {
  assert.equal(isNewer("0.1.0", "v0.2.0"), true);
  assert.equal(isNewer("0.9.0", "0.10.0"), true);
  assert.equal(isNewer("0.1.0", "0.1.1"), true);
  assert.equal(isNewer("0.2.0", "0.2.0"), false);
  assert.equal(isNewer("0.3.0", "0.2.9"), false);
  assert.equal(isNewer("", "0.2.0"), false);
  assert.equal(isNewer("0.1.0", "junk"), false);
});

test("the release JSON gives a tag and page; drafts, pre-releases and junk give null", () => {
  const ok = JSON.stringify({ tag_name: "v0.2.0", html_url: "https://github.com/sayeemabdullah/herdr-ranch/releases/tag/v0.2.0" });
  assert.deepEqual(parseRelease(ok), { tag: "v0.2.0", version: "0.2.0", url: "https://github.com/sayeemabdullah/herdr-ranch/releases/tag/v0.2.0" });
  assert.equal(parseRelease(JSON.stringify({ tag_name: "v0.3.0", prerelease: true })), null);
  assert.equal(parseRelease(JSON.stringify({ tag_name: "v0.3.0", draft: true })), null);
  assert.equal(parseRelease(JSON.stringify({ tag_name: "nightly" })), null);
  assert.equal(parseRelease("not json"), null);
  assert.equal(parseRelease(""), null);
});

test("the update script only ever contains a checked version", () => {
  const script = updateScript("v0.2.0");
  assert.match(script, /archive\/refs\/tags\/v0\.2\.0\.tar\.gz/);
  assert.match(script, /cd "herdr-ranch-0\.2\.0"/);
  assert.match(script, /\.\/install\.sh/);
  assert.throws(() => updateScript('v0.2.0"; rm -rf ~; "'));
  assert.throws(() => updateScript("main"));
});
