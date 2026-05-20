import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult, jsonResult } from "../../../shared.js";
import {
  deleteHttpSession,
  getHttpSession,
  getHttpSessionStateFile,
  listHttpSessions,
  putHttpSession,
  type HttpSessionRecord,
} from "../session.js";
import { maskToken, mergeStringMaps, readNullableString, readNullableStringMap } from "../httpRuntime.js";

export const httpSessionTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "http_session",
      description: "Create, update, get, list, or delete reusable HTTP session defaults.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "update", "get", "delete", "list"] },
          session_id: { type: "string" },
          base_url: { type: ["string", "null"] },
          headers: { type: ["object", "null"], additionalProperties: { type: "string" } },
          query: { type: ["object", "null"], additionalProperties: { type: "string" } },
          cookies: { type: ["object", "null"], additionalProperties: { type: "string" } },
          token: { type: ["string", "null"] },
          replace: { type: "boolean" },
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
      return jsonResult({
        ok: true,
        sessions: (await listHttpSessions(context.projectContext.stateRootDir)).map(toSessionSummary),
      });
    }
    const id = readString(args.session_id, "session_id");
    if (action === "get") {
      return jsonResult({
        ok: true,
        session: toNullableSessionSummary(await getHttpSession(context.projectContext.stateRootDir, id)),
      });
    }
    if (action === "delete") {
      const deleted = await deleteHttpSession(context.projectContext.stateRootDir, id);
      const filePath = await getHttpSessionStateFile(context.projectContext.stateRootDir);
      return changedJsonResult({ ok: true, deleted, session_id: id }, [filePath]);
    }
    const current = await getHttpSession(context.projectContext.stateRootDir, id);
    if (action === "update" && !current) {
      throw new Error(`HTTP session not found: ${id}`);
    }
    const now = new Date().toISOString();
    const replace = args.replace === true;
    const session: HttpSessionRecord = {
      id,
      baseUrl: readNullableString(args.base_url) === null
        ? undefined
        : readNullableString(args.base_url) ?? current?.baseUrl,
      headers: mergeStringMaps(current?.headers ?? {}, readNullableStringMap(args.headers), replace),
      query: mergeStringMaps(current?.query ?? {}, readNullableStringMap(args.query), replace),
      cookies: mergeStringMaps(current?.cookies ?? {}, readNullableStringMap(args.cookies), replace),
      token: readNullableString(args.token) === null
        ? undefined
        : readNullableString(args.token) ?? current?.token,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    const filePath = await putHttpSession(context.projectContext.stateRootDir, session);
    return changedJsonResult({ ok: true, action, session: toSessionSummary(session) }, [filePath]);
  },
};

function readAction(value: unknown): "create" | "update" | "get" | "delete" | "list" {
  if (value === "create" || value === "update" || value === "get" || value === "delete" || value === "list") {
    return value;
  }
  throw new Error(`Invalid http_session action: ${String(value ?? "")}`);
}

function toNullableSessionSummary(session: HttpSessionRecord | null): Record<string, unknown> | null {
  return session ? toSessionSummary(session) : null;
}

function toSessionSummary(session: HttpSessionRecord): Record<string, unknown> {
  return {
    id: session.id,
    baseUrl: session.baseUrl,
    headers: session.headers,
    query: session.query,
    cookies: session.cookies,
    token: maskToken(session.token),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}
