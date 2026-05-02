# 🐱小猫智能体

<p align="center">
  <a href="./README.en.md">English README</a>
</p>

<p align="center">
  <img alt="agent" src="https://img.shields.io/badge/agent-kitty-c0c0c0?style=for-the-badge&labelColor=111827">
  <img alt="harness" src="https://img.shields.io/badge/harness-runtime-9ca3af?style=for-the-badge&labelColor=1f2937">
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-d4af37?style=for-the-badge&labelColor=1c1917">
</p>

小猫智能体是一个用 harness 逼出大模型极限能力的开源智能体框架。

🐎 大模型像野马，harness 像缰绳，能力生态像草原。缰绳让力量更集中，让速度、方向和证据连在一起；草原提供足够大的行动空间，让文件读写、代码研究、文档解析、网络工具、队友、子代理、工作流、梦境、MCP 和外部能力包都能接进来，在统一协议下自由生长。

🧠 在智能体设计里，如果历史、偏好和旧任务被自动塞进当下，旧惯性就会伪装成当前意图。小猫智能体只专注于当下：历史对话、最终输出、工具产物、运行事件、变更记录、trace 和 ledger 都会保留下来，但只通过查询工具进入当前判断。生态只是可用能力，不是行动意图；只有领导者显式选择，能力才会进入执行。

🔌 小猫智能体对多 provider 友好，避免被唯一的模型厂商绑定死角。不同模型和外部生态可以接入同一套边界，最终用清楚的协议、证据和运行时约束逼出大模型最大的真实能力。

Kitty 遵循 MIT 开源协议。

如果你对**手搓 Agent** 感兴趣，可以加群一起聊聊，共同进步。

<p align="center">
  <img src="assets/wechat-group.jpg" alt="微信交流群" width="300">
</p>

<!-- capability-ecology:start -->

## 内置人格

| Profile | 作用 | 状态 |
| --- | --- | --- |
| `intp` | 把混乱任务拆成清楚的边界、责任、证据和下一步。 | ✅ |
| `grok` | 挑穿弱前提、假确定性和装饰性复杂度。 | ✅ |
| `caveman` | 输出更短、更直接、更高密度，但不丢事实。 | ✅ |
| `buddha` | 让长任务保持平静、可见、持续推进，直到证据闭环。 | ✅ |

## 能力生态

### 执行生态

| 能力 | 作用 | 状态 |
| --- | --- | --- |
| Dreaming | 在 Mirror World 里探索改进、保留证据、交回 merge proposal，不直接破坏真实项目。 | 🚧 |
| Dreaming Loop | 跑多轮做梦，但是否继续下一轮仍由 Lead 判断。 | ✅ |
| Subagent `explore` | 只读探索代码，收集事实。 | ✅ |
| Subagent `plan` | 只读分析设计，产出实现计划。 | ✅ |
| Subagent `code` | 聚焦写代码，带编辑和验证工具。 | ✅ |
| Team | 让多个队友通过 inbox、task、execution 和 closeout 正式协作。 | ✅ |
| Workflow | 提供可复用工作方法，但策略仍由 Lead 控制。 | ✅ |
| Background | 把慢命令放进可记录的执行通道。 | ✅ |
| Skills | 只在 Lead 需要时加载本地知识包。 | ✅ |
| MCP | 把配置过的外部工具服务器接入同一套能力治理面。 | ✅ |
| Capability Package | 让外部生态通过正式 port 停靠进来。 | ✅ |

### 内置 Skill 包

| 能力 | 作用 | 状态 |
| --- | --- | --- |
| `mineru-doc-reading` | 提供用 MinerU 精准解析或免 Token Agent 轻量解析读取文档文件的专门方法。 | ✅ |
| `mineru-image-reading` | 提供用 MinerU 精准解析或免 Token Agent 轻量解析读取图片的专门方法。 | ✅ |
| `mineru-pdf-reading` | 提供用 MinerU 精准解析或免 Token Agent 轻量解析读取 PDF 的专门方法。 | ✅ |
| `mineru-ppt-reading` | 提供用 MinerU 精准解析或免 Token Agent 轻量解析读取演示文稿的专门方法。 | ✅ |
| `spec-alignment` | 用于变更后同步 spec、代码和测试。 | ✅ |
| `test-guardrails` | 用于把验证约束在仓库契约里。 | ✅ |
| `web-research` | 提供基于证据的网页研究方法。 | ✅ |

