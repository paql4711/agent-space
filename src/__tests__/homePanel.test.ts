import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	createWebviewPanelMock,
	disposableMock,
	revealMock,
	getPreferenceMock,
	setPreferenceMock,
} = vi.hoisted(() => {
	const reveal = vi.fn();
	return {
		createWebviewPanelMock: vi.fn(),
		disposableMock: vi.fn(() => ({ dispose: vi.fn() })),
		revealMock: reveal,
		getPreferenceMock: vi.fn(),
		setPreferenceMock: vi.fn(),
	};
});

vi.mock("vscode", () => ({
	ViewColumn: {
		One: 1,
	},
	Uri: {
		joinPath: vi.fn(() => ({ path: "/mocked/resource" })),
	},
	window: {
		createWebviewPanel: createWebviewPanelMock,
	},
	ThemeIcon: class {},
}));

import * as vscode from "vscode";
import { HomePanel } from "../home/homePanel";

describe("HomePanel", () => {
	const feature = {
		id: "feature-1",
		name: "Auth",
		branch: "feat/auth",
		worktreePath: "/repo/.worktrees/auth",
		status: "active",
		color: "terminal.ansiBlue",
		isolation: "shared",
		createdAt: "2026-03-09T00:00:00Z",
		kind: "feature",
		managed: "user",
	};

	const webview = {
		options: {},
		html: "",
		asWebviewUri: vi.fn(() => "webview:/resource"),
		onDidReceiveMessage: vi.fn(disposableMock),
		postMessage: vi.fn(),
	};

	const panel = {
		webview,
		title: "Agent Space",
		reveal: revealMock,
		onDidChangeViewState: vi.fn(disposableMock),
		onDidDispose: vi.fn(disposableMock),
		dispose: vi.fn(),
	};

	const projectManager = {
		getProjects: vi.fn(() => []),
		getAllContexts: vi.fn(() => []),
		findContextByFeatureId: vi.fn(() => ({
			featureManager: {
				getFeature: vi.fn(() => feature),
			},
			agentManager: {
				getAgents: vi.fn(() => []),
			},
			serviceManager: {
				getServices: vi.fn(() => []),
			},
		})),
	};

	const toolRegistry = {
		getDefaultToolId: vi.fn(() => "codex"),
		resolveAgentTool: vi.fn(() => ({ id: "codex", name: "Codex" })),
	};

	const tmux = {
		sessionName: vi.fn(() => "agent-space-feature-1-agent-1"),
		isSessionAlive: vi.fn(() => false),
	};

	const globalStore = {
		getPreference: getPreferenceMock,
		setPreference: setPreferenceMock,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		createWebviewPanelMock.mockReturnValue(panel);
		getPreferenceMock.mockReturnValue(undefined);
		(HomePanel as unknown as { instance?: unknown }).instance = undefined;
	});

	it("reveals feature pages with focus", () => {
		const home = HomePanel.createOrShow(
			projectManager as never,
			tmux as never,
			toolRegistry as never,
			{} as vscode.Uri,
			globalStore as never,
		);

		revealMock.mockClear();

		home.showFeature("feature-1");

		expect(revealMock).toHaveBeenCalledWith(vscode.ViewColumn.One, false);
	});
});
