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
		try {
			exec(`tmux set-option -t "${sessionName}" mouse on`);
			exec(`tmux set-option -t "${sessionName}" status off`);
		} catch {
			// Session may not exist
		}
	}

	configureServiceSession(sessionName: string): void {
		this.configureSession(sessionName);
		try {
			exec(`tmux set-option -t "${sessionName}" remain-on-exit on`);
		} catch {
			// Session may not exist
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

	attachCommand(sessionName: string): string {
		return `tmux attach-session -t "${sessionName}"`;
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

		if (this.isSessionAlive(preferredName)) {
			return true;
		}

		if (!this.isSessionAlive(currentName)) {
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
