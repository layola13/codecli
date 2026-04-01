/**
 * Data models for the Context Compression Engine.
 * These map to the Python structures used in session_state.py.
 */

export enum DecisionStatus {
    PROPOSED = "proposed",
    ACCEPTED = "accepted",
    REJECTED = "rejected",
    SUPERSEDED = "superseded"
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

export interface SessionState {
    primaryGoal: string;
    decisions: Decision[];
    constraints: Constraint[];
    tasks: TaskRecord[];
    lastUpdatedTurn: number;
}
