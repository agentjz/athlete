import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { createStaticCapabilityAdapter } from "../../src/protocol/adapter.js";
import { createAssignmentContract, formatAssignmentContract } from "../../src/protocol/assignment.js";
import { createCapabilityProfile } from "../../src/protocol/capability.js";
import { formatCloseoutInstruction, normalizeCloseoutText } from "../../src/protocol/closeout.js";
import { getBackgroundCapabilityPackage } from "../../src/capabilities/background/capabilityAdapter.js";
import { listMcpCapabilityPackages } from "../../src/capabilities/mcp/capabilityAdapter.js";
import { normalizeMcpConfig } from "../../src/capabilities/mcp/config.js";
import {
  CAPABILITY_MANIFEST_PROTOCOL,
  createCapabilityPackageFromManifest,
  createCapabilityPackagesFromManifests,
} from "../../src/protocol/manifest.js";
import {
  CAPABILITY_MANIFEST_BUNDLE_PROTOCOL,
  createCapabilityAdapterFromManifestBundle,
  parseCapabilityManifestBundle,
} from "../../src/protocol/manifestBundle.js";
import {
  assertCapabilityPackageAcceptsAssignment,
  createCapabilityPackage,
  formatCapabilityPackageForLead,
} from "../../src/protocol/package.js";
import { CapabilityRegistry, formatCapabilityRegistryForLead } from "../../src/protocol/registry.js";
import { snapshotExecutionWakeSignal, publishExecutionWakeSignal } from "../../src/protocol/wakeSignal.js";
import { createRuntimeCapabilityRegistry } from "../../src/capabilities/registry.js";
import { listSkillCapabilityPackages } from "../../src/capabilities/skills/capabilityAdapter.js";
import { listSubagentCapabilityPackages } from "../../src/capabilities/subagent/profiles.js";
import { getTeamCapabilityPackage } from "../../src/capabilities/team/profiles.js";
import { listToolCapabilityPackages } from "../../src/capabilities/tools/core/capabilityAdapter.js";
import { taskTool } from "../../src/capabilities/tools/packages/tasks/taskTool.js";
import { spawnTeammateTool } from "../../src/capabilities/tools/packages/team/spawnTeammateTool.js";
import { listWorkflowCapabilityPackages } from "../../src/capabilities/workflows/registry.js";
import type { LoadedSkill } from "../../src/capabilities/skills/types.js";
import type { ToolRegistryEntry } from "../../src/capabilities/tools/core/types.js";
import { createTempWorkspace } from "../helpers.js";

test("protocol platform keeps capability, assignment, and closeout as generic contracts", () => {
  const capability = createCapabilityProfile({
    kind: "workflow",
    id: "generic-workflow",
    name: "Generic workflow",
    description: "Reusable method selected by Lead.",
    bestFor: ["repeatable work"],
    notFor: ["automatic strategy"],
    extensionPoint: "test",
  });
  const pkg = createCapabilityPackage({
    profile: capability,
    source: {
      kind: "workflow",
      builtIn: true,
    },
    adapter: {
      kind: "workflow",
      id: "generic-workflow.adapter",
      description: "test adapter",
    },
    port: {
      runner: { type: "workflow", invocation: "Lead-selected workflow test runner." },
      permissionBoundary: {
        world: "test workflow lane",
        autonomy: "test workflow owns internal method",
        read: ["test input"],
        write: ["test artifact"],
        forbidden: ["machine strategy"],
      },
      foregroundOutput: {
        mode: "inline_events",
        sink: "runtime-ui",
        section: "workflow",
        streams: ["progress", "closeout"],
      },
      artifacts: [{ kind: "execution", name: "test-execution", description: "test execution", required: true }],
      closeout: {
        required: true,
        contract: "CloseoutContract",
        requiredEvidence: ["test evidence"],
        mergeProposal: "none",
      },
      wake: {
        required: true,
        reasons: ["completed", "failed"],
      },
    },
  });
  const assignment = createAssignmentContract({
    capabilityId: pkg.packageId,
    objective: "Inspect the generic protocol boundary.",
    scope: "Protocol only.",
    expectedOutput: "CloseoutContract.",
    createdBy: "lead",
  });

  assert.equal(pkg.protocol, "kitty.capability-package");
  assert.equal(pkg.version, "1.0.0");
  assert.equal(pkg.runner.leadWaitPolicy.lead, "while_execution_active");
  assert.equal(pkg.runner.leadWaitPolicy.wake, "required");
  assert.match(formatCapabilityPackageForLead(pkg), /workflow\.generic-workflow \[workflow\]/);
  assert.doesNotThrow(() => assertCapabilityPackageAcceptsAssignment(pkg, assignment));
  assert.throws(
    () => assertCapabilityPackageAcceptsAssignment(pkg, { ...assignment, capabilityId: "other.package" }),
    /not package 'workflow\.generic-workflow'/,
  );
  assert.match(formatAssignmentContract(assignment), /kitty\.assignment/);
  assert.match(formatCloseoutInstruction(), /kitty\.closeout/);
  assert.match(normalizeCloseoutText("raw result"), /status: blocked/);
});

