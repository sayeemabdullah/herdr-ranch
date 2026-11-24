// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, spaces, props, run, theme, home, layout, shared } from "herdr";

// Match the first visible tab frame, including the active child of a stack.
function paneFrame(node) {
  if (!node || node.hidden) return null;
  if (node.content?.tab && node.content.pane) return node.content.pane;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter(child => !child.hidden);
    children = [visible.find(child => child.id === node.active) ?? visible[0]];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return null;
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class Pane extends View {
  init() { this.hovered = false; }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .border(2).border_color(t.canvas)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(14));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    // The tab `ranch` opens is named VS Code; its terminal title ("t1n") and process (an Electron helper) say little.
    const inVsCodeTab = !p.program?.agent && spaces().some((s) => (s.tabs ?? []).some((tab) => tab.id === p.tab && tab.name === "VS Code"));
    const name = inVsCodeTab ? "VS Code" : p.name || ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    // An agent's animal and its name stand in for the program's icon and name.
    const cast = shared("flock.cast") ?? {};
    const names = shared("flock.names") ?? {};
    const variants = shared("flock.variant") ?? {};
    const hero = cast[p.terminal];
    // A plain terminal (not an agent) is the tortoise, with the random name the sidebar gave it.
    const terminalName = !hero && p.terminal && !p.program?.agent ? (shared("ranch.terminal.names") ?? {})[p.terminal] : null;
    const sprite = hero ? `${hero}${variants[p.terminal] ? "-alt" : ""}${p.status === "working" ? "-work" : p.status === "blocked" ? "-blocked" : p.status === "done" ? "-done" : ""}`
      : terminalName ? (p.program?.shell ? "tortoise-idle" : "tortoise-work") : null;
    const animalName = hero ? names[p.terminal] : terminalName;
    const pic = sprite ? image(`mods/flock/sprites/${sprite}.svg`).w(26).h(26).flex_none() : icon(p.program, 14, t.dim);
    const st = p.status;
    const pane = p.pane;
    const bottom = paneFrame(layout())?.header?.position === "bottom";
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.canvas)
      .when(bottom, el => el.border_t(2))
      .when(!bottom, el => el.border_b(2))
      .border_color(p.focused ? t.accent : t.border)
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .when(Boolean(animalName), el => el.child(div().flex_none().truncate().max_w(160).font_bold().text_color(t.accent).child(animalName)))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(name))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(3).border(2).border_color(t.blocked).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(3).border(2).border_color(t.done).bg(t.done + "26").text_size(10.5).font_semibold().text_color(t.done).child("Done")))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
