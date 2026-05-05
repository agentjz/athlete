import type { Command } from "commander";
import { spawn } from "node:child_process";
import fs from "node:fs";

import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { startWorkbenchServer } from "../../web/server.js";

export function registerWebCommand(
  program: Command,
  options: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
  },
): void {
  program
    .command("web")
    .description("Open the local Kitty web workbench.")
    .option("--host <host>", "Host to bind the local workbench server.", "127.0.0.1")
    .option("-p, --port <port>", "Port to bind. Defaults to an available port.", parsePort)
    .option("--super", "Run web workbench turns in super mode.")
    .action(async (commandOptions: { host: string; port?: number; super?: boolean }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const handle = await startWorkbenchServer({
        cwd: runtime.cwd,
        config: runtime.config,
        host: commandOptions.host,
        port: commandOptions.port,
        mode: commandOptions.super ? "super" : "agent",
      });

      writeStdoutLine(`Kitty web workbench: ${handle.url}`);
      writeStdoutLine("Press Ctrl+C to stop.");
      openEdgeInPrivate(handle.url);

      await waitForShutdown(handle.close);
    });
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Port must be an integer between 0 and 65535.");
  }
  return port;
}

function openEdgeInPrivate(url: string): void {
  const command = resolveEdgeCommand();
  const child = spawn(command, ["--inprivate", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => undefined);
  child.unref();
}

function resolveEdgeCommand(): string {
  const candidates = [
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe` : "",
    process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe` : "",
    process.env["PROGRAMFILES(X86)"] ? `${process.env["PROGRAMFILES(X86)"]}\\Microsoft\\Edge\\Application\\msedge.exe` : "",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? "msedge.exe";
}

function waitForShutdown(close: () => Promise<void>): Promise<void> {
  let closing = false;
  return new Promise((resolve, reject) => {
    const stop = () => {
      if (closing) {
        return;
      }
      closing = true;
      close().then(resolve, reject);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
