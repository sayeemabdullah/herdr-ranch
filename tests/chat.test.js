import test from "node:test";
import assert from "node:assert/strict";
import { MODELS, DEFAULT_MODEL, modelOf, screenTail, remembered, buildMemory, systemPrompt, buildPrompt, claudeArgs, parseReply } from "../mods/ranch-chat/chat.js";

test("an unknown model falls back to the default", () => {
  assert.equal(modelOf("nope").id, DEFAULT_MODEL);
  assert.equal(modelOf(MODELS[1].id).id, MODELS[1].id);
});

test("screenTail drops the prompt box and status line and keeps the end", () => {
  const screen = ["one", "two", "────────────", "❯", "auto mode on", "ctx 40%", "three"].join("\n");
  assert.equal(screenTail(screen, 2), "two\nthree");
  assert.match(screenTail("x".repeat(500), 5, 100), /^…x{100}$/);
});

test("remembered keeps every living agent except the switched-off ones", () => {
  const live = [{ address: "a" }, { address: "b" }, { address: "c" }];
  assert.deepEqual(remembered(live, ["b"]).map((a) => a.address), ["a", "c"]);
  assert.equal(remembered(live, undefined).length, 3);
  assert.equal(remembered([...live, { address: "new" }], ["b"]).length, 3);
});

test("buildMemory names each agent and handles an empty screen", () => {
  const text = buildMemory([{ name: "Basil", animal: "sheep", space: "docs", status: "working", screen: "fixing the build" }, { name: "Pickle", space: "api", status: "idle", screen: "" }]);
  assert.match(text, /## Basil \(sheep\) — docs · working\nfixing the build/);
  assert.match(text, /## Pickle — api · idle\n\(nothing on its screen yet\)/);
  assert.equal(buildMemory([]), "");
});

test("buildMemory stays under the cap for many agents", () => {
  const blocks = Array.from({ length: 10 }, (_, i) => ({ name: `A${i}`, space: "s", status: "idle", screen: Array.from({ length: 300 }, (_, n) => `line ${n} ${"y".repeat(60)}`).join("\n") }));
  assert.ok(buildMemory(blocks, 20000).length <= 20000 + 10 * 200);
});

test("systemPrompt says how many agents are remembered", () => {
  assert.match(systemPrompt("", 0), /No agents are in the memory/);
  assert.match(systemPrompt("## A", 1), /one coding agent[\s\S]*## A/);
  assert.match(systemPrompt("## A", 3), /3 coding agents/);
});

test("buildPrompt ends with the question, skips errors and trims the oldest first", () => {
  const history = [{ role: "user", text: "hi" }, { role: "owl", text: "hello" }, { role: "owl", text: "boom", error: true }];
  assert.equal(buildPrompt(history, "plan?"), "User: hi\n\nRanch Chat: hello\n\nUser: plan?\n\nRanch Chat:");
  assert.equal(buildPrompt([], "x"), "User: x\n\nRanch Chat:");
  const long = [{ role: "user", text: "old ".repeat(100) }, { role: "owl", text: "new" }];
  assert.doesNotMatch(buildPrompt(long, "q", 50), /old/);
});

test("claudeArgs picks the model, no tools, and puts the prompt last", () => {
  const a = claudeArgs({ model: "claude-haiku-5-5", system: "S", prompt: "P" });
  assert.deepEqual(a.slice(0, 2), ["-p", "--model"]);
  assert.equal(a[2], "claude-haiku-5-5");
  assert.equal(a[a.indexOf("--tools") + 1], "");
  assert.equal(a.at(-1), "P");
  assert.equal(a[a.indexOf("--append-system-prompt") + 1], "S");
});

test("parseReply returns the text, or the last line of the failure", () => {
  assert.deepEqual(parseReply({ code: 0, stdout: " Plan A \n", stderr: "" }), { ok: true, text: "Plan A" });
  assert.equal(parseReply({ code: 1, stdout: "", stderr: "x\nPlease run /login" }).text, "Please run /login");
  assert.match(parseReply({ code: 127, stdout: "", stderr: "claude: command not found" }).text, /was not found/);
  assert.equal(parseReply({ code: 0, stdout: "  ", stderr: "" }).ok, false);
});
