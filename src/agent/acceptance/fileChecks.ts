import fs from "node:fs/promises";
import path from "node:path";

import { detectTextCorruption, normalizeTextForStorage } from "../../utils/text.js";
import type { AcceptanceContract, AcceptanceFileRequirement } from "../../types.js";
import { takeLastUnique } from "./utils.js";

export interface AcceptanceFileCheckResult {
  completedChecks: string[];
  pendingChecks: string[];
  missingSourceFiles: string[];
  missingDeliverables: string[];
}

export async function evaluateFileChecks(contract: AcceptanceContract, cwd: string): Promise<AcceptanceFileCheckResult> {
  const completedChecks: string[] = [];
  const pendingChecks: string[] = [];
  const missingSourceFiles: string[] = [];
  const missingDeliverables: string[] = [];

  for (const requirement of contract.requiredFiles) {
    const checkId = `file:${requirement.path}`;
    const resolvedPath = path.resolve(cwd, requirement.path);
    const stat = await fs.stat(resolvedPath).catch(() => null);
    if (!stat?.isFile()) {
      pendingChecks.push(checkId);
      if (requirement.role === "source") {
        missingSourceFiles.push(requirement.path);
      } else {
        missingDeliverables.push(requirement.path);
      }
      continue;
    }

    completedChecks.push(checkId);
    if (requirement.format !== "binary") {
      evaluateReadableFileRequirement(requirement, await fs.readFile(resolvedPath, "utf8"), completedChecks, pendingChecks);
    }
  }

  return {
    completedChecks: takeLastUnique(completedChecks, 96),
    pendingChecks: takeLastUnique(pendingChecks, 96),
    missingSourceFiles: takeLastUnique(missingSourceFiles, 24),
    missingDeliverables: takeLastUnique(missingDeliverables, 24),
  };
}

function evaluateReadableFileRequirement(
  requirement: AcceptanceFileRequirement,
  raw: string,
  completedChecks: string[],
  pendingChecks: string[],
): void {
  const normalized = normalizeTextForStorage(raw);
  if (detectTextCorruption(normalized)) {
    pendingChecks.push(`text_integrity:${requirement.path}`);
    return;
  }

  if (requirement.format === "json") {
    const jsonResult = evaluateJsonRequirement(requirement, normalized);
    completedChecks.push(...jsonResult.completedChecks.map((suffix) => `${suffix}:${requirement.path}`));
    pendingChecks.push(...jsonResult.pendingChecks.map((suffix) => `${suffix}:${requirement.path}`));
    return;
  }

  for (const needle of requirement.mustContain ?? []) {
    const normalizedNeedle = String(needle ?? "").trim();
    if (!normalizedNeedle) {
      continue;
    }
    if (normalized.includes(normalizedNeedle)) {
      completedChecks.push(`text_contains:${requirement.path}:${normalizedNeedle}`);
    } else {
      pendingChecks.push(`text_contains:${requirement.path}:${normalizedNeedle}`);
    }
  }
}

function evaluateJsonRequirement(requirement: AcceptanceFileRequirement, raw: string): {
  completedChecks: string[];
  pendingChecks: string[];
} {
  const completedChecks: string[] = ["json_parse"];
  const pendingChecks: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      completedChecks: [],
      pendingChecks: ["json_parse"],
    };
  }

  if (typeof requirement.minItems === "number") {
    const itemCount = Array.isArray(parsed) ? parsed.length : 0;
    if (itemCount >= requirement.minItems) {
      completedChecks.push("json_min_items");
    } else {
      pendingChecks.push("json_min_items");
    }
  }

  if ((requirement.requiredRecordFields?.length ?? 0) > 0) {
    if (!Array.isArray(parsed) || parsed.length === 0) {
      pendingChecks.push("json_fields");
    } else {
      const missingFields = collectMissingFields(parsed, requirement.requiredRecordFields ?? []);
      if (missingFields.length > 0) {
        pendingChecks.push(`json_fields(${missingFields.join(",")})`);
      } else {
        completedChecks.push("json_fields");
      }
    }
  }

  return {
    completedChecks,
    pendingChecks,
  };
}

function collectMissingFields(entries: unknown[], requiredFields: string[]): string[] {
  const missing = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      requiredFields.forEach((field) => missing.add(field));
      continue;
    }

    const record = entry as Record<string, unknown>;
    for (const field of requiredFields) {
      const value = record[field];
      if (typeof value === "string" ? value.trim().length === 0 : value === null || value === undefined) {
        missing.add(field);
      }
    }
  }

  return [...missing];
}
