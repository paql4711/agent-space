import * as vscode from "vscode";

const DEBOUNCE_MS = 50;

export class ContextOnlyIsolation {
	private active = false;
	private debounceTimer?: ReturnType<typeof setTimeout>;
	private pendingAction?: "enter" | "leave";

	public isActive(): boolean {
		return this.active;
	}

	public scheduleEnter(): void {
		this.cancelPending();
		this.pendingAction = "enter";
		this.debounceTimer = setTimeout(() => {
			this.pendingAction = undefined;
			void this.enter();
		}, DEBOUNCE_MS);
	}

	public scheduleLeave(options?: {
		guard?: () => boolean;
	}): void {
		this.cancelPending();
		this.pendingAction = "leave";
		this.debounceTimer = setTimeout(() => {
			this.pendingAction = undefined;
			if (options?.guard && !options.guard()) {
				return;
			}
			void this.leave();
		}, DEBOUNCE_MS);
	}

	public getPendingAction(): "enter" | "leave" | undefined {
		return this.pendingAction;
	}

	public async enter(): Promise<void> {
		this.cancelPending();
		if (this.active) {
			return;
		}

		await vscode.commands.executeCommand(
			"setContext",
			"agentSpace.agentMode",
			true,
		);
		this.active = true;
		this.cancelPending();
	}

	public async leave(): Promise<void> {
		if (!this.active) {
			return;
		}

		try {
			await vscode.commands.executeCommand(
				"setContext",
				"agentSpace.agentMode",
				false,
			);
		} finally {
			this.active = false;
		}
	}

	public cancelPending(): void {
		if (this.debounceTimer !== undefined) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = undefined;
			this.pendingAction = undefined;
		}
	}
}
