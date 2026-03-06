import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentManager } from "../agents/agentManager";
import { Store } from "../storage/store";
import type { Feature } from "../types";

vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
}));

import { execSync } from "node:child_process";

const mockExecSync = vi.mocked(execSync);

describe("AgentManager", () => {
	let tmpDir: string;
	let store: Store;
	let manager: AgentManager;

	const feature: Feature = {
		id: "f1",
		name: "auth",
		branch: "feat/auth",
		worktreePath: "/tmp/worktree/auth",
		status: "active",
		color: "terminal.ansiBlue",
		isolation: "shared",
		createdAt: "2026-03-04T00:00:00Z",
	};

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "am-test-"));
		store = new Store(tmpDir);
		manager = new AgentManager(store, tmpDir, path.join(tmpDir, ".worktrees"));
		mockExecSync.mockReset();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	describe("createAgent", () => {
		it("creates an agent for a feature", () => {
			const agent = manager.createAgent(feature);
			expect(agent.featureId).toBe("f1");
			expect(agent.name).toBe("Agent 1");
			expect(agent.status).toBe("stopped");
		});

		it("persists agent to storage", () => {
			manager.createAgent(feature);
			const agents = store.loadAgents("f1");
			expect(agents).toHaveLength(1);
		});

		it("auto-increments default names", () => {
			manager.createAgent(feature);
			const a2 = manager.createAgent(feature);
			expect(a2.name).toBe("Agent 2");
		});

		it("persists toolId when provided", () => {
			const agent = manager.createAgent(feature, "copilot");
			expect(agent.toolId).toBe("copilot");
			const agents = store.loadAgents("f1");
			expect(agents[0].toolId).toBe("copilot");
		});

		it("leaves toolId undefined when not provided", () => {
			const agent = manager.createAgent(feature);
			expect(agent.toolId).toBeUndefined();
		});
	});

	describe("getAgents", () => {
		it("returns agents for a feature", () => {
			manager.createAgent(feature);
			manager.createAgent(feature);
			expect(manager.getAgents("f1")).toHaveLength(2);
		});

		it("returns empty for unknown feature", () => {
			expect(manager.getAgents("unknown")).toEqual([]);
		});
	});

	describe("renameAgent", () => {
		it("renames and persists", () => {
			const agent = manager.createAgent(feature);
			manager.renameAgent(agent.id, "f1", "Setup JWT middleware");
			const agents = manager.getAgents("f1");
			expect(agents[0].name).toBe("Setup JWT middleware");
		});
	});

	describe("updateAgentStatus", () => {
		it("updates status", () => {
			const agent = manager.createAgent(feature);
			manager.updateAgentStatus(agent.id, "f1", "running");
			expect(manager.getAgents("f1")[0].status).toBe("running");
		});
	});

	describe("deleteAgent", () => {
		it("removes agent", () => {
			const agent = manager.createAgent(feature);
			manager.deleteAgent(agent.id, "f1");
			expect(manager.getAgents("f1")).toHaveLength(0);
		});
	});

	describe("deleteAllAgents", () => {
		it("removes all agents for a feature", () => {
			manager.createAgent(feature);
			manager.createAgent(feature);
			manager.deleteAllAgents("f1");
			expect(manager.getAgents("f1")).toHaveLength(0);
		});
	});

	describe("closeAgent", () => {
		it("marks agent status as done", () => {
			const agent = manager.createAgent(feature);
			manager.closeAgent(agent.id, "f1");
			expect(manager.getAgents("f1")[0].status).toBe("done");
		});

		it("persists done status to storage", () => {
			const agent = manager.createAgent(feature);
			manager.closeAgent(agent.id, "f1");
			const agents = store.loadAgents("f1");
			expect(agents[0].status).toBe("done");
		});

		it("does not remove worktree on close (preserves for reopen)", () => {
			const perAgentFeature: Feature = {
				...feature,
				isolation: "per-agent",
			};
			mockExecSync.mockReturnValue(Buffer.from(""));
			const agent = manager.createAgent(perAgentFeature);
			mockExecSync.mockReset();

			manager.closeAgent(agent.id, "f1");

			expect(mockExecSync).not.toHaveBeenCalled();
			expect(manager.getAgents("f1")[0].status).toBe("done");
		});

		it("does nothing for unknown agent", () => {
			manager.createAgent(feature);
			manager.closeAgent("nonexistent", "f1");
			expect(manager.getAgents("f1")[0].status).toBe("stopped");
		});
	});

	describe("isAgentBranchMerged", () => {
		it("returns true for shared agents (no worktree)", () => {
			const agent = manager.createAgent(feature);
			expect(manager.isAgentBranchMerged(agent, feature)).toBe(true);
		});

		it("returns true when git merge-base succeeds", () => {
			const perAgentFeature: Feature = {
				...feature,
				isolation: "per-agent",
			};
			mockExecSync.mockReturnValue(Buffer.from(""));
			const agent = manager.createAgent(perAgentFeature);
			mockExecSync.mockReset();

			// merge-base succeeds (exit 0)
			mockExecSync.mockReturnValue(Buffer.from(""));
			expect(manager.isAgentBranchMerged(agent, perAgentFeature)).toBe(true);
			expect(mockExecSync).toHaveBeenCalledWith(
				expect.stringContaining("git merge-base --is-ancestor"),
				expect.any(Object),
			);
		});

		it("returns false when git merge-base throws", () => {
			const perAgentFeature: Feature = {
				...feature,
				isolation: "per-agent",
			};
			mockExecSync.mockReturnValue(Buffer.from(""));
			const agent = manager.createAgent(perAgentFeature);
			mockExecSync.mockReset();

			// merge-base fails (exit 1)
			mockExecSync.mockImplementation(() => {
				throw new Error("exit code 1");
			});
			expect(manager.isAgentBranchMerged(agent, perAgentFeature)).toBe(false);
		});
	});
});
