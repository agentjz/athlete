import fs from "node:fs/promises";
import path from "node:path";

import { getDefaultAthleteIgnoreContent } from "../utils/ignore.js";

export interface InitProjectResult {
  created: string[];
  skipped: string[];
}

export async function initializeProjectFiles(cwd: string): Promise<InitProjectResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  const athleteDir = path.join(cwd, ".athlete");
  const envPath = path.join(athleteDir, ".env");
  const envExamplePath = path.join(athleteDir, ".env.example");
  const ignorePath = path.join(athleteDir, ".athleteignore");
  const envTemplate = buildProjectEnvTemplate(false);
  const envExampleTemplate = buildProjectEnvTemplate(true);

  // Ensure .athlete directory exists
  await fs.mkdir(athleteDir, { recursive: true });

  if (await fileExists(envPath)) {
    skipped.push(envPath);
  } else {
    await fs.writeFile(envPath, envTemplate, "utf8");
    created.push(envPath);
  }

  if (await fileExists(envExamplePath)) {
    skipped.push(envExamplePath);
  } else {
    await fs.writeFile(envExamplePath, envExampleTemplate, "utf8");
    created.push(envExamplePath);
  }

  if (await fileExists(ignorePath)) {
    skipped.push(ignorePath);
  } else {
    await fs.writeFile(ignorePath, getDefaultAthleteIgnoreContent(), "utf8");
    created.push(ignorePath);
  }

  return {
    created,
    skipped,
  };
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function buildProjectEnvTemplate(example: boolean): string {
  const athleteApiKeyLine = example ? "ATHLETE_API_KEY=replace-with-your-key" : "ATHLETE_API_KEY=replace-with-your-key";

  return [
    "# Athlete CLI env template",
    example
      ? "# Copy this file to .athlete/.env and fill in the real secrets locally."
      : "# Keep real secrets in this file only.",
    example
      ? "# Commit this file, but do not commit .athlete/.env."
      : "# Commit .athlete/.env.example, but do not commit .athlete/.env.",
    "# Keep only one active ATHLETE provider/model block below.",
    "",
    "# Active default: DeepSeek official",
    athleteApiKeyLine,
    "ATHLETE_BASE_URL=https://api.deepseek.com",
    "ATHLETE_MODEL=deepseek-reasoner",
    "",
    "# Playwright MCP defaults for this repo",
    "ATHLETE_MCP_ENABLED=1",
    "ATHLETE_MCP_PLAYWRIGHT_ENABLED=1",
    "ATHLETE_MCP_PLAYWRIGHT_BROWSER=chrome",
    "ATHLETE_MCP_PLAYWRIGHT_OUTPUT_MODE=file",
    "ATHLETE_MCP_PLAYWRIGHT_SAVE_SESSION=1",
    "",
    "# Telegram private-chat gateway",
    "# Keep the whitelist explicit. Empty whitelist means nobody can control the bot.",
    "ATHLETE_TELEGRAM_TOKEN=replace-with-your-bot-token",
    "ATHLETE_TELEGRAM_ALLOWED_USER_IDS=123456789",
    "# ATHLETE_TELEGRAM_API_BASE_URL=https://api.telegram.org",
    "# ATHLETE_TELEGRAM_POLLING_TIMEOUT_SECONDS=50",
    "# ATHLETE_TELEGRAM_POLLING_LIMIT=100",
    "# ATHLETE_TELEGRAM_POLLING_RETRY_BACKOFF_MS=1000",
    "# ATHLETE_TELEGRAM_MESSAGE_CHUNK_CHARS=3500",
    "# ATHLETE_TELEGRAM_TYPING_INTERVAL_MS=4000",
    "# ATHLETE_TELEGRAM_DELIVERY_MAX_RETRIES=6",
    "# ATHLETE_TELEGRAM_DELIVERY_BASE_DELAY_MS=1000",
    "# ATHLETE_TELEGRAM_DELIVERY_MAX_DELAY_MS=30000",
    "",
    "# MinerU standard API",
    "# Standard API uses Authorization: Bearer <token>",
    "MINERU_API_TOKEN=replace-with-your-token",
    "MINERU_BASE_URL=https://mineru.net/api/v4",
    "MINERU_MODEL_VERSION=vlm",
    "MINERU_LANGUAGE=ch",
    "MINERU_ENABLE_TABLE=true",
    "MINERU_ENABLE_FORMULA=true",
    "MINERU_POLL_INTERVAL_MS=2000",
    "MINERU_TIMEOUT_MS=300000",
    "",
    "# Backup example: SiliconFlow + DeepSeek V3.2",
    "# ATHLETE_API_KEY=replace-with-your-key",
    "# ATHLETE_BASE_URL=https://api.siliconflow.cn/v1",
    "# ATHLETE_MODEL=deepseek-ai/DeepSeek-V3.2",
    "",
    "# Backup example: SiliconFlow + MiniMax M2.5",
    "# ATHLETE_API_KEY=replace-with-your-key",
    "# ATHLETE_BASE_URL=https://api.siliconflow.cn/v1",
    "# ATHLETE_MODEL=Pro/MiniMaxAI/MiniMax-M2.5",
    "",
    "# Backup example: SiliconFlow + Kimi K2.5",
    "# ATHLETE_API_KEY=replace-with-your-key",
    "# ATHLETE_BASE_URL=https://api.siliconflow.cn/v1",
    "# ATHLETE_MODEL=Pro/moonshotai/Kimi-K2.5",
    "",
  ].join("\n");
}
