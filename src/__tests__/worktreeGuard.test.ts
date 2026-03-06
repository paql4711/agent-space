import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { isWorktreePathSafe } from "../utils/worktreeGuard";

describe("isWorktreePathSafe", () => {
	const base = "/home/user/project/.worktrees";

	it("returns true for a path inside the base", () => {
		expect(isWorktreePathSafe(path.join(base, "my-feature"), base)).toBe(true);
	});

	it("returns false for a path outside the base", () => {
		expect(isWorktreePathSafe("/home/user/other-project/wt", base)).toBe(false);
	});

	it("returns false for the base directory itself", () => {
		expect(isWorktreePathSafe(base, base)).toBe(false);
	});

	it("returns false for a prefix attack path", () => {
		// ".worktrees-evil" should not match ".worktrees"
		expect(
			isWorktreePathSafe("/home/user/project/.worktrees-evil/foo", base),
		).toBe(false);
	});

	it("returns false for a path with .. traversal", () => {
		expect(
			isWorktreePathSafe(
				path.join(base, "my-feature", "..", "..", "etc", "passwd"),
				base,
			),
		).toBe(false);
	});
});
