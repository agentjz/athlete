import { buildFieldBlock, formatLimitedList } from "../../prompt/structured.js";
import { isInternalMessage, readUserInput } from "../../session/turnFrame.js";
import type { StoredMessage } from "../../../types.js";
import type { SessionBriefSignals, SessionBriefTurn, SessionConversationBrief } from "./types.js";

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
    signals: inferSignals(includedTurns),
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
      value: "Answer direct questions about this same session's recent conversation and keep the user experience continuous; do not treat this as a plan, policy, or cross-session memory.",
    },
    {
      label: "Briefed turns",
      value: `${brief.userTurnCount} user turn(s) including the current input / ${brief.assistantTurnCount} assistant response(s)`,
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
      label: "Confirmed facts",
      value: formatSignals(brief.signals.confirmedFacts),
    },
    {
      label: "Decisions",
      value: formatSignals(brief.signals.decisions),
    },
    {
      label: "Open questions",
      value: formatSignals(brief.signals.openQuestions),
    },
    {
      label: "Next signals",
      value: formatSignals(brief.signals.nextSignals),
    },
    {
      label: "Tool activity",
      value: formatSignals(brief.signals.toolActivity),
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

function inferSignals(turns: SessionBriefTurn[]): SessionBriefSignals {
  return {
    confirmedFacts: collectSignals(turns, isConfirmedFact),
    decisions: collectSignals(turns, isDecision),
    openQuestions: collectSignals(turns, isOpenQuestion),
    nextSignals: collectSignals(turns, isNextSignal),
    toolActivity: collectSignals(turns, isToolActivity),
  };
}

function collectSignals(
  turns: SessionBriefTurn[],
  predicate: (turn: SessionBriefTurn) => boolean,
): string[] {
  const values = turns
    .filter(predicate)
    .map((turn) => truncate(turn.text, MAX_SIGNAL_CHARS));
  return takeLastUnique(values, MAX_SIGNALS_PER_KIND);
}

function isConfirmedFact(turn: SessionBriefTurn): boolean {
  return turn.role === "user" && /确认|确定|没问题|就这样|可以|OK|ok|yes|agree|confirmed|accepted/i.test(turn.text);
}

function isDecision(turn: SessionBriefTurn): boolean {
  return /决定|选择|方案|原则|边界|设计|改成|保留|删除|不需要|暂时不|decision|choose|keep|remove|delete|disable|enable/i.test(turn.text);
}

function isOpenQuestion(turn: SessionBriefTurn): boolean {
  return turn.role === "user" && /[?？]|请问|能不能|是不是|有没有|为什么|怎么|如何|是什么|上下文|what|why|how|whether/i.test(turn.text);
}

function isNextSignal(turn: SessionBriefTurn): boolean {
  return /下一步|继续|开始|去做|执行|修|改|提交|测试|验证|next|continue|start|run|fix|implement|verify/i.test(turn.text);
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
