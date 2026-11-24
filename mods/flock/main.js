// Agents in grouped or priority views; parents take their most urgent sub-agent's place.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, settings, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout, hc, checking, notify, exec } from "herdr";
import { parseContext, parseModel, parseQuota, parseCost } from "./agent-stats.js";
import { watchAgent, parseShortstat, changeSince, formatChange } from "./watch.js";
import { pickContext, buildHandoff, parseLines } from "./handoff.js";
import { castAgents } from "./casting.js";
import { MINUTE, NAP_AFTER, ALARM_AFTER, TREE_AT, lifeOf, treeStage, worked, countsAsTask, needsRead, migrateCost } from "./ranch.js";

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

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✦  Working", "⠋ - Thinking"), and Codex's blinking "[ ! ] " / "[ . ] " mark.
// Stops at an opening bracket or quote, so a title that starts with one ("[web] login") keeps it.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((l?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== (l?.terminal ?? l?.address) && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

const STILL_STATES = new Set(["idle", "blocked", "done"]);
// Terminal address to its animal, its name and its colour variant (0 or 1); the toast mod reads them too.
const CAST_KEY = "flock.cast";
const NAMES_KEY = "flock.names";
const VARIANT_KEY = "flock.variant";
const SPRITE_SIZE = 36;
const MOOD = { working: "Working", idle: "Resting", done: "Done", blocked: "Needs you" };
// An idle animal rests awake, naps after two minutes and gets an alarm clock after five, like Pixel HQ.
const LIFE_WORD = { alarm: "Wake up!", nap: "Napping", rest: "Resting" };
const moodOf = (status, life) => (status === "idle" ? LIFE_WORD[life] : MOOD[status] ?? "");
const titleCase = (s) => s[0].toUpperCase() + s.slice(1);
const STATS_PERIOD = 15000;
const SUMMARY_KEY = "flock.summary";
const SOUND_KEY = "flock.sound";
// Handoff: how many screen lines to include (a custom number from 1 to 1000 works too).
const SPANS = [20, 40, 80, 160, 300];
const SUMMARY_FRESH = 2 * 60 * MINUTE;
// The ranch board: tasks finished today grow the tree (stages at these counts); a long wait makes it droop.
const WAIT_DROOP = 5 * MINUTE;
const dayKey = () => new Date().toISOString().slice(0, 10);

const CTX_WARN = 50;
const CTX_DANGER = 80;
const CTX_BAR_HEIGHT = 3;
const CARD_LINE_HEIGHT = 17;
const CARD_PADDING_Y = 14;
const STEP_PERIOD = 800;
// Loops only ease; swinging far past 0..1 makes the opacity cross over in about one frame, a crisp swap.
const SWAP_LOW = -6;
const SWAP_HIGH = 7;
// Resting is slower than working: a slow breath.
const IDLE_PERIOD = 1800;

// Working indicator: three square dots, one lit at a time, bouncing 1-2-3-2-1. Each dot's opacity is a
// steep linear loop that crosses 0.5 at a chosen point of the cycle, so it switches on and off crisply.
const DOT_PERIOD = 1200;
const DOT_SLOPE = 60;
function gate(el, at, below) {
  const edge = 0.5 + (below ? DOT_SLOPE * at : -DOT_SLOPE * at);
  const range = below ? { from: edge, to: edge - DOT_SLOPE } : { from: edge, to: edge + DOT_SLOPE };
  return el.loop("opacity", { ...range, period: DOT_PERIOD, easing: "linear" });
}
function workingDots(t) {
  const dot = () => div().size(4).flex_none().bg(t.working);
  return h_flex().gap(3).flex_none().items_center()
    .child(gate(dot(), 1 / 3, true))
    .child(gate(div().size(4).flex_none(), 1 / 3, false).child(gate(div().size_full().bg(t.working), 2 / 3, true)))
    .child(gate(dot(), 2 / 3, false));
}

function twoFrames(still, second, period) {
  return div().relative().w(SPRITE_SIZE).h(SPRITE_SIZE).flex_none()
    .child(still.loop("opacity", { from: SWAP_HIGH, to: SWAP_LOW, period, easing: "linear" }))
    .child(image(`mods/flock/sprites/${second}.svg`).absolute().top(0).left(0).w(SPRITE_SIZE).h(SPRITE_SIZE)
      .loop("opacity", { from: SWAP_LOW, to: SWAP_HIGH, period, easing: "linear" }));
}

const spriteImage = (name) => image(`mods/flock/sprites/${name}.svg`).w(SPRITE_SIZE).h(SPRITE_SIZE).flex_none();

function heroSprite(hero, status, life) {
  if (status === "working") return twoFrames(spriteImage(`${hero}-work`), `${hero}-2`, STEP_PERIOD);
  // Awake and resting: standing, a slow bob. Napping: lying down with floating Z. Alarm: awake again.
  if (status === "idle" && life === "rest") return twoFrames(spriteImage(hero), `${hero}-2`, IDLE_PERIOD);
  if (status === "idle" && life === "alarm") return twoFrames(spriteImage(hero), `${hero}-2`, STEP_PERIOD);
  if (status === "idle") return twoFrames(spriteImage(`${hero}-idle`), `${hero}-idle-2`, IDLE_PERIOD);
  const still = spriteImage(`${hero}-${status}`);
  // Confetti rains over a finished animal until someone looks at it.
  if (status === "done") {
    return div().relative().w(SPRITE_SIZE).h(SPRITE_SIZE).flex_none()
      .child(still)
      .child(twoFrames(image("mods/flock/sprites/confetti.svg").w(SPRITE_SIZE).h(SPRITE_SIZE).flex_none(), "confetti-2", STEP_PERIOD * 1.5).absolute().top(0).left(0));
  }
  return still;
}

