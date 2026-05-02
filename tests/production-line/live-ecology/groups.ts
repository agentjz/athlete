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
}

export interface LiveEcologyInventoryFinding {
  kind: "missing-from-inventory" | "unknown-in-runtime" | "duplicate-in-inventory" | "disabled-without-reason";
  tool: string;
}

const LIVE_GROUP_TITLES: Record<string, string> = {
  "files-code": "file and code tools",
  documents: "document tools",
  "network-api": "network and API tools",
  "history-trace": "history and trace tools",
  "execution-ecology": "task, worktree, background, dreaming, workflow, subagent, team, and package ecology",
};

const LIVE_GROUP_PROMPTS: Record<string, string[]> = {
  "files-code": [
    "Run a real API smoke test for file and code tools.",
    "Hard constraints: write, edit, patch, undo, and generated evidence are allowed only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "Use todo_write first to record the test plan. The todo text must be Simplified Chinese.",
    "Actually call list_files, find_files, search_files, and read_file to locate and read a small part of package.json and README.md.",
    "Inside __RUN_DIR__, use write_file to create utf8-sample.txt, bom-sample.txt, crlf-sample.txt, and patch-target.txt.",
    "Call edit_file twice on utf8-sample.txt; call edit_file once on crlf-sample.txt; call apply_patch once on patch-target.txt.",
    "Call undo_last_change once, and undo only one test change created inside __RUN_DIR__.",
    "Call code_symbols, code_references, and code_pattern for minimal read-only code observation.",
    "Call run_shell for read-only checks: node --version and git status --short.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/files-code-report.md in Simplified Chinese.",
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
  "network-api": [
    "Run a real API smoke test for network and OpenAPI tools.",
    "Hard constraints: write or download evidence only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files.",
    "Actually call http_probe, http_request, http_session, and http_suite, preferably against https://example.com or another public read-only endpoint.",
    "Actually call network_trace to record network evidence, call openapi_inspect and openapi_lint against a minimal OpenAPI JSON inside __RUN_DIR__, and call download_url to download a public read-only page into __RUN_DIR__.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/network-api-report.md in Simplified Chinese.",
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
  "execution-ecology": [
    "Run a real API smoke test for the execution ecology.",
    "Hard constraints: write evidence only inside __RUN_DIR__; never delete __RUN_DIR__; never modify project source, package.json, src, spec, tests, ref, README, or configuration files; for disabled tools, write skipped only and do not call them.",
    "Actually call dreaming_start for a no-op run under 30 seconds: read-only observation, enter Mirror World, close out quickly, and never merge Real World.",
    "Actually call dreaming_loop_start, dreaming_loop_next, and dreaming_loop_status for one minimal no-op loop.",
    "Actually call task_create, task_get, task_list, task_update, and claim_task; claim_task may bind only a test task.",
    "Actually call worktree_list, worktree_create, worktree_get, worktree_events, and worktree_keep; do not call disabled tools.",
    "Actually call background_run with a very short read-only command, then call background_check and background_terminate.",
    "Actually call load_skill with test-guardrails or spec-alignment.",
    "Actually call task to dispatch one minimal read-only subagent that only observes whether __RUN_DIR__ exists and then closes out.",
    "Actually call coordination_policy, spawn_teammate, list_teammates, send_message, read_inbox, broadcast, shutdown_request, shutdown_response, plan_approval, and idle; teammate work must be read-only, short, and closed out quickly.",
    "Use run_shell to exercise the kitty capability package CLI: create a minimal external manifest inside __RUN_DIR__ and produce install, list, doctor, and test evidence.",
    "Write each tool result, success or failure, original failure summary, and evidence path into __RUN_DIR__/execution-ecology-report.md in Simplified Chinese.",
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
    }))
    .sort((left, right) => Object.keys(LIVE_GROUP_TITLES).indexOf(left.id) - Object.keys(LIVE_GROUP_TITLES).indexOf(right.id));
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
