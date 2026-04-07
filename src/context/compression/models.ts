/**
 * Data models for the Context Compression Engine.
 * These map to the Python structures used in session_state.py.
 */

export enum DecisionStatus {
  PROPOSED = "proposed",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  SUPERSEDED = "superseded",
  REVERTED = "reverted",
}

export enum FactConfidence {
  CERTAIN = "certain",
  INFERRED = "inferred",
  UNCERTAIN = "uncertain",
}

export enum TaskStatus {
  PLANNED = "planned",
  IN_PROGRESS = "in_progress",
  BLOCKED = "blocked",
  DONE = "done",
  ABANDONED = "abandoned",
}

export interface Decision {
  id: string;
  topic: string;
  choice: string;
  alternativesRejected: string[];
  reason: string;
  status: DecisionStatus;
  turn: number;
}

export interface Constraint {
  id: string;
  category: "technology" | "architecture" | "style" | "process";
  rule: string;
  reason: string;
  severity: "hard" | "soft";
  turn: number;
  isActive: boolean;
}

export interface TaskRecord {
  id: string;
  description: string;
  status: "planned" | "in_progress" | "blocked" | "done" | "abandoned";
  completedSubtasks: string[];
  remainingSubtasks: string[];
  artifacts: string[];
  turn: number;
}

export interface KnowledgeFact {
  key: string;
  value: string;
  category: string;
  confidence: FactConfidence;
  sourceTurn: number;
  linkedSkeleton?: string;
}

export interface CodeAnchor {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  symbolName: string;
  skeletonPath?: string;
  action: string;
  turn: number;
  note: string;
}

export interface ErrorMemory {
  approach: string;
  failureReason: string;
  turn: number;
  relatedFiles: string[];
}

export type ConversationLinkKind =
  | "assistant_response"
  | "continues"
  | "shared_file"
  | "shared_task"
  | "shared_constraint"
  | "shared_decision"
  | "same_topic";

export interface ConversationLink {
  kind: ConversationLinkKind;
  targetTurn: number;
  note: string;
}

export interface ConversationTurnRecord {
  turn: number;
  role: "user" | "assistant";
  signature: string;
  summary: string;
  referencedFiles: string[];
  tasks: string[];
  constraints: string[];
  decisions: string[];
  facts: string[];
  links: ConversationLink[];
}

export interface SessionState {
  // 保留原有字段
  primaryGoal: string;
  decisions: Decision[];
  constraints: Constraint[];
  tasks: TaskRecord[];
  lastUpdatedTurn: number;
  // 新增可选字段
  sessionId?: string;
  goalStatus?: string;
  totalTurns?: number;
  projectName?: string;
  projectType?: string;
  techStack?: string[];
  architectureStyle?: string;
  facts?: KnowledgeFact[];
  codeAnchors?: CodeAnchor[];
  errorMemories?: ErrorMemory[];
  secondaryGoals?: string[];
  preferences?: Record<string, string>;
  rawCharsIngested?: number;
  compressedChars?: number;
  lastTurnSignature?: string;
  conversationTurns?: ConversationTurnRecord[];
}
