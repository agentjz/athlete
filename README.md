# Athlete

<p align="center">
  <strong>一个面向复杂任务的开源 AI Agent 框架</strong>
</p>

<p align="center">
  <img alt="terminal first" src="https://img.shields.io/badge/terminal-first-2ea44f?style=for-the-badge">
  <img alt="durable runtime" src="https://img.shields.io/badge/durable-runtime-1f6feb?style=for-the-badge">
  <img alt="checkpoint persisted" src="https://img.shields.io/badge/checkpoint-persisted-8250df?style=for-the-badge">
  <img alt="runtime stats" src="https://img.shields.io/badge/runtime-stats-f59e0b?style=for-the-badge">
</p>

<p align="center">
  <em>它不是只会回答问题，而是会把任务接住、推进、恢复、续跑，并把过程留下来。</em>
</p>

---

Athlete 是一个开源 AI Agent 框架。

它不是把模型放进一个命令行窗口里陪你聊几句。
它更像是在认真处理另一件事：当任务真的变长、变复杂、会失败、会中断、会产生很多状态时，系统还能不能继续把事情往前做。

所以它关心的，从来不是一轮回答漂不漂亮，而是这条链路能不能站得住。

它盯住的是这些更现实的问题：

- 长任务能不能继续推进
- 中断之后能不能恢复现场
- 大结果会不会把上下文拖死
- 多步执行后状态还能不能保持清楚
- 做过的事情能不能留下可验证、可追踪的痕迹

## 它在做什么

Athlete 现在已经不是一个简单的聊天壳。

它更接近一个正在成型的 agent runtime：

- 有统一的 agent loop
- 有持久化 session
- 有 checkpoint
- 有 runtimeStats
- 有任务板和协作边界
- 有后台任务
- 有 worktree 隔离
- 有面向长任务的上下文压缩和恢复能力

这些东西放在一起，决定的不是“它像不像 AI”，而是“它到底能不能把任务做完”。

## 它的取向

Athlete 这个名字本身就说明了很多事情。

它看重的不是一次爆发，而是耐力。
不是首轮表现，而是恢复能力。
不是把一切塞进 prompt，而是把状态认真落下来。
不是停留在对话层，而是把真实执行链路接起来。

如果把这条取向压成一句话，大概就是：

> **先活下来，再跑得稳，再慢慢跑远。**

## 它为什么会长成这样

因为现实里的任务不是一口气就能做完的。

模型会失败，工具会超时，网页会变，输出会很大，任务会被打断，状态会分散在不同阶段里。
真正麻烦的部分，往往不是“开始”，而是“中间出了问题以后，还能不能继续”。

Athlete 的很多设计，都是围着这些地方长出来的：

- 上下文压缩，是为了让任务跑得更久
- checkpoint，是为了让任务断了还能接上
- runtimeStats，是为了看清楚一次任务到底怎么跑的
- externalized tool results，是为了不让大结果把会话拖垮
- recovery / retry，是为了在失败之后还能继续向前

它不试图假装这些问题不存在。
它更像是在承认它们一定会出现，然后把机器层一层一层补出来。

## 适合什么人

- 想在终端里分析代码、改文件、跑命令、完成多步任务的人
- 想研究 AI agent runtime、状态机、工具链和多 agent 协作的人
- 想维护一个真实系统，而不满足于一次性 demo 的维护者

## 适合做什么

- 代码阅读与项目分析
- 多步修改与验证
- 长时间任务拆解与执行
- 多 agent 协作实验
- 终端 AI agent 架构研究

## 项目的气质

Athlete 还在继续长，但方向很清楚。

它不急着把自己包装成一个什么都能做的平台，
也不靠一堆花哨概念证明自己先进。

它更像是在持续打磨一个底盘：

- 让系统先活下来
- 让任务可以继续推进
- 让状态不要轻易丢
- 让失败之后还能回来
- 让复杂任务在长链路里依然可控

所以你会在这个项目里反复看到这些词：

- session
- checkpoint
- recovery
- verification
- runtimeStats
- team state
- worktree

这些不是装饰性的术语。
它们共同指向的是同一件事：

> **任务交到系统手里以后，它能不能真的一路做下去。**

---

## 安装

### 方式一：NPM 全局安装

```powershell
npm install -g @jun133/athlete
athlete init
athlete
```

### 方式二：Git Clone / 源码安装

```powershell
git clone <your-repo-url>
cd athlete
npm install
npm run build
npm link
athlete init
athlete
```

