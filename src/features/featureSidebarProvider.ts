import * as vscode from "vscode";
import type { AgentManager } from "../agents/agentManager";
import type { CodingToolRegistry } from "../agents/codingToolRegistry";
import type { TerminalController } from "../agents/terminalController";
import { TERMINAL_COLOR_HEX } from "../constants/colors";
import {
	ICON_ADD_AGENT,
	ICON_ADD_SERVICE,
	ICON_CHEVRON_DOWN,
	ICON_CHEVRON_RIGHT,
	ICON_DELETE,
	ICON_REMOVE,
	ICON_RESTART,
	ICON_STOP,
	ICON_SYNC,
} from "../constants/icons";
import type {
	ProjectContext,
	ProjectManager,
} from "../projects/projectManager";
import type { ServiceManager } from "../services/serviceManager";
import type { Feature } from "../types";

export class FeatureSidebarProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "agentSpace.features";
	private _view?: vscode.WebviewView;
	private _onVisibilityChange?: (visible: boolean) => void;

	private terminalController?: TerminalController;

	constructor(
		private readonly projectManager: ProjectManager,
		private readonly toolRegistry: CodingToolRegistry,
		_prerequisites: unknown,
		private readonly extensionUri: vscode.Uri,
	) {}

	setTerminalController(controller: TerminalController): void {
		this.terminalController = controller;
	}

	onVisibilityChange(callback: (visible: boolean) => void): void {
		this._onVisibilityChange = callback;
		if (this._view) {
			callback(this._view.visible);
		}
	}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.extensionUri, "media", "webview"),
			],
		};
		webviewView.webview.html = this.getHtml();

		webviewView.onDidChangeVisibility(() => {
			this._onVisibilityChange?.(webviewView.visible);
		});

		webviewView.webview.onDidReceiveMessage((message) => {
			const run = (cmd: string, ...args: unknown[]) => {
				vscode.commands.executeCommand(cmd, ...args).then(undefined, () => {});
			};
			switch (message.command) {
				case "selectFeature":
					run("agentSpace.selectFeature", message.featureId);
					break;
				case "newFeature":
					run("agentSpace.newFeature", message.projectId);
					break;
				case "addAgent":
					run("agentSpace.addAgent", message.featureId);
					break;
				case "deleteFeature":
					run("agentSpace.deleteFeature", message.featureId);
					break;
				case "createPR":
					run("agentSpace.createPR", message.featureId);
					break;
				case "closeAgent":
					run("agentSpace.closeAgent", message.featureId, message.agentId);
					break;
				case "renameAgent":
					this.handleRenameAgent(message.featureId, message.agentId);
					break;
				case "toggleIsolation":
					run("agentSpace.toggleIsolation", message.featureId);
					break;
				case "addProject":
					run("agentSpace.addProject");
					break;
				case "removeProject":
					run("agentSpace.removeProject");
					break;
				case "addService":
					run("agentSpace.addService", message.featureId);
					break;
				case "syncNames":
					run("agentSpace.syncSessionNames");
					break;
				case "stopService":
					this.handleStopService(message.featureId, message.serviceId);
					break;
				case "restartService":
					this.handleRestartService(message.featureId, message.serviceId);
					break;
				case "reopenAgent":
					run("agentSpace.reopenAgent", message.featureId, message.agentId);
					break;
				case "focusAgent":
					this.handleFocusAgent(message.featureId, message.agentId);
					break;
				case "focusService":
					this.handleFocusService(message.featureId, message.serviceId);
					break;
				case "openWorkspace":
					run("agentSpace.openWorkspace", message.featureId);
					break;
			}
		});
	}

	refresh(): void {
		try {
			if (this._view) {
				this._view.webview.html = this.getHtml();
			}
		} catch {
			// Webview may have been disposed; swallow to prevent cascade
		}
	}

	private handleStopService(featureId: string, serviceId: string): void {
		const ctx = this.projectManager.findContextByFeatureId(featureId);
		if (!ctx) return;
		const service = ctx.serviceManager
			.getServices(featureId)
			.find((candidate) => candidate.id === serviceId);
		if (service && this.terminalController) {
			this.terminalController.killServiceTerminal(
				service.id,
				service.tmuxSession,
			);
		}
		ctx.serviceManager.stopService(serviceId, featureId);
		this.projectManager.notifyChange();
	}

	private handleRestartService(featureId: string, serviceId: string): void {
		const ctx = this.projectManager.findContextByFeatureId(featureId);
		if (!ctx) return;
		const feature = ctx.featureManager.getFeature(featureId);
		if (!feature) return;
		ctx.serviceManager.restartService(
			serviceId,
			featureId,
			feature.worktreePath,
		);
		this.projectManager.notifyChange();
	}

	private async handleRenameAgent(
		featureId: string,
		agentId: string,
	): Promise<void> {
		const ctx = this.projectManager.findContextByFeatureId(featureId);
		if (!ctx) return;

		const agents = ctx.agentManager.getAgents(featureId);
		const agent = agents.find((a) => a.id === agentId);
		if (!agent) return;

		const newName = await vscode.window.showInputBox({
			prompt: "Rename agent",
			value: agent.name,
			validateInput: (v) => (v.trim() ? undefined : "Name is required"),
		});
		if (!newName) return;

		ctx.agentManager.renameAgent(agentId, featureId, newName.trim());

		// Re-create the VS Code terminal tab with the new name
		const feature = ctx.featureManager.getFeature(featureId);
		if (this.terminalController && feature) {
			const updatedAgent = ctx.agentManager
				.getAgents(featureId)
				.find((a) => a.id === agentId);
			if (updatedAgent) {
				const agentIndex = ctx.agentManager
					.getAgents(featureId)
					.findIndex((a) => a.id === agentId);
				this.terminalController.renameTerminal(
					feature,
					updatedAgent,
					agentIndex,
				);
			}
		}

		this.projectManager.notifyChange();
	}

	private handleFocusAgent(featureId: string, agentId: string): void {
		if (!this.terminalController) return;
		const ctx = this.projectManager.findContextByFeatureId(featureId);
		if (!ctx) return;
		const feature = ctx.featureManager.getFeature(featureId);
		if (!feature) return;
		const agents = ctx.agentManager.getAgents(featureId);
		const agent = agents.find((a) => a.id === agentId);
		if (!agent) return;
		const agentIndex = agents.indexOf(agent);
		this.terminalController.focusOrCreateTerminal(
			feature,
			agent,
			agentIndex,
			true,
		);
	}

	private handleFocusService(featureId: string, serviceId: string): void {
		if (!this.terminalController) return;
		const ctx = this.projectManager.findContextByFeatureId(featureId);
		if (!ctx) return;
		const feature = ctx.featureManager.getFeature(featureId);
		if (!feature) return;
		const services = ctx.serviceManager.getServices(featureId);
		const service = services.find((s) => s.id === serviceId);
		if (!service) return;
		this.terminalController.focusOrCreateServiceTerminal(
			feature,
			service,
			feature.worktreePath,
		);
	}

	private getHtml(): string {
		const webview = this._view?.webview;
		if (!webview) return "";
		const cssUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "media", "webview", "sidebar.css"),
		);
		const jsUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "media", "webview", "sidebar.js"),
		);

		const contexts = this.projectManager.getAllContexts();

		let body: string;
		if (contexts.length === 0) {
			body = `
				<button class="btn-secondary" onclick="send('addProject')">Add Project</button>
				<div class="empty-state">
					<div style="font-size: 24px; opacity: 0.3; margin-bottom: 8px;">Waiting for projects...</div>
					<p>No projects registered</p>
					<button class="btn-primary" onclick="send('addProject')">Add Project</button>
				</div>`;
		} else {
			const sections = contexts
				.map((ctx) => this.renderProjectSection(ctx))
				.join("");
			body = `
				<button class="btn-secondary" onclick="send('addProject')">Add Project</button>
				${sections}`;
		}

		return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${cssUri}">
