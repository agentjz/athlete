export function satisfiesVersionConstraint(version: string, constraint: string): boolean {
  const normalizedVersion = parseSemver(version);
  if (!normalizedVersion) {
    return false;
  }
  const normalizedConstraint = constraint.trim();
  if (!normalizedConstraint) {
    return true;
  }

  if (normalizedConstraint.startsWith(">=")) {
    const minimum = parseSemver(normalizedConstraint.slice(2));
    return Boolean(minimum && compareSemver(normalizedVersion, minimum) >= 0);
  }
  if (normalizedConstraint.startsWith("^")) {
    const base = parseSemver(normalizedConstraint.slice(1));
    return Boolean(base && normalizedVersion.major === base.major && compareSemver(normalizedVersion, base) >= 0);
  }
  if (normalizedConstraint.startsWith("~")) {
    const base = parseSemver(normalizedConstraint.slice(1));
    return Boolean(
      base
        && normalizedVersion.major === base.major
        && normalizedVersion.minor === base.minor
        && compareSemver(normalizedVersion, base) >= 0,
    );
  }
  if (/^\d+\.\d+\.\d+$/.test(normalizedConstraint)) {
    const exact = parseSemver(normalizedConstraint);
    return Boolean(exact && compareSemver(normalizedVersion, exact) === 0);
  }

  return version.trim() === normalizedConstraint;
}

function parseSemver(value: string): { major: number; minor: number; patch: number } | null {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(
  left: { major: number; minor: number; patch: number },
  right: { major: number; minor: number; patch: number },
): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}
