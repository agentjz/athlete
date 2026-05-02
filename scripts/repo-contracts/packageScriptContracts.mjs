import fs from "node:fs/promises";
import path from "node:path";

export async function scanPackageScripts({ root }) {
  const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const scripts = packageJson.scripts ?? {};
  const findings = [];
  if (scripts.verify !== "npm run verify:repo-contracts && npm test") {
    findings.push({
      file: "package.json",
      message: "scripts.verify must be the standard repository verification entry: npm run verify:repo-contracts && npm test",
    });
  }
  if (scripts["verify:repo-contracts"] !== "node scripts/verify-repo-contracts.mjs") {
    findings.push({
      file: "package.json",
      message: "scripts.verify:repo-contracts must run scripts/verify-repo-contracts.mjs.",
    });
  }
  if (scripts.sync !== "node scripts/sync-generated.mjs") {
    findings.push({
      file: "package.json",
      message: "scripts.sync must run the standard generated artifact sync entry.",
    });
  }
  if (scripts["verify:generated"] !== "node scripts/verify-generated.mjs") {
    findings.push({
      file: "package.json",
      message: "scripts.verify:generated must run the standard generated artifact check entry.",
    });
  }
  return findings;
}
