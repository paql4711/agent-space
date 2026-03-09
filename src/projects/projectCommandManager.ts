import * as crypto from "node:crypto";
import type { Store } from "../storage/store";
import type {
	ProjectCommand,
	ProjectCommandCwdMode,
	ProjectCommandGroup,
} from "../types";

export class ProjectCommandManager {
	constructor(private readonly store: Store) {}

	getCommands(): ProjectCommand[] {
		return [...this.store.loadProjectSettings().customCommands];
	}

	addCommand(
		label: string,
		command: string,
		cwdMode: ProjectCommandCwdMode,
		group: ProjectCommandGroup,
	): ProjectCommand {
		const settings = this.store.loadProjectSettings();
		const projectCommand: ProjectCommand = {
			id: crypto.randomUUID(),
			label,
			command,
			cwdMode,
			group,
		};
		settings.customCommands.push(projectCommand);
		this.store.saveProjectSettings(settings);
		return projectCommand;
	}

	removeCommand(commandId: string): void {
		const settings = this.store.loadProjectSettings();
		settings.customCommands = settings.customCommands.filter(
			(command) => command.id !== commandId,
		);
		this.store.saveProjectSettings(settings);
	}
}