</head>
<body>
	${body}
	<div id="agentContextMenu" class="context-menu">
		<button class="context-menu-item" id="menuRename">Rename Agent</button>
        <div class="context-separator"></div>
		<button class="context-menu-item" id="menuMarkDone">Mark as Done</button>
	</div>
	<script src="${jsUri}"></script>
</body>
</html>`;
	}

	private renderProjectSection(ctx: ProjectContext): string {
		const { project } = ctx;
		const features = [...ctx.featureManager.getFeatures()].sort((a, b) => {
			if (a.kind !== b.kind) {
				return a.kind === "base" ? -1 : 1;
			}
			return b.createdAt.localeCompare(a.createdAt);
		});
		const featureCards = features
			.map((f) =>
				this.renderFeatureCard(f, ctx.agentManager, ctx.serviceManager),
			)
			.join("");

		return `
		<div class="project-section">
			<div class="project-header" onclick="toggleProject('${project.id}')">
				<span class="project-toggle" id="project-toggle-${project.id}">${ICON_CHEVRON_DOWN}</span>
				<span class="project-name">${this.escapeHtml(project.name)}</span>
				<span class="project-path" title="${this.escapeHtml(project.repoPath)}">${this.escapeHtml(project.repoPath)}</span>
				<button class="project-remove-btn" onclick="removeProject(event)" title="Remove Project">${ICON_REMOVE}</button>
			</div>
			<div class="project-body" id="project-body-${project.id}">
				<button class="btn-primary" onclick="newFeature(event, '${project.id}')">
                    <span>+</span> New Feature
                </button>
				${featureCards || '<div class="empty-placeholder">No workspaces yet</div>'}
			</div>
		</div>`;
	}

	private renderFeatureCard(
		feature: Feature,
		agentManager: AgentManager,
		serviceManager: ServiceManager,
	): string {
		const agents = agentManager.getAgents(feature.id);
		const defaultToolId = this.toolRegistry.getDefaultToolId();

		const activeAgents = agents.filter((a) => a.status !== "done");
		const doneAgents = agents.filter((a) => a.status === "done");

		const renderAgentCard = (a: (typeof agents)[number], i: number) => {
			const tool = this.toolRegistry.resolveAgentTool(a.toolId);
			const toolLabel =
				tool.id !== defaultToolId
					? ` &middot; ${this.escapeHtml(tool.name)}`
					: "";
			const agentColor = TERMINAL_COLOR_HEX[i % TERMINAL_COLOR_HEX.length];

			let statusClass = "idle";
			if (a.status === "running") statusClass = "running";
			if (a.status === "stopped") statusClass = "stopped";
			if (a.status === "done") statusClass = "done";
			if (a.status === "errored") statusClass = "errored";
			const errorNote = a.lastError
				? `<div class="agent-error-note" title="${this.escapeHtml(a.lastError)}">${this.escapeHtml(a.lastError)}</div>`
				: "";

			return `
		<div class="agent-card ${statusClass}"
			onclick="focusAgent(event, '${feature.id}', '${a.id}')"
			oncontextmenu="showAgentMenu(event, '${feature.id}', '${a.id}')">
            <div class="agent-color-bar" style="background-color: ${agentColor}"></div>
            <div class="status-dot ${statusClass}"></div>
			<div class="agent-copy">
				<span class="agent-name" title="${this.escapeHtml(a.name)}">${this.escapeHtml(a.name)}<span class="agent-tool">${toolLabel}</span></span>
				${errorNote}
			</div>
		</div>`;
		};

		const activeCards = activeAgents
			.map((a) => renderAgentCard(a, agents.indexOf(a)))
			.join("");

		let disabledHtml = "";
		if (doneAgents.length > 0) {
			const doneCards = doneAgents
				.map((a) => {
					const i = agents.indexOf(a);
					const agentColor = TERMINAL_COLOR_HEX[i % TERMINAL_COLOR_HEX.length];
					return `
		<div class="agent-card done" oncontextmenu="showAgentMenu(event, '${feature.id}', '${a.id}')">
            <div class="agent-color-bar" style="background-color: ${agentColor}"></div>
            <div class="status-dot done"></div>
			<span class="agent-name">${this.escapeHtml(a.name)}</span>
			<button class="action-btn" onclick="reopenAgent(event, '${feature.id}', '${a.id}')" title="Re-enable agent">${ICON_RESTART}</button>
		</div>`;
				})
				.join("");

			disabledHtml = `
		<div class="disabled-header collapsed" onclick="toggleDisabled(event, '${feature.id}')">
			<span class="disabled-icon" id="disabled-toggle-${feature.id}">${ICON_CHEVRON_RIGHT}</span>
			<span>${doneAgents.length} finished</span>
		</div>
		<div class="disabled-list collapsed" id="disabled-list-${feature.id}">
			${doneCards}
		</div>`;
		}

		const agentsHtml = `
    <div class="section-header">
        <span class="section-label">Agents</span>
        ${activeAgents.length > 0 ? `<span class="agent-count">${activeAgents.length}</span>` : ""}
        <button class="action-btn sync-btn" onclick="syncNames(event)" title="Sync Names">${ICON_SYNC}</button>
    </div>
	<div class="agent-list">
        ${activeCards || '<div class="empty-placeholder">Click + to add an agent</div>'}
    </div>
	${disabledHtml}`;

		const services = serviceManager.getServices(feature.id);
		let servicesHtml = "";
		if (services.length > 0) {
			const activeServices = services.filter((s) => s.status === "running");
			const stoppedServices = services.filter((s) => s.status !== "running");

			const renderServiceCard = (s: (typeof services)[number]) => `
			<div class="service-card ${s.status}" onclick="focusService(event, '${feature.id}', '${s.id}')">
				<div class="service-header">
					<span class="service-name" title="${this.escapeHtml(s.command)}">${this.escapeHtml(s.name)}</span>
                    <div class="service-actions">
                        ${
													s.status === "running"
														? `<button class="action-btn" onclick="stopService(event, '${feature.id}', '${s.id}')" title="Stop">${ICON_STOP}</button>`
														: `<button class="action-btn" onclick="restartService(event, '${feature.id}', '${s.id}')" title="Start">${ICON_RESTART}</button>`
												}
                    </div>
				</div>
				<div class="service-command">${this.escapeHtml(s.command)}</div>
			</div>`;

			const activeServiceCards = activeServices.map(renderServiceCard).join("");

			let stoppedServicesHtml = "";
			if (stoppedServices.length > 0) {
				const stoppedCards = stoppedServices.map(renderServiceCard).join("");
				stoppedServicesHtml = `
		<div class="disabled-header collapsed" onclick="toggleStoppedServices(event, '${feature.id}')">
			<span class="disabled-icon" id="stopped-svc-toggle-${feature.id}">${ICON_CHEVRON_RIGHT}</span>
			<span>${stoppedServices.length} stopped</span>
		</div>
		<div class="disabled-list collapsed" id="stopped-svc-list-${feature.id}">
			${stoppedCards}
		</div>`;
			}

			servicesHtml = `
		<div class="services-section">
			<div class="section-header"><span class="section-label">Services</span></div>
			<div class="service-list">${activeServiceCards || '<div class="empty-placeholder">No running services</div>'}</div>
			${stoppedServicesHtml}
		</div>`;
		}

		return `
		<div class="feature-card" onclick="selectFeature('${feature.id}')">
			<div class="card-header">
				<span class="feature-name">${this.escapeHtml(this.workspaceLabel(feature))}</span>
				<span class="status-badge status-${feature.status}">${feature.status === "done" ? "Done" : "Active"}</span>
				${
					feature.kind === "feature"
						? `<button class="delete-btn" onclick="deleteFeature(event, '${feature.id}')" title="Delete Workspace">${ICON_DELETE}</button>`
						: ""
				}
			</div>
			${agentsHtml}
			${servicesHtml}
			<div class="feature-quick-actions">
				<button class="action-btn" onclick="addAgent(event, '${feature.id}')" title="Add Agent">${ICON_ADD_AGENT}</button>
				<button class="action-btn" onclick="addService(event, '${feature.id}')" title="Add Service">${ICON_ADD_SERVICE}</button>
			</div>
		</div>`;
	}

	private workspaceLabel(feature: Feature): string {
		return feature.kind === "base"
			? `${feature.name} (${feature.branch})`
			: feature.branch;
	}

	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}
}
