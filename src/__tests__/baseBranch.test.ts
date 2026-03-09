import { beforeEach, describe, expect, it, vi } from "vitest";

const execMock = vi.hoisted(() => vi.fn());

vi.mock("../utils/platform", () => ({
	exec: execMock,
}));

import { detectBaseBranch } from "../git/baseBranch";

describe("detectBaseBranch", () => {
	beforeEach(() => {
		execMock.mockReset();
	});

	it("prefers origin HEAD when available", () => {
		execMock.mockImplementation((cmd: string) => {
			if (cmd.includes("git symbolic-ref")) {
				return "refs/remotes/origin/main\n";
			}
			throw new Error("unexpected");
		});

		expect(detectBaseBranch("/repo")).toBe("main");
	});

	it("falls back to common branch names", () => {
		execMock.mockImplementation((cmd: string) => {
			if (cmd.includes("git symbolic-ref")) {
				throw new Error("missing");
			}
			if (cmd.includes("refs/heads/main")) {
				throw new Error("missing");
			}
			if (cmd.includes("refs/remotes/origin/main")) {
				throw new Error("missing");
			}
			if (cmd.includes("refs/heads/master")) {
				return "";
			}
			return "";
		});

		expect(detectBaseBranch("/repo")).toBe("master");
	});

	it("falls back to the current branch", () => {
		execMock.mockImplementation((cmd: string) => {
			if (cmd.includes("git branch --show-current")) {
				return "release/1.2\n";
			}
			throw new Error("missing");
		});

		expect(detectBaseBranch("/repo")).toBe("release/1.2");
	});
});
