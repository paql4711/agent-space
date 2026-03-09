import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "../utils/platform";

function runGit(repoRoot: string, cmd: string): string {
	return exec(cmd, { cwd: repoRoot }).trim();
}

function branchExists(repoRoot: string, ref: string): boolean {
	try {
		runGit(repoRoot, `git show-ref --verify --quiet "${ref}"`);
		return true;
	} catch {
		return false;
	}
}

export function resolveBaseRef(repoRoot: string, baseBranch: string): string {
	return branchExists(repoRoot, `refs/remotes/origin/${baseBranch}`)
		? `origin/${baseBranch}`
		: baseBranch;
}

export function listLocalBranches(repoRoot: string): string[] {
	const output = runGit(
		repoRoot,
		"git for-each-ref refs/heads --format='%(refname:short)'",
	);
	return output
		.split(/\r?\n/u)
		.map((branch) => branch.trim())
		.filter(Boolean);
}

export function syncBaseBranch(repoRoot: string, baseBranch: string): void {
	runGit(repoRoot, "git fetch --all --prune");
	try {
		runGit(repoRoot, `git switch "${baseBranch}"`);
	} catch {
		runGit(
			repoRoot,
			`git switch -c "${baseBranch}" --track "origin/${baseBranch}"`,
		);
	}
	runGit(repoRoot, `git pull --ff-only origin "${baseBranch}"`);
}

export function rebaseFeatureOntoBase(
	repoRoot: string,
	featureWorktreePath: string,
	baseBranch: string,
): void {
	runGit(repoRoot, "git fetch --all --prune");
	exec(`git rebase "${resolveBaseRef(repoRoot, baseBranch)}"`, {
		cwd: featureWorktreePath,
	});
}

export function mergeFeatureIntoBranch(
	repoRoot: string,
	worktreeBase: string,
	featureBranch: string,
	targetBranch: string,
): { worktreePath: string; keptForInspection: boolean } {
	fs.mkdirSync(worktreeBase, { recursive: true });
	const safeBranch = targetBranch.replace(/[^a-zA-Z0-9._-]+/g, "-");
	const worktreePath = path.join(
		worktreeBase,
		`.merge-${safeBranch}-${Date.now()}`,
	);

	runGit(repoRoot, `git worktree add "${worktreePath}" "${targetBranch}"`);

	try {
		exec(`git merge --no-ff "${featureBranch}"`, { cwd: worktreePath });
		runGit(repoRoot, `git worktree remove "${worktreePath}" --force`);
		return { worktreePath, keptForInspection: false };
	} catch (error) {
		return { worktreePath, keptForInspection: true };
	}
}
