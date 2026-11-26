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

/** The memory text: one block per agent (name, space, state, recent screen), the whole kept under MEMORY_CAP. */
export function buildMemory(blocks, cap = MEMORY_CAP) {
  if (!blocks.length) return "";
  const each = Math.max(400, Math.floor(cap / blocks.length) - 200);
  return blocks
    .map((b) => `## ${b.name}${b.animal ? ` (${b.animal})` : ""} — ${[b.space, b.status].filter(Boolean).join(" · ")}\n${screenTail(b.screen, MEMORY_LINES, each) || "(nothing on its screen yet)"}`)
    .join("\n\n");
}

/** What the model is told it is. */
export function systemPrompt(memory, count) {
  const who = count === 0
    ? "No agents are in the memory right now, so answer from the question alone."
    : `Below is the memory: what ${count === 1 ? "one coding agent" : `${count} coding agents`} on the user's ranch recently showed on screen. Use it to plan, compare, spot clashes between them and suggest next steps. Say so when the memory does not tell you something.`;
  return `You are Ranch Chat, a wise owl who helps the user plan with their coding agents. Be concrete and brief. You cannot run commands or change files; you can only talk.\n\n${who}${memory ? `\n\n${memory}` : ""}`;
}

/** The chat so far, newest kept, then the new question: one prompt, since each call starts fresh. */
export function buildPrompt(history, question, cap = HISTORY_CAP) {
  let lines = history.filter((m) => !m.error).map((m) => `${m.role === "user" ? "User" : "Ranch Chat"}: ${m.text}`);
  while (lines.length > 1 && lines.join("\n\n").length > cap) lines = lines.slice(1);
  return `${lines.length ? `${lines.join("\n\n")}\n\n` : ""}User: ${question}\n\nRanch Chat:`;
}

/** Arguments for `claude`: print mode, the chosen model, no tools, nothing saved to disk. */
export const claudeArgs = ({ model, system, prompt }) => ["-p", "--model", modelOf(model).id, "--tools", "", "--no-session-persistence", "--append-system-prompt", system, prompt];

/** The reply from `claude`'s output, or the reason it failed (not installed, not signed in...). */
export function parseReply({ code, stdout, stderr }) {
  const text = String(stdout ?? "").trim();
  if (code === 0 && text) return { ok: true, text };
  const why = `${stderr ?? ""}\n${text}`.trim().split("\n").filter(Boolean).pop() ?? "no answer";
  return { ok: false, text: /not found|ENOENT/i.test(why) ? "Claude Code (the claude command) was not found. Install it, then try again." : why.slice(0, 240) };
}
