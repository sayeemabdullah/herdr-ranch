// Parsers for the machine meters in the status bar. Each takes a command's output and returns null
// when it cannot read it, so one broken command never takes the others down.

const num = (s) => Number(s);

// `ps -A -o %cpu`: every process's share of one core, summed and spread over all cores.
export function parseCpu(psOutput, cores) {
  if (!Number.isFinite(cores) || cores <= 0) return null;
  const values = String(psOutput).split("\n").map((l) => l.trim()).filter((l) => /^\d+(\.\d+)?$/.test(l)).map(num);
  if (!values.length) return null;
  const total = values.reduce((a, b) => a + b, 0) / cores;
  return Math.max(0, Math.min(100, Math.round(total)));
}

// `vm_stat`: memory in use is active + wired + compressed pages, times the page size.
export function parseMemMac(vmStatOutput, totalBytes) {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
  const text = String(vmStatOutput);
  const size = Number(/page size of (\d+) bytes/.exec(text)?.[1]);
  const pages = (label) => Number(new RegExp(`${label}:\\s+(\\d+)`).exec(text)?.[1]);
  const parts = [pages("Pages active"), pages("Pages wired down"), pages("Pages occupied by compressor")];
  if (!Number.isFinite(size) || parts.some((p) => !Number.isFinite(p))) return null;
  return { used: parts.reduce((a, b) => a + b, 0) * size, total: totalBytes };
}

// `/proc/meminfo`: total minus what is available.
export function parseMemLinux(meminfo) {
  const text = String(meminfo);
  const kb = (label) => Number(new RegExp(`${label}:\\s+(\\d+)\\s*kB`).exec(text)?.[1]);
  const total = kb("MemTotal");
  const available = kb("MemAvailable");
  if (!Number.isFinite(total) || !Number.isFinite(available)) return null;
  return { used: (total - available) * 1024, total: total * 1024 };
}

// `df -k /`: the first percentage on the volume's line is its capacity on macOS and Linux alike.
export function parseDisk(dfOutput) {
  const line = String(dfOutput).split("\n")[1] ?? "";
  const match = /(?:^|\s)(\d{1,3})%/.exec(line);
  return match ? Number(match[1]) : null;
}

export function formatGB(bytes) {
  const gb = bytes / 2 ** 30;
  return gb >= 10 ? String(Math.round(gb)) : String(Math.round(gb * 10) / 10);
}
