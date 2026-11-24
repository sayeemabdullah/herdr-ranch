# Security policy

Herdr Ranch is a set of herdr mods. **Mods are trusted code: they run with your permissions.** Read what they do before you install (see the README under [What it runs](README.md#what-it-runs)).

## Reporting a problem

Please **don't open a public issue** with the details.

1. Go to the **Security** tab of this repo and choose **Report a vulnerability**. That opens a private report only the maintainer can see.
2. If that button isn't there, open a public issue that says only "I have a security report" (no details), and a private way to talk will be arranged.

Useful to include: what you did, what happened, what you expected, your herdr version (`herdr-app --version`) and your Herdr Ranch version (the top of [CHANGELOG.md](CHANGELOG.md)).

This is a one-person project, so replies are best effort, but a report is read and answered.

## What counts

- **Running something unexpected.** A mod running a command that isn't listed in the README's "What it runs", or one that can be steered by a terminal's screen, a folder name or a branch name.
- **Reaching the network.** Any request leaving your machine. The mods make none.
- **Writing outside their own files.** A mod changing anything other than its own folder, the shared values it publishes, the notifications it posts, and the install script's documented copies and backups.
- **The installer.** `install.sh` replacing, deleting or overwriting something it didn't back up.

## What doesn't count

- A warning from `herdr-app check` that says "mod called hc": `flock` reads each agent's screen with `hc read` by design.
- Things herdr itself does (sandboxing, the app's updates): report those to herdr.

## Supported versions

Only the latest release.
