# parallel-prompts

A kanban for running [Claude Code](https://docs.anthropic.com/claude/code) on your repos in parallel, isolated git worktrees. Each task runs in its own tmux session inside a fresh worktree on a fresh branch.

## Prerequisites

- **Node.js** ≥ 20
- **git**
- **tmux** (macOS: `brew install tmux`)
- **claude** CLI on your `PATH` ([install](https://docs.anthropic.com/claude/code))

## Install & run

```bash
git clone <this-repo> parallel-prompts
cd parallel-prompts
npm install
npm start
```

`npm start` builds the UI once and serves it from a single Node process. Your browser opens to `http://127.0.0.1:5174/`.

To skip the auto-browser-open: `npm start -- --no-open`.
To force a fresh UI build: `npm start -- --build`.

### Double-click experience (macOS)

After `npm install`, build a `.app` launcher:

```bash
npm run install:macos-app
```

This creates `~/Applications/Parallel Prompts.app` pointing at your cloned repo. Double-click it from Finder to launch — first run builds the UI (~10s) and opens the browser. Launcher logs go to `~/Library/Logs/parallel-prompts/launcher.log`. To pick a different destination: `bash scripts/install-macos-app.sh /Applications`.

The `.app` is regenerated each time you run the script — re-run it if you move the repo.

### Development

```bash
npm run dev
```

Runs the Vite dev server on `5173` and the API/WS server on `5174` with hot reload on both.

## What it does

1. **Add repositories** — settings → repositories → browse to a local git checkout.
2. **Create a task** in any column (each column has a `+` button).
3. **Drag the card to a column with `run` behavior** (default: "In Progress") — the server runs `git worktree add` to create `<repo>/.worktrees/task-<id>` on a fresh branch `agent/task-<id>`, then starts `claude --dangerously-skip-permissions '<your prompt>'` inside a tmux session named `pp-<taskId>`.
4. **Open the card** to watch the live Claude TUI in the browser (xterm.js) and send follow-up messages mid-conversation.
5. **Drag the card off** (default: "Review") to kill the agent. Drag it to "Done" when the work is acceptable. **Delete** to remove the worktree.

You can also attach to any task's tmux session from your terminal: `tmux attach -t pp-<taskId>`. The server uses `tmux pipe-pane` to capture output, so attaching and watching the browser stay in sync.

## Configuration

Open **Settings** in the top bar.

- **Repositories** — list, add, rename, remove. Each gets a color used to tint cards.
- **Columns** — fully customizable. Add/remove columns, rename them, and set behavior:
  - `queue` — just holds tasks
  - `run` — spawns claude when a task enters
  - `stop` — kills claude when a task enters
- **Max concurrent** — global cap on running claude processes.
- **Skill per column** — picks a Claude skill to inject (`/<skill-name> <prompt>`) when tasks enter that column. Skills are auto-discovered from `~/.claude/skills/`. Use the 📁 button to point at a skill folder anywhere on disk — external skills are symlinked into the worktree's `.claude/skills/` at spawn time.

## Where state lives

- `data/tasks.json` — task list
- `data/config.json` — repos, columns, skills, global settings
- `data/logs/<task-id>.log` — full transcript captured from each tmux session

## Caveats

- Uses `claude --dangerously-skip-permissions`. Agents can do anything inside their worktree — and via filesystem access, anywhere else they reach. Run on your own machine, on repos you trust to mutate.
- macOS / Linux only (depends on `tmux`). Windows users need WSL.
- Server binds to `127.0.0.1`. Override with `HOST=0.0.0.0 npm start` if you really want LAN access — but understand point #1 first.
