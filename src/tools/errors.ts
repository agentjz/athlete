export class ToolExecutionError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: { code: string; details?: Record<string, unknown> }) {
    super(message);
    this.name = "ToolExecutionError";
    this.code = options.code;
    this.details = options.details;
  }
}
