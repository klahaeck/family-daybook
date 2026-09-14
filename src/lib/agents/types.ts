export type AgentConfirmationKind =
  | "care_entry_correction"
  | "day_finalization";

export interface AgentRequestAttribution {
  source: "mcp";
  oauthClientId: string;
  toolName?: string;
  operationId?: string;
  inputHash?: string;
  expectedRecordVersion?: string;
  expectedDayVersion?: string;
  confirmationTokenHash?: string;
  confirmationKind?: AgentConfirmationKind;
}

export interface AgentOperationReceipt {
  id: string;
  workspaceId: string;
  memberId: string;
  oauthClientId: string;
  operationId: string;
  toolName: string;
  inputHash: string;
  result: unknown;
  createdAt: Date;
  expiresAt: Date;
}

export interface AgentConfirmation {
  id: string;
  tokenHash: string;
  workspaceId: string;
  memberId: string;
  oauthClientId: string;
  kind: AgentConfirmationKind;
  targetId: string;
  baseVersion: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
  consumedAt?: Date;
  consumedByOperationId?: string;
}
