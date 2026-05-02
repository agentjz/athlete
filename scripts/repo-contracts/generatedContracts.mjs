import { syncReadmeCapabilities } from "../readme-capabilities/core.mjs";

export async function scanGeneratedArtifacts({ root }) {
  const findings = [];
  let result;
  try {
    result = await syncReadmeCapabilities(root, { check: true });
  } catch (error) {
    findings.push({
      file: "spec/用户审阅/capability-ecology.json",
      message: error instanceof Error ? error.message : String(error),
    });
    return findings;
  }

  for (const file of result.staleFiles) {
    findings.push({
      file,
      message: "generated README capability ecology is stale; run npm.cmd run sync:readme-capabilities.",
    });
  }
  return findings;
}
