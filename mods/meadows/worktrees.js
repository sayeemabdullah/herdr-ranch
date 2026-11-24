// A repo's worktrees from `git worktree list --porcelain`, and the ones worth a section.

/** -> [{ path, branch, detached, main }], the main checkout first. Bare repos and prunable entries are dropped. */
export function parseWorktrees(out) {
  const list = [];
  for (const block of String(out ?? "").split(/\n\n+/)) {
    const wt = {};
    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) wt.path = line.slice(9);
      else if (line.startsWith("branch ")) wt.branch = line.slice(7).replace(/^refs\/heads\//, "");
      else if (line === "detached") wt.detached = true;
      else if (line === "bare") wt.bare = true;
      else if (line.startsWith("prunable")) wt.prunable = true;
    }
    if (wt.path && !wt.bare && !wt.prunable) list.push({ path: wt.path, branch: wt.branch ?? "(detached)", detached: Boolean(wt.detached), main: list.length === 0 });
  }
  return list;
}

/**
 * Repos that have more than one worktree, each with its worktrees and whether a space is open there.
 * repos: [{ name, trees }], spaces: [{ id, path }].
 */
export function worktreeGroups(repos, spaces) {
  const open = new Map((spaces ?? []).filter((s) => s.path).map((s) => [s.path.replace(/\/+$/, ""), s.id]));
  return (repos ?? []).filter((r) => r.trees.length > 1).map((r) => ({
    name: r.name,
    trees: r.trees.map((t) => ({ ...t, space: open.get(t.path.replace(/\/+$/, "")) ?? null })),
  }));
}
