import * as fs from "node:fs";
import * as path from "node:path";
import type { Project } from "../types";

export class GlobalStore {
	private readonly baseDir: string;
	private readonly projectsPath: string;
	private readonly preferencesPath: string;

	constructor(baseDir: string) {
		this.baseDir = baseDir;
		this.projectsPath = path.join(baseDir, "projects.json");
		this.preferencesPath = path.join(baseDir, "preferences.json");
	}

	getProjects(): Project[] {
		try {
			const raw = fs.readFileSync(this.projectsPath, "utf-8");
			return JSON.parse(raw);
		} catch {
			return [];
		}
	}

	saveProjects(projects: Project[]): void {
		this.ensureDir(this.baseDir);
		this.atomicWriteSync(
			this.projectsPath,
			JSON.stringify(projects, null, "\t"),
		);
	}

	getPreference<T>(key: string): T | undefined;
	getPreference<T>(key: string, defaultValue: T): T;
	getPreference<T>(key: string, defaultValue?: T): T | undefined {
		const prefs = this.loadPreferences();
		const value = prefs[key];
		return value !== undefined ? (value as T) : defaultValue;
	}

	setPreference(key: string, value: unknown): void {
		const prefs = this.loadPreferences();
		prefs[key] = value;
		this.ensureDir(this.baseDir);
		this.atomicWriteSync(
			this.preferencesPath,
			JSON.stringify(prefs, null, "\t"),
		);
	}

	hasProjectsFile(): boolean {
		return fs.existsSync(this.projectsPath);
	}

	private loadPreferences(): Record<string, unknown> {
		try {
			const raw = fs.readFileSync(this.preferencesPath, "utf-8");
			return JSON.parse(raw);
		} catch {
			return {};
		}
	}

	private atomicWriteSync(filePath: string, data: string): void {
		const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
		fs.writeFileSync(tmpPath, data, "utf-8");
		fs.renameSync(tmpPath, filePath);
	}

	private ensureDir(dir: string): void {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}
}
