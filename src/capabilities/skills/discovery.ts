import fs from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

import type { LoadedSkill, ProjectIgnoreRule } from "../../types.js";
import { isPathIgnored } from "../../utils/ignore.js";
import { parseSkillSource } from "./schema.js";

export async function discoverSkills(
  rootDir: string,
  cwd: string,
  ignoreRules: ProjectIgnoreRule[],
): Promise<LoadedSkill[]> {
  const candidateRoots = uniquePaths([
    path.join(rootDir, "src", "capabilities", "skills", "packages"),
    path.join(rootDir, ".skills"),
    path.join(rootDir, "skills"),
    path.join(cwd, ".skills"),
    path.join(cwd, "skills"),
  ]);
  const standaloneSkillFiles = uniquePaths([
    path.join(rootDir, "SKILL.md"),
    path.join(cwd, "SKILL.md"),
  ]);
  const discovered: LoadedSkill[] = [];
  const seenPaths = new Set<string>();
  const seenNames = new Map<string, string>();

  for (const skillFile of standaloneSkillFiles) {
    await collectSkill(skillFile, rootDir, ignoreRules, seenPaths, seenNames, discovered);
  }

  for (const skillRoot of candidateRoots) {
    if (!(await isDirectory(skillRoot))) {
      continue;
    }

    const skillFiles = await fg("**/SKILL.md", {
      cwd: skillRoot,
      absolute: true,
      dot: true,
      onlyFiles: true,
      suppressErrors: true,
      ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
    });

    for (const skillFile of skillFiles.sort((left, right) => left.localeCompare(right))) {
      await collectSkill(skillFile, rootDir, ignoreRules, seenPaths, seenNames, discovered);
    }
  }

  return discovered.sort((left, right) => left.name.localeCompare(right.name));
}

export async function loadSkillBody(skill: LoadedSkill): Promise<string> {
  return skill.body;
}

async function collectSkill(
  skillFile: string,
  rootDir: string,
  ignoreRules: ProjectIgnoreRule[],
  seenPaths: Set<string>,
  seenNames: Map<string, string>,
  discovered: LoadedSkill[],
): Promise<void> {
  const normalizedPath = path.normalize(skillFile);
  if (seenPaths.has(normalizedPath)) {
    return;
  }

  seenPaths.add(normalizedPath);
  if (!(await isRegularFile(skillFile)) || isPathIgnored(skillFile, ignoreRules)) {
    return;
  }

  const parsed = parseSkillSource(await fs.readFile(skillFile, "utf8"), {
    absolutePath: skillFile,
    rootDir,
  });
  const existingPath = seenNames.get(parsed.name);
  if (existingPath && existingPath !== parsed.absolutePath) {
    throw new Error(
      `Duplicate skill name "${parsed.name}" found in ${existingPath} and ${parsed.absolutePath}.`,
    );
  }

  seenNames.set(parsed.name, parsed.absolutePath);
  discovered.push(parsed);
}

async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((item) => path.normalize(item)))];
}
