// Which local servers are running in your projects: read from `lsof` (listening TCP ports and each
// process's folder) and kept only when the process runs inside a space's folder or a worktree.

/** `lsof -nP -iTCP -sTCP:LISTEN -Fpcn` -> [{ pid, command, port }], one per process and port. */
export function parseListeners(out) {
  const found = [], seen = new Set();
  let pid = null, command = "";
  for (const line of String(out ?? "").split("\n")) {
    const tag = line[0], rest = line.slice(1);
    if (tag === "p") { pid = Number(rest); command = ""; }
    else if (tag === "c") command = rest;
    else if (tag === "n" && pid) {
      const port = Number(/:(\d+)$/.exec(rest)?.[1]);
      const key = `${pid}:${port}`;
      if (port && !seen.has(key)) { seen.add(key); found.push({ pid, command, port }); }
    }
  }
  return found;
}

/** `lsof -a -d cwd -Fpn -p ...` -> { pid: folder }. */
export function parseCwds(out) {
  const cwds = {};
  let pid = null;
  for (const line of String(out ?? "").split("\n")) {
    if (line[0] === "p") pid = Number(line.slice(1));
    else if (line[0] === "n" && pid) cwds[pid] = line.slice(1);
  }
  return cwds;
}

/** `ps -o pid=,etime=` -> { pid: "5m" }. etime is [[dd-]hh:]mm:ss. */
export function parseUptimes(out) {
  const ups = {};
  for (const line of String(out ?? "").split("\n")) {
    const m = /^\s*(\d+)\s+(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)\s*$/.exec(line);
    if (!m) continue;
    const [days, hours, mins] = [Number(m[2] ?? 0), Number(m[3] ?? 0), Number(m[4])];
    ups[Number(m[1])] = days ? `${days}d` : hours ? `${hours}h` : mins ? `${mins}m` : "now";
  }
  return ups;
}

const inside = (cwd, path) => cwd === path || cwd.startsWith(path.replace(/\/+$/, "") + "/");

/**
 * The servers that belong to your work: each listener whose folder is inside a place
 * ({ id, name, path }: a space or a worktree). The deepest matching place wins. One row per
 * process (its lowest port), lowest port first.
 */
export function pickServers(listeners, cwds, places) {
  const byPid = new Map();
  for (const l of listeners ?? []) {
    const cwd = cwds?.[l.pid];
    if (!cwd) continue;
    const place = (places ?? []).filter((p) => p.path && inside(cwd, p.path)).sort((a, b) => b.path.length - a.path.length)[0];
    if (!place) continue;
    const have = byPid.get(l.pid);
    if (!have || l.port < have.port) byPid.set(l.pid, { pid: l.pid, command: l.command, port: l.port, place });
  }
  return [...byPid.values()].sort((a, b) => a.port - b.port);
}
