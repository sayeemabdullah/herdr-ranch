// The Terminals section: plain terminals (not agents, not the PR Panel) listed under Spaces and Reviewer.

/** "~" for the home folder, "~/x" under it, "…/c/d" for a deep path, a path elsewhere as it is, "" for none. */
export function shortPath(path, home) {
  if (!path) return "";
  let p = path;
  if (home && p === home) return "~";
  if (home && p.startsWith(`${home}/`)) p = `~${p.slice(home.length)}`;
  const parts = p.split("/");
  const rest = p.startsWith("~") ? parts.slice(1) : parts.filter(Boolean);
  return rest.length > 3 ? `…/${rest.slice(-2).join("/")}` : p;
}

/**
 * The rows for the Terminals section. A pane counts when it has a terminal, is not an agent and does not
 * belong to a Reviewer space (those are shown under Reviewer). Programs that are running come before bare shells,
 * then everything stays in space and pane order. `names` maps a terminal to the random name it was given.
 */
export function terminalRows(spaces, panes, home, reviewerIds, names = {}) {
  const spaceOfTab = new Map();
  (spaces ?? []).forEach((space, order) => (space.tabs ?? []).forEach((tab) => spaceOfTab.set(tab.id, { name: space.name, id: space.id, order })));
  const rows = [];
  (panes ?? []).forEach((p, index) => {
    const space = spaceOfTab.get(p.tab);
    if (!p.terminal || p.program?.agent || !space || reviewerIds?.has(space.id)) return;
    const shell = Boolean(p.program?.shell);
    rows.push({
      pane: p.pane,
      terminal: p.terminal,
      name: names?.[p.terminal] || p.name || p.program?.name || p.title || "terminal",
      program: p.program?.name || p.title || "terminal",
      state: shell ? "resting" : "running",
      space: space.name,
      folder: shortPath(p.cwd, home),
      running: !shell,
      icon: p.program?.icon ?? null,
      tint: Boolean(p.program?.tint),
      order: space.order * 1000 + index,
    });
  });
  return rows.sort((a, b) => Number(b.running) - Number(a.running) || a.order - b.order).map(({ order, ...row }) => row);
}

// Names for terminals, like the animals' names: random and unique, and each terminal keeps its own.
export const TERMINAL_NAMES = [
  "Shelly", "Mossy", "Pebble", "Tuck", "Bramble", "Clank", "Stone", "Pip", "Dot", "Rusty", "Nibs", "Bolt",
  "Cobble", "Fennel", "Gizmo", "Hinge", "Ivy", "Juniper", "Knot", "Lug", "Moss", "Nut", "Ollie", "Pixel",
  "Quill", "Rivet", "Sprocket", "Tumble",
];

/**
 * Gives every terminal in `addresses` a random name nobody else has, keeping the names it already had.
 * Names of terminals that are gone are dropped, except while the list is empty (right after a start).
 * Returns { names, changed }.
 */
export function nameTerminals(addresses, names, random = Math.random) {
  const out = { ...(names ?? {}) };
  let changed = false;
  if (addresses.length) {
    for (const key of Object.keys(out)) if (!addresses.includes(key)) { delete out[key]; changed = true; }
  }
  for (const address of addresses) {
    if (out[address]) continue;
    const taken = new Set(Object.values(out));
    let pool = TERMINAL_NAMES.filter((n) => !taken.has(n));
    if (!pool.length) pool = TERMINAL_NAMES.map((n) => `${n} ${taken.size}`).filter((n) => !taken.has(n));
    out[address] = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    changed = true;
  }
  return { names: out, changed };
}