### `.env` 最小示例

`athlete init` 会生成 `.athlete/.env` 和 `.athlete/.athleteignore`。`.env` 可直接改成这样：

```text
ATHLETE_API_KEY=replace-with-your-key
ATHLETE_BASE_URL=https://api.deepseek.com
ATHLETE_MODEL=deepseek-reasoner
```

也可以把 `ATHLETE_BASE_URL` / `ATHLETE_MODEL` 指到其他 OpenAI 兼容提供方。

### 全局运行

```powershell
athlete
athlete "帮我看看这个项目是做什么的"
```

如果你的 PowerShell 对执行有拦截，可以用：

```powershell
athlete.cmd
```

### 卸载

```powershell
npm uninstall -g @jun133/athlete
```

如果你是源码 `npm link` 安装的：

```powershell
npm unlink -g @jun133/athlete
```

## 模式

- `agent`：默认模式；允许编辑文件、补丁修改、回滚、运行 shell；仍受允许目录约束
- `read-only`：只做读取、分析、总结，不做改文件、回滚、shell 执行

### 临时切换模式

```powershell
athlete --mode read-only
athlete --mode agent
athlete --mode agent "帮我修这个 bug"
```

### 持久切换模式

```powershell
athlete config set mode read-only
athlete config set mode agent
athlete config get mode
athlete config show
```

## 命令速查

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `athlete` | 进入交互模式 |
| `athlete "<prompt>"` | 新建会话，执行一次 |
| `athlete run "<prompt>"` | 显式执行单次任务 |
| `athlete resume [sessionId]` | 继续最近一次或指定会话 |
| `athlete sessions [-n 20]` | 查看最近会话 |
| `athlete init` | 在当前项目生成 `.athlete/.env` 和 `.athlete/.athleteignore` |
| `athlete changes [changeId] [-n 20]` | 查看变更记录或单条变更 |
| `athlete undo [changeId]` | 回滚最近一次或指定变更 |
| `athlete diff [path]` | 查看当前项目的 Git diff |
| `athlete doctor` | 检查本地环境和 API 连接 |

### 配置命令

| 命令 | 说明 |
| --- | --- |
| `athlete config show` | 查看当前配置和 API Key 状态 |
| `athlete config path` | 显示配置文件路径 |
| `athlete config get <key>` | 读取配置项 |
| `athlete config set <key> <value>` | 设置配置项 |

### 全局参数

| 参数 | 说明 |
| --- | --- |
| `-m, --model <model>` | 临时覆盖模型 |
| `--mode <read-only\|agent>` | 临时切换模式 |
| `-C, --cwd <path>` | 指定本次运行的工作目录 |

### 内部命令

下面两个命令是 CLI 内部工作进程使用的，普通用户一般不用手动调用：

- `athlete __worker__ background --job-id <id>`
- `athlete __worker__ teammate --name <name> --role <role> --prompt <prompt>`

## 常见用法

### 先分析，再决定要不要改

```powershell
athlete --mode read-only "先分析这个项目结构，再告诉我该怎么改"
athlete --mode agent
```

### 查看和回滚改动

```powershell
athlete diff
athlete changes
athlete undo
```

### 继续会话

```powershell
athlete sessions
athlete resume
athlete resume <sessionId>
```

## Telegram 私聊远程控制

Athlete 现在支持把 Telegram 私聊当成正式远程控制通道来用。

你可以在手机上给 bot 发文字任务，也可以直接把文件发给 bot，再让 Athlete 分析、修改、生成文件并把文件原样发回 Telegram。

### 1. 在手机里创建 Telegram bot

1. 打开 Telegram，搜索 `@BotFather`
2. 给 `@BotFather` 发送 `/start`
3. 发送 `/newbot`
4. 按提示设置 bot 的显示名
5. 再按提示设置 bot 的用户名
   用户名必须以 `bot` 结尾，例如 `athlete_remote_bot`
6. 创建完成后，`@BotFather` 会给你一个 bot token
   它通常长得像：`123456789:AA...`
7. 把这个 token 保存好，下一步要写进 `.athlete/.env`

### 2. 获取你自己的 Telegram 数字 user id

Athlete 的 Telegram 私聊接入默认只允许白名单用户控制，所以你还需要自己的数字 user id。

最简单的方法：

1. 在 Telegram 里搜索 `@userinfobot`
2. 给它发送 `/start`
3. 它会回复你的账号信息
4. 复制里面的数字 `Id`

