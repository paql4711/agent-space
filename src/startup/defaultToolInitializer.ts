import * as vscode from "vscode";
import type { CodingToolRegistry } from "../agents/codingToolRegistry";

const DEFAULT_TOOL_PROMPTED_PREF = "hasPromptedDefaultToolSelection";

type PreferenceStore = {
	getPreference<T>(key: string, defaultValue: T): T;
	setPreference(key: string, value: unknown): void;
};

export function hasConfiguredDefaultTool(): boolean {
	const inspection = vscode.workspace
		.getConfiguration("agentSpace")
		.inspect<string>("defaultTool");
	return (
		inspection?.globalValue !== undefined ||
		inspection?.workspaceValue !== undefined ||
		inspection?.workspaceFolderValue !== undefined
	);
}

export async function ensureDefaultToolConfigured(
	toolRegistry: Pick<CodingToolRegistry, "getAvailableTools">,
	preferences: PreferenceStore,
): Promise<void> {
	if (hasConfiguredDefaultTool()) {
		return;
	}

	if (preferences.getPreference(DEFAULT_TOOL_PROMPTED_PREF, false)) {
		return;
	}

	const availableTools = toolRegistry.getAvailableTools();
	if (availableTools.length === 0) {
		return;
	}

	const selection = await vscode.window.showQuickPick(
		availableTools.map((tool) => ({
			label: tool.name,
			description: tool.command,
			toolId: tool.id,
		})),
		{
			ignoreFocusOut: true,
			placeHolder: "Select the default coding CLI for new agents",
			title: "Agent Space Setup",
		},
	);

	preferences.setPreference(DEFAULT_TOOL_PROMPTED_PREF, true);
	if (!selection) {
		return;
	}

	await vscode.workspace
		.getConfiguration("agentSpace")
		.update("defaultTool", selection.toolId, vscode.ConfigurationTarget.Global);
}
