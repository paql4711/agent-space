import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureManager } from "../features/featureManager";
import { Store } from "../storage/store";

// Mock child_process.execSync for git operations
vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
}));

import { execSync } from "node:child_process";

const mockExecSync = vi.mocked(execSync);

describe("FeatureManager", () => {
	let tmpDir: string;
	let store: Store;
	let manager: FeatureManager;
	const repoRoot = "/fake/repo";

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-test-"));
		store = new Store(tmpDir);
		manager = new FeatureManager(
			store,
			repoRoot,
			path.join(repoRoot, ".worktrees"),
		);
		mockExecSync.mockReset();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	describe("createFeature", () => {
		it("creates a feature with worktree", () => {
			mockExecSync.mockReturnValue(Buffer.from(""));
			const feature = manager.createFeature("auth-system", "shared");

			expect(feature.name).toBe("auth-system");
			expect(feature.branch).toBe("feat/auth-system");
			expect(feature.worktreePath).toContain("auth-system");
			expect(feature.status).toBe("active");
			expect(feature.isolation).toBe("shared");
			expect(mockExecSync).toHaveBeenCalledWith(
				expect.stringContaining("git worktree add"),
				expect.any(Object),
			);
		});

		it("allows spaces in the display name and normalizes git names", () => {
			mockExecSync.mockReturnValue(Buffer.from(""));
			const feature = manager.createFeature("Auth system", "shared");

			expect(feature.name).toBe("Auth system");
			expect(feature.branch).toBe("feat/Auth-system");
			expect(feature.worktreePath).toContain("Auth-system");
		});

		it("persists the feature to storage", () => {
			mockExecSync.mockReturnValue(Buffer.from(""));
			manager.createFeature("auth-system", "shared");

			const features = store.loadFeatures();
			expect(features).toHaveLength(1);
			expect(features[0].name).toBe("auth-system");
		});

		it("throws on duplicate name", () => {
			mockExecSync.mockReturnValue(Buffer.from(""));
			manager.createFeature("auth-system", "shared");

			expect(() => manager.createFeature("auth-system", "shared")).toThrow(
				"conflicts with existing feature",
			);
		});

		it("throws when another feature would normalize to the same git name", () => {
			mockExecSync.mockReturnValue(Buffer.from(""));
			manager.createFeature("auth system", "shared");

			expect(() => manager.createFeature("auth-system", "shared")).toThrow(
				"conflicts with existing feature",
			);
		});
	});

	describe("deleteFeature", () => {
		it("removes feature and worktree", () => {
			mockExecSync.mockReturnValue(Buffer.from(""));
			const feature = manager.createFeature("to-delete", "shared");

			manager.deleteFeature(feature.id);

			expect(manager.getFeatures()).toHaveLength(0);
			expect(mockExecSync).toHaveBeenCalledWith(
				expect.stringContaining("git worktree remove"),
				expect.any(Object),
			);
		});
	});

	describe("getFeatures / getFeature", () => {
		it("returns all features", () => {
			mockExecSync.mockReturnValue(Buffer.from(""));
			manager.createFeature("a", "shared");
			manager.createFeature("b", "per-agent");

			expect(manager.getFeatures()).toHaveLength(2);
		});

		it("returns single feature by id", () => {
			mockExecSync.mockReturnValue(Buffer.from(""));
			const f = manager.createFeature("a", "shared");

			expect(manager.getFeature(f.id)?.name).toBe("a");
			expect(manager.getFeature("nonexistent")).toBeUndefined();
		});
	});

	describe("updateFeatureStatus", () => {
		it("updates status and persists", () => {
			mockExecSync.mockReturnValue(Buffer.from(""));
			const f = manager.createFeature("a", "shared");

			manager.updateFeatureStatus(f.id, "done");

			expect(manager.getFeature(f.id)?.status).toBe("done");
			expect(store.loadFeatures()[0].status).toBe("done");
		});
	});

	describe("updateFeatureIsolation", () => {
		it("updates isolation and persists", () => {
			mockExecSync.mockReturnValue(Buffer.from(""));
			const f = manager.createFeature("a", "shared");

			manager.updateFeatureIsolation(f.id, "per-agent");

			expect(manager.getFeature(f.id)?.isolation).toBe("per-agent");
			expect(store.loadFeatures()[0].isolation).toBe("per-agent");
		});

		it("toggles back to shared", () => {
			mockExecSync.mockReturnValue(Buffer.from(""));
			const f = manager.createFeature("a", "per-agent");

			manager.updateFeatureIsolation(f.id, "shared");

			expect(manager.getFeature(f.id)?.isolation).toBe("shared");
		});

		it("does nothing for unknown feature", () => {
			mockExecSync.mockReturnValue(Buffer.from(""));
			manager.createFeature("a", "shared");

			manager.updateFeatureIsolation("nonexistent", "per-agent");

			expect(manager.getFeatures()[0].isolation).toBe("shared");
		});
	});
});
