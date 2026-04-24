import { randomUUID } from "node:crypto";

import { ToolExecutionError } from "../errors.js";
import { okResult, parseArgs } from "../shared.js";
import type { RegisteredTool } from "../types.js";
import { normalizeOptionalText, normalizeStringMap } from "./httpRequestRuntime.js";
import {
  deleteHttpSession,
  getHttpSession,
  listHttpSessions,
  putHttpSession,
  type HttpSessionRecord,
} from "./httpSessionStore.js";

type SessionAction = "create" | "update" | "get" | "delete" | "list";

export const httpSessionTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "http_session",
      description: "Create, update, inspect, list, or delete reusable HTTP session state.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "delete", "list"],
            description: "Session operation to perform.",
          },
          session_id: {
            type: "string",
            description: "Target session id. If omitted for create, one is generated.",
          },
          base_url: {
            type: "string",
            description: "Optional base URL used by relative http_request/http_suite calls.",
          },
          headers: {
            type: "object",
            description: "Default headers merged into each request.",
            additionalProperties: {
              type: "string",
            },
          },
          query: {
            type: "object",
            description: "Default query parameters merged into each request.",
            additionalProperties: {
              type: "string",
            },
          },
          cookies: {
            type: "object",
            description: "Default cookies applied as Cookie header.",
            additionalProperties: {
              type: "string",
            },
          },
          token: {
            type: "string",
            description: "Optional bearer token. Null clears token.",
          },
          persist: {
            type: "boolean",
            description: "When true, write session into .deadmouse/network/http-sessions.json.",
          },
          replace: {
            type: "boolean",
            description: "When true, replace defaults instead of merge for maps.",
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const action = readAction(args.action);

    if (action === "list") {
      const sessions = await listHttpSessions(context.projectContext.stateRootDir);
      return okResult(
        JSON.stringify(
          {
            ok: true,
            sessions: sessions.map(toSessionSummary),
          },
          null,
          2,
        ),
      );
    }

    const sessionId = normalizeOptionalText(args.session_id);
    if (!sessionId && action !== "create") {
      throw new ToolExecutionError(`http_session action "${action}" requires session_id.`, {
        code: "HTTP_SESSION_ID_REQUIRED",
      });
    }

    if (action === "get") {
      const session = await getHttpSession(context.projectContext.stateRootDir, sessionId!);
      if (!session) {
        throw new ToolExecutionError(`http_session "${sessionId}" not found.`, {
          code: "HTTP_SESSION_NOT_FOUND",
        });
      }
      return okResult(
        JSON.stringify(
          {
            ok: true,
            action,
            session: toSessionSummary(session),
          },
          null,
          2,
        ),
      );
    }

    if (action === "delete") {
      const deleted = await deleteHttpSession(context.projectContext.stateRootDir, sessionId!);
      return okResult(
        JSON.stringify(
          {
            ok: true,
            action,
            session_id: sessionId,
            deleted,
          },
          null,
          2,
        ),
      );
    }

    const resolvedSessionId = sessionId ?? `http-session-${randomUUID()}`;
    const persisted = await getHttpSession(context.projectContext.stateRootDir, resolvedSessionId);
    if (!persisted && action === "update") {
      throw new ToolExecutionError(`http_session "${resolvedSessionId}" not found for update.`, {
        code: "HTTP_SESSION_NOT_FOUND",
      });
    }

    const replace = args.replace === true;
    const now = new Date().toISOString();
    const next = buildSessionRecord({
      sessionId: resolvedSessionId,
      existing: persisted ?? undefined,
      now,
      replace,
      baseUrl: readNullableString(args.base_url),
      headers: readNullableMap(args.headers, "headers"),
      query: readNullableMap(args.query, "query"),
      cookies: readNullableMap(args.cookies, "cookies"),
      token: readNullableString(args.token),
      persist: typeof args.persist === "boolean" ? args.persist : undefined,
    });
    await putHttpSession(context.projectContext.stateRootDir, next);

    const changedPath = next.persist
      ? ".deadmouse/network/http-sessions.json"
      : undefined;

    return okResult(
      JSON.stringify(
        {
          ok: true,
          action,
          session: toSessionSummary(next),
        },
        null,
        2,
      ),
      {
        changedPaths: changedPath ? [changedPath] : undefined,
      },
    );
  },
};

function readAction(value: unknown): SessionAction {
  const normalized = normalizeOptionalText(value);
  if (
    normalized === "create" ||
    normalized === "update" ||
    normalized === "get" ||
    normalized === "delete" ||
    normalized === "list"
  ) {
    return normalized;
  }
  throw new ToolExecutionError(`Unsupported http_session action: ${String(value ?? "")}`, {
    code: "HTTP_SESSION_ACTION_INVALID",
  });
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return normalizeOptionalText(value);
}

function readNullableMap(value: unknown, field: string): Record<string, string> | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === "undefined") {
    return undefined;
  }
  return normalizeStringMap(value, field);
}

function buildSessionRecord(input: {
  sessionId: string;
  existing?: HttpSessionRecord;
  now: string;
  replace: boolean;
  baseUrl?: string | null;
  headers?: Record<string, string> | null;
  query?: Record<string, string> | null;
  cookies?: Record<string, string> | null;
  token?: string | null;
  persist?: boolean;
}): HttpSessionRecord {
  const current: HttpSessionRecord = input.existing ?? {
    id: input.sessionId,
    headers: {},
    query: {},
    cookies: {},
    persist: false,
    createdAt: input.now,
    updatedAt: input.now,
  };
  const next: HttpSessionRecord = {
    ...current,
    id: input.sessionId,
    baseUrl: input.baseUrl === undefined ? current.baseUrl : input.baseUrl ?? undefined,
    headers: mergeOrReplaceMap(current.headers, input.headers, input.replace),
    query: mergeOrReplaceMap(current.query, input.query, input.replace),
    cookies: mergeOrReplaceMap(current.cookies, input.cookies, input.replace),
    token: input.token === undefined ? current.token : input.token ?? undefined,
    persist: typeof input.persist === "boolean" ? input.persist : current.persist,
    createdAt: current.createdAt,
    updatedAt: input.now,
  };
  return next;
}

function mergeOrReplaceMap(
  current: Record<string, string>,
  next: Record<string, string> | null | undefined,
  replace: boolean,
): Record<string, string> {
  if (next === null) {
    return {};
  }
  if (next === undefined) {
    return { ...current };
  }
  if (replace) {
    return { ...next };
  }
  return {
    ...current,
    ...next,
  };
}

function toSessionSummary(session: HttpSessionRecord): Record<string, unknown> {
  return {
    id: session.id,
    base_url: session.baseUrl,
    headers: session.headers,
    query: session.query,
    cookies: session.cookies,
    token: maskToken(session.token),
    persist: session.persist,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  };
}

function maskToken(token: string | undefined): string | undefined {
  if (!token) {
    return undefined;
  }
  if (token.length <= 8) {
    return `${token.slice(0, 2)}***`;
  }
  return `${token.slice(0, 4)}***${token.slice(-2)}`;
}
