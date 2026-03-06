import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CopilotSessionProvider } from "../agents/sessionProviders/copilotSessionProvider";

describe("CopilotSessionProvider", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function writeJsonl(filename: string, lines: string[]) {
		fs.writeFileSync(path.join(tmpDir, filename), lines.join("\n"));
	}

	it("parses session.start and user.message events", () => {
		writeJsonl("abc-123.jsonl", [
			JSON.stringify({
				type: "session.start",
				sessionId: "sess-abc",
				startTime: "2026-03-04T10:00:00.000Z",
			}),
			JSON.stringify({
				type: "user.message",
				data: {
					content:
						"## TASK\nImplement dark mode\n## CONSTRAINTS\nUse CSS variables",
				},
			}),
		]);

		const provider = new CopilotSessionProvider(tmpDir);
		const sessions = provider.scanSessions();

		expect(sessions).toHaveLength(1);
		expect(sessions[0].sessionId).toBe("sess-abc");
		expect(sessions[0].prompt).toBe("Implement dark mode");
		expect(sessions[0].created).toBe("2026-03-04T10:00:00.000Z");
		expect(sessions[0].projectPath).toBe("");
	});

	it("extracts task title from ## TASK block", () => {
		writeJsonl("task-extract.jsonl", [
			JSON.stringify({
				type: "session.start",
				sessionId: "sess-task",
				startTime: "2026-03-04T10:00:00.000Z",
			}),
			JSON.stringify({
				type: "user.message",
				data: {
					content:
						"## TASK\nAdd error handling to API endpoints\n## CONSTRAINTS\nFollow REST conventions",
				},
			}),
		]);

		const provider = new CopilotSessionProvider(tmpDir);
		const sessions = provider.scanSessions();

		expect(sessions[0].prompt).toBe("Add error handling to API endpoints");
	});

	it("falls back to first line when no ## TASK block", () => {
		writeJsonl("no-task.jsonl", [
			JSON.stringify({
				type: "session.start",
				sessionId: "sess-plain",
				startTime: "2026-03-04T10:00:00.000Z",
			}),
			JSON.stringify({
				type: "user.message",
				data: { content: "Fix the login page CSS" },
			}),
		]);

		const provider = new CopilotSessionProvider(tmpDir);
		const sessions = provider.scanSessions();

		expect(sessions[0].prompt).toBe("Fix the login page CSS");
	});

	it("uses nested data.sessionId and data.startTime", () => {
		writeJsonl("nested.jsonl", [
			JSON.stringify({
				type: "session.start",
				data: {
					sessionId: "sess-nested",
					startTime: "2026-03-04T12:00:00.000Z",
				},
			}),
			JSON.stringify({
				type: "user.message",
				data: { content: "Refactor database layer" },
			}),
		]);

		const provider = new CopilotSessionProvider(tmpDir);
		const sessions = provider.scanSessions();

		expect(sessions[0].sessionId).toBe("sess-nested");
		expect(sessions[0].created).toBe("2026-03-04T12:00:00.000Z");
	});

	it("handles multiple session files", () => {
		writeJsonl("session-a.jsonl", [
			JSON.stringify({
				type: "session.start",
				sessionId: "sess-a",
				startTime: "2026-03-04T10:00:00.000Z",
			}),
			JSON.stringify({
				type: "user.message",
				data: { content: "Task A" },
			}),
		]);

		writeJsonl("session-b.jsonl", [
			JSON.stringify({
				type: "session.start",
				sessionId: "sess-b",
				startTime: "2026-03-04T11:00:00.000Z",
			}),
			JSON.stringify({
				type: "user.message",
				data: { content: "Task B" },
			}),
		]);

		const provider = new CopilotSessionProvider(tmpDir);
		const sessions = provider.scanSessions();

		expect(sessions).toHaveLength(2);
		const ids = sessions.map((s) => s.sessionId).sort();
		expect(ids).toEqual(["sess-a", "sess-b"]);
	});

	it("skips non-jsonl files", () => {
		fs.writeFileSync(path.join(tmpDir, "readme.txt"), "not a session");
		writeJsonl("valid.jsonl", [
			JSON.stringify({
				type: "session.start",
				sessionId: "sess-valid",
				startTime: "2026-03-04T10:00:00.000Z",
			}),
		]);

		const provider = new CopilotSessionProvider(tmpDir);
		const sessions = provider.scanSessions();

		expect(sessions).toHaveLength(1);
		expect(sessions[0].sessionId).toBe("sess-valid");
	});

	it("returns empty array when directory does not exist", () => {
		const provider = new CopilotSessionProvider("/nonexistent/path");
		expect(provider.scanSessions()).toEqual([]);
	});

	it("skips files without session.start event", () => {
		writeJsonl("no-start.jsonl", [
			JSON.stringify({
				type: "user.message",
				data: { content: "Hello" },
			}),
		]);

		const provider = new CopilotSessionProvider(tmpDir);
		const sessions = provider.scanSessions();

		expect(sessions).toHaveLength(0);
	});

	it("has toolId copilot", () => {
		const provider = new CopilotSessionProvider(tmpDir);
		expect(provider.toolId).toBe("copilot");
	});
});
