import { execSync } from "node:child_process";
import * as vscode from "vscode";
import { CodingToolRegistry } from "./agents/codingToolRegistry";
import { SessionNameSyncer } from "./agents/sessionNameSyncer";
import { ClaudeSessionProvider } from "./agents/sessionProviders/claudeSessionProvider";
import { CodexSessionProvider } from "./agents/sessionProviders/codexSessionProvider";
import { CodexSessionWatcher } from "./agents/sessionProviders/codexSessionWatcher";
import { TerminalController } from "./agents/terminalController";
import { TmuxIntegration } from "./agents/tmux";
import { validateFeatureNameInput } from "./features/featureName";
import { FeatureSidebarProvider } from "./features/featureSidebarProvider";
import {
	getGitViewHandoffAction,
	openFeatureGitView,
	PENDING_GIT_VIEW_HANDOFF_PREF,
} from "./git/gitViewHandoff";
import {
	listLocalBranches,
	mergeFeatureIntoBranch,
	rebaseFeatureOntoBase,
	syncBaseBranch,
} from "./git/workflow";
import { HomePanel } from "./home/homePanel";
import { PrerequisiteChecker } from "./prerequisites";
import type { ProjectContext } from "./projects/projectManager";
import { ProjectManager } from "./projects/projectManager";
import { ensureDefaultToolConfigured } from "./startup/defaultToolInitializer";
import { GlobalStore } from "./storage/globalStore";
import type {
	Feature,
	ProjectCommandCwdMode,
	ProjectCommandGroup,
} from "./types";
import {
	resolveAgentSpaceIsolationAction,
	type AgentSpaceUiState,
} from "./workspace/agentSpaceUiState";
import { AgentWorkspaceIsolation } from "./workspace/agentWorkspaceIsolation";

let activeFeatureId: string | null = null;

