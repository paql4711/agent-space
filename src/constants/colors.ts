export const TERMINAL_COLOR_KEYS = [
	"terminal.ansiBlue",
	"terminal.ansiCyan",
	"terminal.ansiGreen",
	"terminal.ansiMagenta",
	"terminal.ansiYellow",
	"terminal.ansiRed",
	"terminal.ansiBrightBlue",
	"terminal.ansiBrightCyan",
	"terminal.ansiBrightGreen",
	"terminal.ansiBrightMagenta",
] as const;

export const TERMINAL_COLOR_HEX = [
	"#569cd6",
	"#4ec9b0",
	"#6a9955",
	"#c586c0",
	"#dcdcaa",
	"#f44747",
	"#9cdcfe",
	"#4fc1ff",
	"#b5cea8",
	"#d7ba7d",
] as const;

export const TERMINAL_COLOR_MAP: Record<string, string> = Object.fromEntries(
	TERMINAL_COLOR_KEYS.map((key, i) => [key, TERMINAL_COLOR_HEX[i]]),
);

export function getThemeColors(): import("vscode").ThemeColor[] {
	const vscode = require("vscode") as typeof import("vscode");
	return TERMINAL_COLOR_KEYS.map((key) => new vscode.ThemeColor(key));
}
