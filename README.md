# Agent Space

Manage multiple AI coding agents across Git worktrees — all from VS Code.

Agent Space gives each feature its own Git worktree and lets you run multiple coding agents (Claude Code, Codex, GitHub Copilot, OpenCode) side by side with persistent tmux sessions that survive VS Code restarts.

## Features

### Feature-based workflow

Create named features that each get their own Git branch and worktree. Add multiple agents to a feature, run scripts alongside them, and create pull requests when done.

### Multi-agent support

Run several coding agents on the same feature simultaneously. Choose from built-in tools (Claude Code, Codex, GitHub Copilot, OpenCode) or register your own custom CLI tools.

### Persistent sessions with tmux

Agent terminals run inside tmux sessions that persist across VS Code restarts. Switch between features without losing agent context — reconnect to running sessions instantly.

### Welcome Dashboard and Feature Home

A built-in webview dashboard shows all your features at a glance. Click into a feature to see its agents, scripts, git stats, and quick actions.

### Sidebar navigator

A compact sidebar in the activity bar provides quick access to features and inline actions for adding agents or creating PRs.

### Git worktree isolation

Each feature works in its own worktree so agents never step on each other's code. Optionally enable per-agent isolation for even finer separation.

### Script terminals

Detect and launch package.json scripts (dev servers, watchers, etc.) as managed script terminals tied to a feature.

### Pull request creation

Push the feature branch and open the GitHub Pull Requests extension PR form in one click.

## Requirements

- **Git** — for worktree management
- **tmux** — for persistent agent sessions
- **A coding CLI tool** — at least one of: `claude`, `codex`, `copilot`, `opencode`
- **Windows**: Git for Windows (Git Bash) is required. Install tmux via `pacman -S tmux` in Git Bash.

### Optional

- [GitHub Pull Requests](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-pull-request-github) extension — for the "Create PR" command

## Getting Started

1. Install the extension.
2. Open the **Agent Space** sidebar from the activity bar.
3. Add a project (any Git repository).
4. Create a feature — this sets up a worktree and launches your first agent.
5. Add more agents or scripts as needed.

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `agentSpace.defaultTool` | `"claude"` | Default coding tool for new agents |
| `agentSpace.codingTools` | `[]` | Custom coding CLI tools (id, name, command, args) |
| `agentSpace.worktreeBasePath` | `".worktrees"` | Base directory for worktrees, relative to project root |
| `agentSpace.enablePerAgentIsolation` | `false` | Give each agent its own worktree instead of sharing one per feature |
| `agentSpace.syncSessionNames` | `true` | Sync agent display names from supported CLI rename metadata |

## Commands

All commands are available from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---|---|
| `Agent Space: New Feature` | Create a feature with a worktree and first agent |
| `Agent Space: Add Agent` | Add another coding agent to the active feature |
| `Agent Space: Execute Script` | Run a package.json script in a managed terminal |
| `Agent Space: Create Pull Request` | Push branch and open PR creation form |
| `Agent Space: Delete Feature` | Remove feature, worktree, and all agent data |
| `Agent Space: Open in File Explorer` | Open the feature worktree in a new VS Code window |
| `Agent Space: Add Project` | Register a Git repository |
| `Agent Space: Remove Project` | Unregister a project |
| `Agent Space: Open Home` | Open the Welcome Dashboard |
| `Agent Space: Sync Session Names` | Manually sync agent names from CLI sessions |

## Release Notes

See [CHANGELOG](CHANGELOG.md).
