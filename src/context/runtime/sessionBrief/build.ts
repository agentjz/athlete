import { buildFieldBlock, formatLimitedList } from "../../../agent/prompt/structured.js";
import { isInternalMessage, readUserInput } from "../../../session/turnFrame.js";
import type { StoredMessage } from "../../../types.js";
import type { SessionBriefTurn, SessionConversationBrief } from "./types.js";

const MAX_RECENT_TURNS = 8;
const MAX_TURN_CHARS = 180;
const MAX_THREAD_CHARS = 320;
const MAX_AUTO_INCLUDED_SOURCE_CHARS = 900;
const MAX_SIGNAL_CHARS = 160;
const MAX_SIGNALS_PER_KIND = 4;

export interface BuildSessionConversationBriefInput {
  messages: StoredMessage[];
  timestamp?: string;
}

export function buildSessionConversationBrief(
  input: BuildSessionConversationBriefInput,
): SessionConversationBrief | undefined {
  const visibleTurns = input.messages.map(toVisibleTurn);
  const includedTurns = visibleTurns.filter((turn): turn is SessionBriefTurn => isSessionBriefTurn(turn));
  const omittedTurns = visibleTurns.filter((turn): turn is OmittedVisibleTurn => isOmittedVisibleTurn(turn));

  if (includedTurns.length === 0) {
    return undefined;
  }

  const recentTurns = includedTurns.slice(-MAX_RECENT_TURNS);
  const userTurnCount = includedTurns.filter((turn) => turn.role === "user").length;
  const assistantTurnCount = includedTurns.filter((turn) => turn.role === "assistant").length;

  return {
    version: 1,
    userTurnCount,
    assistantTurnCount,
    omittedLongTurnCount: omittedTurns.length,
    recentTurns,
    toolActivity: collectToolActivity(includedTurns),
    currentThread: inferCurrentThread(recentTurns),
    updatedAt: input.timestamp ?? new Date().toISOString(),
  };
}

export function buildSessionConversationBriefBlock(
  brief: SessionConversationBrief | undefined,
): string | undefined {
  if (!brief || brief.recentTurns.length <= 1) {
    return undefined;
  }

  return buildFieldBlock("Current session conversation brief", [
    {
      label: "Purpose",
      value: "Show recent same-session conversation text so the model can read continuity itself; treat this as local conversation evidence only.",
    },
    {
      label: "Briefed turns",
      value: `${brief.userTurnCount} user turn(s) with current input / ${brief.assistantTurnCount} assistant response(s)`,
    },
    brief.omittedLongTurnCount > 0
      ? {
          label: "Omitted long turns",
          value: `${brief.omittedLongTurnCount} earlier visible turn(s) were too large for automatic injection; query history only if their exact content matters.`,
        }
      : { label: "Omitted long turns", value: undefined },
    {
      label: "Recent thread",
      value: brief.currentThread,
    },
    {
      label: "Tool activity",
      value: formatSignals(brief.toolActivity),
    },
    {
      label: "Recent turns",
      value: formatLimitedList(brief.recentTurns.map(formatTurn), MAX_RECENT_TURNS),
    },
  ]);
}

interface OmittedVisibleTurn {
  role: SessionBriefTurn["role"];
  kind: "omit-long-turn";
}

type VisibleTurnCandidate = SessionBriefTurn | OmittedVisibleTurn | undefined;

function toVisibleTurn(message: StoredMessage): VisibleTurnCandidate {
  if (message.role === "user") {
    const text = readUserInput(message.content);
    return visibleTextCandidate(text, "user");
  }

  if (message.role !== "assistant") {
    return undefined;
  }

  if (message.tool_calls?.length) {
    const toolNames = message.tool_calls.map((toolCall) => toolCall.function.name).join(", ");
    return {
      role: "assistant",
      text: truncate(`called tools: ${toolNames}`, MAX_TURN_CHARS),
    };
  }

  const content = normalizeOneLine(message.content ?? "");
  if (!content || isInternalMessage(content)) {
    return undefined;
  }

  return visibleTextCandidate(content, "assistant");
}

function inferCurrentThread(turns: SessionBriefTurn[]): string | undefined {
  const userTurns = turns.filter((turn) => turn.role === "user").map((turn) => turn.text);
  if (userTurns.length === 0) {
    return undefined;
  }

  return truncate(userTurns.slice(-3).join(" -> "), MAX_THREAD_CHARS);
}

function collectToolActivity(turns: SessionBriefTurn[]): string[] {
  const values = turns
    .filter(isToolActivity)
    .map((turn) => truncate(turn.text, MAX_SIGNAL_CHARS));
  return takeLastUnique(values, MAX_SIGNALS_PER_KIND);
}

function isToolActivity(turn: SessionBriefTurn): boolean {
  return turn.role === "assistant" && turn.text.startsWith("called tools:");
}

function formatTurn(turn: SessionBriefTurn): string {
  return `${turn.role}: ${turn.text}`;
}

function formatSignals(values: string[]): string | undefined {
  return values.length > 0 ? formatLimitedList(values, MAX_SIGNALS_PER_KIND) : undefined;
}

function normalizeOneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function visibleTextCandidate(
  value: string | undefined,
  role: SessionBriefTurn["role"],
): VisibleTurnCandidate {
  if (!value) {
    return undefined;
  }
  return value.length <= MAX_AUTO_INCLUDED_SOURCE_CHARS
    ? { role, text: truncate(value, MAX_TURN_CHARS) }
    : { role, kind: "omit-long-turn" };
}

function isSessionBriefTurn(value: VisibleTurnCandidate): value is SessionBriefTurn {
  return typeof value === "object" && value !== null && "text" in value;
}

function isOmittedVisibleTurn(value: VisibleTurnCandidate): value is OmittedVisibleTurn {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "omit-long-turn";
}

function takeLastUnique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of [...values].reverse()) {
    const normalized = normalizeOneLine(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.unshift(normalized);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function truncate(value: string, maxChars: number): string {
  const normalized = normalizeOneLine(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}
