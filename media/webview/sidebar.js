const vscode = acquireVsCodeApi();

function send(command, data) {
	vscode.postMessage({ command, ...data });
}

function selectFeature(id) {
	send("selectFeature", { featureId: id });
}

function newFeature(e, projectId) {
	e.stopPropagation();
	send("newFeature", { projectId: projectId });
}

function addAgent(e, id) {
	e.stopPropagation();
	send("addAgent", { featureId: id });
}

function deleteFeature(e, id) {
	e.stopPropagation();
	send("deleteFeature", { featureId: id });
}

function addService(e, id) {
	e.stopPropagation();
	send("addService", { featureId: id });
}

function syncNames(e) {
	e.stopPropagation();
	send("syncNames");
}

function focusService(e, featureId, serviceId) {
	e.stopPropagation();
	send("focusService", { featureId: featureId, serviceId: serviceId });
}

function stopService(e, featureId, serviceId) {
	e.stopPropagation();
	send("stopService", { featureId: featureId, serviceId: serviceId });
}

function restartService(e, featureId, serviceId) {
	e.stopPropagation();
	send("restartService", { featureId: featureId, serviceId: serviceId });
}

function reopenAgent(e, featureId, agentId) {
	e.stopPropagation();
	send("reopenAgent", { featureId: featureId, agentId: agentId });
}

function focusAgent(e, featureId, agentId) {
	e.stopPropagation();
	send("focusAgent", { featureId: featureId, agentId: agentId });
}

function toggleDisabled(e, featureId) {
	e.stopPropagation();
	const body = document.getElementById("disabled-list-" + featureId);
	const toggle = document.getElementById("disabled-toggle-" + featureId);
	if (body && toggle) {
		body.classList.toggle("collapsed");
		const header = e.currentTarget;
		header.classList.toggle("collapsed");
	}
}

function toggleStoppedServices(e, featureId) {
	e.stopPropagation();
	const body = document.getElementById("stopped-svc-list-" + featureId);
	if (body) {
		body.classList.toggle("collapsed");
		const header = e.currentTarget;
		header.classList.toggle("collapsed");
	}
}

// Context Menu Logic
let _menuFeatureId = "";
let _menuAgentId = "";
const _agentMenu = document.getElementById("agentContextMenu");

document.getElementById("menuRename").addEventListener("click", (e) => {
	e.stopPropagation();
	_agentMenu.classList.remove("visible");
	send("renameAgent", { featureId: _menuFeatureId, agentId: _menuAgentId });
});

document.getElementById("menuMarkDone").addEventListener("click", (e) => {
	e.stopPropagation();
	_agentMenu.classList.remove("visible");
	send("closeAgent", { featureId: _menuFeatureId, agentId: _menuAgentId });
});

function showAgentMenu(e, featureId, agentId) {
	e.preventDefault();
	e.stopPropagation();

	// Close other menus
	closeAllMenus();

	_menuFeatureId = featureId;
	_menuAgentId = agentId;

	const rect = e.currentTarget.getBoundingClientRect();
	_agentMenu.style.left = e.clientX + "px";
	_agentMenu.style.top = e.clientY + "px";
	_agentMenu.classList.add("visible");
}

function closeAllMenus() {
	if (_agentMenu) _agentMenu.classList.remove("visible");
}

// Global click to close menus
document.addEventListener("click", () => {
	closeAllMenus();
});

// Close on scroll
window.addEventListener(
	"scroll",
	() => {
		closeAllMenus();
	},
	true,
);

function toggleIsolation(e, featureId) {
	e.stopPropagation();
	send("toggleIsolation", { featureId: featureId });
}

function removeProject(e) {
	e.stopPropagation();
	send("removeProject");
}

function toggleProject(id) {
	const body = document.getElementById("project-body-" + id);
	const header = document.querySelector(`.project-header[onclick*="${id}"]`);

	if (body && header) {
		body.classList.toggle("collapsed");
		header.classList.toggle("collapsed");
	}
}
