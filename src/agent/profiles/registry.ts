import { formatPromptBlock } from "../prompt/format.js";
import { GROK_PROFILE } from "./grok/index.js";
import { INTP_PROFILE } from "./intp/index.js";
import type { AgentProfile } from "./types.js";

const PROFILES = new Map<string, AgentProfile>([
  [INTP_PROFILE.id, INTP_PROFILE],
  [GROK_PROFILE.id, GROK_PROFILE],
]);

export function resolveAgentProfile(id: string): AgentProfile {
  const normalized = id.trim();
  if (!normalized) {
    throw new Error("Missing agent profile. Set DEADMOUSE_PROFILE explicitly.");
  }

  const profile = PROFILES.get(normalized);
  if (!profile) {
    throw new Error(`Unknown agent profile: ${normalized}.`);
  }

  return profile;
}

export function buildProfilePersonaPromptBlocks(profile: AgentProfile): string[] {
  return profile.personaBlocks.map((block) => formatPromptBlock(block.title, block.content));
}

export function listAgentProfiles(): AgentProfile[] {
  return [...PROFILES.values()];
}