### CLI 功能面

| 能力 | 作用 | 状态 |
| --- | --- | --- |
| `kitty` | 进入交互模式，或执行一次性 prompt。 | ✅ |
| `kitty run` | 显式执行一次性任务。 | ✅ |
| `kitty resume` | 恢复最近一次或指定历史会话。 | ✅ |
| `kitty sessions` | 列出最近会话。 | ✅ |
| `kitty init` | 创建项目本地 `.kitty` 文件。 | ✅ |
| `kitty diff` | 查看当前项目 Git diff。 | ✅ |
| `kitty changes` | 列出或读取已记录的文件变更。 | ✅ |
| `kitty undo` | 回滚最近一次或指定变更记录。 | ✅ |
| `kitty config` | 读取和更新本地 Kitty 配置。 | ✅ |
| `kitty doctor` | 检查模型连接、运行时和观测状态。 | ✅ |
| `kitty capability package` | 安装、查看、启停、诊断和测试能力包。 | ✅ |
| `kitty regression` | 捕获并运行有证据支撑的回归案例。 | ✅ |
| `kitty telegram serve` | 启动 Telegram 私聊服务。 | ✅ |

### Dreaming 工具

| 工具 | 作用 | 状态 |
| --- | --- | --- |
| `dreaming_start` | 启动一次 Mirror World 做梦执行。 | 🚧 |
| `dreaming_loop_start` | 创建 Dreaming Loop 账本。 | ✅ |
| `dreaming_loop_next` | 从 loop 启动一轮明确的 Dreaming。 | ✅ |
| `dreaming_loop_status` | 查看 Dreaming Loop 状态和轮次证据。 | ✅ |

### 文件与代码工具

| 工具 | 作用 | 状态 |
| --- | --- | --- |
| `list_files` | 列出文件和目录。 | ✅ |
| `find_files` | 按路径模式找文件。 | ✅ |
| `read_file` | 读取文件，并给后续编辑提供锚点。 | ✅ |
| `search_files` | 搜索文件内容。 | ✅ |
| `write_file` | 创建新文件。 | ✅ |
| `edit_file` | 基于锚点编辑已有文件。 | ✅ |
| `apply_patch` | 应用结构化补丁。 | ✅ |
| `undo_last_change` | 回滚最近一次记录的文件修改。 | ✅ |
| `code_symbols` | 列出代码符号。 | ✅ |
| `code_references` | 查找代码引用。 | ✅ |
| `code_pattern` | 查找代码结构模式。 | ✅ |

### 文档工具

| 工具 | 作用 | 状态 |
| --- | --- | --- |
| `mineru_pdf_read` | 用 MinerU 精准解析或免 Token Agent 轻量解析读取 PDF。 | ✅ |
| `mineru_image_read` | 用 MinerU 精准解析或免 Token Agent 轻量解析读取图片。 | ✅ |
| `mineru_doc_read` | 用 MinerU 精准解析或免 Token Agent 轻量解析读取文档。 | ✅ |
| `mineru_ppt_read` | 用 MinerU 精准解析或免 Token Agent 轻量解析读取演示文稿。 | ✅ |
| `read_docx` | 读取 DOCX。 | ✅ |
| `write_docx` | 写入 DOCX。 | ✅ |
| `edit_docx` | 编辑 DOCX。 | ✅ |
| `read_spreadsheet` | 读取表格文件。 | ✅ |

### 网络与 API 工具

