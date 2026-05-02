import type { AcceptanceContract } from "../../types.js";
import type { AcceptanceFileCheckResult } from "./fileChecks.js";

export function determineAcceptancePhase(input: {
  contract: AcceptanceContract;
  hasSuccessfulDocumentRead: boolean;
  fileChecks: AcceptanceFileCheckResult;
  pendingChecks: string[];
}): string {
  if (input.pendingChecks.length === 0) {
    return "complete";
  }

  if (input.contract.kind === "document") {
    if (input.fileChecks.missingSourceFiles.length > 0) {
      return "acquire_document";
    }
    if (!input.hasSuccessfulDocumentRead) {
      return "read_document";
    }
    if (input.fileChecks.missingDeliverables.length > 0) {
      return "assemble_outputs";
    }
    return "bind_evidence";
  }

  if (input.contract.kind === "research") {
    if (input.pendingChecks.some((check) => check.includes("json_fields"))) {
      return "bind_evidence";
    }
    if (input.fileChecks.missingDeliverables.length > 0) {
      return "assemble_outputs";
    }
    return "verify_outputs";
  }

  if (input.contract.kind === "product") {
    if (input.fileChecks.missingDeliverables.length > 0) {
      return "build_product";
    }
    return "verify_outputs";
  }

  return input.fileChecks.missingDeliverables.length > 0 ? "assemble_outputs" : "verify_outputs";
}
