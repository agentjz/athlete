export function applyTelegramProxyEnvironment(proxyUrl: string): void {
  const normalized = proxyUrl.trim();
  if (!normalized) {
    return;
  }

  process.env.NODE_USE_ENV_PROXY = "1";
  process.env.HTTPS_PROXY = normalized;
  process.env.HTTP_PROXY = normalized;
}