注意：

- 这里要填的是数字 id，不是 `@username`
- 如果你想让多个人都能控制同一个 bot，可以把多个数字 id 用逗号写进白名单

### 3. 配置 `.athlete/.env`

如果当前项目里还没有 `.athlete/.env`，先运行：

```powershell
athlete init
```

然后打开当前项目里的 `.athlete/.env`，至少填这几项：

```text
ATHLETE_API_KEY=replace-with-your-key
ATHLETE_BASE_URL=https://api.deepseek.com
ATHLETE_MODEL=deepseek-reasoner

ATHLETE_TELEGRAM_TOKEN=replace-with-your-bot-token
ATHLETE_TELEGRAM_ALLOWED_USER_IDS=123456789
ATHLETE_TELEGRAM_PROXY_URL=http://127.0.0.1:7897
```

如果你要放多个 Telegram 用户白名单，可以这样写：

```text
ATHLETE_TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
```

说明：

- `ATHLETE_TELEGRAM_TOKEN` 是你从 `@BotFather` 拿到的 token
- `ATHLETE_TELEGRAM_ALLOWED_USER_IDS` 是允许控制这个 bot 的数字 user id 白名单
- `ATHLETE_TELEGRAM_PROXY_URL` 是 Telegram 专用代理入口。像 Clash Verge 这种本地代理软件，通常会提供一个固定的本地代理地址，例如 `http://127.0.0.1:7897`
- `.athlete/.env.example` 里有同样的配置模板，可以直接对照填写

### 4. 什么是代理、本地入口、本地代理入口

如果你是第一次接触这块，可以把它理解成下面这件事：

- `代理`：不是让 Athlete 自己直接上外网，而是先把网络请求交给另一个程序转发
- `本地入口`：这个转发程序在你自己电脑上开的一个访问地址
- `本地代理入口`：就是“你电脑上的代理程序，专门给别的程序接入时用的地址”

拿你现在常见的 Clash Verge 来说：

- Clash 是代理程序
- 它跑在你自己的电脑上
- 它会打开一个本地端口
- 例如 `127.0.0.1:7897`

这时候：

- `127.0.0.1` 的意思是“你自己的这台电脑”
- `7897` 是 Clash 开出来的端口
- `http://127.0.0.1:7897` 就是本地代理入口

所以当 Athlete 访问 Telegram 时，正确做法不是去关心 Telegram 被 Clash 解析成了什么 fake-ip，而是：

1. Athlete 只需要知道 Clash 的本地代理入口
2. Athlete 把 Telegram 请求交给这个本地代理入口
3. Clash 再帮 Athlete 转发到真正的 Telegram

如果你在用 Clash Verge，并且配置里看到类似下面这些值：

```yaml
mixed-port: 7897
socks-port: 7898
port: 7899
```

那最常用、最省事的通常就是：

```text
ATHLETE_TELEGRAM_PROXY_URL=http://127.0.0.1:7897
```

### 5. 启动 Telegram 服务

在项目根目录运行：

```powershell
athlete telegram serve
```

如果你的 PowerShell 对命令执行有拦截，也可以用：

```powershell
athlete.cmd telegram serve
```

服务启动后：

- bot 服务会持续在线
- Athlete 会使用 long polling 拉取 Telegram 私聊消息
- 同一个 Telegram 私聊会绑定到同一个 Athlete session
- 重启服务后会恢复 offset、session 映射和待发送队列
- Telegram 服务现在是单实例保护
  如果已经有一个 `telegram serve` 在运行，第二个实例会直接拒绝启动，避免双开导致重复回复

### 6. Telegram 私聊里怎么用

先在 Telegram 里打开你刚创建的 bot，发送 `/start`，然后就可以直接发任务。

常见用法：

- 直接发文字任务
  例如：`帮我看看这个仓库的 README 需要补什么`
- 直接发文件
  例如把 `需求.md`、`report.docx`、`screenshot.png` 发给 bot
- 文件发完再跟一句任务
  例如：`分析我刚发的文件，给我一个总结`
- 让 Athlete 找到某个本地文件并发回 Telegram
  例如：`找到 README.md，然后把文件发回给我`
- 让 Athlete 生成文件并发回 Telegram
  例如：`生成一份 markdown 报告并把文件发回给我`

### 7. `/stop` 的语义

Telegram 端只保留一个停止命令：

```text
/stop
```

它的语义是：

