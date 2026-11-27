// Ranch Chat: the helpers behind the chat window. The memory is whatever the living agents show on their
// screens; the answer comes from one `claude -p` call per message, with that memory as context.

export const MODELS = [
  { id: "claude-fable-5-2", label: "Fable 5.2" },
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
];
export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const modelOf = (id) => MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL);

// How the parrot talks; the user picks one. Each is one line of the system prompt.
export const TONES = [
  { id: "casual", label: "Casual", line: "Sound like a relaxed teammate: simple words, contractions, a light touch." },
  { id: "friendly", label: "Friendly", line: "Sound warm and encouraging, like a kind colleague, without gushing or filler." },
  { id: "direct", label: "Direct", line: "Be blunt and efficient: the answer and the reason, no pleasantries, no softening." },
  { id: "formal", label: "Formal", line: "Sound professional and precise: complete sentences, no slang, no jokes." },
  { id: "playful", label: "Playful", line: "Be playful and witty, a little parrot humour is welcome, but never at the cost of a clear answer." },
];
export const DEFAULT_TONE = "casual";
export const toneOf = (id) => TONES.find((t) => t.id === id) ?? TONES.find((t) => t.id === DEFAULT_TONE);
export const INSTRUCTIONS_CAP = 2000; // characters of the user's own instructions sent with each message

export const MEMORY_LINES = 80; // conversation lines read from each agent's screen
export const MEMORY_CAP = 36000; // characters of memory in all
export const HISTORY_CAP = 12000; // characters of earlier chat sent back with each message

// Rows that are the program's chrome, not the conversation: separators, the prompt box, the status line.
const NOISE = [
  /^[\s─━—\-_=│|]{8,}$/u,
  /^\s*[>❯›]\s*$/u,
  /\bauto mode on\b|shift\+tab|esc to interrupt/i,
  /\bctx\s+\d+%|\b5h\s+\d+%|\blast \$\d/,
];

/** The last `n` conversation lines of a screen, without the footer, at most `cap` characters (the end is kept). */
export function screenTail(screen, n = MEMORY_LINES, cap = 6000) {
  const rows = String(screen ?? "")
    .split("\n")
    .map((l) => l.replace(/\s+$/u, ""))
    .filter((l) => l.trim() && !NOISE.some((re) => re.test(l)));
  const text = rows.slice(-n).join("\n");
  return text.length > cap ? `…${text.slice(text.length - cap)}` : text;
}

/** Everyone alive except the ones switched off: a new agent is in the memory without anyone adding it. */
export const remembered = (live, off) => live.filter((a) => !(off ?? []).includes(a.address));

/** The memory text: one block per agent (name, space, folder, state, git, recent screen), the whole kept under MEMORY_CAP. */
export function buildMemory(blocks, cap = MEMORY_CAP) {
  if (!blocks.length) return "";
  const each = Math.max(400, Math.floor(cap / blocks.length) - 200);
  return blocks
    .map((b) => {
      const head = `## ${b.name}${b.animal ? ` (${b.animal})` : ""} — ${[b.space, b.status].filter(Boolean).join(" · ")}`;
      const where = b.folder ? `\nFolder: ${b.folder}${b.machine ? ` (on ${b.machine}; its files cannot be opened from here)` : ""}` : "";
      const git = b.git ? `\nGit:\n${b.git}` : "";
      return `${head}${where}${git}\nScreen:\n${screenTail(b.screen, MEMORY_LINES, each) || "(nothing on its screen yet)"}`;
    })
    .join("\n\n");
}

/** Read-only git for one folder: the branch, what changed, the last commits. Each is one argv for `git`. */
export const GIT_LOOKS = [
  ["status", "--short", "--branch"],
  ["diff", "--stat", "HEAD"],
  ["log", "-6", "--pretty=format:%h %ar %an: %s"],
];

/** The three git answers as a short block; empty when the folder is not a repo. */
export function gitBlock(results) {
  const [status, diff, log] = results.map((r) => (r?.code === 0 ? String(r.stdout ?? "").trim() : ""));
  if (!status && !log) return "";
  const cut = (t, n) => t.split("\n").slice(0, n).join("\n");
  return [status && cut(status, 30), diff && `Changed since the last commit:\n${cut(diff, 20)}`, log && `Recent commits:\n${log}`].filter(Boolean).join("\n");
}

