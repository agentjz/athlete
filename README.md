# Athlete

<p align="center">
  <strong>一个把 LLM 变成可持续执行系统的 Agent Harness</strong>
</p>

<p align="center">
  <img alt="terminal first" src="https://img.shields.io/badge/terminal-first-2ea44f?style=for-the-badge">
  <img alt="durable runtime" src="https://img.shields.io/badge/durable-runtime-1f6feb?style=for-the-badge">
  <img alt="checkpoint persisted" src="https://img.shields.io/badge/checkpoint-persisted-8250df?style=for-the-badge">
  <img alt="runtime stats" src="https://img.shields.io/badge/runtime-stats-f59e0b?style=for-the-badge">
</p>

一个终端优先的 Agent Harness。

一个单纯的 LLM，往往擅长回答问题；一个加上 harness 的 LLM，才开始真正接住任务。它不只是“说下一句”，而是能在复杂任务里持续往前跑，知道什么时候该读文件、什么时候该调用工具、什么时候该拆任务、什么时候该把状态记下来，出了错以后还能接着做。✨

Athlete 想做的，就是这层把模型变成“可执行系统”的底盘。它不只是在终端里包一层聊天壳，而是把状态、工具、恢复、协作和通道接成一条完整链路，让任务可以推进、暂停、恢复、续跑，并把过程留下来。🛠️

Athlete 当前的核心不是“陪聊”，而是“持续推进任务”：

- 一个耐跑的主 Agent
- 一个会拆任务、派任务、等任务、合流任务的总指挥层
- 一套统一的控制面、宿主边界和扩展口

它已经不该被理解成一个“自己闷头干活的单兵 Agent”，而应该被理解成：

- 一个能长期耐跑的主 Agent
- 一个会组织任务、拆解任务、调度任务的总指挥
- 一个把工具、技能、宿主和控制面统一起来的平台内核

主文档现在只看 `spec/`：

- 给人审阅的：`spec/用户审阅/`
- 给实现和测试用的：`spec/技术实现/`

## 一个完整例子

比如用户在 Telegram 私聊里丢来一句话，再附上几份材料：

> “帮我做一个《Helldivers 2》最新新闻情报包。  
> 去网上找最新公开新闻，再结合我刚发给你的 PDF、截图、docx、pptx、表格和一个公开链接，最后给我：  
> 1. 一个网页摘要  
> 2. 一份 markdown 报告  
> 3. 一份 docx 成品  
> 4. 把最终文件回传给我。  
> 如果任务太大，你自己拆分和调度。”

这一个例子，基本就能把 Athlete 当前大部分能力串起来。🌟

### 你从用户视角会看到什么 👀

你看到的不是“建议你这样做”，而是一条真的在推进的任务链：

1. 它先接住多种输入。
   不管你是从 CLI 直接发任务，还是从 Telegram / 微信私聊发消息、发图片、发文件、发语音，它都不是当成一段普通聊天，而是当成一个真实任务的入口。
2. 它先理解任务全貌。
   它会判断：这个目标不只是“找新闻”，还包含网页信息搜集、附件解析、报告生成、文件交付和最终验证，所以不能闷头一步做到底。
3. 它会把不同材料接进来。
   PDF、截图、docx、pptx、表格、公开 URL，都不会被一刀切当成“普通文件”处理，而是按各自最合适的读取链路走。
4. 它会真的去外部世界看。
   它会去搜新闻、打开页面、检查标题、时间、链接和内容，而不是假装“我大概知道最新新闻是什么”。
5. 它会真的开始干活。
   它会写报告、改文件、做网页、补脚本、整理输出，而不是只给你一个“你可以这样做”的方案。
6. 它会自己组织任务。
   一部分工作可以自己做，一部分可以放后台慢慢跑，一部分可以拆给别的执行者并行推进。
7. 它会继续验证。
   它不会一写完就说“完成了”，而是继续检查网页、命令、HTTP 探针、输出文件和最终交付是否真的可用。
8. 它会把结果交回给你。
   如果你在 Telegram / 微信里，它会把文本结果分块可见地发出来，并在需要时把最终文件直接发回去。
9. 如果你中途要停，它也不会炸掉。
   `/stop` 会停当前任务，但宿主服务不会退出；你下一条消息还可以继续接着干。🫶

