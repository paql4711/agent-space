// @ts-check
/// <reference lib="dom" />

const vscode = acquireVsCodeApi();

function send(command, data) {
	vscode.postMessage({ command, ...data });
}

// -- Welcome View Actions ------------------------------------
// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function resumeFeature(featureId) {
	send("showFeature", { featureId });
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function newFeature(projectId) {
	send("newFeature", { projectId });
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function addProject() {
	send("addProject");
}

// -- Feature Home Actions ------------------------------------
// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function goHome() {
	send("showWelcome");
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function focusAgent(featureId, agentId) {
	send("focusAgent", { featureId, agentId });
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function focusService(featureId, serviceId) {
	send("focusService", { featureId, serviceId });
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function killAgentSession(featureId, agentId) {
	send("killAgentSession", { featureId, agentId });
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function killServiceSession(featureId, serviceId) {
	send("killServiceSession", { featureId, serviceId });
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function killFeatureSessions(featureId) {
	send("killFeatureSessions", { featureId });
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function killProjectSessions(projectId) {
	send("killProjectSessions", { projectId });
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function markAgentDone(featureId, agentId, agentName) {
	showConfirmation(
		`Mark "${agentName}" as done?`,
		"This will stop the agent session.",
		() => send("closeAgent", { featureId, agentId }),
	);
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function reopenAgent(featureId, agentId) {
	send("reopenAgent", { featureId, agentId });
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function deleteFeature(featureId) {
	send("deleteFeature", { featureId });
}

// -- Inline Confirmation Banner ------------------------------
function showConfirmation(title, message, onConfirm, danger = false) {
	dismissConfirmation();

	const banner = document.createElement("div");
	banner.className = `confirmation-banner ${danger ? "danger" : ""}`;
	banner.id = "active-confirmation";
	banner.innerHTML = `
		<div class="confirmation-content">
			<strong>${title}</strong>
			<span>${message}</span>
		</div>
		<div class="confirmation-actions">
			<button class="confirm-btn ${danger ? "danger" : ""}" id="confirm-yes">
				${danger ? "Delete" : "Confirm"}
			</button>
			<button class="confirm-btn cancel" id="confirm-cancel">Cancel</button>
		</div>
	`;

	document.body.prepend(banner);

	document.getElementById("confirm-yes").addEventListener("click", () => {
		onConfirm();
		dismissConfirmation();
	});
	document.getElementById("confirm-cancel").addEventListener("click", () => {
		dismissConfirmation();
	});
}

function dismissConfirmation() {
	const existing = document.getElementById("active-confirmation");
	if (existing) existing.remove();
}

// -- Quick Actions -------------------------------------------
// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function quickAction(action, featureId) {
	switch (action) {
		case "addAgent":
			send("addAgent", { featureId });
			break;
		case "addService":
			send("addService", { featureId });
			break;
		case "createPR":
			send("createPR", { featureId });
			break;
		case "openGitView":
			send("openGitView", { featureId });
			break;
		case "openFolder":
			send("openFolder", { featureId });
			break;
		case "syncNames":
			send("syncNames");
			break;
		case "refresh":
			send("refresh");
			break;
	}
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function toggleStoppedServicesHome(header) {
	header.classList.toggle("collapsed");
	const list = header.nextElementSibling;
	if (list) list.classList.toggle("collapsed");
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function serviceAction(action, featureId, serviceId) {
	switch (action) {
		case "stop":
			send("stopService", { featureId, serviceId });
			break;
		case "restart":
			send("restartService", { featureId, serviceId });
			break;
	}
}

// -- Activity Expand/Collapse --------------------------------
const expandedAgents = new Set();
const expandedServices = new Set();
let autoRefreshInterval = null;

function togglePanel(prefix, id, expandedSet, requestCmd, requestPayload) {
	const panel = document.getElementById(`${prefix}-activity-${id}`);
	const chevron = document.getElementById(`${prefix}-chevron-${id}`);
	const header = document.getElementById(`${prefix}-header-${id}`);
	if (!panel || !chevron || !header) return;

	if (expandedSet.has(id)) {
		expandedSet.delete(id);
		panel.classList.remove("expanded");
		chevron.classList.remove("expanded");
		header.classList.remove("expanded");
	} else {
		expandedSet.add(id);
		panel.classList.add("expanded");
		chevron.classList.add("expanded");
		header.classList.add("expanded");
		send(requestCmd, requestPayload);
	}
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function toggleAgent(agentId) {
	togglePanel("agent", agentId, expandedAgents, "requestActivity", { agentId });
}

// biome-ignore lint/correctness/noUnusedVariables: called from HTML onclick
function toggleService(serviceId) {
	togglePanel(
		"service",
		serviceId,
		expandedServices,
		"requestServiceActivity",
		{ serviceId },
	);
}

// -- Message Handling from Extension -------------------------
function updateActivityContent(preId, emptyId, content) {
	const pre = document.getElementById(preId);
	const empty = document.getElementById(emptyId);
	if (pre) {
		pre.textContent = content || "";
		pre.style.display = content ? "block" : "none";
	}
	if (empty) {
		empty.style.display = content ? "none" : "block";
	}
	const container = pre?.closest(".activity-content");
	if (container) {
		const isNearBottom =
			container.scrollHeight - container.scrollTop - container.clientHeight <
			60;
		if (isNearBottom) {
			container.scrollTop = container.scrollHeight;
		}
	}
}

window.addEventListener("message", (event) => {
	const message = event.data;
	switch (message.type) {
		case "activityUpdate":
			updateActivityContent(
				`activity-pre-${message.agentId}`,
				`activity-empty-${message.agentId}`,
				message.content,
			);
			break;
		case "serviceActivityUpdate":
			updateActivityContent(
				`service-activity-pre-${message.serviceId}`,
				`service-activity-empty-${message.serviceId}`,
				message.content,
			);
			break;
		case "gitStatsUpdate": {
			const statsEl = document.getElementById("git-stats-content");
			if (statsEl) statsEl.innerHTML = message.html;
			break;
		}
	}
});

// -- Auto-refresh for expanded agents ------------------------
function startAutoRefresh() {
	if (autoRefreshInterval) return;
	autoRefreshInterval = setInterval(() => {
		if (expandedAgents.size > 0) {
			send("refreshActivity", { agentIds: Array.from(expandedAgents) });
		}
		if (expandedServices.size > 0) {
			send("refreshServiceActivity", {
				serviceIds: Array.from(expandedServices),
			});
		}
	}, 5000);
}

startAutoRefresh();
window.addEventListener("beforeunload", () => {
	if (autoRefreshInterval) clearInterval(autoRefreshInterval);
});
