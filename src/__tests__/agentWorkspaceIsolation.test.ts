import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeCommandMock, getConfigurationMock, updateMock } = vi.hoisted(
	() => ({
		executeCommandMock: vi.fn(),
		getConfigurationMock: vi.fn(),
		updateMock: vi.fn(),
	}),
);

vi.mock("vscode", () => ({
	commands: {
		executeCommand: executeCommandMock,
	},
	window: {
		terminals: [],
	},
	workspace: {
		getConfiguration: getConfigurationMock,
	},
	ConfigurationTarget: {
		Global: 1,
		Workspace: 2,
		WorkspaceFolder: 3,
	},
}));

import * as vscode from "vscode";
import { AgentWorkspaceIsolation } from "../workspace/agentWorkspaceIsolation";

describe("AgentWorkspaceIsolation", () => {
	const mockedWindow = vscode.window as unknown as { terminals: unknown[] };

	beforeEach(() => {
		vi.clearAllMocks();
		updateMock.mockResolvedValue(undefined);
		executeCommandMock.mockResolvedValue(undefined);
		getConfigurationMock.mockReturnValue({
			inspect: vi.fn(() => ({
				globalValue: "multiple",
			})),
			update: updateMock,
		});
		mockedWindow.terminals = [];
	});

	it("hides tabs and maximizes the editor area on enter", async () => {
		const isolation = new AgentWorkspaceIsolation();

		await isolation.enter();

		expect(updateMock).toHaveBeenCalledWith(
			"showTabs",
			"none",
			vscode.ConfigurationTarget.Global,
		);
		expect(executeCommandMock.mock.calls).toEqual([
			["workbench.action.maximizeEditor"],
			["workbench.action.closePanel"],
		]);
		expect(isolation.isActive()).toBe(true);
	});

	it("restores the tabs setting and panel state on leave", async () => {
		mockedWindow.terminals = [{}];
		const isolation = new AgentWorkspaceIsolation();

		await isolation.enter();
		await isolation.leave();

		expect(updateMock.mock.calls).toEqual([
			["showTabs", "none", vscode.ConfigurationTarget.Global],
			["showTabs", "multiple", vscode.ConfigurationTarget.Global],
		]);
		expect(executeCommandMock.mock.calls).toEqual([
			["workbench.action.maximizeEditor"],
			["workbench.action.closePanel"],
			["workbench.action.maximizeEditor"],
			["workbench.action.togglePanel"],
		]);
		expect(isolation.isActive()).toBe(false);
	});

	it("uses workspace scope when that is where tabs are configured", async () => {
		getConfigurationMock.mockReturnValue({
			inspect: vi.fn(() => ({
				workspaceValue: "single",
			})),
			update: updateMock,
		});
		const isolation = new AgentWorkspaceIsolation();

		await isolation.enter();
		await isolation.leave();

		expect(updateMock.mock.calls).toEqual([
			["showTabs", "none", vscode.ConfigurationTarget.Workspace],
			["showTabs", "single", vscode.ConfigurationTarget.Workspace],
		]);
	});
});