- 只停止“当前这个 Telegram 用户当前正在执行的任务”
- bot 服务本身不会退出
- 不会把整个 Telegram 服务停掉
- 不会影响别的白名单用户
- 当前任务停止后，你还可以继续发下一条任务

注意：

- Telegram 端不会把本地终端里的 `quit` / `reset` 当成正式命令暴露
- 这两个仍然只属于 CLI / 本地终端能力

### 8. Telegram 文件发送和接收怎么工作

入站文件：

- 你把文件发到 Telegram 私聊
- Athlete 会把文件下载到项目状态目录下的 Telegram 文件目录
- 文件元数据会写入 Telegram 状态存储
- 当前 turn 会自动拿到这份文件的本地路径和上下文说明
- 之后你可以继续说“分析我刚发的文件”“继续处理刚才那个文件”

出站文件：

- Athlete 可以在项目里找到文件
- 也可以先生成新文件
- 然后通过 Telegram 正式文件投递把文件作为 document 发回去
- 不是只回一个本地路径，也不是只发文本链接

恢复与重试：

- 文本和文件都会先进入 Telegram delivery queue
- 发送失败会自动重试
- 服务重启后，未送达的文本和文件会继续恢复发送

### 9. 终端日志怎么看

当 `athlete telegram serve` 正在运行时，终端会持续输出高层日志。

你会看到这类信息：

- 收到了哪个 Telegram 用户的消息
- 当前进入了哪个 session
- 当前在做哪个阶段
- 当前调用了哪个工具
- 当前任务是成功、失败还是被停止
- 当前是否发送了文本或文件

这些日志是给人看的高层过程日志，不会把整段工具输出正文直接刷满终端。

### 10. Telegram 里的过程提示怎么看

Telegram 端不只是一直显示 typing。

在长任务里，你会看到和终端高层过程一致的聊天式阶段消息：

- 开始调用工具时，会单独发一条工具名
- 如果执行了 `todo_write`，会把当前 todo 列表单独发出来
- 最终答案会单独发一条
- 工具具体读到了什么正文、工具输出的大段原文，不会直接发到 Telegram

这些消息是按实际运行顺序发送的，不做机械固定轮换，也不额外加抬头。

### 11. 常见问题排查

`bot 没反应`

- 先确认你已经在 Telegram 里给 bot 发过 `/start`
- 再确认 `ATHLETE_TELEGRAM_TOKEN` 是否正确
- 再确认 `ATHLETE_TELEGRAM_ALLOWED_USER_IDS` 里填的是数字 id，不是用户名

`提示没有权限`

- 当前 Telegram 账号的数字 user id 不在白名单里
- 把正确的数字 id 加进 `.athlete/.env` 后，重启 `athlete telegram serve`

`服务重启后好像断了`

- 先看终端日志里是否恢复了 Telegram state 目录
- 再看网络恢复后，delivery queue 里的待发送消息/文件是否继续补发

`我发了文件，但它没理解`

- 最稳妥的方式是发完文件后再补一句明确任务
- 例如：`分析我刚发的文件并给我一个结论`

`我想停当前任务但不想停服务`

- 直接发 `/stop`
- 不要在 Telegram 里用本地终端语义的退出/重置命令

`文件太大发不出去或下不下来`

- 这是 Telegram 文件通道本身的边界
- 先缩小文件、压缩文件，或者只让 Athlete 生成更小的结果文件再发送

`为什么我关掉一个窗口后，它看起来还在继续回复`

- 最常见原因不是 Telegram 主逻辑自己跑飞，而是你当时其实开了两个 `telegram serve`
- 现在新版本会做单实例保护，避免双开
- 如果你是直接叉掉窗口，正常实例会退出；如果之前留下了陈旧 `service.pid`，下次启动时会自动识别并覆盖掉已经失效的旧 pid

如果你已经完成以上步骤，最小可用流程就是：

1. 在手机里创建 bot
2. 拿到 token 和自己的数字 user id
3. 配好 `.athlete/.env`
4. 在项目根目录启动 `athlete telegram serve`
5. 去 Telegram 私聊 bot，直接发文字或文件任务
6. 需要停止时发 `/stop`

## 轻装上下文运行时

