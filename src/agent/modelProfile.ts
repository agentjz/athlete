export type ModelCapabilityTier = "low" | "standard" | "strong" | "frontier";
export type ModelToolUseReliability = "unknown" | "basic" | "steady" | "strong";
export type ModelContextPolicy = "compact" | "balanced" | "wide";

export interface ModelCapabilityProfileInput {
  provider: string;
  model: string;
  wireApi: "responses" | "chat.completions";
  supportsReasoningContent: boolean;
  defaultReasoningEnabled: boolean;
  defaultReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}

export interface ModelCapabilityProfile {
  provider: string;
  model: string;
  tier: ModelCapabilityTier;
  wireApi: ModelCapabilityProfileInput["wireApi"];
  reasoning: {
    defaultEnabled: boolean;
    visibleToHarness: boolean;
    defaultEffort?: ModelCapabilityProfileInput["defaultReasoningEffort"];
  };
  toolUseReliability: ModelToolUseReliability;
  contextPolicy: ModelContextPolicy;
  harnessSurface: {
    preferLowNoiseCapabilitySummary: boolean;
    reasoningVisibleToHarness: boolean;
    requiresStrictToolArgumentContracts: boolean;
  };
}

export function resolveModelCapabilityProfile(capabilities: ModelCapabilityProfileInput): ModelCapabilityProfile {
  const model = capabilities.model.toLowerCase();
  const tier = resolveTier(capabilities.provider, model);
  return {
    provider: capabilities.provider,
    model: capabilities.model,
    tier,
    wireApi: capabilities.wireApi,
    reasoning: {
      defaultEnabled: capabilities.defaultReasoningEnabled,
      visibleToHarness: capabilities.supportsReasoningContent,
      defaultEffort: capabilities.defaultReasoningEffort,
    },
    toolUseReliability: resolveToolUseReliability(tier, capabilities.provider, model),
    contextPolicy: resolveContextPolicy(tier, model),
    harnessSurface: {
      preferLowNoiseCapabilitySummary: true,
      reasoningVisibleToHarness: capabilities.supportsReasoningContent,
      requiresStrictToolArgumentContracts: true,
    },
  };
}

function resolveTier(provider: string, model: string): ModelCapabilityTier {
  if (model.includes("gpt-5.4") || model.includes("gpt-5.5")) {
    return "frontier";
  }
  if (provider === "deepseek" || model.includes("deepseek-v4") || model.includes("gpt-5")) {
    return "strong";
  }
  if (model.includes("mini") || model.includes("flash") || model.includes("small")) {
    return "standard";
  }
  return "standard";
}

function resolveToolUseReliability(
  tier: ModelCapabilityTier,
  provider: string,
  model: string,
): ModelToolUseReliability {
  if (tier === "frontier") {
    return "strong";
  }
  if (provider === "deepseek" || model.includes("deepseek-v4")) {
    return "steady";
  }
  if (tier === "strong") {
    return "steady";
  }
  return "unknown";
}

function resolveContextPolicy(tier: ModelCapabilityTier, model: string): ModelContextPolicy {
  if (tier === "frontier" || model.includes("long") || model.includes("128k") || model.includes("1m")) {
    return "wide";
  }
  if (tier === "strong") {
    return "balanced";
  }
  return "compact";
}
