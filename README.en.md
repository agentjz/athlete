# 🐱kitty-agent

<p align="center">
  <a href="./README.md">中文 README</a>
</p>

<p align="center">
  <img alt="agent" src="https://img.shields.io/badge/agent-kitty-c0c0c0?style=for-the-badge&labelColor=111827">
  <img alt="harness" src="https://img.shields.io/badge/harness-runtime-9ca3af?style=for-the-badge&labelColor=1f2937">
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-d4af37?style=for-the-badge&labelColor=1c1917">
</p>

Kitty Agent is an open source agent framework that uses harness design to force frontier capability out of large models.

🐎 The model is a wild horse, the harness is the rein, and the capability ecology is the open field. The rein concentrates power by connecting speed, direction, and evidence; the field provides action space where file editing, code research, document parsing, network tools, teammates, subagents, workflows, Dreaming, MCP, and external capability packages can dock into one protocol and grow freely.

🧠 In agent design, if history, preferences, and old tasks are automatically pushed into the present, old inertia starts pretending to be current intent. Kitty Agent focuses on the present: conversations, final outputs, tool artifacts, runtime events, change records, traces, and ledgers are preserved, but they enter current judgment only through query tools. Ecology is available capability, not intent; nothing executes until Lead explicitly chooses it.

🔌 Kitty Agent is provider-friendly and avoids being trapped by one model vendor. Different models and external ecosystems can dock into the same boundaries, using protocol, evidence, and runtime constraints to force the strongest real capability out of the model.

Kitty is open source under the MIT License.

If you're interested in **building your own Agent** from scratch, join our group chat and let's grow together.

<p align="center">
  <img src="assets/wechat-group.jpg" alt="WeChat Group" width="300">
</p>

<!-- capability-ecology:start -->

## Built-in Profiles

| Profile | What it does | Status |
| --- | --- | --- |
| `intp` | Turns messy work into clear boundaries, responsibilities, evidence, and next steps. | ✅ |
| `grok` | Pushes against weak assumptions, fake certainty, and decorative complexity. | ✅ |
| `caveman` | Keeps output short, direct, and information-dense without losing facts. | ✅ |
| `buddha` | Keeps long work calm, visible, and moving until evidence closes the loop. | ✅ |

## Capability Ecology

### Execution Ecology

| Capability | What it does | Status |
| --- | --- | --- |
| Dreaming | Works inside a Mirror World, explores improvements, preserves evidence, and returns merge proposals without touching the real project directly. | 🚧 |
| Dreaming Loop | Runs repeated Dreaming rounds while keeping every continuation decision with Lead. | ✅ |
| Subagent `explore` | Read-only codebase exploration for concrete facts. | ✅ |
| Subagent `plan` | Read-only design analysis for implementation planning. | ✅ |
| Subagent `code` | Focused implementation lane with edit and validation tools. | ✅ |
| Team | Coordinates teammates through inbox, task, execution, and closeout records. | ✅ |
| Workflow | Offers reusable work methods while Lead keeps strategy control. | ✅ |
| Background | Runs slow commands in recorded execution lanes. | ✅ |
| Skills | Loads focused local knowledge only when Lead asks for it. | ✅ |
| MCP | Connects configured external tool servers through the governed capability surface. | ✅ |
| Capability Package | Lets external ecosystems dock through a formal port instead of one-off glue logic. | ✅ |

### Built-in Skill Packages

| Capability | What it does | Status |
| --- | --- | --- |
| `mineru-doc-reading` | Adds focused guidance for reading document files through MinerU precision or tokenless Agent lightweight parsing. | ✅ |
| `mineru-image-reading` | Adds focused guidance for image reading through MinerU precision or tokenless Agent lightweight parsing. | ✅ |
| `mineru-pdf-reading` | Adds focused guidance for PDF reading through MinerU precision or tokenless Agent lightweight parsing. | ✅ |
| `mineru-ppt-reading` | Adds focused guidance for presentation reading through MinerU precision or tokenless Agent lightweight parsing. | ✅ |
| `spec-alignment` | Keeps spec, code, and tests aligned after changes. | ✅ |
| `test-guardrails` | Keeps verification grounded in repository contracts. | ✅ |
| `web-research` | Adds focused guidance for evidence-based web research. | ✅ |

### CLI Surface

| Capability | What it does | Status |
| --- | --- | --- |
| `kitty` | Starts interactive mode or runs a one-shot prompt. | ✅ |
| `kitty run` | Runs a one-shot task explicitly. | ✅ |
| `kitty resume` | Resumes the latest or selected saved session. | ✅ |
| `kitty sessions` | Lists recent sessions. | ✅ |
| `kitty init` | Creates project-local `.kitty` files. | ✅ |
| `kitty diff` | Shows the current project Git diff. | ✅ |
| `kitty changes` | Lists or reads recorded file changes. | ✅ |
| `kitty undo` | Undoes the latest or selected recorded change. | ✅ |
| `kitty config` | Reads and updates local Kitty configuration. | ✅ |
| `kitty doctor` | Checks provider, runtime, and observability health. | ✅ |
| `kitty capability package` | Installs, lists, enables, disables, diagnoses, and tests capability packages. | ✅ |
| `kitty regression` | Captures and runs evidence-backed regression cases. | ✅ |
| `kitty telegram serve` | Starts the Telegram direct-message service. | ✅ |

### Dreaming Tools

| Tool | What it does | Status |
| --- | --- | --- |
| `dreaming_start` | Starts one Mirror World Dreaming execution. | 🚧 |
| `dreaming_loop_start` | Creates a Dreaming Loop ledger. | ✅ |
| `dreaming_loop_next` | Starts one explicit Dreaming round from a loop. | ✅ |
| `dreaming_loop_status` | Reads Dreaming Loop state and round evidence. | ✅ |

