import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/platform", () => ({
	commandExists: vi.fn(),
}));

import { commandExists } from "../utils/platform";

const mockCommandExists = vi.mocked(commandExists);

import {
	BUILTIN_CODING_TOOLS,
	CodingToolRegistry,
} from "../agents/codingToolRegistry";

// Mock vscode
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(),
	},
}));

import * as vscode from "vscode";

function mockConfig(values: Record<string, unknown> = {}) {
	(
		vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>
	).mockReturnValue({
		get: (key: string, defaultValue?: unknown) =>
			key in values ? values[key] : defaultValue,
	});
}

describe("CodingToolRegistry", () => {
	let registry: CodingToolRegistry;

	beforeEach(() => {
		registry = new CodingToolRegistry();
		mockConfig();
	});

	describe("getTools", () => {
		it("returns 4 built-in tools by default", () => {
			const tools = registry.getTools();
			expect(tools).toHaveLength(4);
			expect(tools.map((t) => t.id)).toEqual([
				"claude",
				"codex",
				"copilot",
				"opencode",
			]);
		});

		it("merges user custom tools", () => {
			mockConfig({
				codingTools: [{ id: "aider", name: "Aider", command: "aider" }],
			});
			const tools = registry.getTools();
			expect(tools).toHaveLength(5);
			expect(tools[4].id).toBe("aider");
		});

		it("user tools override builtins by id", () => {
			mockConfig({
				codingTools: [
					{
						id: "claude",
						name: "My Claude",
						command: "claude",
						args: ["--model", "opus"],
					},
				],
			});
			const tools = registry.getTools();
			expect(tools).toHaveLength(4);
			const claude = tools.find((t) => t.id === "claude");
			expect(claude?.name).toBe("My Claude");
			expect(claude?.args).toEqual(["--model", "opus"]);
		});
	});

	describe("getTool", () => {
		it("finds a built-in tool by id", () => {
			const tool = registry.getTool("copilot");
			expect(tool).toBeDefined();
			expect(tool?.name).toBe("GitHub Copilot");
		});

		it("returns undefined for unknown id", () => {
			expect(registry.getTool("nonexistent")).toBeUndefined();
		});
	});

	describe("getDefaultToolId", () => {
		it("returns 'claude' by default", () => {
			expect(registry.getDefaultToolId()).toBe("claude");
		});

		it("returns configured default", () => {
			mockConfig({ defaultTool: "copilot" });
			expect(registry.getDefaultToolId()).toBe("copilot");
		});
	});

	describe("resolveAgentTool", () => {
		it("returns claude for undefined toolId", () => {
			const tool = registry.resolveAgentTool(undefined);
			expect(tool.id).toBe("claude");
		});

		it("returns the matching tool for a valid toolId", () => {
			const tool = registry.resolveAgentTool("opencode");
			expect(tool.id).toBe("opencode");
			expect(tool.command).toBe("opencode");
		});

		it("falls back to claude for unknown toolId", () => {
			const tool = registry.resolveAgentTool("nonexistent");
			expect(tool.id).toBe("claude");
		});
	});

	describe("buildLaunchCommand", () => {
		it("returns just the command when no args", () => {
			const tool = BUILTIN_CODING_TOOLS[0];
			expect(registry.buildLaunchCommand(tool)).toBe("claude");
		});

		it("joins command and args", () => {
			const tool = {
				id: "custom",
				name: "Custom",
				command: "my-tool",
				args: ["--flag", "value"],
			};
			expect(registry.buildLaunchCommand(tool)).toBe("my-tool --flag value");
		});

		it("returns just the command when args is empty array", () => {
			const tool = {
				id: "custom",
				name: "Custom",
				command: "my-tool",
				args: [],
			};
			expect(registry.buildLaunchCommand(tool)).toBe("my-tool");
		});

		it("appends --session-id for claude tool when sessionId provided", () => {
			const tool = BUILTIN_CODING_TOOLS[0];
			expect(registry.buildLaunchCommand(tool, "abc-123")).toBe(
				"claude --session-id abc-123",
			);
		});

		it("includes --session-id after custom args for claude", () => {
			mockConfig({
				codingTools: [
					{
						id: "claude",
						name: "Claude",
						command: "claude",
						args: ["--model", "opus"],
					},
				],
			});
			const tool = registry.resolveAgentTool("claude");
			expect(registry.buildLaunchCommand(tool, "abc-123")).toBe(
				"claude --model opus --session-id abc-123",
			);
		});

		it("ignores sessionId for non-claude tools", () => {
			const tool = {
				id: "copilot",
				name: "Copilot",
				command: "copilot",
			};
			expect(registry.buildLaunchCommand(tool, "abc-123")).toBe("copilot");
		});

		it("omits --session-id when sessionId is null", () => {
			const tool = BUILTIN_CODING_TOOLS[0];
			expect(registry.buildLaunchCommand(tool, null)).toBe("claude");
		});
	});

	describe("buildResumeLaunchCommand", () => {
		it("returns claude --resume <id> when claude tool has sessionId", () => {
			const tool = registry.resolveAgentTool("claude");
			expect(registry.buildResumeLaunchCommand(tool, "sess-123")).toBe(
				"claude --resume sess-123",
			);
		});

		it("returns fresh launch when claude tool has no sessionId", () => {
			const tool = registry.resolveAgentTool("claude");
			expect(registry.buildResumeLaunchCommand(tool)).toBe("claude");
			expect(registry.buildResumeLaunchCommand(tool, null)).toBe("claude");
		});

		it("returns fresh launch for copilot tool (no resume support)", () => {
			const tool = registry.resolveAgentTool("copilot");
			expect(registry.buildResumeLaunchCommand(tool)).toBe("copilot");
		});

		it("returns plain launch for opencode (no resume support)", () => {
			const tool = registry.resolveAgentTool("opencode");
			expect(registry.buildResumeLaunchCommand(tool)).toBe("opencode");
		});

		it("returns plain launch for custom tools", () => {
			const tool = {
				id: "aider",
				name: "Aider",
				command: "aider",
				args: ["--model", "opus"],
			};
			expect(registry.buildResumeLaunchCommand(tool)).toBe(
				"aider --model opus",
			);
		});
	});

	describe("isToolAvailable", () => {
		it("returns true when command exists", () => {
			mockCommandExists.mockReturnValue(true);
			const tool = BUILTIN_CODING_TOOLS[0];
			expect(registry.isToolAvailable(tool)).toBe(true);
			expect(mockCommandExists).toHaveBeenCalledWith("claude");
		});

		it("returns false when command not found", () => {
			mockCommandExists.mockReturnValue(false);
			const tool = BUILTIN_CODING_TOOLS[0];
			expect(registry.isToolAvailable(tool)).toBe(false);
		});
	});
});