// A little pixel alarm clock that rings (two frames) beside a sleepy animal's name.
function alarmClock() {
  const size = 14;
  const still = image("mods/flock/icons/alarm.svg").w(size).h(size).flex_none();
  return div().relative().w(size).h(size).flex_none()
    .child(still.loop("opacity", { from: SWAP_HIGH, to: SWAP_LOW, period: 500, easing: "linear" }))
    .child(image("mods/flock/icons/alarm-2.svg").absolute().top(0).left(0).w(size).h(size)
      .loop("opacity", { from: SWAP_LOW, to: SWAP_HIGH, period: 500, easing: "linear" }));
}

// Each agent keeps the animal it got first; a new one takes a random common animal nobody listed has,
// or, one time in ten, a rare one. Animals of closed terminals are recast. The logic is in casting.js.
function castFor(list, all) {
  const out = castAgents(list, all, {
    cast: shared(CAST_KEY) ?? {},
    names: shared(NAMES_KEY) ?? {},
    variants: shared(VARIANT_KEY) ?? {},
  });
  if (out.changed) {
    setShared(CAST_KEY, out.cast);
    setShared(NAMES_KEY, out.names);
    setShared(VARIANT_KEY, out.variants);
  }
  return out;
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.rename) return this.initRename();
    if (props()?.handoff) return this.initHandoff(cx);
    if (props()?.sortMenu || props()?.needsList) return;
    this.folded = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    try { this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    try { this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]"); } catch { this.pendingPins = []; }
    if (!Array.isArray(this.pendingPins)) this.pendingPins = [];
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    // Today's tally for the ranch board, kept across restarts and reset each day.
    try { this.ranch = JSON.parse(localStorage.getItem("ranch") ?? "null"); } catch { this.ranch = null; }
    if (!this.ranch || this.ranch.day !== dayKey()) this.ranch = { day: dayKey(), shipped: 0, worked: 0, bySpace: {}, cost: {}, costBase: {} };
    // Done animals tucked away with the tick, until their next task.
    try { this.settled = new Set(JSON.parse(localStorage.getItem("settled") ?? "[]")); } catch { this.settled = new Set(); }
    // Spend an older reader counted (a dollar amount from the chat) is dropped once.
    const migrated = migrateCost(this.ranch);
    if (migrated !== this.ranch) { this.ranch = migrated; localStorage.setItem("ranch", JSON.stringify(this.ranch)); }
    // Warnings per agent, and each agent's uncommitted change at the start of a task and now.
    this.watchState = {};
    this.lastRead = {};
    this.lastStatus = {};
    this.diff = {};
    this.summary = {};
    this.lastQuotaToast = 0;
    if (!this.ranch.cost) this.ranch.cost = {};
    this.query = "";
    this.finding = false;
    if (!checking()) setShared("ranch.today", this.ranch);
    if (!checking()) {
      this.search = InputState.new({ value: "" });
      this.search.on("change", (_e, cx) => { this.query = this.search.value().trim().toLowerCase(); cx.notify(); });
      this.search.on("submit", () => this.jumpToMatch());
    }
    cx.timer.every(30000, (cx) => cx.notify());
    // Each agent's model and context use, read off its screen: { model, ctx }.
    this.stats = {};
    if (checking()) return;
    cx.timer.every(STATS_PERIOD, (cx) => this.readStats(cx));
    this.readStats(cx);
  }

  readStats(cx) {
    cx.spawn(async (cx) => {
      const everyone = agents();
      // Only agents that are working, focused, just changed or stale are read; the rest keep their numbers.
      const now = Date.now();
      const list = everyone.filter((a) => needsRead(a, now, this.lastRead[a.address], this.lastStatus[a.address] !== a.status));
      const next = {};
      for (const a of everyone) if (!list.includes(a) && this.stats[a.address]) next[a.address] = this.stats[a.address];
      const reads = await Promise.allSettled(list.map((a) => hc(["read", a.address])));
      for (const a of list) { this.lastRead[a.address] = now; this.lastStatus[a.address] = a.status; }
      reads.forEach((r, i) => {
        const address = list[i].address;
        const before = this.stats[address];
        if (r.status === "rejected" || r.value.code !== 0) {
          console.warn(`flock: hc read ${address} failed: ${r.reason ?? r.value.stderr.trim()}`);
          if (before) next[address] = before;
          return;
        }
        // The start banner scrolls away: keep the model once seen.
        const out = r.value.stdout;
        const ctx = parseContext(out), quota = parseQuota(out), cost = parseCost(out);
        next[address] = { model: parseModel(out) ?? before?.model ?? null, ctx, quota, cost };
        // Warnings: context nearly full, quota nearly out, or working without the screen moving.
        const watched = watchAgent(this.watchState[address] ?? {}, { status: list[i].status, ctx, quota, screen: out.split("\n").filter((l) => l.trim()).slice(-12).join("\n") }, Date.now());
        this.watchState[address] = watched.state;
        for (const kind of watched.fire) {
          if (kind === "quota") {
            if (Date.now() - this.lastQuotaToast < 10 * MINUTE) continue;
            this.lastQuotaToast = Date.now();
          }
          this.warn(list[i], kind, { ctx, quota });
        }
        // Spend today: each session's highest cost seen, summed on the board.
        if (cost != null && cost > (this.ranch.cost[address] ?? 0)) {
          this.ranch.cost[address] = cost;
          localStorage.setItem("ranch", JSON.stringify(this.ranch));
        }
      });
      await Promise.allSettled(list.map((a) => this.readDiff(a)));
      if (JSON.stringify(next) === JSON.stringify(this.stats)) return;
      this.stats = next;
      cx.notify();
    });
  }

  // HP: the context used, green then yellow then red. SP: the share of the 5-hour quota left.
  ctxBar(t, ctx) {
    const color = ctx >= CTX_DANGER ? t.blocked : ctx >= CTX_WARN ? t.done : t.working;
    return this.vital(t, ctx, color, `HP ${ctx}%`);
  }

  spBar(t, used) {
    const left = Math.max(0, 100 - used);
    const color = left <= 10 ? t.blocked : left <= 30 ? t.done : t.accent;
    return this.vital(t, left, color, `SP ${left}%`);
  }

  vital(t, pct, color, text) {
    return h_flex().min_w(0).gap(6).items_center()
      .child(div().flex_1().h(CTX_BAR_HEIGHT).rounded(2).bg(t.border)
        .child(div().h_full().w(`${pct}%`).rounded(2).bg(color)))
      .child(div().w(48).flex_none().text_size(10).text_color(t.dim).child(text));
  }

  // Start counting spend from now: what each session has cost so far becomes its zero.
  resetSpend() {
    this.ranch.costBase = { ...this.ranch.cost };
    localStorage.setItem("ranch", JSON.stringify(this.ranch));
  }

  // A finished task: one more on the board's tree, and the time it took.
  tally(a, took) {
    if (this.ranch.day !== dayKey()) this.ranch = { day: dayKey(), shipped: 0, worked: 0, bySpace: {}, cost: {}, costBase: {} };
    this.ranch.shipped += 1;
    this.ranch.worked += Math.max(0, took);
    const room = a.space_name || "?";
    this.ranch.bySpace[room] = (this.ranch.bySpace[room] ?? 0) + 1;
    localStorage.setItem("ranch", JSON.stringify(this.ranch));
    setShared("ranch.today", this.ranch);
  }

  // The task's start: remember how much was already changed in its folder.
  startTask(a) {
    const d = (this.diff[a.address] ??= {});
    d.base = d.cur ?? null;
    delete this.summary[a.address];
    this.publishSummary();
  }

  // The task's end: what it changed is the difference to that start. A fresh reading refines it a moment later.
  finishTask(a) {
    const d = this.diff[a.address];
    if (!d) return;
    this.setSummary(a.address, d.base, d.cur);
    this.readDiff(a).then(() => this.setSummary(a.address, d.base, d.cur));
  }

  setSummary(address, base, cur) {
    const text = cur ? formatChange(changeSince(base, cur)) : null;
    if (text) this.summary[address] = { text, at: Date.now() };
    else delete this.summary[address];
    this.publishSummary();
  }

  publishSummary() {
    if (!checking()) setShared(SUMMARY_KEY, this.summary);
  }

  // `git diff --shortstat HEAD` in the agent's folder (this computer only); null when it isn't a repo.
  async readDiff(a) {
    const pane = panes().find((p) => p.pane === a.pane);
    if (!pane?.cwd || a.address.includes("/")) return;
    try {
      const r = await exec("git", ["-C", pane.cwd, "diff", "--shortstat", "HEAD"], { timeout: 4000 });
      if (r.code === 0) (this.diff[a.address] ??= {}).cur = parseShortstat(r.stdout);
    } catch { /* not a repo, or no git */ }
  }

  // A warning toast in the animal's voice; it takes you to the agent when clicked.
  warn(a, kind, facts) {
    const names = shared(NAMES_KEY) ?? {};
    const hero = (shared(CAST_KEY) ?? {})[a.address];
    const name = names[a.address] ?? (hero ? titleCase(hero) : a.program?.name ?? "An agent");
    const variant = (shared(VARIANT_KEY) ?? {})[a.address];
    const text = {
      context: [`${name}: context ${facts.ctx}% full`, "Time to compact, or start a fresh session."],
      quota: [`${name}: ${100 - facts.quota}% of the 5-hour quota left`, "Pace yourself, or switch agents."],
      stuck: [`${name} looks stuck`, "Working, but its screen hasn't changed for 5 minutes."],
    }[kind];
    notify({
      title: text[0],
      body: text[1],
      level: "warning",
      icon: hero ? `mods/flock/sprites/${variant ? `${hero}-alt` : hero}-blocked.svg` : undefined,
      action: { name: "pane.focus", args: { pane: a.pane } },
    });
  }

  // Find animals: Enter jumps to the first animal that matches.
  matches(a, cast, names) {
    if (!this.query) return true;
    const hay = [names[a.address], cast[a.address], a.space_name, a.program?.name, a.status, moodOf(a.status, lifeOf(a.status, 0))]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(this.query);
  }

  jumpToMatch() {
    const { cast, names } = castFor(agents(), terminals());
    const hit = agents().find((a) => this.matches(a, cast, names));
    if (hit) run("pane.focus", { pane: hit.pane });
  }

  settle(address, on) {
    on ? this.settled.add(address) : this.settled.delete(address);
    localStorage.setItem("settled", JSON.stringify([...this.settled]));
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      const before = this.changed[a.address];
      if (s === "working") this.startTask(a);
      if (before?.s === "working" && s === "idle" && countsAsTask(now - before.at)) { this.tally(a, now - before.at); this.finishTask(a); }
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  rank(a) {
    return RANK[a.status] ?? 0;
  }

  // Handoff popup: read the source agent's screen, let the person pick who gets it and read exactly what
  // will be sent. Nothing leaves until Send is pressed.
  initHandoff(cx) {
    this.screen = null;
    this.target = null;
    this.span = 40;
    this.sent = null;
    const p = props();
    this.intro = "";
    this.introInput = InputState.new({ value: "", placeholder: `Context from ${p.from}, so you can pick this up:` });
    this.introInput.on("change", (_e, cx2) => { this.intro = this.introInput.value(); cx2.notify(); });
    // Any number of lines from 1 to 1000, typed next to the 20 / 40 / 80 / 160 / 300 buttons.
    this.customInput = InputState.new({ value: "", placeholder: "custom" });
    this.customInput.on("change", (_e, cx2) => {
      const n = parseLines(this.customInput.value());
      if (n) this.span = n;
      cx2.notify();
    });
    cx.spawn(async (cx2) => {
      const r = await hc(["read", p.handoff]).catch(() => null);
      this.screen = r && r.code === 0 ? r.stdout : "";
      cx2.notify();
    });
  }

  handoffText() {
    const p = props();
    return buildHandoff({ from: p.from, intro: this.intro, context: pickContext(this.screen ?? "", this.span) });
  }

  sendHandoff(cx) {
    if (!this.target || this.sent) return;
    const p = props();
    const text = this.handoffText();
    this.sent = "sending";
    cx.notify();
    hc(["send", this.target, text]).then((r) => {
      this.sent = r.code === 0 ? "sent" : "failed";
      cx.notify();
      if (r.code === 0) closeOverlay(p.overlay);
      else console.warn(`flock: hc send ${this.target} failed: ${r.stderr.trim()}`);
    }, () => { this.sent = "failed"; cx.notify(); });
  }

  handoffBox(t) {
    const p = props();
    const cast = shared(CAST_KEY) ?? {};
    const names = shared(NAMES_KEY) ?? {};
    const variants = shared(VARIANT_KEY) ?? {};
    const others = agents().filter((a) => a.address !== p.handoff);
    const text = this.screen == null ? "Reading the screen…" : this.handoffText();
    const sprite = (addr, size) => cast[addr] ? image(`mods/flock/sprites/${variants[addr] ? `${cast[addr]}-alt` : cast[addr]}.svg`).w(size).h(size).flex_none() : null;
    const label = (s) => div().text_size(10).font_semibold().text_color(t.accent).child(s.toUpperCase());
    const button = (id, text2, primary, on, action) => h_flex().id(id).h(32).px(16).items_center().justify_center().rounded(4)
      .border(2).border_color(primary && on ? t.solid : t.input).bg(primary && on ? t.solid : t.raised)
      .text_color(primary && on ? t.solid_foreground : t.foreground).text_size(12.5).font_semibold()
      .when(on, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).on_click(action)).when(!on, (el) => el.opacity(0.45)).child(text2);
    const target = others.find((a) => a.address === this.target);
    const lines = this.screen ? this.screen.split("\n").length : 0;
    const ready = Boolean(this.target) && this.screen != null && !this.sent || this.sent === "failed";
    return v_flex().w_full().h_full().p(18).gap(10).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center().gap(10)
        .when(Boolean(cast[p.handoff]), (el) => el.child(div().flex_none().p(4).rounded(4).bg(t.chrome).border(2).border_color(t.accent).child(sprite(p.handoff, 32))))
        .child(v_flex().flex_1().min_w(0)
          .child(div().text_size(15).font_semibold().truncate().child(`Hand off ${p.from}'s screen`))
          .child(div().text_size(11).text_color(t.dim).child("Pick who gets it, then read it before you send.")))
        .child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).border(1).border_color(t.border).text_size(10).text_color(t.dim).child("Esc")))
      .child(div().h(1).w_full().flex_none().bg(t.border))
      .child(label("Send to"))
      .child(v_flex().id("handoff-targets").max_h(150).flex_none().overflow_y_scrollbar().gap(4)
        .when(others.length === 0, (el) => el.child(div().p(10).rounded(4).border(1).border_color(t.border).text_size(12).text_color(t.dim).child("No other agent is running. Start one in another tab.")))
        .children(others.map((a) => {
          const on = a.address === this.target;
          return h_flex().id(`ho-${a.address}`).h(40).px(10).gap(10).rounded(4).items_center().cursor_pointer()
            .border(2).border_color(on ? t.accent : t.border).bg(on ? t.selected : t.raised).hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => { this.target = a.address; cx.notify(); })
            .when(Boolean(cast[a.address]), (el) => el.child(sprite(a.address, 26)))
            .child(v_flex().flex_1().min_w(0)
              .child(div().truncate().text_size(12.5).font_semibold().child(names[a.address] ?? a.program?.name ?? a.address))
              .child(div().truncate().text_size(10.5).text_color(t.dim).child(a.space_name ?? "")))
            .child(div().flex_none().px(7).h(18).flex().items_center().rounded(4).text_size(10.5).font_medium()
              .bg(a.status === "working" ? t.working : t.chrome).text_color(a.status === "working" ? t.solid_foreground : t.muted).child(MOOD[a.status] ?? ""))
            .child(div().flex_none().size(14).rounded(7).border(1).border_color(on ? t.accent : t.input).flex().items_center().justify_center()
              .when(on, (el) => el.child(div().size(8).rounded(4).bg(t.accent))));
        })))
      .child(label("Message"))
      .child(Input.new(this.introInput).h(34).px(10).rounded(4).border(2).border_color(t.input).bg(t.background).text_size(12).text_color(t.foreground))
      .child(h_flex().items_center().gap(8)
        .child(label("Preview"))
        .child(div().flex_1())
        .child(h_flex().p(2).gap(2).rounded(4).bg(t.chrome).border(1).border_color(t.border)
          .children(SPANS.map((n) => div().id(`ho-span-${n}`).px(8).h(20).flex().items_center().rounded(3).text_size(11).cursor_pointer()
            .when(this.span === n, (el) => el.bg(t.solid).text_color(t.solid_foreground).font_semibold())
            .when(this.span !== n, (el) => el.text_color(t.muted).hover((s) => s.bg(t.hover)))
            .on_click((_e, cx) => { this.span = n; this.customInput.set_value?.(""); cx.notify(); }).child(String(n))))
          .child(Input.new(this.customInput).w(66).h(20).px(6).rounded(3).text_size(11)
            .border(1).border_color(SPANS.includes(this.span) ? t.border : t.accent).bg(t.background).text_color(t.foreground))
          .child(div().px(4).text_size(10.5).text_color(t.dim).child("lines"))))
      .child(h_flex().id("handoff-preview-wrap").flex_1().min_h(0).rounded(4).overflow_hidden().bg(t.canvas).border(2).border_color(t.border)
        .child(div().w(3).h_full().flex_none().bg(t.accent))
        .child(div().id("handoff-preview").flex_1().min_w(0).h_full().overflow_y_scrollbar().p(10).text_size(11).text_color(t.muted).child(text)))
      .child(div().text_size(10.5).text_color(t.dim).child(`This is exactly what will be sent${lines ? ` (${text.length} characters)` : ""}. It can contain anything that was on the screen.`))
      .when(target?.status === "working", (el) => el.child(h_flex().gap(6).items_center().px(10).py(6).rounded(4).bg(t.chrome).border(1).border_color(t.done)
        .child(div().text_size(11).text_color(t.done).child(`${names[target.address] ?? "That agent"} is working: this reaches it as its next message.`))))
      .child(h_flex().gap(8).justify_end().items_center()
        .when(this.sent === "failed", (el) => el.child(div().flex_1().text_size(11).text_color(t.blocked).child("Could not send. Is that agent still running?")))
        .child(button("ho-cancel", "Cancel", false, true, () => closeOverlay(p.overlay)))
        .child(button("ho-send", this.sent === "sending" ? "Sending…" : target ? `Send to ${names[target.address] ?? "agent"}` : "Send", true, ready, (_e, cx) => { this.sent = null; this.sendHandoff(cx); })));
  }

  initRename() {
    this.text = props().value ?? "";
    this.input = InputState.new({ value: this.text });
    if (this.text) this.input.set_selected_range({ start: 0, end: this.text.length });
    this.input.on("change", () => { this.text = this.input.value(); });
    this.input.on("submit", () => this.saveName());
    this.input.focus();
  }

  saveName() {
    const p = props();
    const names = { ...(shared(NAMES_KEY) ?? {}) };
    const name = (this.text ?? "").trim();
    if (name) names[p.rename] = name;
    else delete names[p.rename];
    setShared(NAMES_KEY, names);
    closeOverlay(p.overlay);
  }

  renameBox(t) {
    const p = props();
    const button = (id, text, primary, action) => h_flex().id(id).h(30).px(12).items_center().rounded(8)
      .border(1).border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().w_full().p(16).bg(t.popover).text_color(t.foreground).gap(10)
      .child(h_flex().items_center().child(div().flex_1().text_size(14).font_semibold().child(`Rename ${p.animal ?? "animal"}`))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(Input.new(this.input).h(36).px(10).rounded(9).border(1).border_color(t.accent).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(div().text_size(11).text_color(t.dim).child("Leave it empty for a fresh random name."))
      .child(h_flex().gap(8).justify_end()
        .child(button("rn-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(button("rn-save", "Save", true, () => this.saveName())));
  }

  // Everyone waiting on you, across every space, the longest wait first.
  needsList(t) {
    let stamps = {};
    try { stamps = JSON.parse(localStorage.getItem("changed") ?? "{}") ?? {}; } catch { stamps = {}; }
    const at = (a) => stamps[a.address]?.at ?? Date.now();
    const waiting = agents().filter((a) => a.status === "blocked").sort((x, y) => at(x) - at(y));
    const cast = shared(CAST_KEY) ?? {};
    const names = shared(NAMES_KEY) ?? {};
    const variants = shared(VARIANT_KEY) ?? {};
    const now = Date.now();
    return v_flex().w_full().p(5).bg(t.popover).text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child(waiting.length ? `Needs you · ${waiting.length}` : "Nobody needs you"))
      .children(waiting.map((a) => {
        const hero = cast[a.address];
        return h_flex().id(`need-${a.address}`).h(44).px(8).gap(10).rounded(7).items_center()
          .hover((el) => el.bg(t.hover)).cursor_pointer()
          .on_click(() => { run("pane.focus", { pane: a.pane }); closeOverlay(props().overlay); })
          .when(Boolean(hero), (el) => el.child(image(`mods/flock/sprites/${variants[a.address] ? `${hero}-alt` : hero}-blocked.svg`).w(30).h(30).flex_none()))
          .child(v_flex().flex_1().min_w(0)
            .child(div().truncate().font_semibold().text_color(t.foreground).child(names[a.address] ?? a.program?.name ?? a.address))
            .child(div().truncate().text_size(11).text_color(t.dim).child(`${a.space_name ?? ""} · ${a.program?.name ?? ""}`)))
          .child(div().flex_none().text_size(11).text_color(t.blocked).child(duration(now - at(a))));
      }));
  }

  // Sub-agents show as baby animals beside their parent: three at most, then +N. Quiet ones are paler.
  babies(sprite, kids) {
    const shownKids = kids.slice(0, 3);
    return h_flex().gap(2).flex_none().items_center()
      .children(shownKids.map((st) => image(`mods/flock/sprites/${sprite}.svg`).w(14).h(14).flex_none().opacity(st === "working" ? 1 : 0.5)))
      .when(kids.length > 3, (el) => el.child(div().text_size(10).text_color(theme().dim).child(`+${kids.length - 3}`)));
  }

  // Today on the ranch: the tree grows with finished tasks, a gauge shows the lowest 5-hour quota left.
  board(t, droop) {
    const quotas = Object.values(this.stats).map((s) => s?.quota).filter((q) => q != null);
    const left = quotas.length ? Math.max(0, 100 - Math.max(...quotas)) : null;
    const lit = left == null ? 0 : Math.ceil(left / 20);
    const color = left == null ? t.dim : left <= 10 ? t.blocked : left <= 25 ? t.done : t.accent;
    const busiest = Object.entries(this.ranch.bySpace).sort((x, y) => y[1] - x[1])[0];
    const spent = Object.entries(this.ranch.cost ?? {}).reduce((sum, [a, c]) => sum + Math.max(0, c - (this.ranch.costBase?.[a] ?? 0)), 0);
    const stage = treeStage(this.ranch.shipped);
    const prev = stage === 0 ? 0 : TREE_AT[stage - 1];
    const next = TREE_AT[stage];
    const grow = next == null ? 1 : (this.ranch.shipped - prev) / (next - prev);
    return h_flex().id("ranch-board").mx(8).mb(4).px(10).h(54).gap(10).flex_none().items_center().rounded(8)
      .border(1).border_color(t.border).bg(t.raised + "55")
      .tooltip(busiest ? `Busiest: ${busiest[0]} (${busiest[1]} done)` : "No task finished yet today")
      .child(image(`mods/flock/icons/tree-${stage}${droop && stage >= 2 ? "-droop" : ""}.svg`).w(36).h(36).flex_none())
      .child(v_flex().flex_1().min_w(0).gap(4)
        .child(h_flex().gap(6).items_baseline()
          .child(div().text_size(15).font_bold().text_color(t.foreground).child(String(this.ranch.shipped)))
          .child(div().flex_1().truncate().text_size(11.5).text_color(t.muted).child(`done today · ${worked(this.ranch.worked)}`))
          .when(spent > 0, (el) => el.child(div().id("ranch-spend").flex_none().text_size(11.5).text_color(t.muted).cursor_pointer()
            .hover((s) => s.text_color(t.foreground)).tooltip("Today's spend. Click to start counting from zero.")
            .on_click((_e, cx) => { cx.stop_propagation(); this.resetSpend(); cx.notify(); })
            .child(`$${spent.toFixed(2)}`))))
        .child(h_flex().gap(6).items_center()
          .child(div().flex_1().h(4).rounded(2).bg(t.border).child(div().h_full().w(`${Math.round(Math.min(1, grow) * 100)}%`).rounded(2).bg(droop ? t.done : t.working)))
          .child(div().flex_none().text_size(10).text_color(droop ? t.blocked : t.dim).child(droop ? "someone's waiting" : next == null ? "in bloom" : `${next - this.ranch.shipped} to grow`)))
        .when(left != null, (el) => el.child(h_flex().gap(3).items_center()
          .children([0, 1, 2, 3, 4].map((i) => div().w(11).h(4).rounded(1).bg(i < lit ? color : t.border)))
          .child(div().ml(4).text_size(10).text_color(t.dim).child(`SP ${left}%`)))));
  }

  // The needs-you bell: it rings and carries a count while anyone waits; click for one list of all of them.
  bell(t, count) {
    const size = 14;
    const icon = count
      ? div().relative().w(size).h(size).flex_none()
          .child(image("mods/flock/icons/bell.svg").w(size).h(size).flex_none().loop("opacity", { from: SWAP_HIGH, to: SWAP_LOW, period: 700, easing: "linear" }))
          .child(image("mods/flock/icons/bell-2.svg").absolute().top(0).left(0).w(size).h(size).loop("opacity", { from: SWAP_LOW, to: SWAP_HIGH, period: 700, easing: "linear" }))
      : image("mods/flock/icons/bell.svg").w(size).h(size).flex_none().opacity(0.45);
    return h_flex().id("ag-bell").gap(4).items_center().cursor_pointer()
      .tooltip(count ? `${count} need you` : "Nobody needs you")
      .on_click(() => openOverlay({ mod: "flock", kind: "popup", width: 300, height: 60 + Math.min(count, 6) * 44, props: { needsList: true } }))
      .child(icon)
      .when(count > 0, (el) => el.child(div().min_w(14).h(14).px(3).rounded(7).bg(t.blocked).text_size(10).font_bold().text_color("#ffffff").flex().items_center().justify_center().child(String(count))));
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => (this.listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : this.peek(k.address)))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(this.status(t, { status: st }, compact));
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false, quiet = false) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return quiet ? div().w(0).flex_none() : workingDots(t);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    // Idle: a ring; done: a dot.
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  render(cx) {
    const t = theme();
    if (props()?.rename) return this.renameBox(t);
    if (props()?.handoff) return this.handoffBox(t);
    if (props()?.needsList) return this.needsList(t);
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    // An animal that is working or needs you again comes back out of the barn by itself.
    for (const a of list) if (this.settled.has(a.address) && a.status !== "done" && a.status !== "idle") this.settle(a.address, false);
    const waitingLong = list.some((a) => a.status === "blocked" && now - (this.changed[a.address]?.at ?? now) > WAIT_DROOP);
    const tuckedAway = list.filter((a) => this.settled.has(a.address));
    const everyone = list;
    list = list.filter((a) => !this.settled.has(a.address));
    const { cast, names, variants } = castFor(everyone, all);
    // A kept sub-agent (one with a pane) is in agents() too: where a tree shows
    // it, it gets no row of its own, unless it's pinned.
    const nested = new Set(collapsed ? [] : list.flatMap((a) => this.tree(all, a.address).map((s) => s.t.address)));
    list = list.filter((a) => a.pinned || !nested.has(a.address));
    const tabCounts = new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
    const byPriority = sort.id === "priority";
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // A row shows its space above a detail: the detail is a tab someone named or the
    // agent's own title, never an automatic tab number unless two rows would
    // otherwise read the same.
    // Read the pane snapshot once: every host read copies the whole list into JS.
    const leads = leadPanes(panes());
    const tabs = new Map(spaces().flatMap(s => s.tabs).map(tab => [tab.id, tab]));
    const labels = new Map(list.map(a => {
      const tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      return [a.address, tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || a.program?.name || "")];
    }));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map(a => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const row = (a, i, subs = []) => {
      const pic = icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      if (collapsed) {
        return h_flex()
          .id(`ag-${a.address}`)
          .h(26)
          .px(8)
          .flex_none()
          .items_center()
          .gap(4)
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(i + 1)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true)));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      // Under a space header the space goes without saying; an automatic tab number says nothing.
      // Without a space header above (priority, pinned) the row names its space.
      const full = byPriority || isPinned;
      const name = full ? a.space_name || label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      const hero = cast[a.address];
      // Looking at an animal wakes it; otherwise the time since it went idle says how sleepy it is.
      const life = lifeOf(a.status, a.focused ? 0 : now - when);
      const sprite = hero ? heroSprite(variants[a.address] ? `${hero}-alt` : hero, a.status, life) : pic;
      const stat = this.stats[a.address];
      const hasCtx = stat?.ctx != null;
      const hasQuota = stat?.quota != null;
      const place = full ? name : null;
      const session = full ? more : name;
      const dim = !this.matches(a, cast, names);
      const kidsList = subs.map((x) => kidStatus(x.t, this.listed));
      const made = this.summary[a.address];
      const change = made && a.status !== "working" && now - made.at < SUMMARY_FRESH ? made.text : null;
      const lineCount = [hero, stat?.model, place, session, hasCtx, hasQuota, change].filter(Boolean).length;
      return h_flex()
        .id(`ag-${a.address}`)
        .px(8)
        .h(CARD_PADDING_Y + Math.max(lineCount * CARD_LINE_HEIGHT, SPRITE_SIZE))
        .my(2)
        .flex_none()
        .rounded(8)
        .border(1)
        .border_color(a.focused ? t.input : t.border)
        .items_center()
        .gap(10)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(sprite), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(sprite)))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .when(Boolean(hero), el => el.child(h_flex().min_w(0).gap(6).items_center()
            .child(div().id(`name-${a.address}`).min_w(0).truncate().font_semibold().text_color(t.foreground)
              .cursor_pointer().hover((s) => s.text_color(t.accent)).tooltip("Click to rename")
              .on_click((_e, cx) => {
                cx.stop_propagation();
                openOverlay({ mod: "flock", kind: "popup", width: 320, height: 175, props: { rename: a.address, value: names[a.address] ?? "", animal: hero } });
              })
              .child(names[a.address] ?? titleCase(hero ?? "")))
            .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(life === "alarm" ? t.blocked : t.dim).child(moodOf(a.status, life)))
            .when(life === "alarm", (d) => d.child(alarmClock()))
            .when(kidsList.length > 0 && Boolean(hero), (d) => d.child(this.babies(variants[a.address] ? `${hero}-alt` : hero, kidsList)))
            .when(a.status === "working", (d) => d.child(workingDots(t)))))
          .child(v_flex().min_w(0).gap(1).text_size(hero ? 11.5 : 13)
            .when(Boolean(stat?.model), el => el.child(div().min_w(0).truncate().text_color(idle || hero ? t.muted : t.foreground).child(stat.cost != null ? `${stat.model} · $${stat.cost.toFixed(2)}` : stat.model)))
            .when(Boolean(place), el => el.child(div().min_w(0).truncate().font_semibold().text_color(t.foreground).child(place)))
            .when(Boolean(session), el => el.child(div().min_w(0).truncate().text_color(t.dim).child(session)))
            .when(Boolean(change), el => el.child(div().min_w(0).truncate().text_color(t.accent).child(`✎ ${change}`))))
          .when(hasCtx, el => el.child(this.ctxBar(t, stat.ctx)))
          .when(hasQuota, el => el.child(this.spBar(t, stat.quota))))
        .when(Boolean(machine), el => el.child(div().text_size(10).text_color(t.dim).child(machine)))
        .when(subs.length > 0, el => el.child(fold(a, subs)))
        .when(this.hovered === a.address && Boolean(hero) && list.length > 1, el => el.child(div().id(`handoff-${a.address}`)
          .flex_none().p(2).rounded(4).text_size(13).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Hand off: send this animal's recent screen to another agent")
          .on_click((_e, cx) => {
            cx.stop_propagation();
            openOverlay({ mod: "flock", kind: "dialog", width: 480, height: 600, props: { handoff: a.address, from: names[a.address] ?? titleCase(hero) } });
          }).child("↗")))
        .when(this.hovered === a.address, el => el.child(pin))
        .when(this.hovered !== a.address && Boolean(when), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
        .when(dim, el => el.opacity(0.25))
        .when(a.status === "done" && Boolean(hero), el => el.child(div().id(`settle-${a.address}`).flex_none().size(16).rounded(4)
          .flex().items_center().justify_center().bg(t.done + "33").text_size(11).font_bold().text_color(t.done).cursor_pointer()
          .hover((s) => s.bg(t.done + "66")).tooltip("Tuck it into the barn until its next task")
          .on_click((_e, cx) => { cx.stop_propagation(); this.settle(a.address, true); cx.notify(); }).child("✓")))
        .child(this.status(t, a, byPriority && !isPinned, Boolean(hero)));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }

    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(30)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label))
        .when(byPriority || !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(!byPriority && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : groups.flatMap((g) => [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]);

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(13)
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents"))
            .child(h_flex().gap(10).items_center()
            .when(tuckedAway.length > 0, (el) => el.child(div().id("settled-chip").text_size(10.5).text_color(t.done).cursor_pointer()
              .tooltip("Bring everyone back")
              .on_click((_e, cx) => { tuckedAway.forEach((a) => this.settle(a.address, false)); cx.notify(); })
              .child(`✓ ${tuckedAway.length} in the barn`)))
            .child(div().id("ag-find").cursor_pointer().text_color(this.finding ? t.accent : t.dim).tooltip("Find an animal")
              .on_click((_e, cx) => {
                this.finding = !this.finding;
                if (this.finding) this.search.focus();
                else { this.query = ""; this.search.set_value?.(""); }
                cx.notify();
              }).child(svg("mods/workspace-chrome/search.svg").size(13)))
            .child(div().id("ag-sound").cursor_pointer().text_size(13).text_color(shared(SOUND_KEY) === false ? t.dim : t.accent)
              .tooltip(shared(SOUND_KEY) === false ? "Animal sounds are off. Click to turn them on." : "Animal sounds are on. Click to mute them.")
              .on_click((_e, cx) => { setShared(SOUND_KEY, shared(SOUND_KEY) === false); cx.notify(); })
              .child(shared(SOUND_KEY) === false ? "♪×" : "♪"))
            .child(this.bell(t, list.filter((a) => a.status === "blocked").length))
            .child(
              div()
                .id("ag-sort")
                .text_size(11)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(() => openOverlay({ mod: "flock", kind: "popup", width: 200, height: 140, props: { sortMenu: true } }))
                .tooltip(`Sort agents: ${sort.label}`)
                .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14)),
            )),
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")),
      )
      .when(!collapsed && this.finding, (el) => el.child(div().px(10).pb(6).flex_none()
        .child(Input.new(this.search).h(30).px(9).rounded(8).border(1).border_color(t.accent).bg(t.background).text_size(12).text_color(t.foreground))))
      .when(!collapsed && (this.ranch.shipped > 0 || list.length > 0), (el) => el.child(this.board(t, waitingLong)))
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children(rows))
      .when(collapsed, (el) =>
        el.child(
          h_flex()
            .h(28)
            .items_center()
            .justify_center()
            .child(
              div()
                .id("collapse")
                .text_size(13)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(toggleSidebar)
                .child("»"),
            ),
        ),
      );
  }
}
