import { buildCompressedContextRequest } from "./compression/builder.js";
import type { ContextRuntimeRequest, ContextRuntimeRequestInput } from "./types.js";

export function buildContextRuntimeRequest(
  input: ContextRuntimeRequestInput,
): ContextRuntimeRequest {
  return buildCompressedContextRequest(input.prompt, input.session.messages, input.config);
}
