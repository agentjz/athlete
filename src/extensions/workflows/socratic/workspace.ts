import fs from "node:fs/promises";
import path from "node:path";

import { resolveExtensionSessionWorkspace, type ExtensionManifest } from "../../protocol/index.js";

export interface SocraticWorkspace {
  root: string;
  manifest: string;
  material: string;
  goals: string;
  questions: string;
  frictions: string;
  preferences: string;
  notes: string;
  index: string;
  sessions: string;
}

export function resolveSocraticWorkspace(
  cwd: string,
  manifest: ExtensionManifest,
  sessionId: string,
): SocraticWorkspace {
  const root = resolveExtensionSessionWorkspace(cwd, manifest, sessionId).root;
  return {
    root,
    manifest: path.join(root, "manifest.md"),
    material: path.join(root, "material"),
    goals: path.join(root, "goals"),
    questions: path.join(root, "questions"),
    frictions: path.join(root, "frictions"),
    preferences: path.join(root, "preferences"),
    notes: path.join(root, "notes"),
    index: path.join(root, "index"),
    sessions: path.join(root, "sessions"),
  };
}

export async function ensureSocraticWorkspace(
  cwd: string,
  manifest: ExtensionManifest,
  sessionId: string,
): Promise<SocraticWorkspace> {
  const workspace = resolveSocraticWorkspace(cwd, manifest, sessionId);
  await fs.mkdir(workspace.root, { recursive: true });
  await Promise.all([
    fs.mkdir(workspace.material, { recursive: true }),
    fs.mkdir(workspace.goals, { recursive: true }),
    fs.mkdir(workspace.questions, { recursive: true }),
    fs.mkdir(workspace.frictions, { recursive: true }),
    fs.mkdir(workspace.preferences, { recursive: true }),
    fs.mkdir(workspace.notes, { recursive: true }),
    fs.mkdir(workspace.index, { recursive: true }),
    fs.mkdir(workspace.sessions, { recursive: true }),
  ]);
  await writeManifestIfMissing(workspace);
  return workspace;
}

async function writeManifestIfMissing(workspace: SocraticWorkspace): Promise<void> {
  try {
    await fs.access(workspace.manifest);
    return;
  } catch {
    await fs.writeFile(
      workspace.manifest,
      [
        "# Socratic",
        "",
        "Socratic 是 Kitty super 模式下的学习 workflow 扩展空间。",
        "",
        "- `material/`：学习资料。",
        "- `goals/`：学习目标和 checklist 总纲。",
        "- `questions/`：问题、解释、理解和引用材料。",
        "- `frictions/`：卡点、难点和反复卡住类型。",
        "- `preferences/`：用户学习偏好。",
        "- `notes/`：正式学习笔记。",
        "- `index/`：材料索引和轻量目录。",
        "- `sessions/`：学习连续性摘要。",
        "",
      ].join("\n"),
      "utf8",
    );
  }
}