### 系统在机器层 / 开发视角到底做了什么 🤖

这个例子背后，不是 prompt 在“努力自觉”，而是机器层在强约束：

1. 统一宿主入口。
   同一个任务，不管来自 CLI、Telegram 还是微信，都会先经过统一宿主边界进入核心，而不是每个宿主自己偷偷拼一套 runtime。
2. lead 先做总指挥预处理。
   真正调用模型前，系统会先分析 objective、复杂度、现有任务进度，判断这一步应该自己做、拆任务、派工、等待还是合流。
3. 控制面落正式真相。
   任务、队友、后台任务、协议请求、worktree 绑定这些状态，都落在统一控制面里，不靠聊天记录临时记忆。
4. session 是任务现场，不是普通聊天记录。
   session 里会带着 checkpoint、verificationState、acceptanceState、runtimeStats，所以系统中断以后不是从零开始，而是能从现场继续。
5. 文件和材料按能力链路走。
   PDF 会走 `mineru_pdf_read`，图片走 `mineru_image_read`，docx 走 `mineru_doc_read`，pptx 走 `mineru_ppt_read`，表格走 `read_spreadsheet`，公开链接走 `download_url`，不是所有输入都粗暴塞给一个读文件工具。
6. 网页和文件能力都是真实动作。
   网页部分依赖浏览器能力和网页研究链路；本地部分依赖 `read_file`、`write_file`、`edit_file`、`apply_patch`、`search_files`、`run_shell` 等真实工具，而不是让模型“脑补执行”。
7. 慢任务和并行任务有正式执行位。
   慢操作可以进入 `background_run`；适合拆分的工作可以交给 teammate；并行改动需要 worktree 隔离，而不是所有执行者挤在同一个目录里乱改。
8. finalize 受机器状态约束。
   一旦文件改动、工具执行或 closeout 条件触发，verification 和 acceptance 会进入正式状态机；没验过、没收口、没满足条件，就不能假装完成。
9. 文件交付不是旁路。
   Telegram / 微信的 send file 能力是通过宿主边界注入的正式 extra tool，不是宿主自己绕开核心偷偷发文件。
10. 通道自己的现实语义也被保留。
   Telegram 会保留它的 delivery、typing 和 `/stop` 语义；微信会保留 `context_token`、delivery、附件输入和 `/stop` 语义，但这些都不能反过来定义核心真相。
11. 所有这些能力最后还能重新回到同一条主路径。
   所以 Athlete 不是“碰巧能做很多事”，而是“在机器层被组织成了同一个可续跑、可调度、可验证的系统”。🧭

所以这个例子展示的，不只是“Agent 会不会写代码”，而是整个项目真正的能力全景：

- 网页研究与浏览器动作
- 文档、图片、PPT、表格、URL 输入链路
- 本地文件读写与补丁修改
- shell、后台任务和 HTTP 验证
- lead 调度、teammate、background、worktree
- session、checkpoint、verification、acceptance、runtime stats
- CLI、Telegram、微信三种宿主入口
- 文本结果与文件结果的最终交付

## 已实现功能

| 能力 | 接口 / 实现 | 状态 |
| --- | --- | --- |
| 浏览器自动化 | Playwright MCP `@playwright/mcp` | ✅ |
| PDF 读取 | `mineru_pdf_read` + `mineru-pdf-reading` | ✅ |
| 图片读取 | `mineru_image_read` + `mineru-image-reading` | ✅ |
| Word 读取 | `mineru_doc_read` + `mineru-doc-reading`，`.docx` 可回退到 `read_docx` | ✅ |
| Word 写入 / 编辑 | `write_docx` / `edit_docx` | ✅ |
| PPT / PPTX 读取 | `mineru_ppt_read` + `mineru-ppt-reading` | ✅ |
| 表格读取 | `read_spreadsheet`，支持 `xlsx` / `xls` / `csv` / `tsv` / `ods` | ✅ |
| 远程文件获取 | `download_url` | ✅ |
| HTTP 探针 | `http_probe` | ✅ |
| 本地文件读写 / 补丁 | `read_file` / `write_file` / `edit_file` / `apply_patch` / `search_files` | ✅ |
| Shell 与后台任务 | `run_shell` / `background_run` / `background_check` | ✅ |
| 任务板与协作队友 | `task` / `spawn_teammate` / `read_inbox` / `send_message` | ✅ |
| 隔离工作区 | Git worktree：`worktree_*` | ✅ |
| Telegram 私聊接入 | `athlete telegram serve` | ✅ |
| 微信私聊接入 | `athlete weixin login` / `athlete weixin serve` / `athlete weixin logout` | ✅ |

