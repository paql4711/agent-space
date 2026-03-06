import * as vscode from "vscode";
import { getThemeColors } from "../constants/colors";
import type { ProjectManager } from "../projects/projectManager";
import type { Agent, Feature, Service } from "../types";
import { exec, getTerminalShellArgs } from "../utils/platform";
import type { CodingToolRegistry } from "./codingToolRegistry";
import type { TmuxIntegration } from "./tmux";

const AGENT_COLORS = getThemeColors();

export class TerminalController implements vscode.Disposable {
	private terminals = new Map<string, vscode.Terminal>();
	private disposables: vscode.Disposable[] = [];

	constructor(
		private readonly projectManager: ProjectManager,
		private readonly tmux: TmuxIntegration,
		private readonly toolRegistry: CodingToolRegistry,
	) {
		this.disposables.push(
			vscode.window.onDidCloseTerminal((terminal) => {
				for (const [agentId, t] of this.terminals) {
					if (t === terminal) {
						this.terminals.delete(agentId);
						break;
					}
				}
			}),
		);
	}

	createTerminal(
		feature: Feature,
		agent: Agent,
		agentIndex: number,
		resume = false,
	): vscode.Terminal | undefined {
		const name = `[${feature.name}] ${agent.name}`;
		const color = AGENT_COLORS[agentIndex % AGENT_COLORS.length];
		const cwd = agent.worktreePath ?? feature.worktreePath;

		const sessionName = this.tmux.sessionName(feature.id, agent.id);
		const legacySessionName = this.tmux.legacySessionName(feature.id, agent.id);
		let sessionReady = this.tmux.adoptSession(sessionName, legacySessionName);

		if (!sessionReady) {
			try {
				const tool = this.toolRegistry.resolveAgentTool(agent.toolId);
				const launchCommand = resume
					? this.toolRegistry.buildResumeLaunchCommand(tool, agent.sessionId)
					: this.toolRegistry.buildLaunchCommand(tool, agent.sessionId);
				exec(this.tmux.createCommand(sessionName, launchCommand), { cwd });
				this.tmux.configureSession(sessionName);
				sessionReady = this.tmux.isSessionAlive(sessionName);
			} catch (err) {
				console.warn(`[TerminalController] tmux session create failed: ${err}`);
				sessionReady = false;
			}
		}

		if (!sessionReady) {
			const tool = this.toolRegistry.resolveAgentTool(agent.toolId);
			void vscode.window.showErrorMessage(
				`Failed to start ${agent.name} with ${tool.name}. Check that the CLI is installed and launches from ${cwd}.`,
			);
			return undefined;
		}

		const { shellPath, shellArgs } = getTerminalShellArgs(sessionName);

		const terminal = vscode.window.createTerminal({
			name,
			shellPath,
			shellArgs,
			cwd,
			color,
			iconPath: new vscode.ThemeIcon("hubot"),
			location: vscode.TerminalLocation.Editor,
			isTransient: true,
		});

		this.terminals.set(agent.id, terminal);

		const ctx = this.projectManager.findContextByFeatureId(feature.id);
		if (ctx) {
			ctx.agentManager.updateAgentStatus(agent.id, feature.id, "running");
			this.projectManager.notifyChange();
		}

		return terminal;
	}

	focusOrCreateTerminal(
		feature: Feature,
		agent: Agent,
		agentIndex: number,
		resume = false,
	): vscode.Terminal | undefined {
		const existing = this.terminals.get(agent.id);
		if (existing) {
			existing.show();
			return existing;
		}
		return this.createTerminal(feature, agent, agentIndex, resume);
	}

	focusOrCreateServiceTerminal(
		feature: Feature,
		service: Service,
		cwd: string,
	): vscode.Terminal {
		const existing = this.terminals.get(service.id);
		if (existing) {
			existing.show();
			return existing;
		}
		return this.createServiceTerminal(feature, service, cwd);
	}

	createServiceTerminal(
		_feature: Feature,
		service: Service,
		cwd: string,
	): vscode.Terminal {
		const name = `svc: ${service.name}`;
		const sessionName = service.tmuxSession;

		if (!this.tmux.isSessionAlive(sessionName)) {
			try {
				exec(this.tmux.createCommand(sessionName, service.command), { cwd });
				this.tmux.configureServiceSession(sessionName);
			} catch (err) {
				console.warn(`[TerminalController] service tmux create failed: ${err}`);
			}
		}

		const { shellPath, shellArgs } = getTerminalShellArgs(sessionName);

		const terminal = vscode.window.createTerminal({
			name,
			shellPath,
			shellArgs,
			cwd,
			color: new vscode.ThemeColor("terminal.ansiWhite"),
			iconPath: new vscode.ThemeIcon("server-process"),
			location: vscode.TerminalLocation.Editor,
			isTransient: true,
		});

		this.terminals.set(service.id, terminal);
		return terminal;
	}

