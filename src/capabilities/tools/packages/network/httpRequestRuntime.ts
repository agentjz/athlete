import { ToolExecutionError } from "../../core/errors.js";
import { getHttpSession } from "./httpSessionStore.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const MIN_TIMEOUT_MS = 500;
const MAX_TIMEOUT_MS = 300_000;
const BODY_PREVIEW_LIMIT = 8_000;

export interface HttpRequestInput {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  expectStatus?: number;
  bodyContains?: string[];
  sessionId?: string;
}

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
  expectedStatus?: number;
  bodyContains: string[];
  assertions: {
    status: {
      passed: boolean;
      expected?: number;
      actual: number;
    };
    bodyContains: {
      passed: boolean;
      missing: string[];
    };
  };
  request: {
    headers: Record<string, string>;
    query: Record<string, string>;
    body?: string;
  };
  sessionId?: string;
}

export async function executeHttpRequest(
  input: HttpRequestInput,
  options: {
    stateRootDir: string;
    abortSignal?: AbortSignal;
  },
): Promise<HttpRequestResult> {
  const method = normalizeMethod(input.method);
  const timeoutMs = normalizeTimeout(input.timeoutMs);
  const expectedStatus = normalizeExpectedStatus(input.expectStatus);
  const expectedBodyContains = normalizeBodyContains(input.bodyContains);
  const directHeaders = normalizeStringMap(input.headers, "headers");
  const directQuery = normalizeStringMap(input.query, "query");
  const sessionId = normalizeOptionalText(input.sessionId);

  const session = sessionId
    ? await getHttpSession(options.stateRootDir, sessionId)
    : null;
  if (sessionId && !session) {
    throw new ToolExecutionError(`http_session "${sessionId}" not found.`, {
      code: "HTTP_SESSION_NOT_FOUND",
      details: {
        sessionId,
      },
    });
  }

  const targetUrl = resolveRequestUrl(input.url, session?.baseUrl);
  const mergedQuery = {
    ...(session?.query ?? {}),
    ...directQuery,
  };
  const mergedHeaders = {
    ...(session?.headers ?? {}),
    ...directHeaders,
  };

  if (session?.token && !hasHeader(mergedHeaders, "authorization")) {
    mergedHeaders.Authorization = `Bearer ${session.token}`;
  }
  const mergedCookies = {
    ...(session?.cookies ?? {}),
    ...extractCookieHeaderMap(mergedHeaders),
  };
  const serializedCookie = serializeCookies(mergedCookies);
  if (serializedCookie) {
    mergedHeaders.Cookie = serializedCookie;
  }

  const requestUrl = appendQueryToUrl(targetUrl, mergedQuery);
  const { bodyText, contentType } = buildRequestBody(input.body);
  if (contentType && !hasHeader(mergedHeaders, "content-type")) {
    mergedHeaders["Content-Type"] = contentType;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("http request timed out")), timeoutMs);
  options.abortSignal?.addEventListener("abort", () => controller.abort(options.abortSignal?.reason), { once: true });
  const startedAt = Date.now();

  try {
    const response = await fetch(requestUrl, {
      method,
      headers: mergedHeaders,
      body: bodyText,
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    const body = await response.text();
    const bodyPreview = body.length > BODY_PREVIEW_LIMIT ? `${body.slice(0, BODY_PREVIEW_LIMIT)}...` : body;
    const statusPassed = typeof expectedStatus === "number"
      ? response.status === expectedStatus
      : response.ok;
    const missingFragments = expectedBodyContains.filter((fragment) => !body.includes(fragment));
    const bodyPassed = missingFragments.length === 0;

    return {
      ok: statusPassed && bodyPassed,
      method,
      url: requestUrl,
      status: response.status,
      statusText: response.statusText,
      durationMs,
      headers: normalizeResponseHeaders(response),
      body,
      bodyPreview,
      bodyTruncated: bodyPreview !== body,
      expectedStatus,
      bodyContains: expectedBodyContains,
      assertions: {
        status: {
          passed: statusPassed,
          expected: expectedStatus,
          actual: response.status,
        },
        bodyContains: {
          passed: bodyPassed,
          missing: missingFragments,
        },
      },
      request: {
        headers: mergedHeaders,
        query: mergedQuery,
        body: bodyText ?? undefined,
      },
      sessionId: sessionId ?? undefined,
    };
  } catch (error) {
    throw new ToolExecutionError(
      `http request failed for ${requestUrl}: ${error instanceof Error ? error.message : String(error)}`,
      {
        code: "HTTP_REQUEST_FAILED",
        details: {
          url: requestUrl,
          method,
        },
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeStringMap(
  value: unknown,
  field: string,
): Record<string, string> {
  if (value == null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ToolExecutionError(`Tool argument "${field}" must be an object with string values.`, {
      code: "HTTP_ARGUMENT_INVALID",
      details: {
        field,
      },
    });
  }

  const normalized: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue === "undefined" || rawValue === null) {
      continue;
    }
    const normalizedKey = key.trim();
    const normalizedValue = String(rawValue).trim();
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    normalized[normalizedKey] = normalizedValue;
  }
  return normalized;
}

function normalizeMethod(method: string | undefined): string {
  const normalized = normalizeOptionalText(method);
  return normalized ? normalized.toUpperCase() : "GET";
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.trunc(timeoutMs)));
}

function normalizeExpectedStatus(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.trunc(value);
}

function normalizeBodyContains(input: string[] | undefined): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
}

