import path from "node:path";
import { normalizeOutputMode, resolveDefaultStatePath, resolveOptionalPath, resolvePlaywrightStateDir, resolvePlaywrightStorageState, resolvePlaywrightUserDataDir } from "./paths.js";
import type {
  McpServerConfig,
  McpRuntimeConfigContext,
  PlaywrightBrowserName,
  PlaywrightMcpConfig,
  PlaywrightMcpConfigInput,
} from "../types.js";

const DEFAULT_PLAYWRIGHT_PACKAGE = "@playwright/mcp@latest";
const DEFAULT_PLAYWRIGHT_TIMEOUT_MS = 120_000;
const DEFAULT_PLAYWRIGHT_OUTPUT_MODE = "stdout";

export function getDefaultPlaywrightMcpConfig(): PlaywrightMcpConfig {
  return {
    enabled: false,
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    packageSpec: DEFAULT_PLAYWRIGHT_PACKAGE,
    browser: "",
    headless: false,
    isolated: false,
    userDataDir: "",
    storageState: "",
    configPath: "",
    outputDir: "",
    outputMode: DEFAULT_PLAYWRIGHT_OUTPUT_MODE,
    saveSession: true,
    caps: [],
    extraArgs: [],
    env: {},
    cwd: "",
    timeoutMs: DEFAULT_PLAYWRIGHT_TIMEOUT_MS,
  };
}

export function normalizePlaywrightMcpConfig(
  input: PlaywrightMcpConfigInput | undefined,
  runtime: McpRuntimeConfigContext = {},
): PlaywrightMcpConfig {
  const defaults = getDefaultPlaywrightMcpConfig();
  const isolated = Boolean(input?.isolated);
  const headless = Boolean(input?.headless);
  const stateDir = resolvePlaywrightStateDir(runtime);
  const userDataDir = resolvePlaywrightUserDataDir(
    String(input?.userDataDir ?? "").trim(),
    runtime.cwd,
    isolated,
    stateDir,
  );
  const storageState = resolvePlaywrightStorageState(
    String(input?.storageState ?? "").trim(),
    runtime.cwd,
    isolated,
    stateDir,
  );
  const configPath = resolveDefaultStatePath(
    String(input?.configPath ?? "").trim(),
    runtime.cwd,
    path.join(stateDir, "config.json"),
  );
  const outputDir = resolveDefaultStatePath(
    String(input?.outputDir ?? "").trim(),
    runtime.cwd,
    path.join(stateDir, "output"),
  );

  return {
    enabled: Boolean(input?.enabled),
    command: String(input?.command ?? defaults.command).trim() || defaults.command,
    packageSpec: String(input?.packageSpec ?? input?.package ?? defaults.packageSpec).trim() || defaults.packageSpec,
    browser: normalizeBrowserName(input?.browser),
    headless,
    isolated,
    userDataDir,
    storageState,
    configPath,
    outputDir,
    outputMode: normalizeOutputMode(input?.outputMode),
    saveSession: input?.saveSession !== false,
    caps: normalizeStringArray(input?.caps),
    extraArgs: normalizeExtraArgs(input?.extraArgs, headless),
    env: normalizeStringMap(input?.env),
    cwd: resolveOptionalPath(String(input?.cwd ?? "").trim(), runtime.cwd),
    timeoutMs: clampNumber(input?.timeoutMs, 5_000, 10 * 60 * 1_000, defaults.timeoutMs),
  };
}

export function buildPlaywrightMcpServer(playwright: PlaywrightMcpConfig): McpServerConfig | null {
  if (!playwright.enabled) {
    return null;
  }
  const args = [playwright.packageSpec];
  if (playwright.browser) {
    args.push("--browser", playwright.browser);
  }
  if (playwright.headless) {
    args.push("--headless");
  }
  if (playwright.isolated) {
    args.push("--isolated");
  } else if (playwright.userDataDir) {
    args.push("--user-data-dir", playwright.userDataDir);
  }
  if (playwright.storageState) {
    args.push("--storage-state", playwright.storageState);
  }
  if (playwright.configPath) {
    args.push("--config", playwright.configPath);
  }
  if (playwright.outputDir) {
    args.push("--output-dir", playwright.outputDir);
  }
  if (playwright.outputMode) {
    args.push("--output-mode", playwright.outputMode);
  }
  if (playwright.saveSession) {
    args.push("--save-session");
  }
  if (playwright.caps.length > 0) {
    args.push("--caps", playwright.caps.join(","));
  }
  args.push(...playwright.extraArgs);
  return {
    name: "playwright",
    enabled: true,
    transport: "stdio",
    command: playwright.command,
    args,
    env: playwright.env,
    cwd: playwright.cwd,
    url: "",
    include: [],
    exclude: [],
    timeoutMs: playwright.timeoutMs,
    trust: true,
    auth: {
      type: "none",
      tokenEnv: "",
      headers: {},
    },
  };
}

function normalizeBrowserName(value: unknown): PlaywrightBrowserName {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "chrome":
      return "chrome";
    case "firefox":
      return "firefox";
    case "webkit":
      return "webkit";
    case "msedge":
      return "msedge";
    default:
      return "";
  }
}

function normalizeExtraArgs(value: unknown, headless: boolean): string[] {
  const blockedFlags = new Set([
    "--browser",
    "--caps",
    "--config",
    "--headless",
    "--isolated",
    "--output-dir",
    "--output-mode",
    "--save-session",
    "--storage-state",
    "--user-data-dir",
  ]);

  return normalizeStringArray(value).filter((arg) => {
    if (!headless && arg === "--headless") {
      return false;
    }

    return !blockedFlags.has(arg);
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => [key.trim(), String(raw ?? "").trim()] as const)
    .filter(([key, raw]) => key.length > 0 && raw.length > 0);

  return Object.fromEntries(entries);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}
