import * as path from "node:path";

export const PENDING_GIT_VIEW_HANDOFF_PREF = "pendingGitViewHandoff";
const MAX_GIT_VIEW_HANDOFF_AGE_MS = 5 * 60 * 1000;

export interface PendingGitViewHandoff {
	featureId: string;
	worktreePath: string;
	requestedAt: number;
}

export interface GitViewPreferenceStore {
	setPreference(key: string, value: unknown): void;
}

export interface GitViewWorkspaceFolder {
	readonly uri: {
		readonly fsPath: string;
	};
}

export type GitViewHandoffAction = "openScm" | "clear" | "noop";
export type FindGitViewTarget = (
	featureId: string,
) => { worktreePath: string } | undefined;
export type OpenGitViewFolder = (
	worktreePath: string,
) => Promise<unknown> | unknown;

export function createPendingGitViewHandoff(
	featureId: string,
	worktreePath: string,
	now: number = Date.now(),
): PendingGitViewHandoff {
	return {
		featureId,
		worktreePath: normalizePath(worktreePath),
		requestedAt: now,
	};
}

export async function openFeatureGitView(
	featureIdArg: string | undefined,
	activeFeatureId: string | null,
	findFeature: FindGitViewTarget,
	preferences: GitViewPreferenceStore,
	openFolder: OpenGitViewFolder,
	now: number = Date.now(),
): Promise<boolean> {
	const featureId = featureIdArg ?? activeFeatureId;
	if (!featureId) return false;

	const feature = findFeature(featureId);
	if (!feature) return false;

	preferences.setPreference(
		PENDING_GIT_VIEW_HANDOFF_PREF,
		createPendingGitViewHandoff(featureId, feature.worktreePath, now),
	);

	await openFolder(feature.worktreePath);
	return true;
}

export function getGitViewHandoffAction(
	value: unknown,
	workspaceFolders: readonly GitViewWorkspaceFolder[] | undefined,
	now: number = Date.now(),
): GitViewHandoffAction {
	const handoff = parsePendingGitViewHandoff(value);
	if (!handoff) return "clear";

	if (now - handoff.requestedAt > MAX_GIT_VIEW_HANDOFF_AGE_MS) {
		return "clear";
	}

	if (!workspaceFolders || workspaceFolders.length === 0) {
		return "noop";
	}

	return workspaceFolders.some(
		(folder) => normalizePath(folder.uri.fsPath) === handoff.worktreePath,
	)
		? "openScm"
		: "noop";
}

function parsePendingGitViewHandoff(
	value: unknown,
): PendingGitViewHandoff | undefined {
	if (!value || typeof value !== "object") return undefined;

	const candidate = value as Partial<PendingGitViewHandoff>;
	if (
		typeof candidate.featureId !== "string" ||
		typeof candidate.worktreePath !== "string" ||
		typeof candidate.requestedAt !== "number" ||
		!Number.isFinite(candidate.requestedAt)
	) {
		return undefined;
	}

	return {
		featureId: candidate.featureId,
		worktreePath: normalizePath(candidate.worktreePath),
		requestedAt: candidate.requestedAt,
	};
}

function normalizePath(value: string): string {
	return path.resolve(value);
}