test("capability registry explains availability without creating machine intent", () => {
  const capability = createCapabilityProfile({
    kind: "team",
    id: "teammate",
    name: "Teammate",
    description: "Lead-selected teammate.",
    extensionPoint: "test",
  });
  const registry = formatCapabilityRegistryForLead([
    {
      listCapabilityPackages: () => [createCapabilityPackage({
        profile: capability,
        source: {
          kind: "team",
          builtIn: true,
        },
        adapter: {
          kind: "agent",
          id: "team.adapter",
          description: "test adapter",
        },
        port: {
          runner: { type: "worker", invocation: "Lead-selected worker test runner." },
          permissionBoundary: {
            world: "test worker lane",
            autonomy: "test worker owns assignment",
            read: ["test input"],
            write: ["test artifact"],
            forbidden: ["machine strategy"],
          },
          foregroundOutput: {
            mode: "inline_events",
            sink: "runtime-ui",
            section: "team",
            streams: ["progress", "closeout"],
          },
          artifacts: [{ kind: "execution", name: "test-execution", description: "test execution", required: true }],
          closeout: {
            required: true,
            contract: "CloseoutContract",
            requiredEvidence: ["test evidence"],
            mergeProposal: "none",
          },
          wake: {
            required: true,
            reasons: ["completed", "failed"],
          },
        },
      })],
    },
  ]);

  assert.match(registry, /Presentation order and summaries are options for Lead, not machine intent/);
  assert.match(registry, /kitty\.capability-port/);
  assert.match(registry, /CloseoutContract/);
});

test("capability packages freeze machine permissions away from strategy decisions", () => {
  const profile = createCapabilityProfile({
    kind: "external_agent",
    id: "external.codex",
    name: "External Codex",
    description: "External CLI agent adapter.",
    extensionPoint: "external",
  });
  const pkg = createCapabilityPackage({
    profile,
    source: {
      kind: "external_agent",
      builtIn: false,
    },
    adapter: {
      kind: "external",
      id: "external.codex.adapter",
      description: "External adapter.",
    },
    port: {
      runner: { type: "external_cli", invocation: "Lead-selected external CLI runner." },
      permissionBoundary: {
        world: "external test lane",
        autonomy: "external agent owns internal loop",
        read: ["test input"],
        write: ["test artifacts"],
        forbidden: ["machine strategy"],
      },
      foregroundOutput: {
        mode: "foreground_stream",
        sink: "runtime-ui",
        section: "external",
        streams: ["stdout", "stderr", "closeout"],
      },
      artifacts: [{ kind: "execution", name: "test-execution", description: "test execution", required: true }],
      closeout: {
        required: true,
        contract: "CloseoutContract",
        requiredEvidence: ["test evidence"],
        mergeProposal: "optional",
      },
      wake: {
        required: true,
        reasons: ["completed", "failed"],
      },
    },
  });

  assert.equal(pkg.machinePermissions.exposeToLead, true);
  assert.equal(pkg.machinePermissions.executeExplicitAssignment, true);
  assert.equal(pkg.machinePermissions.autoSelect, false);
  assert.equal(pkg.machinePermissions.autoDispatch, false);
  assert.equal(pkg.machinePermissions.decideStrategy, false);
  assert.equal(pkg.port.protocol, "kitty.capability-port");
  assert.equal(pkg.port.autonomyOwner, "ecosystem");
  assert.equal(pkg.port.foregroundOutput.sink, "runtime-ui");
  assert.equal(pkg.port.closeout.contract, "CloseoutContract");
  assert.equal(pkg.runner.leadWaitPolicy.lead, "while_execution_active");
});

