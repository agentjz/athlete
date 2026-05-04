import { syncReadmeCapabilities } from "../readme-capabilities/core.ts";
import type { RepoContractFinding, RepoContractScanInput } from "./types.ts";

export async function scanGeneratedArtifacts({ root }: RepoContractScanInput): Promise<RepoContractFinding[]> {
  const findings: RepoContractFinding[] = [];
  const result = await syncReadmeCapabilities(root, { check: true });
  if (result.staleFiles.length > 0) {
    findings.push({
      file: "spec/capability-ecology.json",
      message: `generated README capability ecology is stale: ${result.staleFiles.join(", ")}`,
    });
    for (const file of result.staleFiles) {
      findings.push({
        file,
        message: "generated README capability ecology is stale; run npm.cmd run sync:readme-capabilities.",
      });
    }
  }
  return findings;
}
