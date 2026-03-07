import { describe, expect, it, vi } from "vitest";
import {
	createPendingGitViewHandoff,
	getGitViewHandoffAction,
	openFeatureGitView,
	PENDING_GIT_VIEW_HANDOFF_PREF,
} from "../git/gitViewHandoff";

describe("gitViewHandoff", () => {
	describe("openFeatureGitView", () => {
		it("falls back to the active feature id", async () => {
			const setPreference = vi.fn();
			const openFolder = vi.fn();

			const opened = await openFeatureGitView(
				undefined,
				"feature-1",
				(featureId) =>
					featureId === "feature-1"
						? { worktreePath: "/repo/.worktrees/feature-1" }
						: undefined,
				{ setPreference },
				openFolder,
				123,
			);

			expect(opened).toBe(true);
			expect(setPreference).toHaveBeenCalledWith(
				PENDING_GIT_VIEW_HANDOFF_PREF,
				{
					featureId: "feature-1",
					worktreePath: "/repo/.worktrees/feature-1",
					requestedAt: 123,
				},
			);
			expect(openFolder).toHaveBeenCalledWith("/repo/.worktrees/feature-1");
		});

		it("does nothing when the feature cannot be resolved", async () => {
			const setPreference = vi.fn();
			const openFolder = vi.fn();

			const opened = await openFeatureGitView(
				"missing",
				null,
				() => undefined,
				{ setPreference },
				openFolder,
			);

			expect(opened).toBe(false);
			expect(setPreference).not.toHaveBeenCalled();
			expect(openFolder).not.toHaveBeenCalled();
		});
	});

	describe("getGitViewHandoffAction", () => {
		it("opens SCM when the current workspace matches the pending worktree", () => {
			const handoff = createPendingGitViewHandoff(
				"feature-1",
				"/repo/.worktrees/feature-1",
				1_000,
			);

			expect(
				getGitViewHandoffAction(
					handoff,
					[
						{
							uri: { fsPath: "/repo/.worktrees/feature-1" },
						},
					],
					1_500,
				),
			).toBe("openScm");
		});

		it("keeps the handoff pending while another workspace is active", () => {
			const handoff = createPendingGitViewHandoff(
				"feature-1",
				"/repo/.worktrees/feature-1",
				1_000,
			);

			expect(
				getGitViewHandoffAction(
					handoff,
					[
						{
							uri: { fsPath: "/repo" },
						},
					],
					1_500,
				),
			).toBe("noop");
		});

		it("clears malformed or stale handoff data", () => {
			expect(getGitViewHandoffAction({}, [])).toBe("clear");
			expect(
				getGitViewHandoffAction(
					createPendingGitViewHandoff(
						"feature-1",
						"/repo/.worktrees/feature-1",
						1_000,
					),
					[],
					1_000 + 5 * 60 * 1000 + 1,
				),
			).toBe("clear");
		});
	});
});
