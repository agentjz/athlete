import path from "node:path";

import { listRegisteredTools } from "../readme-capabilities/core.ts";

export async function loadRegisteredToolNames(rootDir: string): Promise<string[]> {
  return [...await listRegisteredTools(path.resolve(rootDir))].sort();
}
