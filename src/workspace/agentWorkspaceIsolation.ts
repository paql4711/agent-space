import * as vscode from "vscode";

type TabsSettingScope =
	| vscode.ConfigurationTarget.Global
	| vscode.ConfigurationTarget.Workspace
	| vscode.ConfigurationTarget.WorkspaceFolder;

interface TabsSettingSnapshot {
	target: TabsSettingScope;
	value: unknown;
}

export class AgentWorkspaceIsolation {
	private active = false;
	private tabsSetting?: TabsSettingSnapshot;
	private editorLayout?: unknown;
	private panelWasVisible = false;

	public isActive(): boolean {
		return this.active;
	}

	public async enter(): Promise<void> {
		if (this.active) {
			return;
		}

		this.tabsSetting = this.captureTabsSetting();
		this.editorLayout = await vscode.commands.executeCommand<unknown>(
			"vscode.getEditorLayout",
		);
		this.panelWasVisible =
			(await this.readContextKey<boolean>("panelVisible")) ?? false;

		await this.updateTabsSetting("none", this.tabsSetting.target);
		await vscode.commands.executeCommand("workbench.action.closePanel");
		await vscode.commands.executeCommand("workbench.action.editorLayoutSingle");

		this.active = true;
	}

	public async leave(): Promise<void> {
		if (!this.active) {
			return;
		}

		try {
			if (this.editorLayout !== undefined) {
				await vscode.commands.executeCommand(
					"vscode.setEditorLayout",
					this.editorLayout,
				);
			}
			if (this.tabsSetting) {
				await this.updateTabsSetting(
					this.tabsSetting.value,
					this.tabsSetting.target,
				);
			}
			if (this.panelWasVisible) {
				await vscode.commands.executeCommand("workbench.action.togglePanel");
			}
		} finally {
			this.active = false;
			this.tabsSetting = undefined;
			this.editorLayout = undefined;
			this.panelWasVisible = false;
		}
	}

	private captureTabsSetting(): TabsSettingSnapshot {
		const config = vscode.workspace.getConfiguration("workbench.editor");
		const inspection = config.inspect<unknown>("showTabs");

		if (inspection?.workspaceFolderValue !== undefined) {
			return {
				target: vscode.ConfigurationTarget.WorkspaceFolder,
				value: inspection.workspaceFolderValue,
			};
		}

		if (inspection?.workspaceValue !== undefined) {
			return {
				target: vscode.ConfigurationTarget.Workspace,
				value: inspection.workspaceValue,
			};
		}

		return {
			target: vscode.ConfigurationTarget.Global,
			value: inspection?.globalValue,
		};
	}

	private async updateTabsSetting(
		value: unknown,
		target: TabsSettingScope,
	): Promise<void> {
		await vscode.workspace
			.getConfiguration("workbench.editor")
			.update("showTabs", value, target);
	}

	private async readContextKey<T>(key: string): Promise<T | undefined> {
		try {
			return await vscode.commands.executeCommand<T>("getContextKeyValue", key);
		} catch {
			return undefined;
		}
	}
}
