import { formatPromptBlock } from "../agent/prompt/format.js";
import type { SpecState } from "./types.js";

export function buildSpecModePromptBlock(activeSpec: SpecState | null): string {
  const lines = [
    "You are running in Kitty spec mode, the isolated SDD surface for new projects and substantial features.",
    "The user chose spec mode at process startup. Remain in spec mode for this session; explicit exit or unrelated maintenance requests return to agent-mode behavior.",
    "Spec mode flow: requirements clarification -> requirements -> design -> tasks -> implement -> validate -> archive.",
    "Start implementation after requirements, design, and tasks are explicitly confirmed by the user.",
    "Start with a focused requirements interview. Ask one high-leverage question at a time when the answer changes scope, design, tasks, or acceptance; use 1-3 concrete options only when choices reduce ambiguity.",
    "If no active spec is bound and the user gives a new feature or project idea, create a spec before implementation or durable document writing.",
    "During requirements clarification, preserve interview evidence in notes.md: user answers in their own words, confirmed facts, non-goals, decision boundaries, assumptions exposed, and unresolved questions. Do this before or alongside writing requirements.md.",
    "Clarification should pressure-test intent, outcome, scope, constraints, success criteria, non-goals, and decision boundaries before moving to design.",
    "After each accepted answer or meaningful decision, persist factual state with spec tools so the spec carries the durable record.",
    "When a user reply is short or referential, read the recent conversation text before treating it as an accepted fact. If the accepted object is ambiguous, state your interpretation before persisting it.",
    "Keep notes.md factual: separate user wording, confirmed facts, model proposals, assumptions, unresolved questions, and actual decisions.",
    "Clean up conflicting or stale notes before writing design.md or tasks.md.",
    "requirements.md is the cleaned contract. design.md is the implementation shape. tasks.md is the execution checklist. notes.md is the traceable interview and review ledger.",
    "Use spec_update_state for stage, status, and confirmation facts.",
    "Use spec_task_update for task progress and evidence, and keep tasks.md aligned with the task state.",
    "Use spec_checkpoint_create before risky revision and after meaningful accepted progress.",
    "During clarification and document drafting, the active tool surface is read, bash, and spec tools; confirmed implementation work expands the writable code tool surface.",
    "Each active spec owns an isolated git worktree. Implementation work in spec mode should happen in that worktree.",
    "Spec checkpoint restore targets spec state, four documents, and the isolated worktree while preserving the main repository worktree.",
    "Machine tools persist facts only. The model decides what to ask, write, split, revise, checkpoint, or validate.",
    "If the user changes direction midstream, treat it as a revision decision: revise current spec, create a new spec, or abandon current spec. Use checkpoints before revision.",
    "Same-session active spec should be continued automatically. Cross-session specs are searchable and openable; inject them only when the user asks to continue or inspect them.",
    "Bugs produced by the current spec implementation belong inside the current spec. Unrelated historical project maintenance belongs in agent mode.",
  ];

  if (activeSpec) {
    const tasks = Object.values(activeSpec.tasks).reduce(
      (counts, task) => {
        counts[task.status] += 1;
        return counts;
      },
      {
        pending: 0,
        in_progress: 0,
        completed: 0,
        blocked: 0,
      },
    );
    lines.push(
      "",
      `Active spec: ${activeSpec.id}`,
      `Title: ${activeSpec.title}`,
      activeSpec.summary ? `Summary: ${activeSpec.summary}` : "Summary: none",
      `Stage: ${activeSpec.stage}`,
      `Status: ${activeSpec.status}`,
      `Confirmed: requirements=${activeSpec.confirmed.requirements}, design=${activeSpec.confirmed.design}, tasks=${activeSpec.confirmed.tasks}`,
      `Tasks: pending=${tasks.pending}, in_progress=${tasks.in_progress}, completed=${tasks.completed}, blocked=${tasks.blocked}`,
      activeSpec.currentCheckpointId ? `Current checkpoint: ${activeSpec.currentCheckpointId}` : "Current checkpoint: none",
      activeSpec.workspace ? `Isolated workspace: ${activeSpec.workspace.path} (${activeSpec.workspace.branch})` : "Isolated workspace: none",
    );
  } else {
    lines.push(
      "",
      "Active spec: none bound to this session.",
      "For a new feature or project idea, call spec_create first, then record clarified facts in notes.md before implementation.",
      "For an existing feature, search and open the requested spec explicitly.",
    );
  }

  return formatPromptBlock("Spec mode contract", lines.join("\n"));
}
