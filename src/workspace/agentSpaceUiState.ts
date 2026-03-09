export interface AgentSpaceUiState {
	sidebarVisible: boolean;
	homeActive: boolean;
}

export type AgentSpaceIsolationAction = "enter" | "leave" | "noop";

export function isAgentSpaceUiActive(state: AgentSpaceUiState): boolean {
	return state.sidebarVisible || state.homeActive;
}

export function resolveAgentSpaceIsolationAction(
	previousState: AgentSpaceUiState,
	nextState: AgentSpaceUiState,
): AgentSpaceIsolationAction {
	const wasActive = isAgentSpaceUiActive(previousState);
	const isActive = isAgentSpaceUiActive(nextState);

	if (!wasActive && isActive) {
		return "enter";
	}

	if (wasActive && !isActive) {
		return "leave";
	}

	return "noop";
}
