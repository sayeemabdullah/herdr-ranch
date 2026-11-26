// How the agent list is shown: which state to keep, and how cards sit side by side.

export const STATES = [
  { id: "all", label: "Everyone" },
  { id: "blocked", label: "Needs you" },
  { id: "working", label: "Working" },
  { id: "done", label: "Done" },
  { id: "idle", label: "Resting" },
];

// Keeps the agents in one state; "all" (or anything unknown) keeps everyone.
export const filterByState = (list, state) => (STATES.some((s) => s.id === state) && state !== "all" ? list.filter((a) => a.status === state) : list);

// [a, b, c] -> [[a, b], [c]]: the rows of a two-column list.
export const pairUp = (items) => {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
};

// The one to jump to after `last` (an index, or null for none yet), wrapping around; null when nobody waits.
export const nextIndex = (count, last) => (count > 0 ? (last == null || last >= count - 1 ? 0 : last + 1) : null);
