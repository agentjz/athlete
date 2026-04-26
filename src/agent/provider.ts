export interface ProviderCapabilities {
  provider: string;
  model: string;
  wireApi: "responses" | "chat.completions";
  supportsReasoningContent: boolean;
  defaultReasoningEnabled: boolean;
  defaultReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  requestTimeoutMs: number;
  doctorProbeTimeoutMs: number;
}

interface ProviderProfileInput {
  provider?: string;
  model: string;
}

const DEFAULT_PROVIDER = "openai-compatible";
const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_DOCTOR_PROBE_TIMEOUT_MS = 10_000;
const RELAY_REQUEST_TIMEOUT_MS = 15 * 60 * 1000;
const RELAY_DOCTOR_PROBE_TIMEOUT_MS = 45_000;

export function resolveProviderCapabilities(input: ProviderProfileInput): ProviderCapabilities {
  const provider = normalizeProviderName(input.provider);
  const model = normalizeModelName(input.model);

  if (provider === "deepseek" || model.startsWith("deepseek-")) {
    return {
      provider: "deepseek",
      model,
      wireApi: "chat.completions",
      supportsReasoningContent: true,
      defaultReasoningEnabled: true,
      defaultReasoningEffort: "high",
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
    };
  }

  if (provider === "openai" || model === "gpt-5.4") {
    return {
      provider: "openai",
      model,
      wireApi: "responses",
      supportsReasoningContent: false,
      defaultReasoningEnabled: true,
      defaultReasoningEffort: "xhigh",
      requestTimeoutMs: RELAY_REQUEST_TIMEOUT_MS,
      doctorProbeTimeoutMs: RELAY_DOCTOR_PROBE_TIMEOUT_MS,
    };
  }

  return {
    provider,
    model,
    wireApi: "chat.completions",
    supportsReasoningContent: false,
    defaultReasoningEnabled: false,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  };
}

function normalizeProviderName(value: string | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || DEFAULT_PROVIDER;
}

function normalizeModelName(value: string): string {
  return String(value ?? "").trim();
}
