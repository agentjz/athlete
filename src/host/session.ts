import type { SessionStoreLike } from "../agent/session.js";
import { isSessionNotFoundError } from "../agent/session/errors.js";
import type { SessionRecord } from "../types.js";
import type {
  EnsureBoundSessionOptions,
  HostSessionBindingLike,
  LoadSessionOrCreateOptions,
  PersistBoundSessionOptions,
} from "./types.js";

export async function createHostSession(
  sessionStore: SessionStoreLike,
  cwd: string,
): Promise<SessionRecord> {
  return sessionStore.create(cwd);
}

export async function createPersistedSession(
  sessionStore: SessionStoreLike,
  cwd: string,
): Promise<SessionRecord> {
  return sessionStore.save(await createHostSession(sessionStore, cwd));
}

export async function loadLatestSession(
  sessionStore: SessionStoreLike,
): Promise<SessionRecord | null> {
  return sessionStore.loadLatest();
}

export async function loadSessionOrCreate(
  options: LoadSessionOrCreateOptions,
): Promise<SessionRecord> {
  try {
    return await options.sessionStore.load(options.sessionId);
  } catch (error) {
    if (!isSessionNotFoundError(error)) {
      throw error;
    }

    const session = await createPersistedSession(options.sessionStore, options.cwd);
    await options.onRecreated?.(session);
    return session;
  }
}

export async function ensureBoundSession<TBinding extends HostSessionBindingLike>(
  options: EnsureBoundSessionOptions<TBinding>,
): Promise<{
  binding: TBinding;
  session: SessionRecord;
}> {
  let binding = await options.loadBinding();

  if (!binding) {
    const session = await createPersistedSession(options.sessionStore, options.cwd);
    binding = options.createBinding(session);
    await options.saveBinding(binding);
    return {
      binding,
      session,
    };
  }

  let currentBinding: TBinding = options.touchBinding(binding, binding.sessionId);
  await options.saveBinding(currentBinding);

  const session = await loadSessionOrCreate({
    cwd: options.cwd,
    sessionStore: options.sessionStore,
    sessionId: currentBinding.sessionId,
    onRecreated: async (nextSession) => {
      currentBinding = options.touchBinding(currentBinding, nextSession.id);
      await options.saveBinding(currentBinding);
    },
  });

  return {
    binding: currentBinding,
    session,
  };
}

export async function persistBoundSession<TBinding extends HostSessionBindingLike>(
  options: PersistBoundSessionOptions<TBinding>,
): Promise<TBinding> {
  const nextBinding = options.touchBinding(options.binding, options.sessionId);
  await options.saveBinding(nextBinding);
  return nextBinding;
}
