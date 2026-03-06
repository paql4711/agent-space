import { describe, expect, it, vi } from "vitest";
import { OpenCodeSessionProvider } from "../agents/sessionProviders/openCodeSessionProvider";

// Mock child_process.execSync since we can't run `opencode` in CI
vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
}));

import { execSync } from "node:child_process";

const mockExecSync = vi.mocked(execSync);

describe("OpenCodeSessionProvider", () => {
	it("parses opencode db output into SessionInfo[]", () => {
		mockExecSync.mockReturnValue(
			JSON.stringify([
				{
					id: "oc-1",
					title: "Add unit tests",
					directory: "/home/user/project",
					time_created: 1709550000000,
				},
				{
					id: "oc-2",
					title: "Fix CSS layout",
					directory: "/home/user/other-project",
					time_created: 1709553600000,
				},
			]),
		);

		const provider = new OpenCodeSessionProvider();
		const sessions = provider.scanSessions();

		expect(sessions).toHaveLength(2);
		expect(sessions[0]).toEqual({
			sessionId: "oc-1",
			prompt: "Add unit tests",
			created: new Date(1709550000000).toISOString(),
			projectPath: "/home/user/project",
		});
		expect(sessions[1]).toEqual({
			sessionId: "oc-2",
			prompt: "Fix CSS layout",
			created: new Date(1709553600000).toISOString(),
			projectPath: "/home/user/other-project",
		});
	});

	it("returns empty array when opencode CLI is not available", () => {
		mockExecSync.mockImplementation(() => {
			throw new Error("command not found: opencode");
		});

		const provider = new OpenCodeSessionProvider();
		expect(provider.scanSessions()).toEqual([]);
	});

	it("returns empty array for non-array JSON response", () => {
		mockExecSync.mockReturnValue(JSON.stringify({ error: "no sessions" }));

		const provider = new OpenCodeSessionProvider();
		expect(provider.scanSessions()).toEqual([]);
	});

	it("filters out rows without id", () => {
		mockExecSync.mockReturnValue(
			JSON.stringify([
				{ id: "oc-1", title: "Valid", directory: "/tmp", time_created: 1000 },
				{ id: "", title: "No ID", directory: "/tmp", time_created: 2000 },
				{ title: "Missing ID", directory: "/tmp", time_created: 3000 },
			]),
		);

		const provider = new OpenCodeSessionProvider();
		const sessions = provider.scanSessions();

		expect(sessions).toHaveLength(1);
		expect(sessions[0].sessionId).toBe("oc-1");
	});

	it("handles missing optional fields gracefully", () => {
		mockExecSync.mockReturnValue(JSON.stringify([{ id: "oc-sparse" }]));

		const provider = new OpenCodeSessionProvider();
		const sessions = provider.scanSessions();

		expect(sessions).toHaveLength(1);
		expect(sessions[0]).toEqual({
			sessionId: "oc-sparse",
			prompt: "",
			created: "",
			projectPath: "",
		});
	});

	it("calls opencode with the right command", () => {
		mockExecSync.mockReturnValue("[]");

		const provider = new OpenCodeSessionProvider();
		provider.scanSessions();

		expect(mockExecSync).toHaveBeenCalledWith(
			'opencode db "SELECT id, title, directory, time_created FROM session ORDER BY time_created DESC LIMIT 20" --format json',
			expect.objectContaining({
				encoding: "utf-8",
				timeout: 5000,
			}),
		);
	});

	it("has toolId opencode", () => {
		const provider = new OpenCodeSessionProvider();
		expect(provider.toolId).toBe("opencode");
	});
});