	getTerminal(agentId: string): vscode.Terminal | undefined {
		return this.terminals.get(agentId);
	}

	findAgentIdByTerminal(terminal: vscode.Terminal): string | undefined {
		for (const [agentId, t] of this.terminals) {
			if (t === terminal) return agentId;
		}
		return undefined;
	}

	renameTerminal(feature: Feature, agent: Agent, agentIndex: number): void {
		const existing = this.terminals.get(agent.id);
		if (!existing) return;

		// Dispose old terminal (detaches from tmux, session stays alive)
		existing.dispose();
		this.terminals.delete(agent.id);

		// Re-attach with updated name
		const name = `[${feature.name}] ${agent.name}`;
		const color = AGENT_COLORS[agentIndex % AGENT_COLORS.length];
		const cwd = agent.worktreePath ?? feature.worktreePath;
		const sessionName = this.tmux.sessionName(feature.id, agent.id);
		const legacySessionName = this.tmux.legacySessionName(feature.id, agent.id);
		this.tmux.adoptSession(sessionName, legacySessionName);

		const { shellPath, shellArgs } = getTerminalShellArgs(sessionName);

		const terminal = vscode.window.createTerminal({
			name,
			shellPath,
			shellArgs,
			cwd,
			color,
			iconPath: new vscode.ThemeIcon("hubot"),
			location: vscode.TerminalLocation.Editor,
			isTransient: true,
		});

		this.terminals.set(agent.id, terminal);
	}

	disposeFeatureTerminals(featureId: string): void {
		const ctx = this.projectManager.findContextByFeatureId(featureId);
		if (!ctx) return;

		const agents = ctx.agentManager.getAgents(featureId);
		for (const agent of agents) {
			const terminal = this.terminals.get(agent.id);
			if (terminal) {
				terminal.dispose();
				this.terminals.delete(agent.id);
			}
		}

		this.disposeFeatureServiceTerminals(featureId);
	}

	disposeFeatureServiceTerminals(featureId: string): void {
		const ctx = this.projectManager.findContextByFeatureId(featureId);
		if (!ctx) return;

		const services = ctx.serviceManager.getServices(featureId);
		for (const service of services) {
			const terminal = this.terminals.get(service.id);
			if (terminal) {
				terminal.dispose();
				this.terminals.delete(service.id);
			}
		}
	}

	killAgentTerminal(agentId: string, featureId: string): void {
		const terminal = this.terminals.get(agentId);
		if (terminal) {
			terminal.dispose();
			this.terminals.delete(agentId);
		}

		const sessionName = this.tmux.sessionName(featureId, agentId);
		this.tmux.killSession(sessionName);
	}

	killFeatureTerminals(featureId: string): void {
		const ctx = this.projectManager.findContextByFeatureId(featureId);
		if (!ctx) return;

		const agents = ctx.agentManager.getAgents(featureId);
		for (const agent of agents) {
			this.killAgentTerminal(agent.id, featureId);
		}

		this.killFeatureServiceTerminals(featureId);
	}

	killServiceTerminal(serviceId: string, tmuxSession: string): void {
		const terminal = this.terminals.get(serviceId);
		if (terminal) {
			terminal.dispose();
			this.terminals.delete(serviceId);
		}
		this.tmux.killSession(tmuxSession);
	}

	killFeatureServiceTerminals(featureId: string): void {
		const ctx = this.projectManager.findContextByFeatureId(featureId);
		if (!ctx) return;

		const services = ctx.serviceManager.getServices(featureId);
		for (const service of services) {
			this.killServiceTerminal(service.id, service.tmuxSession);
		}
	}

	reconnectTmuxSessions(feature: Feature): void {
		const ctx = this.projectManager.findContextByFeatureId(feature.id);
		if (!ctx) return;

		const agents = ctx.agentManager.getAgents(feature.id);
		for (let i = 0; i < agents.length; i++) {
			const agent = agents[i];
			if (agent.status === "done") continue;
			if (this.terminals.has(agent.id)) continue;

			const sessionName = this.tmux.sessionName(feature.id, agent.id);
			const legacySessionName = this.tmux.legacySessionName(feature.id, agent.id);
			const isAlive = this.tmux.adoptSession(sessionName, legacySessionName);

			if (isAlive) {
				// Tmux session alive — just reattach
				this.createTerminal(feature, agent, i);
			} else {
				// Tmux session dead — respawn with resume command
				this.createTerminal(feature, agent, i, true);
			}
		}
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
