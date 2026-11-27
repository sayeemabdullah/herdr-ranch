// Ranch Chat, a side panel (Files and Changes live beside it): talk with a parrot that knows your living agents.
// What it knows, fresh with every message: each agent's recent screen (hc read), its folder's git (branch, changes,
// last commits; on another machine through `hc exec --on`) and, for agents on this computer, the code itself, which
// the parrot may read with read-only tools. The answer is one `claude -p` call with the model you pick. It never
// writes anything and never sends a word to an agent.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, ScrollHandle } from "gpui-base";
import { agents, panes, theme, shared, exec, hc, run, props, closeOverlay } from "herdr";
import { MODELS, TONES, toneOf, modelOf, remembered, buildMemory, gitBlock, GIT_LOOKS, systemPrompt, buildPrompt, claudeArgs, parseReply, splitChunks, typingMs } from "./chat.js";

const MODEL_KEY = "ranch.chat.model";
const OFF_KEY = "ranch.chat.off";
const LOG_KEY = "ranch.chat.log";
const CODE_KEY = "ranch.chat.code";
const TONE_KEY = "ranch.chat.tone";
const INSTRUCTIONS_KEY = "ranch.chat.instructions";
const KEEP = 40; // messages kept between openings
const SUGGESTIONS = ["What is everyone working on?", "Which of my agents might clash?", "What should I do next?"];
const titleCase = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
};
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
};
const sprite = (file, size) => image(`mods/flock/sprites/${file}.svg`).w(size).h(size).flex_none();
// A timer when the context has one, else straight away.
const after = (cx, ms, fn) => (cx?.timer?.after ? cx.timer.after(ms, fn) : fn(cx));

export default class RanchChat extends View {
  init(_props, _cx) {
    this.model = modelOf(load(MODEL_KEY, null)).id;
    this.off = load(OFF_KEY, []); // agents switched off; everyone else alive is in the memory
    this.code = load(CODE_KEY, true); // may the parrot read the agents' code and git history
    this.log = load(LOG_KEY, []);
    this.busy = false; // a question is out
    this.phase = "";
    this.typing = false; // the reply is arriving, message by message
    this.openModel = false;
    this.openMem = false;
    this.openStyle = false;
    this.tone = toneOf(load(TONE_KEY, null)).id;
    this.instructions = String(load(INSTRUCTIONS_KEY, "") ?? "");
    this.area = TextareaState.new({ placeholder: "Your instructions, for example: answer in short sentences, always name the file, reply in Bengali.", value: this.instructions, rows: 4 });
    this.area.on("change", () => { this.instructions = this.area.value(); save(INSTRUCTIONS_KEY, this.instructions); });
    this.scroll = ScrollHandle.new();
    this.follow = false; // the newest row should be brought into view (a plain scroll area only has scroll_to_item)
    this.settled = new Set(); // rows that have faded in; a row not in it is drawn faint and a little low, then moves up
    this.items().forEach((row) => this.settled.add(this.keyOf(row))); // what was already there needs no fade
    this.input = InputState.new({ value: "", placeholder: "Message the parrot…" });
    this.input.on("submit", (_e, cx2) => this.ask(cx2));
  }

  // The parrot while it works: two frames, as the agent cards do.
  parrot(size, busy) {
    if (!busy) return sprite("parrot-idle", size);
    const frame = (file) => sprite(file, size);
    return div().relative().w(size).h(size).flex_none()
      .child(frame("parrot-work").loop("opacity", { from: 7, to: -6, period: 700, easing: "linear" }))
      .child(frame("parrot-2").absolute().top(0).left(0).loop("opacity", { from: -6, to: 7, period: 700, easing: "linear" }));
  }

  // Where an agent's code and git live: its pane's folder, on this computer or on a machine.
  where(a) {
    const folder = panes().find((p) => p.pane === a.pane)?.cwd ?? "";
    const slash = a.address.indexOf("/");
    return { folder, machine: slash > 0 ? a.address.slice(0, slash) : "" };
  }