function resolveRequestUrl(url: string, baseUrl: string | undefined): string {
  const normalizedUrl = normalizeOptionalText(url);
  if (!normalizedUrl) {
    throw new ToolExecutionError("Tool argument \"url\" must be a non-empty string.", {
      code: "HTTP_ARGUMENT_INVALID",
      details: {
        field: "url",
      },
    });
  }

  if (/^https?:\/\//i.test(normalizedUrl)) {
    return normalizedUrl;
  }

  if (!baseUrl) {
    throw new ToolExecutionError(
      `Relative URL "${normalizedUrl}" requires http_session.base_url or an absolute URL.`,
      {
        code: "HTTP_REQUEST_RELATIVE_URL_WITHOUT_BASE",
      },
    );
  }

  return new URL(normalizedUrl, baseUrl).toString();
}

function appendQueryToUrl(url: string, query: Record<string, string>): string {
  const urlObject = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    urlObject.searchParams.set(key, value);
  }
  return urlObject.toString();
}

function normalizeResponseHeaders(response: Response): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of response.headers.entries()) {
    normalized[name] = value;
  }
  return normalized;
}

function buildRequestBody(body: unknown): {
  bodyText?: string;
  contentType?: string;
} {
  if (typeof body === "undefined") {
    return {};
  }

  if (typeof body === "string") {
    return {
      bodyText: body,
    };
  }

  if (body === null || typeof body === "number" || typeof body === "boolean" || typeof body === "object") {
    return {
      bodyText: JSON.stringify(body),
      contentType: "application/json",
    };
  }

  throw new ToolExecutionError("Tool argument \"body\" is not serializable.", {
    code: "HTTP_ARGUMENT_INVALID",
    details: {
      field: "body",
    },
  });
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function extractCookieHeaderMap(headers: Record<string, string>): Record<string, string> {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== "cookie") {
      continue;
    }
    const entries = value
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const mapped: Record<string, string> = {};
    for (const entry of entries) {
      const [rawKey, ...rawValue] = entry.split("=");
      const key = rawKey?.trim();
      if (!key) {
        continue;
      }
      mapped[key] = rawValue.join("=").trim();
    }
    return mapped;
  }
  return {};
}

function serializeCookies(cookies: Record<string, string>): string | undefined {
  const entries = Object.entries(cookies);
  if (entries.length === 0) {
    return undefined;
  }
  return entries.map(([key, value]) => `${key}=${value}`).join("; ");
}
