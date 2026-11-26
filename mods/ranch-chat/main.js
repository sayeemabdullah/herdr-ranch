// Ranch Chat: talk with an owl that has your living agents' memory, to plan and compare.
// The memory is each agent's recent screen (hc read), taken fresh with every message; the answer is one
// `claude -p` call with the model you pick, with no tools. Nothing is sent to an agent.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { agents, theme, shared, exec, hc } from "herdr";
import { MODELS, modelOf, remembered, buildMemory, systemPrompt, buildPrompt, claudeArgs, parseReply } from "./chat.js";

const MODEL_KEY = "ranch.chat.model";
const OFF_KEY = "ranch.chat.off";
const LOG_KEY = "ranch.chat.log";
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

export default class RanchChat extends View {
  init(_props, cx) {
    this.model = modelOf(load(MODEL_KEY, null)).id;
    this.off = load(OFF_KEY, []); // agents switched off; everyone else alive is in the memory
    this.log = load(LOG_KEY, []);
    this.busy = false;
    this.scroll = ScrollHandle.new();
    this.input = InputState.new({ value: "", placeholder: "Ask about your agents, or plan the next step…" });
    this.input.on("submit", (_e, cx2) => this.ask(cx2));
    this.toEnd = true;
  }

  // The owl while it thinks: two frames, as the agent cards do.
  owl(size, busy) {
    if (!busy) return sprite("owl-idle", size);
    const frame = (file) => sprite(file, size);
    return div().relative().w(size).h(size).flex_none()
      .child(frame("owl-work").loop("opacity", { from: 7, to: -6, period: 700, easing: "linear" }))
      .child(frame("owl-2").absolute().top(0).left(0).loop("opacity", { from: -6, to: 7, period: 700, easing: "linear" }));
  }

  // Reads every remembered agent's screen now, asks the model, adds the reply.
  ask(cx, text) {
    const question = (text ?? this.input.value()).trim();
    if (!question || this.busy) return;
    this.input.set_value?.("");
    const before = this.log;
    this.log = [...before, { role: "user", text: question }];
    this.busy = true;
    this.toEnd = true;
    save(LOG_KEY, this.log.slice(-KEEP));
    cx.notify();
    const model = this.model;
    cx.spawn(async (cx2) => {
      let reply;
      let count = 0;
      try {
        const live = remembered(agents(), this.off);
        count = live.length;
        const names = shared("flock.names") ?? {};
        const cast = shared("flock.cast") ?? {};
        const reads = await Promise.allSettled(live.map((a) => hc(["read", a.address])));
        const blocks = live.map((a, i) => ({
          name: names[a.address] ?? a.program?.name ?? a.address,
          animal: cast[a.address] ?? null,
          space: a.space_name ?? "",
          status: a.status,
          screen: reads[i].status === "fulfilled" && reads[i].value.code === 0 ? reads[i].value.stdout : "",
        }));
        const system = systemPrompt(buildMemory(blocks), live.length);
        const r = await exec("claude", claudeArgs({ model, system, prompt: buildPrompt(before, question) }), { timeout: 240000 });
        reply = parseReply(r);
      } catch (error) {
        reply = { ok: false, text: String(error).slice(0, 240) };
      }
      this.log = [...this.log, { role: "owl", text: reply.text, error: !reply.ok, model, count }];
      this.busy = false;
      this.toEnd = true;
      save(LOG_KEY, this.log.slice(-KEEP));
      cx2.notify();
    });
  }

  pill(t, id, label, on, action) {
    return div().id(id).px(9).h(24).flex().items_center().flex_none().rounded(6).border(1).text_size(11.5).cursor_pointer()
      .border_color(on ? t.accent : t.border).bg(on ? t.selected : t.raised).text_color(on ? t.foreground : t.muted)
      .hover((el) => el.bg(t.hover)).on_click(action).child(label);
  }

  bubble(t, m, i) {
    const mine = m.role === "user";
    const lines = String(m.text).split("\n");
    const side = (el) => (mine ? el.items_end() : el.items_start());
    return side(v_flex().id(`msg-${i}`).w_full().gap(3))
      .child(v_flex().max_w(460).px(11).py(8).rounded(10).border(1).gap(2).text_size(12.5)
        .border_color(m.error ? t.blocked : mine ? t.accent : t.border).bg(mine ? t.selected : t.chrome)
        .text_color(m.error ? t.blocked : t.foreground)
        .children(lines.map((l) => div().min_w(0).child(l === "" ? " " : l))))
      .when(!mine && !m.error && m.model, (el) => el.child(div().px(4).text_size(10.5).text_color(t.dim)
        .child(`${modelOf(m.model).label} · ${m.count === 0 ? "no agents in the memory" : m.count === 1 ? "1 agent in the memory" : `${m.count} agents in the memory`}`)));
  }