export async function activate(
	context: vscode.ExtensionContext,
): Promise<void> {
	const prerequisites = new PrerequisiteChecker();
	const { ok, missing } = prerequisites.checkRequired();
	if (!ok) {
		prerequisites.showMissingToolsError(missing);
		return;
	}

	const tmux = new TmuxIntegration();

	const storagePath = context.globalStorageUri.fsPath;
	const globalStore = new GlobalStore(storagePath);
	const workspaceIsolation = new AgentWorkspaceIsolation();
	let agentSpaceUiState: AgentSpaceUiState = {
		sidebarVisible: false,
		homeActive: false,
	};
	let isolationUpdateChain = Promise.resolve();

	const updateAgentSpaceUiState = (
		partial: Partial<AgentSpaceUiState>,
	): void => {
		const previousState = agentSpaceUiState;
		const nextState = {
			...previousState,
			...partial,
		};
		const action = resolveAgentSpaceIsolationAction(previousState, nextState);
		agentSpaceUiState = nextState;

		if (action === "noop") {
			return;
		}

		isolationUpdateChain = isolationUpdateChain
			.catch((error) => {
				console.error("Agent Space isolation transition failed", error);
			})
			.then(async () => {
				if (action === "enter") {
					await workspaceIsolation.enter();
					return;
				}
				await workspaceIsolation.leave();
			});
	};

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
	const refreshUi = () => {
		sidebarProvider.refresh();
		const home = HomePanel.getInstance();
		if (home) home.refresh();
	};
	const gitViewHandoffAction = getGitViewHandoffAction(
		globalStore.getPreference(PENDING_GIT_VIEW_HANDOFF_PREF),
		vscode.workspace.workspaceFolders,
	);
	if (gitViewHandoffAction !== "noop") {
		globalStore.setPreference(PENDING_GIT_VIEW_HANDOFF_PREF, undefined);
		if (gitViewHandoffAction === "openScm") {
			void vscode.commands.executeCommand("workbench.view.scm");
		}
	}

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
	await ensureDefaultToolConfigured(toolRegistry, globalStore);

	const defaultToolId = toolRegistry.getDefaultToolId();
	const availableTools = toolRegistry.getAvailableTools();
	if (availableTools.length === 0) {
		vscode.window.showWarningMessage(
			"No coding tools found on PATH. Install one of: claude, copilot, codex, opencode.",
		);
	} else if (defaultToolId) {
		const defaultTool = toolRegistry.resolveAgentTool(defaultToolId);
		if (!toolRegistry.isToolAvailable(defaultTool)) {
			vscode.window.showWarningMessage(
				`${defaultTool.name} CLI not found. New agents will use ${availableTools[0].name} until the default tool is installed.`,
			);
		}
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
		updateAgentSpaceUiState({ sidebarVisible: visible });
	});

	const ensureHomePanel = () => {
		const panel = HomePanel.createOrShow(
			projectManager,
			tmux,
			toolRegistry,
			context.extensionUri,
			globalStore,
			terminalController,
		);
		panel.onViewStateChange(({ active }) => {
			updateAgentSpaceUiState({ homeActive: active });
		});
		return panel;
	};

	const showAgentSpace = async (featureId?: string): Promise<HomePanel> => {
		const panel = ensureHomePanel();
		if (featureId) {
			activeFeatureId = featureId;
			panel.showFeature(featureId);
		} else {
			panel.showWelcome();
		}
		return panel;
	};

	const activateFeatureInCurrentWindow = async (
		featureId: string,
	): Promise<void> => {
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
			try {
				const agent = ctx.agentManager.createAgent(feature, initialTool.id);
				terminalController.createTerminal(feature, agent, 0);
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to create agent";
				vscode.window.showErrorMessage(
					`Create agent failed for ${feature.branch}: ${message}`,
				);
				return;
			}
		} else {
			terminalController.reconnectTmuxSessions(feature);
		}

		await showAgentSpace(featureId);
	};

	const resolveWorkspaceContext = (
		featureId: string | null | undefined,
	): { ctx: ProjectContext; feature: Feature } | null => {
		if (!featureId) return null;
		const ctx = projectManager.findContextByFeatureId(featureId);
		if (!ctx) return null;
		const feature = ctx.featureManager.getFeature(featureId);
		if (!feature) return null;
		return { ctx, feature };
	};

	const promptProjectContext = async () => {
		const projects = projectManager.getProjects();
		if (projects.length === 0) return null;
		if (projects.length === 1) {
			const ctx = projectManager.getContext(projects[0].id);
			return ctx ?? null;
		}
		const pick = await vscode.window.showQuickPick(
			projects.map((project) => ({
				label: project.name,
				description: project.repoPath,
				projectId: project.id,
			})),
			{ placeHolder: "Select project" },
		);
		if (!pick) return null;
		return projectManager.getContext(pick.projectId) ?? null;
	};

	const promptProjectCommand = async (ctx: ProjectContext): Promise<void> => {
		const label = await vscode.window.showInputBox({
			prompt: `Command label for ${ctx.project.name}`,
			validateInput: (value) =>
				value.trim() ? undefined : "Command label is required",
		});
		if (!label) return;

		const command = await vscode.window.showInputBox({
			prompt: "Shell command",
			validateInput: (value) =>
				value.trim() ? undefined : "Shell command is required",
		});
		if (!command) return;

		const cwdPick = await vscode.window.showQuickPick<
			{ label: string; value: ProjectCommandCwdMode }
		>(
			[
				{
					label: "Run in selected workspace",
					value: "workspace",
				},
				{
					label: "Run in project root",
					value: "repoRoot",
				},
			],
			{ placeHolder: "Working directory" },
		);
		if (!cwdPick) return;

		const groupPick = await vscode.window.showQuickPick<
			{ label: string; value: ProjectCommandGroup }
		>(
			[
				{ label: "App", value: "app" },
				{ label: "Test", value: "test" },
				{ label: "Git", value: "git" },
			],
			{ placeHolder: "Command group" },
		);
		if (!groupPick) return;

		ctx.projectCommandManager.addCommand(
			label.trim(),
			command.trim(),
			cwdPick.value,
			groupPick.value,
		);
		refreshUi();
		vscode.window.showInformationMessage(
			`Saved project command "${label.trim()}" for ${ctx.project.name}.`,
		);
	};

	const runSyncBaseBranch = async (featureId: string): Promise<void> => {
		const resolved = resolveWorkspaceContext(featureId);
		if (!resolved) return;
		try {
			syncBaseBranch(
				resolved.ctx.project.repoPath,
				resolved.ctx.featureManager.getBaseBranch(),
			);
			vscode.window.showInformationMessage(
				`Synced ${resolved.ctx.featureManager.getBaseBranch()} in ${resolved.ctx.project.name}.`,
			);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to sync base branch";
			vscode.window.showErrorMessage(`Sync base branch failed: ${message}`);
		}
	};

	const runRebaseOntoBase = async (featureId: string): Promise<void> => {
		const resolved = resolveWorkspaceContext(featureId);
		if (!resolved || resolved.feature.kind === "base") return;

		try {
			rebaseFeatureOntoBase(
				resolved.ctx.project.repoPath,
				resolved.feature.worktreePath,
				resolved.ctx.featureManager.getBaseBranch(),
			);
			vscode.window.showInformationMessage(
				`Rebased ${resolved.feature.branch} onto ${resolved.ctx.featureManager.getBaseBranch()}.`,
			);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to rebase onto base";
			vscode.window.showErrorMessage(`Rebase failed: ${message}`);
		}
	};

	const runMergeIntoBranch = async (featureId: string): Promise<void> => {
		const resolved = resolveWorkspaceContext(featureId);
		if (!resolved || resolved.feature.kind === "base") return;

		const branches = listLocalBranches(resolved.ctx.project.repoPath).filter(
			(branch) => branch !== resolved.feature.branch,
		);
		if (branches.length === 0) {
			vscode.window.showWarningMessage(
				"No local target branches available for merge.",
			);
			return;
		}

		const baseBranch = resolved.ctx.featureManager.getBaseBranch();
		const pick = await vscode.window.showQuickPick(
			branches.map((branch) => ({
				label: branch,
				description: branch === baseBranch ? "(base branch)" : undefined,
			})),
			{ placeHolder: "Merge current feature into which branch?" },
		);
		if (!pick) return;

		const confirm = await vscode.window.showWarningMessage(
			`Merge ${resolved.feature.branch} into ${pick.label}?`,
			{ modal: true },
			"Merge",
		);
		if (confirm !== "Merge") return;

		try {
			const result = mergeFeatureIntoBranch(
				resolved.ctx.project.repoPath,
				resolved.ctx.featureManager.getWorktreeBase(),
				resolved.feature.branch,
				pick.label,
			);
			if (result.keptForInspection) {
				vscode.window.showErrorMessage(
					`Merge stopped with conflicts. Inspect the temporary worktree at ${result.worktreePath}.`,
				);
				return;
			}

			vscode.window.showInformationMessage(
				`Merged ${resolved.feature.branch} into ${pick.label}.`,
			);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to merge feature";
			vscode.window.showErrorMessage(`Merge failed: ${message}`);
		}
	};

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
		refreshUi();
	});

	// Command: Open Home
	context.subscriptions.push(
		vscode.commands.registerCommand("agentSpace.openHome", async () => {
			await showAgentSpace();
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
					placeHolder: "Auth system",
					validateInput: validateFeatureNameInput,
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
						ctx.agentManager.createAgent(feature, initialTool.id);
					} else {
						vscode.window.showErrorMessage(
							"Feature created, but no coding tools are available to start the first agent.",
						);
					}
					sidebarProvider.refresh();
					await activateFeatureInCurrentWindow(feature.id);
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
			async (featureId: string) => {
				const ctx = projectManager.findContextByFeatureId(featureId);
				if (!ctx) return;

				if (!ctx.featureManager.getFeature(featureId)) return;
				await activateFeatureInCurrentWindow(featureId);
			},
		),
	);

	// Command: Open Workspace Panel (now opens HomePanel's Feature Home view)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.openWorkspace",
			async (featureIdArg?: string) => {
				const featureId = featureIdArg ?? activeFeatureId;
				if (!featureId) return;
				await activateFeatureInCurrentWindow(featureId);
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
				const tools = toolRegistry.getAvailableToolsPreferredFirst();
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

				try {
					const agents = ctx.agentManager.getAgents(featureId);
					const agent = ctx.agentManager.createAgent(feature, toolPick.toolId);
					terminalController.createTerminal(feature, agent, agents.length);
					sidebarProvider.refresh();
					const home = HomePanel.getInstance();
					if (home) home.refresh();
				} catch (err) {
					const message =
						err instanceof Error ? err.message : "Failed to create agent";
					vscode.window.showErrorMessage(`Add agent failed: ${message}`);
				}
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
				const picks: Array<{
					label: string;
					description: string;
					action: () => Promise<void> | void;
				}> = [
					{
						label: "$(terminal) Open Terminal",
						description: "Start an interactive shell in this worktree",
						action: () => {
							const service = ctx.serviceManager.createService(
								featureId,
								"Terminal",
								"Interactive shell",
								null,
							);
							terminalController.createServiceTerminal(
								feature,
								service,
								feature.worktreePath,
							);
							refreshUi();
						},
					},
					...(feature.kind === "base"
						? [
								{
									label: "$(sync) Sync Base Branch",
									description: `Fast-forward ${ctx.featureManager.getBaseBranch()} in project root`,
									action: () => runSyncBaseBranch(feature.id),
								},
							]
						: [
								{
									label: "$(git-pull-request-create) Rebase Onto Base",
									description: `Rebase ${feature.branch} onto ${ctx.featureManager.getBaseBranch()}`,
									action: () => runRebaseOntoBase(feature.id),
								},
								{
									label: "$(merge) Merge Into Selected Branch",
									description: `Merge ${feature.branch} into another local branch`,
									action: () => runMergeIntoBranch(feature.id),
								},
							]),
					...scripts.map((s) => ({
						label: s.name,
						description: s.command,
						action: () => {
							const service = ctx.serviceManager.createService(
								featureId,
								s.name,
								s.command,
								s.command,
							);
							terminalController.createServiceTerminal(
								feature,
								service,
								feature.worktreePath,
							);
							refreshUi();
						},
					})),
					...ctx.projectCommandManager.getCommands().map((command) => ({
						label: command.label,
						description: command.command,
						action: () => {
							const cwd =
								command.cwdMode === "repoRoot"
									? ctx.project.repoPath
									: feature.worktreePath;
							const service = ctx.serviceManager.createService(
								featureId,
								command.label,
								command.command,
								command.command,
							);
							terminalController.createServiceTerminal(feature, service, cwd);
							refreshUi();
						},
					})),
					{
						label: "$(gear) Add Project Command",
						description: "Save a reusable command for this project",
						action: () => promptProjectCommand(ctx),
					},
				];

				const pick = await vscode.window.showQuickPick(picks, {
					placeHolder: "Run a workspace action",
				});
				if (!pick) return;

				await pick.action();
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.addProjectCommand",
			async (featureIdArg?: string) => {
				const resolved = resolveWorkspaceContext(featureIdArg ?? activeFeatureId);
				const ctx = resolved?.ctx ?? (await promptProjectContext());
				if (!ctx) return;
				await promptProjectCommand(ctx);
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.removeProjectCommand",
			async (featureIdArg?: string) => {
				const resolved = resolveWorkspaceContext(featureIdArg ?? activeFeatureId);
				const ctx = resolved?.ctx ?? (await promptProjectContext());
				if (!ctx) return;

				const commands = ctx.projectCommandManager.getCommands();
				if (commands.length === 0) {
					vscode.window.showInformationMessage(
						`No saved project commands for ${ctx.project.name}.`,
					);
					return;
				}

				const pick = await vscode.window.showQuickPick(
					commands.map((command) => ({
						label: command.label,
						description: command.command,
						commandId: command.id,
					})),
					{ placeHolder: "Select project command to remove" },
				);
				if (!pick) return;
				ctx.projectCommandManager.removeCommand(pick.commandId);
				refreshUi();
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.syncBaseBranch",
			async (featureIdArg?: string) => {
				const featureId = featureIdArg ?? activeFeatureId;
				if (!featureId) return;
				await runSyncBaseBranch(featureId);
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.rebaseOntoBase",
			async (featureIdArg?: string) => {
				const featureId = featureIdArg ?? activeFeatureId;
				if (!featureId) return;
				await runRebaseOntoBase(featureId);
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.mergeIntoBranch",
			async (featureIdArg?: string) => {
				const featureId = featureIdArg ?? activeFeatureId;
				if (!featureId) return;
				await runMergeIntoBranch(featureId);
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
				if (!agent) {
					vscode.window.showErrorMessage(
						"Failed to reopen agent. Check that its worktree and branch are still available.",
					);
					return;
				}

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
				if (feature.kind === "base") {
					vscode.window.showWarningMessage(
						"The main workspace is built in and cannot be deleted.",
					);
					return;
				}

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
			"agentSpace.openFeatureGitView",
			async (featureIdArg?: string) => {
				await openFeatureGitView(
					featureIdArg,
					activeFeatureId,
					(featureId) => {
						const ctx = projectManager.findContextByFeatureId(featureId);
						return ctx?.featureManager.getFeature(featureId);
					},
					globalStore,
					(worktreePath) =>
						vscode.commands.executeCommand(
							"vscode.openFolder",
							vscode.Uri.file(worktreePath),
							{ forceNewWindow: true },
						),
				);
			},
		),
	);

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
				if (feature.kind === "base") {
					vscode.window.showWarningMessage(
						"Create Pull Request is only available for feature workspaces.",
					);
					return;
				}

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

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"agentSpace.openMainWorkspace",
			async (projectIdArg?: string) => {
				let ctx: ProjectContext | null | undefined =
					projectIdArg !== undefined
						? projectManager.getContext(projectIdArg)
						: undefined;
				if (!ctx) {
					ctx = await promptProjectContext();
				}
				if (!ctx) return;
				const base = ctx.featureManager
					.getFeatures()
					.find((feature) => feature.kind === "base");
				if (!base) return;
				await activateFeatureInCurrentWindow(base.id);
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

			const ctx = projectManager.getContext(pick.id);
			const features = ctx?.featureManager.getFeatures() ?? [];
			if (features.length > 0) {
				const choice = await vscode.window.showWarningMessage(
					`Remove project "${pick.label}"? This will kill all tmux sessions for ${features.length} feature${features.length === 1 ? "" : "s"}.`,
					{ modal: true },
					"Unregister Only",
					"Full Delete",
					"Cancel",
				);
				if (!choice || choice === "Cancel") return;

				for (const feature of features) {
					sessionNameSyncer.clearFeature(feature.id);
				}
				projectManager.killProjectSessions(pick.id, terminalController);
				if (choice === "Full Delete") {
					projectManager.deleteProjectFeatureData(pick.id);
				}
			}

			if (activeFeatureId) {
				const activeCtx =
					projectManager.findContextByFeatureId(activeFeatureId);
				if (activeCtx?.project.id === pick.id) {
					activeFeatureId = null;
					const home = HomePanel.getInstance();
					if (home) home.showWelcome();
				}
			}

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
