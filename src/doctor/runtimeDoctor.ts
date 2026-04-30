import { resolveProviderCapabilities } from "../agent/provider.js";
import { createRuntimeCapabilityRegistry } from "../capabilities/registry.js";
import { discoverCapabilityPackages } from "../capabilities/packages/discovery.js";
import { resolveMcpServerDefinitions } from "../capabilities/mcp/config.js";
import { createToolRegistry } from "../capabilities/tools/core/registry.js";
import { discoverSkills } from "../capabilities/skills/discovery.js";
import { SessionStore, type SessionStoreLike } from "../agent/session/store.js";
import { ExecutionStore } from "../execution/store.js";
import { diagnoseCapabilityPackages, type CapabilityPackageDiagnosisReport } from "../protocol/package.js";
import { listAgentTraceSessions } from "../trace/store.js";
import type { ModelCapabilityProfile } from "../agent/modelProfile.js";
import type { ProjectIgnoreRule, RuntimeConfig } from "../types.js";
import { buildRuntimeRecoveryFactSummary, type RuntimeRecoveryFactSummary } from "./recoveryFacts.js";

export interface RuntimeDoctorReport {
  status: "ok" | "warning" | "error";
  generatedAt: string;
  rootDir: string;
  provider: {
    provider: string;
    model: string;
    wireApi: string;
    modelProfile: ModelCapabilityProfile;
  };
  capabilities: CapabilityPackageDiagnosisReport;
  mcp: {
    status: "disabled" | "empty" | "configured";
    configured: number;
    enabled: number;
    disabled: number;
    servers: Array<{
      name: string;
      transport: string;
      enabled: boolean;
      toolFilterCount: number;
      timeoutMs: number;
    }>;
  };
  skills: {
    status: "ok" | "warning";
    count: number;
    names: string[];
    findings: string[];
  };
  trace: {
    status: "empty" | "ok";
    sessions: number;
    events: number;
    latestSessionId?: string;
    latestUpdatedAt?: string;
  };
  execution: {
    status: "empty" | "ok" | "warning";
    total: number;
    active: number;
    closed: number;
    failed: number;
  };
  recovery: RuntimeRecoveryFactSummary;
}

