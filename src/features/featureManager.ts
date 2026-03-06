import { execSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as path from "node:path";
import { TERMINAL_COLOR_KEYS } from "../constants/colors";
import type { Store } from "../storage/store";
import type { Feature, FeatureStatus, IsolationMode } from "../types";
import { isWorktreePathSafe } from "../utils/worktreeGuard";

export class FeatureManager {
	private features: Feature[];

	constructor(
		private readonly store: Store,
		private readonly repoRoot: string,
		private readonly worktreeBase: string,
	) {
		this.features = store.loadFeatures();
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
		if (this.features.some((f) => f.name === name)) {
			throw new Error(`Feature "${name}" already exists`);
		}

		const id = crypto.randomUUID();
		const branch = `feat/${name}`;
		const worktreePath = path.join(this.worktreeBase, name);

		execSync(`git worktree add "${worktreePath}" -b "${branch}"`, {
			cwd: this.repoRoot,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});

		const feature: Feature = {
			id,
			name,
			branch,
			worktreePath,
			status: "active",
			color: this.pickColor(name),
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

	private pickColor(name: string): string {
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = (hash * 31 + name.charCodeAt(i)) | 0;
		}
		return TERMINAL_COLOR_KEYS[Math.abs(hash) % TERMINAL_COLOR_KEYS.length];
	}
}