## 使用说明

- 文档读取能力依赖 `MINERU_API_TOKEN`。
- Telegram 需要 `ATHLETE_TELEGRAM_TOKEN` 和 `ATHLETE_TELEGRAM_ALLOWED_USER_IDS`。
- Telegram 私聊支持 `/stop`，可以停止当前任务但不关闭服务。
- Telegram 支持 file 输入与 file 回传；终端 logs 会显示服务启动、投递和失败信息。
- 微信需要先执行 `athlete weixin login`，再配置 `ATHLETE_WEIXIN_ALLOWED_USER_IDS`。
- 微信私聊支持 `/stop`，会维护 `context_token`，并接住 image / video / file / voice 输入与回传。
- 微信当前是 private only，不支持 group 群聊。

## 开发指令

| 命令 | 含义 |
| --- | --- |
| `npm.cmd install` | 安装依赖 |
| `npm.cmd run build` | 构建 CLI 到 `dist/cli.js` |
| `npm.cmd run check` | 执行 `typecheck + build` |
| `npm.cmd test` | 执行完整测试 |
| `npm.cmd run test:build` | 单独构建测试产物 |
| `node dist\\cli.js` | 用构建产物启动 CLI |
| `node dist\\cli.js "帮我看看这个项目"` | 执行一次 one-shot 任务 |
| `node dist\\cli.js telegram serve` | 源码环境启动 Telegram 服务 |
| `node dist\\cli.js weixin login` | 源码环境执行微信扫码登录 |
| `node dist\\cli.js weixin serve` | 源码环境启动微信服务 |
| `node dist\\cli.js weixin logout` | 源码环境清理微信登录态 |

## 用户指令

| 命令 | 含义 |
| --- | --- |
| `npm install -g @jun133/athlete` | 全局安装 CLI |
| `athlete init` | 初始化当前项目的 `.athlete/` |
| `athlete` | 进入交互模式 |
| `athlete "帮我看看这个项目"` | 执行一次任务 |
| `athlete run "帮我看看这个项目"` | 显式执行一次任务 |
| `athlete resume [sessionId]` | 恢复最近一次或指定会话 |
| `athlete sessions -n 20` | 查看最近会话 |
| `athlete diff [path]` | 查看当前项目 Git diff |
| `athlete changes [changeId]` | 查看变更记录 |
| `athlete undo [changeId]` | 回滚最近一次或指定变更 |
| `athlete config show` | 查看当前配置 |
| `athlete config path` | 查看配置文件路径 |
| `athlete doctor` | 检查本地配置和 API 连通性 |
| `athlete telegram serve` | 启动 Telegram 私聊服务 |
| `athlete weixin login` | 微信扫码登录并保存登录态 |
| `athlete weixin serve` | 启动微信私聊服务 |
| `athlete weixin logout` | 清理微信登录态 |

## CI / 验证指令

| 命令 | 含义 |
| --- | --- |
| `npm.cmd run check` | CI 最基础检查 |
| `npm.cmd test` | 完整 CI 主入口 |
| `npm.cmd run test:build` | 只编译测试 |
| `node --test .test-build/tests/**/*.test.js` | 直接运行编译后的测试 |
| `npm.cmd run verify:skills-api` | 校验 skills API |
| `npm.cmd run verify:runtime-context-api` | 校验 runtime context API |
| `npm.cmd run verify:runtime-checkpoint-api` | 校验 runtime checkpoint API |
| `npm.cmd run verify:runtime-observability-api` | 校验 runtime observability API |
| `npm.cmd run verify:mineru-documents-api` | 校验 MinerU 文档链路 |

## 发布指令

| 命令 | 含义 |
| --- | --- |
| `npm login` | 登录 NPM |
| `npm whoami` | 确认当前发布账号 |
| `npm.cmd run check` | 发布前检查 |
| `npm version patch` | 发布补丁版本 |
| `npm version minor` | 发布次版本 |
| `npm version major` | 发布主版本 |
| `npm publish` | 发布到 NPM |
