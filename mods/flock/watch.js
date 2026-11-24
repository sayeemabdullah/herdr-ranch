// Pure helpers for watching agents: warnings before things go wrong, and what a task changed.

const MIN = 60000;
export const STUCK_AFTER = 5 * MIN;
const CTX_WARN = 80;
const CTX_RESET = 70;
const QUOTA_WARN = 90; // percent used: 10% left
const QUOTA_RESET = 80;

/** The screen with counters and spinners removed, so a hung agent's screen compares equal over time. */
export function normalizeScreen(text) {
  return String(text ?? "").replace(/\d+/g, "#").replace(/[^\p{L}#\n ]/gu, "").replace(/ +/g, " ").trim();
}

/**
 * One agent's warnings. `state` is what was remembered last time; `facts` is { status, ctx, quota, screen }
 * (quota = percent of the 5-hour window used). Returns the new state and which warnings to fire now:
 * "context" at 80% used, "quota" at 10% left, "stuck" after 5 minutes working with an unchanged screen.
 * Each fires once until its condition clears.
 */
export function watchAgent(state, facts, now) {
  const next = { ...state };
  const fire = [];
  if (facts.ctx != null) {
    if (facts.ctx >= CTX_WARN && !next.ctx80) { next.ctx80 = true; fire.push("context"); }
    else if (facts.ctx < CTX_RESET) next.ctx80 = false;
  }
  if (facts.quota != null) {
    if (facts.quota >= QUOTA_WARN && !next.sp10) { next.sp10 = true; fire.push("quota"); }
    else if (facts.quota < QUOTA_RESET) next.sp10 = false;
  }
  if (facts.status === "working") {
    const hash = normalizeScreen(facts.screen);
    if (hash !== next.hash) { next.hash = hash; next.sameSince = now; next.stuckFired = false; }
    else if (!next.stuckFired && next.sameSince != null && now - next.sameSince >= STUCK_AFTER) {
      next.stuckFired = true;
      fire.push("stuck");
    }
  } else {
    next.sameSince = null;
    next.stuckFired = false;
    next.hash = null;
  }
  return { state: next, fire };
}

/** { files, add, del } from `git diff --shortstat` output. */
export function parseShortstat(text) {
  const n = (re) => Number((String(text ?? "").match(re) ?? [])[1] ?? 0);
  return { files: n(/(\d+) files? changed/), add: n(/(\d+) insertions?\(\+\)/), del: n(/(\d+) deletions?\(-\)/) };
}

/** What changed between two snapshots (never negative: a commit in between just clears it). */
export function changeSince(before, after) {
  const b = before ?? { files: 0, add: 0, del: 0 };
  const d = (k) => Math.max(0, (after?.[k] ?? 0) - b[k]);
  return { files: d("files"), add: d("add"), del: d("del") };
}

/** "3 files +120 −30" for a card, or null when nothing changed. */
export function formatChange({ files, add, del }) {
  if (!files && !add && !del) return null;
  return `${files} ${files === 1 ? "file" : "files"} +${add} −${del}`;
}
