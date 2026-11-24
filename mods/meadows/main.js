// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind. Agent state lives in the agents list, not here. Click to
// switch, right-click for its menu, drag to reorder.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { spaces, machines, panes, terminals, run, openOverlay, exec, hc, theme, shared, setShared, watchFolder, window, layout, notify, props, closeOverlay } from "herdr";
import { reviewerSpaces } from "./reviewer.js";
import { parseListeners, parseCwds, parseUptimes, parseCommands, parseSs, pickServers, trackGone, shortCommand } from "./servers.js";
import { parseWorktrees, worktreeGroups, parsePr } from "./worktrees.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }) => (tree ? 28 : 30);
const RAIL_CELL = 32;
// A space's name and its git tail never shrink below this, so a short one ("api")
// stays readable instead of turning into an ellipsis next to a long branch.
const SIDE_MIN = 48;
const railCell = (el) => h_flex().flex_none().justify_center().child(el);
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;
// Places looked at together (two git runs each). All at once, a few hundred spaces
// run out of the app's open files (256 when started from the Dock on macOS) or
// past a machine core's 16 running execs, and those spaces wait for FALLBACK.
const AT_ONCE = 6;

// Both runs, finished: a place isn't done while one of its runs still holds a slot.
async function both(a, b) {
  const done = await Promise.allSettled([a, b]);
  const failed = done.find((d) => d.status === "rejected");
  if (failed) throw failed.reason;
  return done.map((d) => d.value);
}

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

const REALMS = ["barn", "silo", "haystack", "pond", "windmill", "orchard", "fence"];
const REALMS_KEY = "meadows.emblems";
// Each running server is a barnyard critter, kept per port; a server that ended wears the red badge.
const CRITTERS = ["pig", "cat", "frog", "hedgehog"];
const CRITTERS_KEY = "meadows.critters";
// Sections the person can hide (the "..." button next to Spaces): shared state, so every window agrees.
const HIDE_KEY = "ranch.hide";
const hidden = (key) => (shared(HIDE_KEY) ?? {})[key] === true;
const FOLD_KEY = "ranch.folded";
// A shell that runs one command the way the person's own terminal would (their PATH), on macOS and Linux.
const inLoginShell = (cmd) => ["/bin/sh", "-c", 'exec "${SHELL:-/bin/sh}" -lc "$0"', cmd];
function critterPicture(name, state) {
  const sprite = (file) => image(`mods/flock/sprites/${file}.svg`).w(32).h(32).flex_none();
  if (state !== "running") return sprite(`${name}-blocked`);
  return div().relative().w(32).h(32).flex_none()
    .child(sprite(name).loop("opacity", { from: 7, to: -6, period: 900, easing: "linear" }))
    .child(sprite(`${name}-2`).absolute().top(0).left(0).loop("opacity", { from: -6, to: 7, period: 900, easing: "linear" }));
}
// A 20x20 emblem drawn 1:1 stays crisp.
const EMBLEM_SIZE = 20;
// The emblems follow your clock like Pixel HQ's windows: dawn, day, dusk, night (day has no suffix).
const phaseSuffix = (hour = new Date().getHours()) =>
  hour >= 5 && hour < 8 ? "-dawn" : hour >= 8 && hour < 17 ? "" : hour >= 17 && hour < 20 ? "-dusk" : "-night";
// While a space has an agent working, a little star twinkles in the corner of its emblem.
function emblemPicture(src, working, t) {
  const pic = image(src).w(EMBLEM_SIZE).h(EMBLEM_SIZE).flex_none();
  if (!working) return pic;
  return div().relative().w(EMBLEM_SIZE).h(EMBLEM_SIZE).flex_none()
    .child(pic)
    .child(div().absolute().top(-1).right(-1).size(5).bg(t.working ?? "#f5cb45")
      .loop("opacity", { from: -1, to: 2, period: 900, easing: "linear" }));
}
// The PR Reviewer's space always shows the sheepdog, Scout, and never uses up an emblem.
// A space is the Reviewer only while PR Reviewer's PR Panel (or its watcher) runs in it, not by its name;
// render() refreshes this set on every pass.
let reviewerIds = new Set();
const isReviewer = (w) => reviewerIds.has(w.id);

// Each space keeps the emblem it got first; a new one takes the first emblem no space has.
function realmsFor(list) {
  const stored = shared(REALMS_KEY) ?? {};
  const realms = { ...stored };
  let changed = false;
  // spaces() is empty while machines load: pruning then would reassign every realm.
  if (list.length) {
    const alive = new Set(list.map((w) => w.id));
    for (const id of Object.keys(realms)) if (!alive.has(id)) { delete realms[id]; changed = true; }
  }
  for (const w of list) {
    if (realms[w.id] || isReviewer(w)) continue;
    const taken = new Set(Object.values(realms));
    realms[w.id] = REALMS.find((r) => !taken.has(r)) ?? REALMS[taken.size % REALMS.length];
    changed = true;
  }
  if (changed) setShared(REALMS_KEY, realms);
  return realms;
}

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