  // Read-only git for one folder, here or on its machine; "" when it is not a repo or cannot be reached.
  async gitFor({ folder, machine }) {
    if (!folder) return "";
    const run = (argv) => (machine
      ? hc(["exec", "--on", machine, "--cwd", folder, "--timeout", "12", "git", ...argv])
      : exec("git", ["-C", folder, ...argv], { timeout: 12000 }));
    const looks = machine ? [...GIT_LOOKS, ["diff", "HEAD", "--no-color", "-U1"]] : GIT_LOOKS;
    const results = await Promise.all(looks.map((argv) => run(argv).catch(() => null)));
    const block = gitBlock(results.slice(0, 3));
    const patch = machine && results[3]?.code === 0 ? String(results[3].stdout).split("\n").slice(0, 150).join("\n").trim() : "";
    return patch ? `${block}\nCode changes:\n${patch}` : block;
  }

  // Reads every remembered agent now, asks the model, and brings the answer in a message at a time.
  ask(cx, text) {
    const question = (text ?? this.input.value()).trim();
    if (!question || this.busy || this.typing) return;
    this.input.set_value?.("");
    this.openModel = false;
    const before = this.log;
    this.log = [...before, { role: "user", text: question }];
    this.busy = true;
    this.phase = "Looking at your agents…";
    this.follow = true;
    save(LOG_KEY, this.log.slice(-KEEP));
    cx.notify();
    const model = this.model;
    const code = this.code;
    const tone = this.tone;
    const instructions = this.instructions;
    cx.spawn(async (cx2) => {
      let reply;
      let count = 0;
      try {
        const live = remembered(agents(), this.off);
        count = live.length;
        const names = shared("flock.names") ?? {};
        const cast = shared("flock.cast") ?? {};
        const spots = live.map((a) => this.where(a));
        const seen = new Map(); // one git read per folder, however many agents share it
        const gits = await Promise.all(spots.map((s) => {
          const key = `${s.machine}|${s.folder}`;
          if (!seen.has(key)) seen.set(key, this.gitFor(s).catch(() => ""));
          return seen.get(key);
        }));
        const reads = await Promise.allSettled(live.map((a) => hc(["read", a.address])));
        const blocks = live.map((a, i) => ({
          name: names[a.address] ?? a.program?.name ?? a.address,
          animal: cast[a.address] ?? null,
          space: a.space_name ?? "",
          status: a.status,
          folder: spots[i].folder,
          machine: spots[i].machine,
          git: gits[i],
          screen: reads[i].status === "fulfilled" && reads[i].value.code === 0 ? reads[i].value.stdout : "",
        }));
        // The code itself can be opened only on this computer.
        const dirs = [...new Set(spots.filter((s) => s.folder && !s.machine).map((s) => s.folder))];
        const looksAtCode = code && dirs.length > 0;
        this.phase = "Thinking…";
        cx2.notify();
        const system = systemPrompt(buildMemory(blocks), live.length, { code: looksAtCode, tone, instructions });
        const r = await exec("claude", claudeArgs({ model, system, prompt: buildPrompt(before, question), code: looksAtCode, dirs }), { timeout: 300000 });
        reply = parseReply(r);
      } catch (error) {
        reply = { ok: false, text: String(error).slice(0, 240) };
      }
      this.busy = false;
      this.phase = "";
      const entry = reply.ok
        ? { role: "parrot", chunks: splitChunks(reply.text), shown: 0, model, count }
        : { role: "parrot", chunks: [reply.text], shown: 1, error: true, model, count };
      this.log = [...this.log, entry];
      save(LOG_KEY, this.log.slice(-KEEP).map((m) => (m.chunks ? { ...m, shown: undefined } : m)));
      cx2.notify();
      this.reveal(cx2, entry);
    });
  }