test("source adapters register built-in and external surfaces as capability packages without concrete strategy", () => {
  const skill: LoadedSkill = {
    schemaVersion: "skill",
    version: "1.0.0",
    name: "research",
    description: "Research workflow guidance.",
    path: "skills/research/SKILL.md",
    absolutePath: "C:/repo/skills/research/SKILL.md",
    body: "# Research",
    agentKinds: ["lead"],
    roles: [],
    taskTypes: ["research"],
    scenes: ["analysis"],
    triggers: {
      keywords: ["research"],
      patterns: [],
    },
    tools: {
      required: ["read_file"],
      optional: ["search_files"],
      incompatible: [],
    },
  };
  const toolEntry = {
    name: "read_file",
    definition: {
      type: "function",
      function: {
        name: "read_file",
        parameters: {},
      },
    },
    governance: {
      source: "builtin",
      specialty: "filesystem",
      mutation: "read",
      risk: "low",
      destructive: false,
      concurrencySafe: true,
      changeSignal: "none",
      verificationSignal: "none",
      preferredWorkflows: [],
      secondaryInWorkflows: [],
    },
    origin: {
      kind: "builtin",
      sourceId: "builtin:catalog",
    },
    tool: taskTool,
  } as unknown as ToolRegistryEntry;

  const registry = createRuntimeCapabilityRegistry({
    mcpConfig: normalizeMcpConfig({
      enabled: true,
      servers: [
        {
          name: "planner",
          transport: "stdio",
          command: "planner-mcp",
          include: ["summarize"],
        },
      ],
    }),
    skills: [skill],
    toolEntries: [toolEntry],
  });
  const ids = new Set(registry.list().map((item) => item.packageId));

  assert.equal(ids.has("team.teammate"), true);
  assert.equal(ids.has("background.command"), true);
  assert.equal(ids.has("subagent.explore"), true);
  assert.equal(ids.has("workflow.manual-lead-selected"), true);
  assert.equal(ids.has("mcp.planner"), true);
  assert.equal(ids.has("skill.research"), true);
  assert.equal([...ids].some((id) => id.startsWith("tool.builtin.filesystem.read")), true);
  assert.equal(registry.list().every((item) => item.machinePermissions.autoDispatch === false), true);
  assert.equal(registry.resolve("team.teammate").runner.leadWaitPolicy.lead, "while_execution_active");
  assert.equal(registry.resolve("background.command").runner.leadWaitPolicy.lead, "while_execution_active");
  assert.equal(registry.resolve("workflow.manual-lead-selected").runner.leadWaitPolicy.lead, "while_execution_active");
  assert.equal(registry.resolve("workflow.dreaming-loop").source.path, "src/capabilities/workflows/dreamingLoop.ts");
  assert.equal(registry.resolve("skill.research").runner.leadWaitPolicy.lead, "none");
  assert.equal(registry.resolve("mcp.planner").runner.leadWaitPolicy.lead, "none");
});

test("generic workflow registry does not contain Dreaming Loop concrete profile definition", () => {
  const registrySource = fs.readFileSync(path.join(process.cwd(), "src", "capabilities", "workflows", "registry.ts"), "utf8");
  const dreamingLoopSource = fs.readFileSync(path.join(process.cwd(), "src", "capabilities", "workflows", "dreamingLoop.ts"), "utf8");

  assert.doesNotMatch(registrySource, /DREAMING_LOOP_WORKFLOW_PROFILE/);
  assert.doesNotMatch(registrySource, /Dreaming Loop owns round bookkeeping/);
  assert.match(dreamingLoopSource, /DREAMING_LOOP_WORKFLOW_PROFILE/);
  assert.match(dreamingLoopSource, /Dreaming Loop owns round bookkeeping/);
});

test("capability registry fails closed on duplicate packages and static adapters only expose packages", () => {
  const pkg = getTeamCapabilityPackage();
  assert.throws(() => new CapabilityRegistry([pkg, pkg]), /Duplicate capability package 'team\.teammate'/);

  const adapter = createStaticCapabilityAdapter({
    id: "team.static.adapter",
    kind: "agent",
    sourceKind: "team",
    description: "Static test adapter.",
    packages: [pkg],
  });

  assert.deepEqual(adapter.adapts, ["team"]);
  assert.deepEqual(adapter.listCapabilityPackages().map((item) => item.packageId), ["team.teammate"]);
});

