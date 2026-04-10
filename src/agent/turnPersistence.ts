import {
  noteCheckpointRecovery,
  noteCheckpointToolBatch,
  noteCheckpointTransition,
  noteCheckpointTurnInput,
  noteCheckpointYield,
} from "./checkpoint.js";
import { createMessage } from "./messages.js";
import { noteRuntimeRecovery, noteRuntimeTurnInput, noteRuntimeYield } from "./runtimeMetrics.js";
import { clearVerificationPause } from "./verificationState.js";
import type { SessionStoreLike } from "./sessionStore.js";
import type {
  RuntimeRecoverTransition,
  RuntimeTransition,
  RuntimeYieldTransition,
  SessionRecord,
  StoredMessage,
} from "../types.js";

interface PersistToolBatchInput {
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  toolNames: string[];
  toolMessages: StoredMessage[];
  changedPaths: string[];
}

export async function initializeTurnSession(
  session: SessionRecord,
  input: string,
  sessionStore: SessionStoreLike,
): Promise<SessionRecord> {
  const appended = await sessionStore.appendMessages(session, [
    createMessage("user", input),
  ]);

  return sessionStore.save(
    noteRuntimeTurnInput(noteCheckpointTurnInput(
      {
        ...appended,
        verificationState: clearVerificationPause(appended.verificationState),
      },
      input,
    ), input),
  );
}

export async function persistYieldedTurn(
  session: SessionRecord,
  sessionStore: SessionStoreLike,
  transition: RuntimeYieldTransition,
): Promise<SessionRecord> {
  return sessionStore.save(noteRuntimeYield(noteCheckpointYield(session, transition)));
}

export async function persistRecoveryTurn(
  session: SessionRecord,
  sessionStore: SessionStoreLike,
  transition: RuntimeRecoverTransition,
): Promise<SessionRecord> {
  return sessionStore.save(noteRuntimeRecovery(noteCheckpointRecovery(session, transition)));
}

export async function persistToolBatchCheckpoint(
  input: PersistToolBatchInput,
): Promise<SessionRecord> {
  return input.sessionStore.save(
    noteCheckpointToolBatch(input.session, {
      toolNames: input.toolNames,
      toolMessages: input.toolMessages,
      changedPaths: input.changedPaths,
    }),
  );
}

export async function persistCheckpointTransition(
  session: SessionRecord,
  sessionStore: SessionStoreLike,
  transition: RuntimeTransition,
): Promise<SessionRecord> {
  return sessionStore.save(noteCheckpointTransition(session, transition));
}
