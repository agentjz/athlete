export type ConfigFileErrorKind = "invalid_json" | "invalid_shape" | "unsupported_schema";

export class ConfigFileError extends Error {
  readonly kind: ConfigFileErrorKind;
  readonly configFile: string;

  constructor(kind: ConfigFileErrorKind, configFile: string, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ConfigFileError";
    this.kind = kind;
    this.configFile = configFile;

    if (options && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export function createInvalidConfigJsonError(configFile: string, cause?: unknown): ConfigFileError {
  return new ConfigFileError(
    "invalid_json",
    configFile,
    [
      `Config error: unable to parse ${configFile}.`,
      "This file is not valid JSON.",
      "Fix it, or delete/rebuild this file and run `deadmouse config set ...` again.",
    ].join(" "),
    { cause },
  );
}

export function createInvalidConfigShapeError(configFile: string): ConfigFileError {
  return new ConfigFileError(
    "invalid_shape",
    configFile,
    [
      `Config error: ${configFile} must be a JSON object.`,
      "Fix it, or delete/rebuild this file and run `deadmouse config set ...` again.",
    ].join(" "),
  );
}

export function createUnsupportedConfigSchemaError(configFile: string, receivedVersion: unknown, expectedVersion: number): ConfigFileError {
  return new ConfigFileError(
    "unsupported_schema",
    configFile,
    [
      `Config error: ${configFile} has schemaVersion=${String(receivedVersion)}, but the current CLI only supports schemaVersion=${expectedVersion}.`,
      "Delete/rebuild this file, then run `deadmouse config set ...` again.",
    ].join(" "),
  );
}
