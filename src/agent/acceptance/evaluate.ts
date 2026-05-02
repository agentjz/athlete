import { deriveAcceptanceState, normalizeAcceptanceState } from "./contract.js";
import { evaluateCommandChecks } from "./commandChecks.js";
import { evaluateFileChecks } from "./fileChecks.js";
import { evaluateHttpChecks } from "./httpChecks.js";
import { determineAcceptancePhase } from "./phase.js";
import { collectAcceptanceSignals } from "./signals.js";
import { buildAcceptanceSummary } from "./summary.js";
import type {
  AcceptanceState,
  SessionRecord,
} from "../../types.js";

export interface AcceptanceEvaluationResult {
  session: SessionRecord;
  state: AcceptanceState;
  satisfied: boolean;
  summary: string;
}

export async function evaluateAcceptanceState(input: {
  session: SessionRecord;
  cwd: string;
}): Promise<AcceptanceEvaluationResult> {
  const previous = normalizeAcceptanceState(input.session.acceptanceState) ?? deriveAcceptanceState(input.session.messages);
  if (!previous?.contract) {
    return createIdleAcceptanceResult(input.session);
  }

  const fileChecks = await evaluateFileChecks(previous.contract, input.cwd);
  const commandChecks = evaluateCommandChecks(previous.contract, input.session.messages);
  const signals = collectAcceptanceSignals(input.session.messages);
  const httpChecks = evaluateHttpChecks(previous.contract, signals);
  const completedChecks = [...fileChecks.completedChecks, ...commandChecks.completedChecks, ...httpChecks.completedChecks];
  const pendingChecks = [...fileChecks.pendingChecks, ...commandChecks.pendingChecks, ...httpChecks.pendingChecks];
  const phase = determineAcceptancePhase({
    contract: previous.contract,
    hasSuccessfulDocumentRead: signals.some((signal) => signal.kind === "document_read_completed"),
    fileChecks,
    pendingChecks,
  });
  const stalledPhaseCount =
    previous.currentPhase === phase && completedChecks.length === previous.completedChecks.length && pendingChecks.length > 0
      ? previous.stalledPhaseCount + 1
      : 0;

  const state: AcceptanceState = {
    status: pendingChecks.length === 0 ? "satisfied" : "active",
    contract: previous.contract,
    currentPhase: phase,
    stalledPhaseCount,
    completedChecks,
    pendingChecks,
    lastIssueSummary: buildAcceptanceSummary(previous.contract, phase, pendingChecks, stalledPhaseCount),
    updatedAt: new Date().toISOString(),
  };

  return {
    session: {
      ...input.session,
      acceptanceState: state,
    },
    state,
    satisfied: pendingChecks.length === 0,
    summary: state.lastIssueSummary ?? "Acceptance checks satisfied.",
  };
}

function createIdleAcceptanceResult(session: SessionRecord): AcceptanceEvaluationResult {
  return {
    session,
    state: {
      status: "idle",
      stalledPhaseCount: 0,
      completedChecks: [],
      pendingChecks: [],
      updatedAt: new Date().toISOString(),
    },
    satisfied: true,
    summary: "No acceptance contract.",
  };
}
