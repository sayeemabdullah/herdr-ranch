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

/**
 * `gh pr list --head <branch> --state all --limit 1 --json number,state,url,isDraft,statusCheckRollup` ->
 * { number, state: "open" | "draft" | "merged" | "closed", ci: "pass" | "fail" | "pending" | null, url } or null.
 */
export function parsePr(json) {
  let list;
  try { list = JSON.parse(json); } catch { return null; }
  const pr = Array.isArray(list) ? list[0] : null;
  if (!pr || !pr.number) return null;
  const state = pr.state === "MERGED" ? "merged" : pr.state === "CLOSED" ? "closed" : pr.isDraft ? "draft" : "open";
  const checks = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
  const bad = (c) => ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "STARTUP_FAILURE", "ACTION_REQUIRED"].includes(c.conclusion ?? c.state);
  const waiting = (c) => (c.status && c.status !== "COMPLETED") || ["PENDING", "EXPECTED"].includes(c.state);
  const ci = !checks.length ? null : checks.some(bad) ? "fail" : checks.some(waiting) ? "pending" : "pass";
  return { number: pr.number, state, ci, url: typeof pr.url === "string" ? pr.url : null };
}
