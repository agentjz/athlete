import { scanCapabilityManifestFixtures } from "./manifestContracts.mjs";
import { scanPackageScripts } from "./packageScriptContracts.mjs";
import { scanCapabilityEcosystemResidue, scanLegacyPackageResidue } from "./residueContracts.mjs";
import { scanRuntimeUiStringResidue } from "./runtimeUiContracts.mjs";
import { scanKittyNamingResidue } from "./kittyNamingContracts.mjs";

export const REPO_CONTRACTS = [
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
    id: "kitty-naming-only",
    description: "old project naming must not survive after kitty migration",
    scan: scanKittyNamingResidue,
  },
];
