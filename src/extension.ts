import { execSync } from "node:child_process";
import * as vscode from "vscode";
import { CodingToolRegistry } from "./agents/codingToolRegistry";
import { SessionNameSyncer } from "./agents/sessionNameSyncer";
import { ClaudeSessionProvider } from "./agents/sessionProviders/claudeSessionProvider";
import { CodexSessionProvider } from "./agents/sessionProviders/codexSessionProvider";
import { CodexSessionWatcher } from "./agents/sessionProviders/codexSessionWatcher";
import { TerminalController } from "./agents/terminalController";
import { TmuxIntegration } from "./agents/tmux";
import { FeatureSidebarProvider } from "./features/featureSidebarProvider";
import { HomePanel } from "./home/homePanel";
import { PrerequisiteChecker } from "./prerequisites";
import { ProjectManager } from "./projects/projectManager";
import { GlobalStore } from "./storage/globalStore";

let activeFeatureId: string | null = null;

export function activate(context: vscode.ExtensionContext): void {
	const prerequisites = new PrerequisiteChecker();
	const { ok, missing } = prerequisites.checkRequired();
	if (!ok) {
		prerequisites.showMissingToolsError(missing);
		return;
	}

	const tmux = new TmuxIntegration();

	const storagePath = context.globalStorageUri.fsPath;
	const globalStore = new GlobalStore(storagePath);

	// One-time migration from Memento to file-based GlobalStore
	if (!globalStore.hasProjectsFile()) {
		const oldProjects = context.globalState.get<unknown[]>("projects");
		if (oldProjects && oldProjects.length > 0) {
			globalStore.saveProjects(oldProjects as import("./types").Project[]);
		}
		const oldFeatureId = context.globalState.get<string>("lastActiveFeatureId");
		if (oldFeatureId) {
			globalStore.setPreference("lastActiveFeatureId", oldFeatureId);
		}
		context.globalState.update("projects", undefined);
		context.globalState.update("lastActiveFeatureId", undefined);
	}

	const worktreeRelativePath = vscode.workspace
		.getConfiguration("agentSpace")
		.get<string>("worktreeBasePath", ".worktrees");

	const projectManager = new ProjectManager(
		globalStore,
		storagePath,
		worktreeRelativePath,
		tmux,
	);

	// Cross-window sync via VS Code's native file watcher
	const storageWatcher = vscode.workspace.createFileSystemWatcher(
		new vscode.RelativePattern(context.globalStorageUri, "**/*.json"),
	);
	storageWatcher.onDidChange((uri) =>
		projectManager.handleExternalFileChange(uri),
	);
	storageWatcher.onDidCreate((uri) =>
		projectManager.handleExternalFileChange(uri),
	);
	storageWatcher.onDidDelete((uri) =>
		projectManager.handleExternalFileChange(uri),
	);
	context.subscriptions.push(storageWatcher);

	const toolRegistry = new CodingToolRegistry();
	const defaultTool = toolRegistry.resolveAgentTool(toolRegistry.getDefaultToolId());
	const availableTools = toolRegistry.getAvailableTools();
	if (availableTools.length === 0) {
		vscode.window.showWarningMessage(
			"No coding tools found on PATH. Install one of: claude, copilot, codex, opencode.",
		);
	} else if (!toolRegistry.isToolAvailable(defaultTool)) {
		vscode.window.showWarningMessage(
			`${defaultTool.name} CLI not found. New agents will use ${availableTools[0].name} until the default tool is installed.`,
		);
	}

	const terminalController = new TerminalController(
		projectManager,
		tmux,
		toolRegistry,
	);
	context.subscriptions.push(terminalController);

	const sidebarProvider = new FeatureSidebarProvider(
		projectManager,
		toolRegistry,
		prerequisites,
		context.extensionUri,
	);
	sidebarProvider.setTerminalController(terminalController);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			FeatureSidebarProvider.viewType,
			sidebarProvider,
		),
	);

	sidebarProvider.onVisibilityChange((visible) => {
		if (!activeFeatureId) return;
		if (visible) {
			const ctx = projectManager.findContextByFeatureId(activeFeatureId);
			if (!ctx) return;
			const feature = ctx.featureManager.getFeature(activeFeatureId);
			if (feature) {
				terminalController.reconnectTmuxSessions(feature);
			}
		} else {
			terminalController.disposeFeatureTerminals(activeFeatureId);
		}
	});

	const claudeProvider = new ClaudeSessionProvider();
	const codexProvider = new CodexSessionProvider();
	const sessionNameSyncer = new SessionNameSyncer([
		claudeProvider,
		codexProvider,
	]);
	sessionNameSyncer.onAgentRenamed((agentId, featureId) => {
		projectManager.notifyChange();
		const ctx = projectManager.findContextByFeatureId(featureId);
		if (!ctx) return;
		const feature = ctx.featureManager.getFeature(featureId);
		if (!feature) return;
		const agents = ctx.agentManager.getAgents(featureId);
		const agent = agents.find((a) => a.id === agentId);
		if (!agent) return;
		const agentIndex = agents.indexOf(agent);
		terminalController.renameTerminal(feature, agent, agentIndex);
	});
	let previousActiveTerminal: vscode.Terminal | undefined;
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTerminal((terminal) => {
			// Sync terminal that lost focus (catch titles set while user was watching)
			if (previousActiveTerminal) {
				const agentId = terminalController.findAgentIdByTerminal(
					previousActiveTerminal,
				);
				if (agentId) sessionNameSyncer.syncAgentOnFocus(agentId);
			}
			// Sync terminal that gained focus (catch titles set while user was away)
			if (terminal) {
				const agentId = terminalController.findAgentIdByTerminal(terminal);
				if (agentId) sessionNameSyncer.syncAgentOnFocus(agentId);
			}
			previousActiveTerminal = terminal ?? undefined;
		}),
	);

	const codexWatcher = new CodexSessionWatcher();
	codexWatcher.onDiscovered(() => sidebarProvider.refresh());
	codexWatcher.start(projectManager);

	const config = vscode.workspace.getConfiguration("agentSpace");
	if (config.get("syncSessionNames", config.get("autoNameAgents", true))) {
		sessionNameSyncer.start(projectManager);
	}
	context.subscriptions.push({ dispose: () => sessionNameSyncer.dispose() });
	context.subscriptions.push({ dispose: () => codexWatcher.dispose() });

	context.subscriptions.push(
		vscode.commands.registerCommand("agentSpace.syncSessionNames", () => {
			sessionNameSyncer.syncAll();
		}),
	);

	projectManager.onChange(() => {
		sidebarProvider.refresh();
		const home = HomePanel.getInstance();
		if (home) home.refresh();
	});

	// Auto-open HomePanel on activation
	HomePanel.createOrShow(
		projectManager,
		tmux,
		toolRegistry,
		context.extensionUri,
		globalStore,
		terminalController,
	);

	// Command: Open Home
	context.subscriptions.push(
		vscode.commands.registerCommand("agentSpace.openHome", () => {
			const panel = HomePanel.createOrShow(
				projectManager,
				tmux,
				toolRegistry,
				context.extensionUri,
				globalStore,
				terminalController,
			);
			panel.showWelcome();
		}),
	);

	// Command: New Feature
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.newFeature",
			async (projectIdArg?: string) => {
				let projectId = projectIdArg;

				// If no projectId provided, resolve it
				if (!projectId) {
					const projects = projectManager.getProjects();
					if (projects.length === 0) {
						vscode.window.showWarningMessage(
							"No projects registered. Add a project first.",
						);
						return;
					}
					if (projects.length === 1) {
						projectId = projects[0].id;
					} else {
						const pick = await vscode.window.showQuickPick(
							projects.map((p) => ({
								label: p.name,
								description: p.repoPath,
								id: p.id,
							})),
							{ placeHolder: "Select project for new feature" },
						);
						if (!pick) return;
						projectId = pick.id;
					}
				}

				const ctx = projectManager.getContext(projectId);
				if (!ctx) return;

				if (!isGitRepo(ctx.project.repoPath)) {
					vscode.window.showErrorMessage(
						`"${ctx.project.name}" is not a Git repository.`,
					);
					return;
				}

				const name = await vscode.window.showInputBox({
					prompt: "Feature name",
					placeHolder: "auth-system",
					validateInput: (value) => {
						if (!value.trim()) return "Feature name is required";
						if (/\s/.test(value)) return "Feature name cannot contain spaces";
						if (/[~^:?*[\]\\]/.test(value))
							return "Contains invalid characters";
						return undefined;
					},
				});
				if (!name) return;

				const perAgentEnabled = vscode.workspace
					.getConfiguration("agentSpace")
					.get<boolean>("enablePerAgentIsolation", false);

				let isolation: "shared" | "per-agent" = "shared";
				if (perAgentEnabled) {
					const isolationPick = await vscode.window.showQuickPick(
						[
							{
								label: "Shared worktree",
								description: "All agents share one worktree",
								value: "shared" as const,
							},
							{
								label: "Isolated agents",
								description: "Each agent gets its own worktree",
								value: "per-agent" as const,
							},
						],
						{
							placeHolder: "Agent isolation mode",
						},
					);
					if (!isolationPick) return;
					isolation = isolationPick.value;
				}

				try {
					const feature = ctx.featureManager.createFeature(name, isolation);
					activeFeatureId = feature.id;

					const initialTool = toolRegistry.getPreferredAvailableTool();
					if (initialTool) {
						const agent = ctx.agentManager.createAgent(feature, initialTool.id);
						terminalController.createTerminal(feature, agent, 0);
					} else {
						vscode.window.showErrorMessage(
							"Feature created, but no coding tools are available to start the first agent.",
						);
					}
					sidebarProvider.refresh();
					const home = HomePanel.getInstance();
					if (home) home.showFeature(feature.id);
				} catch (err) {
					const msg =
						err instanceof Error ? err.message : "Failed to create feature";
					vscode.window.showErrorMessage(`Create feature failed: ${msg}`);
				}
			},
		),
	);

	// Command: Select Feature
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.selectFeature",
			(featureId: string) => {
				if (activeFeatureId && activeFeatureId !== featureId) {
					terminalController.disposeFeatureTerminals(activeFeatureId);
				}

				activeFeatureId = featureId;
				const ctx = projectManager.findContextByFeatureId(featureId);
				if (!ctx) return;

				const feature = ctx.featureManager.getFeature(featureId);
				if (!feature) return;

				const agents = ctx.agentManager.getAgents(featureId);
				if (agents.length === 0) {
					const initialTool = toolRegistry.getPreferredAvailableTool();
					if (!initialTool) {
						vscode.window.showErrorMessage(
							"No coding tools found on PATH. Install one of: claude, copilot, codex, opencode.",
						);
						return;
					}
					const agent = ctx.agentManager.createAgent(feature, initialTool.id);
					terminalController.createTerminal(feature, agent, 0);
				} else {
					terminalController.reconnectTmuxSessions(feature);
				}

				const home = HomePanel.getInstance();
				if (home) home.showFeature(featureId);
			},
		),
	);

	// Command: Open Workspace Panel (now opens HomePanel's Feature Home view)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.openWorkspace",
			(featureIdArg?: string) => {
				const featureId = featureIdArg ?? activeFeatureId;
				if (!featureId) return;
				const panel = HomePanel.createOrShow(
					projectManager,
					tmux,
					toolRegistry,
					context.extensionUri,
					globalStore,
					terminalController,
				);
				panel.showFeature(featureId);
			},
		),
	);

	// Command: Add Agent
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.addAgent",
			async (featureIdArg?: string) => {
				const featureId = featureIdArg ?? activeFeatureId;
				if (!featureId) return;

				const ctx = projectManager.findContextByFeatureId(featureId);
				if (!ctx) return;

				const feature = ctx.featureManager.getFeature(featureId);
				if (!feature) return;

				// Tool selection — only show installed tools
				const tools = toolRegistry.getAvailableTools();
				if (tools.length === 0) {
					vscode.window.showErrorMessage(
						"No coding tools found on PATH. Install one of: claude, copilot, codex, opencode.",
					);
					return;
				}

				const defaultToolId = toolRegistry.getDefaultToolId();
				const toolPick = await vscode.window.showQuickPick(
					tools.map((t) => ({
						label: t.name,
						description: t.id === defaultToolId ? "(default)" : undefined,
						toolId: t.id,
					})),
					{ placeHolder: "Select coding tool" },
				);
				if (!toolPick) return;

				const agents = ctx.agentManager.getAgents(featureId);
				const agent = ctx.agentManager.createAgent(feature, toolPick.toolId);
				terminalController.createTerminal(feature, agent, agents.length);
				sidebarProvider.refresh();
				const home = HomePanel.getInstance();
				if (home) home.refresh();
			},
		),
	);

	// Command: Add Service
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.addService",
			async (featureIdArg?: string) => {
				const featureId = featureIdArg ?? activeFeatureId;
				if (!featureId) return;

				const ctx = projectManager.findContextByFeatureId(featureId);
				if (!ctx) return;

				const feature = ctx.featureManager.getFeature(featureId);
				if (!feature) return;

				const { detectScripts } = await import("./services/scriptDetector");
				const scripts = detectScripts(feature.worktreePath);

				if (scripts.length === 0) {
					vscode.window.showWarningMessage(
						"No scripts found in package.json for this feature's worktree.",
					);
					return;
				}

				const pick = await vscode.window.showQuickPick(
					scripts.map((s) => ({
						label: s.name,
						description: s.command,
					})),
					{ placeHolder: "Select a script to execute" },
				);
				if (!pick) return;

				const service = ctx.serviceManager.createService(
					featureId,
					pick.label,
					// biome-ignore lint/style/noNonNullAssertion: description is always set from s.command above
					pick.description!,
				);
				terminalController.createServiceTerminal(
					feature,
					service,
					feature.worktreePath,
				);
				sidebarProvider.refresh();
				const home = HomePanel.getInstance();
				if (home) home.refresh();
			},
		),
	);

	// Command: Close Agent ("Job Done")
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.closeAgent",
			async (featureIdArg?: string, agentIdArg?: string) => {
				if (!featureIdArg || !agentIdArg) return;

				const ctx = projectManager.findContextByFeatureId(featureIdArg);
				if (!ctx) return;

				const feature = ctx.featureManager.getFeature(featureIdArg);
				if (!feature) return;

				const agents = ctx.agentManager.getAgents(featureIdArg);
				const agent = agents.find((a) => a.id === agentIdArg);
				if (!agent) return;

				// For per-agent worktree, check if branch is merged
				if (
					agent.worktreePath &&
					!ctx.agentManager.isAgentBranchMerged(agent, feature)
				) {
					const proceed = await vscode.window.showWarningMessage(
						"This agent's branch has unmerged work. Close anyway?",
						"Close Anyway",
						"Cancel",
					);
					if (proceed !== "Close Anyway") return;
				}

				terminalController.killAgentTerminal(agentIdArg, featureIdArg);
				ctx.agentManager.closeAgent(agentIdArg, featureIdArg);
				sidebarProvider.refresh();
				const home = HomePanel.getInstance();
				if (home) home.refresh();
			},
		),
	);

	// Command: Reopen Agent
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.reopenAgent",
			(featureIdArg?: string, agentIdArg?: string) => {
				if (!featureIdArg || !agentIdArg) return;

				const ctx = projectManager.findContextByFeatureId(featureIdArg);
				if (!ctx) return;

				const feature = ctx.featureManager.getFeature(featureIdArg);
				if (!feature) return;

				const agent = ctx.agentManager.reopenAgent(agentIdArg, feature);
				if (!agent) return;

				const agents = ctx.agentManager.getAgents(featureIdArg);
				const agentIndex = agents.findIndex((a) => a.id === agentIdArg);
				terminalController.createTerminal(feature, agent, agentIndex, true);
				sidebarProvider.refresh();
				const home = HomePanel.getInstance();
				if (home) home.refresh();
			},
		),
	);

	// Command: Toggle Isolation Mode (requires enablePerAgentIsolation)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.toggleIsolation",
			(featureIdArg?: string) => {
				if (!featureIdArg) return;

				const perAgentEnabled = vscode.workspace
					.getConfiguration("agentSpace")
					.get<boolean>("enablePerAgentIsolation", false);
				if (!perAgentEnabled) return;

				const ctx = projectManager.findContextByFeatureId(featureIdArg);
				if (!ctx) return;

				const feature = ctx.featureManager.getFeature(featureIdArg);
				if (!feature) return;

				const newIsolation =
					feature.isolation === "shared" ? "per-agent" : "shared";
				ctx.featureManager.updateFeatureIsolation(featureIdArg, newIsolation);
				sidebarProvider.refresh();
			},
		),
	);

	// Command: Delete Feature
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.deleteFeature",
			async (featureIdArg?: string) => {
				const featureId = featureIdArg ?? activeFeatureId;
				if (!featureId) return;

				const ctx = projectManager.findContextByFeatureId(featureId);
				if (!ctx) return;

				const feature = ctx.featureManager.getFeature(featureId);
				if (!feature) return;

				const confirm = await vscode.window.showWarningMessage(
					`Delete feature "${feature.name}"?\n\nWorktree: ${feature.worktreePath}\n\nThis removes the worktree and all agent data.`,
					{ modal: true },
					"Delete",
				);
				if (confirm !== "Delete") return;

				sessionNameSyncer.clearFeature(featureId);
				terminalController.killFeatureTerminals(featureId);
				ctx.serviceManager.deleteAllServices(featureId);
				ctx.agentManager.deleteAllAgents(featureId);
				ctx.featureManager.deleteFeature(featureId);
				sidebarProvider.refresh();

				if (activeFeatureId === featureId) {
					activeFeatureId = null;
				}
				const home = HomePanel.getInstance();
				if (home) home.showWelcome();
			},
		),
	);

	// Command: Create PR
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.createPR",
			async (featureIdArg?: string) => {
				const featureId = featureIdArg ?? activeFeatureId;
				if (!featureId) return;

				const ctx = projectManager.findContextByFeatureId(featureId);
				if (!ctx) return;

				const feature = ctx.featureManager.getFeature(featureId);
				if (!feature) return;

				if (!prerequisites.isGhPrExtensionInstalled()) {
					vscode.window.showErrorMessage(
						'Install the "GitHub Pull Requests" extension to create PRs.',
					);
					return;
				}

				try {
					execSync(`git push -u origin "${feature.branch}"`, {
						cwd: feature.worktreePath,
						encoding: "utf-8",
						stdio: ["ignore", "pipe", "pipe"],
					});
					vscode.window.showInformationMessage(
						`Branch "${feature.branch}" pushed. Opening PR creation...`,
					);
					// Opens the GH PR extension form — user may still cancel,
					// so we intentionally don't mark the feature as "done" here.
					await vscode.commands.executeCommand("pr.create");
				} catch (err) {
					const msg =
						err instanceof Error ? err.message : "Failed to push branch";
					vscode.window.showErrorMessage(`Create PR failed: ${msg}`);
				}
			},
		),
	);

	// Command: Open Feature Folder
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.openFeatureFolder",
			(featureIdArg?: string) => {
				const featureId = featureIdArg ?? activeFeatureId;
				if (!featureId) return;

				const ctx = projectManager.findContextByFeatureId(featureId);
				if (!ctx) return;

				const feature = ctx.featureManager.getFeature(featureId);
				if (!feature) return;

				vscode.commands.executeCommand(
					"vscode.openFolder",
					vscode.Uri.file(feature.worktreePath),
					{ forceNewWindow: true },
				);
			},
		),
	);

	// Command: Add Project
	context.subscriptions.push(
		vscode.commands.registerCommand("agentSpace.addProject", async () => {
			const uris = await vscode.window.showOpenDialog({
				canSelectFolders: true,
				canSelectFiles: false,
				canSelectMany: false,
				openLabel: "Add Project",
			});
			if (!uris || uris.length === 0) return;

			const repoPath = uris[0].fsPath;
			if (!isGitRepo(repoPath)) {
				vscode.window.showErrorMessage(
					"Selected folder is not a Git repository.",
				);
				return;
			}

			try {
				projectManager.addProject(repoPath);
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : "Failed to add project";
				vscode.window.showErrorMessage(msg);
			}
		}),
	);

	// Command: Remove Project
	context.subscriptions.push(
		vscode.commands.registerCommand("agentSpace.removeProject", async () => {
			const projects = projectManager.getProjects();
			if (projects.length === 0) {
				vscode.window.showInformationMessage("No projects to remove.");
				return;
			}

			const pick = await vscode.window.showQuickPick(
				projects.map((p) => ({
					label: p.name,
					description: p.repoPath,
					id: p.id,
				})),
				{ placeHolder: "Select project to remove" },
			);
			if (!pick) return;

			projectManager.removeProject(pick.id);
		}),
	);
}

export function deactivate(): void {}

function isGitRepo(cwd: string): boolean {
	try {
		execSync("git rev-parse --is-inside-work-tree", { cwd, stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}
