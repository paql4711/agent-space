import { execSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as path from "node:path";
import { TERMINAL_COLOR_KEYS } from "../constants/colors";
import type { Store } from "../storage/store";
import type { Feature, FeatureStatus, GitAwareStatus, IsolationMode } from "../types";
import { isWorktreePathSafe } from "../utils/worktreeGuard";
import { computeGitStatus, computeGitStatusAsync } from "./featureGitStatus";
import { normalizeFeatureName } from "./featureName";

export class FeatureManager {
	private features: Feature[];
	private cachedBaseBranch: string | undefined;

	constructor(
		private readonly store: Store,
		private readonly repoRoot: string,
		private readonly worktreeBase: string,
	) {
		this.features = store.loadFeatures();
	}

	/**
	 * Synthesize a virtual Feature for the repo root (base branch).
	 * Not persisted to storage.
	 */
	getBaseFeature(projectId: string): Feature {
		const branch = this.getBaseBranch();
		return {
			id: `base:${projectId}`,
			name: branch,
			branch,
			worktreePath: this.repoRoot,
			status: "active",
			color: "terminal.ansiBlue",
			isolation: "shared",
			createdAt: new Date(0).toISOString(),
		};
	}

	private getBaseBranch(): string {
		if (this.cachedBaseBranch) return this.cachedBaseBranch;
		try {
			this.cachedBaseBranch = execSync(
				"git rev-parse --abbrev-ref HEAD",
				{
					cwd: this.repoRoot,
					encoding: "utf-8",
					stdio: ["ignore", "pipe", "pipe"],
				},
			).trim();
		} catch {
			this.cachedBaseBranch = "main";
		}
		return this.cachedBaseBranch;
	}

	reload(): void {
		this.features = this.store.loadFeatures();
	}

	getFeatures(): Feature[] {
		return [...this.features];
	}

	getFeature(id: string): Feature | undefined {
		return this.features.find((f) => f.id === id);
	}

	createFeature(name: string, isolation: IsolationMode): Feature {
		const displayName = name.trim();
		const normalizedName = normalizeFeatureName(displayName);
		if (!normalizedName) {
			throw new Error("Feature name is required");
		}

		const existing = this.features.find(
			(f) =>
				f.name === displayName ||
				normalizeFeatureName(f.name) === normalizedName,
		);
		if (existing) {
			throw new Error(
				`Feature "${displayName}" conflicts with existing feature "${existing.name}"`,
			);
		}

		const id = crypto.randomUUID();
		const branch = `feat/${normalizedName}`;
		const worktreePath = path.join(this.worktreeBase, normalizedName);

		execSync(`git worktree add "${worktreePath}" -b "${branch}"`, {
			cwd: this.repoRoot,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});

		const feature: Feature = {
			id,
			name: displayName,
			branch,
			worktreePath,
			status: "active",
			color: this.pickColor(displayName),
			isolation,
			createdAt: new Date().toISOString(),
		};

		this.features.push(feature);
		this.store.saveFeatures(this.features);
		return feature;
	}

	deleteFeature(id: string): void {
		const feature = this.features.find((f) => f.id === id);
		if (!feature) return;

		if (!isWorktreePathSafe(feature.worktreePath, this.worktreeBase)) {
			console.error(
				`[FeatureManager] Refusing to remove worktree outside base: "${feature.worktreePath}"`,
			);
		} else {
			try {
				execSync(`git worktree remove "${feature.worktreePath}" --force`, {
					cwd: this.repoRoot,
					encoding: "utf-8",
					stdio: ["ignore", "pipe", "pipe"],
				});
			} catch {
				// Worktree may already be gone
			}
		}

		this.store.deleteFeatureData(id);
		this.features = this.features.filter((f) => f.id !== id);
		this.store.saveFeatures(this.features);
	}

	updateFeatureStatus(id: string, status: FeatureStatus): void {
		const feature = this.features.find((f) => f.id === id);
		if (!feature) return;
		feature.status = status;
		this.store.saveFeatures(this.features);
	}

	updateFeatureIsolation(id: string, isolation: IsolationMode): void {
		const feature = this.features.find((f) => f.id === id);
		if (!feature) return;
		feature.isolation = isolation;
		this.store.saveFeatures(this.features);
	}

	getFeatureGitStatus(feature: Feature): GitAwareStatus {
		return computeGitStatus({
			featureBranch: feature.branch,
			baseBranch: this.getBaseBranch(),
			worktreePath: feature.worktreePath,
			repoRoot: this.repoRoot,
		});
	}

	async getFeatureGitStatusAsync(feature: Feature): Promise<GitAwareStatus> {
		return computeGitStatusAsync({
			featureBranch: feature.branch,
			baseBranch: this.getBaseBranch(),
			worktreePath: feature.worktreePath,
			repoRoot: this.repoRoot,
		});
	}

	private pickColor(name: string): string {
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = (hash * 31 + name.charCodeAt(i)) | 0;
		}
		return TERMINAL_COLOR_KEYS[Math.abs(hash) % TERMINAL_COLOR_KEYS.length];
	}
}
