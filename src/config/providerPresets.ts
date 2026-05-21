import type { ModelReasoningEffort, ModelThinkingMode } from "../types.js";

export interface ProviderPreset {
  label: string;
  provider: string;
  baseUrl: string;
  model: string;
  thinking?: ModelThinkingMode;
  reasoningEffort?: ModelReasoningEffort;
  activeByDefault: boolean;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    label: "YLS Codex + GPT-5.4",
    provider: "openai",
    baseUrl: "https://code.ylsagi.com/codex",
    model: "gpt-5.4",
    thinking: "disabled",
    reasoningEffort: "xhigh",
    activeByDefault: false,
  },
  {
    label: "TTAPI + GPT-5.4",
    provider: "openai",
    baseUrl: "https://w.ciykj.cn",
    model: "gpt-5.4",
    thinking: "disabled",
    reasoningEffort: "xhigh",
    activeByDefault: false,
  },
  {
    label: "DeepSeek official V4",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    thinking: "enabled",
    reasoningEffort: "max",
    activeByDefault: true,
  },
] as const;

export function getDefaultProviderPreset(): ProviderPreset {
  return PROVIDER_PRESETS.find((preset) => preset.activeByDefault) ?? PROVIDER_PRESETS[0]!;
}
