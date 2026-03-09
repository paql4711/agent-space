export type FeatureStatus = "active" | "done";
export type AgentStatus = "running" | "idle" | "stopped" | "done" | "errored";
export type IsolationMode = "shared" | "per-agent";
export type WorkspaceKind = "base" | "feature";
export type WorkspaceManagedBy = "builtin" | "user";

export interface Feature {
	id: string;
	name: string;
	branch: string;
	worktreePath: string;
	status: FeatureStatus;
	color: string;
	isolation: IsolationMode;
	createdAt: string;
	kind: WorkspaceKind;
	managed: WorkspaceManagedBy;
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

export type ProjectCommandGroup = "git" | "app" | "test";
export type ProjectCommandCwdMode = "workspace" | "repoRoot";

export interface ProjectCommand {
	id: string;
	label: string;
	command: string;
	cwdMode: ProjectCommandCwdMode;
	group: ProjectCommandGroup;
}

export interface ProjectSettings {
	customCommands: ProjectCommand[];
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
