import type { Command } from "commander";

import { probeProviderConnection } from "../../agent/provider/connection.js";
import { resolveProjectRoots } from "../../context/repoRoots.js";
import { formatObservabilityDoctorReport } from "../../observability/doctor.js";
import { buildObservabilityReport } from "../../observability/report.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";

export function registerDoctorCommand(
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
  const doctorCommand = program
    .command("doctor")
    .description("Check local setup and validate the API connection.")
    .action(async () => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());

      ui.heading("Deadmouse doctor");
      ui.info(`config: ${runtime.paths.configFile}`);
      ui.info(`provider: ${runtime.config.provider}`);
      ui.info(`model: ${runtime.config.model}`);
      ui.info(`baseUrl: ${runtime.config.baseUrl}`);
      ui.info(`mode: ${runtime.config.mode}`);

      if (!runtime.config.apiKey.trim()) {
        throw new Error(
          "用户可修复错误：未找到 API key。请先在当前项目的 `.deadmouse/.env` 里设置 `DEADMOUSE_API_KEY`，再重新运行 `deadmouse doctor`。",
        );
      }

      const diagnosis = await probeProviderConnection({
        provider: runtime.config.provider,
        model: runtime.config.model,
        baseUrl: runtime.config.baseUrl,
        apiKey: runtime.config.apiKey,
      });
      if (diagnosis.kind === "ok") {
        ui.success(`Provider reachable. models=${diagnosis.models}`);
        if (diagnosis.resolvedBaseUrl !== runtime.config.baseUrl) {
          ui.info(`resolvedBaseUrl: ${diagnosis.resolvedBaseUrl}`);
        }
        return;
      }

      throw new Error(diagnosis.message);
    });

  doctorCommand
    .command("observability")
    .description("Show recent operator observability files, failures, crashes, and slow events.")
    .action(async () => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const projectRoots = await resolveProjectRoots(runtime.cwd).catch(() => ({
        rootDir: runtime.cwd,
        stateRootDir: runtime.cwd,
      }));
      const report = await buildObservabilityReport(projectRoots.stateRootDir);
      for (const line of formatObservabilityDoctorReport(report)) {
        ui.plain(line);
      }
    });
}

