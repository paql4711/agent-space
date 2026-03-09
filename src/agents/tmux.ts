import { commandExists, exec, execSilent } from "../utils/platform";

export const TMUX_SESSION_PREFIX = "agent-space";
const LEGACY_TMUX_SESSION_PREFIX = "companion";

export class TmuxIntegration {
	sessionName(featureId: string, agentId: string): string {
		return `${TMUX_SESSION_PREFIX}-${featureId}-${agentId}`;
	}

	serviceSessionName(featureId: string, serviceId: string): string {
		return `${TMUX_SESSION_PREFIX}-svc-${featureId}-${serviceId}`;
	}

	legacySessionName(featureId: string, agentId: string): string {
		return `${LEGACY_TMUX_SESSION_PREFIX}-${featureId}-${agentId}`;
	}

	legacyServiceSessionName(featureId: string, serviceId: string): string {
		return `${LEGACY_TMUX_SESSION_PREFIX}-svc-${featureId}-${serviceId}`;
	}

	isAvailable(): boolean {
		return commandExists("tmux");
	}

	isSessionAlive(sessionName: string): boolean {
		return execSilent(`tmux has-session -t "${sessionName}"`);
	}

	configureSession(sessionName: string): void {
		// Keep tmux from intercepting right-clicks with its pane menu inside agent terminals.
		this.runSessionConfigCommand(sessionName, "set-option", "mouse off");
		this.runSessionConfigCommand(sessionName, "set-option", "status off");
	}

	configureServiceSession(sessionName: string): void {
		this.configureSession(sessionName);
		this.runSessionConfigCommand(sessionName, "set-option", "remain-on-exit on");
	}

	private runSessionConfigCommand(
		sessionName: string,
		command: "set-option",
		args: string,
	): void {
		try {
			exec(`tmux ${command} -t "${sessionName}" ${args}`);
		} catch {
			// Session may not exist or the binding may not be present.
		}
	}

	/**
	 * Check if the pane process in a session has exited.
	 * Returns null if session doesn't exist, otherwise { dead, exitCode }.
	 */
	getPaneStatus(
		sessionName: string,
	): { dead: boolean; exitCode: number } | null {
		try {
			const output = exec(
				`tmux display-message -t "${sessionName}" -p "#{pane_dead} #{pane_dead_status}"`,
			).trim();
			const [deadStr, codeStr] = output.split(" ");
			return {
				dead: deadStr === "1",
				exitCode: Number.parseInt(codeStr ?? "0", 10),
			};
		} catch {
			return null;
		}
	}

	createCommand(sessionName: string, innerCommand: string): string {
		return `tmux new-session -d -s "${sessionName}" "${innerCommand}"`;
	}

	createShellCommand(sessionName: string): string {
		return `tmux new-session -d -s "${sessionName}"`;
	}

	attachCommand(sessionName: string): string {
		return `tmux attach-session -t "${sessionName}"`;
	}

	listSessions(): string[] {
		try {
			return exec('tmux list-sessions -F "#{session_name}"')
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);
		} catch {
			return [];
		}
	}

	killSession(sessionName: string): void {
		try {
			exec(`tmux kill-session -t "${sessionName}"`);
		} catch {
			// Session may already be gone
		}
	}

	capturePane(sessionName: string, lines = 50): string | null {
		try {
			return exec(
				`tmux capture-pane -t "${sessionName}" -p -S -${lines}`,
			).trimEnd();
		} catch {
			return null;
		}
	}

	adoptSession(preferredName: string, currentName: string): boolean {
		if (preferredName === currentName) {
			return this.isSessionAlive(preferredName);
		}

		const preferredAlive = this.isSessionAlive(preferredName);
		const currentAlive = this.isSessionAlive(currentName);

		if (preferredAlive) {
			if (currentAlive) {
				this.killSession(currentName);
			}
			return true;
		}

		if (!currentAlive) {
			return false;
		}

		try {
			exec(`tmux rename-session -t "${currentName}" "${preferredName}"`);
			return true;
		} catch {
			return false;
		}
	}
}
