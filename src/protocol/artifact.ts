export const ARTIFACT_PROTOCOL = "deadmouse.artifact.v1" as const;

export type ArtifactKind = "file" | "command" | "log" | "observation" | "execution";

export interface ArtifactRef {
  protocol: typeof ARTIFACT_PROTOCOL;
  kind: ArtifactKind;
  ref: string;
  description: string;
  createdAt: string;
}

export function createArtifactRef(input: {
  kind: ArtifactKind;
  ref: string;
  description?: string;
  createdAt?: string;
}): ArtifactRef {
  return {
    protocol: ARTIFACT_PROTOCOL,
    kind: input.kind,
    ref: input.ref.trim(),
    description: input.description?.trim() || input.ref.trim(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
