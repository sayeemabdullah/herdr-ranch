// Is there a newer Herdr Ranch release? Pure helpers for the Update button in the status bar.

export const REPO = "sayeemabdullah/herdr-ranch";
export const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const TAG = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** [major, minor, patch] from "0.1.0" or "v0.1.0", or null. */
export function parseVersion(text) {
  const m = TAG.exec(String(text ?? "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** true when `remote` is a newer version than `local`; false if either is unreadable. */
export function isNewer(local, remote) {
  const a = parseVersion(local), b = parseVersion(remote);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] > a[i];
  return false;
}

/** { tag: "v0.2.0", version: "0.2.0", url } from the GitHub "latest release" JSON, or null (drafts and pre-releases too). */
export function parseRelease(json) {
  let r;
  try { r = JSON.parse(json); } catch { return null; }
  if (!r || r.draft || r.prerelease) return null;
  const v = parseVersion(r.tag_name);
  if (!v) return null;
  const version = v.join(".");
  return { tag: `v${version}`, version, url: typeof r.html_url === "string" ? r.html_url : `https://github.com/${REPO}/releases/tag/v${version}` };
}

/**
 * The shell script the Update tab runs: download that release's source, run its install.sh, wait for enter.
 * The tag is checked first, so nothing but digits and dots reaches the command.
 */
export function updateScript(tag) {
  const v = parseVersion(tag);
  if (!v) throw new Error(`not a release tag: ${tag}`);
  const version = v.join(".");
  return [
    "set -e",
    'T="$(mktemp -d)"',
    'cd "$T"',
    `echo "Downloading Herdr Ranch v${version}..."`,
    `curl -fsSL -o ranch.tar.gz "https://github.com/${REPO}/archive/refs/tags/v${version}.tar.gz"`,
    "tar -xzf ranch.tar.gz",
    `cd "herdr-ranch-${version}"`,
    "./install.sh",
    `echo; echo "Herdr Ranch is now v${version}. Press enter to close."; read _`,
  ].join("; ");
}
