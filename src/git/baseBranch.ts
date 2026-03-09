import { exec } from "../utils/platform";

function readFirstLine(value: string): string | null {
	const line = value
		.split(/\r?\n/u)
		.map((entry) => entry.trim())
		.find(Boolean);
	return line ?? null;
}

function branchExists(repoRoot: string, ref: string): boolean {
	try {
		exec(`git show-ref --verify --quiet "${ref}"`, { cwd: repoRoot });
		return true;
	} catch {
		return false;
	}
}

export function detectBaseBranch(repoRoot: string): string {
	try {
		const symbolicRef = readFirstLine(
			exec("git symbolic-ref refs/remotes/origin/HEAD", { cwd: repoRoot }),
		);
		if (symbolicRef?.startsWith("refs/remotes/origin/")) {
			return symbolicRef.replace("refs/remotes/origin/", "");
		}
	} catch {
		// Fall through to local/remote branch heuristics.
	}

	for (const candidate of ["main", "master", "develop"]) {
		if (
			branchExists(repoRoot, `refs/heads/${candidate}`) ||
			branchExists(repoRoot, `refs/remotes/origin/${candidate}`)
		) {
			return candidate;
		}
	}

	try {
		const currentBranch = readFirstLine(
			exec("git branch --show-current", { cwd: repoRoot }),
		);
		if (currentBranch) {
			return currentBranch;
		}
	} catch {
		// Ignore and fall back below.
	}

	return "main";
}
