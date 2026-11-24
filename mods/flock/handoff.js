// A handoff is a note from one agent to another: the recent conversation on its screen, previewed by
// the person and sent only when they press Send. Pure helpers; the popup is in main.js.

export const CAP = 12000;
export const MAX_LINES = 1000;

/** A number of lines from typed text: a whole number from 1 to 1000, or null. */
export function parseLines(text) {
  const n = Number(String(text ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_LINES ? n : null;
}

// Rows that are the program's chrome, not the conversation: separators, the prompt box, the status line.
const NOISE = [
  /^[\s─━—\-_=│|]{8,}$/u,
  /^\s*[>❯›]\s*$/u,
  /\bauto mode on\b|shift\+tab|esc to interrupt/i,
  /\bctx\s+\d+%|\b5h\s+\d+%|\blast \$\d/,
];

/** The last `n` conversation lines of a screen, without the footer, capped at CAP characters (the end is kept). */
export function pickContext(screen, n) {
  const rows = String(screen ?? "")
    .split("\n")
    .map((l) => l.replace(/\s+$/u, ""))
    .filter((l) => l.trim() && !NOISE.some((re) => re.test(l)));
  let text = rows.slice(-n).join("\n");
  if (text.length > CAP) text = `…${text.slice(text.length - CAP)}`;
  return text;
}

/** The message that is sent: an intro, then the context between two marker lines. */
export function buildHandoff({ from, intro, context }) {
  const head = (intro ?? "").trim() || `Context from ${from}, so you can pick this up:`;
  return `${head}\n\n--- ${from}'s recent screen ---\n${context}\n--- end ---`;
}
