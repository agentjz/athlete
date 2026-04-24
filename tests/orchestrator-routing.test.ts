import assert from "node:assert/strict";
import test from "node:test";

import { resolveExecutionBoundary } from "../src/execution/boundary.js";
import { routeOrchestratorAction } from "../src/orchestrator/route.js";
import type {
  OrchestratorAnalysis,
  OrchestratorProgressSnapshot,
  OrchestratorTaskPlan,
  OrchestratorTaskSnapshot,
  OrchestratorTaskKind,
} from "../src/orchestrator/types.js";

function createAnalysis(overrides: Partial<OrchestratorAnalysis> = {}): OrchestratorAnalysis {
  return {
    objective: {
      key: "objective-1",
      text: "Refactor the CLI workflow and keep tests green.",
    },
    complexity: "moderate",
    needsInvestigation: false,
    prefersParallel: false,
    wantsBackground: false,
    wantsSubagent: false,
    wantsTeammate: false,
    backgroundCommand: undefined,
    ...overrides,
  };
}

function createTask(kind: OrchestratorTaskKind, overrides: Partial<OrchestratorTaskSnapshot> = {}): OrchestratorTaskSnapshot {
  return {
    record: {
      id: kind === "survey" ? 1 : kind === "implementation" ? 2 : 3,
      subject: `${kind} task`,
      description: "",
      status: "pending",
      blockedBy: [],
      blocks: [],
      checklist: [],
      assignee: "",
      owner: "",
      worktree: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    meta: {
      key: "objective-1",
      kind,
      objective: "Refactor the CLI workflow and keep tests green.",
      executor:
        kind === "survey"
          ? "subagent"
          : kind === "validation"
            ? "background"
            : kind === "implementation"
              ? "teammate"
              : "lead",
      backgroundCommand: kind === "validation" ? "npm test -- --watch=false" : undefined,
    },
    ...overrides,
  };
}

function createProgress(overrides: Partial<OrchestratorProgressSnapshot> = {}): OrchestratorProgressSnapshot {
  return {
    rootDir: process.cwd(),
    cwd: process.cwd(),
    tasks: [],
    relevantTasks: [],
    readyTasks: [],
    runningBackgroundJobs: [],
    relevantBackgroundJobs: [],
    executions: [],
    activeExecutions: [],
    idleTeammates: [],
    workingTeammates: [],
    teammates: [],
    worktrees: [],
    protocolRequests: [],
    policy: {
      allowPlanDecisions: false,
      allowShutdownRequests: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

function createPlan(readyTasks: OrchestratorTaskSnapshot[] = []): OrchestratorTaskPlan {
  return {
    objective: {
      key: "objective-1",
      text: "Refactor the CLI workflow and keep tests green.",
    },
    createdTaskIds: [],
    tasks: readyTasks,
    readyTasks,
  };
}

test("routeOrchestratorAction keeps simple work on the lead", () => {
  const decision = routeOrchestratorAction({
    analysis: createAnalysis({
      complexity: "simple",
    }),
    progress: createProgress(),
    plan: createPlan(),
  });

  assert.equal(decision.action, "self_execute");
});

test("routeOrchestratorAction returns survey work to the lead with a delegation suggestion", () => {
  const surveyTask = createTask("survey");
  const decision = routeOrchestratorAction({
    analysis: createAnalysis({
      complexity: "complex",
      needsInvestigation: true,
    }),
    progress: createProgress({
      readyTasks: [surveyTask],
      relevantTasks: [surveyTask],
      tasks: [surveyTask.record],
    }),
    plan: createPlan([surveyTask]),
  });

  assert.equal(decision.action, "self_execute");
  assert.equal(decision.task?.record.id, surveyTask.record.id);
  assert.match(decision.reason, /may fit a subagent/i);
});

test("routeOrchestratorAction keeps unassigned implementation work on the lead", () => {
  const implementationTask = createTask("implementation");
  const decision = routeOrchestratorAction({
    analysis: createAnalysis({
      complexity: "complex",
      prefersParallel: true,
      wantsTeammate: true,
    }),
    progress: createProgress({
      readyTasks: [implementationTask],
      relevantTasks: [implementationTask],
      tasks: [implementationTask.record],
      idleTeammates: [
        {
          name: "alpha",
          role: "implementer",
          status: "idle",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      teammates: [
        {
          name: "alpha",
          role: "implementer",
          status: "idle",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }),
    plan: createPlan([implementationTask]),
  });

  assert.equal(decision.action, "self_execute");
  assert.doesNotMatch(decision.reason, /teammate|parallel/i);
});

test("routeOrchestratorAction returns background-suitable work to the lead with a lane suggestion", () => {
  const validationTask = createTask("validation");
  const decision = routeOrchestratorAction({
    analysis: createAnalysis({
      wantsBackground: true,
      backgroundCommand: "npm test -- --watch=false",
    }),
    progress: createProgress({
      readyTasks: [validationTask],
      relevantTasks: [validationTask],
      tasks: [validationTask.record],
    }),
    plan: createPlan([validationTask]),
  });

  assert.equal(decision.action, "self_execute");
  assert.equal(decision.task?.record.id, validationTask.record.id);
  assert.match(decision.reason, /may fit background execution/i);
});

test("routeOrchestratorAction waits when delegated work is already running and nothing else is ready", () => {
  const decision = routeOrchestratorAction({
    analysis: createAnalysis({
      complexity: "complex",
      prefersParallel: true,
    }),
    progress: createProgress({
      activeExecutions: [
        {
          id: "exec-bg-1",
          lane: "command",
          profile: "background",
          launch: "worker",
          requestedBy: "lead",
          actorName: "bg-job1",
          cwd: process.cwd(),
          status: "running",
          worktreePolicy: "none",
          command: "npm test",
          timeoutMs: 30_000,
          stallTimeoutMs: 30_000,
          boundary: resolveExecutionBoundary({
            profile: "background",
            timeoutMs: 30_000,
            stallTimeoutMs: 30_000,
          }),
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }),
    plan: createPlan(),
  });

  assert.equal(decision.action, "wait_for_existing_work");
});

test("routeOrchestratorAction waits for teammate-reserved work instead of redispatching it", () => {
  const reservedTask = createTask("implementation", {
    record: {
      id: 7,
      subject: "implementation task",
      description: "",
      status: "pending",
      blockedBy: [],
      blocks: [],
      checklist: [],
      assignee: "alpha",
      owner: "",
      worktree: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    meta: {
      key: "objective-1",
      kind: "implementation",
      objective: "Refactor the CLI workflow and keep tests green.",
      executor: "teammate",
    },
    lifecycle: {
      stage: "ready",
      runnableBy: {
        kind: "teammate",
        name: "alpha",
      },
      owner: {
        kind: "teammate",
        name: "alpha",
      },
      handoff: {
        kind: "teammate",
        target: "alpha",
        legal: true,
      },
      worktree: {
        status: "not_required",
      },
      reasonCode: "ready.teammate_reserved",
      reason: "Task #7 is reserved for teammate 'alpha'.",
      illegal: false,
    },
  });

  const decision = routeOrchestratorAction({
    analysis: createAnalysis({
      complexity: "complex",
      prefersParallel: true,
      wantsTeammate: true,
    }),
    progress: createProgress({
      relevantTasks: [reservedTask],
      tasks: [reservedTask.record],
      teammates: [
        {
          name: "alpha",
          role: "implementer",
          status: "working",
          pid: 4242,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      workingTeammates: [
        {
          name: "alpha",
          role: "implementer",
          status: "working",
          pid: 4242,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }),
    plan: createPlan([reservedTask]),
  });

  assert.equal(decision.action, "wait_for_existing_work");
});
