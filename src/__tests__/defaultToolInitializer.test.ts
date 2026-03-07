import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ensureDefaultToolConfigured,
	hasConfiguredDefaultTool,
} from "../startup/defaultToolInitializer";

const { mockGetConfiguration, mockShowQuickPick } = vi.hoisted(() => ({
	mockGetConfiguration: vi.fn(),
	mockShowQuickPick: vi.fn(),
}));

vi.mock("vscode", () => ({
	ConfigurationTarget: {
		Global: 1,
	},
	window: {
		showQuickPick: mockShowQuickPick,
	},
	workspace: {
		getConfiguration: mockGetConfiguration,
	},
}));

function createPreferences(prompted = false) {
	return {
		getPreference<T>(_key: string, _defaultValue: T): T {
			return prompted as T;
		},
		setPreference: vi.fn(),
	};
}

describe("defaultToolInitializer", () => {
	const update = vi.fn();
	const inspect = vi.fn();

	beforeEach(() => {
		inspect.mockReset();
		update.mockReset();
		mockShowQuickPick.mockReset();
		mockGetConfiguration.mockReset();
		mockGetConfiguration.mockReturnValue({
			inspect,
			update,
		});
	});

	describe("hasConfiguredDefaultTool", () => {
		it("returns false when defaultTool is unset", () => {
			inspect.mockReturnValue({});
			expect(hasConfiguredDefaultTool()).toBe(false);
		});

		it("returns true when defaultTool is configured in user settings", () => {
			inspect.mockReturnValue({ globalValue: "codex" });
			expect(hasConfiguredDefaultTool()).toBe(true);
		});
	});

	describe("ensureDefaultToolConfigured", () => {
		it("skips prompting when defaultTool is already configured", async () => {
			inspect.mockReturnValue({ globalValue: "codex" });
			const preferences = createPreferences();

			await ensureDefaultToolConfigured(
				{
					getAvailableTools: vi.fn(),
				},
				preferences,
			);

			expect(mockShowQuickPick).not.toHaveBeenCalled();
			expect(update).not.toHaveBeenCalled();
			expect(preferences.setPreference).not.toHaveBeenCalled();
		});

		it("skips prompting after the first-start prompt has already been shown", async () => {
			inspect.mockReturnValue({});
			const preferences = createPreferences(true);

			await ensureDefaultToolConfigured(
				{
					getAvailableTools: vi.fn(),
				},
				preferences,
			);

			expect(mockShowQuickPick).not.toHaveBeenCalled();
			expect(update).not.toHaveBeenCalled();
		});

		it("waits until at least one coding tool is available", async () => {
			inspect.mockReturnValue({});
			const preferences = createPreferences();

			await ensureDefaultToolConfigured(
				{
					getAvailableTools: vi.fn().mockReturnValue([]),
				},
				preferences,
			);

			expect(mockShowQuickPick).not.toHaveBeenCalled();
			expect(preferences.setPreference).not.toHaveBeenCalled();
			expect(update).not.toHaveBeenCalled();
		});

		it("persists the selected tool to user settings", async () => {
			inspect.mockReturnValue({});
			mockShowQuickPick.mockResolvedValue({
				label: "Codex CLI",
				description: "codex",
				toolId: "codex",
			});
			const preferences = createPreferences();

			await ensureDefaultToolConfigured(
				{
					getAvailableTools: vi
						.fn()
						.mockReturnValue([
							{ id: "codex", name: "Codex CLI", command: "codex" },
						]),
				},
				preferences,
			);

			expect(mockShowQuickPick).toHaveBeenCalled();
			expect(preferences.setPreference).toHaveBeenCalledWith(
				"hasPromptedDefaultToolSelection",
				true,
			);
			expect(update).toHaveBeenCalledWith("defaultTool", "codex", 1);
		});

		it("records that the first-start prompt was shown even when dismissed", async () => {
			inspect.mockReturnValue({});
			mockShowQuickPick.mockResolvedValue(undefined);
			const preferences = createPreferences();

			await ensureDefaultToolConfigured(
				{
					getAvailableTools: vi
						.fn()
						.mockReturnValue([
							{ id: "codex", name: "Codex CLI", command: "codex" },
						]),
				},
				preferences,
			);

			expect(preferences.setPreference).toHaveBeenCalledWith(
				"hasPromptedDefaultToolSelection",
				true,
			);
			expect(update).not.toHaveBeenCalled();
		});
	});
});
