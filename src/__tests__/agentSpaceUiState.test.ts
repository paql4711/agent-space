import { describe, expect, it } from "vitest";
import {
	isAgentSpaceUiActive,
	resolveAgentSpaceIsolationAction,
} from "../workspace/agentSpaceUiState";

describe("agentSpaceUiState", () => {
	it("treats the sidebar as active agent space UI", () => {
		expect(
			isAgentSpaceUiActive({
				sidebarVisible: true,
				homeActive: false,
			}),
		).toBe(true);
	});

	it("treats the home panel as active agent space UI only when focused", () => {
		expect(
			isAgentSpaceUiActive({
				sidebarVisible: false,
				homeActive: true,
			}),
		).toBe(true);
		expect(
			isAgentSpaceUiActive({
				sidebarVisible: false,
				homeActive: false,
			}),
		).toBe(false);
	});

	it("enters isolation when the sidebar becomes visible", () => {
		expect(
			resolveAgentSpaceIsolationAction(
				{
					sidebarVisible: false,
					homeActive: false,
				},
				{
					sidebarVisible: true,
					homeActive: false,
				},
			),
		).toBe("enter");
	});

	it("leaves isolation when both agent space surfaces are inactive", () => {
		expect(
			resolveAgentSpaceIsolationAction(
				{
					sidebarVisible: true,
					homeActive: false,
				},
				{
					sidebarVisible: false,
					homeActive: false,
				},
			),
		).toBe("leave");
	});

	it("keeps isolation active when the home panel blurs but the sidebar stays visible", () => {
		expect(
			resolveAgentSpaceIsolationAction(
				{
					sidebarVisible: true,
					homeActive: true,
				},
				{
					sidebarVisible: true,
					homeActive: false,
				},
			),
		).toBe("noop");
	});

	it("does not re-enter isolation for redundant active-state updates", () => {
		expect(
			resolveAgentSpaceIsolationAction(
				{
					sidebarVisible: true,
					homeActive: false,
				},
				{
					sidebarVisible: true,
					homeActive: true,
				},
			),
		).toBe("noop");
	});
});