export async function buildRuntimeDoctorReport(input: {
  rootDir: string;
  cwd: string;
  config: RuntimeConfig;
  sessionStore?: SessionStoreLike;
  ignoreRules?: ProjectIgnoreRule[];
}): Promise<RuntimeDoctorReport> {
  const providerCapabilities = resolveProviderCapabilities({
    provider: input.config.provider,
    model: input.config.model,
  });
  const toolRegistry = createToolRegistry();
  const skills = await discoverSkills(input.rootDir, input.cwd, input.ignoreRules ?? []).catch((error) => {
    throw new Error(`Skill diagnosis failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  const installedPackages = await discoverCapabilityPackages(input.rootDir);
  const capabilityRegistry = createRuntimeCapabilityRegistry({
    skills,
    toolEntries: toolRegistry.entries,
    mcpConfig: input.config.mcp,
    packageProviders: [{ listCapabilityPackages: () => installedPackages }],
  });
  const capabilityDiagnosis = diagnoseCapabilityPackages([
    ...capabilityRegistry.list(),
    ...installedPackages.filter((pkg) => !pkg.governance.enabled || !pkg.governance.installed),
  ]);
  const mcp = buildMcpDiagnosis(input.config);
  const trace = await buildTraceDiagnosis(input.rootDir);
  const execution = await buildExecutionDiagnosis(input.rootDir);
  const sessionStore = input.sessionStore ?? new SessionStore(input.config.paths.sessionsDir);
  const recovery = await buildRuntimeRecoveryFactSummary({
    rootDir: input.rootDir,
    sessionStore,
  });
  const skillsDiagnosis = {
    status: "ok" as const,
    count: skills.length,
    names: skills.map((skill) => skill.name).sort(),
    findings: [] as string[],
  };

  const status = [
    capabilityDiagnosis.status,
    recovery.status,
    execution.status,
    skillsDiagnosis.status,
  ].includes("error")
    ? "error"
    : [
        capabilityDiagnosis.status,
        recovery.status,
        execution.status,
        skillsDiagnosis.status,
      ].includes("warning")
      ? "warning"
      : "ok";

  return {
    status,
    generatedAt: new Date().toISOString(),
    rootDir: input.rootDir,
    provider: {
      provider: providerCapabilities.provider,
      model: providerCapabilities.model,
      wireApi: providerCapabilities.wireApi,
      modelProfile: providerCapabilities.modelProfile,
    },
    capabilities: capabilityDiagnosis,
    mcp,
    skills: skillsDiagnosis,
    trace,
    execution,
    recovery,
  };
}

export function formatRuntimeDoctorReport(report: RuntimeDoctorReport): string[] {
  const lines = [
    `Runtime doctor: ${report.status}`,
    `root: ${report.rootDir}`,
    `model profile: ${report.provider.provider}/${report.provider.model} tier=${report.provider.modelProfile.tier} wire=${report.provider.wireApi} toolUse=${report.provider.modelProfile.toolUseReliability} context=${report.provider.modelProfile.contextPolicy}`,
    `capability packages: status=${report.capabilities.status} total=${report.capabilities.total} enabled=${report.capabilities.enabled} disabled=${report.capabilities.disabled}`,
    `capability kinds: ${formatCounts(report.capabilities.byKind)}`,
    `MCP: ${report.mcp.status} configured=${report.mcp.configured} enabled=${report.mcp.enabled} disabled=${report.mcp.disabled}`,
    `skills: status=${report.skills.status} count=${report.skills.count}`,
    `trace sessions: status=${report.trace.status} sessions=${report.trace.sessions} events=${report.trace.events}${report.trace.latestSessionId ? ` latest=${report.trace.latestSessionId}` : ""}`,
    `execution ledger: status=${report.execution.status} total=${report.execution.total} active=${report.execution.active} closed=${report.execution.closed} failed=${report.execution.failed}`,
    formatRecoveryFacts(report.recovery),
  ];

  for (const finding of report.capabilities.findings.slice(0, 12)) {
    lines.push(`capability ${finding.severity}: ${finding.packageId ? `${finding.packageId}: ` : ""}${finding.message}`);
  }
  for (const finding of report.recovery.findings.slice(0, 8)) {
    lines.push(`recovery warning: ${finding}`);
  }

  return lines;
}

function buildMcpDiagnosis(config: RuntimeConfig): RuntimeDoctorReport["mcp"] {
  const servers = resolveMcpServerDefinitions(config.mcp);
  const enabled = servers.filter((server) => server.enabled).length;
  return {
    status: !config.mcp.enabled ? "disabled" : servers.length === 0 ? "empty" : "configured",
    configured: servers.length,
    enabled,
    disabled: servers.length - enabled,
    servers: servers.map((server) => ({
      name: server.name,
      transport: server.transport,
      enabled: server.enabled,
      toolFilterCount: server.include.length + server.exclude.length,
      timeoutMs: server.timeoutMs,
    })),
  };
}

async function buildTraceDiagnosis(rootDir: string): Promise<RuntimeDoctorReport["trace"]> {
  const sessions = await listAgentTraceSessions(rootDir);
  const events = sessions.reduce((sum, session) => sum + session.eventCount, 0);
  return {
    status: sessions.length === 0 ? "empty" : "ok",
    sessions: sessions.length,
    events,
    latestSessionId: sessions[0]?.sessionId,
    latestUpdatedAt: sessions[0]?.updatedAt,
  };
}

async function buildExecutionDiagnosis(rootDir: string): Promise<RuntimeDoctorReport["execution"]> {
  const executions = await new ExecutionStore(rootDir).list().catch(() => []);
  const active = executions.filter((execution) =>
    execution.status === "queued" || execution.status === "running" || execution.status === "paused",
  ).length;
  const failed = executions.filter((execution) => execution.status === "failed" || execution.status === "aborted").length;
  return {
    status: executions.length === 0 ? "empty" : failed > 0 ? "warning" : "ok",
    total: executions.length,
    active,
    closed: executions.length - active,
    failed,
  };
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0
    ? entries.map(([key, count]) => `${key}=${count}`).join(", ")
    : "none";
}

function formatRecoveryFacts(recovery: RuntimeRecoveryFactSummary): string {
  if (!recovery.latestSession) {
    return `recovery facts: status=${recovery.status} latest=none`;
  }
  return [
    `recovery facts: status=${recovery.status}`,
    `session=${recovery.latestSession.sessionId}`,
    `phase=${recovery.latestSession.checkpointPhase ?? "none"}`,
    `objective=${recovery.latestSession.objective ? "present" : "none"}`,
    `steps=${recovery.latestSession.completedSteps}`,
    `evidence=${recovery.latestSession.evidenceArtifacts}`,
    `traceEvents=${recovery.latestSession.traceEvents}`,
    `activeExecutions=${recovery.latestSession.activeExecutions}`,
  ].join(" ");
}
