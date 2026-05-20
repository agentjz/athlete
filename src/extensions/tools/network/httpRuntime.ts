import { ToolExecutionError } from "../../../tools/core/errors.js";
import { clampNumber, readString } from "../../../tools/core/shared.js";
import type { ToolContext } from "../../../tools/core/types.js";
import { truncateText } from "../../../utils/fs.js";
import { getHttpSession } from "./session.js";

const BODY_PREVIEW_LIMIT = 8_000;

export interface HttpRequestResult {
  ok: boolean;
  method: string;
  url: string;
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: string;
  bodyPreview: string;
  bodyTruncated: boolean;
  request: {
    headers: Record<string, string>;
    query: Record<string, string>;
    body?: string;
  };
  assertions: {
    status: { passed: boolean; expected?: number; actual: number };
    bodyContains: { passed: boolean; missing: string[] };
  };
}

export async function executeHttpRequest(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<HttpRequestResult> {
  const sessionId = typeof args.session_id === "string" ? args.session_id : undefined;
  const session = sessionId ? await getHttpSession(context.projectContext.stateRootDir, sessionId) : null;
  if (sessionId && !session) {
    throw new ToolExecutionError(`HTTP session not found: ${sessionId}`, { code: "HTTP_SESSION_NOT_FOUND" });
  }
  const method = typeof args.method === "string" ? args.method.toUpperCase() : "GET";
  const url = resolveUrl(readString(args.url, "url"), session?.baseUrl, {
    ...(session?.query ?? {}),
    ...readStringMap(args.query),
  });
  const headers = {
    ...(session?.headers ?? {}),
    ...readStringMap(args.headers),
  };
  if (session?.token && !hasHeader(headers, "authorization")) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  const cookies = {
    ...(session?.cookies ?? {}),
    ...readCookieHeader(headers),
  };
  const cookieHeader = serializeCookies(cookies);
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  const { body: requestBody, contentType } = buildRequestBody(args.body);
  if (contentType && !hasHeader(headers, "content-type")) {
    headers["Content-Type"] = contentType;
  }
  const startedAt = Date.now();
  const response = await fetchWithTimeout(url, {
    method,
    headers,
    body: requestBody,
  }, clampNumber(args.timeout_ms, 500, 300_000, 30_000), context.abortSignal);
  const body = await response.text();
  const expectedStatus = typeof args.expect_status === "number" ? Math.trunc(args.expect_status) : undefined;
  const bodyContains = Array.isArray(args.body_contains) ? args.body_contains.map(String) : [];
  const missing = bodyContains.filter((fragment) => !body.includes(fragment));
  const statusPassed = typeof expectedStatus === "number" ? response.status === expectedStatus : response.ok;

  return {
    ok: statusPassed && missing.length === 0,
    method,
    url,
    status: response.status,
    statusText: response.statusText,
    durationMs: Date.now() - startedAt,
    headers: responseHeaders(response),
    body,
    bodyPreview: truncateText(body, BODY_PREVIEW_LIMIT),
    bodyTruncated: body.length > BODY_PREVIEW_LIMIT,
    request: {
      headers,
      query: {
        ...(session?.query ?? {}),
        ...readStringMap(args.query),
      },
      body: requestBody,
    },
    assertions: {
      status: { passed: statusPassed, expected: expectedStatus, actual: response.status },
      bodyContains: { passed: missing.length === 0, missing },
    },
  };
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("HTTP request timed out")), timeoutMs);
  abortSignal?.addEventListener("abort", () => controller.abort(abortSignal.reason), { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function responseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of response.headers.entries()) {
    headers[name] = value;
  }
  return headers;
}

export function readStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item != null)
      .map(([key, item]) => [key, String(item)]),
  );
}

export function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
}

export function readNullableStringMap(value: unknown): Record<string, string> | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === "undefined") {
    return undefined;
  }
  return readStringMap(value);
}

export function mergeStringMaps(
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
  return replace ? { ...next } : { ...current, ...next };
}

export function maskToken(token: string | undefined): string | undefined {
  if (!token) {
    return undefined;
  }
  if (token.length <= 8) {
    return `${token.slice(0, 2)}***`;
  }
  return `${token.slice(0, 4)}***${token.slice(-2)}`;
}

function resolveUrl(url: string, baseUrl: string | undefined, query: Record<string, string>): string {
  const resolved = /^https?:\/\//i.test(url)
    ? new URL(url)
    : baseUrl
      ? new URL(url, baseUrl)
      : null;
  if (!resolved) {
    throw new ToolExecutionError(`Relative URL requires http_session.base_url: ${url}`, {
      code: "HTTP_RELATIVE_URL_WITHOUT_SESSION",
    });
  }
  for (const [key, value] of Object.entries(query)) {
    resolved.searchParams.set(key, value);
  }
  return resolved.toString();
}

function buildRequestBody(value: unknown): { body?: string; contentType?: string } {
  if (typeof value === "undefined") {
    return {};
  }
  if (typeof value === "string") {
    return { body: value };
  }
  return {
    body: JSON.stringify(value),
    contentType: "application/json",
  };
}

function hasHeader(headers: Record<string, string>, headerName: string): boolean {
  return Object.keys(headers).some((name) => name.toLowerCase() === headerName.toLowerCase());
}

function readCookieHeader(headers: Record<string, string>): Record<string, string> {
  const cookieEntry = Object.entries(headers).find(([name]) => name.toLowerCase() === "cookie");
  if (!cookieEntry) {
    return {};
  }
  return Object.fromEntries(
    cookieEntry[1]
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator === -1
          ? [part, ""]
          : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
      })
      .filter((entry): entry is [string, string] => typeof entry[0] === "string" && entry[0].length > 0),
  );
}

function serializeCookies(cookies: Record<string, string>): string | undefined {
  const entries = Object.entries(cookies);
  return entries.length === 0 ? undefined : entries.map(([key, value]) => `${key}=${value}`).join("; ");
}
