// Which spaces are really using PR Reviewer's PR Panel (the herdr-PR-reviewer plugin), as opposed to
// a space that only has "PR Reviewer" in its name, such as the one where you write the plugin.

// The panel's terminal title is "pr-panel" (or the pane's title "PR Panel"); the watcher's is "PR watcher".
const TITLE = /^(pr-panel|pr panel|pr watcher|pr reviewer check)\b/i;
// What it runs: node .../pr-reviewer.../src/panel.js (also watcher.js, doctor.js), or the pr-panel command.
const SCRIPT = /pr-reviewer[^\s]*[\\/]src[\\/](panel|watcher|doctor)\.js$|[\\/]pr-panel$/i;

const runs = (argv) => Array.isArray(argv) && argv.some((a) => SCRIPT.test(String(a)));

/** True when this pane or its terminal is PR Reviewer's panel or watcher. */
export function isPrPanel(pane, terminal) {
  return (
    TITLE.test(pane?.title ?? "") || TITLE.test(pane?.name ?? "") || TITLE.test(terminal?.title ?? "") ||
    runs(terminal?.foreground?.argv) || runs(terminal?.argv)
  );
}

/** The ids of the spaces with a PR Panel or watcher pane in one of their tabs. */
export function reviewerSpaces(spaces, panes, terminals) {
  const byAddress = new Map((terminals ?? []).map((t) => [t.address, t]));
  const found = new Set();
  for (const space of spaces ?? []) {
    const tabs = new Set((space.tabs ?? []).map((t) => t.id));
    if ((panes ?? []).some((p) => tabs.has(p.tab) && isPrPanel(p, byAddress.get(p.terminal)))) found.add(space.id);
  }
  return found;
}
