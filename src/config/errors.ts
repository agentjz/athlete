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
      `配置错误：无法解析 ${configFile}。`,
      "这个文件不是合法 JSON。",
      "请修复它，或 delete / rebuild 这个文件后重新运行 `athlete config set ...`。",
    ].join(" "),
    { cause },
  );
}

export function createInvalidConfigShapeError(configFile: string): ConfigFileError {
  return new ConfigFileError(
    "invalid_shape",
    configFile,
    [
      `配置错误：${configFile} 必须是一个 JSON object。`,
      "请修复它，或 delete / rebuild 这个文件后重新运行 `athlete config set ...`。",
    ].join(" "),
  );
}

export function createUnsupportedConfigSchemaError(configFile: string, receivedVersion: unknown, expectedVersion: number): ConfigFileError {
  return new ConfigFileError(
    "unsupported_schema",
    configFile,
    [
      `配置错误：${configFile} 的 schemaVersion=${String(receivedVersion)}，当前 CLI 只支持 schemaVersion=${expectedVersion}。`,
      "请 delete / rebuild 这个文件，再重新运行 `athlete config set ...`。",
    ].join(" "),
  );
}