test("external ecosystem manifests normalize into packages without changing protocol core", () => {
  const externalAgent = createCapabilityPackageFromManifest({
    protocol: CAPABILITY_MANIFEST_PROTOCOL,
    kind: "external_agent",
    id: "codex-cli",
    name: "Codex CLI external agent",
    description: "External agent package declared by manifest.",
    source: {
      kind: "external_agent",
      id: "codex-cli",
      path: "extensions/codex-cli/package.json",
    },
    adapter: {
      kind: "external",
      id: "codex-cli.adapter",
      description: "Manifest adapter.",
    },
    port: {
      runner: {
        type: "external_cli",
        invocation: "Lead-selected external CLI manifest runner.",
        leadWaitPolicy: {
          lead: "while_execution_active",
          wake: "required",
          scope: "global",
          terminalStatuses: ["completed", "failed", "aborted", "paused"],
        },
      },
      permissionBoundary: {
        world: "external CLI lane",
        autonomy: "external agent owns its internal loop",
        read: ["assigned context"],
        write: ["external artifacts"],
        forbidden: ["machine strategy"],
      },
      foregroundOutput: {
        mode: "foreground_stream",
        sink: "runtime-ui",
        section: "external",
        streams: ["stdout", "stderr", "closeout"],
      },
      artifacts: [{ kind: "execution", name: "external-execution", description: "external execution" }],
      closeout: {
        required: true,
        contract: "CloseoutContract",
        requiredEvidence: ["external evidence"],
        mergeProposal: "optional",
      },
      wake: {
        required: true,
        reasons: ["completed", "failed", "aborted", "paused"],
      },
    },
    inputSchema: "AssignmentContract plus external CLI args",
    outputSchema: "CloseoutContract plus ArtifactRef",
    budgetPolicy: "Lead chooses when external CLI runtime is worth the cost.",
    availability: "External CLI agent surface.",
    bestFor: ["external agent execution"],
    notFor: ["machine-selected delegation"],
  });
  const plugin = createCapabilityPackageFromManifest({
    protocol: CAPABILITY_MANIFEST_PROTOCOL,
    kind: "plugin",
    id: "plugin.demo",
    name: "Demo plugin package",
    description: "Plugin package declared by manifest.",
    source: {
      kind: "plugin",
      id: "plugin.demo",
    },
    adapter: {
      kind: "plugin",
      id: "plugin.demo.adapter",
      description: "Plugin adapter.",
    },
    port: {
      runner: { type: "manual", invocation: "Lead-selected manual plugin runner." },
      permissionBoundary: {
        world: "plugin lane",
        autonomy: "plugin owns declared behavior",
        read: ["assigned context"],
        write: ["plugin artifacts"],
        forbidden: ["machine strategy"],
      },
      foregroundOutput: {
        mode: "inline_events",
        sink: "runtime-ui",
        section: "plugin",
        streams: ["progress", "closeout"],
      },
      artifacts: [{ kind: "observation", name: "plugin-evidence", description: "plugin evidence" }],
      closeout: {
        required: true,
        contract: "CloseoutContract",
        requiredEvidence: ["plugin evidence"],
        mergeProposal: "none",
      },
      wake: {
        required: true,
        reasons: ["completed", "failed"],
      },
    },
  });

  const registry = new CapabilityRegistry(createCapabilityPackagesFromManifests([
    {
      protocol: CAPABILITY_MANIFEST_PROTOCOL,
      kind: "external_agent",
      id: "another-agent",
      name: "Another agent",
      description: "Second manifest package.",
      source: {
        kind: "external_agent",
      },
      adapter: {
        kind: "external",
        id: "another-agent.adapter",
        description: "Adapter.",
      },
      port: {
        runner: { type: "external_cli", invocation: "Lead-selected second external agent runner." },
        permissionBoundary: {
          world: "external agent lane",
          autonomy: "external agent owns internal loop",
          read: ["assigned context"],
          write: ["external artifacts"],
          forbidden: ["machine strategy"],
        },
        foregroundOutput: {
          mode: "foreground_stream",
          sink: "runtime-ui",
          section: "external",
          streams: ["stdout", "stderr", "closeout"],
        },
        artifacts: [{ kind: "execution", name: "external-execution", description: "external execution" }],
        closeout: {
          required: true,
          contract: "CloseoutContract",
          requiredEvidence: ["external evidence"],
          mergeProposal: "optional",
        },
        wake: {
          required: true,
          reasons: ["completed", "failed", "aborted", "paused"],
        },
      },
    },
  ]));

  assert.equal(externalAgent.packageId, "external_agent.codex-cli");
  assert.equal(externalAgent.source.builtIn, false);
  assert.equal(externalAgent.runner.requiresAssignment, true);
  assert.equal(externalAgent.runner.leadWaitPolicy.scope, "global");
  assert.equal(externalAgent.machinePermissions.autoSelect, false);
  assert.equal(plugin.packageId, "plugin.demo");
  assert.equal(registry.resolve("external_agent.another-agent").runner.type, "external_cli");
});

