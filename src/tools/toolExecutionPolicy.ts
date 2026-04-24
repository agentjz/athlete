import type { ToolRegistryEntry } from "./types.js";
import type { ToolExecutionProtocolPolicy } from "../types.js";

export function resolveToolExecutionPolicy(
  entry: Pick<ToolRegistryEntry, "governance"> | null | undefined,
): ToolExecutionProtocolPolicy {
  if (!entry) {
    return "sequential";
  }

  return entry.governance.mutation === "read" && entry.governance.concurrencySafe
    ? "parallel"
    : "sequential";
}
