import fs from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

import { parseCapabilityPackageManifest } from "../../protocol/manifest.js";
import { createCapabilityPackageFromManifest } from "../../protocol/manifest.js";
import type { CapabilityPackage } from "../../protocol/package.js";

const MANIFEST_GLOB = "**/*.capability.json";

export async function discoverCapabilityPackages(rootDir: string): Promise<CapabilityPackage[]> {
  const packageRoot = path.join(rootDir, ".deadmouse", "capabilities");
  const files = await fg(MANIFEST_GLOB, {
    cwd: packageRoot,
    absolute: true,
    dot: true,
    onlyFiles: true,
    suppressErrors: true,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
  }).catch(() => []);

  const packages: CapabilityPackage[] = [];
  for (const file of files.sort((left, right) => left.localeCompare(right))) {
    packages.push(await readCapabilityPackageManifest(file));
  }
  return packages;
}

async function readCapabilityPackageManifest(filePath: string): Promise<CapabilityPackage> {
  const raw = await fs.readFile(filePath, "utf8");
  const manifest = parseCapabilityPackageManifest(JSON.parse(raw));
  return createCapabilityPackageFromManifest({
    ...manifest,
    source: {
      ...manifest.source,
      path: manifest.source.path ?? filePath,
      builtIn: manifest.source.builtIn ?? false,
    },
    governance: {
      ...manifest.governance,
      installed: manifest.governance?.installed ?? true,
      installRef: manifest.governance?.installRef ?? `file:${filePath}`,
    },
  });
}