  // A person's pace: a pause for typing, then a message, then the next.
  reveal(cx, entry, i = 0) {
    if (i >= entry.chunks.length || entry.shown >= entry.chunks.length) { this.typing = false; cx.notify(); return; }
    this.typing = true;
    cx.notify();
    after(cx, typingMs(entry.chunks[i]), (cx2) => {
      entry.shown = i + 1;
      this.follow = true; // each new message comes into view as it arrives
      cx2.notify();
      this.reveal(cx2, entry, i + 1);
    });
  }

  // Every message shown, one row each: what the log's scroll positions count.
  items() {
    const rows = [];
    this.log.forEach((m, i) => {
      if (m.role === "user") { rows.push({ kind: "me", text: m.text, i }); return; }
      const chunks = m.chunks ?? [m.text];
      const shown = m.shown ?? chunks.length;
      chunks.slice(0, shown).forEach((text, k) => rows.push({ kind: "parrot", text, first: k === 0, error: m.error, entry: m, i, k }));
    });
    return rows;
  }

  // A row's identity, so it fades in once and stays.
  keyOf(row) { return row.kind === "me" ? `u${row.i}` : `p${row.i}-${row.k}`; }

  // Brings the newest row (the typing row while waiting) into view. `scroll_to_item` moves the least it needs and is
  // consumed after layout, so asking in the same frame as the new row works; asking again a moment later covers late layout.
  toNewest(cx, count) {
    try { this.scroll.scroll_to_item(count - 1); } catch { /* ignore */ }
    after(cx, 120, (cx2) => { try { this.scroll.scroll_to_item(count - 1); } catch { /* ignore */ } cx2?.notify?.(); });
  }

  link(t, id, label, action) {
    return div().id(id).text_size(11).text_color(t.dim).cursor_pointer().hover((el) => el.text_color(t.foreground)).on_click(action).child(label);
  }

  row(t, m, n) {
    const mine = m.kind === "me";
    const lines = String(m.text).split("\n");
    const bubble = v_flex().min_w(0).max_w(300).px(11).py(7).rounded(12).gap(1).text_size(12.5)
      .bg(mine ? t.selected : t.background)
      .border(m.error ? 1 : 0).border_color(t.blocked)
      .text_color(m.error ? t.blocked : t.foreground)
      .children(lines.map((l) => div().min_w(0).child(l === "" ? " " : l)));
    // A new message fades in and rises a few pixels: drawn faint and low first, then moved on the next frame.
    const here = this.settled.has(this.keyOf(m));
    const wrap = (el) => el.relative().w_full().opacity(here ? 1 : 0).top(here ? 0 : 12)
      .transition("opacity", { duration: 280, easing: "ease-out" }).transition("top", { duration: 280, easing: "ease-out" });
    if (mine) return wrap(h_flex().id(`row-${n}`).justify_end()).child(bubble);
    return wrap(h_flex().id(`row-${n}`).gap(7).items_end())
      .child(m.first ? sprite("parrot-idle", 24) : div().w(24).flex_none())
      .child(bubble);
  }

