export function readToolFailureError(output: string): { message: string; code?: string; details?: unknown } {
  try {
    const parsed = JSON.parse(output) as {
      error?: unknown;
      code?: unknown;
      details?: unknown;
    };
    const message = String(parsed.error ?? output).trim() || "Tool failed.";
    const code = typeof parsed.code === "string" && parsed.code.trim().length > 0 ? parsed.code.trim() : undefined;
    return {
      message,
      code,
      details: parsed.details,
    };
  } catch {
    return {
      message: output.trim() || "Tool failed.",
    };
  }
}