### File And Code Tools

| Tool | What it does | Status |
| --- | --- | --- |
| `list_files` | Lists files and directories. | ✅ |
| `find_files` | Finds files by path pattern. | ✅ |
| `read_file` | Reads local files with anchors for later edits. | ✅ |
| `search_files` | Searches file contents. | ✅ |
| `write_file` | Creates new files. | ✅ |
| `edit_file` | Edits existing files with read anchors. | ✅ |
| `apply_patch` | Applies structured patches. | ✅ |
| `undo_last_change` | Reverts the latest recorded file change. | ✅ |
| `code_symbols` | Lists code symbols. | ✅ |
| `code_references` | Finds code references. | ✅ |
| `code_pattern` | Finds structural code patterns. | ✅ |

### Document Tools

| Tool | What it does | Status |
| --- | --- | --- |
| `mineru_pdf_read` | Reads PDFs through MinerU precision or tokenless Agent lightweight parsing. | ✅ |
| `mineru_image_read` | Reads images through MinerU precision or tokenless Agent lightweight parsing. | ✅ |
| `mineru_doc_read` | Reads document files through MinerU precision or tokenless Agent lightweight parsing. | ✅ |
| `mineru_ppt_read` | Reads presentations through MinerU precision or tokenless Agent lightweight parsing. | ✅ |
| `read_docx` | Reads DOCX files. | ✅ |
| `write_docx` | Writes DOCX files. | ✅ |
| `edit_docx` | Edits DOCX files. | ✅ |
| `read_spreadsheet` | Reads spreadsheet files. | ✅ |

### Network And API Tools

| Tool | What it does | Status |
| --- | --- | --- |
| `http_probe` | Checks a URL quickly. | ✅ |
| `http_request` | Sends one HTTP request. | ✅ |
| `http_session` | Manages reusable HTTP session state. | ✅ |
| `http_suite` | Runs a small HTTP check suite. | ✅ |
| `network_trace` | Records network evidence. | ✅ |
| `openapi_inspect` | Inspects OpenAPI documents. | ✅ |
| `openapi_lint` | Lints OpenAPI documents. | ✅ |
| `download_url` | Downloads a URL into a file. | ✅ |

### History And Trace Tools

| Tool | What it does | Status |
| --- | --- | --- |
| `session_list` | Lists saved sessions. | ✅ |
| `session_read` | Reads one saved session. | ✅ |
| `session_search` | Searches session history. | ✅ |
| `session_final_output` | Reads a session's final output. | ✅ |
| `tool_artifact_read` | Reads stored tool artifacts. | ✅ |
| `runtime_event_search` | Searches runtime events. | ✅ |
| `change_record_read` | Reads recorded changes. | ✅ |
| `agent_trace_list` | Lists agent traces. | ✅ |
| `agent_trace_read` | Reads one agent trace. | ✅ |

### Task And Team Tools

| Tool | What it does | Status |
| --- | --- | --- |
| `todo_write` | Updates the visible todo list. | ✅ |
| `task` | Creates a delegated task with a selected subagent type. | ✅ |
| `task_create` | Creates a persistent task. | ✅ |
| `task_get` | Reads one task. | ✅ |
| `task_list` | Lists tasks. | ✅ |
| `task_update` | Updates task state. | ✅ |
| `claim_task` | Claims a task and binds a worktree. | ✅ |
| `coordination_policy` | Updates team coordination policy. | ✅ |
| `spawn_teammate` | Starts a teammate execution. | ✅ |
| `list_teammates` | Lists teammates. | ✅ |
| `send_message` | Sends a message to a teammate. | ✅ |
| `read_inbox` | Reads Lead inbox messages. | ✅ |
| `broadcast` | Broadcasts a message to teammates. | ✅ |
| `shutdown_request` | Requests teammate shutdown. | ✅ |
| `shutdown_response` | Responds to a shutdown request. | ✅ |
| `plan_approval` | Records plan approval state. | ✅ |
| `idle` | Records idle state. | ✅ |

### Worktree, Shell, Background, And Skill Tools

| Tool | What it does | Status |
| --- | --- | --- |
| `worktree_list` | Lists worktrees. | ✅ |
| `worktree_get` | Reads one worktree record. | ✅ |
| `worktree_events` | Reads worktree events. | ✅ |
| `worktree_create` | Creates an isolated worktree. | ✅ |
| `worktree_keep` | Marks a worktree to keep. | ✅ |
| `worktree_remove` | Removes a worktree. | ✅ |
| `run_shell` | Runs a foreground shell command. | ✅ |
| `background_run` | Starts a background command. | ✅ |
| `background_check` | Reads background command status. | ✅ |
| `background_terminate` | Terminates a background command. | ✅ |
| `load_skill` | Loads a local skill package. | ✅ |

<!-- capability-ecology:end -->

## Release Guide

| Command | Meaning |
| --- | --- |
| `npm login` | Sign in to NPM |
| `npm whoami` | Confirm the current publishing account |
| `npm.cmd run check` | Run type checking and build before publishing |
| `npm.cmd test` | Run the full test suite before publishing |
| `npm.cmd run verify:mineru-documents-api` | Verify the MinerU document capability API |
| `npm pack --dry-run` | Preview the files that would be published to NPM |
| `npm version patch` | Publish a patch version |
| `npm version minor` | Publish a minor version |
| `npm version major` | Publish a major version |
| `npm publish` | Publish to NPM |
