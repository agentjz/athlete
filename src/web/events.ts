export type WorkbenchEvent =
  | { type: "server.ready"; cwd: string; projectName: string; sessionId?: string; createdAt: string }
  | { type: "project.updated"; cwd: string; projectName: string; mode: WorkbenchMode; activeSpec?: WorkbenchSpecSummary; createdAt: string }
  | { type: "session.status"; status: "idle" | "running" | "error"; message?: string; createdAt: string }
  | { type: "execution.started"; profile: "teammate" | "subagent" | "background" | "dreaming"; actorName: string; executionId: string; summary?: string; createdAt: string }
  | { type: "execution.foreground"; executionId: string; label: string; streamPath: string; createdAt: string }
  | { type: "runtime.line"; channel: WorkbenchRuntimeChannel; kind: WorkbenchRuntimeLineKind; label?: string; message: string; detail?: string; executionId?: string; createdAt: string }
  | { type: "execution.finished"; status: "completed" | "paused" | "aborted" | "failed"; createdAt: string }
  | { type: "assistant.done"; createdAt: string }
  | { type: "tool.call"; name: string; args: string; createdAt: string }
  | { type: "tool.result"; name: string; output: string; createdAt: string }
  | { type: "tool.error"; name: string; error: string; createdAt: string }
  | { type: "todo.updated"; items: WorkbenchTodoItem[]; createdAt: string }
  | { type: "file.changed"; paths: string[]; createdAt: string }
  | { type: "git.status"; files: GitStatusFile[]; createdAt: string }
  | { type: "runtime.error"; message: string; createdAt: string };

export interface GitStatusFile {
  path: string;
  index: string;
  workingTree: string;
  ignored?: boolean;
}

export interface WorkbenchTodoItem {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed";
}

export type WorkbenchMode = "agent" | "spec";

export type WorkbenchRuntimeChannel = "lead" | "dream" | "workflow" | "subagent" | "team" | "background" | "system";

export type WorkbenchRuntimeLineKind = "assistant" | "reasoning" | "tool" | "result" | "dispatch" | "foreground" | "status" | "error";

export interface WorkbenchRuntimeLineEvent {
  type: "runtime.line";
  channel: WorkbenchRuntimeChannel;
  kind: WorkbenchRuntimeLineKind;
  label?: string;
  message: string;
  detail?: string;
  executionId?: string;
  createdAt: string;
}

export interface WorkbenchSpecSummary {
  id: string;
  title: string;
  stage: string;
  status: string;
  workspace?: {
    path: string;
    branch: string;
  };
}

export function nowEventTime(): string {
  return new Date().toISOString();
}
