import type { RuntimeUiChannel } from "./events.js";

export interface RuntimeUiChannelIdentity {
  channel: RuntimeUiChannel;
  label: string;
}

export type RuntimeUiLineRole = "assistant" | "reasoning";

export const RUNTIME_UI_CHANNEL_IDENTITIES: Record<RuntimeUiChannel, RuntimeUiChannelIdentity> = {
  lead: {
    channel: "lead",
    label: "决策主脑",
  },
  dream: {
    channel: "dream",
    label: "做梦",
  },
  workflow: {
    channel: "workflow",
    label: "工作流",
  },
  subagent: {
    channel: "subagent",
    label: "子代理",
  },
  team: {
    channel: "team",
    label: "队友",
  },
  background: {
    channel: "background",
    label: "后台",
  },
  system: {
    channel: "system",
    label: "系统",
  },
};

export function getRuntimeUiChannelIdentity(channel: RuntimeUiChannel): RuntimeUiChannelIdentity {
  return RUNTIME_UI_CHANNEL_IDENTITIES[channel];
}

export function formatRuntimeUiRoleLabel(channel: RuntimeUiChannel, role: RuntimeUiLineRole): string {
  const identity = getRuntimeUiChannelIdentity(channel);
  if (role === "reasoning") {
    return `${identity.label}思考`;
  }
  return identity.label;
}
