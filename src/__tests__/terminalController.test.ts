import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTerminalMock, showErrorMessageMock, onDidCloseTerminalMock } =
	vi.hoisted(() => ({
		createTerminalMock: vi.fn(),
		showErrorMessageMock: vi.fn(),
		onDidCloseTerminalMock: vi.fn(() => ({ dispose: vi.fn() })),
	}));

vi.mock("../utils/platform", () => ({
	exec: vi.fn(),
	getTerminalShellArgs: vi.fn(() => ({
		shellPath: "tmux",
		shellArgs: ["attach-session", "-t", "session"],
	})),
}));

vi.mock("../constants/colors", () => ({
	getThemeColors: vi.fn(() => [{ id: "terminal.ansiBlue" }]),
}));

vi.mock("vscode", () => ({
	window: {
		createTerminal: createTerminalMock,
		showErrorMessage: showErrorMessageMock,
		onDidCloseTerminal: onDidCloseTerminalMock,
	},
	ThemeIcon: class {
		constructor(public readonly id: string) {}
	},
	ThemeColor: class {
		constructor(public readonly id: string) {}
	},
	TerminalLocation: {
		Editor: "editor",
	},
}));

import { TerminalController } from "../agents/terminalController";
import type { Agent, Feature } from "../types";
import { exec } from "../utils/platform";

describe("TerminalController", () => {
	const feature: Feature = {
		id: "f1",
		name: "Feature One",
		branch: "feat/feature-one",
		worktreePath: "/repo/feature-one",
		status: "active",
		color: "terminal.ansiBlue",
		isolation: "shared",
		createdAt: "2026-03-06T00:00:00Z",
	};

	const agent: Agent = {
		id: "a1",
		featureId: "f1",
		name: "Agent 1",
		sessionId: "session-1",
		toolId: "claude",
		status: "stopped",
		createdAt: "2026-03-06T00:00:00Z",
	};

	const updateAgentStatus = vi.fn();
	const notifyChange = vi.fn();
	const findContextByFeatureId = vi.fn();
	const adoptSession = vi.fn();
	const createCommand = vi.fn();
	const configureSession = vi.fn();
	const isSessionAlive = vi.fn();
	const resolveAgentTool = vi.fn();
	const buildLaunchCommand = vi.fn();
	const buildResumeLaunchCommand = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		findContextByFeatureId.mockReturnValue({
			agentManager: { updateAgentStatus },
		});
		adoptSession.mockReturnValue(false);
		createCommand.mockReturnValue('tmux new-session -d -s "session" "claude"');
		isSessionAlive.mockReturnValue(true);
		resolveAgentTool.mockReturnValue({
			id: "claude",
			name: "Claude Code",
			command: "claude",
		});
		buildLaunchCommand.mockReturnValue("claude");
		buildResumeLaunchCommand.mockReturnValue("claude --resume session-1");
		createTerminalMock.mockReturnValue({ show: vi.fn(), dispose: vi.fn() });
		showErrorMessageMock.mockResolvedValue(undefined);
	});

	it("does not create or mark a terminal running when tmux startup fails", () => {
		const controller = new TerminalController(
			{ findContextByFeatureId, notifyChange } as never,
			{
				sessionName: vi.fn().mockReturnValue("agent-space-f1-a1"),
				legacySessionName: vi.fn().mockReturnValue("companion-f1-a1"),
				adoptSession,
				createCommand,
				configureSession,
				isSessionAlive,
			} as never,
			{
				resolveAgentTool,
				buildLaunchCommand,
				buildResumeLaunchCommand,
			} as never,
		);

		vi.mocked(exec).mockImplementation(() => {
			throw new Error("spawn failed");
		});

		const terminal = controller.createTerminal(feature, agent, 0);

		expect(terminal).toBeUndefined();
		expect(createTerminalMock).not.toHaveBeenCalled();
		expect(updateAgentStatus).not.toHaveBeenCalled();
		expect(notifyChange).not.toHaveBeenCalled();
		expect(showErrorMessageMock).toHaveBeenCalledWith(
			"Failed to start Agent 1 with Claude Code. Check that the CLI is installed and launches from /repo/feature-one.",
		);
	});

	it("does not mark an agent running when tmux session dies immediately", () => {
		const controller = new TerminalController(
			{ findContextByFeatureId, notifyChange } as never,
			{
				sessionName: vi.fn().mockReturnValue("agent-space-f1-a1"),
				legacySessionName: vi.fn().mockReturnValue("companion-f1-a1"),
				adoptSession,
				createCommand,
				configureSession,
				isSessionAlive: vi.fn().mockReturnValue(false),
			} as never,
			{
				resolveAgentTool,
				buildLaunchCommand,
				buildResumeLaunchCommand,
			} as never,
		);

		vi.mocked(exec).mockReturnValue("");

		const terminal = controller.createTerminal(feature, agent, 0);

		expect(terminal).toBeUndefined();
		expect(createTerminalMock).not.toHaveBeenCalled();
		expect(updateAgentStatus).not.toHaveBeenCalled();
		expect(notifyChange).not.toHaveBeenCalled();
	});
});