  render(cx) {
    const t = theme();
    const live = agents();
    const names = shared("flock.names") ?? {};
    const cast = shared("flock.cast") ?? {};
    const variant = shared("flock.variant") ?? {};
    const inMemory = remembered(live, this.off).length;
    const rows = this.items();
    const waiting = this.busy || this.typing;
    // New rows start faint and low; a frame later they are marked settled, which moves them into place.
    const fresh = rows.filter((m) => !this.settled.has(this.keyOf(m)));
    if (fresh.length) after(cx, 40, (cx2) => { rows.forEach((m) => this.settled.add(this.keyOf(m))); cx2.notify(); });
    if (this.follow) { this.follow = false; this.toNewest(cx, rows.length + (waiting ? 1 : 0)); }
    const chip = (a) => {
      const on = !this.off.includes(a.address);
      const hero = cast[a.address];
      return h_flex().id(`mem-${a.address}`).px(7).h(24).gap(5).items_center().flex_none().rounded(12).border(1).cursor_pointer()
        .border_color(on ? t.accent : t.border).bg(on ? t.selected : t.chrome).hover((el) => el.bg(t.hover))
        .on_click((_e, cx2) => {
          this.off = on ? [...this.off, a.address] : this.off.filter((x) => x !== a.address);
          save(OFF_KEY, this.off);
          cx2.notify();
        })
        .when(Boolean(hero), (el) => el.child(sprite(variant[a.address] ? `${hero}-alt` : hero, 16)))
        .child(div().text_size(11.5).text_color(on ? t.foreground : t.dim).child(names[a.address] ?? titleCase(hero) ?? a.program?.name ?? a.address));
    };
    const memoryText = live.length === 0 ? "no agents" : `${inMemory} of ${live.length} agent${live.length === 1 ? "" : "s"}`;
    return v_flex().size_full().min_w(0).min_h(0).p(12).gap(8).bg(t.chrome).text_size(13)
      .child(h_flex().gap(8).items_center()
        .child(this.parrot(28, waiting))
        .child(div().flex_1().min_w(0).text_size(14).font_semibold().text_color(t.foreground).child("Ranch Chat"))
        .when(this.log.length > 0, (el) => el.child(this.link(t, "chat-clear", "Clear", (_e, cx2) => { this.log = []; this.settled.clear(); save(LOG_KEY, []); cx2.notify(); })))
        .child(h_flex().id("model-pick").px(8).h(24).gap(4).items_center().flex_none().rounded(12).border(1).border_color(this.openModel ? t.accent : t.border)
          .text_size(11.5).text_color(t.muted).cursor_pointer().hover((el) => el.bg(t.hover))
          .on_click((_e, cx2) => { this.openModel = !this.openModel; cx2.notify(); })
          .child(modelOf(this.model).label).child(div().text_size(9).child(this.openModel ? "▴" : "▾")))
        .child(div().id("chat-close").size(24).flex().items_center().justify_center().flex_none().rounded(12).cursor_pointer()
          .text_color(t.muted).hover((el) => el.bg(t.hover).text_color(t.foreground)).tooltip("Close the chat")
          .on_click(() => { const ov = props()?.overlay; if (ov) closeOverlay(ov); else run("layout.hide", { id: "panel" }); })
          .child(svg("mods/pane/close.svg").size(12))))
      .when(this.openModel, (el) => el.child(v_flex().gap(2).p(4).rounded(8).border(1).border_color(t.border).bg(t.background)
        .children(MODELS.map((m) => h_flex().id(`model-${m.id}`).h(28).px(8).items_center().rounded(6).text_size(12)
          .text_color(m.id === this.model ? t.foreground : t.muted).bg(m.id === this.model ? t.selected : t.background)
          .hover((e) => e.bg(t.hover)).cursor_pointer()
          .on_click((_e, cx2) => { this.model = m.id; save(MODEL_KEY, m.id); this.openModel = false; cx2.notify(); })
          .child(m.label)))))
      .child(h_flex().gap(10).items_center()
        .child(h_flex().id("mem-toggle").gap(4).items_center().cursor_pointer().text_size(11).text_color(t.dim).hover((el) => el.text_color(t.foreground))
          .on_click((_e, cx2) => { this.openMem = !this.openMem; cx2.notify(); })
          .child(`Knows ${memoryText}`).child(div().text_size(9).child(this.openMem ? "▴" : "▾")))
        .child(h_flex().id("style-toggle").gap(4).items_center().cursor_pointer().text_size(11).text_color(t.dim).hover((el) => el.text_color(t.foreground))
          .on_click((_e, cx2) => { this.openStyle = !this.openStyle; cx2.notify(); })
          .child("Style").child(div().text_size(9).child(this.openStyle ? "▴" : "▾")))
        .child(div().flex_1())
        .child(h_flex().id("code-toggle").gap(5).items_center().cursor_pointer().text_size(11)
          .text_color(this.code ? t.foreground : t.dim).hover((el) => el.text_color(t.foreground))
          .tooltip("Let the parrot read the code of agents on this computer, and their git. It never writes.")
          .on_click((_e, cx2) => { this.code = !this.code; save(CODE_KEY, this.code); cx2.notify(); })
          .child(div().size(8).flex_none().rounded(4).bg(this.code ? t.accent : t.border))
          .child("Reads code")))
      .when(this.openStyle, (el) => el.child(v_flex().gap(6).p(8).rounded(8).border(1).border_color(t.border).bg(t.background)
        .child(div().text_size(11).text_color(t.dim).child("Tone"))
        .child(h_flex().gap(5).flex_wrap().children(TONES.map((o) => h_flex().id(`tone-${o.id}`).px(9).h(24).items_center().flex_none().rounded(12).border(1).text_size(11.5).cursor_pointer()
          .border_color(o.id === this.tone ? t.accent : t.border).bg(o.id === this.tone ? t.selected : t.background)
          .text_color(o.id === this.tone ? t.foreground : t.muted).hover((e) => e.bg(t.hover))
          .on_click((_e, cx2) => { this.tone = o.id; save(TONE_KEY, o.id); cx2.notify(); })
          .child(o.label))))
        .child(div().text_size(11).text_color(t.dim).pt(4).child("Your instructions (used in every message)"))
        .child(Textarea.new(this.area).w_full().px(8).py(6).rounded(6).border(1).border_color(t.border).bg(t.chrome).text_size(12).text_color(t.foreground))))
      .when(this.openMem, (el) => el.child(v_flex().gap(6)
        .child(h_flex().gap(5).flex_wrap().children(live.map(chip)))
        .when(live.length > 1, (e2) => e2.child(h_flex().gap(10)
          .child(this.link(t, "mem-all", "All", (_e, cx2) => { this.off = []; save(OFF_KEY, []); cx2.notify(); }))
          .child(this.link(t, "mem-none", "None", (_e, cx2) => { this.off = live.map((a) => a.address); save(OFF_KEY, this.off); cx2.notify(); }))))))
      .child(div().h(1).w_full().flex_none().bg(t.border))
      .child(v_flex().id("chat-log").flex_1().min_h(0).gap(6).py(4).overflow_y_scrollbar().track_scroll(this.scroll)
        .when(this.log.length === 0, (el) => el.child(v_flex().gap(8).py(6)
          .child(div().text_size(12).text_color(t.dim).child("Ask me anything about your agents. I look at what they are doing, their git and their code, fresh each time. I only read; I never change anything."))
          .children(SUGGESTIONS.map((s, i) => div().id(`suggest-${i}`).px(10).py(6).rounded(14).border(1).border_color(t.border).text_size(12).text_color(t.muted)
            .cursor_pointer().hover((e) => e.bg(t.hover)).on_click((_e, cx2) => this.ask(cx2, s)).child(s)))))
        .children(rows.map((m, n) => this.row(t, m, n)))
        .when(waiting, (el) => el.child(h_flex().id("typing").w_full().gap(7).items_end()
          .child(rows.at(-1)?.kind === "parrot" ? div().w(24).flex_none() : sprite("parrot-idle", 24))
          .child(div().id("typing-bubble").px(11).py(7).rounded(12).bg(t.background).text_size(12).text_color(t.dim).loop("opacity", { from: 0.45, to: 1, period: 900 }).child(this.busy ? this.phase : "typing…")))))
      .child(h_flex().gap(8).items_center()
        .child(Input.new(this.input).flex_1().h(36).px(10).rounded(18).border(1).border_color(t.accent).bg(t.background).text_size(12.5).text_color(t.foreground))
        .child(div().id("chat-send").px(14).h(36).flex().items_center().rounded(18).flex_none().font_semibold().text_size(12.5)
          .bg(waiting ? t.background : t.solid ?? t.accent).text_color(waiting ? t.dim : t.solid_foreground ?? t.background)
          .cursor_pointer().on_click((_e, cx2) => this.ask(cx2)).child("Send")));
  }
}
