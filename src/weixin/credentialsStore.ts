import { readJsonFile, writeJsonFileAtomically } from "./storage.js";

export interface WeixinLoginState {
  token: string;
  baseUrl: string;
  cdnBaseUrl: string;
  botId?: string;
  userId?: string;
  connectedAt: string;
  updatedAt: string;
}

export interface WeixinCredentialStoreLike {
  load(): Promise<WeixinLoginState | null>;
  save(state: WeixinLoginState): Promise<void>;
  clear(): Promise<void>;
}

export class FileWeixinCredentialStore implements WeixinCredentialStoreLike {
  constructor(private readonly filePath: string) {}

  async load(): Promise<WeixinLoginState | null> {
    const payload = await readJsonFile<WeixinLoginState | null>(this.filePath, null);
    if (!payload || typeof payload.token !== "string" || !payload.token.trim()) {
      return null;
    }

    return {
      token: payload.token.trim(),
      baseUrl: String(payload.baseUrl ?? "").trim(),
      cdnBaseUrl: String(payload.cdnBaseUrl ?? "").trim(),
      botId: typeof payload.botId === "string" && payload.botId.trim() ? payload.botId.trim() : undefined,
      userId: typeof payload.userId === "string" && payload.userId.trim() ? payload.userId.trim() : undefined,
      connectedAt: String(payload.connectedAt ?? "").trim(),
      updatedAt: String(payload.updatedAt ?? "").trim(),
    };
  }

  async save(state: WeixinLoginState): Promise<void> {
    await writeJsonFileAtomically(this.filePath, {
      token: state.token.trim(),
      baseUrl: state.baseUrl.trim(),
      cdnBaseUrl: state.cdnBaseUrl.trim(),
      ...(state.botId ? { botId: state.botId.trim() } : {}),
      ...(state.userId ? { userId: state.userId.trim() } : {}),
      connectedAt: state.connectedAt,
      updatedAt: state.updatedAt,
    });
  }

  async clear(): Promise<void> {
    await writeJsonFileAtomically(this.filePath, null);
  }
}