test("external manifest bundles become registry adapters without custom core wiring", () => {
  const bundle = parseCapabilityManifestBundle({
    protocol: CAPABILITY_MANIFEST_BUNDLE_PROTOCOL,
    id: "oh-my-style.bundle",
    description: "Reference-style external extension bundle.",
    sourceKind: "plugin",
    adapterKind: "plugin",
    manifests: [
      {
        kind: "skill",
        id: "audit-skill",
        name: "Audit Skill",
        description: "Skill-shaped external capability.",
        source: {
          kind: "plugin",
          id: "plugin.audit",
          path: "plugins/audit/SKILL.md",
        },
        adapter: {
          kind: "skill",
          id: "plugin.audit.skill.adapter",
          description: "Skill adapter.",
        },
        port: {
          runner: { type: "skill_load", invocation: "Lead-selected skill load runner.", createsExecution: false, emitsWakeSignal: false },
          permissionBoundary: {
            world: "skill context lane",
            autonomy: "skill contributes context only",
            read: ["plugins/audit/SKILL.md"],
            write: ["runtime context evidence"],
            forbidden: ["machine strategy"],
          },
          foregroundOutput: {
            mode: "silent",
            sink: "runtime-ui",
            section: "skill",
            streams: ["tool"],
          },
          artifacts: [{ kind: "observation", name: "skill-context", description: "skill context" }],
          closeout: {
            required: false,
            contract: "CloseoutContract",
            requiredEvidence: [],
            mergeProposal: "none",
          },
          wake: {
            required: false,
            reasons: [],
          },
        },
        bestFor: ["Lead-selected audit method"],
        notFor: ["automatic audit"],
      },
      {
        kind: "external_agent",
        id: "hephaestus",
        name: "Hephaestus",
        description: "Agent-shaped external capability.",
        source: {
          kind: "plugin",
          id: "plugin.hephaestus",
        },
        adapter: {
          kind: "external",
          id: "plugin.hephaestus.adapter",
          description: "External agent adapter.",
        },
        port: {
          runner: { type: "external_cli", invocation: "Lead-selected bundled external agent runner." },
          permissionBoundary: {
            world: "external agent lane",
            autonomy: "external agent owns internal loop",
            read: ["assigned context"],
            write: ["external artifacts"],
            forbidden: ["machine strategy"],
          },
          foregroundOutput: {
            mode: "foreground_stream",
            sink: "runtime-ui",
            section: "external",
            streams: ["stdout", "stderr", "closeout"],
          },
          artifacts: [{ kind: "execution", name: "external-execution", description: "external execution" }],
          closeout: {
            required: true,
            contract: "CloseoutContract",
            requiredEvidence: ["external evidence"],
            mergeProposal: "optional",
          },
          wake: {
            required: true,
            reasons: ["completed", "failed", "aborted", "paused"],
          },
        },
      },
    ],
  });
  const adapter = createCapabilityAdapterFromManifestBundle(bundle);
  const registry = CapabilityRegistry.fromAdapters([adapter]);
  const summary = registry.summarizeForLead();

  assert.deepEqual(adapter.adapts, ["skill", "external_agent"]);
  assert.equal(registry.resolve("skill.audit-skill").runner.type, "skill_load");
  assert.equal(registry.resolve("external_agent.hephaestus").source.kind, "plugin");
  assert.match(summary, /Presentation order and summaries are options for Lead, not machine intent/);
  assert.doesNotMatch(summary, /automatic audit/);
});