export default class Spaces extends View {
  init(_props, cx) {
    if (props()?.ranchSettings) return; // the "Show in the sidebar" popup needs none of the below
    try { this.sectionsFolded = new Set(JSON.parse(localStorage.getItem(FOLD_KEY) ?? '["worktrees"]')); } catch { this.sectionsFolded = new Set(["worktrees"]); }
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Map(); // local repos' pending folder watches
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.scroll = ScrollHandle.new(); // the list's position: the active space is brought into view through it
    this.activeAt = -1; // the active space's place among the list's children (headers and rows), -1 when not drawn
    this.machines = [];
    try {
      this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
      if (!this.reconnecting || typeof this.reconnecting !== "object" || Array.isArray(this.reconnecting)) this.reconnecting = {};
      for (const state of Object.values(this.reconnecting)) state.busy = false;
    } catch { this.reconnecting = {}; }
    try { this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]")); } catch { this.folded = new Set(); }
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    cx.timer.every(300000, (cx) => cx.notify());
    // Refresh only when the refs could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
    // The Servers and Worktrees sections (local spaces only): what listens in your projects, and each repo's worktrees.
    this.servers = []; // [{ pid, command, port, place, up }]
    this.trees = []; // [{ name, trees: [{ path, branch, main }] }]
    this.stopping = null; // { pid, until }: a stop waiting for its second press
    this.stoppedPids = new Set(); // servers stopped from here: not a surprise
    this.gone = []; // servers that ended by themselves, kept a minute with a Restart button
    this.prs = {}; // `${repo} ${branch}` -> { pr, at }: the branch's pull request and its CI
    this.listing = false;
    cx.timer.after(3000, (cx) => this.refreshTrees(cx));
    this.refreshServers(cx);
    cx.timer.after(8000, (cx) => this.refreshPrs(cx));
    cx.timer.every(120000, (cx) => this.refreshPrs(cx));
    cx.timer.every(20000, (cx) => this.refreshTrees(cx));
    cx.timer.every(5000, (cx) => this.refreshServers(cx));
  }

  // Each local repo's worktrees (git worktree list), de-duplicated by repo.
  async refreshTrees(cx) {
    try {
      const repos = new Map();
      for (const g of Object.values(this.git)) {
        if (!g) continue;
        const [on, common] = JSON.parse(g.repo);
        if (!on) repos.set(common, g.name);
      }
      const out = [];
      for (const [common, name] of repos) {
        const cwd = common.endsWith("/.git") ? common.slice(0, -5) : common;
        const r = await exec("git", ["worktree", "list", "--porcelain"], { cwd });
        if (r.code === 0) out.push({ name, trees: parseWorktrees(r.stdout) });
      }
      if (JSON.stringify(out) !== JSON.stringify(this.trees)) { this.trees = out; cx.notify(); }
    } catch {}
  }

