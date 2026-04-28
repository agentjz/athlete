import { resolveCurrentObjectiveCheckpoint } from "../checkpoint/state.js";
import {
  createCompactionDegradationPauseTransition,
  createCompactionDegradationRecoveryTransition,
} from "../runtimeTransition.js";
import type {
  CompactionRecoveryState,
  RuntimePauseTransition,
  RuntimeRecoverTransition,
  SessionRecord,
} from "../../types.js";

export const POST_COMPACTION_NO_TEXT_THRESHOLD = 3;
export const MAX_POST_COMPACTION_RECOVERY_ATTEMPTS = 2;

export function noteCompactionObserved(
  session: SessionRecord,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = resolveCurrentObjectiveCheckpoint(session, timestamp);
  const current = checkpoint.flow.compactionRecovery;
  const nextState: CompactionRecoveryState = {
    active: true,
    compressedSince: current?.compressedSince ?? timestamp,
    noTextStreak: current?.noTextStreak ?? 0,
    recoveryAttempts: current?.recoveryAttempts ?? 0,
    lastRecoveryAt: current?.lastRecoveryAt,
    pausedAt: current?.pausedAt,
  };

  return withCompactionRecovery(session, nextState, timestamp);
}

export function clearCompactionRecovery(
  session: SessionRecord,
  timestamp = new Date().toISOString(),
): SessionRecord {
  return withCompactionRecovery(session, undefined, timestamp);
}

export function notePostCompactionNoText(
  session: SessionRecord,
  timestamp = new Date().toISOString(),
): {
  session: SessionRecord;
  transition?: RuntimeRecoverTransition | RuntimePauseTransition;
} {
  const checkpoint = resolveCurrentObjectiveCheckpoint(session, timestamp);
  const current = checkpoint.flow.compactionRecovery;
  if (!current?.active) {
    return {
      session,
    };
  }

  const nextNoTextStreak = current.noTextStreak + 1;
  if (nextNoTextStreak < POST_COMPACTION_NO_TEXT_THRESHOLD) {
    return {
      session: withCompactionRecovery(session, {
        ...current,
        noTextStreak: nextNoTextStreak,
      }, timestamp),
    };
  }

  if (current.recoveryAttempts >= MAX_POST_COMPACTION_RECOVERY_ATTEMPTS) {
    const transition = createCompactionDegradationPauseTransition({
      noTextStreak: nextNoTextStreak,
      recoveryAttempts: current.recoveryAttempts,
      maxRecoveryAttempts: MAX_POST_COMPACTION_RECOVERY_ATTEMPTS,
    }, timestamp);
    return {
      session: withCompactionRecovery(session, {
        ...current,
        noTextStreak: nextNoTextStreak,
        pausedAt: timestamp,
      }, timestamp),
      transition,
    };
  }

  const nextRecoveryAttempts = current.recoveryAttempts + 1;
  const transition = createCompactionDegradationRecoveryTransition({
    consecutiveFailures: nextRecoveryAttempts,
    noTextStreak: nextNoTextStreak,
    recoveryAttempt: nextRecoveryAttempts,
    maxRecoveryAttempts: MAX_POST_COMPACTION_RECOVERY_ATTEMPTS,
  }, timestamp);
  return {
    session: withCompactionRecovery(session, {
      ...current,
      noTextStreak: 0,
      recoveryAttempts: nextRecoveryAttempts,
      lastRecoveryAt: timestamp,
      pausedAt: undefined,
    }, timestamp),
    transition,
  };
}

function withCompactionRecovery(
  session: SessionRecord,
  recovery: CompactionRecoveryState | undefined,
  timestamp: string,
): SessionRecord {
  const checkpoint = resolveCurrentObjectiveCheckpoint(session, timestamp);
  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      flow: {
        ...checkpoint.flow,
        compactionRecovery: recovery,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
  };
}
