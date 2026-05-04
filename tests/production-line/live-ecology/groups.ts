import { readCapabilityEcologySpec } from "../readme-capabilities/core.ts";

export interface LiveEcologyToolSwitch {
  name: string;
  enabled: boolean;
  skipReason?: string;
}

export interface LiveEcologyGroup {
  id: string;
  title: string;
  tools: LiveEcologyToolSwitch[];
  promptLines: string[];
  reportFile: string;
}

export interface LiveEcologyInventoryFinding {
  kind: "missing-from-inventory" | "unknown-in-runtime" | "duplicate-in-inventory" | "disabled-without-reason";
  tool: string;
}

const LIVE_GROUP_TITLES: Record<string, string> = {
  "foundation-tools": "foundation four-tool coding loop",
  "patch-edit-tools": "foundation write and edit tools",
  "code-intelligence": "code intelligence read-only tools",
  documents: "document tools",
  "network-http": "HTTP and download tools",
  "network-openapi": "network trace and OpenAPI tools",
  "history-trace": "history and trace tools",
  "dreaming-ecology": "dreaming ecology",
  "task-ecology": "task ecology",
  "worktree-ecology": "worktree ecology",
  "background-ecology": "background process ecology",
  "subagent-team-ecology": "subagent and team ecology",
  "skill-package-ecology": "skill and capability package ecology",
};

