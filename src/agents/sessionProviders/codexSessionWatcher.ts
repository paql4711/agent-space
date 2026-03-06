import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import type { ProjectManager } from "../../projects/projectManager";

const CODEX_SESSIONS_DIR = path.join(
	process.env.HOME || "~",
	".codex",
	"sessions",
);

/**
 * Watches ~/.codex/sessions/ for new JSONL rollout files to discover
 * Codex session IDs after launch. Codex auto-generates session IDs,
 * so we need to discover them by matching the cwd in the session_meta
 * to the agent's working directory.
 */
export class CodexSessionWatcher {
	private watcher: fs.FSWatcher | null = null;
	private projectManager: ProjectManager | undefined;
	private onSessionDiscovered?: () => void;
	private readonly seenFiles = new Set<string>();
	private readonly sessionsDir: string;

	constructor(sessionsDir?: string) {
		this.sessionsDir = sessionsDir ?? CODEX_SESSIONS_DIR;
	}

	onDiscovered(callback: () => void): void {
		this.onSessionDiscovered = callback;
	}

	start(projectManager: ProjectManager): void {
		this.projectManager = projectManager;

		if (!fs.existsSync(this.sessionsDir)) {
			try {
				fs.mkdirSync(this.sessionsDir, { recursive: true });
			} catch {
				return;
			}
		}

		try {
			this.watcher = fs.watch(
				this.sessionsDir,
				{ recursive: true },
				(_event, filename) => {
					if (!filename || !filename.endsWith(".jsonl")) return;
					const fullPath = path.join(this.sessionsDir, filename);
					if (this.seenFiles.has(fullPath)) return;
					this.seenFiles.add(fullPath);
					this.processNewFile(fullPath);
				},
			);
		} catch {
			// Watch not supported or directory issues — degrade gracefully
		}
	}

	private async processNewFile(filePath: string): Promise<void> {
		if (!this.projectManager) return;

		try {
			// Wait briefly for the file to be written
			await new Promise((resolve) => setTimeout(resolve, 500));

			if (!fs.existsSync(filePath)) return;

			const firstLine = await this.readFirstLine(filePath);
			if (!firstLine) return;

			const parsed = JSON.parse(firstLine);
			if (parsed.type !== "session_meta" || !parsed.payload) return;

			const sessionId = parsed.payload.id;
			const sessionCwd = parsed.payload.cwd;
			if (!sessionId || !sessionCwd) return;

			this.matchSessionToAgent(sessionId, sessionCwd);
		} catch {
			// Ignore parse errors — file may not be a Codex session
		}
	}

	private matchSessionToAgent(sessionId: string, sessionCwd: string): void {
		if (!this.projectManager) return;

		const normalizedCwd = path.resolve(sessionCwd);

		for (const ctx of this.projectManager.getAllContexts()) {
			for (const feature of ctx.featureManager.getFeatures()) {
				const agents = ctx.agentManager.getAgents(feature.id);
				for (const agent of agents) {
					if (agent.toolId !== "codex") continue;
					if (agent.sessionId) continue; // Already has a session ID
					if (agent.status === "done") continue;

					const agentCwd = path.resolve(
						agent.worktreePath ?? feature.worktreePath,
					);

					if (normalizedCwd === agentCwd) {
						ctx.agentManager.updateAgentSessionId(
							agent.id,
							feature.id,
							sessionId,
						);
						this.onSessionDiscovered?.();
						return;
					}
				}
			}
		}
	}

	private readFirstLine(filePath: string): Promise<string | null> {
		return new Promise((resolve) => {
			const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
			const rl = readline.createInterface({ input: stream });
			let resolved = false;

			rl.on("line", (line) => {
				if (!resolved) {
					resolved = true;
					rl.close();
					stream.destroy();
					resolve(line.trim() || null);
				}
			});

			rl.on("close", () => {
				if (!resolved) resolve(null);
			});

			rl.on("error", () => {
				if (!resolved) resolve(null);
			});
		});
	}

	dispose(): void {
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}
		this.seenFiles.clear();
	}
}
