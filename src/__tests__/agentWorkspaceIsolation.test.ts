import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { executeCommandMock } = vi.hoisted(() => ({
	executeCommandMock: vi.fn(),
}));

vi.mock("vscode", () => ({
	commands: {
		executeCommand: executeCommandMock,
	},
	window: {
		terminals: [],
	},
}));

import { ContextOnlyIsolation } from "../workspace/agentWorkspaceIsolation";

describe("ContextOnlyIsolation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		executeCommandMock.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("sets agentMode context on enter", async () => {
		const isolation = new ContextOnlyIsolation();

		await isolation.enter();

		expect(executeCommandMock).toHaveBeenCalledWith(
			"setContext",
			"agentSpace.agentMode",
			true,
		);
		expect(isolation.isActive()).toBe(true);
	});

	it("clears agentMode context on leave", async () => {
		const isolation = new ContextOnlyIsolation();
		await isolation.enter();

		await isolation.leave();

		expect(executeCommandMock).toHaveBeenCalledWith(
			"setContext",
			"agentSpace.agentMode",
			false,
		);
		expect(isolation.isActive()).toBe(false);
	});

	it("does not modify tabs or panel settings", async () => {
		const isolation = new ContextOnlyIsolation();

		await isolation.enter();
		await isolation.leave();

		const commands = executeCommandMock.mock.calls.map(
			(c: string[]) => c[0],
		);
		expect(commands).not.toContain("workbench.action.closePanel");
		expect(commands).not.toContain("workbench.action.editorLayoutSingle");
		expect(commands).not.toContain("workbench.action.togglePanel");
	});

	it("supports debounce scheduling", async () => {
		const isolation = new ContextOnlyIsolation();

		isolation.scheduleEnter();
		expect(isolation.getPendingAction()).toBe("enter");

		await vi.advanceTimersByTimeAsync(50);

		expect(isolation.isActive()).toBe(true);

		isolation.scheduleLeave();
		expect(isolation.getPendingAction()).toBe("leave");

		await vi.advanceTimersByTimeAsync(50);

		expect(isolation.isActive()).toBe(false);
	});

	it("aborts leave when guard returns false", async () => {
		const isolation = new ContextOnlyIsolation();
		await isolation.enter();

		isolation.scheduleLeave({ guard: () => false });

		await vi.advanceTimersByTimeAsync(50);

		expect(isolation.isActive()).toBe(true);
	});

	it("cancels pending leave when enter() is called directly", async () => {
		const isolation = new ContextOnlyIsolation();
		await isolation.enter();

		isolation.scheduleLeave();
		expect(isolation.getPendingAction()).toBe("leave");

		await isolation.leave();
		await isolation.enter();

		await vi.advanceTimersByTimeAsync(50);

		expect(isolation.isActive()).toBe(true);
	});

	it("exposes cancelPending() as a public method", () => {
		const isolation = new ContextOnlyIsolation();

		isolation.scheduleEnter();
		expect(isolation.getPendingAction()).toBe("enter");

		isolation.cancelPending();
		expect(isolation.getPendingAction()).toBeUndefined();
	});
});
