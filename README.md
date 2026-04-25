# Deadmouse-agent

<p align="center">
  <strong>A task execution harness where the Lead keeps the wheel and the machine layer keeps the ledger and brakes</strong>
</p>

<p align="center">
  <a href="./README.zh.md">中文 README</a>
</p>

<p align="center">
  <img alt="lead harness" src="https://img.shields.io/badge/lead-harness-c0c0c0?style=for-the-badge&labelColor=111827">
  <img alt="durable runtime" src="https://img.shields.io/badge/durable-runtime-9ca3af?style=for-the-badge&labelColor=1f2937">
  <img alt="gpt-5.4 supported" src="https://img.shields.io/badge/GPT--5.4-supported-d6d3d1?style=for-the-badge&labelColor=292524">
  <img alt="checkpoint persisted" src="https://img.shields.io/badge/checkpoint-persisted-64748b?style=for-the-badge&labelColor=0f172a">
  <img alt="runtime stats" src="https://img.shields.io/badge/runtime-stats-d4af37?style=for-the-badge&labelColor=1c1917">
</p>

Deadmouse does not ask the machine layer to do the Lead model's thinking, and it does not turn the machine layer into a second commander. Its job is to equip the Lead with a ledger, boundaries, loop guards, verification gates, and closeout gates. The user provides the objective; the Lead interprets that objective, chooses the route, calls tools, delegates to teammates or subagents, starts background work, gathers results, and decides what happens next. The machine layer turns that execution into a process with records, state, and evidence.

The steering wheel always stays with the Lead, but pending work cannot pretend to be finished, execution lanes cannot run forever, tool failures cannot be explained away in place, nothing can be shipped without convergence, and nothing can be closed without verification. In short, Deadmouse is neither autopilot nor an approval system. It is an agent harness that pushes large-model execution toward a durable, recoverable, and verifiable runtime.

## Developer commands

| Command | Meaning |
| --- | --- |
| `npm.cmd install` | Install project dependencies |
| `npm.cmd run typecheck` | Run TypeScript type checking |
| `npm.cmd run build` | Build the CLI into `dist/cli.js` |
| `npm.cmd run check` | Run `typecheck + build` |
| `npm.cmd test` | Run the full test suite, including `check + test:core` |
| `npm.cmd run test:build` | Build test artifacts into `.test-build/` |
| `npm.cmd run test:core` | Run the core test suite |
| `npm.cmd run verify:skills-api` | Verify the skills API |
| `npm.cmd run verify:runtime-context-api` | Verify the runtime lightweight context API |
| `npm.cmd run verify:runtime-checkpoint-api` | Verify the runtime checkpoint API |
| `npm.cmd run verify:runtime-observability-api` | Verify the runtime observability API |
| `npm.cmd run verify:mineru-documents-api` | Verify the MinerU document capability API |
| `npm.cmd run dev` | Start the CLI from source |
| `npm.cmd run dev -- "Help me inspect this project"` | Run a one-shot task from source |
| `node dist/cli.js` | Start interactive mode from the built artifact |
| `node dist/cli.js "Help me inspect this project"` | Run a one-shot task from the built artifact |
| `node dist/cli.js telegram serve` | Start the Telegram service from the built artifact |

## User commands

| Command | Meaning |
| --- | --- |
| `npm install -g @jun133/deadmouse` | Install the CLI globally |
| `deadmouse init` | Initialize `.deadmouse/` for the current project |
| `deadmouse` | Enter interactive mode |
| `deadmouse "Help me inspect this project"` | Run a one-shot task |
| `deadmouse run "Help me inspect this project"` | Explicitly run a one-shot task |
| `deadmouse resume [sessionId]` | Resume the latest or a specific session |
| `deadmouse sessions -n 20` | List recent sessions |
| `deadmouse diff [path]` | Show the current project's Git diff |
| `deadmouse changes [changeId]` | Show recorded changes |
| `deadmouse undo [changeId]` | Roll back the latest or a specific change |
| `deadmouse config show` | Show the current configuration |
| `deadmouse config path` | Show the configuration file path |
| `deadmouse doctor` | Check local configuration and API connectivity |
| `deadmouse telegram serve` | Start the Telegram direct-message service |

## Release commands

| Command | Meaning |
| --- | --- |
| `npm login` | Sign in to NPM |
| `npm whoami` | Confirm the current publishing account |
| `npm.cmd run check` | Run type checking and build before publishing |
| `npm.cmd test` | Run the full test suite before publishing |
| `npm pack --dry-run` | Preview the files that would be published to NPM |
| `npm version patch` | Publish a patch version |
| `npm version minor` | Publish a minor version |
| `npm version major` | Publish a major version |
| `npm publish` | Publish to NPM |