  render(cx) {
    const t = theme();
    const live = agents();
    const names = shared("flock.names") ?? {};
    const cast = shared("flock.cast") ?? {};
    const variant = shared("flock.variant") ?? {};
    const inMemory = remembered(live, this.off).length;
    // The view follows the newest message after a send or a reply.
    if (this.toEnd) { this.toEnd = false; try { this.scroll.scroll_to_bottom(); } catch { /* ignore */ } }
    const chip = (a) => {
      const on = !this.off.includes(a.address);
      const hero = cast[a.address];
      return h_flex().id(`mem-${a.address}`).px(8).h(26).gap(6).items_center().flex_none().rounded(6).border(1).cursor_pointer()
        .border_color(on ? t.accent : t.border).bg(on ? t.selected : t.raised).hover((el) => el.bg(t.hover))
        .on_click((_e, cx2) => {
          this.off = on ? [...this.off, a.address] : this.off.filter((x) => x !== a.address);
          save(OFF_KEY, this.off);
          cx2.notify();
        })
        .when(Boolean(hero), (el) => el.child(sprite(variant[a.address] ? `${hero}-alt` : hero, 18)))
        .child(div().text_size(11.5).text_color(on ? t.foreground : t.dim).child(names[a.address] ?? titleCase(hero) ?? a.program?.name ?? a.address));
    };
    const link = (id, label, action) => div().id(id).text_size(11).text_color(t.dim).cursor_pointer().hover((el) => el.text_color(t.foreground)).on_click(action).child(label);
    return v_flex().size_full().min_h(0).p(16).gap(10).bg(t.popover).text_size(13)
      .child(h_flex().gap(10).items_center()
        .child(this.owl(40, this.busy))
        .child(v_flex().flex_1().min_w(0)
          .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Ranch Chat"))
          .child(div().truncate().text_size(11.5).text_color(t.dim).child("An owl that has your living agents' memory. Ask it to plan.")))
        .when(this.log.length > 0, (el) => el.child(link("chat-clear", "Clear", (_e, cx2) => { this.log = []; save(LOG_KEY, []); cx2.notify(); }))))
      .child(h_flex().gap(5).items_center().flex_wrap()
        .child(div().text_size(11).text_color(t.dim).mr(3).child("Model"))
        .children(MODELS.map((m) => this.pill(t, `model-${m.id}`, m.label, m.id === this.model, (_e, cx2) => { this.model = m.id; save(MODEL_KEY, m.id); cx2.notify(); }))))
      .child(v_flex().gap(6)
        .child(h_flex().gap(10).items_center()
          .child(div().text_size(11).text_color(t.dim).child(live.length === 0 ? "Memory: no agents are running" : `Memory: ${inMemory} of ${live.length} agent${live.length === 1 ? "" : "s"}`))
          .child(div().flex_1())
          .when(live.length > 1, (el) => el.child(link("mem-all", "All", (_e, cx2) => { this.off = []; save(OFF_KEY, []); cx2.notify(); })
            ).child(link("mem-none", "None", (_e, cx2) => { this.off = live.map((a) => a.address); save(OFF_KEY, this.off); cx2.notify(); }))))
        .child(h_flex().gap(5).flex_wrap().children(live.map(chip))))
      .child(div().h(1).w_full().flex_none().bg(t.border))
      .child(v_flex().id("chat-log").flex_1().min_h(0).gap(10).overflow_y_scrollbar().track_scroll(this.scroll)
        .when(this.log.length === 0, (el) => el.child(v_flex().gap(8).py(8)
          .child(div().text_size(12).text_color(t.dim).child("Every message reads your agents' screens fresh, so the owl always knows what they are doing now. New agents join by themselves; untick one above to leave it out."))
          .children(SUGGESTIONS.map((s, i) => div().id(`suggest-${i}`).px(10).py(7).rounded(8).border(1).border_color(t.border).bg(t.raised).text_size(12).text_color(t.muted)
            .cursor_pointer().hover((e) => e.bg(t.hover)).on_click((_e, cx2) => this.ask(cx2, s)).child(s)))))
        .children(this.log.map((m, i) => this.bubble(t, m, i)))
        .when(this.busy, (el) => el.child(div().px(4).text_size(11.5).text_color(t.dim).child(`The owl is reading ${inMemory === 1 ? "1 agent" : `${inMemory} agents`} and thinking…`))))
      .child(h_flex().gap(8).items_center()
        .child(Input.new(this.input).flex_1().h(38).px(10).rounded(8).border(1).border_color(t.accent).bg(t.background).text_size(12.5).text_color(t.foreground))
        .child(div().id("chat-send").px(14).h(38).flex().items_center().rounded(8).flex_none().font_semibold().text_size(12.5)
          .bg(this.busy ? t.raised : t.solid ?? t.accent).text_color(this.busy ? t.dim : t.solid_foreground ?? t.background)
          .cursor_pointer().on_click((_e, cx2) => this.ask(cx2)).child(this.busy ? "…" : "Send")))
      .child(h_flex().justify_between().text_size(10.5).text_color(t.dim)
        .child("Chat only: it cannot run anything or message your agents.")
        .child("esc close"));
  }
}
