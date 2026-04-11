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

一个单纯的 LLM，往往擅长回答问题；一个加上 harness 的 LLM，才开始真正接住任务。它不只是“说下一句”，而是能在复杂任务里持续往前跑，知道什么时候该读文件、什么时候该调用工具、什么时候该拆任务、什么时候该把状态记下来，出了错以后还能接着做。

Athlete 想做的，就是这层把模型变成“可执行系统”的底盘。它不只是在终端里包一层聊天壳，而是把状态、工具、恢复、协作和通道接成一条完整链路，让任务可以推进、暂停、恢复、续跑，并把过程留下来。

## 功能清单

### Harness 机制

#### 先讲原则

白话一点说，`LLM` 更像一个会思考、会表达的大脑，但它天然不擅长长期把一件复杂的事做完。上下文会满，任务会中断，结果会散，工具会失败，执行会卡住。`LLM + harness` 的意义，就是给这个大脑补上手脚、记忆、流程和恢复力，让它不只是会答，而是会把任务从头接住，一步一步推进到可交付的结果。

Athlete 想坚持的，不是“让模型显得更聪明”，而是让任务真的能跑完。所以它会先守住几个原则：

1. 先列计划，再动手。复杂任务不能一上来就乱写，必须先形成 `todo list` 和执行顺序。
2. session 不是聊天记录，而是任务现场。做到了哪一步、卡在哪一步、下一步做什么，不能只留在模型脑子里。
3. 能拆就拆，能并行就并行。大任务要拆成子任务，慢操作放后台，必要时交给队友并行推进。
4. 每做一步都要能接回来。工具调用完、文件改完、任务推进完，都要重新回到主循环继续判断下一步。
5. 最后必须验证和交付。不是“解释清楚了”就算完成，而是要把结果真的做出来、跑起来、验一遍。

#### 一个完整例子

比如用户只说一句话：

> “帮我做一个展示《Helldivers 2》最新新闻的东西。”

对普通 LLM 来说，它很可能会马上给你一段页面草图、一个伪代码方案，或者一份“你可以这样做”的建议。但对一个带 harness 的系统来说，这句话会被当成一个真实任务，而不只是一个聊天话题。

它接到这句话以后，更像是这样推进：

1. 先列一个 `todo list`。
   不是马上开写，而是先把任务拆出来，比如：确认新闻来源、浏览最近新闻、定义数据结构、写抓取脚本、写前后端展示、跑验证、整理最终交付。
2. 先去浏览器里看新闻到底长什么样。
   它会真的打开网页，看《Helldivers 2》的新闻页面、更新时间、标题结构、链接结构、图片结构，判断应该抓哪些字段，而不是闭着眼凭空假设。
3. 再决定数据获取方式。
   如果页面结构稳定，就写一个小爬虫；如果已有接口或更稳的来源，就改成调用接口。这里不是先选技术，而是先根据真实页面决定方案。
4. 然后开始写代码。
   先写抓取新闻的脚本或服务，再写前端页面把新闻列表展示出来，必要时再补一个简单后端，或者接进现有项目结构里。
5. 写完以后不会立刻自称“完成了”。
   它会继续跑 `build`、开页面、检查新闻有没有真的展示出来、链接能不能点、时间是不是正确、抓取是不是失败、页面有没有报错。
6. 如果中途有一步很慢，或者任务太大。
   它不会整条链路卡死在那里，而是把慢操作丢到 `background`，或者把某一部分拆给别的 teammate 去做，比如一个队友写抓取，一个队友做前端。
7. 如果中途断了。
   比如浏览器挂了、命令超时了、上下文满了、你关掉终端了，它也不是从零再来，而是会从 checkpoint 和 session 里找回现场，知道“新闻抓取已经写完了，现在还差页面展示和验证”。
8. 最后交付的不应该是一段解释。
   它应该交付的是一个真的能展示最新《Helldivers 2》新闻的结果，外加清楚的验证结果和改动记录。

这就是 harness 和普通对话式 LLM 的差别。普通 LLM 更像是在讨论“这件事怎么做”；带 harness 的系统，是在真的把这件事往下做。

#### 技术上怎么做到

技术上看，Athlete 不是“写了一个更长的 prompt”，而是把模型放进了一套可持续执行的 runtime 里。

