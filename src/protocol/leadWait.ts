export const LEAD_WAIT_PROTOCOL = "kitty.lead-wait-policy" as const;

export const LEAD_WAIT_TERMINAL_STATUSES = ["completed", "failed", "aborted", "paused"] as const;

export type LeadWaitMode = "none" | "while_execution_active";
export type LeadWakePolicy = "optional" | "required";
export type LeadWaitScope = "global" | "objective" | "task";
export type LeadWaitTerminalStatus = typeof LEAD_WAIT_TERMINAL_STATUSES[number];

export interface LeadWaitPolicy {
  protocol: typeof LEAD_WAIT_PROTOCOL;
  lead: LeadWaitMode;
  wake: LeadWakePolicy;
  scope: LeadWaitScope;
  terminalStatuses: readonly LeadWaitTerminalStatus[];
}

export type LeadWaitPolicyInput = Partial<Omit<LeadWaitPolicy, "protocol">>;

export function createLeadWaitPolicy(input: {
  lead?: LeadWaitMode;
  wake?: LeadWakePolicy;
  scope?: LeadWaitScope;
  terminalStatuses?: readonly LeadWaitTerminalStatus[];
} = {}): LeadWaitPolicy {
  const lead = input.lead ?? "none";
  const wake = input.wake ?? (lead === "while_execution_active" ? "required" : "optional");
  const policy: LeadWaitPolicy = {
    protocol: LEAD_WAIT_PROTOCOL,
    lead,
    wake,
    scope: input.scope ?? "objective",
    terminalStatuses: [...(input.terminalStatuses ?? LEAD_WAIT_TERMINAL_STATUSES)],
  };
  assertLeadWaitPolicy(policy);
  return policy;
}

export function createLeadWaitPolicyForRunner(input: {
  createsExecution: boolean;
  emitsWakeSignal: boolean;
  policy?: LeadWaitPolicyInput;
}): LeadWaitPolicy {
  if (input.policy) {
    return createLeadWaitPolicy(input.policy);
  }

  return createLeadWaitPolicy({
    lead: input.createsExecution && input.emitsWakeSignal ? "while_execution_active" : "none",
    wake: input.emitsWakeSignal ? "required" : "optional",
  });
}

export function assertLeadWaitPolicy(policy: LeadWaitPolicy): void {
  if (policy.protocol !== LEAD_WAIT_PROTOCOL) {
    throw new Error(`Unsupported Lead wait policy protocol '${String(policy.protocol)}'.`);
  }
  if (policy.lead !== "none" && policy.lead !== "while_execution_active") {
    throw new Error(`Unsupported Lead wait mode '${String(policy.lead)}'.`);
  }
  if (policy.wake !== "optional" && policy.wake !== "required") {
    throw new Error(`Unsupported Lead wake policy '${String(policy.wake)}'.`);
  }
  if (policy.scope !== "global" && policy.scope !== "objective" && policy.scope !== "task") {
    throw new Error(`Unsupported Lead wait scope '${String(policy.scope)}'.`);
  }
  if (policy.lead === "while_execution_active" && policy.wake !== "required") {
    throw new Error("Lead-blocking executions must publish a required wake signal.");
  }
  if (policy.terminalStatuses.length === 0) {
    throw new Error("Lead wait policy must define at least one terminal status.");
  }
  for (const status of policy.terminalStatuses) {
    if (!(LEAD_WAIT_TERMINAL_STATUSES as readonly string[]).includes(status)) {
      throw new Error(`Unsupported Lead wait terminal status '${String(status)}'.`);
    }
  }
}

export function isLeadBlockingPolicy(policy: LeadWaitPolicy | undefined): boolean {
  return policy?.lead === "while_execution_active";
}

export function normalizeLeadWaitPolicy(value: unknown): LeadWaitPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createLeadWaitPolicy();
  }

  const record = value as Record<string, unknown>;
  return createLeadWaitPolicy({
    lead: record.lead === "while_execution_active" ? "while_execution_active" : "none",
    wake: record.wake === "required" ? "required" : "optional",
    scope: record.scope === "global" || record.scope === "task" ? record.scope : "objective",
    terminalStatuses: Array.isArray(record.terminalStatuses)
      ? record.terminalStatuses.filter((status): status is LeadWaitTerminalStatus =>
          (LEAD_WAIT_TERMINAL_STATUSES as readonly string[]).includes(String(status)))
      : undefined,
  });
}
