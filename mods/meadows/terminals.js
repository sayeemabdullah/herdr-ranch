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
 * then everything stays in space and pane order.
 */
export function terminalRows(spaces, panes, home, reviewerIds) {
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
      name: p.name || p.program?.name || p.title || "terminal",
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
