export class SessionStoreError extends Error {
  readonly code: string;
  readonly sessionPath?: string;

  constructor(message: string, options: {
    code: string;
    sessionPath?: string;
    cause?: unknown;
  }) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.code = options.code;
    this.sessionPath = options.sessionPath;
  }
}

export class SessionNotFoundError extends SessionStoreError {
  constructor(message: string, options: {
    sessionPath?: string;
    cause?: unknown;
  } = {}) {
    super(message, {
      code: "SESSION_NOT_FOUND",
      sessionPath: options.sessionPath,
      cause: options.cause,
    });
  }
}

export class SessionCorruptError extends SessionStoreError {
  constructor(message: string, options: {
    sessionPath?: string;
    cause?: unknown;
  } = {}) {
    super(message, {
      code: "SESSION_CORRUPT",
      sessionPath: options.sessionPath,
      cause: options.cause,
    });
  }
}

export class UnsupportedSessionSchemaError extends SessionStoreError {
  constructor(message: string, options: {
    sessionPath?: string;
    cause?: unknown;
  } = {}) {
    super(message, {
      code: "SESSION_UNSUPPORTED_SCHEMA",
      sessionPath: options.sessionPath,
      cause: options.cause,
    });
  }
}

export function createSessionNotFoundError(sessionId: string, sessionPath: string, cause?: unknown): SessionNotFoundError {
  return new SessionNotFoundError(
    `Session '${sessionId}' was not found at ${sessionPath}. Rebind the host or create a new formal session explicitly.`,
    {
      sessionPath,
      cause,
    },
  );
}

export function createInvalidSessionJsonError(sessionPath: string, cause: SyntaxError): SessionCorruptError {
  return new SessionCorruptError(
    `Session snapshot '${sessionPath}' is corrupt: invalid JSON. Fix or delete the broken snapshot before retrying.`,
    {
      sessionPath,
      cause,
    },
  );
}

export function createSessionCorruptError(sessionPath: string, detail: string): SessionCorruptError {
  return new SessionCorruptError(
    `Session snapshot '${sessionPath}' is corrupt: ${detail}. Fix or delete the broken snapshot before retrying.`,
    {
      sessionPath,
    },
  );
}

export function createUnsupportedSessionSchemaError(
  sessionPath: string,
  receivedVersion: unknown,
  expectedVersion: number,
): UnsupportedSessionSchemaError {
  return new UnsupportedSessionSchemaError(
    `Session snapshot '${sessionPath}' has unsupported schema version '${String(receivedVersion)}'. Expected ${expectedVersion}. Rebuild the session snapshot instead of guessing.`,
    {
      sessionPath,
    },
  );
}

export function isSessionNotFoundError(error: unknown): error is SessionNotFoundError {
  return error instanceof SessionNotFoundError || (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "SESSION_NOT_FOUND"
  );
}