test("lead capability presentation is low-noise and does not dump skill bodies or full tool schemas", () => {
  const skill: LoadedSkill = {
    schemaVersion: "skill",
    version: "1.0.0",
    name: "large-skill",
    description: "Large skill summary.",
    path: "skills/large-skill/SKILL.md",
    absolutePath: "C:/repo/skills/large-skill/SKILL.md",
    body: "# Large Skill\n" + "NOISY-BODY ".repeat(100),
    agentKinds: ["lead"],
    roles: [],
    taskTypes: ["analysis"],
    scenes: [],
    triggers: {
      keywords: ["large"],
      patterns: [],
    },
    tools: {
      required: [],
      optional: [],
      incompatible: [],
    },
  };
  const toolEntry = {
    name: "very_large_tool",
    definition: {
      type: "function",
      function: {
        name: "very_large_tool",
        description: "Large tool.",
        parameters: {
          type: "object",
          properties: {
            payload: {
              type: "string",
              description: "NOISY-SCHEMA ".repeat(100),
            },
          },
        },
      },
    },
    governance: {
      source: "builtin",
      specialty: "external",
      mutation: "read",
      risk: "low",
      destructive: false,
      concurrencySafe: true,
      changeSignal: "none",
      verificationSignal: "none",
      preferredWorkflows: [],
      secondaryInWorkflows: [],
    },
    origin: {
      kind: "builtin",
      sourceId: "builtin:catalog",
    },
    tool: taskTool,
  } as unknown as ToolRegistryEntry;

  const summary = formatCapabilityRegistryForLead([
    { listCapabilityPackages: () => listSkillCapabilityPackages([skill]) },
    { listCapabilityPackages: () => listToolCapabilityPackages([toolEntry]) },
  ]);

  assert.match(summary, /skill\.large-skill/);
  assert.match(summary, /tool\.builtin\.external\.read/);
  assert.doesNotMatch(summary, /NOISY-BODY/);
  assert.doesNotMatch(summary, /NOISY-SCHEMA/);
});

test("delegation tools require AssignmentContract fields for dispatch", () => {
  const taskParameters = taskTool.definition.function.parameters as {
    required: string[];
    properties: Record<string, unknown>;
  };
  const teammateParameters = spawnTeammateTool.definition.function.parameters as {
    required: string[];
    properties: Record<string, unknown>;
  };

  assert.deepEqual(taskParameters.required, [
    "description",
    "objective",
    "scope",
    "expected_output",
    "agent_type",
  ]);
  assert.deepEqual(teammateParameters.required, [
    "name",
    "role",
    "objective",
    "scope",
    "expected_output",
  ]);
  assert.equal("prompt" in taskParameters.properties, false);
  assert.equal("prompt" in teammateParameters.properties, false);
});

test("wake signal is a single overwritten doorbell, not an accumulating truth source", async (t) => {
  const root = await createTempWorkspace("protocol-wake-signal", t);
  await publishExecutionWakeSignal(root, { executionId: "exec-1", reason: "completed" });
  const first = await snapshotExecutionWakeSignal(root);
  await publishExecutionWakeSignal(root, { executionId: "exec-2", reason: "failed" });
  const second = await snapshotExecutionWakeSignal(root);

  assert.equal(first.signal?.executionId, "exec-1");
  assert.equal(second.signal?.executionId, "exec-2");
  assert.equal(second.mtimeMs >= first.mtimeMs, true);
});

test("protocol core does not import concrete capability implementations", () => {
  const protocolDir = path.join(process.cwd(), "src", "protocol");
  const forbidden = /\.\.\/(?:capabilities|team|subagent|workflows|skills|tools|mcp|execution)\//;

  for (const file of fs.readdirSync(protocolDir).filter((item) => item.endsWith(".ts"))) {
    const content = fs.readFileSync(path.join(protocolDir, file), "utf8");
    assert.doesNotMatch(content, forbidden, `${file} must stay generic.`);
  }
});

test("removed registry surfaces stay absent from source", () => {
  const sourceFiles = collectSourceFiles(path.join(process.cwd(), "src"));
  const forbidden = [
    ["format", "Capability", "Profile"].join(""),
    ["list", "Subagent", "Capability", "Profiles"].join(""),
    ["get", "Team", "Capability", "Profile"].join(""),
    ["format", "Team", "Capability", "Profile"].join(""),
    ["format", "Workflow", "Profiles", "For", "Prompt"].join(""),
  ];

  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, "utf8");
    for (const token of forbidden) {
      assert.equal(content.includes(token), false, `${path.relative(process.cwd(), file)} still contains ${token}`);
    }
  }
});

function collectSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}
