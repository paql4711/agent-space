import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectScripts } from "../services/scriptDetector";

describe("detectScripts", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scripts-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns scripts from package.json", () => {
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify({
				scripts: {
					dev: "vite",
					test: "vitest run",
					build: "tsc && vite build",
				},
			}),
		);
		const scripts = detectScripts(tmpDir);
		expect(scripts).toEqual([
			{ name: "dev", command: "npm run dev" },
			{ name: "test", command: "npm run test" },
			{ name: "build", command: "npm run build" },
		]);
	});

	it("returns empty array when no package.json exists", () => {
		expect(detectScripts(tmpDir)).toEqual([]);
	});

	it("returns empty array when package.json has no scripts", () => {
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify({ name: "test" }),
		);
		expect(detectScripts(tmpDir)).toEqual([]);
	});

	it("returns empty array when package.json is invalid JSON", () => {
		fs.writeFileSync(path.join(tmpDir, "package.json"), "not json");
		expect(detectScripts(tmpDir)).toEqual([]);
	});

	it("uses bun run when bun.lock exists", () => {
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify({ scripts: { dev: "vite" } }),
		);
		fs.writeFileSync(path.join(tmpDir, "bun.lock"), "");
		expect(detectScripts(tmpDir)).toEqual([
			{ name: "dev", command: "bun run dev" },
		]);
	});

	it("uses bun run when bun.lockb exists", () => {
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify({ scripts: { dev: "vite" } }),
		);
		fs.writeFileSync(path.join(tmpDir, "bun.lockb"), "");
		expect(detectScripts(tmpDir)).toEqual([
			{ name: "dev", command: "bun run dev" },
		]);
	});

	it("uses pnpm run when pnpm-lock.yaml exists", () => {
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify({ scripts: { dev: "vite" } }),
		);
		fs.writeFileSync(path.join(tmpDir, "pnpm-lock.yaml"), "");
		expect(detectScripts(tmpDir)).toEqual([
			{ name: "dev", command: "pnpm run dev" },
		]);
	});

	it("uses yarn run when yarn.lock exists", () => {
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify({ scripts: { dev: "vite" } }),
		);
		fs.writeFileSync(path.join(tmpDir, "yarn.lock"), "");
		expect(detectScripts(tmpDir)).toEqual([
			{ name: "dev", command: "yarn run dev" },
		]);
	});

	it("defaults to npm run when only package-lock.json exists", () => {
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify({ scripts: { dev: "vite" } }),
		);
		fs.writeFileSync(path.join(tmpDir, "package-lock.json"), "{}");
		expect(detectScripts(tmpDir)).toEqual([
			{ name: "dev", command: "npm run dev" },
		]);
	});

	it("defaults to npm run when no lock file exists", () => {
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify({ scripts: { dev: "vite" } }),
		);
		expect(detectScripts(tmpDir)).toEqual([
			{ name: "dev", command: "npm run dev" },
		]);
	});
});
