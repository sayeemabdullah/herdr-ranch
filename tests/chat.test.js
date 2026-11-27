import test from "node:test";
import assert from "node:assert/strict";
import { MODELS, DEFAULT_MODEL, modelOf, screenTail, remembered, buildMemory, systemPrompt, buildPrompt, claudeArgs, parseReply, plainChat, splitChunks, typingMs, gitBlock, GIT_LOOKS, TONES, toneOf, DEFAULT_TONE, INSTRUCTIONS_CAP } from "../mods/ranch-chat/chat.js";

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
  assert.match(text, /## Basil \(sheep\) — docs · working\nScreen:\nfixing the build/);
  assert.match(text, /## Pickle — api · idle\nScreen:\n\(nothing on its screen yet\)/);
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
  const history = [{ role: "user", text: "hi" }, { role: "parrot", text: "hello" }, { role: "owl", text: "boom", error: true }];
  assert.equal(buildPrompt(history, "plan?"), "User: hi\n\nRanch Chat: hello\n\nUser: plan?\n\nRanch Chat:");
  assert.equal(buildPrompt([], "x"), "User: x\n\nRanch Chat:");
  const long = [{ role: "user", text: "old ".repeat(100) }, { role: "parrot", text: "new" }];
  assert.doesNotMatch(buildPrompt(long, "q", 50), /old/);
});

test("buildMemory carries the folder, machine and git when known", () => {
  const text = buildMemory([{ name: "Basil", space: "docs", status: "idle", folder: "/home/a/docs", machine: "box", git: "## main", screen: "x" }]);
  assert.match(text, /Folder: \/home\/a\/docs \(on box; its files cannot be opened from here\)\nGit:\n## main\nScreen:\nx/);
});

test("gitBlock joins status, diff and log, and is empty outside a repo", () => {
  const ok = (stdout) => ({ code: 0, stdout });
  const text = gitBlock([ok("## main...origin/main\n M a.js"), ok(" a.js | 2 +-"), ok("abc123 2 hours ago Sam: fix")]);
  assert.match(text, /## main[\s\S]*Changed since the last commit:\na\.js \| 2 \+-[\s\S]*Recent commits:\nabc123/);
  assert.equal(gitBlock([{ code: 128, stdout: "" }, { code: 128, stdout: "" }, { code: 128, stdout: "" }]), "");
  assert.equal(GIT_LOOKS.length, 3);
});

test("systemPrompt asks for plain chat, and for code reading only when allowed", () => {
  assert.match(systemPrompt("", 1), /No markdown at all/);
  assert.match(systemPrompt("", 1, { code: true }), /read the code in those folders/);
  assert.doesNotMatch(systemPrompt("", 1), /read the code/);
});

test("the tone and the user's own instructions are in the system prompt", () => {
  assert.match(systemPrompt("", 1, { tone: "direct" }), /Tone: Be blunt/);
  assert.match(systemPrompt("", 1), new RegExp(`Tone: ${toneOf(DEFAULT_TONE).line.slice(0, 20)}`));
  assert.match(systemPrompt("", 1, { tone: "nope" }), /Tone: Sound like a relaxed teammate/);
  assert.equal(TONES.length, 5);
  const text = systemPrompt("## A", 1, { instructions: "  Always answer in Bengali.  " });
  assert.match(text, /standing instructions[\s\S]*\nAlways answer in Bengali\.\n/);
  assert.doesNotMatch(systemPrompt("", 1, { instructions: "   " }), /standing instructions/);
  assert.ok(systemPrompt("", 1, { instructions: "x".repeat(INSTRUCTIONS_CAP + 500) }).length < 6000);
});

test("plainChat removes markdown the way a chat message would not have it", () => {
  assert.equal(plainChat("**Bold** and `code` and __under__"), "Bold and code and under");
  assert.equal(plainChat("## Title\n* one\n* two"), "Title\n- one\n- two");
  assert.equal(plainChat("```js\nlet a = 1\n```"), "let a = 1");
  assert.equal(plainChat("2 * 3 * 4"), "2 * 3 * 4");
});

test("splitChunks makes one message per paragraph and splits long ones at sentences", () => {
  assert.deepEqual(splitChunks("One.\n\nTwo.\n\n\nThree."), ["One.", "Two.", "Three."]);
  const long = splitChunks(`${"First sentence here. ".repeat(10)}Last one.`, { max: 100 });
  assert.ok(long.length > 1 && long.every((c) => c.length <= 140));
  assert.equal(splitChunks("a\n\nb\n\nc\n\nd", { most: 2 }).length, 2);
  assert.deepEqual(splitChunks(""), [""]);
});

test("typingMs grows with the message and stays short", () => {
  assert.ok(typingMs("hi") < typingMs("x".repeat(100)));
  assert.equal(typingMs("x".repeat(5000)), 1700);
});

test("claudeArgs: no tools by default; read-only ones and folders with code", () => {
  const a = claudeArgs({ model: "claude-haiku-5-5", system: "S", prompt: "P" });
  assert.deepEqual(a.slice(0, 2), ["-p", "P"]);
  assert.equal(a[a.indexOf("--model") + 1], "claude-haiku-5-5");
  assert.equal(a[a.indexOf("--tools") + 1], "");
  assert.equal(a[a.indexOf("--append-system-prompt") + 1], "S");
  const c = claudeArgs({ model: "x", system: "S", prompt: "P", code: true, dirs: ["/a", "/b"] });
  assert.equal(c[c.indexOf("--tools") + 1], "Read,Grep,Glob,Bash");
  assert.ok(c.includes("Bash(git log *)") && !c.some((t) => /git (push|commit|add|reset)/.test(t)));
  assert.deepEqual(c.filter((_, i) => c[i - 1] === "--add-dir"), ["/a", "/b"]);
  assert.equal(c[c.indexOf("--permission-mode") + 1], "dontAsk");
});

test("parseReply returns the text, or the last line of the failure", () => {
  assert.deepEqual(parseReply({ code: 0, stdout: " Plan A \n", stderr: "" }), { ok: true, text: "Plan A" });
  assert.equal(parseReply({ code: 1, stdout: "", stderr: "x\nPlease run /login" }).text, "Please run /login");
  assert.match(parseReply({ code: 127, stdout: "", stderr: "claude: command not found" }).text, /was not found/);
  assert.equal(parseReply({ code: 0, stdout: "  ", stderr: "" }).ok, false);
});
