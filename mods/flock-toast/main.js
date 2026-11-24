// How notifications look. Anything can post one with notify({ title, body,
// level, icon, action }); replace this mod to restyle them all. Click to
// run its action (e.g. go to the agent) and dismiss it.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, shared, exec, window, appHome, checking, playSound } from "herdr";

// Written by the flock mod: terminal address to animal, to its name, and to its colour variant (0 or 1).
const CAST_KEY = "flock.cast";
const NAMES_KEY = "flock.names";
const VARIANT_KEY = "flock.variant";
const SUMMARY_KEY = "flock.summary";
// The animal sounds are on unless the flock mod's speaker button turned them off (shared `flock.sound`).
const SOUND_KEY = "flock.sound";
const ICON_SIZE = 28;
// Herdr's own agent toasts read "<program> finished" or "<program> needs you".
const AGENT_TOAST = /^(.+) (finished|needs you)$/;
const EVENT = {
  finished: { pose: "done", line: "All done" },
  "needs you": { pose: "blocked", line: "Needs you" },
};
// What each animal says, so a toast reads like "Clover: baa! is done".
const SOUND = {
  sheep: "Baa", goat: "Meh", rabbit: "Squeak", chicken: "Bawk", cow: "Moo", horse: "Neigh",
  duck: "Quack", llama: "Hum", fox: "Yip", owl: "Hoo", dragon: "Roar",
};

// Title and body go in as arguments, never into the script text, so quotes in them stay inert.
const SYSTEM_NOTIFICATION = ["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run"];
// Clicking the banner brings Herdr forward.
const HERDR_BUNDLE = "dev.herdr.app";

function reportFailure(tool) {
  return (r) => { if (r.code !== 0) console.error(`System notification failed (${tool} ${r.code}): ${r.stderr}`); };
}

// macOS drops osascript banners started from inside Herdr, so terminal-notifier (its own app,
// its own permission) comes first; osascript only runs when it isn't installed.
function postToMacos(title, body, image) {
  const picture = image ? ["-contentImage", `${appHome()}/${image}`] : [];
  exec("terminal-notifier", ["-title", title, "-message", body || " ", "-activate", HERDR_BUNDLE, ...picture]).then(
    reportFailure("terminal-notifier"),
    () => exec("osascript", [...SYSTEM_NOTIFICATION, title, body]).then(
      reportFailure("osascript"),
      (e) => console.error(`System notification failed: ${e}`),
    ),
  );
}

function postToLinux(title, body, image) {
  const icon = image ? ["-i", `${appHome()}/${image}`] : [];
  exec("notify-send", ["-a", "Herdr", ...icon, title, body]).then(
    reportFailure("notify-send"),
    (e) => console.error(`System notification failed (is notify-send installed?): ${e}`),
  );
}

// The in-app toast can't be seen from behind another app, so mirror it to the system's banners.
// Windows has no banner command to call, so there the in-app toast is all.
function postToSystem(platform, title, body, image) {
  if (platform === "macos") postToMacos(title, body, image);
  if (platform === "linux") postToLinux(title, body, image);
}

function animalOf(p) {
  const event = AGENT_TOAST.exec(p.title ?? "");
  const terminal = p.action?.name === "agent.focus" ? p.action.args?.terminal : null;
  const animal = terminal ? shared(CAST_KEY)?.[terminal] : null;
  if (!event || !animal) return null;
  const { pose, line } = EVENT[event[2]];
  const name = shared(NAMES_KEY)?.[terminal] ?? `${animal[0].toUpperCase()}${animal.slice(1)}`;
  const id = shared(VARIANT_KEY)?.[terminal] ? `${animal}-alt` : animal;
  const sound = SOUND[animal];
  // What the task changed, when the flock mod has it: "3 files +120 −30".
  const made = event[2] === "finished" ? shared(SUMMARY_KEY)?.[terminal]?.text : null;
  const body = [event[1], p.body, made].filter(Boolean).join(" · ");
  return {
    title: sound ? `${name}: ${sound.toLowerCase()}! ${line}` : `${name}: ${line}`,
    body,
    icon: `mods/flock/sprites/${id}-${pose}.svg`,
    banner: `mods/flock/banners/${id}-${pose}.png`,
    sound: `mods/flock/sounds/${animal}.wav`,
  };
}

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class Toast extends View {
  // init, not render: from another macOS Space the window may not draw, so render may not run.
  init() {
    const w = window();
    const raw = props() ?? {};
    const p = { ...raw, ...animalOf(raw) };
    // The animal says its piece whenever its toast appears, in the window or behind another app.
    if (!checking() && p.sound && shared(SOUND_KEY) !== false) playSound(p.sound);
    if (checking() || !w || w.active) return;
    postToSystem(w.platform, p.title ?? "Herdr", p.body ?? "", p.banner);
  }

  render(cx) {
    const t = theme();
    const raw = props() ?? {};
    const p = { ...raw, ...animalOf(raw) };
    const iconSize = p.icon === raw.icon ? 18 : ICON_SIZE;
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    return h_flex()
      .id("toast")
      .size_full()
      .px(18)
      .gap(12)
      .items_center()
      .bg(t.popover)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(p.icon ? image(p.icon).w(iconSize).h(iconSize).flex_none() : div().size(8).rounded(4).flex_none().bg(t[DOT[p.level] ?? "accent"]))
      .child(
        v_flex()
          .flex_1()
          .overflow_hidden()
          .child(div().truncate().font_semibold().text_size(13).text_color(t.foreground).child(login ? `${login[1]} needs a login: run` : p.title ?? ""))
          .when(!login && Boolean(p.body), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(p.body ?? "")))
          .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().tooltip(command).text_size(12).text_color(t.muted).child(command))
            .child(div().id("toast-login-copy").flex_none().px(6).py(3).rounded(4).bg(t.raised)
              .text_size(12).text_color(t.foreground).cursor_pointer().hover(s => s.bg(t.hover))
              .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
              .child(this.copied ? "Copied" : "Copy")))),
      );
  }
}
