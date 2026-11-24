# Changelog

## Unreleased

- **Servers section.** Dev servers running in your spaces and worktrees, as cards with the port, program, space and uptime. Click to open in the browser; the x asks "Stop?" and a second press ends the process.
- **Server ended? Restart it.** A server that stops by itself toasts, and its card stays a minute with a Restart button.
- **PR and CI on worktrees**, and a **+ worktree + agent** button on each repo.
- **Port clash toast** naming what holds the port, when an agent hits EADDRINUSE.
- **Worktrees section.** Each repo with more than one worktree lists them, with a dot where a space is open and one click to open or create it.
- **A new preview picture.** `preview.png` is now a banner: the pixel title, what the layout is in one line, three callouts, the real window and the twelve animals on a fence. It is drawn by `tools/preview_banner.py`. The plain dark screenshot moved to `assets/preview-dusk.png` for the theme section.

## 0.1.0

First release. A herdr layout where every coding agent is its own pixel animal. Built for herdr-app 0.1.16 on macOS.

- **Every agent is an animal.** 8 common ones (sheep, goat, rabbit, chicken, cow, horse, duck, llama) and 3 rare ones (fox, owl, dragon, about 1 agent in 10), each with a random farm name kept per terminal. Nobody shares an animal until all 8 are in use; repeats get alternate colours. Colourful 24x24 front-facing pixel figures with scarves, a bow tie, a poncho and more.
- **Scout the sheepdog and a Reviewer section.** A space where [PR Reviewer](https://github.com/sayeemabdullah/herdr-PR-reviewer)'s PR Panel (or watcher) is running leaves the Spaces list and gets a section of its own under it: Scout, what it is doing, one click to its space. The space's name doesn't matter, and a space that is only named like it stays an ordinary space with an emblem.
- **The animals live their day.** Working animals step and show three bouncing dots. A newly idle animal stands and bobs, naps with floating Z after 2 minutes, and gets a ringing pixel alarm clock ("Wake up!") after 5. A finished animal gets confetti until you look at it. A red badge means it needs you; a tick tucks a finished animal into the barn until its next task.
- **Arch-badge space emblems** (barn, silo, haystack, pond, windmill, orchard, fence) that follow your clock: dawn, day, dusk, night with a moon and stars. A star twinkles while a space has an agent working.
- **Ranch board.** Tasks done today, work time, today's spend, and an apple tree that grows at 1, 4, 8, 13, 19 and 26 tasks, blossoms at 30 and droops while someone has waited on you for over 5 minutes. A 5-segment gauge shows the lowest 5-hour quota left when an agent's screen shows one.
- **Needs-you bell.** Rings with a red count in the Agents header; click it for every waiting animal across all spaces, longest wait first.
- **Find, rename, baby animals.** A magnifier filters animals by name, space or state (Enter jumps to the first match). Click an animal's name to rename it. A sub-agent is a mini copy of its parent beside its name.
- **Dev helpers.** Warning toasts when an agent's context is 80% full, the 5-hour quota is down to 10%, or it looks stuck (working, screen unchanged for 5 minutes). A finished task shows what it changed ("✎ 3 files +120 −30", from `git diff --shortstat HEAD`) on its card and on the done toast. Each card shows its session cost.
- **Memory share.** Hover an animal's card and press ↗ to send its recent screen to another agent. The window is in the ranch theme: pick the agent, write the first line, choose 20, 40, 80, 160 or 300 lines or type your own number up to 1000, read the exact text in the preview, and press Send. Never automatic; it does not copy memory files or skills.
- **Animal sounds.** The animal says its piece when its done or needs-you toast appears: 11 tiny chiptune sounds drawn in code (`tools/sounds.py`). The ♪ button in the Agents header mutes them; herdr's own alert sound is separate.
- **Honest numbers.** The cost is read only from the status-line row, never from a dollar amount in the chat, and clicking the spend on the ranch board starts counting from zero. A working spell under 20 seconds is not a task. Only agents that are working, focused, just changed or stale are read, so many agents cost little to watch.
- **Top bar and footer.** A "Herdr Ranch" sign whose barn follows the clock, gold-boxed pixel tabs, a ranch strip in the tab bar (who is working, tasks done today, Scout on watch, and in red whoever needs you), a pane header with the animal's name, and a pixel fence over the footer.
- **Status bar** with the count of agents by state and CPU, RAM and disk meters.
- **Themes.** Ranch Dusk (plum, gold accents) and Ranch Meadow (light sage) follow the system. Dialogs and menus (Close space?, rename, popups) use the gold main button.
- **Toasts** in the animal's voice ("Clover: baa! All done"), with system banners when herdr is in the background (`terminal-notifier` on macOS, `notify-send` on Linux).
- **Installer** (`install.sh`) that backs up what it replaces and checks every mod; a [RECIPE.md](RECIPE.md) another agent can rebuild the layout from.
- A README with a demo GIF (drawn from the real sprites and timings), the cast, the space emblems in four skies, both themes and an Update section.
- Built on the structure of herdr-middle-earth (MIT, see [NOTICE.md](NOTICE.md)); ideas from Pixel HQ. All art and code here are new.
