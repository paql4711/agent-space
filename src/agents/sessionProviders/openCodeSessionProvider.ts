import { execSync } from "node:child_process";
import type { SessionInfo, SessionProvider } from "./types";

export class OpenCodeSessionProvider implements SessionProvider {
	readonly toolId = "opencode";

	scanSessions(): SessionInfo[] {
		try {
			const raw = execSync(
				'opencode db "SELECT id, title, directory, time_created FROM session ORDER BY time_created DESC LIMIT 20" --format json',
				{ encoding: "utf-8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] },
			);
			const rows = JSON.parse(raw);
			if (!Array.isArray(rows)) return [];

			return rows
				.filter((r: Record<string, unknown>) => r.id)
				.map((r: Record<string, unknown>) => ({
					sessionId: String(r.id || ""),
					prompt: String(r.title || ""),
					created: epochMsToIso(r.time_created),
					projectPath: String(r.directory || ""),
				}));
		} catch {
			// opencode CLI not available or query failed
			return [];
		}
	}
}

function epochMsToIso(value: unknown): string {
	if (typeof value === "number" && value > 0) {
		return new Date(value).toISOString();
	}
	if (typeof value === "string") {
		const n = Number(value);
		if (!Number.isNaN(n) && n > 0) return new Date(n).toISOString();
		return value;
	}
	return "";
}