/** What the model is told it is: a person-like colleague who talks in plain, short chat messages. */
export function systemPrompt(memory, count, { code = false, tone = DEFAULT_TONE, instructions = "" } = {}) {
  const mine = String(instructions ?? "").trim().slice(0, INSTRUCTIONS_CAP);
  const who = count === 0
    ? "No agents are in the memory right now, so answer from the question alone."
    : `Below is what ${count === 1 ? "one coding agent" : `${count} coding agents`} on the user's ranch is doing: its space, folder, git state and recent screen. Use it to plan, compare, spot clashes and suggest next steps. ${code ? "You can also read the code in those folders and run read-only git (log, diff, show, blame) to check before you answer; do that when the answer depends on what the code really says, and name the file." : "You cannot open files, so say so when the memory does not tell you something."}`;
  return [
    "You are Ranch Chat, a parrot who works beside the user like a sharp teammate, helping them plan with their coding agents.",
    "Write the way a person writes in a chat app: plain text only. No markdown at all: no asterisks, no backticks, no headings, no tables, no bullet symbols. Say file names and commands as they are.",
    `Tone: ${toneOf(tone).line}`,
    "Keep it short. Open with the answer. Use two to five short paragraphs separated by a blank line, each one idea. Call agents by their names. If you list things, put each on its own line starting with a number and a dot, three at most.",
    "Be concrete and honest. If you do not know, or cannot see it, say so in a line instead of guessing. Never repeat the question back. You cannot change files, run anything that writes, or message the agents.",
    mine ? `\nThe user's own standing instructions. Follow them in every answer, except that you still never use markdown and never claim to change anything:\n${mine}` : "",
    "",
    who,
    memory ? `\n${memory}` : "",
  ].join("\n");
}

/** Chat-style plain text: the markdown Claude still slips in (bold, code, headings, bullets) removed. */
export function plainChat(text) {
  return String(text ?? "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "- ")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The reply as chat messages: one per paragraph, a long paragraph split at sentences, and at most `most` of them (the last ones are joined). */
export function splitChunks(text, { max = 320, most = 7 } = {}) {
  const out = [];
  for (const para of plainChat(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (para.length <= max) { out.push(para); continue; }
    let cur = "";
    for (const sentence of para.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)) {
      if (cur && (cur + " " + sentence).length > max) { out.push(cur); cur = sentence; } else cur = cur ? `${cur} ${sentence}` : sentence;
    }
    if (cur) out.push(cur);
  }
  while (out.length > most) out.splice(out.length - 2, 2, `${out[out.length - 2]}\n\n${out[out.length - 1]}`);
  return out.length ? out : [""];
}

/** How long a person would take to type it: a beat, then a little per character, never long. */
export const typingMs = (chunk) => Math.min(1700, 450 + String(chunk).length * 9);

/** The chat so far, newest kept, then the new question: one prompt, since each call starts fresh. */
export function buildPrompt(history, question, cap = HISTORY_CAP) {
  let lines = history.filter((m) => !m.error).map((m) => `${m.role === "user" ? "User" : "Ranch Chat"}: ${m.text}`);
  while (lines.length > 1 && lines.join("\n\n").length > cap) lines = lines.slice(1);
  return `${lines.length ? `${lines.join("\n\n")}\n\n` : ""}User: ${question}\n\nRanch Chat:`;
}

/** Read-only tools the parrot may use when it looks at code. */
export const READ_TOOLS = ["Read", "Grep", "Glob", "Bash(git log *)", "Bash(git diff *)", "Bash(git show *)", "Bash(git blame *)", "Bash(git status *)", "Bash(git branch *)", "Bash(git ls-files *)", "Bash(git grep *)"];

/** Arguments for `claude`: print mode, the chosen model, nothing saved to disk. Without `code` it has no tools at all;
 *  with it, only the read-only ones, and it may look inside `dirs`. The prompt comes first so a list option cannot swallow it. */
export function claudeArgs({ model, system, prompt, code = false, dirs = [] }) {
  const base = ["-p", prompt, "--model", modelOf(model).id, "--no-session-persistence", "--append-system-prompt", system];
  if (!code) return [...base, "--tools", ""];
  return [...base, "--tools", "Read,Grep,Glob,Bash", "--permission-mode", "dontAsk", "--allowed-tools", ...READ_TOOLS, ...dirs.flatMap((d) => ["--add-dir", d])];
}

/** The reply from `claude`'s output, or the reason it failed (not installed, not signed in...). */
export function parseReply({ code, stdout, stderr }) {
  const text = String(stdout ?? "").trim();
  if (code === 0 && text) return { ok: true, text };
  const why = `${stderr ?? ""}\n${text}`.trim().split("\n").filter(Boolean).pop() ?? "no answer";
  return { ok: false, text: /not found|ENOENT/i.test(why) ? "Claude Code (the claude command) was not found. Install it, then try again." : why.slice(0, 240) };
}
