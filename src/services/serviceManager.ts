import * as crypto from "node:crypto";
import type { TmuxIntegration } from "../agents/tmux";
import type { Store } from "../storage/store";
import type { Service } from "../types";

export class ServiceManager {
	private servicesByFeature = new Map<string, Service[]>();

	constructor(
		private readonly store: Store,
		private readonly tmux: TmuxIntegration,
	) {}

	invalidateFeature(featureId: string): void {
		this.servicesByFeature.delete(featureId);
	}

	getServices(featureId: string): Service[] {
		return [...this.loadServices(featureId)];
	}

	createService(featureId: string, name: string, command: string): Service {
		const services = this.loadServices(featureId);
		const id = crypto.randomUUID();
		const tmuxSession = this.tmux.serviceSessionName(featureId, id);

		const service: Service = {
			id,
			featureId,
			name,
			command,
			tmuxSession,
			status: "running",
			createdAt: new Date().toISOString(),
		};

		services.push(service);
		this.saveServices(featureId, services);
		return service;
	}

	stopService(serviceId: string, featureId: string): void {
		const services = this.loadServices(featureId);
		const service = services.find((s) => s.id === serviceId);
		if (!service) return;
		this.tmux.killSession(service.tmuxSession);
		service.status = "stopped";
		this.saveServices(featureId, services);
	}

	restartService(serviceId: string, featureId: string): void {
		const services = this.loadServices(featureId);
		const service = services.find((s) => s.id === serviceId);
		if (!service) return;
		this.tmux.killSession(service.tmuxSession);
		service.status = "running";
		this.saveServices(featureId, services);
	}

	deleteService(serviceId: string, featureId: string): void {
		const services = this.loadServices(featureId);
		const service = services.find((s) => s.id === serviceId);
		if (service) {
			this.tmux.killSession(service.tmuxSession);
		}
		this.saveServices(
			featureId,
			services.filter((s) => s.id !== serviceId),
		);
	}

	deleteAllServices(featureId: string): void {
		for (const service of this.loadServices(featureId)) {
			this.tmux.killSession(service.tmuxSession);
		}
		this.saveServices(featureId, []);
	}

	refreshStatuses(featureId: string): void {
		const services = this.loadServices(featureId);
		let changed = false;
		for (const service of services) {
			if (service.status === "stopped" || service.status === "errored")
				continue;

			const alive = this.tmux.isSessionAlive(service.tmuxSession);
			if (!alive) {
				service.status = "stopped";
				changed = true;
				continue;
			}

			// Session alive — check if the pane process has exited
			// (remain-on-exit keeps the session open after command exits)
			const pane = this.tmux.getPaneStatus(service.tmuxSession);
			if (pane?.dead) {
				service.status = pane.exitCode === 0 ? "stopped" : "errored";
				changed = true;
			}
		}
		if (changed) {
			this.saveServices(featureId, services);
		}
	}

	private loadServices(featureId: string): Service[] {
		if (!this.servicesByFeature.has(featureId)) {
			const services = this.normalizeServiceSessions(
				featureId,
				this.store.loadServices(featureId),
			);
			this.servicesByFeature.set(featureId, services);
		}
		// biome-ignore lint/style/noNonNullAssertion: guaranteed by has() check above
		return this.servicesByFeature.get(featureId)!;
	}

	private saveServices(featureId: string, services: Service[]): void {
		this.servicesByFeature.set(featureId, services);
		this.store.saveServices(featureId, services);
	}

	private normalizeServiceSessions(
		featureId: string,
		services: Service[],
	): Service[] {
		let changed = false;

		for (const service of services) {
			const preferredSession = this.tmux.serviceSessionName(featureId, service.id);
			if (service.tmuxSession === preferredSession) {
				continue;
			}

			this.tmux.adoptSession(preferredSession, service.tmuxSession);
			service.tmuxSession = preferredSession;
			changed = true;
		}

		if (changed) {
			this.store.saveServices(featureId, services);
		}

		return services;
	}
}
