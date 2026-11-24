// Run with: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCpu, parseMemMac, parseMemLinux, parseDisk, formatGB } from "../mods/flock-status/vitals.js";

const PS = " %CPU\n  4.7\n  0.2\n  0.0\n  0.9\n 24.0\n";
const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                    10169.
Pages active:                                 294446.
Pages inactive:                               289893.
Pages speculative:                              3776.
Pages wired down:                             165281.
Pages occupied by compressor:                 375370.
`;
const MEMINFO = "MemTotal:       16384000 kB\nMemFree:         1000000 kB\nMemAvailable:    4096000 kB\n";
const DF_MAC = `Filesystem     1024-blocks      Used Available Capacity iused     ifree %iused  Mounted on
/dev/disk3s1s1   482797652  16229808  41721836    29%  458732 417218360    0%   /
`;
const DF_LINUX = "Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/sda1      102400000  61440000  40960000  61% /\n";

test("cpu is the summed process load divided by the core count, 0 to 100", () => {
  assert.equal(parseCpu(PS, 11), 3);
  assert.equal(parseCpu(" %CPU\n 900.0\n 900.0\n", 4), 100);
  assert.equal(parseCpu(" %CPU\n  0.0\n", 8), 0);
});

test("cpu is null for empty, header-only, garbage or a bad core count", () => {
  assert.equal(parseCpu("", 8), null);
  assert.equal(parseCpu(" %CPU\n", 8), null);
  assert.equal(parseCpu("command not found", 8), null);
  assert.equal(parseCpu(PS, 0), null);
});

test("mac memory counts active, wired and compressed pages", () => {
  const total = 19327352832;
  const mem = parseMemMac(VM_STAT, total);
  assert.equal(mem.total, total);
  assert.equal(mem.used, (294446 + 165281 + 375370) * 16384);
});

test("mac memory is null without the figures or a total", () => {
  assert.equal(parseMemMac("", 1e10), null);
  assert.equal(parseMemMac("garbage", 1e10), null);
  assert.equal(parseMemMac(VM_STAT, 0), null);
  assert.equal(parseMemMac(VM_STAT, NaN), null);
});

test("linux memory is total minus available", () => {
  assert.deepEqual(parseMemLinux(MEMINFO), { used: (16384000 - 4096000) * 1024, total: 16384000 * 1024 });
  assert.equal(parseMemLinux(""), null);
  assert.equal(parseMemLinux("MemTotal: 100 kB\n"), null);
});

test("disk is the capacity percent of the root volume", () => {
  assert.equal(parseDisk(DF_MAC), 29);
  assert.equal(parseDisk(DF_LINUX), 61);
  assert.equal(parseDisk(""), null);
  assert.equal(parseDisk("Filesystem only\n"), null);
});

test("gigabytes are whole above 10 and one decimal below", () => {
  assert.equal(formatGB(16 * 2 ** 30), "16");
  assert.equal(formatGB(12.4 * 2 ** 30), "12");
  assert.equal(formatGB(1.5 * 2 ** 30), "1.5");
});
