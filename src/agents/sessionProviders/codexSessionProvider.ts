import * as fs from "node:fs";
import * as path from "node:path";
import type {
	SessionInfo,
	SessionProvider,
	SessionRenameAdapter,
	SessionTitleProvider,
} from "./types";

const DEFAULT_CODEX_SESSIONS_DIR = path.join(
	process.env.HOME || "~",
	".codex",
	"sessions",
);
const DEFAULT_CODEX_SESSION_INDEX_PATH = path.join(
	process.env.HOME || "~",
	".codex",
	"session_index.jsonl",
);

const CHUNK_SIZE = 4096;

export class CodexSessionProvider
	implements SessionProvider, SessionRenameAdapter, SessionTitleProvider
{
	readonly toolId = "codex";
	private readonly sessionsDir: string;
	private readonly sessionIndexPath: string;
	private readonly pathCache = new Map<string, string>();
	private readonly nameCache = new Map<string, string>();
	private lastIndexMtimeMs: number | null = null;

	constructor(sessionsDir?: string, sessionIndexPath?: string) {
		this.sessionsDir = sessionsDir ?? DEFAULT_CODEX_SESSIONS_DIR;
		this.sessionIndexPath =
			sessionIndexPath ?? DEFAULT_CODEX_SESSION_INDEX_PATH;
	}

	scanSessions(): SessionInfo[] {
		const results: SessionInfo[] = [];
		if (!fs.existsSync(this.sessionsDir)) return results;

		try {
			this.walkDir(this.sessionsDir, results);
		} catch {
			// Ignore directory errors
		}

		return results;
	}

	findSessionFile(sessionId: string): string | null {
		const cached = this.pathCache.get(sessionId);
		if (cached) {
			if (fs.existsSync(cached)) return cached;
			this.pathCache.delete(sessionId);
		}

		if (!fs.existsSync(this.sessionsDir)) return null;

		try {
			return this.searchDir(this.sessionsDir, sessionId);
		} catch {
			return null;
		}
	}

	readTitle(filePath: string): string | null {
		let fd: number | undefined;
		try {
			fd = fs.openSync(filePath, "r");
			const buffer = Buffer.alloc(CHUNK_SIZE);
			const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, 0);
			if (bytesRead === 0) return null;

			const content = buffer.toString("utf-8", 0, bytesRead);
			const firstNewline = content.indexOf("\n");
			const firstLine =
				firstNewline >= 0 ? content.slice(0, firstNewline) : content;

			const parsed = JSON.parse(firstLine.trim());
			if (parsed.type !== "session_meta" || !parsed.payload) return null;

			return parsed.payload.title || parsed.payload.first_user_message || null;
		} catch {
			return null;
		} finally {
			if (fd !== undefined) fs.closeSync(fd);
		}
	}

	readName(sessionId: string): string | null {
		this.loadSessionIndex();
		return this.nameCache.get(sessionId) ?? null;
	}

	clearCache(sessionId: string): void {
		this.pathCache.delete(sessionId);
		this.nameCache.delete(sessionId);
		this.lastIndexMtimeMs = null;
	}

	dispose(): void {
		this.pathCache.clear();
		this.nameCache.clear();
		this.lastIndexMtimeMs = null;
	}

	private walkDir(dir: string, results: SessionInfo[]): void {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				this.walkDir(fullPath, results);
			} else if (entry.name.endsWith(".jsonl")) {
				const info = this.parseSessionFile(fullPath);
				if (info) results.push(info);
			}
		}
	}

	private parseSessionFile(filePath: string): SessionInfo | null {
		let fd: number | undefined;
		try {
			fd = fs.openSync(filePath, "r");
			const buffer = Buffer.alloc(CHUNK_SIZE);
			const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, 0);
			if (bytesRead === 0) return null;

			const content = buffer.toString("utf-8", 0, bytesRead);
			const firstNewline = content.indexOf("\n");
			const firstLine =
				firstNewline >= 0 ? content.slice(0, firstNewline) : content;

			const parsed = JSON.parse(firstLine.trim());
			if (parsed.type !== "session_meta" || !parsed.payload) return null;

			const sessionId = parsed.payload.id || "";
			if (!sessionId) return null;

			return {
				sessionId,
				prompt: parsed.payload.title || parsed.payload.first_user_message || "",
				created: parsed.payload.created || "",
				projectPath: parsed.payload.cwd || "",
			};
		} catch {
			return null;
		} finally {
			if (fd !== undefined) fs.closeSync(fd);
		}
	}

	private searchDir(dir: string, sessionId: string): string | null {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				const result = this.searchDir(fullPath, sessionId);
				if (result) return result;
			} else if (
				entry.name.endsWith(".jsonl") &&
				entry.name.includes(sessionId)
			) {
				this.pathCache.set(sessionId, fullPath);
				return fullPath;
			}
		}
		return null;
	}

	private loadSessionIndex(): void {
		if (!fs.existsSync(this.sessionIndexPath)) {
			this.nameCache.clear();
			this.lastIndexMtimeMs = null;
			return;
		}

		let stat: fs.Stats;
		try {
			stat = fs.statSync(this.sessionIndexPath);
		} catch {
			return;
		}

		if (this.lastIndexMtimeMs === stat.mtimeMs) return;

		try {
			const content = fs.readFileSync(this.sessionIndexPath, "utf-8");
			const nextCache = new Map<string, string>();

			for (const line of content.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				try {
					const parsed = JSON.parse(trimmed);
					const sessionId =
						typeof parsed.id === "string" ? parsed.id.trim() : "";
					const threadName =
						typeof parsed.thread_name === "string"
							? parsed.thread_name.trim()
							: "";
					if (!sessionId || !threadName) continue;
					nextCache.set(sessionId, threadName);
				} catch {
					// Ignore malformed JSONL rows
				}
			}

			this.nameCache.clear();
			for (const [sessionId, threadName] of nextCache) {
				this.nameCache.set(sessionId, threadName);
			}
			this.lastIndexMtimeMs = stat.mtimeMs;
		} catch {
			// Ignore read errors and keep the previous cache
		}
	}
}
