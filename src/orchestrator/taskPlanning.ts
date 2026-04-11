import { TaskStore } from "../tasks/store.js";
import { readOrchestratorTask, writeOrchestratorMetadata } from "./metadata.js";
import type {
  OrchestratorAnalysis,
  OrchestratorExecutorKind,
  OrchestratorTaskKind,
  OrchestratorTaskPlan,
  OrchestratorTaskSnapshot,
} from "./types.js";

interface TaskSpec {
  kind: OrchestratorTaskKind;
  executor: OrchestratorExecutorKind;
  blockedBy?: OrchestratorTaskKind;
}

export async function ensureTaskPlan(input: {
  rootDir: string;
  cwd: string;
  analysis: OrchestratorAnalysis;
  existingTasks: OrchestratorTaskSnapshot[];
}): Promise<OrchestratorTaskPlan> {
  const specs = buildTaskSpecs(input.analysis);
  if (specs.length === 0) {
    return {
      objective: input.analysis.objective,
      createdTaskIds: [],
      tasks: input.existingTasks,
      readyTasks: input.existingTasks.filter((task) => task.record.status !== "completed" && task.record.blockedBy.length === 0),
    };
  }

  const store = new TaskStore(input.rootDir);
  const existingByKind = new Map(input.existingTasks.map((task) => [task.meta.kind, task]));
  const createdTaskIds: number[] = [];

  for (const spec of specs) {
    let current = existingByKind.get(spec.kind);
    if (!current) {
      const created = await store.create(
        buildTaskSubject(spec.kind, input.analysis.objective.text),
        writeOrchestratorMetadata(
          buildTaskDescription(spec.kind, input.analysis.objective.text),
          {
            key: input.analysis.objective.key,
            kind: spec.kind,
            objective: input.analysis.objective.text,
            executor: spec.executor,
            backgroundCommand: spec.kind === "validation" ? input.analysis.backgroundCommand : undefined,
          },
        ),
      );
      createdTaskIds.push(created.id);
      const createdSnapshot = readOrchestratorTask(created);
      current = createdSnapshot ?? undefined;
      if (current) {
        existingByKind.set(spec.kind, current);
      }
      continue;
    }

    if (
      (spec.kind === "validation" && input.analysis.backgroundCommand && current.meta.backgroundCommand !== input.analysis.backgroundCommand) ||
      current.meta.executor !== spec.executor
    ) {
      const saved = await store.save({
        ...current.record,
        description: writeOrchestratorMetadata(current.record.description, {
          ...current.meta,
          executor: spec.executor,
          backgroundCommand: input.analysis.backgroundCommand,
        }),
      });
      const refreshed = readOrchestratorTask(saved);
      if (refreshed) {
        existingByKind.set(spec.kind, refreshed);
      }
    }
  }

  for (const spec of specs) {
    if (!spec.blockedBy) {
      continue;
    }

    const task = existingByKind.get(spec.kind);
    const blocker = existingByKind.get(spec.blockedBy);
    if (
      !task ||
      !blocker ||
      blocker.record.status === "completed" ||
      task.record.blockedBy.includes(blocker.record.id) ||
      blocker.record.blocks.includes(task.record.id)
    ) {
      continue;
    }

    const updated = await store.update(task.record.id, {
      addBlockedBy: [blocker.record.id],
    });
    const refreshed = readOrchestratorTask(updated);
    if (refreshed) {
      existingByKind.set(spec.kind, refreshed);
    }
  }

  const tasks = [...existingByKind.values()].sort(compareTasks);
  return {
    objective: input.analysis.objective,
    createdTaskIds,
    tasks,
    readyTasks: tasks.filter((task) => task.record.status !== "completed" && task.record.blockedBy.length === 0),
  };
}

function buildTaskSpecs(analysis: OrchestratorAnalysis): TaskSpec[] {
  if (analysis.complexity === "simple" && !analysis.wantsBackground && !analysis.wantsSubagent && !analysis.wantsTeammate) {
    return [];
  }

  const specs: TaskSpec[] = [];
  if (analysis.needsInvestigation || analysis.wantsSubagent) {
    specs.push({
      kind: "survey",
      executor: "subagent",
    });
  }

  const implementationExecutor: OrchestratorExecutorKind =
    analysis.wantsTeammate || (analysis.prefersParallel && analysis.complexity === "complex")
      ? "teammate"
      : "lead";
  specs.push({
    kind: "implementation",
    executor: implementationExecutor,
    blockedBy: specs.some((spec) => spec.kind === "survey") ? "survey" : undefined,
  });

  const validationExecutor: OrchestratorExecutorKind =
    analysis.wantsBackground && analysis.backgroundCommand
      ? "background"
      : "lead";
  specs.push({
    kind: "validation",
    executor: validationExecutor,
    blockedBy: "implementation",
  });

  if (implementationExecutor !== "lead" || validationExecutor !== "lead") {
    specs.push({
      kind: "merge",
      executor: "lead",
      blockedBy: "validation",
    });
  }
  return specs;
}

function buildTaskSubject(kind: OrchestratorTaskKind, objective: string): string {
  const label =
    kind === "survey"
      ? "Survey"
      : kind === "implementation"
        ? "Implement"
        : kind === "validation"
          ? "Validate"
          : "Merge";
  return `${label}: ${truncate(objective, 120)}`;
}

function buildTaskDescription(kind: OrchestratorTaskKind, objective: string): string {
  switch (kind) {
    case "survey":
      return `Gather the minimum concrete facts needed before implementation.\nObjective: ${objective}`;
    case "merge":
      return `Merge delegated child-task results back onto the lead path before continuing.\nObjective: ${objective}`;
    case "validation":
      return `Run the smallest useful validation pass after implementation.\nObjective: ${objective}`;
    default:
      return `Execute the main implementation work for the current objective.\nObjective: ${objective}`;
  }
}

function compareTasks(left: OrchestratorTaskSnapshot, right: OrchestratorTaskSnapshot): number {
  const order = {
    survey: 0,
    implementation: 1,
    validation: 2,
    merge: 3,
  } as const;
  const leftOrder = order[left.meta.kind] ?? 99;
  const rightOrder = order[right.meta.kind] ?? 99;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.record.id - right.record.id;
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}