- system prompt 现在按 `Static operating layer` 和 `Dynamic runtime layer` 组装，运行态信息不再混进同一块静态前缀
- 超过阈值的大 tool result 会外置到项目 state root 下的 `.athlete/tool-results/<sessionId>/...`
- session message 不再保存超大正文，而是保存带 `externalized: true`、`storagePath`、`summary`、`preview` 的轻量引用
- continuation / resume / context compression / recovery shrink 都继续沿用这份轻量引用，而不是把超大输出重新塞回主会话
- session 现在持久化结构化 `checkpoint`，统一记录：当前目标、已完成关键步骤、当前步骤、下一步、最近一批关键工具动作、当前 phase（`active / continuation / resume / recovery`）以及应优先复用的 artifact / preview / pendingPaths
- yield 后的 continuation 不再只靠一句通用恢复词，而是从同一份 session checkpoint 生成恢复输入
- 从磁盘 reload 后继续执行时，会显式复用 checkpoint；像 `continue` / `resume` 这类恢复指令不会把旧目标误判成一个全新 objective
- 当 objective 明确变化时，旧 checkpoint 会重置，避免把上一轮任务进度错误带进新任务
- 如果模型主动读取 `.athlete/tool-results/...`，`read_file` 默认返回紧凑的 artifact 视图，而不是再把整份大结果膨胀回会话里
- 已经通过流式输出发出的 assistant 正文不会在 turn 结束时再被完整重放一遍

## Runtime 仪表盘

- session 现在会持久化结构化 `runtimeStats`
- reload session 之后，这份 runtime stats 不会丢
- 当前最小查看入口：
  - 交互态输入 `/runtime`
  - 或 `/stats`
  - 或 `/仪表盘`
- summary 当前至少显示：
  - model requests
  - model wait total
  - tool calls
  - tool duration total
  - yields / continuations / recoveries / compressions
  - externalized results count / bytes
  - top tool counts / durations
  - session health
- 如果 provider 返回 usage，就累计 token / usage
- 如果 provider 没返回 usage，summary 会明确显示 `Usage: unavailable`，不会自行猜 token

### runtimeStats 结构

`SessionRecord.runtimeStats` 当前包含这些主字段：

- `model.requestCount`
- `model.waitDurationMsTotal`
- `model.usage.requestsWithUsage`
- `model.usage.requestsWithoutUsage`
- `model.usage.inputTokensTotal`
- `model.usage.outputTokensTotal`
- `model.usage.totalTokensTotal`
- `tools.callCount`
- `tools.durationMsTotal`
- `tools.byName`
- `events.yieldCount`
- `events.continuationCount`
- `events.recoveryCount`
- `events.compressionCount`
- `externalizedToolResults.count`
- `externalizedToolResults.byteLengthTotal`

### 指标来源与限制

- model request 指标来自真实 provider request attempt，不是逻辑轮次估算
- tool 指标来自正式 tool execution 路径，不是临时 console log
- compression 指标来自 `buildRequestContext(...).compressed === true` 的正式请求路径
- externalized result 指标只在 tool result 实际 externalize 后累计
- token / usage 只记录 provider 明确返回的值；未返回时不估算

### 相关验证命令

```powershell
npm run test:build
npm run test:core
npm run verify:runtime-context-api
npm run verify:runtime-checkpoint-api
npm run verify:runtime-observability-api
```

## 文件能力

- 文本文件：读取、搜索、修改、补丁式改写
- MinerU 文档读取：支持 `mineru_pdf_read` / `mineru_image_read` / `mineru_doc_read` / `mineru_ppt_read`
- MinerU workflow skills：支持 `mineru-pdf-reading` / `mineru-image-reading` / `mineru-doc-reading` / `mineru-ppt-reading`
- Word：保留 `read_docx` / `write_docx` / `edit_docx`，其中 `.docx` 读取默认走 `mineru_doc_read`，`read_docx` 是明确降级路径
- 表格：支持 `xlsx/xls/csv/tsv/ods`
- MinerU 限制：单文件上限 200 MB，单文件页数上限 600 页，超限直接拒绝且不做切分
- 项目规则：支持项目级 `AGENTS.md` / `SKILL.md`

## 发布到 NPM

```powershell
npm login
npm whoami
npm run check
npm version patch
npm publish
```

较大更新可以改用：

```powershell
npm version minor
npm publish
```

## spec

当前唯一的规范与维护文档源在 `spec/`：

- `spec/README.md`
- `spec/principles/README.md`
- `spec/architecture/`
- `spec/modules/`
- `spec/interfaces/`
- `spec/implementation/`
- `spec/testing/`

根目录 `validation/` 仅保留验证产物，不再承担规范文档职责。
