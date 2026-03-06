import * as path from "node:path";

/**
 * Returns true if `worktreePath` is a direct child within `worktreeBase`.
 * Prevents deletion of paths outside the configured worktree directory.
 */
export function isWorktreePathSafe(
	worktreePath: string,
	worktreeBase: string,
): boolean {
	const normalized = path.resolve(worktreePath);
	const normalizedBase = path.resolve(worktreeBase);
	return normalized.startsWith(normalizedBase + path.sep);
}
