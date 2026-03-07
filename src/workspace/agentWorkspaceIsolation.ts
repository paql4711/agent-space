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
	private reopenPanel = false;

	public isActive(): boolean {
		return this.active;
	}

	public async enter(): Promise<void> {
		if (this.active) {
			return;
		}

		this.tabsSetting = this.captureTabsSetting();
		this.reopenPanel = vscode.window.terminals.length > 0;

		await this.updateTabsSetting("none", this.tabsSetting.target);
		await vscode.commands.executeCommand("workbench.action.maximizeEditor");
		await vscode.commands.executeCommand("workbench.action.closePanel");

		this.active = true;
	}

	public async leave(): Promise<void> {
		if (!this.active) {
			return;
		}

		if (this.tabsSetting) {
			await this.updateTabsSetting(
				this.tabsSetting.value,
				this.tabsSetting.target,
			);
		}
		await vscode.commands.executeCommand("workbench.action.maximizeEditor");
		if (this.reopenPanel) {
			await vscode.commands.executeCommand("workbench.action.togglePanel");
		}

		this.active = false;
		this.tabsSetting = undefined;
		this.reopenPanel = false;
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
}
