import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, setBadge, checking, exec, appHome, home, readTextFile, notify, shared, openOverlay } from "herdr";
import { RELEASE_API, isNewer, parseRelease, updateScript } from "./update.js";
import { parseCpu, parseMemMac, parseMemLinux, parseDisk, formatGB } from "./vitals.js";

// Agent counts by status, most urgent first.
const QUEST = [
  ["blocked", "needs you"],
  ["done", "done"],
  ["working", "working"],
  ["idle", "resting"],
];
const VITALS_PERIOD = 5000;
const METER_WIDTH = 46;
const METER_HEIGHT = 5;
const WARN = 70;
const DANGER = 90;

// Runs a program and returns its output, or null when it fails: one broken command must not stop the rest.
async function sh(command, args) {
  try {
    const r = await exec(command, args, { timeout: 4000 });
    return r.code === 0 ? r.stdout : null;
  } catch {
    return null;
  }
}

const WAITING_STATUS = "blocked";

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.vitals = { cpu: null, mem: null, disk: null };
    this.update = null; // a newer Herdr Ranch release: { tag, version, url }
    this.version = null; // the installed release, from herdr-ranch.version
    if (checking()) return;
    // A look at GitHub's latest release a few seconds after start, then every 6 hours (at most once an hour per window).
    cx.timer.after(20000, (cx) => this.checkUpdate(cx));
    cx.timer.every(6 * 3600 * 1000, (cx) => this.checkUpdate(cx));
    cx.timer.every(VITALS_PERIOD, (cx) => this.readVitals(cx));
    this.readVitals(cx);
  }

  // The release GitHub calls the latest, against the version install.sh left in Herdr's folder.
  async checkUpdate(cx, now = false) {
    try {
      const last = Number(localStorage.getItem("ranch.update.at") ?? 0);
      let found = null;
      try { found = JSON.parse(localStorage.getItem("ranch.update.found") ?? "null"); } catch { /* ignore */ }
      if (!found || now || Date.now() - last > 3600 * 1000) {
        const r = await exec("curl", ["-fsSL", "--max-time", "10", "-H", "Accept: application/vnd.github+json", "-H", "User-Agent: herdr-ranch-update-check", RELEASE_API], { timeout: 15000 });
        found = r.code === 0 ? parseRelease(r.stdout) : found;
        localStorage.setItem("ranch.update.at", String(Date.now()));
        localStorage.setItem("ranch.update.found", JSON.stringify(found));
      }
      const local = await readTextFile(`${appHome()}/herdr-ranch.version`).catch(() => null);
      // No version file (installed before updates existed): nothing to compare, so no button until the next install.
      const next = found && local && isNewer(local, found.version) ? found : null;
      const version = local ? local.trim() : null;
      if (version !== this.version) { this.version = version; cx.notify(); }
      if (now && !next) notify({ title: version ? `Herdr Ranch v${version} is up to date` : "Herdr Ranch: could not tell the installed version", level: "info" });
      if (JSON.stringify(next) !== JSON.stringify(this.update)) { this.update = next; cx.notify(); }
    } catch { /* offline: try again later */ }
  }

  // Opens a tab that downloads the release and runs its installer, so you watch it happen.
  runUpdate() {
    if (!this.update) return;
    run("tab.new", { name: "Update Ranch", folder: home(), argv: ["/bin/sh", "-c", updateScript(this.update.tag)] });
  }

  // CPU, memory and disk of this computer. Cores and total memory are read once.
  readVitals(cx) {
    cx.spawn(async (cx) => {
      const mac = window()?.platform === "macos";
      if (!this.machine) {
        if (mac) {
          const [cores, total] = String((await sh("sysctl", ["-n", "hw.ncpu", "hw.memsize"])) ?? "").trim().split("\n").map(Number);
          if (cores > 0 && total > 0) this.machine = { cores, total };
        } else {
          const cores = Number(await sh("nproc", []));
          if (cores > 0) this.machine = { cores };
        }
      }
      const [ps, mem, df] = await Promise.all([
        sh("ps", ["-A", "-o", "%cpu"]),
        mac ? sh("vm_stat", []) : sh("cat", ["/proc/meminfo"]),
        sh("df", ["-k", "/"]),
      ]);
      const next = {
        cpu: ps == null ? null : parseCpu(ps, this.machine?.cores ?? NaN),
        mem: mem == null ? null : mac ? parseMemMac(mem, this.machine?.total) : parseMemLinux(mem),
        disk: df == null ? null : parseDisk(df),
      };
      if (JSON.stringify(next) === JSON.stringify(this.vitals)) return;
      this.vitals = next;
      cx.notify();
    });
  }

  // A label, a tiny bar and a value; "--" when the reading failed.
  meter(t, label, percent, text) {
    const color = percent == null ? t.dim : percent >= DANGER ? t.blocked : percent >= WARN ? t.done : t.accent;
    return h_flex().gap(5).items_center().flex_none()
      .child(label)
      .child(div().w(METER_WIDTH).h(METER_HEIGHT).rounded(3).bg(t.border)
        .child(div().h_full().w(`${percent ?? 0}%`).rounded(3).bg(color)))
      .child(text);
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  showWaitingOnDock(waiting) {
    if (checking()) return;
    const badge = waiting > 0 ? String(waiting) : null;
    if (badge === this.badge) return;
    this.badge = badge;
    setBadge(badge);
  }

  async close() {
    if (this.badge) setBadge(null);
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    this.showWaitingOnDock(list.filter(a => a.status === WAITING_STATUS).length);
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .children(QUEST.map(([status, words]) => [status, words, list.filter(a => a.status === status).length])
        .filter(([, , count]) => count > 0)
        .map(([status, words, count]) => h_flex().gap(6).items_center().px(6).py(1).rounded(3).border(1).border_color(t.border)
          .child(div().size(6).rounded(3).bg(t[status] ?? t.dim))
          .text_color(status === "blocked" ? t.blocked : t.muted)
          .child(`${count} ${words}`)))
      .when(list.length === 0, el => el.child("The ranch is quiet"))
      .child(div().flex_1())
      .when(Boolean(this.update) && (shared("ranch.hide") ?? {}).update !== true, el => el.child(h_flex().id("ranch-update").px(8).h(20).gap(5).items_center().flex_none().rounded(5)
        .bg(t.solid ?? "#f2c744").text_color(t.solid_foreground ?? "#33062b").text_size(11.5).font_semibold()
        .cursor_pointer().hover(s => s.opacity(0.9)).on_click(() => this.runUpdate())
        .child(svg("mods/flock/icons/ui-up.svg").size(11).text_color(t.solid_foreground ?? "#33062b").flex_none()).child(`Update to ${this.update.tag}`)))
      // Always there, even when the version is hidden: it is how the version and the sections come back.
      .child(div().id("ranch-settings").size(20).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer()
        .hover(s => s.bg(t.hover)).on_click(() => openOverlay({ mod: "meadows", kind: "popup", width: 280, height: 290, props: { ranchSettings: true } }))
        .child(svg("mods/flock/icons/ui-dots.svg").size(13).text_color(t.dim)))
      .when(!this.update && Boolean(this.version) && (shared("ranch.hide") ?? {}).update !== true, el => el.child(div().id("ranch-version").text_size(11).text_color(t.dim).cursor_pointer()
        .hover(s => s.text_color(t.foreground)).on_click((_e, cx) => this.checkUpdate(cx, true)).child(`Ranch v${this.version}`)))
      .child(this.meter(t, "CPU", this.vitals.cpu, this.vitals.cpu == null ? "--" : `${this.vitals.cpu}%`))
      .child(this.meter(t, "RAM", this.vitals.mem && Math.round((100 * this.vitals.mem.used) / this.vitals.mem.total),
        this.vitals.mem ? `${formatGB(this.vitals.mem.used)}/${formatGB(this.vitals.mem.total)}G` : "--"))
      .child(this.meter(t, "Disk", this.vitals.disk, this.vitals.disk == null ? "--" : `${this.vitals.disk}%`))
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
