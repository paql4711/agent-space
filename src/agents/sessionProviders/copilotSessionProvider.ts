import * as fs from "node:fs";
import * as path from "node:path";
import type { SessionInfo, SessionProvider } from "./types";

const DEFAULT_SESSION_DIR = path.join(
	process.env.HOME || "~",
	".copilot",
	"session-state",
);

export class CopilotSessionProvider implements SessionProvider {
	readonly toolId = "copilot";
	private readonly sessionDir: string;

	constructor(sessionDir?: string) {
		this.sessionDir = sessionDir ?? DEFAULT_SESSION_DIR;
	}

	scanSessions(): SessionInfo[] {
		const results: SessionInfo[] = [];
		if (!fs.existsSync(this.sessionDir)) return results;

		try {
			const files = fs.readdirSync(this.sessionDir);
			for (const file of files) {
				if (!file.endsWith(".jsonl")) continue;

				try {
					const filePath = path.join(this.sessionDir, file);
					const raw = fs.readFileSync(filePath, "utf-8");
					const session = parseSessionJsonl(raw);
					if (session) {
						results.push(session);
					}
				} catch {
					// Skip unparseable files
				}
			}
		} catch {
			// Ignore directory errors
		}

		return results;
	}
}

function parseSessionJsonl(raw: string): SessionInfo | null {
	const lines = raw.split("\n").filter((l) => l.trim());

	let sessionId = "";
	let startTime = "";
	let prompt = "";

	for (const line of lines) {
		try {
			const event = JSON.parse(line);
			const type = event.type || event.event;

			if (type === "session.start") {
				sessionId = event.sessionId || event.data?.sessionId || "";
				startTime =
					event.startTime || event.data?.startTime || event.timestamp || "";
			}

			if ((type === "user.message" || type === "user.prompt") && !prompt) {
				const content = event.data?.content || event.content || "";
				prompt = extractTaskFromContent(content);
			}
		} catch {
			// Skip unparseable lines
		}
	}

	if (!sessionId) return null;

	return {
		sessionId,
		prompt,
		created: startTime,
		// Copilot JSONL has no project path — rely on timing only
		projectPath: "",
	};
}

function extractTaskFromContent(content: string): string {
	// Copilot wraps the task in a template: ## TASK\n{task}\n## CONSTRAINTS
	const taskMatch = content.match(/## TASK\n([\s\S]*?)(?:\n## |$)/);
	if (taskMatch?.[1]) {
		return taskMatch[1].trim();
	}
	// Fallback: use the content directly (first line)
	const firstLine = content.split("\n")[0]?.trim() || "";
	return firstLine;
}