- 主体仍然是一个清晰的 agent loop：看上下文，决定下一步，调用工具，把结果接回循环。
- `tools` 负责动作，`skills` 负责 workflow，`MCP` 负责接外部能力；所有能力统一走 tool registry，不让能力从旁路长出来。
- 文档相关 workflow skills 当前包括 `mineru-pdf-reading`、`mineru-image-reading`、`mineru-doc-reading`、`mineru-ppt-reading`，分别路由到 `mineru_pdf_read`、`mineru_image_read`、`mineru_doc_read`、`mineru_ppt_read`。
- `session` 被当成任务现场，而不是普通聊天记录；所以任务状态、todo、验证状态、恢复线索都能落在同一个真相源里。
- 长任务靠 `checkpoint`、上下文压缩和 continuation 续跑；上下文满了不是直接死掉，而是压缩后继续往前。
- 大目标可以写进任务板，复杂任务可以拆给 `teammate`，并且用 `worktree` 做目录隔离，避免多人并行时互相踩文件。
- 慢操作不堵住主循环，直接进 `background`；主循环可以一边等，一边继续处理下一步。
- 最后还有 `runtimeStats`、变更记录和验证链路，帮助系统知道自己到底做到了哪里、改了什么、验过没有。

所以 Athlete 想解决的，从来不只是“这一轮回答漂不漂亮”，而是另一件更难的事：当任务真的变长、变复杂、会失败、会中断的时候，系统还能不能继续把事情做下去。

### 已实现能力

| 能力 | 接口 / 实现 | 状态 |
| --- | --- | --- |
| 浏览器自动化 | Playwright MCP `@playwright/mcp` | ✅ |
| PDF 读取 | MinerU `mineru_pdf_read` | ✅ |
| 图片读取 | MinerU `mineru_image_read` | ✅ |
| Word 读取 | MinerU `mineru_doc_read`，`.docx` 可回退到 `read_docx` | ✅ |
| Word 写入 / 编辑 | `write_docx` / `edit_docx` | ✅ |
| PPT / PPTX 读取 | MinerU `mineru_ppt_read` | ✅ |
| 表格读取 | `read_spreadsheet`，支持 `xlsx` / `xls` / `csv` / `tsv` / `ods` | ✅ |
| 远程文件获取 | `download_url`，把公开 URL 落到本地再进入文档/文件链 | ✅ |
| HTTP 探针 | `http_probe`，验证本地或远程页面 / API 是否真的可达 | ✅ |
| 本地文件读写 / 补丁 | 内建 tools：`read_file` / `write_file` / `edit_file` / `apply_patch` / `search_files` | ✅ |
| Shell 与后台任务 | `run_shell` / `background_run` / `background_check` | ✅ |
| 任务板与协作队友 | `task` / `spawn_teammate` / `read_inbox` / `send_message` | ✅ |
| 隔离工作区 | Git worktree：`worktree_*` | ✅ |
| Telegram 私聊接入 | Telegram Bot API：`telegram serve` | ✅ |
| Weixin 私聊接入 | OpenILink：`weixin login` / `weixin serve` / `weixin logout` | ✅ |

## 指令集

### 开发指令

| 命令 | 含义 |
| --- | --- |
| `npm.cmd install` | 安装依赖 |
| `npm.cmd run build` | 构建 CLI 到 `dist/cli.js` |
| `npm.cmd run check` | 执行 `typecheck + build` |
| `npm.cmd test` | 执行完整测试入口 |
| `node dist\cli.js` | 直接用构建产物启动交互 CLI |
| `node dist\cli.js "帮我看看这个项目"` | 源码环境下执行一次任务 |
| `node dist\cli.js telegram serve` | 源码环境启动 Telegram 私聊服务 |
| `node dist\cli.js weixin login` | 源码环境执行 Weixin 扫码登录 |
| `node dist\cli.js weixin serve` | 源码环境启动 Weixin 私聊服务 |

### 用户指令

全局安装后直接使用 `athlete`；源码联调时，把 `athlete` 换成 `node dist\cli.js` 即可。