| 工具 | 作用 | 状态 |
| --- | --- | --- |
| `http_probe` | 快速探测 URL。 | ✅ |
| `http_request` | 发送一次 HTTP 请求。 | ✅ |
| `http_session` | 管理可复用 HTTP 会话状态。 | ✅ |
| `http_suite` | 运行一组轻量 HTTP 检查。 | ✅ |
| `network_trace` | 记录网络取证。 | ✅ |
| `openapi_inspect` | 检查 OpenAPI 文档。 | ✅ |
| `openapi_lint` | 校验 OpenAPI 文档。 | ✅ |
| `download_url` | 下载 URL 到文件。 | ✅ |

### 历史与 Trace 工具

| 工具 | 作用 | 状态 |
| --- | --- | --- |
| `session_list` | 列出历史会话。 | ✅ |
| `session_read` | 读取一个历史会话。 | ✅ |
| `session_search` | 搜索历史会话。 | ✅ |
| `session_final_output` | 读取会话最终输出。 | ✅ |
| `tool_artifact_read` | 读取工具产物。 | ✅ |
| `runtime_event_search` | 搜索运行事件。 | ✅ |
| `change_record_read` | 读取变更记录。 | ✅ |
| `agent_trace_list` | 列出 agent trace。 | ✅ |
| `agent_trace_read` | 读取一个 agent trace。 | ✅ |

### 任务与队友工具

| 工具 | 作用 | 状态 |
| --- | --- | --- |
| `todo_write` | 更新可见 todo。 | ✅ |
| `task` | 创建带 subagent 类型的委派任务。 | ✅ |
| `task_create` | 创建持久任务。 | ✅ |
| `task_get` | 读取一个任务。 | ✅ |
| `task_list` | 列出任务。 | ✅ |
| `task_update` | 更新任务状态。 | ✅ |
| `claim_task` | 认领任务并绑定 worktree。 | ✅ |
| `coordination_policy` | 更新团队协作策略。 | ✅ |
| `spawn_teammate` | 启动队友执行。 | ✅ |
| `list_teammates` | 列出队友。 | ✅ |
| `send_message` | 给队友发消息。 | ✅ |
| `read_inbox` | 读取 Lead inbox。 | ✅ |
| `broadcast` | 向队友广播消息。 | ✅ |
| `shutdown_request` | 请求队友关闭。 | ✅ |
| `shutdown_response` | 响应关闭请求。 | ✅ |
| `plan_approval` | 记录计划批准状态。 | ✅ |
| `idle` | 记录空闲状态。 | ✅ |

### Worktree、Shell、后台与 Skill 工具

| 工具 | 作用 | 状态 |
| --- | --- | --- |
| `worktree_list` | 列出 worktree。 | ✅ |
| `worktree_get` | 读取一个 worktree 记录。 | ✅ |
| `worktree_events` | 读取 worktree 事件。 | ✅ |
| `worktree_create` | 创建隔离 worktree。 | ✅ |
| `worktree_keep` | 标记保留 worktree。 | ✅ |
| `worktree_remove` | 删除 worktree。 | ✅ |
| `run_shell` | 运行前台 shell 命令。 | ✅ |
| `background_run` | 启动后台命令。 | ✅ |
| `background_check` | 查看后台命令状态。 | ✅ |
| `background_terminate` | 终止后台命令。 | ✅ |
| `load_skill` | 加载本地 skill 包。 | ✅ |

<!-- capability-ecology:end -->

## 发布指引

| 命令 | 含义 |
| --- | --- |
| `npm login` | 登录 NPM |
| `npm whoami` | 确认当前发布账号 |
| `npm.cmd run check` | 发布前执行类型检查和构建 |
| `npm.cmd test` | 发布前执行全量测试 |
| `npm.cmd run verify:mineru-documents-api` | 验证 MinerU 文档能力 API |
| `npm pack --dry-run` | 预览即将发布到 NPM 的文件 |
| `npm version patch` | 发布补丁版本 |
| `npm version minor` | 发布次版本 |
| `npm version major` | 发布主版本 |
| `npm publish` | 发布到 NPM |
