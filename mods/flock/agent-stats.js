// Model and context use, read off an agent's screen: Herdr doesn't report either.
// Statuslines sit at the bottom, so only the last lines count, newest match first.

const TAIL_LINES = 12;

const USED_PATTERNS = [
  /\bctx (\d{1,3})%/,
  /[▓█▒░]{3,}\s*(\d{1,3})%/,
  // pi's footer: "12.6%/500k".
  /(\d{1,3}(?:\.\d+)?)%\/\d+(?:\.\d+)?[kKmM]\b/,
];
const LEFT_PATTERNS = [
  /Context left until auto-compact:\s*(\d{1,3})%/i,
  /(\d{1,3})% context left/i,
];

const MODEL_PATTERNS = [
  // pi's footer: "(openai-codex) gpt-6.1-sol • medium".
  /\([\w.-]+\)\s+(\S+)\s+•/,
  /\b((?:Opus|Sonnet|Haiku|Fable) \d+(?:\.\d+)?)\b/,
  /\b(gpt-[\w.-]+)/,
];
// Claude's start banner, wherever it still is on screen.
const BANNER = /\b((?:Opus|Sonnet|Haiku|Fable) \d+(?:\.\d+)?) with \w+ effort/;

const MAX_PERCENT = 100;

const tail = (text) => text.split("\n").filter((l) => l.trim()).slice(-TAIL_LINES).reverse();

function firstMatch(lines, patterns) {
  for (const line of lines) {
    for (const pattern of patterns) {
      const m = line.match(pattern);
      if (m) return m[1];
    }
  }
  return null;
}

/** Percent of the context window used, 0..100, or null when the screen doesn't say. */
export function parseContext(text) {
  const lines = tail(text ?? "");
  for (const line of lines) {
    for (const pattern of USED_PATTERNS) {
      const m = line.match(pattern);
      if (m) return Math.min(MAX_PERCENT, Math.round(Number(m[1])));
    }
    for (const pattern of LEFT_PATTERNS) {
      const m = line.match(pattern);
      if (m) return Math.max(0, MAX_PERCENT - Number(m[1]));
    }
  }
  return null;
}

/** The model's name, or null when the screen doesn't say. */
export function parseModel(text) {
  return firstMatch(tail(text ?? ""), MODEL_PATTERNS) ?? (text ?? "").match(BANNER)?.[1] ?? null;
}

/** Percent of the 5-hour usage window already used (Claude's status line shows "5h 32%"), or null. */
export function parseQuota(text) {
  for (const line of tail(text ?? "")) {
    const m = line.match(/\b5h\s+(\d{1,3})%/);
    if (m) return Math.min(MAX_PERCENT, Number(m[1]));
  }
  return null;
}

/** The session's cost in dollars off a Claude-style status line ("$1.25 last $0.00"), or null.
 *  Only a row that looks like the status line counts (it shows the context, the model or the 5h quota),
 *  so a dollar amount in the chat above is never mistaken for the cost. */
const STATUS_ROW = /\bctx\b|\b(?:Opus|Sonnet|Haiku|Fable) \d|\b5h\s+\d|\blast \$/;
export function parseCost(text) {
  for (const line of tail(text ?? "")) {
    if (!STATUS_ROW.test(line)) continue;
    const m = line.match(/(?<!last )\$(\d+(?:\.\d+)?)/);
    if (m) return Number(m[1]);
  }
  return null;
}
