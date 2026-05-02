import type { AcceptanceContract } from "../../types.js";
import type { collectAcceptanceSignals } from "./signals.js";

export function evaluateHttpChecks(
  contract: AcceptanceContract,
  signals: ReturnType<typeof collectAcceptanceSignals>,
): {
  completedChecks: string[];
  pendingChecks: string[];
} {
  const completedChecks: string[] = [];
  const pendingChecks: string[] = [];

  for (const check of contract.httpChecks) {
    if (hasVerifiedEndpoint(signals, check.url, check.status, check.bodyContains ?? [])) {
      completedChecks.push(`http:${check.id}`);
    } else {
      pendingChecks.push(`http:${check.id}`);
    }
  }

  return {
    completedChecks,
    pendingChecks,
  };
}

function hasVerifiedEndpoint(
  signals: ReturnType<typeof collectAcceptanceSignals>,
  url: string,
  status: number | undefined,
  bodyContains: string[],
): boolean {
  return signals.some((signal) => {
    if (signal.kind === "http_endpoint_verified") {
      if (signal.url !== url) {
        return false;
      }
      if (typeof status === "number" && signal.status !== status) {
        return false;
      }

      return bodyContains.every((needle) => String(signal.body ?? "").includes(needle));
    }

    if (signal.kind === "web_page_verified") {
      if (signal.url !== url) {
        return false;
      }

      return bodyContains.every((needle) => String(signal.pageText ?? "").includes(needle));
    }

    return false;
  });
}
