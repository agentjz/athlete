export interface ProviderUsageSnapshot {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export interface ModelRequestMetric {
  durationMs: number;
  usage?: ProviderUsageSnapshot;
}
