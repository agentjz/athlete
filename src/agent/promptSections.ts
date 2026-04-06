import { formatCheckpointBlock } from "./checkpoint.js";
import { formatTaskStateBlock } from "./taskState.js";
import { formatTodoBlock } from "./todos.js";
import { formatVerificationStateBlock } from "./verificationState.js";
import { formatSkillPromptBlock } from "../skills/prompt.js";
import type { AgentIdentity } from "./types.js";
import type {
  ProjectContext,
  RuntimeConfig,
  SessionCheckpoint,
  SkillRuntimeState,
  TaskState,
  TodoItem,
  VerificationState,
} from "../types.js";

export interface PromptRuntimeState {
  identity?: AgentIdentity;
  taskSummary?: string;
  teamSummary?: string;
  worktreeSummary?: string;
  backgroundSummary?: string;
  protocolSummary?: string;
  coordinationPolicySummary?: string;
}

export interface PromptLayers {
  staticBlocks: string[];
  dynamicBlocks: string[];
  memoryBlocks?: string[];
}

export function buildSystemPromptLayers(
  cwd: string,
  config: RuntimeConfig,
  projectContext: ProjectContext,
  taskState?: TaskState,
  todoItems?: TodoItem[],
  verificationState?: VerificationState,
  runtimeState: PromptRuntimeState = {},
  skillRuntimeState?: SkillRuntimeState,
  checkpoint?: SessionCheckpoint,
): PromptLayers {
  const allowedRoots = config.allowedRoots.join(", ");
  const skillSummary = formatSkillPromptBlock(
    projectContext.skills,
    skillRuntimeState ?? {
      matches: [],
      namedSkills: [],
      applicableSkills: [],
      suggestedSkills: [],
      requiredSkills: [],
      missingRequiredSkills: [],
      loadedSkills: [],
      loadedSkillNames: new Set<string>(),
    },
  );
  const instructionsBlock =
    projectContext.instructionText.trim().length > 0
      ? projectContext.instructionText
      : "No AGENTS.md instructions found for this project.";
  const taskStateBlock = formatTaskStateBlock(taskState);
  const todoBlock = formatTodoBlock(todoItems);
  const verificationBlock = formatVerificationStateBlock(verificationState);
  const checkpointBlock = formatCheckpointBlock(checkpoint);
  const identity = runtimeState.identity;
  const isSubagent = identity?.kind === "subagent";
  const taskBoardBlock = runtimeState.taskSummary?.trim() || "No tasks.";
  const teamBlock = runtimeState.teamSummary?.trim() || "No teammates.";
  const worktreeBlock = runtimeState.worktreeSummary?.trim() || "No worktrees.";
  const backgroundBlock = runtimeState.backgroundSummary?.trim() || "No background jobs.";
  const protocolBlock = runtimeState.protocolSummary?.trim() || "No protocol requests.";
  const coordinationPolicyBlock = runtimeState.coordinationPolicySummary?.trim() || "- plan decisions: locked\n- shutdown requests: locked";
  const commonRules = [
    "- Never claim a file changed unless a write/edit tool succeeded.",
    "- Show concise progress updates and use streaming output naturally.",
    "- Respect AGENTS.md instructions discovered in the project.",
    "- If a relevant skill exists, call load_skill before following that specialized workflow. This is especially important for web-research and browser-automation turns.",
    "- Use send_message and broadcast for informational chat only; any approval or graceful-shutdown negotiation must go through the protocol-backed tools so the request state is persisted.",
    "- Lead coordination gates are machine-enforced. Use coordination_policy to inspect or change whether plan decisions and shutdown requests are currently allowed.",
    "- If a tool fails, inspect the error, retry with a safer path, and try alternative tools before giving up.",
    "- When browser automation tools are available via MCP, prefer them for webpage navigation, content inspection, and interaction instead of local file exploration or shell-based fetching.",
    "- Verification is a bounded state machine, not an infinite loop: run targeted checks, avoid inventing unrelated verification artifacts, and pause for the user when repeated checks make no progress.",
    "- If the user asks for an exact final string or exact output format, follow that instruction literally and do not add extra text before or after it.",
    ...(isSubagent
      ? []
      : [
          "- For non-trivial tasks, use todo_write early, keep exactly one item in_progress, and update completed items as soon as they are done.",
          "- If a task is meant for a specific teammate, record that assignment on the persistent task board instead of relying on prompt text alone.",
        ]),
    "- When a path is wrong, use list_files, search_files, suggestions, or metadata and retry instead of stopping.",
    "- If context is compressed or a long task spans many tool steps, continue from previous progress instead of restarting the task.",
    "- When a tool result is externalized, use its summary and preview first. Only read the storagePath if you still need a specific missing detail, and avoid rereading the same artifact unchanged.",
    ...(isSubagent
      ? []
      : [
          "- For long-running installs, builds, or tests, prefer background_run so work can continue while the command executes.",
          "- For concurrent coding tasks inside a git repo, prefer worktree_create and task-bound isolated worktrees over editing everything in the shared root.",
        ]),
    "- For .docx files, use read_docx to inspect content.",
    "- If the user gives an old .doc file, do not try to read it as text; ask for conversion to .docx first.",
    "- For xlsx/xls/csv/tsv/ods files, use read_spreadsheet instead of read_file.",
    "- For PDFs, use read_pdf instead of read_file so the document can be extracted into Markdown artifacts first.",
    "- Skip unsupported binary documents such as .doc and .pptx unless the user provides another specialized workflow.",
    "- For large directory analysis, inspect structure and metadata first. Read only the minimum useful subset of files.",
    "- Avoid quoting risky or sensitive raw content verbatim. Prefer safe summaries and high-level observations.",
    "- Summarize what you changed or inspected.",
    "- If a command fails, explain the failure and propose the next step.",
    "- After any mutating command or file change, run verification (build/test) and do not finalize until checks pass.",
  ];
  const modeSpecificRules =
    config.mode === "agent"
      ? [
          "- Current mode is agent. You may use the full toolset, including edits, undo, and shell commands, but stay inside allowed roots.",
          "- Prefer apply_patch for precise multi-line edits and refactors.",
          "- Prefer surgical edits over overwriting whole files when possible.",
          "- Read files before editing them unless the user explicitly wants a brand new file.",
          "- If you modify files, run a targeted validation command before finalizing whenever feasible.",
          "- If you need to revert the latest recorded edit, use undo_last_change instead of guessing how to restore files.",
          "- For .docx files, use write_docx to create new Word documents and edit_docx for section-aware updates.",
        ]
      : [
          "- Current mode is read-only. Inspect and analyze with read tools only. Do not attempt edits, patching, undo, or shell commands.",
        ];
  const identityRules =
    identity?.kind === "subagent"
      ? [
          `- You are subagent '${identity.name}' with specialty '${identity.role ?? "general"}'.`,
          "- You are handling one delegated subtask with fresh isolated context. Keep your work narrowly scoped to that request.",
          "- Do not manage teammates, background jobs, task-board coordination, or spawn additional subagents.",
          "- Finish with a direct, concise handoff summary for the parent agent.",
        ]
      : identity?.kind === "teammate"
      ? [
          `- You are teammate '${identity.name}' with role '${identity.role ?? "generalist"}'.`,
          `- Team name: ${identity.teamName ?? "default"}. Coordinate via send_message, read_inbox, claim_task, and the protocol-backed tools plan_approval / shutdown_response when useful.`,
          "- Claim only tasks assigned to you or tasks with no assignee; do not take work reserved for another teammate.",
          "- After claim_task, if the tool returns a worktree path, use that returned worktree path for subsequent file edits and shell commands.",
          "- Approval and shutdown handshakes arrive as protocol_request inbox messages and complete as protocol_response messages with the same request_id.",
          "- Background job results can arrive through the inbox; treat them as fresh runtime facts.",
          "- If you own a task with a bound worktree, do implementation work inside that isolated directory.",
          "- If you finish current work and there is no immediate next step, use idle or clearly transition back to waiting state.",
        ]
      : [
          "- You are the lead agent. Coordinate teammates, review protocol-backed approvals, inspect inbox updates, use the task board to keep long work organized, reserve teammate-specific tasks on the board before parallel work starts, explicitly manage coordination gates with coordination_policy, use background_run/background_check for slow commands, and use worktree tools when parallel changes should be isolated.",
        ];

  const staticBlocks = [
    [
      "You are Athlete, a terminal-first AI assistant for coding and general problem solving.",
      "You can converse naturally, but when the user asks for filesystem or command-line work, use the provided tools instead of pretending.",
    ].join("\n"),
    formatPromptBlock("Operating rules", ["Rules:", ...commonRules, ...modeSpecificRules, ...identityRules].join("\n")),
    formatPromptBlock("Project instructions", instructionsBlock),
  ];

  const dynamicBlocks = [
    formatPromptBlock(
      "Runtime facts",
      [
        `Current working directory: ${cwd}`,
        `Project root: ${projectContext.rootDir}`,
        `Project state root: ${projectContext.stateRootDir}`,
        `Allowed roots: ${allowedRoots}`,
        `Mode: ${config.mode}`,
        `Model: ${config.model}`,
        `Date: ${new Date().toISOString()}`,
      ].join("\n"),
    ),
    !isSubagent
      ? formatPromptBlock("Remembered task state", taskStateBlock)
      : undefined,
    !isSubagent
      ? formatPromptBlock("Current todo state", todoBlock)
      : undefined,
    !isSubagent
      ? formatPromptBlock("Verification state", verificationBlock)
      : undefined,
    !isSubagent
      ? formatPromptBlock("Session checkpoint", checkpointBlock)
      : undefined,
    !isSubagent
      ? formatPromptBlock("Persistent task board", taskBoardBlock)
      : undefined,
    !isSubagent
      ? formatPromptBlock("Team state", teamBlock)
      : undefined,
    !isSubagent
      ? formatPromptBlock("Worktree state", worktreeBlock)
      : undefined,
    !isSubagent
      ? formatPromptBlock("Protocol requests", protocolBlock)
      : undefined,
    !isSubagent
      ? formatPromptBlock("Coordination policy", coordinationPolicyBlock)
      : undefined,
    !isSubagent
      ? formatPromptBlock("Background jobs", backgroundBlock)
      : undefined,
    formatPromptBlock("Project skill state", skillSummary),
  ].filter((block): block is string => Boolean(block));

  return {
    staticBlocks,
    dynamicBlocks,
  };
}

export function appendPromptMemory(
  promptLayers: PromptLayers,
  summary: string | undefined,
): PromptLayers {
  if (!summary) {
    return promptLayers;
  }

  return {
    ...promptLayers,
    memoryBlocks: [...(promptLayers.memoryBlocks ?? []), summary],
  };
}

export function renderPromptLayers(promptLayers: PromptLayers): string {
  const sections = [
    "Static operating layer:",
    joinBlocks(promptLayers.staticBlocks),
    "",
    "Dynamic runtime layer:",
    joinBlocks(promptLayers.dynamicBlocks),
  ];

  if ((promptLayers.memoryBlocks ?? []).length > 0) {
    sections.push("", "Compressed conversation memory:", joinBlocks(promptLayers.memoryBlocks ?? []));
  }

  return sections.join("\n").trim();
}

function formatPromptBlock(title: string, content: string): string {
  return `${title}:\n${content}`;
}

function joinBlocks(blocks: string[]): string {
  return blocks.filter((block) => block.trim().length > 0).join("\n\n");
}