| 命令 | 含义 |
| --- | --- |
| `npm install -g @jun133/athlete` | 全局安装 CLI |
| `athlete init` | 在当前项目生成 `.athlete/.env`、`.athlete/.env.example`、`.athlete/.athleteignore` |
| `athlete` | 进入交互模式 |
| `athlete "帮我看看这个项目"` | 单次执行一个任务 |
| `athlete run "帮我看看这个项目"` | 显式执行一次单次任务 |
| `athlete resume [sessionId]` | 继续最近一次或指定会话 |
| `athlete sessions -n 20` | 查看最近会话 |
| `athlete diff [path]` | 查看当前项目 Git diff |
| `athlete changes [changeId]` | 查看变更记录 |
| `athlete undo [changeId]` | 回滚最近一次或指定变更 |
| `athlete config show` | 查看当前配置 |
| `athlete doctor` | 检查本地配置和 API 连通性 |
| `athlete telegram serve` | 启动 Telegram 私聊服务 |
| `athlete weixin login` | Weixin 扫码登录并保存登录态 |
| `athlete weixin serve` | 启动 Weixin 私聊服务 |
| `athlete weixin logout` | 清理 Weixin 登录态 |

文档读取能力依赖 `MINERU_API_TOKEN`。Telegram 需要 `ATHLETE_TELEGRAM_TOKEN` 和 `ATHLETE_TELEGRAM_ALLOWED_USER_IDS`。Weixin 需要先执行 `athlete weixin login`，再配置 `ATHLETE_WEIXIN_ALLOWED_USER_IDS`。Telegram 和 Weixin 私聊里都支持 `/stop`，用于停止当前任务但不关闭服务。

Weixin 当前只支持 private 私聊，不支持 group 群聊；服务会维护每个会话的 `context_token`，并接住 image、video、file、voice 等私聊附件输入与回传链路。

## CLI 产品行为

Athlete 当前把 CLI 分成三条启动链，而不是所有命令都先把完整 runtime 拉起来：

- fast path：`athlete --version`、`athlete version`、`athlete --help`、`athlete help`、`athlete config path`
- lightweight path：`athlete init`、`athlete config show|get|set|path`、`athlete sessions`、`athlete changes`、`athlete undo`、`athlete diff`、`athlete doctor`
- full runtime path：`athlete`、`athlete run ...`、`athlete resume ...`、`athlete telegram serve`、`athlete weixin serve`、`athlete __worker__ ...`

fast path 和 lightweight path 都不会启动 agent turn，也不会因为缺 API key 就把 `--help`、`--version`、`config path` 这类轻命令打坏。

### 配置版本

全局配置文件是用户配置目录下的 `config.json`，当前要求带 `schemaVersion`。

- 缺文件：按默认配置启动
- 旧版无版本字段配置：允许一次性升级到当前 schema，再写回正式版本
- JSON 损坏或显式旧/新版本不匹配：直接报错并告诉用户配置文件路径与修复动作，不做长期脏兼容

项目级 `.athlete/.env` 继续是 repo 本地 provider / channel / MinerU 配置入口，但不会替代全局 `config.json` 的 schema 管理。

### 错误与透明度

CLI 出错时会优先告诉用户这些信息：

- 这是用户可修复错误、环境 / 网络问题，还是内部错误
- 当前受影响的命令与配置文件路径
- 下一步应该改什么，而不是只吐 SDK 或底层异常

`/runtime` 和 one-shot closeout 当前至少会稳定给出：

- 当前是否在等待模型、工具、恢复还是验证
- 最近一次 runtime transition 是什么
- request / tool / recovery / wait / verification 的真实状态
- 哪个环节最慢、最近做了什么、还有什么没收口

### Windows 使用提示

- 源码环境优先用 `npm.cmd` 和 `node dist\\cli.js`
- CLI 文本输出固定走 UTF-8 写入，不依赖系统默认代码页碰运气
- `athlete config path` 可以在配置损坏时直接拿到修复入口

### NPM 发布

| 命令 | 含义 |
| --- | --- |
| `npm login` | 登录 NPM |
| `npm whoami` | 确认当前发布账号 |
| `npm.cmd run check` | 发布前检查 |
| `npm version patch` | 发布补丁版本 |
| `npm version minor` | 发布次版本 |
| `npm version major` | 发布主版本 |
| `npm publish` | 发布到 NPM |
