import fs from "node:fs/promises";
import path from "node:path";

import type { ClientConfig } from "@openilink/openilink-sdk-node";
import { decode as decodeSilk } from "silk-wasm";

import type { WeixinLoginState } from "./credentialsStore.js";
import type { WeixinPollingBatch, WeixinRawMessage } from "./types.js";

export interface WeixinTypingConfig {
  typingTicket: string | null;
}

export interface WeixinQrLoginOptions {
  timeoutMs: number;
  onQrCode?: (content: string) => void;
  onScanned?: () => void;
  onExpired?: (attempt: number, maxAttempts: number) => void;
}

export interface WeixinTextSendRequest {
  userId: string;
  contextToken: string;
  text: string;
}

export interface WeixinMediaSendRequest {
  userId: string;
  contextToken: string;
  filePath: string;
  caption?: string;
}

export interface WeixinFileSendRequest extends WeixinMediaSendRequest {
  fileName?: string;
}

export interface WeixinClientLike {
  loginWithQr(options: WeixinQrLoginOptions): Promise<WeixinLoginState>;
  getUpdates(syncBuf?: string | null, timeoutMs?: number, signal?: AbortSignal): Promise<WeixinPollingBatch>;
  getTypingConfig(userId: string, contextToken: string): Promise<WeixinTypingConfig>;
  sendTyping(userId: string, typingTicket: string, status: number): Promise<void>;
  sendText(request: WeixinTextSendRequest): Promise<void>;
  sendImage(request: WeixinMediaSendRequest): Promise<void>;
  sendVideo(request: WeixinMediaSendRequest): Promise<void>;
  sendFile(request: WeixinFileSendRequest): Promise<void>;
  downloadMedia(media: { encrypt_query_param?: string; aes_key?: string; full_url?: string } | undefined): Promise<Uint8Array>;
  downloadVoice(voice: { media?: { encrypt_query_param?: string; aes_key?: string; full_url?: string }; sample_rate?: number } | undefined): Promise<Uint8Array>;
}

export const WEIXIN_TYPING_STATUS = 1;

export class OpenILinkWeixinClient implements WeixinClientLike {
  private clientPromise: Promise<OpenILinkRuntimeClient> | null = null;
  private readonly runtimeOptions: {
    token?: string;
    baseUrl: string;
    cdnBaseUrl: string;
    routeTag?: string;
    fetchImpl?: typeof fetch;
  };

  constructor(options: {
    token?: string;
    baseUrl: string;
    cdnBaseUrl: string;
    routeTag?: string;
    fetchImpl?: typeof fetch;
  }) {
    this.runtimeOptions = options;
  }

  async loginWithQr(options: WeixinQrLoginOptions): Promise<WeixinLoginState> {
    const client = await this.getClient();
    const result = await client.loginWithQr(
      {
        on_qrcode: options.onQrCode,
        on_scanned: options.onScanned,
        on_expired: options.onExpired,
      },
      options.timeoutMs,
    );

    if (!result.connected || !result.bot_token) {
      throw new Error(result.message || "OpeniLink QR login failed.");
    }

    const now = new Date().toISOString();
    return {
      token: result.bot_token,
      baseUrl: result.base_url?.trim() || client.baseUrl.trim(),
      cdnBaseUrl: client.cdnBaseUrl.trim(),
      botId: result.bot_id?.trim() || undefined,
      userId: result.user_id?.trim() || undefined,
      connectedAt: now,
      updatedAt: now,
    };
  }

  async getUpdates(syncBuf?: string | null, timeoutMs?: number): Promise<WeixinPollingBatch> {
    const client = await this.getClient();
    const response = await client.getUpdates(syncBuf ?? undefined, timeoutMs);
    return {
      messages: Array.isArray(response.msgs) ? (response.msgs as WeixinRawMessage[]) : [],
      syncBuf: typeof response.sync_buf === "string" && response.sync_buf.trim() ? response.sync_buf : null,
      longPollingTimeoutMs:
        typeof response.longpolling_timeout_ms === "number" && Number.isFinite(response.longpolling_timeout_ms)
          ? Math.trunc(response.longpolling_timeout_ms)
          : undefined,
    };
  }

  async getTypingConfig(userId: string, contextToken: string): Promise<WeixinTypingConfig> {
    const client = await this.getClient();
    const response = await client.getConfig(userId, contextToken);
    return {
      typingTicket:
        typeof response.typing_ticket === "string" && response.typing_ticket.trim()
          ? response.typing_ticket
          : null,
    };
  }

