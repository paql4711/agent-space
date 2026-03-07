export type FeatureStatus = "active" | "done";
export type AgentStatus = "running" | "idle" | "stopped" | "done" | "errored";
export type IsolationMode = "shared" | "per-agent";

export interface Feature {
	id: string;
	name: string;
	branch: string;
	worktreePath: string;
	status: FeatureStatus;
	color: string;
	isolation: IsolationMode;
	createdAt: string;
}

export interface CodingTool {
	id: string;
	name: string;
	command: string;
	args?: string[];
}

export interface Agent {
	id: string;
	featureId: string;
	name: string;
	sessionId: string | null;
	worktreePath?: string;
	tmuxSession?: string;
	toolId?: string;
	status: AgentStatus;
	hasStarted?: boolean;
	lastError?: string;
	lastExitCode?: number | null;
	createdAt: string;
}

export interface CompanionState {
	features: Feature[];
}

export interface FeatureAgents {
	agents: Agent[];
}

export interface Project {
	id: string;
	name: string;
	repoPath: string;
}

export type ServiceStatus = "running" | "stopped" | "errored";

export interface Service {
	id: string;
	featureId: string;
	name: string;
	command: string;
	launchCommand?: string | null;
	tmuxSession: string;
	status: ServiceStatus;
	createdAt: string;
}

export interface FeatureServices {
	services: Service[];
}
