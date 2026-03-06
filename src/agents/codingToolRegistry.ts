import * as vscode from "vscode";
import type { CodingTool } from "../types";
import { commandExists } from "../utils/platform";

export const BUILTIN_CODING_TOOLS: CodingTool[] = [
	{ id: "claude", name: "Claude Code", command: "claude" },
	{ id: "codex", name: "Codex CLI", command: "codex" },
	{ id: "copilot", name: "GitHub Copilot", command: "copilot" },
	{ id: "opencode", name: "OpenCode", command: "opencode" },
];

export class CodingToolRegistry {
	getTools(): CodingTool[] {
		const custom = vscode.workspace
			.getConfiguration("agentSpace")
			.get<CodingTool[]>("codingTools", []);

		const merged = new Map<string, CodingTool>();
		for (const tool of BUILTIN_CODING_TOOLS) {
			merged.set(tool.id, tool);
		}
		for (const tool of custom) {
			merged.set(tool.id, tool);
		}
		return [...merged.values()];
	}

	getTool(toolId: string): CodingTool | undefined {
		return this.getTools().find((t) => t.id === toolId);
	}

	getDefaultToolId(): string {
		return vscode.workspace
			.getConfiguration("agentSpace")
			.get<string>("defaultTool", "claude");
	}

	getAvailableTools(): CodingTool[] {
		return this.getTools().filter((tool) => this.isToolAvailable(tool));
	}

	getPreferredAvailableTool(): CodingTool | undefined {
		const availableTools = this.getAvailableTools();
		if (availableTools.length === 0) {
			return undefined;
		}

		const defaultToolId = this.getDefaultToolId();
		return (
			availableTools.find((tool) => tool.id === defaultToolId) ??
			availableTools[0]
		);
	}

	resolveAgentTool(toolId?: string): CodingTool {
		const id = toolId ?? "claude";
		return this.getTool(id) ?? BUILTIN_CODING_TOOLS[0];
	}

	isToolAvailable(tool: CodingTool): boolean {
		return commandExists(tool.command);
	}

	buildLaunchCommand(tool: CodingTool, sessionId?: string | null): string {
		const parts = [tool.command];
		if (tool.args && tool.args.length > 0) {
			parts.push(...tool.args);
		}
		if (tool.id === "claude" && sessionId) {
			parts.push("--session-id", sessionId);
		}
		// Codex auto-generates session IDs — no flag needed on launch
		return parts.join(" ");
	}

	buildResumeLaunchCommand(
		tool: CodingTool,
		sessionId?: string | null,
	): string {
		if (tool.id === "claude" && sessionId) {
			return `claude --resume ${sessionId}`;
		}
		if (tool.id === "codex" && sessionId) {
			return `codex resume ${sessionId}`;
		}
		// No sessionId — launch fresh so each agent gets its own session
		return this.buildLaunchCommand(tool);
	}
}
