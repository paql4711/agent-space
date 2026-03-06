import * as fs from "node:fs";
import * as path from "node:path";

export interface DetectedScript {
	name: string;
	command: string;
}

const lockFileToRunner: [string, string][] = [
	["bun.lock", "bun"],
	["bun.lockb", "bun"],
	["pnpm-lock.yaml", "pnpm"],
	["yarn.lock", "yarn"],
	["package-lock.json", "npm"],
];

function detectPackageManager(dir: string): string {
	for (const [lockFile, runner] of lockFileToRunner) {
		if (fs.existsSync(path.join(dir, lockFile))) return runner;
	}
	return "npm";
}

export function detectScripts(worktreePath: string): DetectedScript[] {
	const packageJsonPath = path.join(worktreePath, "package.json");
	try {
		const raw = fs.readFileSync(packageJsonPath, "utf-8");
		const pkg = JSON.parse(raw);
		if (!pkg.scripts || typeof pkg.scripts !== "object") return [];
		const runner = detectPackageManager(worktreePath);
		return Object.keys(pkg.scripts).map((name) => ({
			name,
			command: `${runner} run ${name}`,
		}));
	} catch {
		return [];
	}
}
