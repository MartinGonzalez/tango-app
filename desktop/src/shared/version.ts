export type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  preRelease: { channel: string; num: number } | null;
};

const KNOWN_CHANNELS: Record<string, number> = { alpha: 1, beta: 2, rc: 3 };

export function parseVersion(v: string): ParsedVersion {
  const [core, pre] = v.split("-", 2);
  const parts = core.split(".").map(Number);

  let preRelease: ParsedVersion["preRelease"] = null;
  if (pre) {
    const m = pre.match(/^(alpha|beta|rc)(\d*)$/i);
    if (m) {
      preRelease = { channel: m[1].toLowerCase(), num: Number(m[2]) || 0 };
    } else {
      preRelease = { channel: pre.toLowerCase(), num: 0 };
    }
  }

  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
    preRelease,
  };
}

function preRank(preRelease: ParsedVersion["preRelease"]): { rank: number; num: number } {
  if (!preRelease) return { rank: 99, num: 0 }; // stable sorts highest
  const rank = KNOWN_CHANNELS[preRelease.channel] ?? 50;
  return { rank, num: preRelease.num };
}

export function compareSemver(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);

  const majorDiff = pa.major - pb.major;
  if (majorDiff !== 0) return majorDiff;
  const minorDiff = pa.minor - pb.minor;
  if (minorDiff !== 0) return minorDiff;
  const patchDiff = pa.patch - pb.patch;
  if (patchDiff !== 0) return patchDiff;

  const preA = preRank(pa.preRelease);
  const preB = preRank(pb.preRelease);
  if (preA.rank !== preB.rank) return preA.rank - preB.rank;
  return preA.num - preB.num;
}

export function isPreRelease(v: string): boolean {
  return parseVersion(v).preRelease !== null;
}
