export type TeamMemberStatus = "working" | "idle" | "shutdown";

export const TEAM_PROTOCOL_VERSION = 2;

export const PROTOCOL_REQUEST_KINDS = ["shutdown", "plan_approval"] as const;

export type ProtocolRequestKind = (typeof PROTOCOL_REQUEST_KINDS)[number];

export type ProtocolRequestStatus = "pending" | "approved" | "rejected";

export interface ProtocolDecisionRecord {
  approve: boolean;
  feedback?: string;
  respondedBy: string;
  respondedAt: string;
}

export interface ProtocolRequestRecord {
  id: string;
  kind: ProtocolRequestKind;
  from: string;
  to: string;
  subject: string;
  content: string;
  status: ProtocolRequestStatus;
  decision?: ProtocolDecisionRecord;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberRecord {
  name: string;
  role: string;
  status: TeamMemberStatus;
  sessionId?: string;
  pid?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamConfigRecord {
  teamName: string;
  members: TeamMemberRecord[];
}

export interface CoordinationPolicyRecord {
  allowPlanDecisions: boolean;
  allowShutdownRequests: boolean;
  updatedAt: string;
}

export type TeamMessageType =
  | "message"
  | "broadcast"
  | "background_result"
  | "protocol_request"
  | "protocol_response";

export interface TeamMessageRecord {
  protocolVersion: number;
  type: TeamMessageType;
  from: string;
  to?: string;
  content: string;
  timestamp: number;
  protocolKind?: ProtocolRequestKind;
  requestId?: string;
  subject?: string;
  approve?: boolean;
  feedback?: string;
  jobId?: string;
  jobStatus?: string;
  exitCode?: number;
}