const LIVE_GROUP_PROMPTS: Record<string, string[]> = {
  "foundation-tools": [
    "Run a real API smoke test for the four foundation tools: read, edit, write, bash.",
    "Hard constraints: generated evidence is allowed only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "Use todo_write first to record the test plan. The todo text must be Simplified Chinese.",
    "Use bash from the repository root to locate package.json and README.md.",
    "Actually call read to read a small part of package.json and README.md.",
    "Call bash for these read-only checks: node --version, git status --short, and git diff --stat.",
    "If useful, write one non-empty report file under __RUN_DIR__. The recommended path is __RUN_DIR__/foundation-tools-report.md.",
    "When writing a report, include each tool result, success or failure, original failure summary, and evidence path in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
  "patch-edit-tools": [
    "Run a real API smoke test for write, edit, read, and bash only.",
    "Hard constraints: write, edit, undo, and generated evidence are allowed only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "Use todo_write first to record the test plan. The todo text must be Simplified Chinese.",
    "Inside __RUN_DIR__, first use write to create utf8-sample.txt with exactly these three lines: alpha, beta, gamma.",
    "Then call read on utf8-sample.txt to observe the current content.",
    "Then call edit to change beta to BETA from the current target text, with a line hint if useful.",
    "Then call read again and use edit to change gamma to GAMMA from the current target text, with a line hint if useful.",
    "After editing, call read to verify the final sample content is alpha, BETA, GAMMA.",
    "If useful, write one non-empty report file under __RUN_DIR__. The recommended path is __RUN_DIR__/patch-edit-tools-report.md.",
    "When writing a report, include each tool result, success or failure, original failure summary, and evidence path in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
  "code-intelligence": [
    "Run a real API smoke test for read-only code intelligence tools.",
    "Hard constraints: generated evidence may be written only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "Actually call code_symbols, code_references, and code_pattern for minimal read-only code observation.",
    "Use read only when needed to inspect the returned readArgs, and do not edit files in this group.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/code-intelligence-report.md in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
  documents: [
    "Run a real API smoke test for document tools.",
    "Hard constraints: document evidence may be written only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "For disabled tools, write skipped only; do not call disabled tools.",
    "Actually call write_docx, read_docx, and edit_docx, leaving docx evidence inside __RUN_DIR__.",
    "Create a minimal xlsx or csv evidence file and call read_spreadsheet.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/documents-report.md in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
  "network-http": [
    "Run a real API smoke test for HTTP and download tools.",
    "Hard constraints: write or download evidence only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "Actually call http_probe, http_request, http_session, and http_suite, preferably against https://example.com or another public read-only endpoint.",
    "Actually call download_url to download a public read-only page into __RUN_DIR__.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/network-http-report.md in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
  "network-openapi": [
    "Run a real API smoke test for network trace and OpenAPI tools.",
    "Hard constraints: write evidence only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "Actually call network_trace to record network evidence.",
    "Create a minimal OpenAPI JSON inside __RUN_DIR__, then call openapi_inspect and openapi_lint against it.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/network-openapi-report.md in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
  "history-trace": [
    "Run a real API smoke test for history and trace tools.",
    "Hard constraints: write evidence only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "Actually call session_list, session_read, session_search, session_final_output, runtime_event_search, change_record_read, tool_artifact_read, agent_trace_list, and agent_trace_read.",
    "If a read tool has no available id, record no available record explicitly instead of fabricating success.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/history-trace-report.md in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
  "dreaming-ecology": [
    "Run a real API smoke test for the dreaming ecology.",
    "Hard constraints: write evidence only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files; for disabled tools, write skipped only and do not call them.",
    "Actually call dreaming_start for a no-op run under 30 seconds: read-only observation, enter Mirror World, close out quickly, and never merge Real World.",
    "Actually call dreaming_loop_start, dreaming_loop_next, and dreaming_loop_status for one minimal no-op loop.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/dreaming-ecology-report.md in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
  "task-ecology": [
    "Run a real API smoke test for task ecology.",
    "Hard constraints: write evidence only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "Actually call task_create, task_get, task_list, task_update, and claim_task; claim_task may bind only a test task.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/task-ecology-report.md in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
  "worktree-ecology": [
    "Run a real API smoke test for worktree ecology.",
    "Hard constraints: write evidence only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files; for disabled tools, write skipped only and do not call them.",
    "Actually call worktree_list, worktree_create, worktree_get, worktree_events, and worktree_keep; do not call disabled tools.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/worktree-ecology-report.md in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
  "background-ecology": [
    "Run a real API smoke test for background process ecology.",
    "Hard constraints: write evidence only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "Actually call background_run with a very short read-only command, then call background_check and background_terminate.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/background-ecology-report.md in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
  "subagent-team-ecology": [
    "Run a real API smoke test for subagent and team ecology.",
    "Hard constraints: write evidence only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "Actually call load_skill with test-guardrails or spec-alignment.",
    "Actually call task to dispatch one minimal read-only subagent that only observes whether __RUN_DIR__ exists and then closes out.",
    "Actually call coordination_policy, spawn_teammate, list_teammates, send_message, read_inbox, broadcast, shutdown_request, shutdown_response, plan_approval, and idle; teammate work must be read-only, short, and closed out quickly.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/subagent-team-ecology-report.md in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
  "skill-package-ecology": [
    "Run a real API smoke test for skill and capability package ecology.",
    "Hard constraints: write evidence only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "Actually call load_skill with test-guardrails or spec-alignment.",
    "Use bash to exercise the kitty capability package CLI: create a minimal external manifest inside __RUN_DIR__ and produce install, list, doctor, and test evidence.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/skill-package-ecology-report.md in Simplified Chinese.",
    "Finally confirm in Simplified Chinese that __RUN_DIR__ still exists and Real World source files were not modified.",
  ],
};

interface LiveEcologySpecTool {
  name: string;
  live?: {
    group?: string;
    enabled?: boolean;
    skipReason?: string;
  };
}

export async function loadLiveEcologyGroups(root: string): Promise<LiveEcologyGroup[]> {
  const spec = await readCapabilityEcologySpec(root);
  const grouped = new Map<string, LiveEcologyToolSwitch[]>();

  for (const category of spec.toolCategories) {
    for (const tool of category.tools ?? []) {
      const live = (tool as LiveEcologySpecTool).live;
      const groupId = live?.group;
      if (!groupId) {
        continue;
      }

      const tools = grouped.get(groupId) ?? [];
      tools.push({
        name: tool.name,
        enabled: live.enabled === true,
        skipReason: live.skipReason,
      });
      grouped.set(groupId, tools);
    }
  }

  return [...grouped.entries()]
    .map(([id, tools]) => ({
      id,
      title: LIVE_GROUP_TITLES[id] ?? id,
      tools,
      promptLines: LIVE_GROUP_PROMPTS[id] ?? [],
      reportFile: `${id}-report.md`,
    }))
    .sort((left, right) => getLiveGroupOrder(left.id) - getLiveGroupOrder(right.id) || left.id.localeCompare(right.id));
}

function getLiveGroupOrder(id: string): number {
  const index = Object.keys(LIVE_GROUP_TITLES).indexOf(id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function getEnabledTools(group: LiveEcologyGroup): string[] {
  return group.tools.filter((tool) => tool.enabled).map((tool) => tool.name).sort();
}

export function getDisabledTools(group: LiveEcologyGroup): string[] {
  return group.tools.filter((tool) => !tool.enabled).map((tool) => tool.name).sort();
}

export function getDisabledToolReasons(group: LiveEcologyGroup): Record<string, string> {
  return Object.fromEntries(
    group.tools
      .filter((tool) => !tool.enabled)
      .map((tool) => [tool.name, tool.skipReason ?? "disabled in live ecology inventory"]),
  );
}

export function getInventoryToolNames(groups: readonly LiveEcologyGroup[]): string[] {
  return groups.flatMap((group) => group.tools.map((tool) => tool.name)).sort();
}

export function diagnoseLiveEcologyInventory(
  registeredTools: readonly string[],
  groups: readonly LiveEcologyGroup[],
): LiveEcologyInventoryFinding[] {
  const findings: LiveEcologyInventoryFinding[] = [];
  const registered = new Set(registeredTools);
  const inventoryCounts = new Map<string, number>();

  for (const group of groups) {
    for (const tool of group.tools) {
      inventoryCounts.set(tool.name, (inventoryCounts.get(tool.name) ?? 0) + 1);
      if (!registered.has(tool.name)) {
        findings.push({ kind: "unknown-in-runtime", tool: tool.name });
      }
      if (!tool.enabled && !tool.skipReason?.trim()) {
        findings.push({ kind: "disabled-without-reason", tool: tool.name });
      }
    }
  }

  for (const tool of registeredTools) {
    if (!inventoryCounts.has(tool)) {
      findings.push({ kind: "missing-from-inventory", tool });
    }
  }

  for (const [tool, count] of inventoryCounts) {
    if (count > 1) {
      findings.push({ kind: "duplicate-in-inventory", tool });
    }
  }

  return findings.sort((left, right) => left.tool.localeCompare(right.tool) || left.kind.localeCompare(right.kind));
}

