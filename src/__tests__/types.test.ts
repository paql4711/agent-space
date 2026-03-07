import { describe, expect, it } from "vitest";
import type {
	Agent,
	Feature,
	FeatureServices,
	Service,
	ServiceStatus,
} from "../types";

describe("types", () => {
	it("Feature type has required fields", () => {
		const feature: Feature = {
			id: "test-uuid",
			name: "auth-system",
			branch: "feat/auth-system",
			worktreePath: ".worktrees/auth-system",
			status: "active",
			color: "terminal.ansiBlue",
			isolation: "shared",
			createdAt: new Date().toISOString(),
		};
		expect(feature.id).toBe("test-uuid");
		expect(feature.status).toBe("active");
	});

	it("Agent type has required fields", () => {
		const agent: Agent = {
			id: "agent-uuid",
			featureId: "test-uuid",
			name: "Setup JWT middleware",
			sessionId: null,
			status: "stopped",
			createdAt: new Date().toISOString(),
		};
		expect(agent.featureId).toBe("test-uuid");
		expect(agent.sessionId).toBeNull();
	});

	it("Agent supports optional tmux and worktree fields", () => {
		const agent: Agent = {
			id: "agent-uuid",
			featureId: "test-uuid",
			name: "Write tests",
			sessionId: "sess-123",
			worktreePath: ".worktrees/auth-system/agent-1",
			tmuxSession: "agent-space-test-uuid-agent-uuid",
			status: "running",
			createdAt: new Date().toISOString(),
		};
		expect(agent.tmuxSession).toBe("agent-space-test-uuid-agent-uuid");
		expect(agent.worktreePath).toBeDefined();
	});
});

describe("Service types", () => {
	it("allows valid ServiceStatus values", () => {
		const statuses: ServiceStatus[] = ["running", "stopped", "errored"];
		expect(statuses).toHaveLength(3);
	});

	it("satisfies Service interface shape", () => {
		const service: Service = {
			id: "s1",
			featureId: "f1",
			name: "dev",
			command: "npm run dev",
			launchCommand: "npm run dev",
			tmuxSession: "agent-space-svc-f1-s1",
			status: "running",
			createdAt: "2026-03-05T00:00:00Z",
		};
		expect(service.id).toBe("s1");
	});

	it("satisfies FeatureServices interface shape", () => {
		const data: FeatureServices = { services: [] };
		expect(data.services).toEqual([]);
	});
});
