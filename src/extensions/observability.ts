import { resolveProjectRoots } from "../context/repoRoots.js";
import { recordObservabilityEvent } from "../observability/writer.js";
import type { ExtensionHookName } from "./protocol/index.js";

export async function recordExtensionEvent(
  cwd: string,
  input: {
    status: "completed" | "failed";
    extensionId: string;
    hook?: ExtensionHookName;
    workspaceRoot?: string;
    error?: unknown;
  },
): Promise<void> {
  const roots = await resolveProjectRoots(cwd);
  await recordObservabilityEvent(roots.stateRootDir, {
    event: "extension",
    status: input.status,
    error: input.error,
    details: {
      extensionId: input.extensionId,
      hook: input.hook,
      workspaceRoot: input.workspaceRoot,
    },
  });
}
