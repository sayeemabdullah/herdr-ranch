# Changelog

## 0.5.0

- **Ranch Chat is a side panel.** It opens in the right-hand panel with Files and Changes: click **Chat** to open or close it, drag the divider to resize it. A new setting, **Chat in a side panel** in Ranch settings, switches it back to a pop-up window. The Chat button text in Ranch settings said "owl"; it is the parrot.

## 0.4.0

Ranch Chat.

- **Ranch Chat**: a parrot **Chat** button in the top bar (before the **+**) opens a chat with a parrot that has your living agents' memory. Every message reads each running agent's recent screen fresh, so new agents join by themselves; tick or untick the animals to talk about one, a few or all. Pick the model for the chat (Fable 5.2, Opus 5.5, Sonnet 5.5, Haiku 5.5). It answers through `claude -p` with no tools, so it only talks: it cannot change files or message agents. Hide the button in Ranch settings (**Chat button**).
- README: "What it runs" now names the update check and Ranch Chat as the only things that use the network.

## 0.3.0

Agent list polish.

- **Show only one state.** The sort button in the Agents header now also has a **Show** list (Everyone, Needs you, Working, Done, Resting); a small chip in the header says what is filtered and clears it. There is a new sort, **Waiting longest first**, next to Priority (which already puts "Needs you" on top).
- **"N needs you" in the status bar is a button.** It is red and bold, and a click focuses the next agent waiting for you, then the next, and around.
- **Two agents per row.** A new setting in Ranch settings (the `···` button): smaller cards, side by side, with the animal, its name, the space it is connected to (red while it needs you) and the HP and SP bars. Hover for the pin; sub-agent rows are left out in this layout.
- **Hide the Ranch board** (the tree, tasks done today and spend) from Ranch settings.
- **Scout lights up while reviewing**: a coloured edge and tint on its card, and "Reviewing" in the colour of work, on top of the busy poses it already had.

## 0.2.2

The Update button works from anywhere, and agent cards match the server cards.

- **Agent cards are one size, like the server cards** (50px): the animal, its name and state on the first line; the space, model, cost and tab title (or what a task changed) on the second; HP and SP as two thin bars along the bottom, with the numbers on hover.
- **The Ranch Dusk picture is the real dark screenshot again** (`assets/preview-dusk.png` had been replaced by the banner by mistake), and the window pictures show the new agent cards.
- **Update button fixed.** It tried to open a terminal tab in the selected space, which fails (`tab.new failed: cannot start a terminal`) when that space is on another machine. It now updates in the background on this computer, with toasts for "updating", "now vX.Y.Z" and any error.

## 0.2.1

A calmer sidebar, a fixed and restyled worktree dialog, and Ranch settings.

- **Worktree dialog fixed and restyled.** The + that made a worktree failed with `unknown machine ""`; fixed. The New and Open worktree dialog is now a ranch-styled `ranch-worktree` mod with a folder preview, real buttons, softer errors, and a Delete on every row of the Open list (press twice; the branch stays, uncommitted changes are warned about first).
- **A calmer sidebar.** Reviewer, Servers and Worktrees each have a heading with a chevron to fold them (Worktrees starts folded), thin lines between them, slimmer server cards, and Worktrees shows only the main checkout, the open ones and three more, with "+ N more" for the rest.
- **Hide what you don't use.** The ··· button in the status bar, left of CPU, opens "Ranch settings": tick Reviewer, Servers, Worktrees and the version and update button on or off.
- **Servers on Linux.** The list now works with `ss` and `/proc` where `lsof` is missing; a process with several ports shows `+N`; the port no longer gets squeezed out by a long program name. Restart and Update run in `/bin/sh`, so they no longer need zsh.
- **README pictures.** A Servers and worktrees section with the new pictures: the sections, the toasts, the Open worktree list, the sidebar settings and the Update tab.
- **Buttons follow the theme.** The pixel x, +, ··· and arrow use the theme's text colour, so they show on the light theme too.

## 0.2.0

Servers and Worktrees sections, an Update button and a new gallery picture.

- **Servers.** Every dev server running in one of your spaces or worktrees (read with `lsof`; Claude Code's own listeners are left out) is a card under the spaces: a pig, cat, frog or hedgehog of its own, the port in gold, the program, the space and how long it has been up. Click to open `http://localhost:<port>`. The pixel x asks "Stop?" and a second press within 4 seconds ends it. The cards use the same plain style, colours and headings as Reviewer and the agent cards.
- **Server ended? Restart it.** A server that stops by itself toasts, and its card turns red for a minute with a Restart button that runs the same command in a visible tab.
- **Worktrees.** A repo with more than one worktree gets a list of pixel trees: a full tree for the main checkout, a young tree for a branch with a space open, a sapling ("+ open") for one without. Each branch with a pull request shows `#42` and its CI (needs `gh`); click it to open the PR. The + on a repo makes a worktree and starts an agent in it.
- **Port clash toast.** When an agent's screen says a port is already in use (`EADDRINUSE` and the like), a toast names the program and process that holds it.
- **Update button.** The status bar shows `Ranch v0.2.0`; click it to check now. When a newer release is out it becomes a gold "Update to vX.Y.Z" button, and one click opens a tab that downloads the release and runs its installer. `install.sh` now leaves a `herdr-ranch.version` file for it to compare, so a copy installed before this release gets the button after its next manual update.
- **New pictures.** `preview.png` is now a banner (the pixel title, five callouts, the window and the twelve animals on a fence), drawn by `tools/preview_banner.py`. `assets/servers-worktrees.png` and the window screenshots show the new sections, drawn by `tools/sections_picture.py`; the plain dark screenshot is `assets/preview-dusk.png`.

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
