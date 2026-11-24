import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, setBadge, checking, exec } from "herdr";
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
    if (checking()) return;
    cx.timer.every(VITALS_PERIOD, (cx) => this.readVitals(cx));
    this.readVitals(cx);
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
      .child(this.meter(t, "CPU", this.vitals.cpu, this.vitals.cpu == null ? "--" : `${this.vitals.cpu}%`))
      .child(this.meter(t, "RAM", this.vitals.mem && Math.round((100 * this.vitals.mem.used) / this.vitals.mem.total),
        this.vitals.mem ? `${formatGB(this.vitals.mem.used)}/${formatGB(this.vitals.mem.total)}G` : "--"))
      .child(this.meter(t, "Disk", this.vitals.disk, this.vitals.disk == null ? "--" : `${this.vitals.disk}%`))
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
