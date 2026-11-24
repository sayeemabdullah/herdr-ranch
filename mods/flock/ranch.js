// Pure helpers for the ranch's day: how sleepy an idle animal is, the board's tree and the work time.
export const MINUTE = 60000;
export const NAP_AFTER = 2 * MINUTE;
export const ALARM_AFTER = 5 * MINUTE;
export const TREE_AT = [1, 4, 8, 13, 19, 26, 30];

/** "rest", "nap" or "alarm" for an idle animal by how long it has been idle; any other status stays itself. */
export const lifeOf = (status, idleFor) =>
  status !== "idle" ? status : idleFor >= ALARM_AFTER ? "alarm" : idleFor >= NAP_AFTER ? "nap" : "rest";

/** Tree stage 0..7 for the number of tasks finished today. */
export const treeStage = (shipped) => TREE_AT.filter((n) => shipped >= n).length;

/** Work time as "42m" or "2h 5m". */
export function worked(ms) {
  const m = Math.round(ms / MINUTE);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** A working spell must last this long to count as a task, so a flicker of activity is not one. */
export const MIN_TASK = 20000;
export const countsAsTask = (ms) => ms >= MIN_TASK;

const REREAD_AFTER = 2 * MINUTE;
/**
 * Whether an agent's screen needs reading now: it is working, you are looking at it, its state just changed,
 * it was never read, or its last reading is over two minutes old. Everyone else keeps the numbers they had.
 */
export function needsRead(agent, now, lastReadAt, changed) {
  return agent.status === "working" || agent.focused || Boolean(changed) || lastReadAt == null || now - lastReadAt > REREAD_AFTER;
}
