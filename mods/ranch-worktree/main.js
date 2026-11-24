// Herdr Ranch's worktree dialog: a ranch-styled copy of herdr's own `worktree` dialog (same props, same git work).
// { space, action: "new" | "open" | "remove" } or { folder } for a repo without a space; optional { branch, tab, argv }.
// Adds to herdr's: buttons, a preview of the folder a new worktree goes to, and Delete on every row of the Open list.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar } from "gpui-base";
import { run, props, closeOverlay, theme, spaces, panes, exec, home, appHome, readTextFile, window } from "herdr";

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s, all = panes()) {
  if (!s) return null;
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return all.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || null;
}

// The mod owns this preference; paths belong to the space's machine, not the app.
async function root(userHome) {
  const raw = await readTextFile(`${appHome()}/settings.json`);
  const directory = (raw === null ? {} : JSON.parse(raw))?.worktrees?.directory ?? "~/.herdr/worktrees";
  if (typeof directory !== "string" || !directory.trim()) throw new Error("worktrees.directory must be a non-empty path.");
  let path = directory.replace(/\\/g, "/");
  if (path === "~" || path.startsWith("~/")) path = userHome.replace(/\\/g, "/").replace(/\/$/, "") + path.slice(1);
  if (!path.startsWith("/") && !/^[A-Za-z]:\//.test(path)) throw new Error("worktrees.directory must be an absolute path or start with ~/.");
  return path.replace(/\/+$/, "");
}
// Home as ~ (git says C:/Users/x where Windows says C:\Users\x).
const tilde = (path, userHome) => {
  const [p, h] = [path, userHome].map((s) => s.replace(/\\/g, "/"));
  return p.startsWith(h) ? `~${p.slice(h.length)}` : path;
};
const slug = (branch) => {
  const normalized = branch.normalize("NFC");
  const name = normalized.replace(/[^\p{L}\p{M}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  if (name) return name;
  // Hash the original name so symbol-only branches do not share a folder.
  let hash = 2166136261;
  for (const char of normalized) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return `branch-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};
const ago = (s) => {
  const d = Date.now() / 1000 - s;
  return d < 3600 ? `${Math.max(1, Math.round(d / 60))}m` : d < 86400 ? `${Math.round(d / 3600)}h` : d < 86400 * 60 ? `${Math.round(d / 86400)}d` : `${Math.round(d / 86400 / 30)}mo`;
};

// Every checkout of a repo (`git worktree list`), the main one first, then
// the most recently committed: { path, branch, main, at }.
async function checkouts(repo, on) {
  const list = await git(repo.main, ["worktree", "list", "--porcelain"], on);
  if (!list.ok) return [];
  const refs = await git(repo.main, ["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads"], on);
  const when = new Map(refs.out.split("\n").map((l) => l.split("\t")).map(([b, at]) => [b, Number(at) || 0]));
  const out = [];
  for (const block of list.out.split(/\n\n+/)) {
    const lines = block.split("\n");
    const path = lines.find((l) => l.startsWith("worktree "))?.slice(9);
    if (!path || lines.some((l) => l === "bare" || l.startsWith("prunable"))) continue;
    const branch = lines.find((l) => l.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "") ?? null;
    out.push({ path, branch, main: out.length === 0, at: branch ? (when.get(branch) ?? 0) : 0 });
  }
  return out.sort((a, b) => b.main - a.main || b.at - a.at);
}

// The space showing a checkout: its first terminal is in it (the deepest checkout wins).
function spaceOf(path, all, on, spaceList, paneList) {
  const inside = (p, dir) => p === dir || p.startsWith(dir + "/");
  return spaceList.find((s) => (s.machine ?? null) === (on ?? null) && (() => {
    const at = place(s, paneList)?.replace(/\\/g, "/");
    if (!at || !inside(at, path)) return false;
    return !all.some((c) => c.path !== path && c.path.length > path.length && inside(at, c.path));
  })());
}

async function git(cwd, args, on, timeout) {
  const r = await exec("git", args, { cwd, on, ...(timeout === undefined ? {} : { timeout }) });
  return { ok: r.code === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? r.stdout ?? "").trim() };
}

// The submodule repos git keeps for a checkout (nested ones too, checked out
// or not): { name, dir, pinned }. `config` is the args that read its
// .gitmodules; `pinned` is the commit its parent records ("" if none).
async function modules(gitDir, config, on, out = [], parent = "") {
  const keys = await git(gitDir, ["--git-dir", gitDir, "config", ...config, "-z", "--get-regexp", "^submodule\\..*\\.path$"], on);
  if (!keys.ok) return out; // no .gitmodules, or no submodules in it
  // -z: "key\nvalue" records ended by NUL, so names and paths may hold spaces.
  for (const record of keys.out.split("\0").filter(Boolean)) {
    const at = record.indexOf("\n");
    const name = record.slice("submodule.".length, at - ".path".length);
    const dir = `${gitDir}/modules/${name}`;
    if (!(await git(gitDir, ["--git-dir", dir, "rev-parse", "--git-dir"], on)).ok) continue; // never checked out
    const pinned = await git(gitDir, ["--git-dir", gitDir, "rev-parse", `HEAD:${record.slice(at + 1)}`], on);
    // Names are only unique within their parent: nested ones carry its name.
    out.push({ name: parent + name, dir, pinned: pinned.ok ? pinned.out : "" });
    if ((await git(gitDir, ["--git-dir", dir, "cat-file", "-e", "HEAD:.gitmodules"], on)).ok) await modules(dir, ["--blob", "HEAD:.gitmodules"], on, out, `${parent + name}/`);
  }
  return out;
}

// The worktree's submodules, and the names of those with commits that exist
// nowhere else: not on a remote, and not the commit the parent pins (git
// fetches that by hash, so it is often on no remote branch here).
async function submodules(top, on) {
  const gitDir = await git(top, ["rev-parse", "--absolute-git-dir"], on);
  if (!gitDir.ok) throw new Error(gitDir.err || "git rev-parse failed.");
  const mods = await modules(gitDir.out, ["--file", `${top}/.gitmodules`], on);
  const unpushed = [];
  for (const m of mods) {
    const local = await git(gitDir.out, ["--git-dir", m.dir, "rev-list", "-n1", "--all", "--not", "--remotes", ...(m.pinned ? [m.pinned] : [])], on);
    if (!local.ok) throw new Error(local.err || `Couldn't check submodule ${m.name}.`);
    if (local.out) unpushed.push(m.name);
  }
  return { mods, unpushed };
}

// The repo a folder belongs to: its main checkout and name, and whether
// the folder is itself a linked worktree. null outside git.
async function repoOf(folder, on) {
  const top = await git(folder, ["rev-parse", "--show-toplevel"], on);
  const common = await git(folder, ["rev-parse", "--path-format=absolute", "--git-common-dir"], on);
  if (!top.ok || !common.ok) return null;
  const main = common.out.endsWith("/.git") ? common.out.slice(0, -5) : common.out;
  // A bare repo hidden beside its worktrees (<project>/.bare) is named after its project.
  const parts = main.split("/"), name = parts.at(-1) === ".bare" ? parts.at(-2) : parts.at(-1);
  return { top: top.out, main, name, linked: main !== top.out };
}

export default class RanchWorktree extends View {
  init(_props, cx) {
    this.on = this.space()?.machine || null;
    this.userHome = this.on ? null : home();
    this.opening = props()?.action === "open";
    this.text = props()?.branch ?? "";
    this.list = undefined; // open: the checkouts, once read
    this.at = 0;
    this.input = InputState.new({ value: this.text, placeholder: this.opening ? "filter worktrees" : "branch name" });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.error = ""; this.at = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.go(cx));
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    this.handle = cx.focus_handle();
    this.handle.focus(); // the root is mounted from the first frame: keep the keyboard here while loading
    if (props()?.action !== "remove") this.input.focus();
    this.busy = false;
    this.error = "";
    this.repo = undefined; // undefined: looking, null: not in git
    this.dirty = false;
    this.unpushed = [];
    cx.spawn(async (cx) => {
      try {
        if (this.on) {
          let result;
          try { result = await exec("sh", ["-c", 'printf %s "$HOME"'], { on: this.on }); } catch {}
          if (!result || result.code !== 0 || !result.stdout.trim()) result = await exec("powershell.exe", ["-NoProfile", "-Command", "[Console]::Write($HOME)"], { on: this.on });
          if (result.code !== 0 || !result.stdout.trim()) throw new Error("Could not find the remote home folder.");
          this.userHome = result.stdout.trim().replace(/\\/g, "/");
        }
        if (!this.opening && props()?.action !== "remove") this.root = await root(this.userHome);
        this.folder = props()?.folder || place(this.space()) || this.userHome;
        // The repo is set last: Enter does nothing until the warnings it consents to are known.
        const repo = await repoOf(this.folder, this.on);
        if (repo && props().action === "remove") {
          this.dirty = (await git(repo.top, ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain"], this.on)).out !== "";
          this.unpushed = (await submodules(repo.top, this.on)).unpushed;
        }
        if (repo && this.opening) this.list = await checkouts(repo, this.on);
        this.repo = repo;
        cx.notify();
        // The list (and with it the filter input) only mounts once loading is
        // done, so the keyboard must move there now — a focus call made while
        // loading lands on nothing and the dialog stays keyboard-dead.
        this.handle.focus();
        if (props().action !== "remove") cx.timer.after(100, () => this.input.focus());
        if (props().branch) await this.work(cx);
      } catch (error) { this.repo = null; this.error = String(error); cx.notify(); }
    });
  }

  space() {
    const p = props() ?? {};
    return spaces().find((s) => s.id === p.space) ?? (p.folder ? { folder: p.folder, machine: p.machine ?? null, name: "" } : undefined);
  }

  close() {
    closeOverlay(props().overlay);
  }

  go(cx) {
    if (this.busy || !this.repo) return;
    cx.spawn(async (cx) => this.work(cx));
  }

  async work(cx) {
    const remove = props()?.action === "remove";
    if (this.busy || !this.repo || (remove && !this.repo.linked)) return;
    this.busy = true;
    this.error = "";
    cx.notify();
    try { this.error = remove ? await this.remove() : await this.create(); }
    catch (error) { this.error = String(error); }
    this.busy = false;
    if (!this.error) this.close();
    cx.notify();
  }

  async create() {
    const branch = this.text.trim();
    if (!branch) return "Type a branch name.";
    const path = `${this.root}/${this.repo.name}/${slug(branch)}`;
    const exists = (await git(this.repo.main, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], this.on)).ok;
    const add = exists ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, "HEAD"];
    const r = await git(this.repo.top, add, this.on, 600_000);
    if (!r.ok) return r.err || "git worktree add failed.";
    const p = props();
    // Leave spaces unnamed so they follow the checkout folder and nest under the repo.
    run("space.new", { folder: path, machine: this.on ?? "", tab: p.tab, argv: p.argv });
    return "";
  }

  shown() {
    const f = this.text.trim().toLowerCase();
    return (this.list ?? []).filter((c) => !f || `${c.branch ?? ""} ${c.path}`.toLowerCase().includes(f));
  }

  open(c) {
    if (!c) return;
    this.close();
    const s = spaceOf(c.path, this.list, this.on, spaces(), panes());
    if (s) run("space.select", { id: s.id });
    else run("space.new", { folder: c.path, machine: this.on ?? "" });
  }

  async remove() {
    const s = this.space();
    const status = await git(this.repo.top, ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain"], this.on);
    if (!status.ok) return status.err || "git status failed.";
    // git refuses a worktree with submodules unless forced, because their
    // history goes with it. The popup already showed what's at risk; only
    // risk that appeared since it opened gets one more warning.
    const { mods, unpushed } = await submodules(this.repo.top, this.on);
    const changed = (status.out && !this.dirty) || unpushed.some((name) => !this.unpushed.includes(name));
    this.dirty ||= status.out !== "";
    this.unpushed = [...new Set([...this.unpushed, ...unpushed])];
    if (changed) return "It changed since this opened. Enter again removes it anyway.";
    const list = await git(this.repo.main, ["-c", "core.quotePath=false", "worktree", "list", "--porcelain"], this.on);
    if (!list.ok) return list.err || "git worktree list failed.";
    const checkout = list.out.split(/\n\n+/).map((record) => record.split("\n"))
      .find(([path]) => path === `worktree ${this.repo.top}`);
    const lock = checkout?.find((field) => field === "locked" || field.startsWith("locked "));
    if (lock) return lock === "locked" ? "This worktree is locked." : `This worktree is locked: ${lock.slice(7)}`;

    // Git on a remote Windows machine reports a drive-letter or UNC path.
    const windows = this.on ? /^(?:[A-Za-z]:\/|\/\/)/.test(this.repo.top) : window().platform === "windows";
    const closeSpace = () => { if (s?.id) run("space.close", { id: s.id, confirmed: true }); };
    // A shell sitting in the folder can keep it busy on Windows.
    if (windows) closeSpace();
    const force = this.dirty || mods.length > 0;
    const r = await git(this.repo.main, ["worktree", "remove", ...(force ? ["--force"] : []), this.repo.top], this.on, 600_000);
    if (!r.ok) return r.err || "git worktree remove failed.";
    if (!windows) closeSpace();
    return "";
  }

  key(e, cx) {
    if (e.key === "escape") return this.close();
    if (this.opening) {
      const n = this.shown().length;
      if (e.key === "enter") this.open(this.shown()[this.at]);
      else if ((e.key === "down" || e.key === "up") && n) this.at = (this.at + (e.key === "down" ? 1 : n - 1)) % n;
      else return;
      cx.stop_propagation();
      return cx.notify();
    }
    if (e.key === "enter" && props()?.action === "remove") return this.go(cx);
  }

  // Delete a checkout from the Open list: the first press asks (and looks for uncommitted changes), the second deletes it.
  deleteCheckout(c, cx) {
    if (c.main || this.busy) return;
    if (this.asking?.path !== c.path || Date.now() > this.asking.until) {
      const ask = { path: c.path, until: Date.now() + 5000, dirty: false };
      this.asking = ask;
      cx.spawn(async (cx) => {
        const st = await git(c.path, ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain"], this.on);
        if (this.asking === ask) { ask.dirty = st.ok && st.out !== ""; cx.notify(); }
      });
      cx.timer.after(5100, (cx) => cx.notify());
      return cx.notify();
    }
    const dirty = this.asking.dirty;
    this.asking = null;
    this.busy = true;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await git(this.repo.main, ["worktree", "remove", ...(dirty ? ["--force"] : []), c.path], this.on, 600_000);
        if (!r.ok) this.error = r.err || "git worktree remove failed.";
        else {
          const s = spaceOf(c.path, this.list, this.on, spaces(), panes());
          if (s) run("space.close", { id: s.id, confirmed: true });
          this.list = await checkouts(this.repo, this.on);
          this.at = 0;
        }
      } catch (error) { this.error = String(error); }
      this.busy = false;
      cx.notify();
    });
  }

  // Ranch look: a pixel tree and a title, a gold main button, plain ghost buttons, soft red for trouble.
  button(t, id, label, kind, onClick, disabled = false) {
    const primary = kind === "primary", danger = kind === "danger";
    return div().id(id).h(32).px(14).flex().items_center().justify_center().rounded(8).text_size(13).font_semibold()
      .when(primary, (el) => el.bg(t.solid ?? t.accent).text_color(t.solid_foreground ?? t.background))
      .when(danger, (el) => el.bg(t.blocked).text_color("#ffffff"))
      .when(!primary && !danger, (el) => el.border(1).border_color(t.border).text_color(t.muted))
      .when(disabled, (el) => el.opacity(0.45))
      .when(!disabled, (el) => el.cursor_pointer().hover((e) => e.opacity(0.9)).on_click((_e, cx) => onClick(cx)))
      .child(label);
  }

  heading(t, title, sub, count) {
    return h_flex().gap(10).items_center()
      .child(image("mods/flock/icons/tree-5.svg").w(24).h(24).flex_none())
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().font_semibold().text_size(15).text_color(t.foreground).child(title))
        .when(Boolean(sub), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(sub))))
      .when(Boolean(count), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(count)));
  }

  notice(t, text, bad) {
    return div().px(10).py(8).rounded(8).border(1).border_color(bad ? t.blocked : t.border).text_size(12.5).text_color(bad ? t.blocked : t.muted).child(text);
  }

  renderOpen(t) {
    const r = this.repo;
    const rows = this.shown();
    const all = this.list ?? [];
    const spaceList = spaces();
    const paneList = panes();
    const row = (c, i) => {
      const on = i === this.at;
      const there = spaceOf(c.path, all, this.on, spaceList, paneList);
      const asking = this.asking?.path === c.path && Date.now() < this.asking.until;
      return h_flex().id(`wt-${i}`).flex_none().h(48).px(10).gap(10).items_center().rounded(8).cursor_pointer()
        .when(on, (el) => el.bg(t.selected))
        .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click(() => this.open(c))
        .child(image(`mods/flock/icons/tree-${c.main ? 5 : there ? 3 : 1}.svg`).w(18).h(18).flex_none())
        .child(v_flex().flex_1().min_w(0)
          .child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(c.branch ?? "detached"))
            .when(c.main, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child("main checkout")))
            .when(Boolean(there), (el) => el.child(div().flex_none().text_size(11).text_color(t.accent).child("open")))
            .when(!there && c.at > 0, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(ago(c.at)))))
          .child(div().truncate().text_size(11.5).text_color(t.dim).child(tilde(c.path, this.userHome ?? ""))))
        .when(!c.main, (el) => el.child(div().id(`wt-del-${i}`).h(26).px(8).flex().items_center().justify_center().rounded(6).flex_none().text_size(11.5)
          .text_color(asking ? t.blocked : t.dim).hover((e) => e.bg(t.raised ?? t.hover))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => { cx.stop_propagation(); this.deleteCheckout(c, cx); })
          .child(asking ? (this.asking.dirty ? "Delete and lose changes?" : "Delete?") : svg("mods/flock/icons/ui-x.svg").size(11).text_color(t.dim))));
    };
    const count = rows.length === all.length ? `${all.length} checkouts` : `${rows.length}/${all.length} checkouts`;
    return v_flex().id("worktree").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(18).gap(12).bg(t.popover).text_size(13)
      .child(this.heading(t, `Open worktree${r ? ` of ${r.name}` : ""}`, "Pick one to open it. Delete removes the folder; the branch stays.", r ? count : ""))
      .when(r === undefined || (r && this.list === undefined), (el) => el.child(div().text_color(t.muted).child("\u2026")))
      .when(r === null, (el) => el.child(this.notice(t, `${this.folder ? tilde(this.folder, this.userHome ?? "") : "This folder"} is not in a git repository.`)))
      .when(Boolean(r && this.list), (el) => el
        .child(Input.new(this.input).h(34).px(10).items_center().rounded(8).border(1).border_color(this.inputFocused ? t.accent : t.input).bg(t.background).text_color(t.foreground))
        .child(div().relative().flex_1().min_h(0)
          .child(v_flex().id("wt-list").size_full().overflow_y_scroll().gap(2).children(rows.map(row))
            .when(rows.length === 0, (el) => el.child(div().p(10).text_color(t.dim).child("No matching worktrees."))))
          .child(Scrollbar.vertical("wt-list").absolute().inset_0())))
      .when(Boolean(this.error), (el) => el.child(this.notice(t, this.error, true)))
      .child(h_flex().justify_between().items_center().text_size(11).text_color(t.dim)
        .child("\u2191\u2193 choose \u00b7 \u21b5 open \u00b7 esc close")
        .child(this.button(t, "wt-close", "Close", "ghost", () => this.close())));
  }

  render(cx) {
    const t = theme();
    if (this.opening) return this.renderOpen(t);
    const remove = props()?.action === "remove";
    const s = this.space();
    const r = this.repo;
    const blocked = !r || (remove && !r.linked);
    const title = remove ? `Remove worktree ${s?.name ?? ""}?` : `New worktree${r ? ` of ${r.name}` : ""}`;
    const sub = remove ? "Closes the space and deletes the folder. The branch stays." : "A new space on its own checkout. A branch that exists is checked out; a new one starts from here.";
    const target = !remove && r && this.root && this.text.trim() ? `${tilde(this.root, this.userHome)}/${r.name}/${slug(this.text.trim())}` : "";
    return v_flex().id("worktree").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(18).gap(12).bg(t.popover).text_size(13)
      .child(this.heading(t, title, r === undefined ? "\u2026" : r === null ? "" : sub))
      .when(r === null, (el) => el.child(this.notice(t, `${this.folder ? tilde(this.folder, this.userHome ?? "") : "This folder"} is not in a git repository.`)))
      .when(r && remove && !r.linked, (el) => el.child(this.notice(t, "This is the repository's main checkout, not a worktree.")))
      .when(remove && r && r.linked, (el) => el.child(this.notice(t, `Deletes ${tilde(r.top, this.userHome)}.`)))
      .when(remove && this.dirty, (el) => el.child(this.notice(t, "It has uncommitted changes: they will be lost.", true)))
      .when(remove && this.unpushed.length > 0, (el) => el.child(this.notice(t, `Submodule ${this.unpushed.join(", ")} has commits that aren't pushed anywhere: they will be lost.`, true)))
      .when(!remove && !blocked, (el) => el
        .child(div().text_size(11.5).text_color(t.dim).child("Branch name"))
        .child(Input.new(this.input).h(34).px(10).items_center().rounded(8).border(1).border_color(this.inputFocused ? t.accent : t.input).bg(t.background).text_color(t.foreground))
        .when(Boolean(target), (e) => e.child(div().truncate().text_size(11.5).text_color(t.dim).child(`Goes to ${target}`))))
      .when(Boolean(this.error), (el) => el.child(this.notice(t, this.error, true)))
      .child(div().flex_1())
      .child(h_flex().justify_end().items_center().gap(8)
        .when(this.busy, (el) => el.child(div().text_size(12).text_color(t.dim).child("working\u2026")))
        .child(this.button(t, "wt-cancel", "Cancel", "ghost", () => this.close()))
        .when(!blocked || remove, (el) => el.child(this.button(t, "wt-go", remove ? "Remove" : "Create worktree", remove ? "danger" : "primary", (cx2) => this.go(cx2), blocked || this.busy))));
  }
}
