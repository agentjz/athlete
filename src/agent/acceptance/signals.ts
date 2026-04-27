import type { StoredMessage } from "../../types.js";
import { getToolGovernanceForName, isBrowserGovernedTool, isDocumentReadGovernedTool } from "../../capabilities/tools/core/governance.js";

export type AcceptanceSignal =
  | {
      kind: "http_endpoint_verified";
      sourceToolName: string;
      url: string;
      status?: number;
      body?: string;
    }
  | {
      kind: "web_page_verified";
      sourceToolName: string;
      url: string;
      pageText?: string;
    }
  | {
      kind: "document_read_completed";
      sourceToolName: string;
      documentKind?: string;
      path?: string;
      provider?: string;
    }
  | {
      kind: "structured_artifact_valid";
      sourceToolName: string;
      path: string;
      format?: string;
    };

export function collectAcceptanceSignals(
  messages: StoredMessage[],
): AcceptanceSignal[] {
  const collected: AcceptanceSignal[] = [];

  for (const message of messages) {
    if (message.role !== "tool" || typeof message.name !== "string") {
      continue;
    }

    const parsed = tryParseRecord(message.content);
    const explicitSignals = readExplicitSignals(message.name, parsed);
    if (explicitSignals.length > 0) {
      collected.push(...explicitSignals);
      continue;
    }

    const governance = getToolGovernanceForName(message.name);
    if (message.name === "http_probe" && parsed && parsed.ok === true) {
      const url = readString(parsed.url);
      if (url) {
        collected.push({
          kind: "http_endpoint_verified",
          sourceToolName: message.name,
          url,
          status: readNumber(parsed.status),
          body: readString(parsed.body),
        });
      }
      continue;
    }

    if (governance && isBrowserGovernedTool(governance)) {
      const url = readBrowserUrl(message.content, parsed);
      if (url) {
        collected.push({
          kind: "web_page_verified",
          sourceToolName: message.name,
          url,
          pageText: typeof message.content === "string" ? message.content : undefined,
        });
      }
      continue;
    }

    if (
      governance &&
      isDocumentReadGovernedTool(governance) &&
      parsed &&
      (parsed.ok === true || parsed.readable === true)
    ) {
      collected.push({
        kind: "document_read_completed",
        sourceToolName: message.name,
        documentKind: governance.documentKind,
        path: readString(parsed.path) ?? readString(parsed.requestedPath),
        provider: readString(parsed.provider),
      });
    }
  }

  return dedupeSignals(collected);
}

function readExplicitSignals(
  sourceToolName: string,
  payload: Record<string, unknown> | null,
): AcceptanceSignal[] {
  if (!payload || !Array.isArray(payload.signals)) {
    return [];
  }

  const signals: AcceptanceSignal[] = [];

  for (const entry of payload.signals) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const kind = readString(record.kind);
    switch (kind) {
      case "http_endpoint_verified": {
        const url = readString(record.url);
        if (!url) {
          continue;
        }
        signals.push({
          kind,
          sourceToolName,
          url,
          status: readNumber(record.status),
          body: readString(record.body),
        });
        break;
      }
      case "web_page_verified": {
        const url = readString(record.url);
        if (!url) {
          continue;
        }
        signals.push({
          kind,
          sourceToolName,
          url,
          pageText: readString(record.pageText) ?? readString(record.page_text),
        });
        break;
      }
      case "document_read_completed":
        signals.push({
          kind,
          sourceToolName,
          documentKind: readString(record.documentKind) ?? readString(record.document_kind),
          path: readString(record.path),
          provider: readString(record.provider),
        });
        break;
      case "structured_artifact_valid": {
        const path = readString(record.path);
        if (!path) {
          continue;
        }
        signals.push({
          kind,
          sourceToolName,
          path,
          format: readString(record.format),
        });
        break;
      }
      default:
        break;
    }
  }

  return signals;
}

function readBrowserUrl(
  content: string | null,
  payload: Record<string, unknown> | null,
): string | undefined {
  const payloadUrl = readString(payload?.url);
  if (payloadUrl) {
    return payloadUrl;
  }

  const match = String(content ?? "").match(/Page URL:\s*(.+)$/im);
  return match?.[1]?.trim() || undefined;
}

function tryParseRecord(content: string | null): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content ?? "") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function dedupeSignals(signals: AcceptanceSignal[]): AcceptanceSignal[] {
  const seen = new Set<string>();
  const result: AcceptanceSignal[] = [];

  for (const signal of signals) {
    const key = JSON.stringify(signal);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(signal);
  }

  return result;
}