  async sendTyping(userId: string, typingTicket: string, status: number): Promise<void> {
    const client = await this.getClient();
    await client.sendTyping(userId, typingTicket, status);
  }

  async sendText(request: WeixinTextSendRequest): Promise<void> {
    const client = await this.getClient();
    await client.sendText(request.userId, request.text, request.contextToken);
  }

  async sendImage(request: WeixinMediaSendRequest): Promise<void> {
    await this.sendMedia(request);
  }

  async sendVideo(request: WeixinMediaSendRequest): Promise<void> {
    await this.sendMedia(request);
  }

  async sendFile(request: WeixinFileSendRequest): Promise<void> {
    await this.sendMedia(request, request.fileName);
  }

  async downloadMedia(media: { encrypt_query_param?: string; aes_key?: string; full_url?: string } | undefined): Promise<Uint8Array> {
    const client = await this.getClient();
    return client.downloadMedia(media);
  }

  async downloadVoice(voice: { media?: { encrypt_query_param?: string; aes_key?: string; full_url?: string }; sample_rate?: number } | undefined): Promise<Uint8Array> {
    const client = await this.getClient();
    return client.downloadVoice(voice);
  }

  private async sendMedia(request: WeixinMediaSendRequest, fileNameOverride?: string): Promise<void> {
    const client = await this.getClient();
    const fileName = fileNameOverride?.trim() || path.basename(request.filePath);
    const bytes = await fs.readFile(request.filePath);
    await client.sendMediaFile(
      request.userId,
      request.contextToken,
      bytes,
      fileName,
      request.caption?.trim() || undefined,
    );
  }

  private async getClient(): Promise<OpenILinkRuntimeClient> {
    this.clientPromise ??= this.createClient();
    return this.clientPromise;
  }

  private buildConfig(options: {
    baseUrl: string;
    cdnBaseUrl: string;
    routeTag?: string;
    fetchImpl?: typeof fetch;
  }): ClientConfig {
    return {
      base_url: options.baseUrl,
      cdn_base_url: options.cdnBaseUrl,
      route_tag: options.routeTag?.trim() || undefined,
      fetch_impl: options.fetchImpl,
      silk_decoder: async (silkData, sampleRate) => {
        const decoded = await decodeSilk(silkData, sampleRate);
        return decoded.data;
      },
    };
  }

  private async createClient(): Promise<OpenILinkRuntimeClient> {
    const sdk = await loadOpenILinkSdk();
    return new sdk.Client(this.runtimeOptions.token ?? "", this.buildConfig(this.runtimeOptions));
  }
}

interface OpenILinkRuntimeClient {
  baseUrl: string;
  cdnBaseUrl: string;
  loginWithQr(
    callbacks?: {
      on_qrcode?: (url: string) => void;
      on_scanned?: () => void;
      on_expired?: (attempt: number, maxAttempts: number) => void;
    },
    timeoutMs?: number,
  ): Promise<{
    connected: boolean;
    bot_token?: string;
    bot_id?: string;
    base_url?: string;
    user_id?: string;
    message: string;
  }>;
  getUpdates(syncBuf?: string, timeoutMs?: number): Promise<{
    msgs?: unknown[];
    sync_buf?: string;
    longpolling_timeout_ms?: number;
  }>;
  getConfig(userId: string, contextToken: string): Promise<{
    typing_ticket?: string;
  }>;
  sendTyping(userId: string, typingTicket: string, status: number): Promise<void>;
  sendText(userId: string, text: string, contextToken: string): Promise<unknown>;
  sendMediaFile(
    userId: string,
    contextToken: string,
    data: Uint8Array | ArrayBuffer,
    fileName: string,
    caption?: string,
  ): Promise<unknown>;
  downloadMedia(media: { encrypt_query_param?: string; aes_key?: string; full_url?: string } | undefined): Promise<Uint8Array>;
  downloadVoice(voice: { media?: { encrypt_query_param?: string; aes_key?: string; full_url?: string }; sample_rate?: number } | undefined): Promise<Uint8Array>;
}

let openILinkSdkPromise: Promise<{ Client: new (token?: string, config?: ClientConfig) => OpenILinkRuntimeClient }> | null = null;

async function loadOpenILinkSdk(): Promise<{ Client: new (token?: string, config?: ClientConfig) => OpenILinkRuntimeClient }> {
  openILinkSdkPromise ??=
    import("@openilink/openilink-sdk-node") as unknown as Promise<{ Client: new (token?: string, config?: ClientConfig) => OpenILinkRuntimeClient }>;
  return openILinkSdkPromise;
}
