// Run with: node --test tests/ranch-cli.test.js
// The `ranch` command opens VS Code in the terminal through terminal-code (`tode`). A stand-in tode records what it got.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const RANCH = resolve("bin/ranch");
const stub = mkdtempSync(join(tmpdir(), "ranch-stub-"));
writeFileSync(join(stub, "tode"), '#!/bin/sh\necho "tode:$*"\nexit "${STUB_EXIT:-0}"\n');
chmodSync(join(stub, "tode"), 0o755);

const run = (args, { withTode = true, env = {} } = {}) =>
  spawnSync("bash", [RANCH, ...args], {
    encoding: "utf8",
    env: { PATH: `${withTode ? stub + ":" : ""}/usr/bin:/bin`, HOME: stub, ...env },
  });

test("ranch alone opens the current folder: tode with no arguments", () => {
  const r = run([]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "tode:");
});

test("a path and tode's own options pass straight through", () => {
  assert.equal(run(["./src"]).stdout.trim(), "tode:./src");
  assert.equal(run(["-g", "a.js:3:1"]).stdout.trim(), "tode:-g a.js:3:1");
  assert.equal(run(["--split", "right", "app"]).stdout.trim(), "tode:--split right app");
});

test("ranch review opens the source control view, for the folder if one is given", () => {
  assert.equal(run(["review"]).stdout.trim(), "tode:--review");
  assert.equal(run(["review", "./app"]).stdout.trim(), "tode:./app --review");
});

test("ranch diff compares two files", () => {
  assert.equal(run(["diff", "a.txt", "b.txt"]).stdout.trim(), "tode:--diff a.txt b.txt");
});

test("tode's exit code is ranch's exit code", () => {
  assert.equal(run(["x"], { env: { STUB_EXIT: "3" } }).status, 3);
});

test("without tode it says how to install it, exits 127 and installs nothing", () => {
  const r = run(["src"], { withTode: false });
  assert.equal(r.status, 127);
  assert.match(r.stderr, /terminal-code/);
  assert.match(r.stderr, /curl -fsSL https:\/\/tode\.sh\/install \| bash/);
  assert.equal(r.stdout, "");
});

test("--help lists what ranch does, and works without tode", () => {
  const r = run(["--help"], { withTode: false });
  assert.equal(r.status, 0);
  for (const word of ["ranch review", "ranch diff", "VS Code"]) assert.match(r.stdout, new RegExp(word));
});

import { mkdirSync, readFileSync, existsSync, statSync } from "node:fs";

const install = (args, dir, env = {}) =>
  spawnSync("bash", [resolve("install.sh"), ...args], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", HOME: stub, RANCH_BIN_DIR: dir, ...env } });

test("install.sh --cli-only puts an executable ranch in the chosen folder, and can run again", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "ranch-bin-")), "bin");
  const first = install(["--cli-only"], dir);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(statSync(join(dir, "ranch")).mode & 0o111);
  assert.equal(readFileSync(join(dir, "ranch"), "utf8"), readFileSync("bin/ranch", "utf8"));
  assert.equal(install(["--cli-only"], dir).status, 0);
  assert.match(first.stdout, /Installed the ranch command/);
});

test("install.sh never replaces a different command called ranch", () => {
  const dir = mkdtempSync(join(tmpdir(), "ranch-bin-"));
  writeFileSync(join(dir, "ranch"), "#!/bin/sh\necho somebody else's\n");
  const r = install(["--cli-only"], dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not replacing it/);
  assert.match(readFileSync(join(dir, "ranch"), "utf8"), /somebody else's/);
});

test("install.sh rejects an unknown option and --help lists the options", () => {
  assert.notEqual(install(["--nope"], stub).status, 0);
  const h = install(["--help"], stub);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /--cli-only/);
});

// A stand-in `curl` that prints a tiny installer, which puts a stand-in tode in $HOME/.local/bin.
const fakeInternet = () => {
  const bin = mkdtempSync(join(tmpdir(), "ranch-net-"));
  const home = mkdtempSync(join(tmpdir(), "ranch-home-"));
  writeFileSync(join(bin, "curl"), `#!/bin/sh
echo 'mkdir -p "$HOME/.local/bin"; printf "#!/bin/sh\\necho tode-ran:\\$*\\n" > "$HOME/.local/bin/tode"; chmod +x "$HOME/.local/bin/tode"; echo installer-ran'
`);
  chmodSync(join(bin, "curl"), 0o755);
  return { bin, home };
};
const runNet = (args, { net, env = {} }) =>
  spawnSync("bash", [RANCH, ...args], { encoding: "utf8", env: { PATH: `${net.bin}:/usr/bin:/bin`, HOME: net.home, ...env } });

test("ranch install runs terminal-code's installer and says so first", () => {
  const net = fakeInternet();
  const r = runNet(["install"], { net });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout + r.stderr, /curl -fsSL https:\/\/tode\.sh\/install \| bash/);
  assert.match(r.stdout, /installer-ran/);
  assert.ok(existsSync(join(net.home, ".local", "bin", "tode")));
});

test("ranch install does nothing when tode is already there", () => {
  const net = fakeInternet();
  const r = spawnSync("bash", [RANCH, "install"], { encoding: "utf8", env: { PATH: `${stub}:${net.bin}:/usr/bin:/bin`, HOME: net.home } });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /already installed/);
  assert.doesNotMatch(r.stdout, /installer-ran/);
});

test("with RANCH_INSTALL_TODE=yes, a missing tode is installed and then the command goes ahead", () => {
  const net = fakeInternet();
  const r = runNet(["src"], { net, env: { RANCH_INSTALL_TODE: "yes" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /installer-ran/);
  assert.match(r.stdout, /tode-ran:src/);
});

test("without a terminal to ask on, and no yes, it only prints the install line", () => {
  const net = fakeInternet();
  const r = runNet(["src"], { net });
  assert.equal(r.status, 127);
  assert.doesNotMatch(r.stdout, /installer-ran/);
  assert.equal(existsSync(join(net.home, ".local", "bin", "tode")), false);
  const no = runNet(["src"], { net, env: { RANCH_INSTALL_TODE: "no" } });
  assert.equal(no.status, 127);
});

test("--help mentions ranch install", () => {
  assert.match(run(["--help"]).stdout, /ranch install/);
});
