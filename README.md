# Agent Space

Run any terminal-based coding CLI per feature inside VS Code with isolated Git worktrees and persistent tmux-backed sessions.

Agent Space helps you manage parallel feature work without losing context. Create a feature, launch one or more coding agents, keep related scripts running, and come back later with the sidebar and home dashboard showing exactly where everything stands.

It works with any coding CLI you can launch from a terminal. Built-in presets are included for `claude`, `codex`, `copilot`, and `opencode`, and you can register custom tools for anything else.

## What It Does

- Creates a dedicated Git worktree for each feature branch
- Runs multiple coding CLIs on the same feature in parallel
- Keeps agent terminals alive in tmux across VS Code restarts
- Shows feature status, agents, and scripts in a sidebar and home dashboard
- Opens feature workspaces and pull request flows from inside VS Code

Built-in presets: `claude`, `codex`, `copilot`, and `opencode`.
Custom compatibility: any terminal-based CLI can be added with `agentSpace.codingTools`.

## How It Works

1. Add a Git repository as a project.
2. Create a feature to provision a branch and worktree.
3. Launch one or more coding CLIs for that feature.
4. Run package scripts like dev servers or watchers alongside the agents.
5. Resume work later from the Agent Space sidebar or home view, then open a pull request when ready.

## Why It Is Useful

When several agents work in the same repository, they can easily overwrite each other or lose terminal context. Agent Space keeps each feature isolated, makes active work visible, and lets long-running agent sessions survive editor restarts.

## Requirements

- **Git** for branch and worktree management
- **tmux** for persistent agent sessions
- **One coding CLI tool on PATH**: works out of the box with `claude`, `codex`, `copilot`, and `opencode`
- **Optional custom CLI tools**: add any other terminal-based tool with `agentSpace.codingTools`
- **Windows**: use Git for Windows (Git Bash). Install tmux with `pacman -S tmux` inside Git Bash.

Optional:

- [GitHub Pull Requests](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-pull-request-github) for the integrated "Create Pull Request" flow

## Quick Start

1. Install the extension.
2. Open the **Agent Space** icon in the VS Code activity bar.
3. Run `Agent Space: Add Project` and select any Git repository.
4. On first start, choose the default coding CLI when prompted.
5. Run `Agent Space: New Feature` to create a worktree and start the first agent with an available CLI.
6. Add more agents or run a script from the feature actions as needed.

## Core Features

### Feature-Based Workspaces

Every feature gets its own Git branch and worktree, so active changes stay isolated from other in-progress work.

### Multi-Agent Execution

You can run several coding CLIs on the same feature simultaneously and mix built-in presets with custom CLI tools.

### Persistent Sessions

Agent terminals live in tmux sessions, which means they can survive window reloads and full VS Code restarts.

### Sidebar and Home Dashboard

Use the activity-bar sidebar for quick actions and the home view for a broader snapshot of active features, agents, scripts, and status.

### Managed Script Terminals

Launch package scripts such as dev servers and watch tasks as managed terminals attached to a feature.

### Pull Request Handoff

Push the feature branch and open the GitHub Pull Requests extension flow from inside VS Code.

## Commands

All commands are available from the Command Palette.

| Command | Description |
|---|---|
| `Agent Space: New Feature` | Create a feature with a worktree and first agent |
| `Agent Space: Add Agent` | Add another coding agent to the active feature |
| `Agent Space: Execute Script` | Run a package script in a managed terminal |
| `Agent Space: Create Pull Request` | Push the branch and open PR creation |
| `Agent Space: Delete Feature` | Remove the feature, worktree, and agent data |
| `Agent Space: Open in File Explorer` | Open the feature worktree in a new VS Code window |
| `Agent Space: Add Project` | Register a Git repository |
| `Agent Space: Remove Project` | Unregister a project |
| `Agent Space: Open Home` | Open the Agent Space dashboard |
| `Agent Space: Sync Session Names` | Sync agent names from supported CLI sessions |

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `agentSpace.defaultTool` | unset | Preferred coding tool ID for new agents. Agent Space prompts for it on first start and stores the selection in user settings |
| `agentSpace.codingTools` | `[]` | Register any custom terminal-based coding CLI with `id`, `name`, `command`, and optional `args` |
| `agentSpace.worktreeBasePath` | `".worktrees"` | Base directory for worktrees, relative to the project root |
| `agentSpace.enablePerAgentIsolation` | `false` | Give each agent its own worktree instead of sharing one per feature |
| `agentSpace.syncSessionNames` | `true` | Sync agent display names from supported CLI rename metadata |

## GitHub

- Source: [github.com/paql4711/agent-space](https://github.com/paql4711/agent-space)
- Issues: [github.com/paql4711/agent-space/issues](https://github.com/paql4711/agent-space/issues)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
