import { formatPromptBlock } from "../prompt/format.js";
import { INTP_PROFILE, INTP_PROFILE_ID } from "./intp.js";
import type { AgentProfile } from "./types.js";

const PROFILES = new Map<string, AgentProfile>([
  [INTP_PROFILE.id, INTP_PROFILE],
]);

export function getDefaultAgentProfile(): AgentProfile {
  return resolveAgentProfile(INTP_PROFILE_ID);
}

export function resolveAgentProfile(id: string | undefined): AgentProfile {
  const normalized = String(id ?? INTP_PROFILE_ID).trim() || INTP_PROFILE_ID;
  const profile = PROFILES.get(normalized);
  if (!profile) {
    throw new Error(`Unknown agent profile: ${normalized}.`);
  }

  return profile;
}

export function buildProfilePersonaPromptBlocks(profile: AgentProfile = getDefaultAgentProfile()): string[] {
  return profile.personaBlocks.map((block) => formatPromptBlock(block.title, block.content));
}

export function listAgentProfiles(): AgentProfile[] {
  return [...PROFILES.values()];
}