  // Listening TCP ports whose process runs inside a space or a worktree, with how long they have been up.
  async refreshServers(cx) {
    if (this.listing || narrow()) return;
    this.listing = true;
    try {
      const sp = spaces(), ps = panes();
      const places = sp.filter((s) => !s.machine).map((s) => ({ id: s.id, name: s.name, path: place(s, ps) })).filter((p) => p.path);
      for (const g of this.trees) for (const t of g.trees) if (!places.some((p) => p.path === t.path)) places.push({ id: null, name: t.branch, path: t.path });
      const linux = window()?.platform !== "macos";
      let listeners = [];
      if (linux) {
        const ss = await exec("ss", ["-H", "-ltnp"]).catch(() => null);
        if (ss?.code === 0) listeners = parseSs(ss.stdout);
      }
      if (!listeners.length) listeners = parseListeners((await exec("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"]).catch(() => ({ stdout: "" }))).stdout);
      const pids = [...new Set(listeners.map((l) => l.pid))];
      let cwds = {};
      if (pids.length) {
        // Linux keeps each process's folder in /proc; macOS asks lsof.
        const proc = linux
          ? await exec("sh", ["-c", 'for p in "$@"; do printf "p%s\\nn%s\\n" "$p" "$(readlink /proc/$p/cwd 2>/dev/null)"; done', "sh", ...pids.map(String)]).catch(() => null)
          : null;
        cwds = proc?.code === 0 ? parseCwds(proc.stdout) : {};
        if (!Object.keys(cwds).length) cwds = parseCwds((await exec("lsof", ["-a", "-d", "cwd", "-Fpn", "-p", pids.join(",")]).catch(() => ({ stdout: "" }))).stdout);
      }
      const picked = pickServers(listeners, cwds, places);
      const ups = picked.length ? parseUptimes((await exec("ps", ["-o", "pid=,etime=", "-p", picked.map((x) => x.pid).join(",")])).stdout) : {};
      const cmds = picked.length ? parseCommands((await exec("ps", ["-o", "pid=,command=", "-p", picked.map((x) => x.pid).join(",")])).stdout) : {};
      const next = picked.map((x) => ({ ...x, up: ups[x.pid] ?? "", cmd: cmds[x.pid] ?? "" }));
      // A server that ended by itself: a toast, and a card with Restart for a minute.
      const tracked = trackGone(this.servers, next, this.stoppedPids, this.gone, Date.now());
      for (const g of tracked.fresh) {
        notify({ title: `${g.place.name || "A server"} :${g.port} stopped`, body: `${g.command} ended. Restart it from the Servers list.`, level: "warning" });
      }
      const goneChanged = JSON.stringify(tracked.gone) !== JSON.stringify(this.gone);
      this.gone = tracked.gone;
      if (goneChanged || JSON.stringify(next) !== JSON.stringify(this.servers)) { this.servers = next; cx.notify(); }
    } catch {
      // lsof missing or slow: keep what the list showed.
    }
    this.listing = false;
  }

  // Open the server's page, or stop it: the first press asks, the second (within 4 seconds) sends SIGTERM.
  stop(server, cx) {
    if (this.stopping?.pid === server.pid && Date.now() < this.stopping.until) {
      this.stopping = null;
      this.stoppedPids.add(server.pid);
      exec("kill", ["-TERM", String(server.pid)]).then(() => this.refreshServers(cx)).catch(() => {});
    } else {
      this.stopping = { pid: server.pid, until: Date.now() + 4000 };
      cx.timer.after(4100, (cx) => cx.notify());
    }
    cx.notify();
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now)) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    for (const k of Object.keys(this.git)) if (!keys.has(k)) {
      delete this.git[k];
      delete this.checked[k];
      this.unsure.delete(k);
    }
    const repos = new Set(Object.values(this.git).filter(Boolean).map((g) => g.repo));
    for (const [repo, pending] of this.watching) if (!repos.has(JSON.stringify([null, repo]))) {
      this.watching.delete(repo);
      pending.cancel();
    }
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(AT_ONCE, keys.length) }, async () => {
          while (next < keys.length) await this.check(keys[next++], cx);
        }));
      }
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // Ref-only reads avoid scanning the worktree or waking its index watch.
      // Two reads: a folder name may itself contain a newline.
      const [r, common] = await both(
        exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd, on }),
        exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on }),
      );
      if (r.code !== 0 || common.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.code !== 0 ? r.stderr : common.stderr)) {
          this.unsure.add(key);
          this.git[key] ??= null;
        } else this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = r.stdout.replace(/\n$/, ""), repo = common.stdout.replace(/\n$/, "");
      const [branch, counts] = await both(
        exec("git", ["symbolic-ref", "-q", "HEAD"], { cwd, on }),
        exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd, on }),
      );
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const [ahead, behind] = counts.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [0, 0];
      const info = { name, branch: branch.code === 0 ? branch.stdout.trim().replace(/^refs\/heads\//, "") : "(detached)", ahead, behind, repo: JSON.stringify([on, repo]), linked: repo !== `${top}/.git` };
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    const pending = watchFolder(repo);
    this.watching.set(repo, pending);
    cx.spawn(async (cx) => {
      let current = pending;
      try {
        for (;;) {
          await current;
          if (this.watching.get(repo) !== current) return;
          const mine = JSON.stringify([null, repo]);
          const keys = Object.keys(this.git).filter((k) => this.git[k]?.repo === mine);
          if (!keys.length) break;
          this.refreshGit(keys, cx);
          current = watchFolder(repo);
          this.watching.set(repo, current);
        }
      } catch {}
      if (this.watching.get(repo) === current) this.watching.delete(repo);
    });
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
  }

  orderingDue(now) {
    return this.ordering && now - this.ordering.at >= 1000
      && this.ordering.machines.every(name => machines().some(m => m.name === name && m.layout === "ready"));
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    // Simulate the batch so later indexes include earlier moves. An attempted
    // write can lose a sync conflict: allow the echo to settle before retrying.
    const order = sp.map(w => w.id);
    const target = out.map(r => r.w.id);
    const key = JSON.stringify([order, target, machines()]);
    if (order.every((id, i) => id === target[i])) {
      this.ordering = null;
    } else if (this.ordering?.key !== key || this.orderingDue(Date.now())) {
      const moved = new Set();
      this.ordering = { key, at: Date.now(), machines: [] };
      for (let i = 0; i < out.length; i++) {
        const from = order.indexOf(out[i].w.id);
        if (from === i) continue;
        run("space.move", { id: out[i].w.id, index: i + 1 });
        moved.add(out[i].w.machine ?? null);
        order.splice(i, 0, order.splice(from, 1)[0]);
      }
      this.ordering.machines = [...moved];
    }
    return out.filter(r => this.shown.has(r.w.id));
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const every = this.ordered();
    // The PR Reviewer's space gets a section of its own under Spaces (see reviewerSection); the rail keeps it.
    const split = !collapsed && !hidden("reviewer");
    this.reviewers = split ? every.filter((r) => isReviewer(r.w)) : [];
    const rows = split ? every.filter((r) => !isReviewer(r.w)) : every;
    const draw = (r) => (collapsed ? this.compact(r, t) : this.row(r, t));
    // Where the active space's row lands among the children this returns: the list scrolls by its direct
    // children, and machine headers, login notes and loading rows count too.
    this.activeAt = -1;
    let before = 0;
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => h_flex().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).items_center().when(collapsed, el => el.justify_center()).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) {
      if (loading(null) && !rows.length) return [loadingRow(null)];
      this.activeAt = rows.findIndex(r => r.w.active);
      return rows.map(draw);
    }
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const login = machine?.state === "needs_login" ? `hc machine login ${m}` : null;
      const folded = this.folded.has(m);
      const icon = svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none();
      const badge = div().absolute().right(-3).bottom(-2).size(6).rounded(3).border_1().border_color(t.chrome).bg(connected ? t.ansi2 : t.dim);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .when(collapsed, el => el.mt(4).w(RAIL_CELL).justify_center().rounded(6).tooltip(login ? `${m} needs a login: run ${login}. Click for Copy.` : m ? `${m} · ${connected ? "connected" : (machine?.state ?? "asleep").replace(/_/g, " ")}` : "This computer"))
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          if (collapsed && login) { run("app.settings", { section: "machines" }); return; }
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .when(machine?.keeps_running_after_logout === false, el => el.child(div().id(`machine-logout-${m}`)
          .flex_none().text_color(t.blocked).tooltip("Agents stop when you disconnect. Click for the fix.")
          .on_click((_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "machine-add", kind: "dialog", width: 560 }); }).child("⚠")))
        .when(!collapsed, el => el.child(icon))
        .when(collapsed, el => el.child(div().relative().flex_none().child(icon).when(Boolean(m), el => el.child(badge))))
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected && !rebuilt && !login, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(3).items_center()
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", { machine: m ?? "" }))
        .when(collapsed, el => el.w(RAIL_CELL).rounded(6).justify_center().tooltip(`New space on ${m ?? "this computer"}`)
          .child(h_flex().size(18).rounded(5).border_1().border_color(t.dim).items_center().justify_center()
            .child(svg("mods/workspace-chrome/plus.svg").size(10))))
        .when(!collapsed, el => el.child(svg("mods/workspace-chrome/plus.svg").size(12)).child("New space there"));
      if (!collapsed && rebuilt) { before += 1; return [head]; }
      const cell = collapsed ? railCell : (el) => el;
      const guidance = !collapsed && login ? [v_flex().px(8).pb(6).gap(3).flex_none()
        .child(div().text_size(11).text_color(t.blocked).child("needs a login: run"))
        .child(h_flex().gap(5).items_center()
          .child(div().flex_1().min_w(0).truncate().tooltip(login).text_size(11).text_color(t.muted).child(login))
          .child(div().id(`machine-login-copy-${m}`).flex_none().px(5).py(2).rounded(4)
            .text_size(11).text_color(t.foreground).bg(t.raised).cursor_pointer().hover(s => s.bg(t.hover))
            .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(login); this.copiedLogin = login; cx.notify(); })
            .child(this.copiedLogin === login ? "Copied" : "Copy")))] : [];
      const items = [cell(head), ...guidance, ...(folded ? [] : mine.length ? mine.map(draw) : [loading(m) ? loadingRow(m) : cell(empty)])];
      const first = folded ? -1 : mine.findIndex(r => r.w.active);
      if (first >= 0) this.activeAt = before + 1 + guidance.length + first;
      before += items.length;
      return items;
    });
  }

  // Only what's unusual, after the name: "herdr \u00b7 spike \u21912 \u21931". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one. When the row is full, it
  // and the name both start from their text's width and give way in proportion.
  gitTail(g, tree, name, t) {
    const raw = g.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" \u00b7 ");
    return h_flex()
      .flex_auto()
      .min_w(where ? SIDE_MIN : 0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(11.5)
      .text_color(t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`\u2193${g.behind}`)));
  }

  row({ w, i, g, tree }, t) {
    const on = w.active;
    const fromIndex = this.pressed === null ? -1 : spaces().findIndex(s => s.id === this.pressed);
    const colors = shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    const realm = realmsFor(spaces())[w.id];
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .h(rowHeight({ tree }))
      .flex_none()
      .justify_center()
      .rounded(8)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, line => line.bottom(0))
          .when(fromIndex > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = w.id;
        this.over = w.id;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find(s => s.id === this.pressed);
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? w.id : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === w.id && from !== w.id) {
          const index = spaces().findIndex(s => s.id === w.id);
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === w.id) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .child(
        h_flex()
          .gap(9)
          .items_center()
          .when(Boolean(tree), el => el.pl(22).child(svg("mods/workspace-chrome/branch.svg").size(13).flex_none().text_color(t.dim)))
          .when(!tree && isReviewer(w), el => el.child(emblemPicture("mods/flock/sprites/sheepdog.svg", w.status === "working", t)))
          .when(!tree && !isReviewer(w) && Boolean(realm), el => el.child(emblemPicture(`mods/meadows/emblems/${realm}${phaseSuffix()}.svg`, w.status === "working", t)))
          .when(!tree && !isReviewer(w) && !realm, el => el.child(h_flex().size(18).flex_none().rounded(5).bg(fill).items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff").child([...w.name][0]?.toUpperCase() ?? "?")))
          .child(div().flex_initial().min_w(SIDE_MIN).truncate().text_color(t.foreground).child(w.name))
          .child(g ? this.gitTail(g, tree, w.name, t) : div().flex_1()),
      );
  }

  compact({ w, i }, t) {
    return railCell(h_flex()
      .id(`space-${w.id}`)
      .relative()
      .w(RAIL_CELL)
      .h(26)
      .rounded(6)
      .justify_center()
      .items_center()
      .when(w.active, (el) => el.bg(t.selected))
      .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().absolute().right(5).text_color(tone(t, w.status)).child(glyph(w.status))));
  }

  toggleFold(key, cx) {
    if (this.sectionsFolded.has(key)) this.sectionsFolded.delete(key); else this.sectionsFolded.add(key);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...this.sectionsFolded])); } catch { /* ignore */ }
    cx.notify();
  }

  // A section's heading: a chevron, the name, a count, and a click to fold it. A thin line sets it off from the one above.
  sectionHeader(t, key, label, count, extra) {
    const open = !this.sectionsFolded.has(key);
    return v_flex().flex_none()
      .child(div().h(1).mx(16).mt(8).mb(4).bg(t.border).opacity(0.45))
      .child(h_flex().id(`fold-${key}`).h(28).pl(12).pr(10).gap(5).items_center().cursor_pointer().text_size(11.5).text_color(t.dim)
        .hover((el) => el.text_color(t.foreground))
        .on_click((_e, cx) => this.toggleFold(key, cx))
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none())
        .child(div().flex_1().child(label))
        .when(count != null, (el) => el.child(div().text_color(t.dim).child(String(count))))
        .when(Boolean(extra), (el) => el.child(extra)));
  }

  // A section like Spaces and Agents, there only while a PR Reviewer space exists: Scout, what it is doing,
  // and one click to its space.
  reviewerSection(t) {
    const WORDS = { working: "Reviewing", blocked: "Needs you", done: "Review done", idle: "Waiting for PRs" };
    const sprite = (name) => image(`mods/flock/sprites/${name}.svg`).w(32).h(32).flex_none();
    const pose = (status) => (status === "working" ? "sheepdog-work" : status === "idle" ? "sheepdog-idle" : status === "blocked" || status === "done" ? `sheepdog-${status}` : "sheepdog");
    const second = (status) => (status === "working" ? "sheepdog-2" : status === "idle" ? "sheepdog-idle-2" : null);
    const picture = (status) => {
      const still = sprite(pose(status));
      const next = second(status);
      if (!next) return still;
      const period = status === "working" ? 800 : 1800;
      return div().relative().w(32).h(32).flex_none()
        .child(still.loop("opacity", { from: 7, to: -6, period, easing: "linear" }))
        .child(sprite(next).absolute().top(0).left(0).loop("opacity", { from: -6, to: 7, period, easing: "linear" }));
    };
    return v_flex().flex_none().pb(4).mx(-8)
      .child(this.sectionHeader(t, "reviewer", "Reviewer", null))
      .children(this.sectionsFolded.has("reviewer") ? [] : this.reviewers.map(({ w }) => h_flex().id(`reviewer-${w.id}`).mx(8).my(2).px(8).h(50).gap(10).items_center().rounded(8)
        .border(1).border_color(w.active ? t.input : t.border)
        .when(w.active, (el) => el.bg(t.selected))
        .cursor_pointer().hover((el) => el.bg(t.hover))
        .on_click(() => run("space.select", { id: w.id }))
        .child(picture(w.status))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().font_semibold().text_color(t.foreground).child("Scout"))
          .child(div().truncate().text_size(11).text_color(w.status === "blocked" ? t.blocked : t.dim).child(`${WORDS[w.status] ?? "Waiting for PRs"} · ${w.name}`)))
        .child(div().text_color(tone(t, w.status)).child(glyph(w.status)))));
  }

  // Which critter each listed port wears: the first one nobody else has, kept in shared state.
  critters() {
    const live = new Set([...this.servers, ...this.gone].map((x) => x.port));
    const stored = shared(CRITTERS_KEY) ?? {};
    const map = Object.fromEntries(Object.entries(stored).filter(([port]) => live.has(Number(port))));
    let changed = Object.keys(map).length !== Object.keys(stored).length;
    for (const port of [...live].sort((a, b) => a - b)) {
      if (map[port]) continue;
      const taken = new Set(Object.values(map));
      map[port] = CRITTERS.find((c) => !taken.has(c)) ?? CRITTERS[taken.size % CRITTERS.length];
      changed = true;
    }
    if (changed) setShared(CRITTERS_KEY, map);
    return map;
  }

  // Run the stopped server's command again, in a tab you can see, in the folder it ran in.
  restart(g, cx) {
    const args = { folder: g.cwd, argv: inLoginShell(g.cmd), name: `:${g.port}` };
    if (g.place.id) run("tab.new", { ...args, space: g.place.id });
    else run("space.new", { folder: g.cwd, machine: "", argv: args.argv });
    this.gone = this.gone.filter((x) => x.pid !== g.pid);
    cx.notify();
  }

  // Each non-main worktree's pull request and CI, from gh (a repo without GitHub, or no gh, is left out).
  async refreshPrs(cx) {
    if (this.prsBusy) return;
    this.prsBusy = true;
    try {
      let changed = false;
      for (const g of this.trees) {
        for (const wt of g.trees) {
          if (wt.main || wt.detached) continue;
          const key = `${g.name} ${wt.branch}`;
          const had = this.prs[key];
          if (had?.failed && Date.now() - had.at < 600000) continue;
          try {
            const r = await exec("gh", ["pr", "list", "--head", wt.branch, "--state", "all", "--limit", "1", "--json", "number,state,url,isDraft,statusCheckRollup"], { cwd: wt.path, timeout: 15000 });
            const entry = r.code === 0 ? { pr: parsePr(r.stdout), at: Date.now() } : { pr: null, failed: true, at: Date.now() };
            if (JSON.stringify(entry.pr) !== JSON.stringify(had?.pr)) changed = true;
            this.prs[key] = entry;
          } catch { this.prs[key] = { pr: null, failed: true, at: Date.now() }; }
        }
      }
      if (changed) cx.notify();
    } catch {}
    this.prsBusy = false;
  }

  // A section like Reviewer: the servers running in your projects. Click one to open it in the browser;
  // the x asks "Stop?" and a second press ends the process.
  serversSection(t) {
    const critters = this.critters();
    const folded = this.sectionsFolded.has("servers");
    const card = (id, red) => h_flex().id(id).mx(8).my(2).px(8).h(44).gap(9).items_center().rounded(8).border(1).border_color(red ? t.blocked : t.border);
    const goneRows = this.gone.map((g) => card(`gone-${g.pid}`, true)
      .child(critterPicture(critters[g.port] ?? CRITTERS[0], "gone"))
      .child(v_flex().flex_1().min_w(0)
        .child(h_flex().gap(6).items_baseline()
          .child(div().flex_none().font_semibold().text_color(t.blocked).child(`:${g.port}`))
          .child(div().truncate().min_w(0).text_color(t.muted).child("stopped")))
        .child(div().truncate().text_size(11).text_color(t.dim).child(shortCommand(g.cmd))))
      .child(div().id(`restart-${g.pid}`).px(8).h(24).flex().items_center().rounded(6).flex_none().text_size(11).text_color(t.accent)
        .cursor_pointer().hover((el) => el.bg(t.raised ?? t.hover))
        .on_click((_e, cx) => this.restart(g, cx))
        .child(h_flex().gap(5).items_center().child(image("mods/flock/icons/ui-play.svg").w(12).h(12).flex_none()).child("Restart"))));
    const rows = this.servers.map((sv) => {
      const asking = this.stopping?.pid === sv.pid && Date.now() < this.stopping.until;
      return card(`server-${sv.pid}`, false).cursor_pointer().hover((el) => el.bg(t.hover))
        .on_click((_e, cx) => cx.open_url(`http://localhost:${sv.port}`))
        .child(critterPicture(critters[sv.port] ?? CRITTERS[0], "running"))
        .child(v_flex().flex_1().min_w(0)
          .child(h_flex().gap(6).items_baseline()
            // The port never shrinks or wraps: the program name gives way instead.
            .child(div().flex_none().whitespace_nowrap().font_semibold().text_color(t.accent).child(`:${sv.port}`))
            .when((sv.ports?.length ?? 1) > 1, (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child(`+${sv.ports.length - 1}`)))
            .child(div().truncate().min_w(0).text_color(t.foreground).child(sv.command)))
          .child(div().truncate().text_size(11).text_color(t.dim).child([sv.place.name, sv.up].filter(Boolean).join(" \u00b7 "))))
        .child(div().id(`stop-${sv.pid}`).px(6).h(24).flex().items_center().justify_center().rounded(6).flex_none()
          .text_size(11).text_color(asking ? t.blocked : t.dim).hover((el) => el.bg(t.raised ?? t.hover))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => { cx.stop_propagation(); this.stop(sv, cx); })
          .child(asking ? "Stop?" : svg("mods/flock/icons/ui-x.svg").size(12).text_color(asking ? t.blocked : t.dim).flex_none()));
    });
    return v_flex().flex_none().pb(4).mx(-8)
      .child(this.sectionHeader(t, "servers", "Servers", this.servers.length))
      .children(folded ? [] : [...goneRows, ...rows]);
  }

  // Worktrees of every repo that has more than one: the main checkout, the ones with a space open, and a few more;
  // "+ N more" opens the full list, where a worktree can be opened or deleted.
  worktreesSection(t) {
    const sp = spaces(), ps = panes();
    const groups = worktreeGroups(this.trees, sp.filter((s) => !s.machine).map((s) => ({ id: s.id, path: place(s, ps) })));
    if (!groups.length) return null;
    const folded = this.sectionsFolded.has("worktrees");
    const total = groups.reduce((n, g) => n + g.trees.length, 0);
    const rows = [];
    for (const g of groups) {
      const mainTree = g.trees.find((x) => x.main) ?? g.trees[0];
      const openSpace = g.trees.find((x) => x.space)?.space;
      const props = openSpace ? { space: openSpace } : { folder: mainTree.path };
      const dialog = (action) => openOverlay({ mod: "ranch-worktree", kind: "dialog", width: action === "open" ? 560 : 480, height: action === "open" ? 520 : 330, props: { ...props, ...(action === "open" ? { action: "open" } : { argv: ["claude"] }) } });
      // The main checkout and every open one, then up to 3 more.
      const keep = new Set(g.trees.filter((x) => x.main || x.space).map((x) => x.path));
      for (const x of g.trees) if (keep.size < 3 + g.trees.filter((y) => y.main || y.space).length && !keep.has(x.path)) keep.add(x.path);
      const shown = g.trees.filter((x) => keep.has(x.path));
      const more = g.trees.length - shown.length;
      rows.push(h_flex().h(26).pl(16).pr(8).items_center().justify_between().text_size(11).text_color(t.dim)
        .child(div().truncate().child(g.name))
        .child(div().id(`tree-new-${mainTree.path}`).h(22).px(6).gap(4).flex().items_center().rounded(6).text_size(10.5)
          .cursor_pointer().hover((el) => el.bg(t.hover).text_color(t.foreground))
          .on_click(() => dialog("new"))
          .child(svg("mods/flock/icons/ui-plus.svg").size(10).text_color(t.dim).flex_none()).child("New")));
      shown.forEach((wt, n) => rows.push(h_flex().id(`tree-${wt.path}`).mx(8).px(8).h(28).gap(7).items_center().rounded(7)
        .cursor_pointer().hover((el) => el.bg(t.hover))
        .on_click(() => (wt.space ? run("space.select", { id: wt.space }) : run("space.new", { folder: wt.path })))
        .child(image(`mods/flock/icons/tree-${wt.main ? 5 : wt.space ? 3 : 1}.svg`).w(16).h(16).flex_none())
        .child(div().flex_1().min_w(0).truncate().text_color(wt.space ? t.foreground : t.muted).child(wt.branch))
        .when(Boolean(this.prs[`${g.name} ${wt.branch}`]?.pr), (el) => {
          const pr = this.prs[`${g.name} ${wt.branch}`].pr;
          const tone2 = pr.state === "merged" ? "#a78bfa" : pr.state === "closed" ? t.dim : pr.ci === "fail" ? t.blocked : pr.ci === "pass" ? t.done : pr.ci === "pending" ? t.working : t.muted;
          const mark = pr.state === "merged" ? "merged" : pr.state === "closed" ? "closed" : pr.ci === "fail" ? "\u2715" : pr.ci === "pass" ? "\u2713" : pr.ci === "pending" ? "\u2026" : pr.state === "draft" ? "draft" : "";
          return el.child(div().id(`pr-${wt.path}`).px(5).h(18).flex().items_center().rounded(5).flex_none().text_size(10.5).text_color(tone2)
            .hover((e2) => e2.bg(t.raised ?? t.hover))
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => { cx.stop_propagation(); if (pr.url) cx.open_url(pr.url); })
            .child(`#${pr.number} ${mark}`.trim()));
        })
        .child(div().text_size(10.5).flex_none().text_color(wt.space ? t.accent : t.dim).child(wt.main ? "main" : wt.space ? "open" : "+ open"))));
      rows.push(h_flex().id(`tree-all-${mainTree.path}`).mx(8).px(8).h(24).items_center().rounded(7).text_size(11).text_color(t.dim)
        .cursor_pointer().hover((el) => el.bg(t.hover).text_color(t.foreground))
        .on_click(() => dialog("open"))
        .child(more > 0 ? `+ ${more} more \u00b7 open or delete\u2026` : "Open or delete\u2026"));
    }
    return v_flex().flex_none().pb(4).mx(-8)
      .child(this.sectionHeader(t, "worktrees", "Worktrees", total))
      .children(folded ? [] : rows);
  }

  // The "..." popup next to Spaces: which sections to show.
  settingsView(t) {
    const rows = [
      ["reviewer", "Reviewer", "Scout and the PR panel's space"],
      ["servers", "Servers", "dev servers running in your spaces"],
      ["worktrees", "Worktrees", "each repo's worktrees"],
      ["update", "Version and update button", "bottom right of the window"],
    ];
    const box = (on) => div().size(16).flex_none().flex().items_center().justify_center().rounded(4).border(1)
      .border_color(on ? t.accent : t.border).bg(on ? t.accent : t.background)
      .when(on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(11).text_color(t.solid_foreground ?? t.background)));
    return v_flex().size_full().p(14).gap(4).bg(t.popover).text_size(13)
      .child(div().font_semibold().text_color(t.foreground).child("Show in the sidebar"))
      .child(div().text_size(11.5).text_color(t.dim).pb(6).child("Herdr Ranch. Untick what you don't want."))
      .children(rows.map(([key, label, note]) => {
        const on = !hidden(key);
        return h_flex().id(`show-${key}`).h(44).px(8).gap(10).items_center().rounded(8).cursor_pointer().hover((el) => el.bg(t.hover))
          .on_click((_e, cx) => { setShared(HIDE_KEY, { ...(shared(HIDE_KEY) ?? {}), [key]: on }); cx.notify(); })
          .child(box(on))
          .child(v_flex().flex_1().min_w(0).child(div().text_color(t.foreground).child(label)).child(div().truncate().text_size(11).text_color(t.dim).child(note)));
      }))
      .child(div().flex_1())
      .child(h_flex().justify_end().text_size(11).text_color(t.dim).child("esc close"));
  }

  render() {
    const t = theme();
    if (props()?.ranchSettings) return this.settingsView(t);
    const collapsed = narrow();
    reviewerIds = reviewerSpaces(spaces(), panes(), terminals());
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    const list = this.grouped(t, collapsed);
    // Bring the active space into view when it, or its place in the list, changes; a row already in view stays put.
    const active = sp.find(p => p.active)?.id;
    if (active !== this.revealed || this.activeAt !== this.revealedAt) {
      this.revealed = active;
      this.revealedAt = this.activeAt;
      if (this.activeAt >= 0) this.scroll.scroll_to_item(this.activeAt);
    }
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(collapsed, el => el.pl(0).pr(0).justify_center())
        .when(!collapsed, el => el.child("Spaces"))
        .child(h_flex().gap(2).items_center()
          .when(!collapsed, el => el.child(div().id("ranch-settings").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover))
            .on_click(() => openOverlay({ mod: "meadows", kind: "popup", width: 280, height: 290, props: { ranchSettings: true } }))
            .child(svg("mods/flock/icons/ui-dots.svg").size(12).text_color(t.dim).flex_none())))
          .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(14)))))
      .child(v_flex().flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).overflow_y_scrollbar().mode("always").track_scroll(this.scroll)
        // A block above (another mod's) growing, or the window resizing, shrinks this list and can push the active space out.
        .on_size_change((_size, cx) => { if (this.activeAt >= 0) { this.scroll.scroll_to_item(this.activeAt); cx.notify(); } })
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(list)
        // The Reviewer section follows the last space instead of sinking to the bottom of the block.
        .when(!collapsed && this.reviewers?.length > 0, (el) => el.child(this.reviewerSection(t)))
        .when(!collapsed && !hidden("servers") && this.servers.length + this.gone.length > 0, (el) => el.child(this.serversSection(t)))
        .when(!collapsed && !hidden("worktrees"), (el) => { const w = this.worktreesSection(t); return w ? el.child(w) : el; }));
  }
}
