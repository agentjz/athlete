import { scanCapabilityManifestFixtures } from "./manifestContracts.ts";
import { scanPackageScripts } from "./packageScriptContracts.ts";
import { scanCapabilityEcosystemResidue, scanLegacyPackageResidue } from "./residueContracts.ts";
import { scanRuntimeUiStringResidue } from "./runtimeUiContracts.ts";
import { scanGeneratedArtifacts } from "./generatedContracts.ts";
import { scanScriptLanguageResidue } from "./scriptLanguageContracts.ts";
import { scanDisguisedStringAssembly } from "./stringAssemblyContracts.ts";
import type { RepoContract } from "./types.ts";

export const REPO_CONTRACTS: RepoContract[] = [
  {
    id: "capability-manifest-port-required",
    description: "capability manifests must dock through a complete port",
    scan: scanCapabilityManifestFixtures,
  },
  {
    id: "runtime-ui-rendering-centralized",
    description: "terminal tags must stay owned by runtime-ui instead of scattered string literals",
    scan: scanRuntimeUiStringResidue,
  },
  {
    id: "capability-ecosystems-under-root",
    description: "concrete ecosystems must live under src/capabilities",
    scan: scanCapabilityEcosystemResidue,
  },
  {
    id: "no-legacy-package-shims",
    description: "old package compatibility naming must not survive in formal source",
    scan: scanLegacyPackageResidue,
  },
  {
    id: "standard-verify-entry",
    description: "package scripts must expose one standard repository verification entry",
    scan: scanPackageScripts,
  },
  {
    id: "generated-artifacts-current",
    description: "generated repository artifacts must stay synced with source facts",
    scan: scanGeneratedArtifacts,
  },
  {
    id: "node-scripts-are-typescript",
    description: "repository Node scripts must stay in TypeScript; owner .cmd shortcuts are separate",
    scan: scanScriptLanguageResidue,
  },
  {
    id: "no-disguised-string-assembly",
    description: "source and tests must not hide obsolete literals through split-and-join string assembly",
    scan: scanDisguisedStringAssembly,
  },
];
